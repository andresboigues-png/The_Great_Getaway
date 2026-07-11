"""PDF export — server-side i18n + locale-aware number/date formatting.

Behaviour-preserving extract of the locale string table (``_STRINGS``),
the ``_T`` translator, currency-decimal rules, and the Babel-free
month/weekday tables + ``_fmt_date``. Imported wholesale into
``routes.pdf`` via a star-import so every public name keeps its old
``routes.pdf.<name>`` path.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

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
        "day_map_walk": "{dist} apart  ·  about {min} min on foot",
        "slot_notes": "NOTES",
        "slot_tip": "TIP.",
        # Transportation P4 — per-day mode names (match frontend transport.mode_*).
        "transport_walk": "Walk",
        "transport_metro": "Metro",
        "transport_bus": "Bus",
        "transport_train": "Train",
        "transport_tram": "Tram",
        "transport_car": "Car",
        "transport_taxi": "Taxi",
        "transport_bike": "Bike",
        "transport_ferry": "Ferry",
        "transport_flight": "Flight",
        "transport_mixed": "Mixed",
        "no_plan": "No plan yet for this day.",
        "day": "Day",
        # AI-suggestions section (MK6 i18n)
        "ai_kicker": (
            "Gemini-generated plan kept alongside your hand-edited version. "
            "Not yet accepted into your day-by-day."
        ),
        "meal_breakfast": "BREAKFAST",
        "meal_lunch": "LUNCH",
        "meal_dinner": "DINNER",
        "meal_sights": "SIGHTS",
        "checklist_general": "General",
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
        "days_overview_map_one": "EVERY DAY ON ONE MAP   ·   1 PIN",
        "days_overview_map_many": "EVERY DAY ON ONE MAP   ·   {n} PINS",
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
        "day_map_walk": "{dist} de distance  ·  environ {min} min à pied",
        "slot_notes": "NOTES",
        "slot_tip": "ASTUCE.",
        "transport_walk": "À pied",
        "transport_metro": "Métro",
        "transport_bus": "Bus",
        "transport_train": "Train",
        "transport_tram": "Tramway",
        "transport_car": "Voiture",
        "transport_taxi": "Taxi",
        "transport_bike": "Vélo",
        "transport_ferry": "Ferry",
        "transport_flight": "Avion",
        "transport_mixed": "Mixte",
        "no_plan": "Aucun programme pour ce jour.",
        "day": "Jour",
        "ai_kicker": (
            "Plan généré par Gemini, conservé à côté de votre version. "
            "Pas encore intégré à votre jour par jour."
        ),
        "meal_breakfast": "PETIT-DÉJEUNER",
        "meal_lunch": "DÉJEUNER",
        "meal_dinner": "DÎNER",
        "meal_sights": "À VOIR",
        "checklist_general": "Général",
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
        "days_overview_map_one": "TOUS LES JOURS SUR UNE CARTE   ·   1 PIN",
        "days_overview_map_many": "TOUS LES JOURS SUR UNE CARTE   ·   {n} PINS",
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
        "day_map_walk": "{dist} de distancia  ·  unos {min} min a pie",
        "slot_notes": "NOTAS",
        "slot_tip": "CONSEJO.",
        "transport_walk": "A pie",
        "transport_metro": "Metro",
        "transport_bus": "Autobús",
        "transport_train": "Tren",
        "transport_tram": "Tranvía",
        "transport_car": "Coche",
        "transport_taxi": "Taxi",
        "transport_bike": "Bici",
        "transport_ferry": "Ferry",
        "transport_flight": "Avión",
        "transport_mixed": "Mixto",
        "no_plan": "Aún no hay plan para este día.",
        "day": "Día",
        "ai_kicker": (
            "Plan generado por Gemini, junto a tu versión editada. "
            "Aún no incorporado a tu día a día."
        ),
        "meal_breakfast": "DESAYUNO",
        "meal_lunch": "ALMUERZO",
        "meal_dinner": "CENA",
        "meal_sights": "LUGARES",
        "checklist_general": "General",
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
        "days_overview_map_one": "TODOS LOS DÍAS EN UN MAPA   ·   1 PIN",
        "days_overview_map_many": "TODOS LOS DÍAS EN UN MAPA   ·   {n} PINS",
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
        "day_map_walk": "{dist} de distância  ·  cerca de {min} min a pé",
        "slot_notes": "NOTAS",
        "slot_tip": "DICA.",
        "transport_walk": "A pé",
        "transport_metro": "Metro",
        "transport_bus": "Autocarro",
        "transport_train": "Comboio",
        "transport_tram": "Elétrico",
        "transport_car": "Carro",
        "transport_taxi": "Táxi",
        "transport_bike": "Bicicleta",
        "transport_ferry": "Ferry",
        "transport_flight": "Avião",
        "transport_mixed": "Misto",
        "no_plan": "Ainda não há plano para este dia.",
        "day": "Dia",
        "ai_kicker": (
            "Plano gerado pelo Gemini, mantido ao lado da sua versão. "
            "Ainda não integrado no seu dia a dia."
        ),
        "meal_breakfast": "PEQUENO-ALMOÇO",
        "meal_lunch": "ALMOÇO",
        "meal_dinner": "JANTAR",
        "meal_sights": "LOCAIS",
        "checklist_general": "Geral",
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
        "days_overview_map_one": "TODOS OS DIAS NUM MAPA   ·   1 PIN",
        "days_overview_map_many": "TODOS OS DIAS NUM MAPA   ·   {n} PINS",
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

    # A6-I4: minimal one/other plural rule for the cover "What's inside"
    # TOC day count. The stat_days label is stored plural (JOURS/DÍAS/
    # DIAS), so "1 · jours" read wrong for a single-day trip. We only
    # need the day word here, so a tiny per-locale singular/plural pair
    # is enough — no combinatorial plural table. Singular is used for
    # count == 1 (correct for en/fr/es/pt in this count>=1 context).
    _DAY_WORD = {
        "en": ("day", "days"),
        "fr": ("jour", "jours"),
        "es": ("día", "días"),
        "pt": ("dia", "dias"),
    }

    def days_word(self, count: int) -> str:
        """Lowercase day noun agreeing with `count` for the active locale.
        Falls back to English forms for any unknown locale."""
        one, other = self._DAY_WORD.get(self.locale, self._DAY_WORD["en"])
        return one if count == 1 else other

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
_ZERO_DECIMAL_CURRENCIES = frozenset(
    {
        "JPY",
        "KRW",
        "VND",
        "CLP",
        "PYG",
        "ISK",
        "HUF",
        "TWD",
        "UGX",
        "RWF",
        "XAF",
        "XOF",
        "XPF",
        "DJF",
        "GNF",
        "KMF",
        "BIF",
        "VUV",
        "MGA",
    }
)


def _currency_decimals(currency: str) -> int:
    return 0 if (currency or "").upper() in _ZERO_DECIMAL_CURRENCIES else 2


# Localised month + weekday abbreviations for _fmt_date (Babel-free so
# the export doesn't depend on the host's locale being installed).
_MONTHS_ABBR = {
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "fr": [
        "janv.",
        "févr.",
        "mars",
        "avr.",
        "mai",
        "juin",
        "juil.",
        "août",
        "sept.",
        "oct.",
        "nov.",
        "déc.",
    ],
    "es": [
        "ene.",
        "feb.",
        "mar.",
        "abr.",
        "may.",
        "jun.",
        "jul.",
        "ago.",
        "sept.",
        "oct.",
        "nov.",
        "dic.",
    ],
    "pt": [
        "jan.",
        "fev.",
        "mar.",
        "abr.",
        "mai.",
        "jun.",
        "jul.",
        "ago.",
        "set.",
        "out.",
        "nov.",
        "dez.",
    ],
}
_WEEKDAYS_ABBR = {
    "en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "fr": ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."],
    "es": ["lun.", "mar.", "mié.", "jue.", "vie.", "sáb.", "dom."],
    "pt": ["seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."],
}


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
