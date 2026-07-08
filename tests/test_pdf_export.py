"""PDF-export crash-guard regression tests (A6-B1).

Focus: the `is_settlement` flag read in `_expenses_section` / `_settle_section`
(src/routes/pdf/_render.py). A legacy / trip-ZIP-imported expense row can carry
a non-canonical flag value like 'true' or '1.5' (SQLite's loose column affinity
+ JSON import). The old `int(e.get("is_settlement") or 0)` raised ValueError
DURING story construction — outside doc.build's try/except — and the route only
catches RuntimeError, so it surfaced as an unhandled Flask 500. `_as_bool_int`
coerces those forms without raising.

Mirrors tests/test_pdf_mk4.py: drives `_build_trip_pdf` directly with the
static-map fetchers monkeypatched off (deterministic, no network).
"""

import io

import pytest

pypdf = pytest.importorskip("pypdf")

import routes.pdf as pdfmod  # noqa: E402
from routes.pdf import _build_trip_pdf  # noqa: E402


# ── helpers (mirrors test_pdf_mk4.py) ─────────────────────────────────
@pytest.fixture(autouse=True)
def _no_network_maps(monkeypatch):
    """Disable the Google Static Maps fetchers so the builder is fast +
    deterministic and never reaches the network in CI."""
    monkeypatch.setattr(pdfmod, "_fetch_cover_map", lambda *a, **k: None)
    monkeypatch.setattr(pdfmod, "_fetch_overview_pins_map", lambda *a, **k: None)
    monkeypatch.setattr(pdfmod, "_fetch_day_pin_map", lambda *a, **k: None)


def _pdf_text(b: bytes) -> str:
    return "\n".join((p.extract_text() or "") for p in pypdf.PdfReader(io.BytesIO(b)).pages)


def _base_trip(**over):
    t = {
        "id": "t",
        "name": "Grand Tour",
        "country": "Spain",
        "lat": 40.0,
        "lng": -3.0,
        "place_id": None,
        "companions_json": "[]",
        "marked_places_json": "[]",
        "checklist_json": "[]",
        "photos_json": "[]",
        "date_from": "2026-04-01",
        "date_to": "2026-04-10",
        "days": [],
        "budgets": [],
        "total_spend_eur": None,
        "expenses": [],
        "settlements": [],
    }
    t.update(over)
    return t


def _expense(**over):
    e = {
        "id": "e1",
        "who": "Alice",
        "label": "Dinner",
        "category_id": "food",
        "date": "2026-04-01",
        "value": 100.0,
        "currency": "EUR",
        "euro_value": 100.0,
        "splits": None,
        "is_settlement": 0,
    }
    e.update(over)
    return e


# ── A6-B1: non-canonical is_settlement flag must not crash the export ──
@pytest.mark.parametrize("flag", ["true", "True", "1.5", "yes", True, 1.5])
def test_a6b1_string_is_settlement_does_not_crash(flag):
    """A legacy / ZIP-imported settlement row can carry a truthy non-int
    is_settlement value ('true' / '1.5' / 'yes' / a real bool / a float).
    The old bare int('true') raised ValueError during story construction —
    an unhandled Flask 500. The export must now build a valid PDF and treat
    the row as a settlement (excluded from the itemised spend list)."""
    exps = [
        _expense(id="e1", label="RealSpend", value=40.0, is_settlement=0),
        # settlement row with a NON-canonical truthy flag — the crash trigger.
        _expense(id="e2", label="Payback", value=30.0, is_settlement=flag),
    ]
    t = _base_trip(expenses=exps, total_spend_eur=40.0)
    b = _build_trip_pdf(t, {"includeExpenses": True, "includeSettlements": True})
    assert b[:4] == b"%PDF", f"is_settlement={flag!r} must not crash the export"
    txt = _pdf_text(b)
    assert "RealSpend" in txt, "the genuine spend row must still render"
    assert "Payback" not in txt, "a truthy is_settlement row is excluded from the spend list"


def test_a6b1_as_bool_int_unit():
    """Unit-level table for the flag coercer: truthy strings/bools/numbers →
    1, everything falsey (incl. '0'/'false'/junk/None) → 0, and it NEVER
    raises (the whole point of the guard)."""
    from routes.pdf._render import _as_bool_int

    for truthy in (1, 1.5, True, "1", "true", "TRUE", "yes", "t", "Y"):
        assert _as_bool_int(truthy) == 1, f"{truthy!r} should read truthy"
    for falsey in (0, 0.0, False, "", "0", "false", "no", "nope", None, "abc"):
        assert _as_bool_int(falsey) == 0, f"{falsey!r} should read falsey"


def test_a6b1_falsey_string_is_settlement_stays_in_spend():
    """The mirror case: a row whose is_settlement is a falsey string ('0' /
    'false' / '') is a NORMAL expense and must appear in the itemised list
    (the old int('0') worked, but int('false') would have crashed here too)."""
    exps = [
        _expense(id="e1", label="KeepMe", value=25.0, is_settlement="false"),
    ]
    t = _base_trip(expenses=exps, total_spend_eur=25.0)
    b = _build_trip_pdf(t, {"includeExpenses": True})
    assert b[:4] == b"%PDF"
    assert "KeepMe" in _pdf_text(b), "a falsey-string is_settlement row is a real expense"
