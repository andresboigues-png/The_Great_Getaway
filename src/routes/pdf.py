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
from observability import get_logger

logger = get_logger(__name__)
from extensions import limiter
from helpers import json_body, trip_member_role


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


# R3-Round 4 fix: register a Unicode-capable font for non-Latin
# content. Reportlab's built-in Helvetica covers Latin-Extended-A
# only — Arabic ("أحمد"), CJK ("陈太太"), Cyrillic ("Дмитрий") etc.
# render as missing-glyph squares OR get silently stripped by
# _strip_emoji below, surfacing as "Untitled companion" in the
# PDF. We try a list of common system paths for a Unicode TTF;
# on PA the standard DejaVu Sans path resolves. If nothing is
# found, we fall back to Helvetica (Latin-only — same pre-fix
# behaviour, no regression).
#
# `_UNICODE_FONT` / `_UNICODE_FONT_BOLD` / `_UNICODE_FONT_OBLIQUE`
# carry the registered font names if registration succeeded; the
# call sites below use `_font(bold=True)` etc. to pick the right
# name without scattering try/except blocks across 16 call sites.
_UNICODE_FONT: str | None = None
_UNICODE_FONT_BOLD: str | None = None
_UNICODE_FONT_OBLIQUE: str | None = None

_FONT_CANDIDATES = [
    # macOS dev (Arial Unicode covers nearly all Unicode planes incl.
    # CJK + Arabic; no separate bold/italic so we re-use the regular).
    # Listed FIRST so dev renders the widest script coverage; on Linux
    # this path doesn't exist so it falls through to the candidates
    # below.
    (
        "/Library/Fonts/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "ArialUnicode",
    ),
    # MK4 PA-FONT fix: DejaVu Sans has NO CJK and NO Arabic coverage,
    # so on PA (which only ships DejaVu by default) a Chinese / Arabic
    # companion name or trip title was murdered to the empty string by
    # _strip_emoji's fallback path → "Untitled companion" / blank
    # footer. Prefer a full-coverage Noto face when the box has one
    # installed (PA must `apt-get install fonts-noto-cjk fonts-noto-core`
    # or equivalent — see the route's return note). Noto Sans CJK
    # covers Chinese/Japanese/Korean + Latin/Cyrillic/Greek; Noto Naskh
    # covers Arabic. We register the CJK face as the PRIMARY Unicode
    # font (it also has Latin), so most non-Latin names render; Arabic
    # still needs Naskh which we try as a separate fallback candidate.
    (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "NotoSansCJK",
    ),
    (
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "NotoSansCJK",
    ),
    (
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
        "NotoNaskhArabic",
    ),
    # Linux (PA + most distros) — DejaVu is the near-universal fallback
    # but covers Latin/Cyrillic/Greek only (no CJK/Arabic). Kept LAST so
    # a Noto face wins when present; DejaVu still beats Helvetica's
    # Latin-1-only coverage when Noto isn't installed.
    (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
        "DejaVuSans",
    ),
]


def _try_register_unicode_font() -> None:
    global _UNICODE_FONT, _UNICODE_FONT_BOLD, _UNICODE_FONT_OBLIQUE
    if _UNICODE_FONT is not None:
        return  # already registered
    import os
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except Exception:
        return  # reportlab missing — caller will fall back to Helvetica
    for reg_path, bold_path, oblique_path, name in _FONT_CANDIDATES:
        if not os.path.isfile(reg_path):
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, reg_path))
            if os.path.isfile(bold_path):
                pdfmetrics.registerFont(TTFont(f"{name}-Bold", bold_path))
            if os.path.isfile(oblique_path):
                pdfmetrics.registerFont(TTFont(f"{name}-Oblique", oblique_path))
            _UNICODE_FONT = name
            _UNICODE_FONT_BOLD = f"{name}-Bold" if os.path.isfile(bold_path) else name
            _UNICODE_FONT_OBLIQUE = f"{name}-Oblique" if os.path.isfile(oblique_path) else name
            logger.info("PDF unicode font registered: %s", name)
            return
        except Exception as e:
            logger.warning("PDF unicode font registration failed for %s: %s", name, e)
            continue


def _font(*, bold: bool = False, oblique: bool = False) -> str:
    """Return the name of the active font for the requested style.
    Unicode-capable when the registration succeeded, Helvetica
    otherwise."""
    _try_register_unicode_font()
    if bold and oblique:
        # No combined glyph in our DejaVu / Arial Unicode set —
        # prefer bold over oblique.
        return _UNICODE_FONT_BOLD or "Helvetica-BoldOblique"
    if bold:
        return _UNICODE_FONT_BOLD or "Helvetica-Bold"
    if oblique:
        return _UNICODE_FONT_OBLIQUE or "Helvetica-Oblique"
    return _UNICODE_FONT or "Helvetica"


# ── brand palette (kept close to the web --accent-* variables) ──
_BRAND_NAVY = "#001a33"
_BRAND_BLUE = "#0071e3"
_BRAND_PURPLE = "#9b59b6"
_BRAND_GREEN = "#34c759"
_TEXT_PRIMARY = "#1d1d1f"
_TEXT_SECONDARY = "#6b7280"
_RULE_GREY = "#e5e7eb"


# ── PDF-5: server-side i18n ──────────────────────────────────────────
# The PDF was English-only — a FR/PT/ES user opened a translated modal
# and downloaded an English document. Rather than touch the frontend
# locale files (the client just forwards its active locale string), we
# keep a SMALL string table here keyed by locale. Covers section titles,
# slot labels (MORNING/AFTERNOON/EVENING/NOTES/TIP), money/total labels,
# the cover kickers, and the handful of inline strings the reader sees.
# Missing keys / unknown locales fall back to English so a partial
# translation can never blank a label.
_SUPPORTED_LOCALES = ("en", "fr", "es", "pt")

_STRINGS: dict[str, dict[str, str]] = {
    "en": {
        "trip_plan_kicker": "THE GREAT GETAWAY   ·   TRIP PLAN",
        "trip_plan_chrome": "TRIP PLAN",
        "brand_footer": "The Great Getaway",
        "page": "Page",
        "untitled_trip": "Untitled trip",
        "whats_inside": "WHAT'S INSIDE",
        # section titles
        "sec_days": "Day-by-day",
        "sec_checklist": "Checklist",
        "sec_budgets": "Budgets",
        "sec_expenses": "Expenses",
        "sec_settle": "Settle up",
        "sec_photos": "Photos",
        "sec_companions": "Companions",
        "sec_places": "Marked places",
        "sec_ai": "AI suggestions",
        # day card
        "slot_morning": "MORNING",
        "slot_afternoon": "AFTERNOON",
        "slot_evening": "EVENING",
        "slot_notes": "NOTES",
        "slot_tip": "TIP.",
        "no_plan": "No plan yet for this day.",
        "day": "Day",
        # stats tiles
        "stat_days": "DAYS",
        "stat_companions": "COMPANIONS",
        "stat_places": "PLACES",
        "stat_spend": "SPEND",
        # budgets
        "col_budget": "Budget",
        "col_planned": "Planned",
        "total_planned": "Total planned (EUR-normalised)",
        "actual_spend": "Actual trip spend (EUR-normalised)",
        "budget_overall": "Overall",
        "budget_category": "Category budget",
        "budget_untitled": "Untitled",
        # expenses
        "col_date": "Date",
        "col_description": "Description",
        "col_category": "Category",
        "col_amount": "Amount",
        "col_eur": "EUR",
        "exp_subtotals": "Per-currency subtotals",
        "exp_uncategorised": "Uncategorised",
        "exp_no_label": "(no description)",
        "exp_total_eur": "Total spend (EUR-normalised)",
        # settle up
        "settle_balances": "Net balances",
        "settle_transfers": "Suggested transfers",
        "settle_recorded": "Recorded settlements",
        "settle_owes": "owes",
        "settle_all_square": "All square — nobody owes anybody.",
        "settle_paid": "paid",
        "settle_is_owed": "is owed",
        # cover-only hint
        "cover_only": (
            "You chose a cover-only export. Re-run with more sections "
            "selected to include the day plan, to-dos, budgets, "
            "companions, and marked places."
        ),
        "untitled_companion": "Untitled companion",
    },
    "fr": {
        "trip_plan_kicker": "THE GREAT GETAWAY   ·   PLAN DE VOYAGE",
        "trip_plan_chrome": "PLAN DE VOYAGE",
        "brand_footer": "The Great Getaway",
        "page": "Page",
        "untitled_trip": "Voyage sans titre",
        "whats_inside": "AU SOMMAIRE",
        "sec_days": "Jour par jour",
        "sec_checklist": "Liste de tâches",
        "sec_budgets": "Budgets",
        "sec_expenses": "Dépenses",
        "sec_settle": "Règlement des comptes",
        "sec_photos": "Photos",
        "sec_companions": "Compagnons",
        "sec_places": "Lieux marqués",
        "sec_ai": "Suggestions IA",
        "slot_morning": "MATIN",
        "slot_afternoon": "APRÈS-MIDI",
        "slot_evening": "SOIR",
        "slot_notes": "NOTES",
        "slot_tip": "ASTUCE.",
        "no_plan": "Aucun programme pour ce jour.",
        "day": "Jour",
        "stat_days": "JOURS",
        "stat_companions": "COMPAGNONS",
        "stat_places": "LIEUX",
        "stat_spend": "DÉPENSES",
        "col_budget": "Budget",
        "col_planned": "Prévu",
        "total_planned": "Total prévu (normalisé en EUR)",
        "actual_spend": "Dépenses réelles (normalisées en EUR)",
        "budget_overall": "Global",
        "budget_category": "Budget par catégorie",
        "budget_untitled": "Sans titre",
        "col_date": "Date",
        "col_description": "Description",
        "col_category": "Catégorie",
        "col_amount": "Montant",
        "col_eur": "EUR",
        "exp_subtotals": "Sous-totaux par devise",
        "exp_uncategorised": "Sans catégorie",
        "exp_no_label": "(sans description)",
        "exp_total_eur": "Dépenses totales (normalisées en EUR)",
        "settle_balances": "Soldes nets",
        "settle_transfers": "Transferts suggérés",
        "settle_recorded": "Règlements enregistrés",
        "settle_owes": "doit à",
        "settle_all_square": "Tout est réglé — personne ne doit rien.",
        "settle_paid": "a payé",
        "settle_is_owed": "doit recevoir",
        "cover_only": (
            "Vous avez choisi un export couverture seule. Relancez en "
            "sélectionnant plus de sections pour inclure le programme, "
            "les tâches, les budgets, les compagnons et les lieux."
        ),
        "untitled_companion": "Compagnon sans nom",
    },
    "es": {
        "trip_plan_kicker": "THE GREAT GETAWAY   ·   PLAN DE VIAJE",
        "trip_plan_chrome": "PLAN DE VIAJE",
        "brand_footer": "The Great Getaway",
        "page": "Página",
        "untitled_trip": "Viaje sin título",
        "whats_inside": "CONTENIDO",
        "sec_days": "Día a día",
        "sec_checklist": "Lista de tareas",
        "sec_budgets": "Presupuestos",
        "sec_expenses": "Gastos",
        "sec_settle": "Saldar cuentas",
        "sec_photos": "Fotos",
        "sec_companions": "Compañeros",
        "sec_places": "Lugares marcados",
        "sec_ai": "Sugerencias de IA",
        "slot_morning": "MAÑANA",
        "slot_afternoon": "TARDE",
        "slot_evening": "NOCHE",
        "slot_notes": "NOTAS",
        "slot_tip": "CONSEJO.",
        "no_plan": "Aún no hay plan para este día.",
        "day": "Día",
        "stat_days": "DÍAS",
        "stat_companions": "COMPAÑEROS",
        "stat_places": "LUGARES",
        "stat_spend": "GASTO",
        "col_budget": "Presupuesto",
        "col_planned": "Previsto",
        "total_planned": "Total previsto (normalizado en EUR)",
        "actual_spend": "Gasto real del viaje (normalizado en EUR)",
        "budget_overall": "General",
        "budget_category": "Presupuesto por categoría",
        "budget_untitled": "Sin título",
        "col_date": "Fecha",
        "col_description": "Descripción",
        "col_category": "Categoría",
        "col_amount": "Importe",
        "col_eur": "EUR",
        "exp_subtotals": "Subtotales por moneda",
        "exp_uncategorised": "Sin categoría",
        "exp_no_label": "(sin descripción)",
        "exp_total_eur": "Gasto total (normalizado en EUR)",
        "settle_balances": "Saldos netos",
        "settle_transfers": "Transferencias sugeridas",
        "settle_recorded": "Pagos registrados",
        "settle_owes": "debe a",
        "settle_all_square": "Todo saldado — nadie debe nada.",
        "settle_paid": "pagó",
        "settle_is_owed": "le deben",
        "cover_only": (
            "Elegiste una exportación solo de portada. Vuelve a "
            "ejecutarla seleccionando más secciones para incluir el "
            "plan diario, las tareas, los presupuestos, los compañeros "
            "y los lugares."
        ),
        "untitled_companion": "Compañero sin nombre",
    },
    "pt": {
        "trip_plan_kicker": "THE GREAT GETAWAY   ·   PLANO DE VIAGEM",
        "trip_plan_chrome": "PLANO DE VIAGEM",
        "brand_footer": "The Great Getaway",
        "page": "Página",
        "untitled_trip": "Viagem sem título",
        "whats_inside": "O QUE INCLUI",
        "sec_days": "Dia a dia",
        "sec_checklist": "Lista de tarefas",
        "sec_budgets": "Orçamentos",
        "sec_expenses": "Despesas",
        "sec_settle": "Acertar contas",
        "sec_photos": "Fotos",
        "sec_companions": "Companheiros",
        "sec_places": "Locais marcados",
        "sec_ai": "Sugestões de IA",
        "slot_morning": "MANHÃ",
        "slot_afternoon": "TARDE",
        "slot_evening": "NOITE",
        "slot_notes": "NOTAS",
        "slot_tip": "DICA.",
        "no_plan": "Ainda não há plano para este dia.",
        "day": "Dia",
        "stat_days": "DIAS",
        "stat_companions": "COMPANHEIROS",
        "stat_places": "LOCAIS",
        "stat_spend": "GASTO",
        "col_budget": "Orçamento",
        "col_planned": "Previsto",
        "total_planned": "Total previsto (normalizado em EUR)",
        "actual_spend": "Gasto real da viagem (normalizado em EUR)",
        "budget_overall": "Geral",
        "budget_category": "Orçamento por categoria",
        "budget_untitled": "Sem título",
        "col_date": "Data",
        "col_description": "Descrição",
        "col_category": "Categoria",
        "col_amount": "Valor",
        "col_eur": "EUR",
        "exp_subtotals": "Subtotais por moeda",
        "exp_uncategorised": "Sem categoria",
        "exp_no_label": "(sem descrição)",
        "exp_total_eur": "Gasto total (normalizado em EUR)",
        "settle_balances": "Saldos líquidos",
        "settle_transfers": "Transferências sugeridas",
        "settle_recorded": "Acertos registados",
        "settle_owes": "deve a",
        "settle_all_square": "Tudo acertado — ninguém deve nada.",
        "settle_paid": "pagou",
        "settle_is_owed": "tem a receber",
        "cover_only": (
            "Escolheu uma exportação só com a capa. Execute novamente "
            "selecionando mais secções para incluir o plano diário, as "
            "tarefas, os orçamentos, os companheiros e os locais."
        ),
        "untitled_companion": "Companheiro sem nome",
    },
}


def _norm_locale(raw: Any) -> str:
    """Coerce a caller-supplied locale to one we ship. Accepts the bare
    language tag the client sends ('fr') or a region variant ('fr-CA')
    and maps to the language prefix. Unknown → 'en'."""
    if not raw or not isinstance(raw, str):
        return "en"
    code = raw.strip().lower().split("-")[0].split("_")[0]
    return code if code in _SUPPORTED_LOCALES else "en"


class _T:
    """Tiny locale-bound translator + number/date formatter. Built once
    per export from the resolved locale and passed down to the section
    builders so no call site has to thread the locale string around."""

    # Babel-free locale-aware number formatting: en/pt use the
    # anglo "1,234.50" grouping; fr/es/pt use "1.234,50". (pt-PT
    # actually uses space-or-dot grouping + comma decimal — we pick the
    # dot/comma convention which is the most widely recognised PT form.)
    _COMMA_DECIMAL = {"fr", "es", "pt"}

    def __init__(self, locale: str):
        self.locale = locale if locale in _SUPPORTED_LOCALES else "en"

    def __call__(self, key: str) -> str:
        table = _STRINGS.get(self.locale) or _STRINGS["en"]
        return table.get(key) or _STRINGS["en"].get(key) or key

    def num(self, value: float, decimals: int = 2) -> str:
        """Group + decimal-separate a number per the active locale."""
        try:
            v = float(value)
        except (TypeError, ValueError):
            return str(value)
        if v != v or v in (float("inf"), float("-inf")):
            return "0"
        s = f"{v:,.{decimals}f}"  # always anglo first: 1,234.50
        if self.locale in self._COMMA_DECIMAL:
            # Swap separators: , ↔ . via a placeholder so we don't
            # double-replace.
            s = s.replace(",", "\x00").replace(".", ",").replace("\x00", ".")
        return s

    def money(self, currency: str, value: float) -> str:
        """`USD 1,100.50` / `USD 1.100,50` with currency-aware decimals
        (PDF-6): 0 for zero-decimal currencies, 2 otherwise."""
        cur = (currency or "EUR").upper()
        dp = _currency_decimals(cur)
        return f"{cur} {self.num(value, dp)}"

    def date(self, s: Any) -> str:
        return _fmt_date(s, self.locale)


# PDF-6: currencies with no minor unit (0 decimal places). Anything not
# in this set formats with 2 decimals. Source: ISO 4217 zero-decimal
# currencies (the ones a traveller is plausibly using).
_ZERO_DECIMAL_CURRENCIES = frozenset({
    "JPY", "KRW", "VND", "CLP", "PYG", "ISK", "HUF", "TWD",
    "UGX", "RWF", "XAF", "XOF", "XPF", "DJF", "GNF", "KMF",
    "BIF", "VUV", "MGA",
})


def _currency_decimals(currency: str) -> int:
    return 0 if (currency or "").upper() in _ZERO_DECIMAL_CURRENCIES else 2


# Localised month + weekday abbreviations for _fmt_date (Babel-free so
# the export doesn't depend on the host's locale being installed).
_MONTHS_ABBR = {
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "fr": ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
    "es": ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."],
    "pt": ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."],
}
_WEEKDAYS_ABBR = {
    "en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "fr": ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."],
    "es": ["lun.", "mar.", "mié.", "jue.", "vie.", "sáb.", "dom."],
    "pt": ["seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."],
}


bp = Blueprint("pdf", __name__)


# R2 audit fix helpers ----------------------------------------------------
# Promoted to validators.scrub_key in R3-Fix #14 so integrations.py can
# share the same scrub before logging Gemini's response bodies. The
# local alias keeps existing call sites in this file unchanged.
from validators import scrub_key as _scrub_key  # noqa: F401


def _safe_coord(value, lo: float, hi: float):
    """Validate a lat/lng-shaped value before interpolating into a
    Static Maps URL. Returns the float when valid, None otherwise.

    R2 audit fix: pre-fix the URL builders embedded
    `f"{lat},{lng}"` from raw marked_places_json. A crafted
    `lat="0|markers:color:red|99,99"` smuggled extra pins (or
    polylines / styles) into the paid Google API call. Now every
    coord goes through this gate first; non-numeric or out-of-range
    values are dropped so the marker is skipped silently rather than
    flowing through as an injection vector."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n != n or n in (float("inf"), float("-inf")):
        return None
    if n < lo or n > hi:
        return None
    return n


def _safe_latlng(lat, lng):
    """Convenience for the common pair-validation shape. Returns
    `(lat, lng)` when BOTH are valid; (None, None) otherwise so
    callers can `if not lat or not lng: skip`."""
    safe_lat = _safe_coord(lat, -90, 90)
    safe_lng = _safe_coord(lng, -180, 180)
    if safe_lat is None or safe_lng is None:
        return None, None
    return safe_lat, safe_lng


def _place_label_for_index(i: int) -> str:
    """Map a 0-based marker index to its display label.
    R3-Round 3 fix: pre-fix the >26 case rendered "" on the map and
    "·" in the legend, both useless. Now wrap A-Z so index 26 → A,
    27 → B, etc. Accepts that two pins on a 30-marker trip will
    share a label — honest ambiguity beats invisible labels. Callers
    can read each card's name below for disambiguation."""
    return chr(ord("A") + (i % 26))


# R3-Round 4 fix: in-memory cache for Static Maps responses keyed
# on the request params. Mariana's 30-tab PDF burst routinely hits
# the same trip-cover map 30 times because each export request is
# independent — at $2/1000 calls + a few hundred kB of bandwidth
# each, that's both money and time wasted. The cache is process-
# level (PA is single-process; multi-worker plans get parallel
# caches, which is fine — eventual convergence). LRU-evicted at
# 200 entries (~400 KB at 2 KB avg per cover PNG). TTL 1 hour so
# a multi-export session reuses; old entries naturally roll out
# under churn.
import collections
import hashlib as _hashlib
import threading as _threading

_MAP_CACHE_MAX = 200
_MAP_CACHE_TTL_SECONDS = 60 * 60
_map_cache: "collections.OrderedDict[str, tuple[float, bytes]]" = collections.OrderedDict()
_map_cache_lock = _threading.Lock()


def _map_cache_key(url: str, params) -> str:
    """SHA-1 of `url + sorted-params`. Accepts dict OR list of (k, v)
    tuples (Google Static Maps uses repeated `markers` keys so the
    overview/day-pin paths pass tuple lists). Excludes the API key so
    a key rotation doesn't invalidate the entire cache, and so the
    same map content with or without the key string yields the same
    cache hit."""
    # Normalise to list of (k, v) pairs, drop API key, sort.
    if isinstance(params, dict):
        pairs = list(params.items())
    else:
        pairs = list(params)
    pairs = [(str(k), str(v)) for k, v in pairs if k != "key"]
    pairs.sort()
    payload = url + "?" + "&".join(f"{k}={v}" for k, v in pairs)
    return _hashlib.sha1(payload.encode()).hexdigest()


def _map_cache_get(key: str) -> bytes | None:
    with _map_cache_lock:
        entry = _map_cache.get(key)
        if entry is None:
            return None
        ts, content = entry
        import time as _time
        if (_time.time() - ts) > _MAP_CACHE_TTL_SECONDS:
            # Evict stale.
            _map_cache.pop(key, None)
            return None
        # Move to end (LRU touch).
        _map_cache.move_to_end(key)
        return content


def _map_cache_put(key: str, content: bytes) -> None:
    if not content:
        return
    import time as _time
    with _map_cache_lock:
        _map_cache[key] = (_time.time(), content)
        _map_cache.move_to_end(key)
        # Evict oldest until under the cap.
        while len(_map_cache) > _MAP_CACHE_MAX:
            _map_cache.popitem(last=False)


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
    if not key:
        logger.warning(
            "pdf cover map skipped: neither GOOGLE_MAPS_SERVER_KEY "
            "nor GOOGLE_MAPS_API_KEY is set in env"
        )
        return None
    lat, lng = _safe_latlng(lat, lng)
    if lat is None or lng is None:
        logger.warning("pdf cover map skipped: trip has no valid lat/lng")
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
        # R3-Round 4 fix: cache by content hash. Mariana's 30-tab PDF
        # burst would otherwise refetch the identical cover map 30
        # times (~$0.06 + ~6 MB bandwidth saved per session).
        cache_key = _map_cache_key(
            "https://maps.googleapis.com/maps/api/staticmap", params,
        )
        cached = _map_cache_get(cache_key)
        if cached is not None:
            return cached
        # 2026-05-20: wrap in `with` so the response socket is
        # released immediately. Without it the keep-alive socket
        # stays in the requests-library pool until GC; under heavy
        # PDF export traffic that piles up FDs and trips the dev
        # server's ulimit (Errno 24 Too many open files).
        with requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
            # SEC-4: the API key rides in `params`; a 3xx to an
            # attacker-controlled host would leak it in the forwarded
            # query string. Pin to the literal Google endpoint.
            allow_redirects=False,
        ) as res:
            if not res.ok:
                logger.warning(
                    "pdf cover map: Google Static Maps returned %d — %s",
                    res.status_code,
                    _scrub_key((res.text or "")[:300]),
                )
                return None
            _map_cache_put(cache_key, res.content)
            return res.content
    except Exception as e:
        logger.warning("pdf cover map: fetch failed: %s", e)
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
        logger.info("pdf overview map skipped: no pins provided")
        return None
    key = (
        os.getenv("GOOGLE_MAPS_SERVER_KEY")
        or os.getenv("GOOGLE_MAPS_API_KEY")
        or ""
    )
    if not key:
        logger.warning(
            "pdf overview map skipped: neither GOOGLE_MAPS_SERVER_KEY "
            "nor GOOGLE_MAPS_API_KEY is set in env"
        )
        return None
    try:
        params: list[tuple[str, str]] = [
            ("size", "1200x520"),
            ("scale", "2"),
            ("maptype", "roadmap"),
            ("key", key),
        ]
        clat, clng = _safe_latlng(center_lat, center_lng)
        if clat is not None and clng is not None:
            params.append(("center", f"{clat},{clng}"))
        for plat_raw, plng_raw, plabel in pins[:20]:  # URL size cap
            plat, plng = _safe_latlng(plat_raw, plng_raw)
            if plat is None or plng is None:
                continue  # R2 fix: skip injection-shaped coords
            # label must be a single alphanumeric char; truncate
            safe_label = (str(plabel) or "")[:1].upper() if plabel else ""
            # Reject non-alphanumeric labels (e.g. `|`, `:` smuggling).
            if safe_label and not safe_label.isalnum():
                safe_label = ""
            marker = f"color:0x0071e3|label:{safe_label}|{plat},{plng}" if safe_label \
                else f"color:0x0071e3|{plat},{plng}"
            params.append(("markers", marker))
        # R3-Round 4 fix: content-hash cache. Same overview map for
        # identical pin set hits cache instead of re-fetching from
        # Google.
        cache_key = _map_cache_key(
            "https://maps.googleapis.com/maps/api/staticmap", params,
        )
        cached = _map_cache_get(cache_key)
        if cached is not None:
            return cached
        # 2026-05-20: see note on the cover-map fetch above —
        # `with requests.get(...)` releases the socket immediately
        # on exit to keep the FD pool from growing under heavy
        # PDF export traffic.
        with requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
            # SEC-4: the API key rides in `params`; a 3xx to an
            # attacker-controlled host would leak it in the forwarded
            # query string. Pin to the literal Google endpoint.
            allow_redirects=False,
        ) as res:
            if not res.ok:
                logger.warning(
                    "pdf overview map: Google Static Maps returned %d — %s",
                    res.status_code,
                    _scrub_key((res.text or "")[:300]),
                )
                return None
            logger.info(
                "pdf overview map: fetched %d pin(s), %d bytes",
                len(pins), len(res.content),
            )
            _map_cache_put(cache_key, res.content)
            return res.content
    except Exception as e:
        logger.warning("pdf overview map: fetch failed: %s", e)
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
    lat, lng = _safe_latlng(lat, lng)
    if not key or lat is None or lng is None:
        return None
    # Audit fix (2026-05-26): Google Static Maps marker labels MUST
    # be a single alphanumeric char (A-Z, 0-9). The pre-fix value
    # `•` was rejected — the entire URL 400'd and the per-day map
    # silently failed for every PDF that opted into includeDayPins.
    # Drop the label entirely (no label = default marker pin, which
    # is what we want for a single-pin anchor map).
    markers = [f"color:0x0071e3|{lat},{lng}"]
    for plat_raw, plng_raw in (extra_pins or [])[:8]:  # cap the URL size
        plat, plng = _safe_latlng(plat_raw, plng_raw)
        if plat is None or plng is None:
            continue  # R2 fix: skip injection-shaped coords
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
        # R3-Round 4 fix: same content-hash cache as the other two
        # fetchers above. Per-day pin maps are particularly cacheable
        # across export sessions because the underlying coords don't
        # change without a trip edit.
        cache_key = _map_cache_key(
            "https://maps.googleapis.com/maps/api/staticmap", params,
        )
        cached = _map_cache_get(cache_key)
        if cached is not None:
            return cached
        # 2026-05-20: `with` releases the socket on exit (FD-leak fix).
        with requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
            # SEC-4: the API key rides in `params`; a 3xx to an
            # attacker-controlled host would leak it in the forwarded
            # query string. Pin to the literal Google endpoint.
            allow_redirects=False,
        ) as res:
            if not res.ok:
                return None
            _map_cache_put(cache_key, res.content)
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


# ── PDF-4: user-photo embedding ──────────────────────────────────────
# Same fail-soft + size-cap discipline as the map fetchers. We accept
# three URL shapes that the app actually produces and IGNORE everything
# else (returns None, no crash):
#   1. `data:image/...;base64,...` — decoded inline, no network.
#   2. `/static/uploads/<...>`     — the app's OWN uploads, read from the
#      local UPLOAD_FOLDER filesystem (no network → no SSRF surface).
#   3. `http(s)://...`             — fail-soft capped GET (10s timeout,
#      hard byte cap). Validated by re-decoding through PIL, which both
#      rejects non-image bytes AND normalises to a reportlab-safe PNG.
# Every photo is re-encoded to PNG via PIL so a corrupt / malicious /
# truncated image can never reach reportlab's Image flowable raw.
_PHOTO_MAX_BYTES = 8 * 1024 * 1024  # 8 MB hard cap per photo download
_PHOTO_MAX_PER_TRIP = 60           # bound total embeds so a 500-photo
#                                    trip can't balloon the doc / RAM


def _is_public_http_url(url: str) -> bool:
    """SSRF guard for the photo fetcher. Returns True only when the URL's
    host resolves entirely to PUBLIC, routable IPs. Blocks loopback,
    link-local (incl. the 169.254.169.254 cloud-metadata endpoint),
    private (RFC1918), and other reserved ranges so a user-controlled
    photo `src` can't turn the export into an internal-network probe."""
    try:
        import ipaddress
        import socket
        from urllib.parse import urlparse
        host = urlparse(url).hostname
        if not host:
            return False
        # Resolve ALL addresses the host maps to; reject if ANY is
        # non-public (defends against a DNS name pointing at a private IP).
        infos = socket.getaddrinfo(host, None)
        addrs = {info[4][0] for info in infos}
        if not addrs:
            return False
        for addr in addrs:
            ip = ipaddress.ip_address(addr)
            if (
                ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified
            ):
                return False
        return True
    except Exception:
        return False


def _photo_src(entry: Any) -> str | None:
    """Pull the URL/src out of a photo entry. Day photos are bare URL
    strings; trip photos_json entries are {src|url, dayId, ...} dicts."""
    if isinstance(entry, str):
        return entry.strip() or None
    if isinstance(entry, dict):
        for k in ("src", "url", "dataUrl", "data_url"):
            v = entry.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def _load_photo_png(src: str) -> bytes | None:
    """Resolve one photo `src` to validated PNG bytes, or None on any
    failure. Fail-soft everywhere — a single bad photo must never break
    the export."""
    if not src or not isinstance(src, str):
        return None
    raw: bytes | None = None
    try:
        if src.startswith("data:"):
            # data:[<mediatype>][;base64],<data>
            header, _, payload = src.partition(",")
            if not payload:
                return None
            if ";base64" in header.lower():
                import base64
                raw = base64.b64decode(payload, validate=False)
            else:
                from urllib.parse import unquote_to_bytes
                raw = unquote_to_bytes(payload)
            if raw and len(raw) > _PHOTO_MAX_BYTES:
                return None
        elif src.startswith("/static/uploads/") or src.startswith("static/uploads/"):
            # App's own upload — read from disk, never the network.
            try:
                from flask import current_app
                root = current_app.config.get("UPLOAD_FOLDER")
            except Exception:
                root = None
            if not root:
                root = os.getenv("GG_UPLOAD_ROOT")
            if not root:
                return None
            rel = src.split("/static/uploads/", 1)[-1].lstrip("/")
            # Defend against path traversal — resolve + confine to root.
            abspath = os.path.realpath(os.path.join(root, rel))
            root_real = os.path.realpath(root)
            if not abspath.startswith(root_real + os.sep):
                return None
            if not os.path.isfile(abspath):
                return None
            if os.path.getsize(abspath) > _PHOTO_MAX_BYTES:
                return None
            with open(abspath, "rb") as fh:
                raw = fh.read(_PHOTO_MAX_BYTES + 1)
            if raw and len(raw) > _PHOTO_MAX_BYTES:
                return None
        elif src.startswith("http://") or src.startswith("https://"):
            # SSRF guard: refuse to fetch internal / loopback / link-local
            # / private addresses. A user-controlled photo `src` must not
            # let the export probe the metadata endpoint (169.254.169.254)
            # or internal services. App photos are same-origin uploads
            # (handled above) or data URLs — arbitrary external hosts are
            # the only ones that reach here, and only public ones are OK.
            if not _is_public_http_url(src):
                logger.warning("PDF photo skipped: non-public URL host")
                return None
            # Fail-soft capped GET — same `with requests.get(...)` socket
            # discipline + timeout as the map fetchers.
            with requests.get(src, timeout=10, stream=True) as res:
                if not res.ok:
                    return None
                # Enforce the byte cap while streaming so a huge/streaming
                # body can't exhaust RAM.
                chunks: list[bytes] = []
                total = 0
                for chunk in res.iter_content(64 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > _PHOTO_MAX_BYTES:
                        return None
                    chunks.append(chunk)
                raw = b"".join(chunks)
        else:
            return None
    except Exception:
        logger.warning("PDF photo fetch failed", exc_info=True)
        return None

    if not raw:
        return None
    # Re-decode through PIL and re-encode to PNG. This validates the
    # bytes really are an image, strips any trailing junk, and hands
    # reportlab a format it always accepts. Downscale very large photos
    # so the embedded image stays light.
    try:
        from PIL import Image as _PILImage
        with _PILImage.open(io.BytesIO(raw)) as im:
            im = im.convert("RGB")
            # Cap the long edge so a 12 MP phone photo doesn't bloat the
            # PDF — 1280px is plenty for a print thumbnail grid.
            max_edge = 1280
            if max(im.size) > max_edge:
                im.thumbnail((max_edge, max_edge))
            out = io.BytesIO()
            im.save(out, format="PNG")
            return out.getvalue()
    except Exception:
        logger.warning("PDF photo decode failed", exc_info=True)
        return None


def _collect_photos(entries: Any, limit: int) -> list[bytes]:
    """Resolve up to `limit` photo entries to validated PNG bytes,
    skipping any that fail. `entries` may be a list of strings or dicts."""
    out: list[bytes] = []
    if not isinstance(entries, list):
        return out
    for entry in entries:
        if len(out) >= limit:
            break
        src = _photo_src(entry)
        if not src:
            continue
        png = _load_photo_png(src)
        if png:
            out.append(png)
    return out


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


def _strip_emoji(text: str) -> str:
    """Drop emoji + wide-Unicode glyphs the active font can't render.
    R3-Round 4 fix: when a Unicode-capable font (DejaVu / Arial
    Unicode) registered successfully, we ONLY strip true emoji
    codepoints (≥ U+1F000) and keep all letter/symbol Unicode —
    so Arabic / CJK / Cyrillic / Greek / Hebrew companion names
    and trip titles render correctly instead of getting murdered
    to the empty string + falling back to "Untitled companion."
    When no Unicode font registered (rare on PA — DejaVu is
    pre-installed), we fall back to the old conservative strip
    so squares don't appear in the output."""
    if not text:
        return ""
    _try_register_unicode_font()
    if _UNICODE_FONT:
        # Unicode font present — strip ONLY actual emoji + private-use
        # planes. Letters / symbols / punctuation across every script
        # are kept. Emoji range: U+1F000-U+1FFFF covers the bulk
        # (musical, mahjong, dingbats, faces, food, transport, flags).
        # U+2600-U+27BF covers older miscellaneous symbols and
        # dingbats that may be partial-coverage in DejaVu.
        def _is_emoji(cp: int) -> bool:
            return (
                0x1F000 <= cp <= 0x1FFFF
                or 0xE000 <= cp <= 0xF8FF  # Private Use Area
            )
        return "".join(ch for ch in text if not _is_emoji(ord(ch))).strip()
    # Fallback (no Unicode font): keep ASCII + Latin-1 + Latin-
    # Extended-A plus a curated set of typography glyphs.
    keep_extra = {
        0x2013, 0x2014,  # – —
        0x2018, 0x2019, 0x201C, 0x201D,  # smart quotes
        0x2022, 0x2026,  # • …
        0x2192, 0x2190, 0x2191, 0x2193,  # arrows → ← ↑ ↓
        0x00B7,  # middle dot ·
        0x20AC, 0x00A3, 0x00A5,  # € £ ¥
    }
    return "".join(
        ch for ch in text
        if ord(ch) <= 0x024F or ord(ch) in keep_extra
    ).strip()


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
        cat = e.get("category_id") or e.get("category") or tr("exp_uncategorised")
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
        frm = (s.get("from_name") or "").strip()
        to = (s.get("to_name") or "").strip()
        bal = _bal(cur)
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


def _fmt_date(s: Any, locale: str = "en") -> str:
    """`2026-04-15` → `Wed 15 Apr 2026` (en) / `mer. 15 avr. 2026` (fr).
    Non-ISO inputs pass through. PDF-5: weekday + month abbreviations are
    localised via a Babel-free table so the export doesn't depend on the
    host OS having the locale installed."""
    if not s:
        return ""
    loc = locale if locale in _MONTHS_ABBR else "en"
    try:
        dt = datetime.fromisoformat(str(s)[:10])
    except (ValueError, TypeError):
        return str(s)
    wd = _WEEKDAYS_ABBR[loc][dt.weekday()]
    mo = _MONTHS_ABBR[loc][dt.month - 1]
    return f"{wd} {dt.day:02d} {mo} {dt.year}"


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
        gallery: list[bytes] = _collect_photos(trip_photos, limit=_PHOTO_MAX_PER_TRIP)
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
        trip["expenses"] = [dict(r) for r in exp_rows]

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
