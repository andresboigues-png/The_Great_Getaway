#!/usr/bin/env python3
"""MK4 PDF-export audit harness. Findings-only; touches a temp DB.

Two layers:
  A) live threaded server on port 5089 — IDOR gate + real end-to-end
     PDF of a rich trip seeded via real endpoints + direct DB inserts
     for trip_days/expenses/settlements (no public day/expense write
     endpoint exists for the multi-currency shapes we need).
  B) direct _build_trip_pdf(trip_row, options) calls for exhaustive
     edge/robustness/section coverage with full byte inspection via
     pypdf text extraction.
"""
import os
import sys
import threading
import traceback

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_pdf.db"
UP = "/tmp/mk4_pdf_uploads"
for p in (DB,):
    if os.path.exists(p):
        os.remove(p)
os.environ["GG_DB_PATH"] = DB
os.environ["GG_ALLOW_TEST_LOGIN"] = "1"
os.environ["GG_E2E"] = "1"
os.environ["GG_JWT_SECRET"] = "mk4pdf-secret-0123456789abcdef0123456789abcdef"
os.environ["GG_UPLOAD_ROOT"] = UP
os.makedirs(UP, exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "src"))

import requests  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402
from database import init_db, get_db  # noqa: E402

init_db()
import main  # noqa: E402
import routes.pdf as pdfmod  # noqa: E402
from routes.pdf import _build_trip_pdf  # noqa: E402
import pypdf  # noqa: E402
import io  # noqa: E402

PORT = 5089
BASE = f"http://127.0.0.1:{PORT}"

RESULTS = []


def note(tag, msg):
    RESULTS.append((tag, msg))
    print(f"[{tag}] {msg}")


def pdf_text(b):
    return "\n".join((p.extract_text() or "") for p in pypdf.PdfReader(io.BytesIO(b)).pages)


def npages(b):
    return len(pypdf.PdfReader(io.BytesIO(b)).pages)


# ───────────────────────── Layer A: live server ─────────────────────────
srv = make_server("127.0.0.1", PORT, main.app, threaded=True)
th = threading.Thread(target=srv.serve_forever, daemon=True)
th.start()


def login(uid):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/google", json={"token": f"test:{uid}", "name": uid})
    r.raise_for_status()
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    s.headers["Origin"] = BASE
    return s


def layer_a():
    print("\n===== LAYER A: live server =====")
    owner = login("test-owner")
    stranger = login("test-stranger")

    # Create a rich trip.
    tid = "mk4-rich"
    r = owner.post(f"{BASE}/api/trips", json={"trip": {
        "id": tid, "name": "Grand Tour ✦ <b>2026</b>", "country": "Portugal & España",
        "isPublic": False, "lat": 38.72, "lng": -9.14, "placeId": "abc",
        "companions": [{"name": "José María", "role": "Driver"},
                       {"name": "陈太太", "role": "Guide"},
                       {"name": "O'Brien & <Sons>", "role": ""}],
    }})
    note("A-create", f"create trip status={r.status_code}")

    # Marked places + checklist via media endpoint.
    r = owner.post(f"{BASE}/api/trips/{tid}/media", json={
        "markedPlaces": [
            {"name": "Belém Tower", "address": "Av. Brasília, Lisboa", "lat": 38.69, "lng": -9.21},
            {"name": "Sagrada Família <test>", "address": "Barcelona", "lat": 41.40, "lng": 2.17},
        ],
        "checklist": [
            {"text": "Book hotel", "category": "Prep", "completed": True},
            {"text": "Pack passport & <visa>", "category": "Prep", "completed": False},
            {"text": "Exchange €€€", "category": "Money", "done": False},
        ],
    })
    note("A-media", f"media write status={r.status_code}")

    # Budgets — multiple currencies + scopes via real endpoint.
    for bid, scope, amt, oamt, ocur in [
        ("b1", "all", 1000.0, 1100.0, "USD"),
        ("b2", "all", 500.0, 80000.0, "JPY"),
        ("b3", "all", 300.0, 300.0, "EUR"),
    ]:
        rr = owner.post(f"{BASE}/api/budgets", json={"budget": {
            "id": bid, "tripId": tid, "categoryId": "all", "user": "all",
            "amount": amt, "originalAmount": oamt, "originalCurrency": ocur,
        }})
        if rr.status_code not in (200, 201):
            note("A-budget", f"budget {bid} status={rr.status_code} {rr.text[:120]}")

    # Direct DB inserts for many days + multi-currency expenses + a settlement.
    with get_db() as conn:
        c = conn.cursor()
        for i in range(1, 18):  # 17 days
            c.execute(
                "INSERT INTO trip_days (id, trip_id, day_number, date, name, morning, afternoon, evening, tip, notes, lat, lng) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (f"d{i}", tid, i, f"2026-04-{i:02d}", f"Day {i} City",
                 f"Breakfast: - Café {i} Why: great pastries Fun fact: oldest in town",
                 "Sightseeing: - Castle Why: history Fun fact: built 1400 - Museum Why: art Fun fact: huge",
                 "Dinner at a nice spot.", f"Tip {i}: bring cash",
                 "Journaling: today was lovely & <memorable>. Cost ~€50.",
                 38.7 + i * 0.01, -9.1 - i * 0.01))
        # Day 0 anchor (should be dropped).
        c.execute("INSERT INTO trip_days (id, trip_id, day_number, date, name, lat, lng) VALUES (?,?,?,?,?,?,?)",
                  ("d0", tid, 0, "2026-04-01", "Anchor", 38.7, -9.1))
        # Multi-currency expenses (euro_value drives totals).
        for j, (cur, val, ev, settle) in enumerate([
            ("EUR", 50.0, 50.0, 0), ("USD", 110.0, 100.0, 0),
            ("JPY", 8000.0, 50.0, 0), ("GBP", 40.0, 47.0, 0),
            ("EUR", 30.0, 30.0, 1),  # settlement — must be excluded from total
        ]):
            c.execute(
                "INSERT INTO expenses (id, who, trip_id, value, currency, euro_value, "
                "label, category_id, date, is_settlement) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (f"e{j}", "test-owner", tid, val, cur, ev, f"Expense {j}", "food",
                 f"2026-04-{j+1:02d}", settle))
        conn.commit()

    # IDOR: stranger exports owner's private trip.
    r = stranger.post(f"{BASE}/api/trips/{tid}/pdf", json={})
    note("A-IDOR", f"stranger export private trip → {r.status_code} (expect 403)")
    if r.status_code != 403:
        note("A-IDOR-FAIL", f"IDOR NOT BLOCKED: {r.status_code} {r.text[:200]}")

    # Owner full export.
    r = owner.post(f"{BASE}/api/trips/{tid}/pdf", json={})
    note("A-export", f"owner full export → {r.status_code}, magic={r.content[:4]!r}, bytes={len(r.content)}")
    if r.status_code == 200 and r.content[:4] == b"%PDF":
        with open(os.path.join(ROOT, "scratch", "audit_mk4", "sample_full_trip.pdf"), "wb") as f:
            f.write(r.content)
        txt = pdf_text(r.content)
        note("A-pages", f"pages={npages(r.content)}")
        # Completeness checks.
        checks = {
            "cover title": "Grand Tour" in txt,
            "day 1": "Day 1" in txt or "DAY 1" in txt.upper(),
            "day 17": "Day 17" in txt or "17" in txt,
            "journaling/notes present": "lovely" in txt or "memorable" in txt or "Journaling" in txt,
            "tip present": "bring cash" in txt,
            "fun fact rendered": "oldest in town" in txt or "built 1400" in txt,
            "checklist item": "Book hotel" in txt,
            "budget Overall label": "Overall" in txt,
            "budget USD row": "USD" in txt,
            "budget JPY row": "JPY" in txt,
            "EUR-normalised total label": "EUR-normalised" in txt,
            "companion José": "Jos" in txt,  # accents
            "companion CJK 陈": "陈" in txt,
            "marked place Belém": "Bel" in txt,
            "expense section present": "Expense 0" in txt or "Expenses" in txt,
            "settlement listed": "Settlement" in txt or "settle" in txt.lower(),
        }
        for k, v in checks.items():
            note("A-complete" if v else "A-MISSING", f"{k}: {'OK' if v else 'NOT FOUND'}")
        # Money correctness: total spend should EXCLUDE the €30 settlement.
        # euro_value sum of non-settlement = 50+100+50+47 = 247.
        note("A-money", "expected Actual trip spend EUR 247 (excludes €30 settlement)")
        import re
        m = re.search(r"Actual trip spend[^\d]*([\d,]+)", txt)
        if m:
            note("A-money-actual", f"PDF shows Actual trip spend = {m.group(1)}")
        # Total planned EUR-normalised should be 1000+500+300 = 1800.
        m2 = re.search(r"Total planned[^\d]*([\d,]+)", txt)
        if m2:
            note("A-money-planned", f"PDF shows Total planned = {m2.group(1)} (expect 1,800)")
        # Save extracted text for inspection.
        with open(os.path.join(ROOT, "scratch", "audit_mk4", "sample_full_trip.txt"), "w") as f:
            f.write(txt)
    else:
        note("A-export-FAIL", f"no PDF: {r.text[:300]}")

    # i18n: try to pass a locale in options (route ignores it?).
    r = owner.post(f"{BASE}/api/trips/{tid}/pdf", json={"lang": "fr", "locale": "fr", "includeBudgets": True, "includeDays": True})
    if r.status_code == 200 and r.content[:4] == b"%PDF":
        txt = pdf_text(r.content)
        fr_headers = any(w in txt for w in ["Jour", "Au jour le jour", "Budgets", "Compagnons", "Lieux"])
        en_headers = "Day-by-day" in txt
        note("A-i18n", f"FR-requested export: English 'Day-by-day' present={en_headers}; any FR header={fr_headers}")


# ───────────────────────── Layer B: direct builder ─────────────────────────
def base_trip(**over):
    t = {
        "id": "t", "name": "Test Trip", "country": "Spain",
        "lat": 40.0, "lng": -3.0, "place_id": None,
        "companions_json": "[]", "marked_places_json": "[]", "checklist_json": "[]",
        "date_from": "2026-04-01", "date_to": "2026-04-10",
        "days": [], "budgets": [], "total_spend_eur": None,
    }
    t.update(over)
    return t


# Disable network map fetches to keep Layer B fast/deterministic.
def _no_map(*a, **k):
    return None


def layer_b():
    print("\n===== LAYER B: direct _build_trip_pdf =====")
    pdfmod._fetch_cover_map = _no_map
    pdfmod._fetch_overview_pins_map = _no_map
    pdfmod._fetch_day_pin_map = _no_map

    full_opts = {}  # all default True

    # B1: HTML injection in labels/fields — does it escape or break?
    t = base_trip(
        name="<b>Pwned</b> & <script>alert(1)</script>",
        companions_json='[{"name":"<img src=x onerror=alert(1)>","role":"<i>r</i>"}]',
        marked_places_json='[{"name":"<h1>Big</h1>","address":"<&>","lat":40,"lng":-3}]',
        budgets=[{"label": "<b>EvilLabel</b>", "amount": 100, "currency": "EUR",
                  "original_amount": 100, "original_currency": "EUR"}],
        days=[{"day_number": 1, "date": "2026-04-01", "name": "<u>Day</u>",
               "morning": "Plain <b>html</b> text & more", "notes": "n"}],
    )
    try:
        b = _build_trip_pdf(t, full_opts)
        txt = pdf_text(b)
        leaked = "<script>" in txt or "<b>Pwned" in txt
        note("B1-inject", f"raw tag in text? {leaked} (escaped is good). "
                          f"'Pwned' visible literally={'Pwned' in txt}")
    except Exception as e:
        note("B1-CRASH", f"HTML-injection trip crashed: {e!r}")

    # B2: fractional / non-numeric / huge day_number (PLAT-7).
    t = base_trip(days=[
        {"day_number": 1.5, "date": "2026-04-01", "name": "Frac", "morning": "x"},
        {"day_number": "abc", "date": "2026-04-02", "name": "Garbage", "morning": "y"},
        {"day_number": 99999999999, "date": "2026-04-03", "name": "Huge", "morning": "z"},
        {"day_number": -3, "date": "2026-04-04", "name": "Neg", "morning": "w"},
    ])
    try:
        b = _build_trip_pdf(t, full_opts)
        note("B2-daynum", f"fractional/garbage/huge/neg day_number OK, pages={npages(b)}, "
                          f"'Frac' present={'Frac' in pdf_text(b)}")
    except Exception as e:
        note("B2-CRASH", f"bad day_number crashed: {e!r}")

    # B3: garbage dates.
    t = base_trip(date_from="not-a-date", date_to="2026-13-99",
                  days=[{"day_number": 1, "date": "garbage", "name": "D", "morning": "x"}])
    try:
        b = _build_trip_pdf(t, full_opts)
        note("B3-dates", f"garbage dates OK, pages={npages(b)}")
    except Exception as e:
        note("B3-CRASH", f"garbage dates crashed: {e!r}")

    # B4: 0 days, 0 expenses, 0 everything.
    t = base_trip(days=[], budgets=[], companions_json="[]",
                  marked_places_json="[]", checklist_json="[]",
                  date_from=None, date_to=None)
    try:
        b = _build_trip_pdf(t, full_opts)
        txt = pdf_text(b)
        note("B4-empty", f"empty trip OK, pages={npages(b)}, "
                         f"cover-only hint present={'cover-only' in txt}")
    except Exception as e:
        note("B4-CRASH", f"empty trip crashed: {e!r}")

    # B5: huge text in a note (LayoutError path).
    huge = "word " * 20000  # ~100k chars, no break opportunity per paragraph
    t = base_trip(days=[{"day_number": 1, "date": "2026-04-01", "name": "Big",
                         "notes": huge}])
    try:
        b = _build_trip_pdf(t, full_opts)
        note("B5-huge", f"100k-char note OK, pages={npages(b)}")
    except RuntimeError as e:
        note("B5-runtime", f"100k-char note → friendly RuntimeError (handled): {str(e)[:80]}")
    except Exception as e:
        note("B5-CRASH", f"100k-char note crashed UNHANDLED: {e!r}")

    # B6: mixed-currency budget total mislabeled? (PLAT-1/BUG-21)
    t = base_trip(budgets=[
        {"label": "", "amount": 1000.0, "currency": "EUR", "category_id": None,
         "owner_name": "", "original_amount": 1100.0, "original_currency": "USD"},
        {"label": "", "amount": 500.0, "currency": "EUR", "category_id": None,
         "owner_name": "", "original_amount": 80000.0, "original_currency": "JPY"},
    ], total_spend_eur=247.0)
    try:
        b = _build_trip_pdf(t, full_opts)
        txt = pdf_text(b)
        note("B6-budget", f"mixed-cur budgets: USD row={'USD' in txt}, JPY row={'JPY' in txt}, "
                          f"total EUR 1,500 present={'1,500' in txt}, "
                          f"Untitled present={'Untitled' in txt}, "
                          f"Overall label={'Overall' in txt}")
        # Does it wrongly sum originals as if EUR? 1100+80000=81100 would appear if buggy.
        note("B6-budget-mix", f"buggy-sum 81,100 present (should be FALSE)={'81,100' in txt}")
    except Exception as e:
        note("B6-CRASH", f"mixed-cur budget crashed: {e!r}")

    # B7: budget legacy row missing original_* + missing label + category scope.
    t = base_trip(budgets=[
        {"label": "", "amount": 200.0, "currency": "USD", "category_id": "cat1",
         "owner_name": "Bruno", "original_amount": None, "original_currency": None},
    ])
    try:
        b = _build_trip_pdf(t, full_opts)
        txt = pdf_text(b)
        note("B7-budget-legacy", f"legacy budget: label has Bruno={'Bruno' in txt}, "
                                 f"falls back to currency USD={'USD' in txt}, "
                                 f"Untitled absent={'Untitled' not in txt}")
    except Exception as e:
        note("B7-CRASH", f"legacy budget crashed: {e!r}")

    # B8: emoji / RTL / CJK everywhere.
    t = base_trip(
        name="旅行 🧳 رحلة Москва",
        companions_json='[{"name":"أحمد محمد","role":"دليل"},{"name":"Дмитрий","role":""}]',
        days=[{"day_number": 1, "date": "2026-04-01", "name": "東京 🗼",
               "morning": "朝食 😋 breakfast", "notes": "メモ note 📝"}],
    )
    try:
        b = _build_trip_pdf(t, full_opts)
        txt = pdf_text(b)
        note("B8-unicode", f"unicode/emoji/RTL OK, pages={npages(b)}, "
                           f"CJK 東京 present={'東京' in txt}, "
                           f"Arabic present={'أحمد' in txt or 'دليل' in txt}, "
                           f"Cyrillic present={'Москва' in txt or 'Дмитрий' in txt}")
    except Exception as e:
        note("B8-CRASH", f"unicode trip crashed: {e!r}")

    # B9: very long trip — 60 days, pagination sanity.
    days = [{"day_number": i, "date": f"2026-04-{(i % 28) + 1:02d}", "name": f"Day {i}",
             "morning": f"Morning {i}", "afternoon": f"Afternoon {i}",
             "evening": f"Evening {i}", "notes": f"Notes {i}", "tip": f"Tip {i}"}
            for i in range(1, 61)]
    t = base_trip(days=days)
    try:
        b = _build_trip_pdf(t, full_opts)
        note("B9-long", f"60-day trip OK, pages={npages(b)}")
    except Exception as e:
        note("B9-CRASH", f"60-day trip crashed: {e!r}")

    # B10: total_spend_eur as float with int() conversion on cover.
    t = base_trip(total_spend_eur=1234.99, days=[{"day_number": 1, "date": "2026-04-01",
                  "name": "D", "morning": "x"}])
    try:
        b = _build_trip_pdf(t, full_opts)
        txt = pdf_text(b)
        note("B10-stat", f"cover spend tile: €1,234 present={'1,234' in txt} (int-truncated)")
    except Exception as e:
        note("B10-CRASH", f"cover stat crashed: {e!r}")

    # B11: checklist with no category + done/completed mix.
    t = base_trip(checklist_json='[{"text":"a","completed":true},{"name":"b","done":false},{"text":"c"}]')
    try:
        b = _build_trip_pdf(t, full_opts)
        txt = pdf_text(b)
        note("B11-checklist", f"checklist OK, 'General' group={'General' in txt or 'GENERAL' in txt}")
    except Exception as e:
        note("B11-CRASH", f"checklist crashed: {e!r}")

    # B12: budget with NaN/inf amount (defensive).
    t = base_trip(budgets=[{"label": "x", "amount": float("inf"), "currency": "EUR",
                            "original_amount": float("nan"), "original_currency": "EUR"}])
    try:
        b = _build_trip_pdf(t, full_opts)
        note("B12-naninf", f"NaN/inf budget amount OK, pages={npages(b)}")
    except Exception as e:
        note("B12-CRASH", f"NaN/inf budget crashed: {e!r}")

    # B13: malformed JSON columns (string that isn't JSON).
    t = base_trip(companions_json="{bad json", marked_places_json="nope",
                  checklist_json="[[[")
    try:
        b = _build_trip_pdf(t, full_opts)
        note("B13-badjson", f"malformed JSON columns OK, pages={npages(b)}")
    except Exception as e:
        note("B13-CRASH", f"malformed JSON crashed: {e!r}")

    # B14: two "Day 1" badge bug check — day with no number but a name.
    t = base_trip(days=[
        {"day_number": None, "date": "2026-04-01", "name": "Arrival", "morning": "x"},
        {"day_number": 1, "date": "2026-04-02", "name": "First", "morning": "y"},
    ])
    try:
        b = _build_trip_pdf(t, full_opts)
        txt = pdf_text(b)
        # day_number None + name → _day_has_content requires name AND day_number,
        # so the None-number day is DROPPED. Check it.
        note("B14-badge", f"day(no number)+named: 'Arrival' present={'Arrival' in txt} "
                          f"(dropped if False), bullet badge '•' fallback handling")
    except Exception as e:
        note("B14-CRASH", f"day badge crashed: {e!r}")


if __name__ == "__main__":
    try:
        layer_a()
    except Exception:
        traceback.print_exc()
    try:
        layer_b()
    except Exception:
        traceback.print_exc()
    print("\n===== SUMMARY =====")
    miss = [r for r in RESULTS if "MISSING" in r[0] or "CRASH" in r[0] or "FAIL" in r[0]]
    print(f"total notes={len(RESULTS)}, flags={len(miss)}")
    for tag, msg in miss:
        print(f"  !! [{tag}] {msg}")
    srv.shutdown()
