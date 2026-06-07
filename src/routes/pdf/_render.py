"""PDF export — reportlab building blocks (the "view" layer).

Behaviour-preserving extract of everything that turns trip data into
reportlab flowables: the lazy reportlab import (``_rl``), the paragraph
style sheet (``_styles``), the brand palette, text helpers (``_esc`` /
``_hr``), the AI-slot parser, the image-aspect reader, the photo grid,
and every section builder (cover stats, TOC rows, companions, expenses,
settle-up, day cards, marked-place helpers).

These functions take ``rl`` (the reportlab namespace) + ``styles`` as
explicit arguments, so they hold no reportlab module state of their own.
Re-exported into ``routes.pdf`` so ``_build_trip_pdf`` can call them by
their original bare names.

``_strip_emoji`` lives in ``_fonts`` (it reads the live ``_UNICODE_FONT``
registration global) and is imported here for ``_esc`` / ``_parse_day_slot``.
"""

from __future__ import annotations

import io
import json
from typing import Any

from observability import get_logger

logger = get_logger(__name__)

from ._fonts import _font, _strip_emoji  # noqa: F401  (_strip_emoji re-exported)
from ._i18n import _T  # noqa: F401  (type hints reference "_T")

# ── brand palette (kept close to the web --accent-* variables) ──
_BRAND_NAVY = "#001a33"
_BRAND_BLUE = "#0071e3"
_BRAND_PURPLE = "#9b59b6"
_BRAND_GREEN = "#34c759"
_TEXT_PRIMARY = "#1d1d1f"
_TEXT_SECONDARY = "#6b7280"
_RULE_GREY = "#e5e7eb"


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
            fontName=_font(bold=True),
            fontSize=48,
            leading=52,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=12,
        ),
        "heroSub": rl.ParagraphStyle(
            "GGHeroSub",
            parent=base["BodyText"],
            fontName=_font(),
            fontSize=14,
            leading=20,
            textColor=_TEXT_SECONDARY,
            spaceBefore=0,
            spaceAfter=4,
        ),
        "kicker": rl.ParagraphStyle(
            "GGKicker",
            parent=base["BodyText"],
            fontName=_font(bold=True),
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
            fontName=_font(bold=True),
            fontSize=36,
            leading=40,
            textColor=_BRAND_BLUE,
            spaceBefore=0,
            spaceAfter=2,
        ),
        "sectionTitle": rl.ParagraphStyle(
            "GGSectionTitle",
            parent=base["BodyText"],
            fontName=_font(bold=True),
            fontSize=24,
            leading=28,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=6,
        ),
        "sectionKicker": rl.ParagraphStyle(
            "GGSectionKicker",
            parent=base["BodyText"],
            fontName=_font(),
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
            fontName=_font(bold=True),
            fontSize=9,
            leading=11,
            textColor=_BRAND_BLUE,
            spaceBefore=0,
            spaceAfter=2,
        ),
        "dayTitle": rl.ParagraphStyle(
            "GGDayTitle",
            parent=base["BodyText"],
            fontName=_font(bold=True),
            fontSize=18,
            leading=21,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=6,
        ),
        "slotLabel": rl.ParagraphStyle(
            "GGSlotLabel",
            parent=base["BodyText"],
            fontName=_font(bold=True),
            fontSize=8.5,
            leading=11,
            textColor=_BRAND_PURPLE,
            spaceBefore=6,
            spaceAfter=2,
        ),
        # Item title inside a parsed slot (the restaurant / sight
        # name pulled out of the AI-generated content). Bold mid-size,
        # navy — sits between the slot LABEL and the body prose.
        "slotItemTitle": rl.ParagraphStyle(
            "GGSlotItemTitle",
            parent=base["BodyText"],
            fontName=_font(bold=True),
            fontSize=12,
            leading=15,
            textColor=_BRAND_NAVY,
            spaceBefore=4,
            spaceAfter=2,
        ),

        # ── Body copy ────────────────────────────────────────────
        "body": rl.ParagraphStyle(
            "GGBody",
            parent=base["BodyText"],
            fontName=_font(),
            fontSize=10.5,
            leading=15,
            textColor=_TEXT_PRIMARY,
            spaceBefore=0,
            spaceAfter=4,
        ),
        "muted": rl.ParagraphStyle(
            "GGMuted",
            parent=base["BodyText"],
            fontName=_font(),
            fontSize=9.5,
            leading=13,
            textColor=_TEXT_SECONDARY,
            spaceBefore=0,
            spaceAfter=2,
        ),
        "tip": rl.ParagraphStyle(
            "GGTip",
            parent=base["BodyText"],
            fontName=_font(oblique=True),
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
            fontName=_font(bold=True),
            fontSize=24,
            leading=26,
            textColor=_BRAND_NAVY,
            alignment=1,
        ),
        "statLabel": rl.ParagraphStyle(
            "GGStatLabel",
            parent=base["BodyText"],
            fontName=_font(bold=True),
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
            fontName=_font(bold=True),
            fontSize=10,
            leading=14,
            textColor=_BRAND_NAVY,
            spaceBefore=0,
            spaceAfter=0,
        ),
        "tocItemSub": rl.ParagraphStyle(
            "GGTocItemSub",
            parent=base["BodyText"],
            fontName=_font(),
            fontSize=8.5,
            leading=11,
            textColor=_TEXT_SECONDARY,
            spaceBefore=0,
            spaceAfter=0,
        ),
    }


_WHY_RE = None  # lazily-compiled regex set inside _parse_day_slot
_FACT_RE = None


def _parse_day_slot(raw: str) -> list[dict] | None:
    """Parse a free-text day slot ("morning" / "afternoon" / "evening")
    into structured items when the content follows the standard AI-
    generated format. Returns None if the text doesn't look structured
    — the caller should fall back to plain paragraph rendering.

    AI format (Gemini's output for itinerary slots):

        Breakfast:
        - A Merenda
        Why: Start your golf morning with traditional pastries...
        Fun fact: This spot is famous for its 'Dom Rodrigo'...

    Multi-item slots (sightseeing) use `-` separators on one line:

        Sightseeing: - Castle X Why: ... Fun fact: ... - Castle Y Why: ... Fun fact: ...

    Each parsed item is a dict { name, why, fact }. We detect the
    format by the presence of "Why:" — plain user notes without that
    marker get None back so we don't garble them."""
    import re
    global _WHY_RE, _FACT_RE
    if _WHY_RE is None:
        _WHY_RE = re.compile(r"\bWhy\s*:\s*", re.IGNORECASE)
        _FACT_RE = re.compile(r"\bFun\s+fact\s*:\s*", re.IGNORECASE)
    if not raw or not _WHY_RE.search(raw):
        return None

    text = _strip_emoji(raw).strip()
    # Strip leading slot label ("Breakfast:" / "Sightseeing:" /
    # "Lunch:" etc.) — case-insensitive, only if it's the FIRST
    # word followed by a colon. Emoji are already gone (via
    # _strip_emoji above) so the regex anchors on a real letter.
    text = re.sub(r"^[A-Za-zÀ-ÿ]+\s*:\s*", "", text, count=1)

    # Split on " - " or "\n- " at item boundaries. The pattern
    # matches a hyphen-bullet preceded by whitespace OR a newline.
    # Also handle the case where the text STARTS with "- " (no
    # preceding whitespace) by stripping that leading bullet
    # before the split.
    text = re.sub(r"^-\s+", "", text)
    parts = re.split(r"(?:\n|\s+)-\s+", text)
    # Strip any "- " that survived (defensive — happens when the
    # regex didn't catch every boundary on the first pass).
    parts = [re.sub(r"^-\s+", "", p).strip() for p in parts if p.strip()]
    if not parts:
        return None

    items: list[dict] = []
    for part in parts:
        why_m = _WHY_RE.search(part)
        fact_m = _FACT_RE.search(part)
        if why_m and fact_m and fact_m.start() > why_m.end():
            name = part[: why_m.start()].strip().rstrip(":.,")
            why = part[why_m.end() : fact_m.start()].strip().rstrip(".")
            fact = part[fact_m.end() :].strip().rstrip(".")
        elif why_m:
            name = part[: why_m.start()].strip().rstrip(":.,")
            why = part[why_m.end() :].strip()
            fact = ""
            if fact_m:  # appears before "Why:" — unusual but handle it
                fact = part[fact_m.end() : why_m.start()].strip().rstrip(".")
        else:
            name = part.strip()
            why = ""
            fact = ""
        if name:
            items.append({"name": name, "why": why, "fact": fact})
    return items if items else None


def _image_aspect(png_bytes: bytes) -> float:
    """Read the actual width/height ratio of a PNG. Used to size
    map images in the PDF without distortion: Google Static Maps
    sometimes returns a slightly different aspect than what `size=`
    requests (e.g., when the requested coords are near the poles or
    a small marker cluster auto-bounds the view). Hard-coding the
    aspect from the request params then stretching the image
    causes visible distortion. Reading the actual aspect here
    eliminates the guesswork.

    Uses PIL (already a reportlab dep, no new install). Returns 2.0
    as a fallback if the bytes can't be parsed — same as the prior
    "assume 2:1" default."""
    try:
        from PIL import Image as _PILImage
        with _PILImage.open(io.BytesIO(png_bytes)) as im:
            w, h = im.size
            if h > 0:
                return w / h
    except Exception:
        pass
    return 2.0


def _photo_grid(rl, photos: list[bytes], full_w: float, cols: int = 3):
    """Lay validated photo PNGs out in a `cols`-wide grid of equal-size
    cells. Each cell crops the image to a fixed square-ish thumbnail via
    reportlab's Image (sized to the cell width, aspect preserved). The
    grid is a MULTI-ROW table, so it paginates naturally (unlike the old
    single-cell day card). Returns None if there are no decodable
    photos."""
    if not photos:
        return None
    gap = 6
    cell_w = (full_w - gap * (cols - 1)) / cols
    # Build cells; each is an Image sized to the cell width.
    cells: list[Any] = []
    for png in photos:
        try:
            aspect = _image_aspect(png) or 1.0
            h = cell_w / aspect if aspect else cell_w
            # Clamp very tall/short thumbs so the grid rows stay tidy.
            h = max(cell_w * 0.6, min(h, cell_w * 1.4))
            cells.append(rl.Image(io.BytesIO(png), width=cell_w, height=h))
        except Exception:
            cells.append("")
    # Pad to a full last row.
    while len(cells) % cols != 0:
        cells.append("")
    # Assemble rows with gap spacer columns.
    rows: list[list[Any]] = []
    col_widths: list[float] = []
    for i in range(0, len(cells), cols):
        row: list[Any] = []
        for j in range(cols):
            if j > 0:
                row.append("")
            row.append(cells[i + j])
        rows.append(row)
    for j in range(cols):
        if j > 0:
            col_widths.append(gap)
        col_widths.append(cell_w)
    grid = rl.Table(rows, colWidths=col_widths)
    grid.setStyle(rl.TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), gap / 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), gap / 2),
    ]))
    return grid


def _esc(text: Any) -> str:
    """Escape a value for reportlab's Paragraph (uses a subset of
    HTML — `<`, `>`, `&` are special). Strip emoji first since the
    builtin Helvetica falls back to squares. None → empty string."""
    if text is None:
        return ""
    s = _strip_emoji(str(text))
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


def _companion_card(rl, styles, page_w, margin_lr, name: str, role: str = "", chip_w: float | None = None, tr: "_T | None" = None):
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
            fontName=_font(bold=True),
            fontSize=15,
            leading=18,
            alignment=1,
            textColor=rl.colors.white,
        ),
    )
    _untitled = tr("untitled_companion") if tr is not None else "Untitled companion"
    info_flowables: list[Any] = [
        rl.Paragraph(_esc(name) or _untitled, styles["dayTitle"]),
    ]
    if role:
        info_flowables.append(rl.Paragraph(_esc(role), styles["muted"]))

    # Explicit colWidths — `None` for auto-sizing breaks when the
    # chip is nested inside the grid's outer table (reportlab's
    # nested-table layout can't always resolve "auto" widths and
    # raises). Caller passes the chip's target width.
    avatar_w = 1.4 * rl.cm
    fallback_chip_w = (page_w - 2 * margin_lr - 10) / 2
    info_w = (chip_w if chip_w is not None else fallback_chip_w) - avatar_w
    chip = rl.Table(
        [[avatar_para, info_flowables]],
        colWidths=[avatar_w, info_w],
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


def _companion_grid(rl, styles, page_w, margin_lr, companions: list, tr: "_T | None" = None):
    """Pack companions into a grid of chips.

    Layout rules:
      ≤ 2 companions → one full-width chip per row (a single
        avatar sat in a half-page chip looks lonely — full-width
        gives it presence).
      ≥ 3 companions → 2 chips per row; odd counts leave the
        last row's right cell blank to keep the grid rectangular.
    """
    if not companions:
        return rl.Spacer(1, 0)

    full_width = page_w - 2 * margin_lr
    gap = 10
    col_w = (full_width - gap) / 2
    use_single_col = len(companions) <= 2
    chip_w = full_width if use_single_col else col_w

    chips: list[Any] = []
    for c in companions:
        if isinstance(c, dict):
            nm = c.get("name") or ""
            role = c.get("role") or ""
            chips.append(_companion_card(rl, styles, page_w, margin_lr, nm, role, chip_w=chip_w, tr=tr))
        elif isinstance(c, str):
            chips.append(_companion_card(rl, styles, page_w, margin_lr, c, chip_w=chip_w, tr=tr))

    if use_single_col:
        rows = [[chip] for chip in chips]
        grid = rl.Table(rows, colWidths=[full_width])
    else:
        rows = []
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


def _expenses_section(rl, styles, page_w, margin_lr, expenses: list, tr: "_T",
                      total_spend_eur: float | None):
    """PDF-2: itemised expenses as a paginating multi-row table.

    Columns: Date · Description · Category · Amount (original currency) ·
    EUR. Rows are sorted by date then grouped under a date sub-header.
    Settlement rows (is_settlement=1) are excluded from the spend list —
    they belong to the Settle-up section, not "what we spent". A
    per-currency subtotal block + an EUR grand total close the section.
    A normal Table splits across pages, so a 200-row trip paginates."""
    flow: list[Any] = []

    def _key(e):
        return str(e.get("date") or "")
    rows_data = [e for e in expenses if isinstance(e, dict)
                 and not int(e.get("is_settlement") or 0)]
    rows_data.sort(key=_key)

    if not rows_data:
        flow.append(rl.Paragraph(f"<i>{_esc(tr('exp_no_label'))}</i>", styles["muted"]))
        return flow

    header = [
        tr("col_date"), tr("col_description"), tr("col_category"),
        tr("col_amount"), tr("col_eur"),
    ]
    table_rows: list[list[Any]] = [[
        rl.Paragraph(f"<b>{_esc(h)}</b>", styles["muted"]) for h in header
    ]]
    per_currency: dict[str, float] = {}
    total_eur = 0.0
    for e in rows_data:
        cur = (e.get("currency") or "EUR").upper()
        val = e.get("value")
        ev = e.get("euro_value")
        try:
            ev_f = float(ev) if ev is not None else 0.0
        except (TypeError, ValueError):
            ev_f = 0.0
        total_eur += ev_f
        try:
            val_f = float(val) if val is not None else 0.0
        except (TypeError, ValueError):
            val_f = 0.0
        per_currency[cur] = per_currency.get(cur, 0.0) + val_f
        label = e.get("label") or tr("exp_no_label")
        # BUG-049: prefer the route-resolved human name (category_name) over the
        # opaque category_id UUID. Falls back to the raw id / legacy slug.
        cat = e.get("category_name") or e.get("category_id") or e.get("category") or tr("exp_uncategorised")
        table_rows.append([
            rl.Paragraph(_esc(tr.date(e.get("date"))), styles["muted"]),
            rl.Paragraph(_esc(label), styles["body"]),
            rl.Paragraph(_esc(str(cat)), styles["muted"]),
            rl.Paragraph(_esc(tr.money(cur, val_f)), styles["muted"]),
            rl.Paragraph(_esc(tr.money("EUR", ev_f)), styles["muted"]),
        ])

    avail = page_w - 2 * margin_lr
    col_w = [avail * 0.16, avail * 0.34, avail * 0.20, avail * 0.16, avail * 0.14]
    table = rl.Table(table_rows, colWidths=col_w, repeatRows=1)
    table.setStyle(rl.TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), rl.colors.HexColor("#f4f4f5")),
        ("LINEBELOW", (0, 0), (-1, 0), 1, rl.colors.HexColor(_RULE_GREY)),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [rl.colors.white, rl.colors.HexColor("#fafafa")]),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    flow.append(table)
    flow.append(rl.Spacer(1, 0.4 * rl.cm))

    # Per-currency subtotals (in each currency's ORIGINAL units) + the
    # EUR grand total.
    flow.append(rl.Paragraph(tr("exp_subtotals"), styles["slotLabel"]))
    sub_rows: list[list[Any]] = []
    for cur in sorted(per_currency):
        sub_rows.append([
            rl.Paragraph(_esc(cur), styles["body"]),
            rl.Paragraph(_esc(tr.money(cur, per_currency[cur])), styles["body"]),
        ])
    eur_total_val = total_eur if total_spend_eur is None else float(total_spend_eur)
    sub_rows.append([
        rl.Paragraph(f"<b>{_esc(tr('exp_total_eur'))}</b>", styles["body"]),
        rl.Paragraph(f"<b>{_esc(tr.money('EUR', eur_total_val))}</b>", styles["body"]),
    ])
    sub_table = rl.Table(sub_rows, colWidths=[avail * 0.6, avail * 0.4])
    sub_table.setStyle(rl.TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, rl.colors.HexColor(_RULE_GREY)),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(sub_table)
    return flow


def _resolve_settle_party(nm, bal: dict) -> str:
    """Match a settlement's snapshot name to an existing balance key (BUG-050).

    Settlements snapshot `from_name`/`to_name` as users.name (the FULL display
    name, e.g. "Alice Smith"), but the PDF roster keys on first-name tokens
    (companions + each expense's `who`, e.g. "Alice"). Exact-match-only seeding
    therefore created a PHANTOM full-name person and left the real first-name
    debt outstanding — the PDF then overstated debt vs the in-app Settle-up
    screen. Try the full name, then its first whitespace token, before falling
    back to the full name (mirrors resolveSettlementParties in balances.ts)."""
    nm = (nm or "").strip()
    if not nm or nm in bal:
        return nm
    parts = nm.split()
    first = parts[0] if parts else nm
    return first if first in bal else nm


def _settle_section(rl, styles, page_w, margin_lr, expenses: list,
                    settlements: list, companions: list, tr: "_T"):
    """PDF-3: per-currency net balances + suggested transfers + the list
    of recorded settlements.

    Mirrors balances.ts: per-currency balances are built from each
    expense's ORIGINAL `value` + `splits` (no FX conversion so a no-rate
    currency stays in its own units). The payer is credited the full
    amount; each split-share name is debited their portion (denominator =
    actual sum of split %s, matching the app's normalisation). When an
    expense has no splits, the cost is shared equally across the roster
    (companions ∪ expense-attributed names). Recorded settlements — both
    legacy is_settlement expense rows AND settlements-table rows — then
    shift the balances (payer +amount, receiver -amount). Finally the
    greedy minimal-transfers list is emitted, plus the raw recorded
    settlement rows for an audit trail."""
    flow: list[Any] = []

    # Roster = companion names ∪ names referenced by expenses (who / split
    # keys) so a removed companion's expenses still balance.
    roster: list[str] = []
    seen_names: set[str] = set()

    def _add_name(nm):
        nm = (nm or "").strip()
        if nm and nm not in seen_names:
            seen_names.add(nm)
            roster.append(nm)

    for c in companions:
        if isinstance(c, dict):
            _add_name(c.get("name"))
        elif isinstance(c, str):
            _add_name(c)
    for e in expenses:
        if not isinstance(e, dict):
            continue
        _add_name(e.get("who"))
        sp = _safe_json(e.get("splits"), {})
        if isinstance(sp, dict):
            for k in sp:
                _add_name(k)

    by_currency: dict[str, dict[str, float]] = {}

    def _bal(cur: str) -> dict[str, float]:
        cur = (cur or "EUR").upper()
        if cur not in by_currency:
            by_currency[cur] = {p: 0.0 for p in roster}
        return by_currency[cur]

    # Expenses (exclude settlement rows here — they're applied below).
    for e in expenses:
        if not isinstance(e, dict) or int(e.get("is_settlement") or 0):
            continue
        cur = (e.get("currency") or "EUR").upper()
        try:
            amount = float(e.get("value") or 0)
        except (TypeError, ValueError):
            amount = 0.0
        if amount <= 0:
            continue
        bal = _bal(cur)
        who = (e.get("who") or "").strip()
        if who and who in bal:
            bal[who] += amount
        splits = _safe_json(e.get("splits"), {})
        if isinstance(splits, dict) and splits:
            denom = sum(float(v or 0) for v in splits.values()) or 100.0
            for person, pct in splits.items():
                person = (person or "").strip()
                if person in bal:
                    bal[person] -= amount * (float(pct or 0) / denom)
        else:
            share = amount / max(len(roster), 1)
            for p in roster:
                bal[p] -= share

    # Apply recorded settlements: (1) legacy is_settlement expense rows,
    # (2) settlements-table rows. Both shift payer +amt / receiver -amt.
    recorded: list[tuple[str, str, str, float]] = []  # (from, to, cur, amt)
    for e in expenses:
        if not isinstance(e, dict) or not int(e.get("is_settlement") or 0):
            continue
        # Legacy settlement expense: `who` paid; splits (if any) name the
        # receiver. Treat as payer credit only when we can resolve names.
        cur = (e.get("currency") or "EUR").upper()
        try:
            amt = float(e.get("value") or 0)
        except (TypeError, ValueError):
            amt = 0.0
        who = (e.get("who") or "").strip()
        if amt > 0 and who:
            bal = _bal(cur)
            if who in bal:
                bal[who] += amt
            splits = _safe_json(e.get("splits"), {})
            recv = ""
            if isinstance(splits, dict) and splits:
                recv = next(iter(splits)).strip()
                if recv in bal:
                    bal[recv] -= amt
            recorded.append((who, recv or "—", cur, amt))
    for s in settlements:
        if not isinstance(s, dict):
            continue
        cur = (s.get("currency") or "EUR").upper()
        try:
            amt = float(s.get("amount") or 0)
        except (TypeError, ValueError):
            amt = 0.0
        if amt <= 0:
            continue
        bal = _bal(cur)
        # BUG-050: resolve the full-name snapshot to an existing first-name
        # roster key before seeding, so an owner-involved settlement folds into
        # the real balance instead of spawning a phantom full-name person.
        frm = _resolve_settle_party(s.get("from_name"), bal)
        to = _resolve_settle_party(s.get("to_name"), bal)
        if frm:
            if frm not in bal:
                bal[frm] = 0.0
            bal[frm] += amt
        if to:
            if to not in bal:
                bal[to] = 0.0
            bal[to] -= amt
        recorded.append((frm or "—", to or "—", cur, amt))

    # Render net balances + suggested transfers per currency.
    any_balance = False
    for cur in sorted(by_currency):
        bal = by_currency[cur]
        # Skip currencies where everyone nets to ~0.
        if all(abs(v) < 0.01 for v in bal.values()):
            continue
        any_balance = True
        flow.append(rl.Paragraph(f"{tr('settle_balances')} · {_esc(cur)}", styles["slotLabel"]))
        bal_rows: list[list[Any]] = []
        for person in sorted(bal, key=lambda p: -bal[p]):
            v = bal[person]
            if abs(v) < 0.01:
                continue
            tag = tr("settle_is_owed") if v > 0 else tr("settle_owes")
            bal_rows.append([
                rl.Paragraph(_esc(person), styles["body"]),
                rl.Paragraph(
                    f"{_esc(tag)} {_esc(tr.money(cur, abs(v)))}", styles["muted"]
                ),
            ])
        if bal_rows:
            avail = page_w - 2 * margin_lr
            bt = rl.Table(bal_rows, colWidths=[avail * 0.4, avail * 0.6])
            bt.setStyle(rl.TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            flow.append(bt)
        # Suggested minimal transfers.
        transfers = _simplify_debts(bal)
        if transfers:
            flow.append(rl.Spacer(1, 0.15 * rl.cm))
            flow.append(rl.Paragraph(tr("settle_transfers"), styles["dayKicker"]))
            for frm, to, amt in transfers:
                flow.append(rl.Paragraph(
                    f"{_esc(frm)} → {_esc(to)}: <b>{_esc(tr.money(cur, amt))}</b>",
                    styles["body"],
                ))
        flow.append(rl.Spacer(1, 0.35 * rl.cm))

    if not any_balance:
        flow.append(rl.Paragraph(f"<i>{_esc(tr('settle_all_square'))}</i>", styles["muted"]))

    # Recorded settlements list (audit trail).
    if recorded:
        flow.append(rl.Spacer(1, 0.2 * rl.cm))
        flow.append(rl.Paragraph(tr("settle_recorded"), styles["slotLabel"]))
        for frm, to, cur, amt in recorded:
            flow.append(rl.Paragraph(
                f"{_esc(frm)} {_esc(tr('settle_paid'))} {_esc(to)} — "
                f"{_esc(tr.money(cur, amt))}",
                styles["muted"],
            ))
    return flow


def _simplify_debts(balances: dict[str, float]) -> list[tuple[str, str, float]]:
    """Greedy minimal-payments list — pair largest debtor with largest
    creditor, settle the smaller, repeat. Mirrors balances.ts's
    simplifyDebts (1-cent epsilon). Returns (from, to, amount) tuples."""
    eps = 0.01
    creditors = sorted(
        ((p, v) for p, v in balances.items() if v > eps),
        key=lambda x: -x[1],
    )
    debtors = sorted(
        ((p, -v) for p, v in balances.items() if v < -eps),
        key=lambda x: -x[1],
    )
    creditors = [list(c) for c in creditors]
    debtors = [list(d) for d in debtors]
    out: list[tuple[str, str, float]] = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        d_name, d_amt = debtors[i]
        c_name, c_amt = creditors[j]
        pay = min(d_amt, c_amt)
        out.append((d_name, c_name, round(pay, 2)))
        debtors[i][1] -= pay
        creditors[j][1] -= pay
        if debtors[i][1] < eps:
            i += 1
        if creditors[j][1] < eps:
            j += 1
    return out


def _day_card(rl, styles, page_w, margin_lr, day: dict, day_map_png: bytes | None,
              tr: "_T", day_photos: list[bytes] | None = None):
    """Render one day as a flat list of flowables (PDF-1 fix).

    PRE-MK4 this wrapped the entire day in a SINGLE-CELL `Table([[inner]])`
    to draw a card background. Reportlab cannot split one oversized table
    cell across pages, so a single ~800-word journal day raised a
    LayoutError that bubbled up and 500'd the WHOLE export — every other
    day, the cover, budgets, everything lost. The audit proved multi-row
    tables DO split but a single giant cell does not.

    FIX: the day header (blue badge + date + title) is a small bounded
    Table that always fits, kept-with-next via `KeepTogether`. The BODY
    paragraphs (slots / notes / tip) are emitted as TOP-LEVEL flowables
    so reportlab paginates them naturally — a verbose journaler's day now
    flows across as many pages as it needs instead of crashing. The whole
    list is wrapped in a final `KeepTogether` by the caller's helper so a
    SHORT day still stays together on one page (KeepTogether falls back
    to natural flow for the rare day that exceeds a page).

    `tr` is the locale translator (PDF-5). `day_photos` is an optional
    list of validated PNG/JPEG bytes to lay out in a thumbnail grid
    after the day's plan (PDF-4)."""
    day_number = day.get("day_number")
    day_date = tr.date(day.get("date"))
    day_name = (day.get("name") or "").strip()

    # Header strip — badge + date kicker + day title
    badge_label = ""
    if day_number is not None and day_number != "":
        try:
            badge_label = str(int(day_number))
        except (TypeError, ValueError):
            badge_label = str(day_number)
    kicker_text = day_date.upper() if day_date else ""
    name_text = day_name or ""

    header_right_flowables: list[Any] = []
    if kicker_text:
        header_right_flowables.append(
            rl.Paragraph(_esc(kicker_text), styles["dayKicker"])
        )
    header_right_flowables.append(
        rl.Paragraph(_esc(name_text or f"{tr('day')} {badge_label}"), styles["dayTitle"])
    )

    # Day number badge — solid blue tile with the number in white.
    # Same visual language as the marked-places A/B/C letter badge.
    badge_para = rl.Paragraph(
        f'<para alignment="center"><font color="white" size="22"><b>{_esc(badge_label or "•")}</b></font></para>',
        rl.ParagraphStyle("GGDayBadge", fontName=_font(bold=True),
                          fontSize=22, leading=24, alignment=1,
                          textColor=rl.colors.white),
    )
    # Header is now a TOP-LEVEL flowable (not nested in an outer card
    # cell), so it spans the full content width. The blue badge cell +
    # title cell are a 2-col table that is always short enough to fit on
    # a page — the part that used to overflow (the body) is no longer
    # inside this table.
    full_w = page_w - 2 * margin_lr
    badge_w = 1.5 * rl.cm
    header_row = rl.Table(
        [[badge_para, header_right_flowables]],
        colWidths=[badge_w, full_w - badge_w],
    )
    header_row.setStyle(rl.TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), rl.colors.HexColor(_BRAND_BLUE)),
        ("BACKGROUND", (1, 0), (1, 0), rl.colors.HexColor("#fafbff")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("LEFTPADDING", (0, 0), (0, 0), 0),
        ("RIGHTPADDING", (0, 0), (0, 0), 0),
        ("TOPPADDING", (0, 0), (0, 0), 14),
        ("BOTTOMPADDING", (0, 0), (0, 0), 14),
        ("LEFTPADDING", (1, 0), (1, 0), 14),
        ("RIGHTPADDING", (1, 0), (1, 0), 8),
        ("TOPPADDING", (1, 0), (1, 0), 6),
        ("BOTTOMPADDING", (1, 0), (1, 0), 6),
        ("BOX", (0, 0), (-1, -1), 0.4, rl.colors.HexColor(_RULE_GREY)),
    ]))

    # `header_block` = header kept with the first body element so a day's
    # title is never orphaned at the bottom of a page. `body` = the rest,
    # emitted as flat flowables that paginate freely.
    body: list[Any] = []

    if day_map_png:
        try:
            # Source PNG: size=800x320 → 2.5:1 aspect. Direct sizing so
            # the map fills the content width.
            day_aspect = _image_aspect(day_map_png)
            body.append(
                rl.Image(
                    io.BytesIO(day_map_png),
                    width=full_w,
                    height=full_w / day_aspect,
                )
            )
            body.append(rl.Spacer(1, 0.25 * rl.cm))
        except Exception:
            # R12-B1: reportlab silently refuses bad image bytes; log
            # so a corrupt day-map render (Static-Maps glitch / Pillow
            # decode failure) surfaces in Sentry instead of producing a
            # PDF with a missing map and zero trace.
            logger.warning("PDF day-map image render failed", exc_info=True)

    any_slot = False
    for slot_name, slot_label in (
        ("morning", tr("slot_morning")),
        ("afternoon", tr("slot_afternoon")),
        ("evening", tr("slot_evening")),
    ):
        val = day.get(slot_name)
        if not (isinstance(val, str) and val.strip()):
            continue
        any_slot = True
        body.append(rl.Paragraph(slot_label, styles["slotLabel"]))
        # Try the AI-format parser first. If it pulls out structured
        # items (name / why / fact), render each as its own editorial
        # block — bold name, body "why" prose, italic muted "fact"
        # with a ★ glyph. Plain user notes (no "Why:" marker) fall
        # back to single-paragraph rendering so we don't garble them.
        items = _parse_day_slot(val)
        if items:
            for it in items:
                body.append(rl.Paragraph(
                    _esc(it["name"]), styles["slotItemTitle"],
                ))
                if it["why"]:
                    body.append(rl.Paragraph(
                        _esc(it["why"]), styles["body"],
                    ))
                if it["fact"]:
                    body.append(rl.Paragraph(
                        f'<font color="{_BRAND_BLUE}"><b>★</b></font>'
                        f'  <i>{_esc(it["fact"])}</i>',
                        styles["muted"],
                    ))
                body.append(rl.Spacer(1, 0.15 * rl.cm))
        else:
            body_text = _esc(val).replace("\n", "<br/>")
            body.append(rl.Paragraph(body_text, styles["body"]))

    notes = day.get("notes")
    if isinstance(notes, str) and notes.strip():
        body.append(rl.Paragraph(tr("slot_notes"), styles["slotLabel"]))
        items = _parse_day_slot(notes)
        if items:
            for it in items:
                body.append(rl.Paragraph(
                    _esc(it["name"]), styles["slotItemTitle"],
                ))
                if it["why"]:
                    body.append(rl.Paragraph(
                        _esc(it["why"]), styles["body"],
                    ))
                if it["fact"]:
                    body.append(rl.Paragraph(
                        f'<font color="{_BRAND_BLUE}"><b>★</b></font>'
                        f'  <i>{_esc(it["fact"])}</i>',
                        styles["muted"],
                    ))
                body.append(rl.Spacer(1, 0.15 * rl.cm))
        else:
            body.append(
                rl.Paragraph(_esc(notes).replace("\n", "<br/>"), styles["body"])
            )
        any_slot = True

    tip = day.get("tip")
    if isinstance(tip, str) and tip.strip():
        body.append(
            rl.Paragraph(f"<b>{tr('slot_tip')}</b>  {_esc(tip)}", styles["tip"])
        )
        any_slot = True

    # PDF-4: per-day photo thumbnails laid out in a grid, after the plan.
    if day_photos:
        grid = _photo_grid(rl, day_photos, full_w, cols=3)
        if grid is not None:
            body.append(rl.Spacer(1, 0.2 * rl.cm))
            body.append(grid)

    if not any_slot and not day_photos:
        body.append(
            rl.Paragraph(f"<i>{_esc(tr('no_plan'))}</i>", styles["muted"])
        )

    # PDF-1: header kept with the FIRST body flowable (so a title never
    # orphans), then the remaining body flows as independent top-level
    # flowables that paginate across pages. We DON'T wrap the body in a
    # single Table cell anymore — that was the un-splittable atom that
    # crashed long-journal days.
    flowables: list[Any] = []
    if body:
        flowables.append(rl.KeepTogether([
            header_row,
            rl.Spacer(1, 0.3 * rl.cm),
            body[0],
        ]))
        flowables.extend(body[1:])
    else:
        flowables.append(header_row)
    flowables.append(rl.Spacer(1, 0.45 * rl.cm))
    return flowables


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
    row is: tinted accent bar | number | title + description.
    Number column is wide enough for "01" / "02" on one line +
    its padding — previous 0.8cm was just shy of fitting the
    bold 9pt digits with 8pt left padding, so it wrapped to two
    lines ("0" over "1") in the output."""
    t = rl.Table(
        [[
            "",
            rl.Paragraph(
                f'<b><font color="{color}" size="13">{_esc(number)}</font></b>',
                styles["body"],
            ),
            [
                rl.Paragraph(_esc(title), styles["tocItem"]),
                rl.Paragraph(_esc(sub), styles["tocItemSub"]),
            ],
        ]],
        colWidths=[
            0.20 * rl.cm,
            1.6 * rl.cm,
            page_w - 2 * margin_lr - 1.8 * rl.cm,
        ],
    )
    t.setStyle(rl.TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), rl.colors.HexColor(color)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (1, 0), (1, -1), 10),
    ]))
    return t


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
