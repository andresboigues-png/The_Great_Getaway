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
import os  # noqa: F401  (re-exported helpers reference os at call time)
from datetime import datetime  # noqa: F401
from typing import Any

import requests  # noqa: F401  (kept importable for parity with the legacy module)
from flask import Blueprint, jsonify, request, send_file

from auth import current_user_id, require_auth
from database import get_db
from observability import get_logger

logger = get_logger(__name__)
from extensions import limiter
from helpers import json_body, trip_member_role  # noqa: F401

bp = Blueprint("pdf", __name__)

# ── Decomposed into sibling private modules (behaviour-preserving). ──────
# Every name is re-exported into THIS namespace so the public surface stays
# exactly ``routes.pdf.<name>``. This matters for two reasons:
#   1. ``from routes.pdf import bp`` (main.py) + ``from routes.pdf import
#      _build_trip_pdf`` / ``routes.pdf._T`` / ``_is_public_http_url`` /
#      ``_load_photo_png`` (tests) keep resolving.
#   2. The test-suite monkeypatches the three Static Maps fetchers on THIS
#      module (``routes.pdf._fetch_cover_map`` etc.). ``_build_trip_pdf``
#      is defined below in this module, so its ``__globals__`` IS this
#      package namespace; the re-exported fetcher names live here, so a
#      ``monkeypatch.setattr(routes.pdf, "_fetch_cover_map", fake)`` is
#      visible to ``_build_trip_pdf``'s bare-name call.
# The names are underscore-prefixed, so a bare ``import *`` would skip them
# (``*`` only pulls public names absent an ``__all__``). We therefore list
# them explicitly — this is the load-bearing re-export, not decoration.
from ._i18n import (
    _T, _norm_locale, _fmt_date, _currency_decimals,
    _SUPPORTED_LOCALES, _STRINGS, _ZERO_DECIMAL_CURRENCIES,
    _MONTHS_ABBR, _WEEKDAYS_ABBR,
)
from ._fonts import (
    _font, _strip_emoji, _try_register_unicode_font, _FONT_CANDIDATES,
)
from ._render import (
    _rl, _styles, _esc, _hr, _image_aspect, _safe_json,
    _parse_day_slot, _photo_grid, _simplify_debts,
    _companion_avatar_color, _companion_card, _companion_grid,
    _section_opener, _expenses_section, _settle_section, _day_card,
    _summary_stats_row, _toc_entry, _toc_row,
    _BRAND_NAVY, _BRAND_BLUE, _BRAND_PURPLE, _BRAND_GREEN,
    _TEXT_PRIMARY, _TEXT_SECONDARY, _RULE_GREY,
)
from ._maps import (
    _safe_coord, _safe_latlng, _place_label_for_index, _can_read_trip,
    _scrub_key, _map_cache_key, _map_cache_get, _map_cache_put,
    _fetch_cover_map, _fetch_overview_pins_map, _fetch_day_pin_map,
    _is_public_http_url, _photo_src, _load_photo_png, _collect_photos,
    _PHOTO_MAX_BYTES, _PHOTO_MAX_PER_TRIP,
)


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
      includeExpenses        bool  itemised expenses table (PDF-2)
      includeSettlements     bool  settle-up balances + recorded (PDF-3)
      includeCompanions      bool  companion roster
      includeMarkedPlaces    bool  marked-places list
      includePhotos          bool  embed trip + per-day photos (PDF-4)
      locale                 str   active UI locale ('en'/'fr'/'es'/'pt'),
                                   routes every label through the i18n
                                   string table (PDF-5)

    Unknown keys are ignored; missing keys default to True for the
    'extensive by default' UX brief."""
    rl = _rl()
    styles = _styles(rl)
    # PDF-5: resolve the locale once and build the translator. Every
    # section title / slot label / money + date string goes through `tr`.
    tr = _T(_norm_locale(options.get("locale") or options.get("lang")))
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
            # R9-B1 H3: route through _font() so non-Latin trip names
            # (東京旅行 / تونس / Москва) actually render in the per-page
            # kicker. Pre-fix the hardcoded Helvetica fallback had
            # NO glyphs for these scripts → blank string after the
            # "TRIP PLAN  ·  " separator on every interior page.
            # Same R3-Round 4 Unicode-font fix as the body text;
            # this chrome path was missed. _strip_emoji ensures the
            # font doesn't trip over emoji glyphs it can't render
            # (e.g. user adds "✦" or a flag to their trip name).
            canvas.setFont(_font(bold=True), 7.5)
            canvas.setFillColor(rl.colors.HexColor(_BRAND_BLUE))
            kicker_y = page_h - 0.9 * rl.cm
            canvas.drawRightString(
                page_w - margin_lr,
                kicker_y,
                f"{tr('trip_plan_chrome')}  ·  {_strip_emoji(trip_name).upper()}",
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
        # R9-B1 H3: same Unicode-font + emoji-strip treatment as the
        # kicker above. Pre-fix the footer's trip name was blank on
        # every page for non-Latin titles.
        canvas.setFont(_font(), 8)
        canvas.setFillColor(rl.colors.HexColor(_TEXT_SECONDARY))
        footer_y = 0.9 * rl.cm
        canvas.drawString(
            margin_lr,
            footer_y,
            f"{tr('brand_footer')}  ·  {_strip_emoji(trip_name)}",
        )
        canvas.drawRightString(
            page_w - margin_lr,
            footer_y,
            f"{tr('page')} {_doc.page}",
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
    trip_photos = _safe_json(trip_row.get("photos_json"), [])
    # PDF-2/3: the route attaches itemised expense + settlement rows.
    expenses = trip_row.get("expenses") or []
    settlements = trip_row.get("settlements") or []
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

    # Renderable days = anything other than the auto-created Day 0
    # anchor + anything with NO content. The anchor exists for
    # map-pinning bookkeeping; rendering it as an empty card
    # wastes a page slot. Computed early so the cover stats + TOC
    # use the same count the Day section eventually renders.
    def _day_has_content(d: dict) -> bool:
        if not isinstance(d, dict):
            return False
        if d.get("day_number") == 0:
            return False
        return any(
            isinstance(d.get(k), str) and d[k].strip()
            for k in ("morning", "afternoon", "evening", "notes", "tip")
        ) or bool((d.get("name") or "").strip() and d.get("day_number"))

    days_renderable = [d for d in days if _day_has_content(d)]

    # ── COVER PAGE ──
    # Full-bleed feel: tiny brand kicker → big hero title → country/
    # dates → hero map → stat tiles → "what's inside" mini-TOC.
    # Everything sized so the cover fills a SINGLE page; PageBreak
    # below it guarantees the next section starts on page 2.
    title = trip_row.get("name") or tr("untitled_trip")
    country = trip_row.get("country") or ""
    date_from = trip_row.get("date_from") or ""
    date_to = trip_row.get("date_to") or ""
    if date_from and date_to:
        date_line = f"{tr.date(date_from)}   →   {tr.date(date_to)}"
    elif date_from or date_to:
        date_line = tr.date(date_from or date_to)
    else:
        date_line = ""

    story.append(rl.Spacer(1, 0.6 * rl.cm))
    story.append(
        rl.Paragraph(tr("trip_plan_kicker"), styles["kicker"])
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
                # Source PNG: Google returns size=1200x600 → 2:1
                # aspect. Use direct sizing with EXACT 2:1 ratio so
                # the image fills the column edge-to-edge. The old
                # kind="proportional" path was shrinking the image
                # to preserve a slightly-mismatched aspect, leaving
                # ~10% empty cell space on the right.
                full_w = page_w - 2 * margin_lr
                aspect = _image_aspect(map_png)
                story.append(rl.Image(
                    io.BytesIO(map_png),
                    width=full_w,
                    height=full_w / aspect,  # exact aspect → no distortion
                ))
                story.append(rl.Spacer(1, 0.6 * rl.cm))
            except Exception:
                # Reportlab refuses bad image bytes silently —
                # don't let a corrupt image bomb the whole PDF.
                # R12-B1: log so the failure isn't invisible.
                logger.warning("PDF overview-map image render failed", exc_info=True)

    if opt("includeStats"):
        # Build the summary tiles dynamically — only show what we
        # have so the strip never has empty cells.
        stats: list[tuple[str, str]] = []
        if days_renderable:
            stats.append((str(len(days_renderable)), tr("stat_days")))
        if companions:
            stats.append((str(len(companions)), tr("stat_companions")))
        if marked_places:
            stats.append((str(len(marked_places)), tr("stat_places")))
        # Expenses + budgets totals if available
        if trip_row.get("total_spend_eur") is not None:
            stats.append((f"€{tr.num(int(trip_row['total_spend_eur']), 0)}", tr("stat_spend")))
        if stats:
            story.append(_summary_stats_row(rl, styles, stats, page_w, margin_lr))
            story.append(rl.Spacer(1, 0.7 * rl.cm))

    # "What's inside" mini-TOC. Lists only the sections the user
    # opted to include — so the cover honestly previews what they
    # ticked in the export modal.
    # TOC subtitles stay light/illustrative — left in English numerals
    # only where they're just a count; the section TITLE (the load-
    # bearing label) is translated. Keeping the subtitle terse avoids a
    # combinatorial plural-rule table across four locales.
    toc_entries: list[tuple[str, str, str, str]] = []
    n = 1
    if opt("includeDays") and days_renderable:
        toc_entries.append((
            f"{n:02d}", tr("sec_days"),
            f"{len(days_renderable)} · {tr('stat_days').lower()}",
            _BRAND_BLUE,
        ))
        n += 1
    todos = _safe_json(trip_row.get("checklist_json"), [])
    if opt("includeTodos") and todos:
        toc_entries.append((
            f"{n:02d}", tr("sec_checklist"),
            f"{len(todos)}",
            _BRAND_PURPLE,
        ))
        n += 1
    budgets = trip_row.get("budgets") or []
    if opt("includeBudgets") and budgets:
        toc_entries.append((
            f"{n:02d}", tr("sec_budgets"),
            f"{len(budgets)}",
            _BRAND_GREEN,
        ))
        n += 1
    if opt("includeExpenses", default=False) and expenses:
        toc_entries.append((
            f"{n:02d}", tr("sec_expenses"),
            f"{len(expenses)}",
            _BRAND_GREEN,
        ))
        n += 1
    if opt("includeSettlements", default=False) and (expenses or settlements):
        toc_entries.append((
            f"{n:02d}", tr("sec_settle"), "",
            _BRAND_GREEN,
        ))
        n += 1
    if opt("includeCompanions") and companions:
        toc_entries.append((
            f"{n:02d}", tr("sec_companions"),
            f"{len(companions)}",
            _BRAND_PURPLE,
        ))
        n += 1
    if opt("includeMarkedPlaces") and marked_places:
        toc_entries.append((
            f"{n:02d}", tr("sec_places"),
            f"{len(marked_places)}",
            _BRAND_BLUE,
        ))
        n += 1
    if opt("includePhotos", default=False) and (trip_photos or any(
        isinstance(d, dict) and d.get("photos") for d in days_renderable
    )):
        toc_entries.append((
            f"{n:02d}", tr("sec_photos"), "",
            _BRAND_PURPLE,
        ))
        n += 1

    if toc_entries:
        story.append(
            rl.Paragraph(tr("whats_inside"), styles["kicker"])
        )
        for entry in toc_entries:
            story.append(_toc_row(rl, styles, page_w, margin_lr, *entry))
            story.append(rl.Spacer(1, 0.18 * rl.cm))

    # Section counter mirrors the TOC numbering above so the
    # "01" on the section opener matches the "01" on the cover.
    section_num = 1

    # ── DAYS ──
    # days_renderable was computed earlier (Day 0 anchor + empty
    # days dropped) so the cover stats / TOC see the same count.
    if opt("includeDays") and days_renderable:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title=tr("sec_days"),
            kicker=(
                f"{tr('sec_days')} — "
                f"{tr('slot_morning').lower()} · {tr('slot_afternoon').lower()} · "
                f"{tr('slot_evening').lower()}"
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
            for day in days_renderable:
                if not isinstance(day, dict):
                    continue
                d_lat = day.get("lat")
                d_lng = day.get("lng")
                if d_lat is None or d_lng is None:
                    continue
                d_num = day.get("day_number")
                # 4.8 audit PLAT-7: guard int() — a non-numeric / garbage
                # day_number (legacy or corrupt row) raised here, and the
                # surrounding handler only catches RuntimeError, so the
                # WHOLE PDF export 500'd instead of just skipping one pin
                # label. Degrade to an empty label on bad input.
                try:
                    d_num_int = int(d_num) if d_num is not None else None
                except (TypeError, ValueError):
                    d_num_int = None
                label = str(d_num_int) if (d_num_int is not None and 1 <= d_num_int <= 9) else ""
                pins.append((d_lat, d_lng, label))
            if pins:
                overview_png = _fetch_overview_pins_map(
                    pins,
                    center_lat=trip_row.get("lat"),
                    center_lng=trip_row.get("lng"),
                )
                if overview_png:
                    try:
                        # Source PNG: size=1200x520 → ~2.31:1 aspect.
                        # Direct sizing at width / 2.31 keeps the image
                        # un-distorted while filling the column edge-
                        # to-edge.
                        full_w = page_w - 2 * margin_lr
                        ov_aspect = _image_aspect(overview_png)
                        story.append(rl.Paragraph(
                            f"EVERY DAY ON ONE MAP   ·   {len(pins)} PIN{'S' if len(pins) != 1 else ''}",
                            styles["kicker"],
                        ))
                        story.append(rl.Image(
                            io.BytesIO(overview_png),
                            width=full_w,
                            height=full_w / ov_aspect,
                        ))
                        story.append(rl.Spacer(1, 0.7 * rl.cm))
                    except Exception:
                        # R12-B1: surface silent reportlab image refusal.
                        logger.warning("PDF route-overview image render failed", exc_info=True)

        for day in days_renderable:
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
            # PDF-4: per-day inline photos (opt-in, off by default).
            day_photos: list[bytes] = []
            if opt("includePhotos", default=False):
                day_photos = _collect_photos(
                    _safe_json(day.get("photos"), []), limit=6,
                )
            # PDF-1: _day_card returns a FLAT list of flowables — header
            # kept-with-first-body, the rest paginating freely. We
            # `extend` (NOT wrap in another KeepTogether) so a page-long
            # journal day flows across pages instead of crashing the
            # whole export on an un-splittable single Table cell.
            story.extend(_day_card(
                rl, styles, page_w, margin_lr, day, day_map_png, tr,
                day_photos=day_photos,
            ))

        # Optionally append the LLM-generated layer the frontend
        # forwarded along (lives in localStorage; not in the DB).
        if ai_plan_extra:
            story.append(rl.PageBreak())
            story.extend(_section_opener(
                rl, styles, page_w, margin_lr,
                number="✦",
                title=tr("sec_ai"),
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
                day_dt = tr.date(day.get("date", ""))
                main_loc = day.get("mainLocation") or day.get("title") or ""
                kicker_text = day_dt.upper() if day_dt else ""
                title_parts = []
                if day_num:
                    title_parts.append(f"{tr('day')} {day_num}")
                if main_loc:
                    title_parts.append(main_loc)
                ai_title = "  ·  ".join(title_parts) or tr("day")

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
            title=tr("sec_checklist"),
            kicker="",
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
            title=tr("sec_budgets"),
            kicker="",
            color=_BRAND_GREEN,
        ))
        section_num += 1
        # Each budget's planned amount alongside the trip's TOTAL spend
        # (one number, footer row) so the reader still gets the
        # at-a-glance "did I stay under" answer without a misleading
        # per-row "spent" column. Labels are derived from scope in the
        # data-assembly step (BUG-21); amounts are shown in the user's
        # ORIGINAL currency per row but summed in EUR for the total.
        rows = [[tr("col_budget"), tr("col_planned")]]
        total_planned_eur = 0.0
        for b in budgets:
            # `amount` is always EUR-normalised at write time — sum THAT
            # for the total so mixed-currency budgets aren't added up as
            # if every figure were already EUR (BUG-21).
            eur_amount = float(b.get("amount") or 0)
            total_planned_eur += eur_amount
            # Per row, show what the user actually budgeted: their
            # original currency + amount. PDF-6: format with
            # currency-aware decimals (0 for JPY/KRW/…, 2 otherwise) so
            # a USD 1,100.50 budget no longer prints "USD 1,101" (cents
            # silently rounded away). Fall back to the canonical pair for
            # legacy rows missing the original_* fields.
            orig_amount = b.get("original_amount")
            orig_curr = b.get("original_currency")
            if orig_amount is not None and orig_curr:
                planned_disp = tr.money(orig_curr, orig_amount)
            else:
                planned_disp = tr.money(b.get("currency") or "EUR", eur_amount)
            rows.append([
                _esc(b.get("label") or tr("budget_untitled")),
                planned_disp,
            ])
        rows.append([tr("total_planned"), tr.money("EUR", total_planned_eur)])
        if trip_row.get("total_spend_eur") is not None:
            rows.append([
                tr("actual_spend"),
                tr.money("EUR", trip_row["total_spend_eur"]),
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

    # ── EXPENSES (PDF-2) ──
    # An itemised list the budget aggregate never showed: a 40-expense
    # trip used to collapse to a single number. Rendered as a MULTI-ROW
    # table (date · description · category · original amount · EUR), which
    # paginates correctly (unlike the old single-cell day card), grouped
    # by date, with per-currency subtotals + an EUR grand total.
    if opt("includeExpenses", default=False) and expenses:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title=tr("sec_expenses"),
            kicker="",
            color=_BRAND_GREEN,
        ))
        section_num += 1
        story.extend(_expenses_section(
            rl, styles, page_w, margin_lr, expenses, tr,
            total_spend_eur=trip_row.get("total_spend_eur"),
        ))

    # ── SETTLE UP (PDF-3) ──
    # The group-trip "who owes whom" story was entirely absent. We
    # compute per-currency net balances from the trip's non-settlement
    # expenses (mirroring balances.ts), apply recorded settlements
    # (legacy is_settlement expense rows + the settlements table),
    # show simplified transfers, and list the recorded settlements.
    if opt("includeSettlements", default=False) and (expenses or settlements):
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title=tr("sec_settle"),
            kicker="",
            color=_BRAND_GREEN,
        ))
        section_num += 1
        story.extend(_settle_section(
            rl, styles, page_w, margin_lr, expenses, settlements, companions, tr,
        ))

    # ── COMPANIONS ──
    if opt("includeCompanions") and companions:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title=tr("sec_companions"),
            kicker="",
            color=_BRAND_PURPLE,
        ))
        section_num += 1
        # Pretty avatar grid — each companion gets a colored
        # initials tile + name/role on the right, 2 per row.
        story.append(_companion_grid(rl, styles, page_w, margin_lr, companions, tr))

    # ── MARKED PLACES ──
    if opt("includeMarkedPlaces") and marked_places:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title=tr("sec_places"),
            kicker="",
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
            # R3-Round 3 fix: past 26 places, cycle back through A-Z
            # so each pin gets a meaningful label (A, B, ..., Z, A, B,
            # ...). Pre-fix the >26 case used "" on the map and "·"
            # in the legend — visually indistinguishable from each
            # other. The wrap is honest about ambiguity (two pins
            # both labelled "A") which is acceptable past 26: rare
            # case, and the user can read each card's name below.
            label = _place_label_for_index(i)
            place_pins.append((plat, plng, label))
        if place_pins:
            places_map_png = _fetch_overview_pins_map(
                place_pins,
                center_lat=trip_row.get("lat"),
                center_lng=trip_row.get("lng"),
            )
            if places_map_png:
                try:
                    # Direct sizing with the PNG's REAL aspect (read
                    # via PIL) — Google sometimes returns a slightly
                    # different aspect than `size=` requests when the
                    # marker bounds auto-fit.
                    full_w = page_w - 2 * margin_lr
                    places_aspect = _image_aspect(places_map_png)
                    story.append(rl.Image(
                        io.BytesIO(places_map_png),
                        width=full_w,
                        height=full_w / places_aspect,
                    ))
                    story.append(rl.Spacer(1, 0.6 * rl.cm))
                except Exception:
                    # R12-B1: surface silent reportlab image refusal.
                    logger.warning("PDF places-map image render failed", exc_info=True)

        # List with letter-labeled cards matching the map pins.
        for i, p in enumerate(marked_places):
            if not isinstance(p, dict):
                continue
            nm = p.get("name") or ""
            addr = p.get("address") or p.get("vicinity") or ""
            label = _place_label_for_index(i)
            # Left column = a small letter badge matching the map pin
            letter_para = rl.Paragraph(
                f'<para alignment="center"><font color="white" size="13"><b>{_esc(label)}</b></font></para>',
                rl.ParagraphStyle("GGLetter", fontName=_font(bold=True),
                                  fontSize=13, leading=15, alignment=1,
                                  textColor=rl.colors.white),
            )
            place_info: list[Any] = [
                rl.Paragraph(_esc(nm), styles["dayTitle"]),
            ]
            if addr:
                place_info.append(rl.Paragraph(_esc(addr), styles["muted"]))
            place_letter_w = 1.1 * rl.cm
            place_card = rl.Table(
                [[letter_para, place_info]],
                colWidths=[
                    place_letter_w,
                    page_w - 2 * margin_lr - place_letter_w,
                ],
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

    # ── PHOTOS (PDF-4) ──
    # A dedicated gallery for the trip-wide photos store + any per-day
    # photos not already inlined in the day cards. Off by default. Each
    # photo is fetched fail-soft + size-capped + re-validated through PIL
    # (see _load_photo_png), then laid out in a paginating grid.
    photos_section_flowables: list[Any] = []
    if opt("includePhotos", default=False):
        # BUG-035: when the day cards are rendered (includeDays on), exclude
        # photos already inlined there (tagged with a renderable day's id), else
        # every EXIF-day-tagged photo appears twice — in its day card AND here.
        # When day cards are NOT rendered, keep all photos so none are lost.
        # Photos with no dayId / a non-rendered day (e.g. Day 0 anchor) always
        # fall through to the gallery.
        if opt("includeDays") and days_renderable:
            _renderable_day_ids = {
                d.get("id") for d in days_renderable if isinstance(d, dict)
            }
            _gallery_src = [
                p for p in trip_photos
                if not (isinstance(p, dict) and p.get("dayId") in _renderable_day_ids)
            ]
        else:
            _gallery_src = trip_photos
        gallery: list[bytes] = _collect_photos(_gallery_src, limit=_PHOTO_MAX_PER_TRIP)
        if gallery:
            grid = _photo_grid(rl, gallery, page_w - 2 * margin_lr, cols=3)
            if grid is not None:
                photos_section_flowables.append(grid)
    if photos_section_flowables:
        story.append(rl.PageBreak())
        story.extend(_section_opener(
            rl, styles, page_w, margin_lr,
            number=f"{section_num:02d}",
            title=tr("sec_photos"),
            kicker="",
            color=_BRAND_PURPLE,
        ))
        section_num += 1
        story.extend(photos_section_flowables)

    # R3-Round 3 fix: also fire the cover-only hint when the user
    # selected sections but every one is empty (a freshly-created
    # trip with 0 days / 0 expenses / 0 todos / 0 companions / 0
    # marked places, all default-included). Pre-fix this rendered
    # as a silent 1-page cover with no explanation — the user
    # thought the export was broken. The `or` branch counts
    # actually-renderable content.
    has_renderable_content = (
        len(days_renderable) > 0
        or len(todos) > 0
        or len(budgets) > 0
        or len(expenses) > 0
        or len(settlements) > 0
        or len(companions) > 0
        or len(marked_places) > 0
        or bool(photos_section_flowables)
    )
    no_sections_selected = not any(opt(k, default=(k not in (
        "includeExpenses", "includeSettlements", "includePhotos",
    ))) for k in (
        "includeDays", "includeTodos", "includeBudgets",
        "includeExpenses", "includeSettlements",
        "includeCompanions", "includeMarkedPlaces", "includePhotos",
    ))
    if no_sections_selected or not has_renderable_content:
        # No content sections selected, OR every selected section is
        # empty — render the cover as the only page + a soft hint.
        story.append(rl.Spacer(1, 1.0 * rl.cm))
        story.append(rl.Paragraph(
            f"<i>{_esc(tr('cover_only'))}</i>",
            styles["muted"],
        ))

    # R3-Round 3 fix: wrap doc.build in try/except. A pathological
    # per-day notes field (~30k+ chars) can raise ReportLab's
    # LayoutError if a single Paragraph won't fit on one page, and
    # pre-fix that propagated as an unhandled 500 with a stack trace.
    # Now: surface a friendly 500 with operator-actionable text +
    # log the underlying error for forensics.
    try:
        doc.build(story)
    except Exception as e:
        from observability import get_logger
        get_logger(__name__).warning(
            "PDF doc.build failed: %s", e,
        )
        raise RuntimeError(
            "PDF generation failed — likely a section too long to fit "
            "on one page. Try shortening the longest note or splitting "
            "the trip."
        ) from e
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
    options = json_body()

    # Audit fix (2026-05-26): hard cap the options payload size +
    # bound any caller-supplied arrays so a crafted request can't
    # stall the worker. PA's free tier is single-process / single-
    # thread; one 5 MB aiPlan tied up the box for everyone pre-fix.
    # 64 KB is generous enough for a 30-day aiPlan with verbose
    # entries.
    try:
        opts_size = len(json.dumps(options))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid options payload"}), 400
    if opts_size > 64 * 1024:
        return jsonify({"error": "Options payload too large"}), 413
    # The `aiPlan` array is the most common DoS vector — caller-
    # supplied, no schema constraint, no per-element cap. 100 entries
    # is well beyond any realistic plan length (longest legit trip
    # ~365 days × maybe a handful of suggestions each → < 100 per
    # day at most; the PDF only renders the trip's days anyway).
    if "aiPlan" in options:
        if not isinstance(options["aiPlan"], list):
            options["aiPlan"] = []
        elif len(options["aiPlan"]) > 100:
            options["aiPlan"] = options["aiPlan"][:100]

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_id, name, country, country_code, place_id, lat, lng, "
            "       companions_json, marked_places_json, checklist_json, "
            "       photos_json "  # PDF-4: trip-wide photo gallery
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
        # 2026-05-26 (audit SY5): all three queries below filter out
        # tombstoned days/expenses so the PDF reflects the live trip
        # state, not the soft-deleted residue.
        cursor.execute(
            "SELECT MIN(date) AS f, MAX(date) AS t FROM trip_days "
            "WHERE trip_id = ? AND deleted_at IS NULL",
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
            "       evening, notes, tip, lat, lng, photos "  # PDF-4: per-day photos
            "FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL "
            "ORDER BY day_number ASC, date ASC",
            (trip_id,),
        )
        # Audit fix: cap rendered days at 1000. The longest legitimate
        # trip in our user base is ~400 days; anything past 1000 is a
        # data-bug or an attempt to DoS the worker (each day fetches
        # a static map tile + renders multi-line text). Truncating
        # rather than 413'ing keeps the export usable for the
        # pathological-but-real case of a forgotten-archive trip
        # with thousands of legacy rows.
        rows = cursor.fetchall()
        if len(rows) > 1000:
            rows = rows[:1000]
        trip["days"] = [dict(r) for r in rows]

        # PDF-4: current media lives in the TRIP-level photos_json store
        # (each entry tagged with a `dayId`), while the LEGACY per-day
        # `photos` column holds older uploads. Merge the trip-level
        # photos for each day into that day's `photos` list so the day
        # cards embed BOTH. Read-only — never writes back (media
        # write-path invariant).
        try:
            _trip_photos_all = _safe_json(trip.get("photos_json"), [])
        except Exception:
            _trip_photos_all = []
        if isinstance(_trip_photos_all, list) and _trip_photos_all:
            _by_day: dict[str, list] = {}
            for _ph in _trip_photos_all:
                if not isinstance(_ph, dict):
                    continue
                _did = _ph.get("dayId")
                if _did:
                    _by_day.setdefault(str(_did), []).append(_ph)
            for _d in trip["days"]:
                _existing = _safe_json(_d.get("photos"), [])
                if not isinstance(_existing, list):
                    _existing = []
                _merged = list(_existing) + _by_day.get(str(_d.get("id")), [])
                _d["photos"] = json.dumps(_merged) if _merged else _d.get("photos")

        # Budgets attached to the trip — owner-scoped, label+amount
        # shape — R3-Round 2 fix: include category_id + owner_name so
        # scoped budgets ("Food only" / "Bruno only") render with
        # their qualifier and the renderer can compare them against
        # the right subset of expenses. Pre-fix the SELECT dropped
        # those columns and the PDF compared every per-trip budget to
        # the trip-wide total spend, so a €200 "Bruno only" budget
        # showed as €200 against the WHOLE trip's spend (misleading
        # 1500% overspend chips on tightly-scoped budgets).
        cursor.execute(
            "SELECT label, amount, currency, category_id, owner_name, "
            "original_amount, original_currency "
            "FROM budgets "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, trip["user_id"]),
        )
        budget_rows = [dict(b) for b in cursor.fetchall()]
        # BUG-21 (MK2 audit): budgets carry no user-facing name (the
        # create modal has no label field), so the PDF printed every one
        # as "Untitled". Derive a label from the budget's SCOPE: the
        # category name (or "Overall" for a trip-total budget), plus the
        # person when the budget is scoped to one. Load the user's
        # category id→name map once.
        cursor.execute(
            "SELECT id, name FROM categories WHERE user_id = ?",
            (trip["user_id"],),
        )
        _cat_name = {r["id"]: r["name"] for r in cursor.fetchall()}
        for b in budget_rows:
            if (b.get("label") or "").strip():
                continue  # respect an explicit label if one ever exists
            cat_id = b.get("category_id")
            if cat_id and _cat_name.get(cat_id):
                scope_label = _cat_name[cat_id]
            elif cat_id:
                scope_label = "Category budget"
            else:
                scope_label = "Overall"
            owner = (b.get("owner_name") or "").strip()
            b["label"] = f"{scope_label} · {owner}" if owner else scope_label
        trip["budgets"] = budget_rows

        # Total spend across the trip — drives the cover stat tile.
        # R3-Round 2 fix: exclude `is_settlement = 1` rows. The
        # frontend balance math (balances.ts) filters them; PDF
        # included them, so cover-page total overstated trip spend
        # by the settlement total. Same fix applied to achievements
        # totals and public-profile totals where they exist.
        cursor.execute(
            "SELECT COALESCE(SUM(euro_value), 0) AS total "
            "FROM expenses "
            "WHERE trip_id = ? AND deleted_at IS NULL "
            "  AND COALESCE(is_settlement, 0) = 0",
            (trip_id,),
        )
        ts = cursor.fetchone()
        trip["total_spend_eur"] = float(ts["total"]) if ts and ts["total"] else None

        # PDF-2/3: itemised expense rows (incl. is_settlement + splits) so
        # the Expenses + Settle-up sections can list each line and compute
        # per-currency balances. Capped at 2000 rows — a realistic trip is
        # well under, and the table paginates. Tombstoned rows excluded.
        cursor.execute(
            "SELECT id, who, label, category_id, date, value, currency, "
            "       euro_value, splits, is_settlement "
            "FROM expenses "
            "WHERE trip_id = ? AND deleted_at IS NULL "
            "ORDER BY date ASC",
            (trip_id,),
        )
        exp_rows = cursor.fetchall()
        if len(exp_rows) > 2000:
            exp_rows = exp_rows[:2000]
        # BUG-049: resolve each expense's category_id → human name (mirroring
        # the budget label resolution above) so the PDF Expenses table shows
        # "Food", not the opaque category UUID. Falls back to the raw value for a
        # legacy slug / cross-user categoryId with no matching row.
        _exp_list = []
        for _r in exp_rows:
            _d = dict(_r)
            _cid = _d.get("category_id")
            _d["category_name"] = _cat_name.get(_cid) or _cid
            _exp_list.append(_d)
        trip["expenses"] = _exp_list

        # PDF-3: server-side settlement rows (the post-§4.5 store, distinct
        # from legacy is_settlement expense rows above). Carry the
        # snapshotted from_name/to_name the balance math keys on.
        cursor.execute(
            "SELECT id, from_name, to_name, amount, currency, euro_value, "
            "       created_at "
            "FROM settlements WHERE trip_id = ? "
            "ORDER BY created_at ASC",
            (trip_id,),
        )
        settle_rows = cursor.fetchall()
        if len(settle_rows) > 2000:
            settle_rows = settle_rows[:2000]
        trip["settlements"] = [dict(r) for r in settle_rows]

    # Diagnostic — log what the builder is seeing so the dev can
    # tell at a glance why a map / section might be missing.
    #
    # Audit fix (2026-05-26): downgraded to DEBUG + stripped lat /
    # lng / trip_name / country from the user-facing log line.
    # Pre-fix this fired at INFO on every PDF build, leaking
    # precise location data + trip identity into the prod log
    # stream. The trip_id + counters are sufficient for triage;
    # specific coordinates are recoverable via the DB if a real
    # debug needs them.
    days_with_coords = sum(
        1 for d in (trip.get("days") or [])
        if isinstance(d, dict) and d.get("lat") is not None and d.get("lng") is not None
    )
    logger.debug(
        "pdf build: trip=%s "
        "days_total=%d days_with_coords=%d budgets=%d companions=%d "
        "marked_places=%d option_keys=%r",
        trip_id,
        len(trip.get("days") or []),
        days_with_coords,
        len(trip.get("budgets") or []),
        len(_safe_json(trip.get("companions_json"), [])),
        len(_safe_json(trip.get("marked_places_json"), [])),
        sorted(options.keys()) if isinstance(options, dict) else [],
    )

    # R9-B1 M3: wrap the build so a reportlab LayoutError (huge trip
    # that doesn't fit the page) surfaces as JSON, not as Flask's
    # default HTML 500. The frontend POSTs /api/trips/<id>/pdf and
    # expects either application/pdf OR a JSON {error: ...} envelope
    # — it has no path to render an HTML error body, so pre-fix the
    # user saw a generic browser "download failed" with no hint
    # about WHY (was it the layout, network, auth?).
    try:
        pdf_bytes = _build_trip_pdf(trip, options)
    except RuntimeError as e:
        # _build_trip_pdf raises a friendly RuntimeError for known-
        # bad layouts (e.g. day-card too tall for the frame). Other
        # exception types bubble — Flask's logger captures them.
        return jsonify({"error": str(e)}), 500
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
