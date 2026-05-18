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
    """Build the paragraph style sheet. All sizes in points
    (1 pt = 1/72 inch). Leading set to ~1.4x for readable body
    copy; titles use tighter leading."""
    base = rl.getSampleStyleSheet()
    return {
        "h1": rl.ParagraphStyle(
            "GGH1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=32,
            leading=36,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=8,
        ),
        "h1Sub": rl.ParagraphStyle(
            "GGH1Sub",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=13,
            leading=18,
            textColor=_TEXT_SECONDARY,
            spaceBefore=0,
            spaceAfter=14,
        ),
        "h2": rl.ParagraphStyle(
            "GGH2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=_BRAND_NAVY,
            spaceBefore=18,
            spaceAfter=6,
        ),
        "h3": rl.ParagraphStyle(
            "GGH3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=_BRAND_BLUE,
            spaceBefore=12,
            spaceAfter=4,
        ),
        "label": rl.ParagraphStyle(
            "GGLabel",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=_BRAND_PURPLE,
            spaceBefore=4,
            spaceAfter=2,
        ),
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
        "stat": rl.ParagraphStyle(
            "GGStat",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=24,
            textColor=_BRAND_NAVY,
            alignment=1,
        ),
        "statLabel": rl.ParagraphStyle(
            "GGStatLabel",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=10,
            textColor=_TEXT_SECONDARY,
            alignment=1,
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


def _summary_stats_row(rl, styles, stats: list[tuple[str, str]]):
    """Cover-page 'stat strip' — small evenly-spaced summary boxes
    rendered as a Table so the layout is fixed across trip sizes.

    `stats` is a list of (value, label) tuples — e.g.
    [("7", "DAYS"), ("12", "TO-DOS"), ("€842", "SPEND")]."""
    if not stats:
        return rl.Spacer(1, 0.1 * rl.cm)
    cells = [
        [
            rl.Paragraph(_esc(value), styles["stat"]),
            rl.Paragraph(_esc(label), styles["statLabel"]),
        ]
        for value, label in stats
    ]
    # Two rows (value over label) × N columns.
    rows = [[c[0] for c in cells], [c[1] for c in cells]]
    n = len(stats)
    table = rl.Table(rows, colWidths=[(17 * rl.cm) / n] * n)
    table.setStyle(
        rl.TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 0),
                ("TOPPADDING", (0, 1), (-1, 1), 0),
                ("LINEBEFORE", (1, 0), (-1, -1), 0.5, _RULE_GREY),
            ]
        )
    )
    return table


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
        """Page footer — small brand strip + page number. Runs on
        every page via the PageTemplate hook."""
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(rl.colors.HexColor(_TEXT_SECONDARY))
        footer_y = 0.9 * rl.cm
        canvas.drawString(
            margin_lr,
            footer_y,
            f"The Great Getaway · {trip_row.get('name', '')}",
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

    # ── COVER ──
    title = trip_row.get("name") or "Untitled trip"
    country = trip_row.get("country") or ""
    sub_parts = []
    if country:
        sub_parts.append(country)
    date_from = trip_row.get("date_from") or ""
    date_to = trip_row.get("date_to") or ""
    if date_from or date_to:
        if date_from and date_to:
            sub_parts.append(f"{_fmt_date(date_from)} → {_fmt_date(date_to)}")
        else:
            sub_parts.append(_fmt_date(date_from or date_to))
    subtitle = "  ·  ".join(sub_parts) if sub_parts else "Plan"

    story.append(rl.Paragraph(_esc(title), styles["h1"]))
    story.append(rl.Paragraph(_esc(subtitle), styles["h1Sub"]))
    story.append(_hr(rl, color=_BRAND_BLUE, thickness=2.0))

    if opt("includeCoverMap"):
        map_png = _fetch_cover_map(
            trip_row.get("lat"),
            trip_row.get("lng"),
            trip_row.get("place_id"),
        )
        if map_png:
            try:
                story.append(
                    rl.Image(
                        io.BytesIO(map_png),
                        width=page_w - 2 * margin_lr,
                        height=(page_w - 2 * margin_lr) * 0.5,
                        kind="proportional",
                    )
                )
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
            story.append(_summary_stats_row(rl, styles, stats))
            story.append(rl.Spacer(1, 0.6 * rl.cm))

    # ── DAYS ──
    if opt("includeDays") and days:
        story.append(rl.PageBreak())
        story.append(rl.Paragraph("Day-by-day plan", styles["h2"]))
        story.append(_hr(rl, color=_BRAND_PURPLE))
        for day in days:
            if not isinstance(day, dict):
                continue
            day_number = day.get("day_number")
            day_date = _fmt_date(day.get("date"))
            day_name = day.get("name") or ""
            heading_parts: list[str] = []
            if day_number is not None and day_number != "":
                heading_parts.append(f"Day {day_number}")
            if day_date:
                heading_parts.append(day_date)
            heading = " · ".join(heading_parts) or day_name
            if day_name and day_name not in heading:
                heading = f"{heading} — {day_name}" if heading else day_name
            story.append(rl.Paragraph(_esc(heading), styles["h3"]))
            day_block: list[Any] = []

            # Optional day-pin map.
            if opt("includeDayPins"):
                d_lat = day.get("lat")
                d_lng = day.get("lng")
                if d_lat is None or d_lng is None:
                    d_lat = trip_row.get("lat")
                    d_lng = trip_row.get("lng")
                day_map = _fetch_day_pin_map(d_lat, d_lng, None)
                if day_map:
                    try:
                        day_block.append(
                            rl.Image(
                                io.BytesIO(day_map),
                                width=page_w - 2 * margin_lr,
                                height=(page_w - 2 * margin_lr) * 0.32,
                                kind="proportional",
                            )
                        )
                        day_block.append(rl.Spacer(1, 0.3 * rl.cm))
                    except Exception:
                        pass

            # trip_days schema — morning / afternoon / evening are
            # free-text fields (the user-edited day plan). The
            # AI-plan rich-slot shape (breakfast/lunch/dinner dicts)
            # lives in localStorage on the client; this builder
            # renders what's persisted server-side.
            for slot_name, slot_emoji in (
                ("morning", "🌅"),
                ("afternoon", "☀️"),
                ("evening", "🌙"),
            ):
                val = day.get(slot_name)
                if isinstance(val, str) and val.strip():
                    day_block.append(
                        rl.Paragraph(
                            f"{slot_emoji} <b>{slot_name.upper()}</b>",
                            styles["label"],
                        )
                    )
                    # Preserve linebreaks the user typed by
                    # replacing them with reportlab's <br/> tag.
                    body_text = _esc(val).replace("\n", "<br/>")
                    day_block.append(rl.Paragraph(body_text, styles["body"]))

            notes = day.get("notes")
            if isinstance(notes, str) and notes.strip():
                day_block.append(
                    rl.Paragraph("📝 <b>NOTES</b>", styles["label"])
                )
                day_block.append(
                    rl.Paragraph(
                        _esc(notes).replace("\n", "<br/>"), styles["body"],
                    )
                )

            tip = day.get("tip")
            if isinstance(tip, str) and tip.strip():
                day_block.append(
                    rl.Paragraph(
                        f"<i>💡 Tip: {_esc(tip)}</i>",
                        styles["muted"],
                    )
                )

            day_block.append(rl.Spacer(1, 0.4 * rl.cm))
            # KeepTogether keeps the day-heading + at least the
            # first chunk on the same page. Long days will still
            # break naturally inside the block.
            story.append(rl.KeepTogether(day_block))

        # Optionally append the LLM-generated layer the frontend
        # forwarded along (lives in localStorage; not in the DB).
        if ai_plan_extra:
            story.append(rl.PageBreak())
            story.append(rl.Paragraph("AI-suggested plan", styles["h2"]))
            story.append(rl.Paragraph(
                "Gemini-generated suggestions kept alongside your hand-"
                "edited plan. These have not been &lt;accepted&gt; into "
                "your day-by-day yet.",
                styles["muted"],
            ))
            story.append(_hr(rl, color=_BRAND_PURPLE))
            for day in ai_plan_extra:
                if not isinstance(day, dict):
                    continue
                day_num = day.get("day", "")
                day_dt = _fmt_date(day.get("date", ""))
                main_loc = day.get("mainLocation") or day.get("title") or ""
                parts = [f"Day {day_num}" if day_num else ""]
                if day_dt:
                    parts.append(day_dt)
                hd = " · ".join(p for p in parts if p)
                if main_loc:
                    hd = f"{hd} — {main_loc}" if hd else main_loc
                story.append(rl.Paragraph(_esc(hd), styles["h3"]))
                blk: list[Any] = []
                for slot_name, slot_emoji in (
                    ("breakfast", "🥐"),
                    ("lunch", "🥗"),
                    ("dinner", "🍽"),
                ):
                    slot = day.get(slot_name)
                    if isinstance(slot, dict):
                        nm = slot.get("name") or slot.get("text") or ""
                        why = slot.get("why") or ""
                        blk.append(rl.Paragraph(
                            f"{slot_emoji} <b>{slot_name.upper()}</b>",
                            styles["label"],
                        ))
                        if nm:
                            blk.append(rl.Paragraph(_esc(nm), styles["body"]))
                        if why:
                            blk.append(rl.Paragraph(_esc(why), styles["muted"]))
                sights = day.get("sights")
                if isinstance(sights, list) and sights:
                    blk.append(rl.Paragraph("📍 <b>SIGHTS</b>", styles["label"]))
                    for s in sights:
                        if isinstance(s, dict):
                            nm = s.get("name") or s.get("text") or ""
                            blk.append(rl.Paragraph(f"• {_esc(nm)}", styles["body"]))
                        elif isinstance(s, str):
                            blk.append(rl.Paragraph(f"• {_esc(s)}", styles["body"]))
                blk.append(rl.Spacer(1, 0.3 * rl.cm))
                story.append(rl.KeepTogether(blk))

    # ── TO-DOs ──
    todos = _safe_json(trip_row.get("checklist_json"), [])
    if opt("includeTodos") and todos:
        story.append(rl.PageBreak())
        story.append(rl.Paragraph("To-do list", styles["h2"]))
        story.append(_hr(rl, color=_BRAND_BLUE))
        # Group by category if items have one; else flat list.
        by_cat: dict[str, list[dict]] = {}
        for t in todos:
            if not isinstance(t, dict):
                continue
            cat = t.get("category") or "General"
            by_cat.setdefault(cat, []).append(t)
        for cat, items in by_cat.items():
            story.append(rl.Paragraph(_esc(cat), styles["h3"]))
            for it in items:
                done = bool(it.get("completed") or it.get("done"))
                marker = "☑" if done else "☐"
                body = it.get("text") or it.get("name") or ""
                style = styles["muted"] if done else styles["body"]
                story.append(
                    rl.Paragraph(f"{marker}  {_esc(body)}", style)
                )

    # ── BUDGETS ──
    budgets = trip_row.get("budgets") or []
    if opt("includeBudgets") and budgets:
        story.append(rl.PageBreak())
        story.append(rl.Paragraph("Budgets", styles["h2"]))
        story.append(_hr(rl, color=_BRAND_GREEN))
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
        story.append(rl.Spacer(1, 0.6 * rl.cm))
        story.append(rl.Paragraph("Companions", styles["h2"]))
        story.append(_hr(rl, color=_BRAND_PURPLE))
        for c in companions:
            if isinstance(c, dict):
                nm = c.get("name") or ""
                story.append(rl.Paragraph(f"• {_esc(nm)}", styles["body"]))

    # ── MARKED PLACES ──
    if opt("includeMarkedPlaces") and marked_places:
        story.append(rl.Spacer(1, 0.6 * rl.cm))
        story.append(rl.Paragraph("Marked places", styles["h2"]))
        story.append(_hr(rl, color=_BRAND_BLUE))
        for p in marked_places:
            if not isinstance(p, dict):
                continue
            nm = p.get("name") or ""
            addr = p.get("address") or p.get("vicinity") or ""
            story.append(rl.Paragraph(_esc(nm), styles["body"]))
            if addr:
                story.append(rl.Paragraph(_esc(addr), styles["muted"]))

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
