"""Trip → PDF export (2026-05-18 feature).

POST /api/trips/<trip_id>/pdf

Builds a printable plan PDF for a trip the caller can edit-view
(owner or accepted member). Body is an OPTIONS object — every
section is opt-out via a boolean flag so a long trip can be
slimmed to "cover + days" without dragging the to-do + budget
sections along. Defaults are "include everything" so a one-click
"download" with no toggle still produces a full document.

## Why reportlab + platypus

platypus is reportlab's flowables framework — content streams as
a list of paragraph / table / image / page-break objects, and the
engine handles pagination, soft breaks, and repeat-on-overflow
headers automatically. That's the answer to the "doesn't deform
with different sized trips" brief: 3-day trips and 30-day trips
flow through the same code path; the only difference is how many
days get rendered.

## Maps

The cover map is a Google Static Maps API call (the API key is in
`window.googleMapsApiKey` client-side; the same value is in env as
`GOOGLE_MAPS_API_KEY`). Static Maps API returns a PNG we embed
directly via reportlab's Image flowable. If the API key is missing
or the request fails, the cover renders without a map — the rest
of the PDF still ships.

If the `includeDayPins` option is True, each day with a known
lat/lng (either the day's anchor or its slot items) gets a small
inline map alongside its block.

## Branding

The Great Getaway uses a blue→purple gradient title, navy body
text, glass-card aesthetic. PDFs can't do CSS gradients, but
they can do:
  - A blue→purple horizontal rule under each section header
  - Navy headings + dark-grey body text
  - The brand emoji (✦, 🧳, 📍) sprinkled where it makes sense
  - A subtle footer line with the trip name + page number

The output is intentionally print-oriented — high contrast, no
glass effects, larger leading than the web UI.
"""

from __future__ import annotations

import io
import json
import os
from datetime import datetime
from typing import Any

import requests
from flask import Blueprint, jsonify, request, send_file

from auth import current_user_id, require_auth
from database import get_db
from extensions import limiter
from helpers import trip_member_role


# ── reportlab imports — kept local so the import cost only lands on
# the (rare) PDF-export request, not on every Flask boot.

def _rl():
    """Lazily import every reportlab symbol we need. Returns a
    namespace with everything attached so call sites stay readable."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        BaseDocTemplate,
        Frame,
        HRFlowable,
        Image,
        KeepTogether,
        PageBreak,
        PageTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
    )

    class _NS:
        pass

    ns = _NS()
    ns.colors = colors
    ns.A4 = A4
    ns.ParagraphStyle = ParagraphStyle
    ns.getSampleStyleSheet = getSampleStyleSheet
    ns.cm = cm
    ns.mm = mm
    ns.BaseDocTemplate = BaseDocTemplate
    ns.Frame = Frame
    ns.HRFlowable = HRFlowable
    ns.Image = Image
    ns.KeepTogether = KeepTogether
    ns.PageBreak = PageBreak
    ns.PageTemplate = PageTemplate
    ns.Paragraph = Paragraph
    ns.Spacer = Spacer
    ns.Table = Table
    ns.TableStyle = TableStyle
    return ns


# ── brand palette (kept close to the web --accent-* variables) ──
_BRAND_NAVY = "#001a33"
_BRAND_BLUE = "#0071e3"
_BRAND_PURPLE = "#9b59b6"
_BRAND_GREEN = "#34c759"
_TEXT_PRIMARY = "#1d1d1f"
_TEXT_SECONDARY = "#6b7280"
_RULE_GREY = "#e5e7eb"


bp = Blueprint("pdf", __name__)


def _can_read_trip(cursor, trip_id: str, user_id: str) -> bool:
    """True if the caller can read this trip for export. Owner +
    accepted members qualify. We don't restrict to editors — even
    a relaxer should be able to download their own copy of the plan."""
    return trip_member_role(cursor, trip_id, user_id) is not None


def _fetch_cover_map(lat: float | None, lng: float | None, place_id: str | None) -> bytes | None:
    """Return a Google Static Maps PNG for the trip's location, or
    None if we can't / shouldn't. Centers on lat/lng when known;
    falls back to place_id otherwise (Static Maps supports a
    `markers` param with place_id resolution via the Places API,
    but the simpler path is lat/lng — every trip in this app has
    coords by the time it's saved). Failure logs and returns
    None — the PDF still renders without the cover."""
    key = (
        os.getenv("GOOGLE_MAPS_SERVER_KEY")
        or os.getenv("GOOGLE_MAPS_API_KEY")
        or ""
    )
    if not key or lat is None or lng is None:
        return None
    try:
        params = {
            "center": f"{lat},{lng}",
            "zoom": "9",
            "size": "1200x600",
            "scale": "2",
            "maptype": "roadmap",
            "key": key,
        }
        res = requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
        )
        if not res.ok:
            return None
        return res.content
    except Exception:
        return None


def _fetch_overview_pins_map(
    pins: list[tuple[float, float, str]],
    center_lat: float | None = None,
    center_lng: float | None = None,
) -> bytes | None:
    """Wide overview map showing many pins at once — used for the
    "all your days on one map" hero image at the top of the Day-by-
    day section, and (when called with marked-place pins) for the
    Marked-places section's overview.

    `pins` is a list of (lat, lng, label) tuples where `label` is a
    single character (Google Static Maps marker labels accept one
    alphanumeric — A-Z or 0-9). Pass numeric day numbers for days,
    or letters/dots for places.

    Google auto-centers + zooms when `center` is omitted as long as
    we pass markers — the map fits all markers in the viewport. We
    still pass `center` when known so the framing matches the trip's
    main location even if a couple of day pins are outliers.

    Brand-coloured markers: brand-blue for the day list. Each marker
    gets a labeled circular icon by default. Returns the PNG bytes
    or None on missing key / network error / empty pin list."""
    if not pins:
        return None
    key = (
        os.getenv("GOOGLE_MAPS_SERVER_KEY")
        or os.getenv("GOOGLE_MAPS_API_KEY")
        or ""
    )
    if not key:
        return None
    try:
        params: list[tuple[str, str]] = [
            ("size", "1200x520"),
            ("scale", "2"),
            ("maptype", "roadmap"),
            ("key", key),
        ]
        if center_lat is not None and center_lng is not None:
            params.append(("center", f"{center_lat},{center_lng}"))
        for plat, plng, plabel in pins[:20]:  # URL size cap
            # label must be a single alphanumeric char; truncate
            safe_label = (str(plabel) or "")[:1].upper() if plabel else ""
            marker = f"color:0x0071e3|label:{safe_label}|{plat},{plng}" if safe_label \
                else f"color:0x0071e3|{plat},{plng}"
            params.append(("markers", marker))
        res = requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
        )
        if not res.ok:
            return None
        return res.content
    except Exception:
        return None


def _fetch_day_pin_map(
    lat: float | None,
    lng: float | None,
    extra_pins: list[tuple[float, float]] | None = None,
) -> bytes | None:
    """A smaller per-day map with the main anchor pin + optional
    extra pins for each verified slot item. Same fail-soft path as
    the cover map."""
    key = (
        os.getenv("GOOGLE_MAPS_SERVER_KEY")
        or os.getenv("GOOGLE_MAPS_API_KEY")
        or ""
    )
    if not key or lat is None or lng is None:
        return None
    markers = [f"color:0x0071e3|label:•|{lat},{lng}"]
    for plat, plng in (extra_pins or [])[:8]:  # cap the URL size
        markers.append(f"color:0x9b59b6|size:small|{plat},{plng}")
    try:
        params = [
            ("center", f"{lat},{lng}"),
            ("zoom", "12"),
            ("size", "800x320"),
            ("scale", "2"),
            ("maptype", "roadmap"),
            ("key", key),
        ]
        for m in markers:
            params.append(("markers", m))
        res = requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
        )
        if not res.ok:
            return None
        return res.content
    except Exception:
        return None


def _styles(rl):
    """Build the paragraph style sheet — magazine-grade hierarchy
    so the layout reads as STRUCTURED rather than "wall of text."

    Size pyramid (all in points; 1pt = 1/72 inch):
      48  hero title      — cover page only, fills the upper half
      14  hero subtitle   — country + dates under the hero
      11  hero kicker     — small caps "the great getaway · trip plan"

      36  section number  — the big "01" / "02" / "03" on opener pages
      22  section title   — the section name on opener pages
      11  section kicker  — small-caps tagline under the section title

      18  day title       — "Day 3 · Florence"
      9   day kicker      — small-caps date strip above the day title
      13  slot label      — "MORNING / AFTERNOON / EVENING" labels
      10.5 body           — the actual prose
      9.5 muted body      — secondary notes, tips, addresses
      24  stat value      — cover-page summary tile numbers
      8.5 stat label      — under-tile caption

    Leading is set to ~1.4x for body copy (readable line-spacing);
    titles use tighter ~1.1x leading so multi-line titles don't
    look floaty.
    """
    base = rl.getSampleStyleSheet()
    return {
        # ── Hero (cover page) ────────────────────────────────────
        "hero": rl.ParagraphStyle(
            "GGHero",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=48,
            leading=52,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=12,
        ),
        "heroSub": rl.ParagraphStyle(
            "GGHeroSub",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=14,
            leading=20,
            textColor=_TEXT_SECONDARY,
            spaceBefore=0,
            spaceAfter=4,
        ),
        "kicker": rl.ParagraphStyle(
            "GGKicker",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=_BRAND_BLUE,
            spaceBefore=0,
            spaceAfter=8,
            # Small-caps via letter-spacing — reportlab can't do
            # `text-transform: uppercase` directly so callers
            # uppercase the string themselves.
        ),

        # ── Section openers (page-1 of every chapter) ────────────
        "sectionNumber": rl.ParagraphStyle(
            "GGSectionNumber",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=36,
            leading=40,
            textColor=_BRAND_BLUE,
            spaceBefore=0,
            spaceAfter=2,
        ),
        "sectionTitle": rl.ParagraphStyle(
            "GGSectionTitle",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=28,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=6,
        ),
        "sectionKicker": rl.ParagraphStyle(
            "GGSectionKicker",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=16,
            textColor=_TEXT_SECONDARY,
            spaceBefore=0,
            spaceAfter=18,
        ),

        # ── Day cards ────────────────────────────────────────────
        "dayKicker": rl.ParagraphStyle(
            "GGDayKicker",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=_BRAND_BLUE,
            spaceBefore=0,
            spaceAfter=2,
        ),
        "dayTitle": rl.ParagraphStyle(
            "GGDayTitle",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=21,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=6,
        ),
        "slotLabel": rl.ParagraphStyle(
            "GGSlotLabel",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            leading=11,
            textColor=_BRAND_PURPLE,
            spaceBefore=6,
            spaceAfter=2,
        ),

        # ── Body copy ────────────────────────────────────────────
        "body": rl.ParagraphStyle(
            "GGBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=15,
            textColor=_TEXT_PRIMARY,
            spaceBefore=0,
            spaceAfter=4,
        ),
        "muted": rl.ParagraphStyle(
            "GGMuted",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=_TEXT_SECONDARY,
            spaceBefore=0,
            spaceAfter=2,
        ),
        "tip": rl.ParagraphStyle(
            "GGTip",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=9.5,
            leading=13,
            textColor=_BRAND_BLUE,
            spaceBefore=4,
            spaceAfter=2,
        ),

        # ── Cover stats tiles ────────────────────────────────────
        "stat": rl.ParagraphStyle(
            "GGStat",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=26,
            textColor=_BRAND_NAVY,
            alignment=1,
        ),
        "statLabel": rl.ParagraphStyle(
            "GGStatLabel",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=_BRAND_BLUE,
            alignment=1,
            spaceAfter=0,
        ),

        # ── TOC entries on the cover ─────────────────────────────
        "tocItem": rl.ParagraphStyle(
            "GGTocItem",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=14,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=0,
        ),
        "tocItemSub": rl.ParagraphStyle(
            "GGTocItemSub",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=_TEXT_SECONDARY,
            spaceBefore=0,
            spaceAfter=0,
        ),
    }


def _esc(text: Any) -> str:
    """Escape a value for reportlab's Paragraph (uses a subset of
    HTML — `<`, `>`, `&` are special). None → empty string."""
    if text is None:
        return ""
    s = str(text)
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _hr(rl, color: str = _BRAND_BLUE, thickness: float = 2.0):
    """Brand-accent horizontal rule under section headers."""
    return rl.HRFlowable(
        width="100%",
        thickness=thickness,
        color=color,
        spaceBefore=0,
        spaceAfter=10,
        lineCap="round",
    )


def _companion_avatar_color(name: str) -> str:
    """Deterministic hex color for a companion's avatar — stable
    across runs so the same person always gets the same color in
    follow-up exports. Hash the name into a small palette of
    brand-friendly hues (avoids bright lipsticks and muddy beiges)."""
    palette = [
        "#0071e3",  # brand blue
        "#9b59b6",  # brand purple
        "#34c759",  # brand green
        "#ff9500",  # orange (Apple system)
        "#5ac8fa",  # teal
        "#af52de",  # violet
        "#ff3b30",  # red
        "#8e8e93",  # graphite
    ]
    if not name:
        return palette[0]
    h = sum(ord(c) for c in name) % len(palette)
    return palette[h]


def _companion_card(rl, styles, page_w, margin_lr, name: str, role: str = ""):
    """A "contact card"-style chip for a companion — colored
    avatar tile with the person's initials in white, then their
    name (bold) and optional role (muted) on the right. Designed
    to be packed into a 2-column grid for compact display."""
    initials = "".join(part[:1].upper() for part in name.split()[:2]) if name else "?"
    if not initials:
        initials = "?"
    color = _companion_avatar_color(name)

    avatar_para = rl.Paragraph(
        f'<para alignment="center"><font color="white" size="15"><b>{_esc(initials)}</b></font></para>',
        rl.ParagraphStyle(
            "GGAvatar",
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=18,
            alignment=1,
            textColor=rl.colors.white,
        ),
    )
    info_flowables: list[Any] = [
        rl.Paragraph(_esc(name) or "Untitled companion", styles["dayTitle"]),
    ]
    if role:
        info_flowables.append(rl.Paragraph(_esc(role), styles["muted"]))

    chip = rl.Table(
        [[avatar_para, info_flowables]],
        colWidths=[1.4 * rl.cm, None],
    )
    chip.setStyle(rl.TableStyle([
        # Avatar tile — solid colored square (no native rounded
        # corners in Table cells, but at this size the square reads
        # as "tile/badge" cleanly enough).
        ("BACKGROUND", (0, 0), (0, 0), rl.colors.HexColor(color)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("TOPPADDING", (0, 0), (0, 0), 8),
        ("BOTTOMPADDING", (0, 0), (0, 0), 8),
        ("LEFTPADDING", (1, 0), (1, 0), 12),
        ("RIGHTPADDING", (1, 0), (1, 0), 8),
        ("TOPPADDING", (1, 0), (1, 0), 6),
        ("BOTTOMPADDING", (1, 0), (1, 0), 6),
        # Outer card border so the chip reads as a unit
        ("BOX", (0, 0), (-1, -1), 0.4, rl.colors.HexColor(_RULE_GREY)),
        ("BACKGROUND", (1, 0), (-1, -1), rl.colors.white),
    ]))
    return chip


def _companion_grid(rl, styles, page_w, margin_lr, companions: list):
    """Pack companions into a 2-column grid of chips. For odd
    counts the last row's right cell is left empty so the grid
    stays rectangular."""
    if not companions:
        return rl.Spacer(1, 0)
    chips: list[Any] = []
    for c in companions:
        if isinstance(c, dict):
            nm = c.get("name") or ""
            role = c.get("role") or ""
            chips.append(_companion_card(rl, styles, page_w, margin_lr, nm, role))
        elif isinstance(c, str):
            chips.append(_companion_card(rl, styles, page_w, margin_lr, c))
    # 2-col grid
    rows: list[list[Any]] = []
    gap = 8
    col_w = (page_w - 2 * margin_lr - gap) / 2
    for i in range(0, len(chips), 2):
        left = chips[i]
        right = chips[i + 1] if i + 1 < len(chips) else ""
        rows.append([left, "", right])
    grid = rl.Table(rows, colWidths=[col_w, gap, col_w])
    grid.setStyle(rl.TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return grid


def _section_opener(rl, styles, page_w, margin_lr, number: str, title: str, kicker: str, color: str):
    """A magazine-style section opener — big "01" number, section
    title underneath, small-caps tagline, then a thick accent rule.
    Returned as a list of flowables; caller is responsible for
    putting a PageBreak BEFORE this list so the opener always
    lands at the top of a fresh page.

    The accent rule color matches the section's theme — blue for
    days, purple for to-dos, green for budgets, etc. — so the
    eye learns the color-to-section pairing as it flips through."""
    return [
        rl.Spacer(1, 0.4 * rl.cm),
        rl.Paragraph(_esc(number), styles["sectionNumber"]),
        rl.Paragraph(_esc(title), styles["sectionTitle"]),
        rl.Paragraph(_esc(kicker), styles["sectionKicker"]),
        rl.HRFlowable(
            width="40%",
            thickness=3.0,
            color=color,
            spaceBefore=0,
            spaceAfter=24,
            lineCap="round",
        ),
    ]


def _day_card(rl, styles, page_w, margin_lr, day: dict, day_map_png: bytes | None):
    """Render one day as a "card" — a table with a thin tinted
    background, a date-chip header strip, the day's morning /
    afternoon / evening copy, notes, and optional tip.

    Returned wrapped in a KeepTogether so the card doesn't split
    mid-block if it'd fit on a fresh page. Long days (lots of
    notes) STILL split — KeepTogether falls back to natural flow
    when the block exceeds a single page."""
    day_number = day.get("day_number")
    day_date = _fmt_date(day.get("date"))
    day_name = (day.get("name") or "").strip()

    # Header strip: kicker (date) + big day title
    kicker_text = ""
    if day_date:
        kicker_text = day_date.upper()
    title_parts: list[str] = []
    if day_number is not None and day_number != "":
        title_parts.append(f"Day {day_number}")
    if day_name:
        title_parts.append(day_name)
    day_title = "  ·  ".join(title_parts) or "Day"

    inner: list[Any] = [
        rl.Paragraph(_esc(kicker_text), styles["dayKicker"]) if kicker_text else rl.Spacer(1, 0),
        rl.Paragraph(_esc(day_title), styles["dayTitle"]),
        rl.HRFlowable(
            width="100%",
            thickness=0.6,
            color=_RULE_GREY,
            spaceBefore=0,
            spaceAfter=8,
        ),
    ]

    if day_map_png:
        try:
            inner.append(
                rl.Image(
                    io.BytesIO(day_map_png),
                    width=page_w - 2 * margin_lr - 24,  # minus card padding
                    height=(page_w - 2 * margin_lr - 24) * 0.28,
                    kind="proportional",
                )
            )
            inner.append(rl.Spacer(1, 0.25 * rl.cm))
        except Exception:
            pass

    any_slot = False
    for slot_name, slot_label in (
        ("morning", "MORNING"),
        ("afternoon", "AFTERNOON"),
        ("evening", "EVENING"),
    ):
        val = day.get(slot_name)
        if isinstance(val, str) and val.strip():
            any_slot = True
            inner.append(rl.Paragraph(slot_label, styles["slotLabel"]))
            body_text = _esc(val).replace("\n", "<br/>")
            inner.append(rl.Paragraph(body_text, styles["body"]))

    notes = day.get("notes")
    if isinstance(notes, str) and notes.strip():
        inner.append(rl.Paragraph("NOTES", styles["slotLabel"]))
        inner.append(
            rl.Paragraph(_esc(notes).replace("\n", "<br/>"), styles["body"])
        )
        any_slot = True

    tip = day.get("tip")
    if isinstance(tip, str) and tip.strip():
        inner.append(
            rl.Paragraph(f"💡 {_esc(tip)}", styles["tip"])
        )
        any_slot = True

    if not any_slot:
        inner.append(
            rl.Paragraph("<i>No plan yet for this day.</i>", styles["muted"])
        )

    # Wrap the whole day in a one-cell table so it gets a card
    # background + subtle padding. The table border is the visual
    # "card edge"; reportlab doesn't have a native rounded-corner
    # box flowable so we settle for a 0.4pt border at the brand's
    # subtle grey.
    card = rl.Table([[inner]], colWidths=[page_w - 2 * margin_lr])
    card.setStyle(rl.TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), rl.colors.HexColor("#fafbff")),
        ("BOX", (0, 0), (-1, -1), 0.4, rl.colors.HexColor(_RULE_GREY)),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    return [card, rl.Spacer(1, 0.35 * rl.cm)]


def _summary_stats_row(rl, styles, stats: list[tuple[str, str]], page_w, margin_lr):
    """Cover-page 'stat tiles' — each stat is its own pill-shaped
    card with a tinted background. Tiles flex evenly to fill the
    page width regardless of how many stats we have (2 / 3 / 4
    common).

    `stats` is a list of (value, label) tuples — e.g.
    [("7", "DAYS"), ("12", "TO-DOS"), ("€842", "SPEND")]."""
    if not stats:
        return rl.Spacer(1, 0.1 * rl.cm)
    n = len(stats)
    available = page_w - 2 * margin_lr
    gap = 8  # pts between tiles
    tile_w = (available - gap * (n - 1)) / n

    # Each tile is a 1-cell Table with value-over-label content
    # and a tinted background. Wrapping all tiles in an outer
    # Table-of-tiles handles the horizontal layout + gap.
    tile_cells: list[Any] = []
    for value, label in stats:
        inner = rl.Table(
            [
                [rl.Paragraph(_esc(value), styles["stat"])],
                [rl.Paragraph(_esc(label), styles["statLabel"])],
            ],
            colWidths=[tile_w],
        )
        inner.setStyle(rl.TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), rl.colors.HexColor("#f0f6ff")),
            ("BOX", (0, 0), (-1, -1), 0.4, rl.colors.HexColor("#d6e4ff")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, 0), 14),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
            ("TOPPADDING", (0, 1), (-1, 1), 0),
            ("BOTTOMPADDING", (0, 1), (-1, 1), 12),
        ]))
        tile_cells.append(inner)

    # Outer table places tiles side-by-side with a spacer column
    # between each pair. Build the row + colWidths together.
    row: list[Any] = []
    col_widths: list[float] = []
    for i, tile in enumerate(tile_cells):
        if i > 0:
            row.append("")
            col_widths.append(gap)
        row.append(tile)
        col_widths.append(tile_w)
    outer = rl.Table([row], colWidths=col_widths)
    outer.setStyle(rl.TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return outer


def _toc_entry(rl, styles, page_w, margin_lr, number: str, title: str, sub: str, color: str):
    """One row in the 'What's inside' table-of-contents block on
    the cover page. Renders as a tinted left edge + number + title
    + subtitle, in one table row. The left-edge color matches the
    section's theme color in the document body (blue/purple/etc.)
    so the reader learns the chapter→color mapping immediately."""
    return rl.Table(
        [[
            rl.Paragraph(_esc(number), styles["dayKicker"]),
            rl.Paragraph(_esc(title), styles["tocItem"]),
            rl.Paragraph(_esc(sub), styles["tocItemSub"]),
        ]],
        colWidths=[
            0.7 * rl.cm,
            5.4 * rl.cm,
            page_w - 2 * margin_lr - 0.7 * rl.cm - 5.4 * rl.cm,
        ],
    ).setStyle  # chain a setStyle call returns None — fix below
# (Note: setStyle returns None; the wrapper below assigns then returns.)


def _toc_row(rl, styles, page_w, margin_lr, number: str, title: str, sub: str, color: str):
    """TOC row used by the cover-page 'What's inside' block. Each
    row is: tinted accent bar | number | title | description.
    Number + title sit on the same baseline; description wraps."""
    t = rl.Table(
        [[
            "",
            rl.Paragraph(_esc(number), styles["dayKicker"]),
            [
                rl.Paragraph(_esc(title), styles["tocItem"]),
                rl.Paragraph(_esc(sub), styles["tocItemSub"]),
            ],
        ]],
        colWidths=[
            0.18 * rl.cm,
            0.8 * rl.cm,
            page_w - 2 * margin_lr - 0.98 * rl.cm,
        ],
    )
    t.setStyle(rl.TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), rl.colors.HexColor(color)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        # Tiny gap between the accent bar and the number col so
        # the bar reads as a separate element.
        ("LEFTPADDING", (1, 0), (1, -1), 8),
    ]))
    return t


def _fmt_date(s: Any) -> str:
    """`2026-04-15` → `Wed 15 Apr 2026`. Non-ISO inputs pass through."""
    if not s:
        return ""
    try:
        dt = datetime.fromisoformat(str(s)[:10])
        return dt.strftime("%a %d %b %Y")
    except (ValueError, TypeError):
        return str(s)


def _safe_json(raw: Any, fallback: Any) -> Any:
    """Decode a JSON column defensively; if the column is already
    a list/dict (sqlite3 row deserialization isn't doing this but
    /api/data sometimes pre-parses), return as-is."""
    if raw is None:
        return fallback
    if isinstance(raw, (list, dict)):
        return raw
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        return fallback


def _build_trip_pdf(trip_row: dict, options: dict) -> bytes:
    """Render the complete PDF for `trip_row` and return the bytes.
    `options` controls which sections to include:

      includeCover           bool  cover page (always shown; flag for symmetry)
      includeCoverMap        bool  embed the cover map image
      includeStats           bool  the summary stats strip on the cover
      includeDays            bool  per-day schedule pages
      includeDayPins         bool  per-day mini-map with slot pins
      includeTodos           bool  to-do list section
      includeBudgets         bool  budgets section (only if any exist)
      includeCompanions      bool  companion roster
      includeMarkedPlaces    bool  marked-places list

    Unknown keys are ignored; missing keys default to True for the
    'extensive by default' UX brief."""
    rl = _rl()
    styles = _styles(rl)
    buf = io.BytesIO()
    page_w, page_h = rl.A4

    # Margins generous enough that a header / footer can sit
    # alongside the content without crowding.
    margin_lr = 1.6 * rl.cm
    margin_top = 1.6 * rl.cm
    margin_bottom = 1.8 * rl.cm

    doc = rl.BaseDocTemplate(
        buf,
        pagesize=rl.A4,
        leftMargin=margin_lr,
        rightMargin=margin_lr,
        topMargin=margin_top,
        bottomMargin=margin_bottom,
        title=f"{trip_row.get('name', 'Trip')} — Plan",
        author="The Great Getaway",
    )

    def _draw_chrome(canvas, _doc):
        """Page chrome — runs on every page via the PageTemplate
        hook. Three pieces:

          1. Thin brand-blue accent bar across the top edge so the
             page has a distinct "this is part of a polished doc"
             header rather than floating loose content.
          2. Small kicker on the top-right naming the document
             ("Trip Plan · <trip name>") so individual printed
             pages keep their identity if they get separated.
          3. Footer with brand line on the left + page number on
             the right, plus a subtle separator rule above.
        """
        trip_name = trip_row.get("name", "") or ""
        # 1. Top accent bar — full-bleed across the top
        canvas.saveState()
        canvas.setFillColor(rl.colors.HexColor(_BRAND_BLUE))
        canvas.rect(0, page_h - 0.18 * rl.cm, page_w, 0.18 * rl.cm, fill=1, stroke=0)
        canvas.restoreState()

        # 2. Top kicker — small caps, top-right, just under the bar.
        # Skip on the COVER PAGE (page 1) so the hero block reads
        # uncluttered.
        if _doc.page > 1:
            canvas.saveState()
            canvas.setFont("Helvetica-Bold", 7.5)
            canvas.setFillColor(rl.colors.HexColor(_BRAND_BLUE))
            kicker_y = page_h - 0.9 * rl.cm
            canvas.drawRightString(
                page_w - margin_lr,
                kicker_y,
                f"TRIP PLAN  ·  {trip_name.upper()}",
            )
            canvas.restoreState()

        # 3. Footer — thin separator rule + brand line + page number.
        canvas.saveState()
        canvas.setStrokeColor(rl.colors.HexColor(_RULE_GREY))
        canvas.setLineWidth(0.4)
        canvas.line(
            margin_lr,
            1.3 * rl.cm,
            page_w - margin_lr,
            1.3 * rl.cm,
        )
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(rl.colors.HexColor(_TEXT_SECONDARY))
        footer_y = 0.9 * rl.cm
        canvas.drawString(
            margin_lr,
            footer_y,
            f"The Great Getaway  ·  {trip_name}",
        )
        canvas.drawRightString(
            page_w - margin_lr,
            footer_y,
            f"Page {_doc.page}",
        )
        canvas.restoreState()

    frame = rl.Frame(
        margin_lr,
        margin_bottom,
        page_w - 2 * margin_lr,
        page_h - margin_top - margin_bottom,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )
    doc.addPageTemplates([
        rl.PageTemplate(id="trip", frames=[frame], onPage=_draw_chrome),
    ])

    story: list[Any] = []

    opt = lambda k, default=True: bool(options.get(k, default))

    # ── parsed JSON columns ──
    companions = _safe_json(trip_row.get("companions_json"), [])
    marked_places = _safe_json(trip_row.get("marked_places_json"), [])
    # `days` is a list of trip_days rows the API loader attached
    # to the row dict (not a JSON column on `trips` — trip_days is
    # its own table). Each day carries day_number / date / name /
    # morning / afternoon / evening / notes / lat / lng. AI plans
    # live in localStorage on the frontend, NOT in the schema; the
    # frontend can optionally inline an `aiPlan` array in the
    # options blob to add the LLM-generated layer, but the canonical
    # day data is always trip_days.
    days = trip_row.get("days") or []
    ai_plan_extra = options.get("aiPlan") if isinstance(options.get("aiPlan"), list) else []

    # ── COVER PAGE ──
    # Full-bleed feel: tiny brand kicker → big hero title → country/
    # dates → hero map → stat tiles → "what's inside" mini-TOC.
    # Everything sized so the cover fills a SINGLE page; PageBreak
    # below it guarantees the next section starts on page 2.
    title = trip_row.get("name") or "Untitled trip"
    country = trip_row.get("country") or ""
    date_from = trip_row.get("date_from") or ""
    date_to = trip_row.get("date_to") or ""
    if date_from and date_to:
        date_line = f"{_fmt_date(date_from)}   →   {_fmt_date(date_to)}"
    elif date_from or date_to:
        date_line = _fmt_date(date_from or date_to)
    else:
        date_line = ""

    story.append(rl.Spacer(1, 0.6 * rl.cm))
    story.append(
        rl.Paragraph("THE GREAT GETAWAY   ·   TRIP PLAN", styles["kicker"])
    )
    story.append(
        rl.HRFlowable(
            width="22%",
            thickness=2.5,
            color=_BRAND_BLUE,
            spaceBefore=0,
            spaceAfter=16,
            lineCap="round",
        )
    )
    story.append(rl.Paragraph(_esc(title), styles["hero"]))
    if country:
        story.append(rl.Paragraph(_esc(country), styles["heroSub"]))
    if date_line:
        story.append(rl.Paragraph(_esc(date_line), styles["heroSub"]))
    story.append(rl.Spacer(1, 0.7 * rl.cm))

    if opt("includeCoverMap"):
        map_png = _fetch_cover_map(
            trip_row.get("lat"),
            trip_row.get("lng"),
            trip_row.get("place_id"),
        )
        if map_png:
            try:
                # Wrap the map in a thin-bordered table so it looks
                # framed rather than just floating loose on the page.
                img = rl.Image(
                    io.BytesIO(map_png),
                    width=page_w - 2 * margin_lr,
                    height=(page_w - 2 * margin_lr) * 0.46,
                    kind="proportional",
                )
                frame = rl.Table(
                    [[img]],
                    colWidths=[page_w - 2 * margin_lr],
                )
                frame.setStyle(rl.TableStyle([
                    ("BOX", (0, 0), (-1, -1), 0.5, rl.colors.HexColor(_RULE_GREY)),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]))
                story.append(frame)
                story.append(rl.Spacer(1, 0.6 * rl.cm))
            except Exception:
                # Reportlab refuses bad image bytes silently —
                # don't let a corrupt image bomb the whole PDF.
                pass

    if opt("includeStats"):
        # Build the summary tiles dynamically — only show what we
        # have so the strip never has empty cells.
        stats: list[tuple[str, str]] = []
        if days:
            stats.append((str(len(days)), "DAYS"))
        if companions:
            stats.append((str(len(companions)), "COMPANIONS"))
        if marked_places:
            stats.append((str(len(marked_places)), "PLACES"))
        # Expenses + budgets totals if available
        if trip_row.get("total_spend_eur") is not None:
            stats.append((f"€{int(trip_row['total_spend_eur']):,}", "SPEND"))
        if stats:
            story.append(_summary_stats_row(rl, styles, stats, page_w, margin_lr))
            story.append(rl.Spacer(1, 0.7 * rl.cm))

    # "What's inside" mini-TOC. Lists only the sections the user
    # opted to include — so the cover honestly previews what they
    # ticked in the export modal.
    toc_entries: list[tuple[str, str, str, str]] = []
    n = 1
    if opt("includeDays") and days:
        toc_entries.append((
            f"{n:02d}", "Day-by-day",
            f"{len(days)} day{'s' if len(days) != 1 else ''} of plans.",
            _BRAND_BLUE,
        ))
        n += 1
    todos = _safe_json(trip_row.get("checklist_json"), [])
    if opt("includeTodos") and todos:
        toc_entries.append((
            f"{n:02d}", "Checklist",
            f"{len(todos)} to-do{'s' if len(todos) != 1 else ''} grouped by category.",
            _BRAND_PURPLE,
        ))
        n += 1
    budgets = trip_row.get("budgets") or []
    if opt("includeBudgets") and budgets:
        toc_entries.append((
            f"{n:02d}", "Budgets",
            f"{len(budgets)} planned line item{'s' if len(budgets) != 1 else ''} + trip-total spend.",
            _BRAND_GREEN,
        ))
        n += 1
    if opt("includeCompanions") and companions:
        toc_entries.append((
            f"{n:02d}", "Companions",
            f"Travelling with {len(companions)} other{'s' if len(companions) != 1 else ''}.",
            _BRAND_PURPLE,
        ))
        n += 1
    if opt("includeMarkedPlaces") and marked_places:
        toc_entries.append((
            f"{n:02d}", "Marked places",
            f"{len(marked_places)} saved place{'s' if len(marked_places) != 1 else ''}.",
            _BRAND_BLUE,
        ))
        n += 1

    if toc_entries:
        story.append(
            rl.Paragraph("WHAT'S INSIDE", styles["kicker"])
        )
        for entry in toc_entries:
            story.append(_toc_row(rl, styles, page_w, margin_lr, *entry))
            story.append(rl.Spacer(1, 0.18 * rl.cm))

    # Section counter mirrors the TOC numbering above so the
    # "01" on the section opener matches the "01" on the cover.
    section_num = 1

    # ── DAYS ──
    if opt("includeDays") and days:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title="Day-by-day",
            kicker=(
                f"{len(days)} day{'s' if len(days) != 1 else ''} laid out below. "
                "Each card walks the day morning → afternoon → evening."
            ),
            color=_BRAND_BLUE,
        ))
        section_num += 1

        # Hero overview map — pins for every day that has coords.
        # Goes BEFORE the first day card so the reader sees "where
        # the trip happens" at a glance, then dives into the
        # individual day cards. Day 1-9 get numeric pin labels;
        # day 10+ get unlabeled pins (Static Maps labels are
        # single-character).
        if opt("includeDayPins"):
            pins: list[tuple[float, float, str]] = []
            for day in days:
                if not isinstance(day, dict):
                    continue
                d_lat = day.get("lat")
                d_lng = day.get("lng")
                if d_lat is None or d_lng is None:
                    continue
                d_num = day.get("day_number")
                label = str(d_num) if (d_num is not None and 1 <= int(d_num) <= 9) else ""
                pins.append((d_lat, d_lng, label))
            if pins:
                overview_png = _fetch_overview_pins_map(
                    pins,
                    center_lat=trip_row.get("lat"),
                    center_lng=trip_row.get("lng"),
                )
                if overview_png:
                    try:
                        ov_img = rl.Image(
                            io.BytesIO(overview_png),
                            width=page_w - 2 * margin_lr,
                            height=(page_w - 2 * margin_lr) * 0.42,
                            kind="proportional",
                        )
                        ov_frame = rl.Table(
                            [[ov_img]],
                            colWidths=[page_w - 2 * margin_lr],
                        )
                        ov_frame.setStyle(rl.TableStyle([
                            ("BOX", (0, 0), (-1, -1), 0.5, rl.colors.HexColor(_RULE_GREY)),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                            ("TOPPADDING", (0, 0), (-1, -1), 0),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                        ]))
                        story.append(rl.Paragraph(
                            f"EVERY DAY ON ONE MAP   ·   {len(pins)} PIN{'S' if len(pins) != 1 else ''}",
                            styles["kicker"],
                        ))
                        story.append(ov_frame)
                        story.append(rl.Spacer(1, 0.7 * rl.cm))
                    except Exception:
                        pass

        for day in days:
            if not isinstance(day, dict):
                continue
            # Per-day mini-map (opt-in).
            day_map_png = None
            if opt("includeDayPins"):
                d_lat = day.get("lat")
                d_lng = day.get("lng")
                if d_lat is None or d_lng is None:
                    d_lat = trip_row.get("lat")
                    d_lng = trip_row.get("lng")
                day_map_png = _fetch_day_pin_map(d_lat, d_lng, None)
            card_flowables = _day_card(rl, styles, page_w, margin_lr, day, day_map_png)
            # KeepTogether on each card → don't split a single day
            # mid-block. Long days (lots of notes) STILL fall back
            # to natural pagination when they exceed one page.
            story.append(rl.KeepTogether(card_flowables))

        # Optionally append the LLM-generated layer the frontend
        # forwarded along (lives in localStorage; not in the DB).
        if ai_plan_extra:
            story.append(rl.PageBreak())
            story.extend(_section_opener(
                rl, styles, page_w, margin_lr,
                number="✦",
                title="AI suggestions",
                kicker=(
                    "Gemini-generated plan kept alongside your hand-edited "
                    "version. Not yet accepted into your day-by-day."
                ),
                color=_BRAND_PURPLE,
            ))
            for day in ai_plan_extra:
                if not isinstance(day, dict):
                    continue
                day_num = day.get("day", "")
                day_dt = _fmt_date(day.get("date", ""))
                main_loc = day.get("mainLocation") or day.get("title") or ""
                kicker_text = day_dt.upper() if day_dt else ""
                title_parts = []
                if day_num:
                    title_parts.append(f"Day {day_num}")
                if main_loc:
                    title_parts.append(main_loc)
                ai_title = "  ·  ".join(title_parts) or "Day"

                inner: list[Any] = []
                if kicker_text:
                    inner.append(rl.Paragraph(_esc(kicker_text), styles["dayKicker"]))
                inner.append(rl.Paragraph(_esc(ai_title), styles["dayTitle"]))
                inner.append(rl.HRFlowable(
                    width="100%", thickness=0.6, color=_RULE_GREY,
                    spaceBefore=0, spaceAfter=8,
                ))
                for slot_name, slot_label in (
                    ("breakfast", "BREAKFAST"),
                    ("lunch", "LUNCH"),
                    ("dinner", "DINNER"),
                ):
                    slot = day.get(slot_name)
                    if isinstance(slot, dict):
                        nm = slot.get("name") or slot.get("text") or ""
                        why = slot.get("why") or ""
                        inner.append(rl.Paragraph(slot_label, styles["slotLabel"]))
                        if nm:
                            inner.append(rl.Paragraph(_esc(nm), styles["body"]))
                        if why:
                            inner.append(rl.Paragraph(_esc(why), styles["muted"]))
                sights = day.get("sights")
                if isinstance(sights, list) and sights:
                    inner.append(rl.Paragraph("SIGHTS", styles["slotLabel"]))
                    for s in sights:
                        if isinstance(s, dict):
                            nm = s.get("name") or s.get("text") or ""
                            inner.append(rl.Paragraph(f"• {_esc(nm)}", styles["body"]))
                        elif isinstance(s, str):
                            inner.append(rl.Paragraph(f"• {_esc(s)}", styles["body"]))
                card = rl.Table([[inner]], colWidths=[page_w - 2 * margin_lr])
                card.setStyle(rl.TableStyle([
                    ("BACKGROUND", (0, 0), (-1, -1), rl.colors.HexColor("#fbf7ff")),
                    ("BOX", (0, 0), (-1, -1), 0.4, rl.colors.HexColor("#e9d8fd")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 14),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]))
                story.append(rl.KeepTogether([card, rl.Spacer(1, 0.35 * rl.cm)]))

    # ── TO-DOs ──
    todos = _safe_json(trip_row.get("checklist_json"), [])
    if opt("includeTodos") and todos:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title="Checklist",
            kicker=(
                f"{len(todos)} item{'s' if len(todos) != 1 else ''} "
                "grouped by category. Tick what's done as you go."
            ),
            color=_BRAND_PURPLE,
        ))
        section_num += 1
        # Group by category if items have one; else flat list.
        by_cat: dict[str, list[dict]] = {}
        for t in todos:
            if not isinstance(t, dict):
                continue
            cat = t.get("category") or "General"
            by_cat.setdefault(cat, []).append(t)
        for cat, items in by_cat.items():
            cat_inner: list[Any] = [
                rl.Paragraph(_esc(cat).upper(), styles["slotLabel"]),
            ]
            for it in items:
                done = bool(it.get("completed") or it.get("done"))
                marker = "☑" if done else "☐"
                body = it.get("text") or it.get("name") or ""
                style = styles["muted"] if done else styles["body"]
                cat_inner.append(
                    rl.Paragraph(f"{marker}  {_esc(body)}", style)
                )
            cat_card = rl.Table(
                [[cat_inner]], colWidths=[page_w - 2 * margin_lr],
            )
            cat_card.setStyle(rl.TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), rl.colors.HexColor("#fdfafe")),
                ("BOX", (0, 0), (-1, -1), 0.4, rl.colors.HexColor(_RULE_GREY)),
                ("LEFTPADDING", (0, 0), (-1, -1), 14),
                ("RIGHTPADDING", (0, 0), (-1, -1), 14),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(rl.KeepTogether([cat_card, rl.Spacer(1, 0.3 * rl.cm)]))

    # ── BUDGETS ──
    budgets = trip_row.get("budgets") or []
    if opt("includeBudgets") and budgets:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title="Budgets",
            kicker=(
                f"{len(budgets)} planned line item"
                f"{'s' if len(budgets) != 1 else ''} alongside the trip's "
                "actual spend, EUR-normalised."
            ),
            color=_BRAND_GREEN,
        ))
        section_num += 1
        # The budgets table is { label, amount, currency } — there's
        # no per-budget→category mapping in this schema, so we can't
        # split spend by budget. Show each budget's planned amount
        # alongside the trip's TOTAL spend (one number, footer row)
        # so the reader still gets the at-a-glance "did I stay
        # under" answer without a misleading per-row "spent" column.
        rows = [["Budget", "Planned"]]
        total_planned = 0.0
        for b in budgets:
            amount = float(b.get("amount") or 0)
            currency = b.get("currency") or "EUR"
            total_planned += amount
            rows.append([
                _esc(b.get("label") or "Untitled"),
                f"{currency} {amount:,.0f}",
            ])
        rows.append(["Total planned", f"EUR {total_planned:,.0f}"])
        if trip_row.get("total_spend_eur") is not None:
            rows.append([
                "Actual trip spend (EUR-normalised)",
                f"EUR {trip_row['total_spend_eur']:,.0f}",
            ])
        col_w = [(page_w - 2 * margin_lr) * 0.6, (page_w - 2 * margin_lr) * 0.4]
        budget_table = rl.Table(rows, colWidths=col_w)
        last = len(rows) - 1
        budget_table.setStyle(rl.TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (-1, 0), rl.colors.HexColor(_BRAND_NAVY)),
            ("TEXTCOLOR", (0, 1), (-1, -1), rl.colors.HexColor(_TEXT_PRIMARY)),
            ("BACKGROUND", (0, 0), (-1, 0), rl.colors.HexColor("#f4f4f5")),
            ("LINEBELOW", (0, 0), (-1, 0), 1, rl.colors.HexColor(_RULE_GREY)),
            ("LINEABOVE", (0, -1), (-1, -1), 1, rl.colors.HexColor(_RULE_GREY)),
            ("FONTNAME", (0, last - 1), (-1, last), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -3), [rl.colors.white, rl.colors.HexColor("#fafafa")]),
            ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(budget_table)

    # ── COMPANIONS ──
    if opt("includeCompanions") and companions:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title="Companions",
            kicker=(
                f"Travelling with {len(companions)} other"
                f"{'s' if len(companions) != 1 else ''}."
            ),
            color=_BRAND_PURPLE,
        ))
        section_num += 1
        # Pretty avatar grid — each companion gets a colored
        # initials tile + name/role on the right, 2 per row.
        story.append(_companion_grid(rl, styles, page_w, margin_lr, companions))

    # ── MARKED PLACES ──
    if opt("includeMarkedPlaces") and marked_places:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title="Marked places",
            kicker=(
                f"{len(marked_places)} saved place"
                f"{'s' if len(marked_places) != 1 else ''} with addresses."
            ),
            color=_BRAND_BLUE,
        ))
        section_num += 1

        # Overview map of all marked places with letter-labeled
        # pins (A, B, C…). Sits at the top of the section so the
        # reader sees where on the map the saved places sit before
        # scanning the address list below.
        place_pins: list[tuple[float, float, str]] = []
        for i, p in enumerate(marked_places):
            if not isinstance(p, dict):
                continue
            plat = p.get("lat")
            plng = p.get("lng")
            if plat is None or plng is None:
                continue
            label = chr(ord("A") + i) if i < 26 else ""
            place_pins.append((plat, plng, label))
        if place_pins:
            places_map_png = _fetch_overview_pins_map(
                place_pins,
                center_lat=trip_row.get("lat"),
                center_lng=trip_row.get("lng"),
            )
            if places_map_png:
                try:
                    pl_img = rl.Image(
                        io.BytesIO(places_map_png),
                        width=page_w - 2 * margin_lr,
                        height=(page_w - 2 * margin_lr) * 0.42,
                        kind="proportional",
                    )
                    pl_frame = rl.Table(
                        [[pl_img]], colWidths=[page_w - 2 * margin_lr],
                    )
                    pl_frame.setStyle(rl.TableStyle([
                        ("BOX", (0, 0), (-1, -1), 0.5, rl.colors.HexColor(_RULE_GREY)),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ]))
                    story.append(pl_frame)
                    story.append(rl.Spacer(1, 0.6 * rl.cm))
                except Exception:
                    pass

        # List with letter-labeled cards matching the map pins.
        for i, p in enumerate(marked_places):
            if not isinstance(p, dict):
                continue
            nm = p.get("name") or ""
            addr = p.get("address") or p.get("vicinity") or ""
            label = chr(ord("A") + i) if i < 26 else "·"
            # Left column = a small letter badge matching the map pin
            letter_para = rl.Paragraph(
                f'<para alignment="center"><font color="white" size="13"><b>{_esc(label)}</b></font></para>',
                rl.ParagraphStyle("GGLetter", fontName="Helvetica-Bold",
                                  fontSize=13, leading=15, alignment=1,
                                  textColor=rl.colors.white),
            )
            place_info: list[Any] = [
                rl.Paragraph(_esc(nm), styles["dayTitle"]),
            ]
            if addr:
                place_info.append(rl.Paragraph(_esc(addr), styles["muted"]))
            place_card = rl.Table(
                [[letter_para, place_info]],
                colWidths=[1.1 * rl.cm, None],
            )
            place_card.setStyle(rl.TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), rl.colors.HexColor(_BRAND_BLUE)),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
                ("BACKGROUND", (1, 0), (-1, -1), rl.colors.HexColor("#fafbff")),
                ("BOX", (0, 0), (-1, -1), 0.4, rl.colors.HexColor(_RULE_GREY)),
                ("LEFTPADDING", (1, 0), (1, 0), 12),
                ("RIGHTPADDING", (1, 0), (1, 0), 10),
                ("TOPPADDING", (1, 0), (1, 0), 10),
                ("BOTTOMPADDING", (1, 0), (1, 0), 10),
                ("TOPPADDING", (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 0),
            ]))
            story.append(rl.KeepTogether([place_card, rl.Spacer(1, 0.18 * rl.cm)]))

    if not any(opt(k) for k in (
        "includeDays", "includeTodos", "includeBudgets",
        "includeCompanions", "includeMarkedPlaces",
    )):
        # No content sections selected — make the cover the only
        # page and add a soft hint.
        story.append(rl.Spacer(1, 1.0 * rl.cm))
        story.append(rl.Paragraph(
            "<i>You chose a cover-only export. Re-run with more "
            "sections selected to include the day plan, to-dos, "
            "budgets, companions, and marked places.</i>",
            styles["muted"],
        ))

    doc.build(story)
    return buf.getvalue()


@bp.route("/api/trips/<trip_id>/pdf", methods=["POST"])
@require_auth
@limiter.limit("10 per minute")
def export_trip_pdf(trip_id: str):
    """Build a PDF plan for the trip and stream it as a download.

    Body (JSON, all optional, all default True):
        {
          "includeCoverMap": bool,
          "includeStats": bool,
          "includeDays": bool,
          "includeDayPins": bool,
          "includeTodos": bool,
          "includeBudgets": bool,
          "includeCompanions": bool,
          "includeMarkedPlaces": bool
        }

    Response: application/pdf with Content-Disposition: attachment;
    filename suggests `<trip-name>.pdf` (slugified). 403 if the
    caller can't read the trip; 404 if it doesn't exist."""
    user_id = current_user_id()
    options = request.json or {}
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_id, name, country, country_code, place_id, lat, lng, "
            "       companions_json, marked_places_json, checklist_json "
            "FROM trips WHERE id = ?",
            (trip_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        if not _can_read_trip(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403

        trip = dict(row)

        # Augment with optional sibling data so the PDF builder has
        # everything in one struct.
        # Date range — derived from trip_days if present.
        cursor.execute(
            "SELECT MIN(date) AS f, MAX(date) AS t FROM trip_days WHERE trip_id = ?",
            (trip_id,),
        )
        date_row = cursor.fetchone()
        trip["date_from"] = date_row["f"] if date_row else None
        trip["date_to"] = date_row["t"] if date_row else None

        # Day rows — the user-edited per-day plan. ai-plan
        # suggestions live in localStorage; the frontend may inline
        # an `aiPlan` array in the options payload to add that
        # layer too (see PDF builder's ai_plan_extra branch).
        cursor.execute(
            "SELECT id, day_number, date, name, morning, afternoon, "
            "       evening, notes, tip, lat, lng "
            "FROM trip_days WHERE trip_id = ? "
            "ORDER BY day_number ASC, date ASC",
            (trip_id,),
        )
        trip["days"] = [dict(r) for r in cursor.fetchall()]

        # Budgets attached to the trip — owner-scoped, label+amount
        # shape (no category mapping in this schema, so per-row
        # spend can't be cleanly computed; PDF builder shows trip-
        # total spend instead).
        cursor.execute(
            "SELECT label, amount, currency FROM budgets "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, trip["user_id"]),
        )
        trip["budgets"] = [dict(b) for b in cursor.fetchall()]

        # Total spend across the trip — drives the cover stat tile.
        cursor.execute(
            "SELECT COALESCE(SUM(euro_value), 0) AS total "
            "FROM expenses WHERE trip_id = ?",
            (trip_id,),
        )
        ts = cursor.fetchone()
        trip["total_spend_eur"] = float(ts["total"]) if ts and ts["total"] else None

    pdf_bytes = _build_trip_pdf(trip, options)
    safe_name = "".join(
        c if (c.isalnum() or c in " -_") else "_"
        for c in (trip.get("name") or "trip")
    ).strip() or "trip"
    safe_name = safe_name.replace(" ", "_")
    return send_file(
        io.BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{safe_name}.pdf",
    )
