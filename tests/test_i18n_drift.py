"""Detect English strings that leaked into non-EN locale files.

The TS compiler already guarantees KEY COVERAGE across locales (every
key in en.ts must exist in pt/es/fr.ts or the `t()` call site fails
type-check). What it can't catch is a VALUE that's still in English —
e.g., adding a new key + value to en.ts and copy-pasting the same
value into pt.ts as a placeholder, intending to translate later.

This test parses the .ts files crudely as text (the format is
mechanical enough — `key: 'value',` at every leaf) and reports any
leaf whose non-EN locale value matches en exactly. A curated
ALLOWLIST documents the values that are INTENTIONALLY identical to
English — brand names, coincidental cognates, language-picker
self-names, abbreviations that are language-agnostic.

Adding a NEW entry to the allowlist must include a one-line comment
explaining why. The test failing is the early-warning signal that
either:
  (a) a new English value leaked into pt/es/fr and needs translation;
  (b) a new intentional cognate needs to be added to the allowlist.

2026-05-18 audit LOW-tier drift sweep.
"""

import re
from pathlib import Path

import pytest

LOCALES_DIR = Path(__file__).resolve().parent.parent / 'frontend' / 'static' / 'js' / 'src' / 'locales'


# Curated set of dotted-path keys whose non-EN value is INTENTIONALLY
# identical to the en value. Each entry has a one-line `# reason`
# annotation so the next person adding to the list documents the
# why. Format: dict from key to short reason string (the value is
# only used by humans; the test only cares about set membership).
_INTENTIONAL_ENGLISH = {
    # ── Brand names — never translated ─────────────────────────────
    'login.brand': 'product name',

    # ── Language-picker self-names ─────────────────────────────────
    # Each language is shown in its OWN script so the user can find
    # their language without having to read the host language.
    'settings.languageEnglish':    'self-name in EN',
    'settings.languagePortuguese': 'self-name in PT',
    'settings.languageSpanish':    'self-name in ES',
    'settings.languageFrench':     'self-name in FR',

    # ── Loanwords / cognates accepted as-is by FR ──────────────────
    # All of these are the same word in French (or universally
    # accepted English loans that didn't bother translating).
    'nav.budgets':              'fr: identical loanword',
    'nav.collections':          'fr: identical loanword',
    'nav.notifications':        'fr: identical loanword',
    'budgets.title':            'fr: identical loanword',
    'budgets.countLabel.one':   'fr: "budget" same in french',
    'budgets.countLabel.other': 'fr: "budgets" same in french',
    'collections.title':        'fr: identical loanword',
    'collections.publicLabel':  'fr: "Public" identical',
    'poi.restaurants':          'fr: identical (same word)',
    'poi.pharmacies':           'fr: identical (same word)',
    'settings.ratesTabInflation': 'fr: identical loanword "Inflation"',
    'settings.ratesAutoHint':     'universal "auto ≈ {n}" hint (like ratesAutoPlaceholder)',

    # ── "Email" is universal ───────────────────────────────────────
    # Settings dev panel label — pt/es/fr all use "Email" as the
    # native form (no accents, no diacritic alternative shipped).
    'settings.devEmail': 'universal loanword',

    # ── Social-product loanwords accepted in PT and ES ─────────────
    # "Feed" is the standard term across PT/ES social apps
    # (Facebook, Instagram, Twitter all use "Feed" in their
    # PT and ES UIs). Avoid inventing local translations that
    # would feel made-up.
    'nav.feed':   'pt/es: standard social-app loanword',
    'feed.title': 'pt/es: standard social-app loanword',

    # ── Format-string placeholders / templates ─────────────────────
    # "VARIABLE" is a placeholder users see briefly while typing a
    # custom number-format; it's an internal hint, not a normal
    # word. "Col…" is an abbreviation for "column".
    'settings.formatVariableLabel':    'placeholder token',
    'settings.formatColumnPlaceholder': 'abbrev. ellipsis',

    # ── Abbreviations ──────────────────────────────────────────────
    # Compact column headers in the insights table — same shape
    # across languages so the table doesn't get rebuilt per locale.
    'insights.transactionsAbbrev': 'tabular abbreviation',

    # ── Universal grouping labels ──────────────────────────────────
    'expenses.globalGroup':      'one-word "Global" universal',
    'collections.cardTotal':     'plot-axis label "total"',

    # ── Pluralization fragments shared as templates ───────────────
    # These look like English but they're {count}-interpolated
    # tokens; the unit "item" is acceptable as a loan word in PT
    # (Brazilian Portuguese uses "item" natively).
    'todo.itemCount.one':            'pt: loan word "item"',
    'ai.todoPanelTickedCount.one':   'pt: loan word "item"',
    'todo.categoryFilterLabel':      'fr: same word "Type"',

    # ── Settlement payment-method brand names ─────────────────────
    # Brand names — Revolut, Wise, PayPal — keep their English form
    # everywhere (the apps themselves don't localise their names).
    'settlement.methodRevolut': 'brand name',
    'settlement.methodWise':    'brand name',
    'settlement.methodPayPal':  'brand name',

    # ── Universal short words shared across PT/ES/FR ──────────────
    # 'Date' is the literal cognate in all three. 'Note' is loaned
    # into PT/ES as-is. 'Menu' and 'Notification' both Latin-rooted
    # and visually identical to their PT/ES/FR forms in compact UI
    # contexts where adding accents would feel pedantic.
    'settlement.labelDate':       'cognate identical in pt/es/fr',
    'settlement.labelNote':       'loanword identical in pt/es',
    'sidebar.menuTitle':          'identical loanword pt/es/fr',
    'notifications.titleGeneric': 'identical loanword pt/es/fr',

    # ── editTrip.destination ───────────────────────────────────────
    # "Destination" is the identical French spelling and the standard
    # PT/ES loanword (the travel-industry term is the same word).
    'editTrip.destination': 'cognate identical pt/es/fr',

    # ── Documents / Photos labels with emoji prefix ───────────────
    # "Documents" and "Photos" are identical in French (same spelling)
    # and PT/ES accept them as standard loanwords in travel-app UIs
    # (Instagram, TripAdvisor, etc. all keep them in English).
    'pathTab.btnDocuments':         'fr: identical; pt/es: standard loanword',
    'pathTab.btnPhotos':            'fr: identical; pt/es: standard loanword',
    'dayDetail.quickDocuments':     'fr: identical; pt/es: standard loanword',
    'dayDetail.quickPhotos':        'fr: identical; pt/es: standard loanword',
    'tripMedia.docsTitle':          'fr: identical; pt/es: standard loanword',
    'tripMedia.docsCountOne':       'fr: identical; pt/es: standard loanword',
    'tripMedia.docsCountOther':     'fr: identical; pt/es: standard loanword',
    'tripMedia.docsFallbackName':   'fr: identical; pt/es: standard loanword',
    'tripMedia.photosTitle':        'fr: identical; pt/es: standard loanword',
    'tripMedia.photosCountOne':     'fr: identical; pt/es: standard loanword',

    # ── Shortlist AM/PM time-of-day buttons ───────────────────────
    # 'AM'/'PM' are universal time-abbreviation conventions, same
    # in every locale's 12h displays.
    'dayDetail.shortlistBtnAm': 'universal time abbreviation',
    'dayDetail.shortlistBtnPm': 'universal time abbreviation',

    # ── Auto-fill placeholder ──────────────────────────────────────
    # '(Auto)' is shown briefly in date-input fields when the
    # frontend auto-derives the date — a short marker, kept English
    # for compactness (mirrors the en/dis/fr identical loanword).
    'modals.addDayDateAuto': 'compact universal marker',

    # ── URL-placeholder hints for media inputs ────────────────────
    # The hint strings demo a literal URL prefix — "https://..." —
    # which renders identically across locales.
    'tripMedia.addDocPlaceholderUrl':   'literal URL example',
    'tripMedia.addPhotoPlaceholderUrl': 'literal URL example',

    # ── FR identical to EN — Latin cognates ────────────────────────
    # 'Date', 'Notes', 'Documents', 'Photos', 'Destination', 'Budgets'
    # are all spelled identically in French. The duplicate-key surfaces
    # in archivedDetail + modals are the same lexicon, kept short.
    'tripMedia.photosCountOther':   'fr: identical (loanword pt/es too)',
    'archivedDetail.docsTitle':     'fr: identical',
    'archivedDetail.notesChip':     'fr: identical "Notes"',
    'archivedDetail.statDocuments': 'fr: identical',
    'archivedDetail.statPhotos':    'fr: identical',
    'modals.addDayLabelDate':       'fr: identical "Date"',
    'expenses.dateLabel':           'fr: identical "Date"',
    'modals.newTripLabelDest':      'fr: identical "Destination"',
    'modals.pdfOptBudgets':         'fr: identical "Budgets"',
    'modals.pdfOptPhotos':          'fr: identical "Photos"',

    # ── Trip Hub tab (Wave 1) — FR Latin cognates ──────────────────
    # 'Notes', 'Documents', 'Photos' are spelled identically in French
    # (same lexicon as the dayView.* / archivedDetail.* entries above).
    # The other tripHub.* values ARE translated (Camp de base, Jours,
    # Pays, Dépensé, …); only these three coincide with English.
    'tripHub.notesLabel':           'fr: identical "Notes"',
    'tripHub.btnDocuments':         'fr: identical "Documents"',
    'tripHub.btnPhotos':            'fr: identical "Photos"',

    # ── R11-B7: dayView labels (Latin cognate sweep) ───────────────
    # 'Photos', 'Documents', 'Document' all spelled identically in FR.
    # PT/ES use the same loanwords in travel-app context (mirrors the
    # existing pathTab/tripMedia entries above).
    'dayView.photos':            'fr: identical "Photos"',
    'dayView.documents':         'fr: identical "Documents"',
    'dayView.documentFallback':  'fr: identical "Document"',

    # ── F2 override panel + continents (Insights MK3 drift sweep) ──────
    # None of these are leaks: pt/es ARE translated where a translation
    # exists (Inflação/Inflación, Europa). What matches en is either a
    # format template with no translatable words, a compact universal
    # marker, or a French cognate spelled identically to English.
    'insights.overrideRatePrefix':     'format template "1 {cur} =", no words',
    'insights.overrideAutoNote':       'compact universal "auto" marker (cf. addDayDateAuto)',
    'insights.overrideInflationLabel': 'fr: "Inflation" identical (pt/es translated)',
    'collections.continents.europe':   'fr: "Europe" identical (pt/es: "Europa")',
    'collections.continents.asia':     'es: "Asia" identical (the Spanish spelling; pt/fr translated)',

    # ── Custom rates editor (Settings → Personalization) ──────────────
    # 'ratesFxHint' is a format template ("1 {cur} = ? {home}") — no words.
    # 'ratesAutoPlaceholder' is the compact universal "auto" marker (same
    # precedent as insights.overrideAutoNote / modals.addDayDateAuto).
    'settings.ratesFxHint':          'format template "1 {cur} = ? {home}", no words',
    'settings.ratesAutoPlaceholder': 'compact universal "auto" marker',
}


def _parse_locale(path: Path) -> dict[str, str]:
    """Walk the file line-by-line tracking the section stack.
    Crude but the locales/*.ts files follow a strict shape:
        key: { ... } or key: 'value',
    Multi-line strings would defeat this; we don't have any."""
    out: dict[str, str] = {}
    stack: list[str] = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith(('//', '*', '/*')):
            continue
        m = re.match(r"^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\{\s*$", line)
        if m:
            stack.append(m.group(1))
            continue
        if re.match(r"^\}\s*,?\s*$", line):
            if stack:
                stack.pop()
            continue
        m = re.match(
            r"^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([`'\"])(.*)\2\s*,?\s*$",
            line,
        )
        if m:
            key = '.'.join(stack + [m.group(1)])
            out[key] = m.group(3)
    return out


@pytest.fixture(scope='module')
def en():
    return _parse_locale(LOCALES_DIR / 'en.ts')


@pytest.mark.parametrize("locale", ['pt', 'es', 'fr'])
def test_no_unallowlisted_english_leaks(en, locale):
    """Every non-EN leaf whose value EQUALS en's value must appear in
    `_INTENTIONAL_ENGLISH`. Otherwise: either translate it, or add
    it to the allowlist with a `# reason` annotation explaining
    why the English value is intentional in that locale."""
    other = _parse_locale(LOCALES_DIR / f'{locale}.ts')
    # Same key, same value, more than 3 chars (filters out 'OK',
    # 'EUR', '€', etc. that are language-agnostic short tokens).
    leaks = [
        k for k, v in en.items()
        if k in other and other[k] == v and len(v) > 3
        and not re.fullmatch(r"[\W\d]+", v)
    ]
    unallowlisted = [k for k in leaks if k not in _INTENTIONAL_ENGLISH]
    assert not unallowlisted, (
        f"\n{locale}.ts has {len(unallowlisted)} English value(s) not on "
        f"the intentional-English allowlist. Either translate them or "
        f"add them to `_INTENTIONAL_ENGLISH` in tests/test_i18n_drift.py "
        f"with a one-line reason:\n"
        + "\n".join(f"  {k}: {en[k]!r}" for k in unallowlisted[:20])
    )


@pytest.mark.parametrize("locale", ['pt', 'es', 'fr'])
def test_locale_has_every_key_en_has(en, locale):
    """tsc enforces this at compile time (the Translations type
    derived from en.ts is the contract). Belt-and-braces in case
    someone parses the file and adds keys at runtime."""
    other = _parse_locale(LOCALES_DIR / f'{locale}.ts')
    missing = sorted(set(en) - set(other))
    assert not missing, (
        f"{locale}.ts is missing {len(missing)} key(s) from en.ts: "
        f"{missing[:10]}"
    )


def test_intentional_english_allowlist_is_exhaustive(en):
    """Allowlist entries must reference real keys. A typo or a
    stale entry from a renamed key needs catching before it
    silently hides a new drift."""
    stale = [k for k in _INTENTIONAL_ENGLISH if k not in en]
    assert not stale, (
        f"_INTENTIONAL_ENGLISH references key(s) that no longer exist "
        f"in en.ts: {stale}. Remove them from the allowlist."
    )
