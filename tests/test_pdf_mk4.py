"""MK4 PDF-export regression tests.

Covers the MK4 audit findings fixed in src/routes/pdf.py +
frontend/static/js/src/modals/pdf.ts:

  PDF-1  a page-long day journal must NOT crash the whole export (was a
         single-cell Table that reportlab can't split → 500). The day
         body now paginates as flat flowables.
  PDF-2  opt-in itemised Expenses section (paginating multi-row table).
  PDF-3  opt-in Settle-up section (per-currency balances + recorded
         settlements).
  PDF-4  opt-in photo embedding (data-URL / same-origin uploads /
         fail-soft external) + day SELECT now fetches `photos`.
  PDF-5  server-side i18n — section titles / slot labels / money + dates
         routed through a locale string table; a FR export has FR titles.
  PDF-6  currency-aware budget decimals (0 for JPY, 2 for USD).

Most tests drive `_build_trip_pdf` directly (deterministic, no network)
with the static-map fetchers monkeypatched off; a couple go end-to-end
through the route to prove the SELECTs + the 500-regression.
"""
import base64
import io
import json

import pytest

pypdf = pytest.importorskip("pypdf")

import routes.pdf as pdfmod  # noqa: E402
from routes.pdf import _build_trip_pdf  # noqa: E402


# ── helpers ──────────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def _no_network_maps(monkeypatch):
    """Disable the Google Static Maps fetchers so the builder is fast +
    deterministic and never reaches the network in CI."""
    monkeypatch.setattr(pdfmod, "_fetch_cover_map", lambda *a, **k: None)
    monkeypatch.setattr(pdfmod, "_fetch_overview_pins_map", lambda *a, **k: None)
    monkeypatch.setattr(pdfmod, "_fetch_day_pin_map", lambda *a, **k: None)


def _pdf_text(b: bytes) -> str:
    return "\n".join(
        (p.extract_text() or "")
        for p in pypdf.PdfReader(io.BytesIO(b)).pages
    )


def _npages(b: bytes) -> int:
    return len(pypdf.PdfReader(io.BytesIO(b)).pages)


def _base_trip(**over):
    t = {
        "id": "t", "name": "Grand Tour", "country": "Spain",
        "lat": 40.0, "lng": -3.0, "place_id": None,
        "companions_json": "[]", "marked_places_json": "[]",
        "checklist_json": "[]", "photos_json": "[]",
        "date_from": "2026-04-01", "date_to": "2026-04-10",
        "days": [], "budgets": [], "total_spend_eur": None,
        "expenses": [], "settlements": [],
    }
    t.update(over)
    return t


def _tiny_png_data_url(color=(220, 40, 40), size=(40, 30)) -> str:
    from PIL import Image
    im = Image.new("RGB", size, color)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ── PDF-1: long-journal day must not crash the export ─────────────────
def test_pdf1_page_long_journal_day_does_not_crash():
    """The headline regression: a ~5,400+ char journal day used to raise
    a LayoutError that 500'd the WHOLE export. Now it paginates and BOTH
    the big day and a following normal day render."""
    big = "Journaling: today was lovely and memorable. " * 200  # ~9k chars
    t = _base_trip(days=[
        {"day_number": 1, "date": "2026-04-01", "name": "Big Day", "notes": big},
        {"day_number": 2, "date": "2026-04-02", "name": "Normal Day",
         "morning": "Coffee", "notes": "short"},
    ])
    b = _build_trip_pdf(t, {})
    assert b[:4] == b"%PDF", "must produce a valid PDF, not raise"
    txt = _pdf_text(b)
    assert _npages(b) >= 3, "a page-long journal should span multiple pages"
    assert "Big Day" in txt
    assert "Normal Day" in txt, "the day after the long one must still render"
    assert "memorable" in txt, "journal prose must be present"


def test_pdf1_very_huge_journal_day_still_ok():
    """An even larger note (~25k chars) — well past the old ~5,400-char
    failure threshold — must also paginate without crashing."""
    huge = "word " * 5000  # ~25k chars
    t = _base_trip(days=[
        {"day_number": 1, "date": "2026-04-01", "name": "Mega", "notes": huge},
        {"day_number": 2, "date": "2026-04-02", "name": "After", "morning": "x"},
    ])
    b = _build_trip_pdf(t, {})
    assert b[:4] == b"%PDF"
    assert "After" in _pdf_text(b)


def test_pdf1_route_end_to_end_long_day(client, seed_user, auth_headers):
    """End-to-end: the route used to return 500 for a trip with one big
    journal day. Now it must return a valid application/pdf containing
    BOTH days."""
    from database import get_db
    tid = "trip-pdf-mk4-long"
    r = client.post("/api/trips", headers=auth_headers,
                    json={"trip": {"id": tid, "name": "Long Trip", "country": "Test"}})
    assert r.status_code == 200
    big = "Journaling: a very long entry. " * 250  # ~7.5k chars
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, date, name, notes) "
            "VALUES (?,?,?,?,?,?)",
            ("d1", tid, 1, "2026-04-01", "BigJournalDay", big),
        )
        c.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, date, name, morning) "
            "VALUES (?,?,?,?,?,?)",
            ("d2", tid, 2, "2026-04-02", "NormalDay", "Coffee at dawn"),
        )
        conn.commit()
    res = client.post(f"/api/trips/{tid}/pdf", headers=auth_headers,
                      json={"includeDayPins": False})
    assert res.status_code == 200, res.get_data(as_text=True)[:300]
    body = res.get_data()
    assert body[:4] == b"%PDF"
    txt = _pdf_text(body)
    assert "BigJournalDay" in txt
    assert "NormalDay" in txt


# ── PDF-2: itemised expenses section ─────────────────────────────────
def test_pdf2_expenses_section_appears_when_toggled():
    exps = [
        {"id": "e1", "who": "Alice", "label": "Dinner", "category_id": "food",
         "date": "2026-04-01", "value": 100.0, "currency": "EUR",
         "euro_value": 100.0, "splits": None, "is_settlement": 0},
        {"id": "e2", "who": "Bob", "label": "Taxi", "category_id": "transport",
         "date": "2026-04-02", "value": 8000.0, "currency": "JPY",
         "euro_value": 50.0, "splits": None, "is_settlement": 0},
        # settlement row — must be excluded from the spend list
        {"id": "e3", "who": "Alice", "label": "Payback", "category_id": "food",
         "date": "2026-04-03", "value": 30.0, "currency": "EUR",
         "euro_value": 30.0, "splits": None, "is_settlement": 1},
    ]
    t = _base_trip(expenses=exps, total_spend_eur=150.0)
    b = _build_trip_pdf(t, {"includeExpenses": True})
    txt = _pdf_text(b)
    assert "Expenses" in txt, "expenses section title must render"
    assert "Dinner" in txt and "Taxi" in txt, "each expense must be listed"
    assert "JPY 8,000" in txt, "JPY shows 0 decimals (currency-aware)"
    assert "Payback" not in txt, "settlement rows excluded from the spend list"


def test_pdf2_expenses_off_by_default():
    exps = [{"id": "e1", "who": "A", "label": "Dinner", "date": "2026-04-01",
             "value": 10.0, "currency": "EUR", "euro_value": 10.0,
             "splits": None, "is_settlement": 0}]
    b = _build_trip_pdf(_base_trip(expenses=exps), {})
    assert "Dinner" not in _pdf_text(b), "expenses must be opt-in (default off)"


# ── PDF-3: settle-up section ─────────────────────────────────────────
def test_pdf3_settle_section_appears_when_toggled():
    exps = [
        {"id": "e1", "who": "Alice", "label": "Dinner", "category_id": "food",
         "date": "2026-04-01", "value": 100.0, "currency": "EUR",
         "euro_value": 100.0, "splits": json.dumps({"Alice": 50, "Bob": 50}),
         "is_settlement": 0},
    ]
    setts = [{"id": "s1", "from_name": "Bob", "to_name": "Alice",
              "amount": 25.0, "currency": "EUR", "euro_value": 25.0,
              "created_at": "2026-04-04"}]
    t = _base_trip(
        companions_json=json.dumps([{"name": "Alice"}, {"name": "Bob"}]),
        expenses=exps, settlements=setts,
    )
    b = _build_trip_pdf(t, {"includeSettlements": True})
    txt = _pdf_text(b)
    assert "Settle up" in txt, "settle-up section title must render"
    # Bob owes Alice (he was split 50% of the €100 dinner Alice paid).
    assert ("owes" in txt) or ("is owed" in txt), "net balances must render"
    assert "paid" in txt, "recorded settlements list must render"


def test_pdf3_settle_off_by_default():
    exps = [{"id": "e1", "who": "A", "label": "x", "date": "2026-04-01",
             "value": 10.0, "currency": "EUR", "euro_value": 10.0,
             "splits": None, "is_settlement": 0}]
    b = _build_trip_pdf(_base_trip(expenses=exps), {})
    assert "Settle up" not in _pdf_text(b), "settle-up must be opt-in"


# ── PDF-4: photo embedding ───────────────────────────────────────────
def test_pdf4_photos_section_appears_when_toggled():
    data_url = _tiny_png_data_url()
    t = _base_trip(
        photos_json=json.dumps([{"src": data_url}, {"src": data_url}]),
        days=[{"id": "d1", "day_number": 1, "date": "2026-04-01",
               "name": "Day1", "morning": "x",
               "photos": json.dumps([data_url])}],
    )
    b = _build_trip_pdf(t, {"includePhotos": True})
    assert b[:4] == b"%PDF"
    assert "Photos" in _pdf_text(b), "photos section title must render"


def test_pdf4_photos_off_by_default():
    data_url = _tiny_png_data_url()
    t = _base_trip(photos_json=json.dumps([{"src": data_url}]))
    assert "Photos" not in _pdf_text(_build_trip_pdf(t, {})), \
        "photos must be opt-in"


def test_pdf4_bad_photo_src_fails_soft():
    """A garbage / non-image / unreachable src must not crash the build —
    it's silently skipped."""
    t = _base_trip(
        photos_json=json.dumps([
            "garbage-not-a-url",
            {"src": "data:image/png;base64,not-valid-base64!!!"},
            {"src": _tiny_png_data_url()},  # one good one
        ]),
    )
    b = _build_trip_pdf(t, {"includePhotos": True})
    assert b[:4] == b"%PDF", "bad photos must fail soft, never crash"


def test_pdf4_ssrf_guard_blocks_internal_hosts():
    """The photo fetcher must refuse non-public hosts (cloud metadata,
    loopback, RFC1918) so a user-controlled src can't probe the
    internal network."""
    assert pdfmod._is_public_http_url("http://169.254.169.254/latest/") is False
    assert pdfmod._is_public_http_url("http://127.0.0.1/x") is False
    assert pdfmod._is_public_http_url("http://10.0.0.5/x") is False
    assert pdfmod._is_public_http_url("http://localhost/x") is False
    # _load_photo_png must short-circuit to None WITHOUT a network call.
    assert pdfmod._load_photo_png("http://169.254.169.254/latest/meta") is None


def test_pdf4_route_day_select_includes_photos(client, seed_user, auth_headers):
    """The day SELECT used to omit `photos`. With photos toggled on, a
    day whose `photos` column holds a data URL must export OK (proving
    the column is fetched + flows into the builder)."""
    from database import get_db
    tid = "trip-pdf-mk4-photos"
    r = client.post("/api/trips", headers=auth_headers,
                    json={"trip": {"id": tid, "name": "Photo Trip", "country": "Test"}})
    assert r.status_code == 200
    data_url = _tiny_png_data_url()
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, date, name, morning, photos) "
            "VALUES (?,?,?,?,?,?,?)",
            ("d1", tid, 1, "2026-04-01", "PhotoDay", "Coffee",
             json.dumps([data_url])),
        )
        conn.commit()
    res = client.post(f"/api/trips/{tid}/pdf", headers=auth_headers,
                      json={"includePhotos": True, "includeDayPins": False})
    assert res.status_code == 200, res.get_data(as_text=True)[:300]
    assert res.get_data()[:4] == b"%PDF"


# ── PDF-5: i18n ──────────────────────────────────────────────────────
def test_pdf5_french_export_has_french_section_titles():
    t = _base_trip(days=[
        {"day_number": 1, "date": "2026-04-01", "name": "Premier", "morning": "café"},
    ])
    b = _build_trip_pdf(t, {"locale": "fr"})
    txt = _pdf_text(b)
    assert "Jour par jour" in txt, "FR day section title"
    assert "MATIN" in txt, "FR slot label (morning)"
    assert "PLAN DE VOYAGE" in txt, "FR chrome kicker"
    assert "Day-by-day" not in txt, "no English title should leak in a FR export"


def test_pdf5_spanish_and_portuguese_titles():
    days = [{"day_number": 1, "date": "2026-04-01", "name": "D", "morning": "x"}]
    es = _pdf_text(_build_trip_pdf(_base_trip(days=days), {"locale": "es"}))
    assert "Día a día" in es and "MAÑANA" in es
    pt = _pdf_text(_build_trip_pdf(_base_trip(days=days), {"locale": "pt"}))
    assert "Dia a dia" in pt and "MANHÃ" in pt


def test_pdf5_unknown_locale_falls_back_to_english():
    t = _base_trip(days=[{"day_number": 1, "date": "2026-04-01", "name": "D", "morning": "x"}])
    txt = _pdf_text(_build_trip_pdf(t, {"locale": "zz-XX"}))
    assert "Day-by-day" in txt, "unknown locale must fall back to English"


def test_pdf5_french_budget_total_label_translated():
    t = _base_trip(budgets=[
        {"label": "Hotel", "amount": 1000.0, "currency": "EUR",
         "original_amount": 1000.0, "original_currency": "EUR"},
    ])
    txt = _pdf_text(_build_trip_pdf(t, {"locale": "fr", "includeBudgets": True}))
    assert "Total prévu" in txt, "FR budget total label"


# ── PDF-6: currency-aware budget decimals ────────────────────────────
def test_pdf6_budget_decimals_currency_aware():
    t = _base_trip(budgets=[
        {"label": "Hotel", "amount": 1000.0, "currency": "EUR",
         "original_amount": 1100.50, "original_currency": "USD"},
        {"label": "Sushi", "amount": 50.0, "currency": "EUR",
         "original_amount": 8000, "original_currency": "JPY"},
    ])
    txt = _pdf_text(_build_trip_pdf(t, {"includeBudgets": True}))
    assert "USD 1,100.50" in txt, "USD must keep 2 decimals (cents preserved)"
    assert "JPY 8,000" in txt, "JPY has no minor unit → 0 decimals"
    assert "JPY 8,000.00" not in txt, "JPY must NOT show .00"


def test_pdf6_t_money_helper():
    """Unit-level check of the locale + currency-aware money formatter."""
    en = pdfmod._T("en")
    assert en.money("USD", 1100.5) == "USD 1,100.50"
    assert en.money("JPY", 8000) == "JPY 8,000"
    fr = pdfmod._T("fr")
    # fr uses comma decimal + dot grouping: 1.100,50
    assert fr.money("USD", 1100.5) == "USD 1.100,50"
