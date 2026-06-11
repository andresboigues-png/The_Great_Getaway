#!/usr/bin/env python3
"""MK4 EXPENSES + multi-currency live harness (Option B, port 5083).

Drives the REAL Flask app in-process. Seeds a trip, hammers the
/api/expenses write path with many currencies (rate-backed, widened,
exotic/no-rate) and checks the money invariants from the briefing.

Run: .venv/bin/python scratch/audit_mk4/exp_harness.py
"""
import json
import os
import sys
import threading
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB = "/tmp/mk4_exp.db"
if os.path.exists(DB):
    os.remove(DB)
os.environ["GG_DB_PATH"] = DB
os.environ["GG_ALLOW_TEST_LOGIN"] = "1"
os.environ["GG_E2E"] = "1"
os.environ["GG_JWT_SECRET"] = "expmk4-0123456789abcdef0123456789abcdef"
os.environ["GG_UPLOAD_ROOT"] = "/tmp/mk4_exp_uploads"
os.makedirs(os.environ["GG_UPLOAD_ROOT"], exist_ok=True)
sys.path.insert(0, os.path.join(ROOT, "src"))

import requests  # noqa: E402
from werkzeug.serving import make_server  # noqa: E402
from database import init_db  # noqa: E402

init_db()
import main  # noqa: E402
import fx_rates  # noqa: E402

PORT = 5083
BASE = f"http://127.0.0.1:{PORT}"
ORIGIN = {"Origin": BASE}

PASS, FAIL = [], []
def ok(label, detail=""):
    PASS.append(label); print(f"  PASS [{label}] {detail}")
def bad(label, detail=""):
    FAIL.append((label, detail)); print(f"  ** FAIL [{label}] {detail}")

srv = make_server("127.0.0.1", PORT, main.app, threaded=True)
th = threading.Thread(target=srv.serve_forever, daemon=True); th.start()

def login(uid, name="User"):
    r = requests.post(f"{BASE}/api/auth/google",
                      json={"token": f"test:{uid}", "name": name},
                      headers=ORIGIN, timeout=10)
    return r.json()["token"]

def H(tok):
    h = {"Authorization": f"Bearer {tok}"}; h.update(ORIGIN); return h

def mk_trip(tok, name="MoneyTrip"):
    tid = str(uuid.uuid4())
    r = requests.post(f"{BASE}/api/trips", headers=H(tok), timeout=10,
                      json={"trip": {"id": tid, "name": name, "country": "Spain"}})
    assert r.status_code == 200, r.text
    return tid

def post_exp(tok, tid, **over):
    e = {"id": str(uuid.uuid4()), "tripId": tid, "who": "Alice",
         "label": "x", "date": "2024-05-01", "country": "Spain",
         "value": 100, "currency": "EUR", "categoryId": "cat1",
         "splits": {"Alice": 100}}
    e.update(over)
    r = requests.post(f"{BASE}/api/expenses", headers=H(tok), timeout=10,
                      json={"expense": e})
    return r, e

def get_data(tok):
    r = requests.get(f"{BASE}/api/data", headers=H(tok), timeout=10)
    return r.json()

def find_exp(data, eid):
    for e in data.get("expenses", []):
        if e["id"] == eid:
            return e
    return None

# Warm the FX cache so rate-backed assertions are deterministic.
fx_rates._maybe_refresh()
rate_usd = fx_rates.get_rate_eur("USD")
rate_jpy = fx_rates.get_rate_eur("JPY")
print(f"\nLive FX warm: USD->EUR={rate_usd} JPY->EUR={rate_jpy}")
print(f"ARS rate (expect None): {fx_rates.get_rate_eur('ARS')}")
print(f"VND rate (expect None): {fx_rates.get_rate_eur('VND')}")
print(f"EGP rate: {fx_rates.get_rate_eur('EGP')}")
print(f"COP rate: {fx_rates.get_rate_eur('COP')}")
print(f"CLP rate: {fx_rates.get_rate_eur('CLP')}")
print(f"TWD rate: {fx_rates.get_rate_eur('TWD')}")

tok = login("test-mk4exp", "Auditor")
tid = mk_trip(tok)
print(f"\n=== Trip {tid[:8]} created ===\n")

# ── 1. euro_value authority + anti-tamper (rate-backed) ──────────────
print("--- 1. euro_value authority/freeze ---")
if rate_usd:
    r, e = post_exp(tok, tid, value=200, currency="USD", euroValue=999999)
    if r.status_code == 200:
        ev = r.json().get("euroValue")
        expected = round(200 * rate_usd, 4)
        if abs(ev - expected) < 0.01:
            ok("USD server-authoritative", f"euroValue={ev} (client 999999 ignored)")
        else:
            bad("USD euro_value wrong", f"got {ev} expected {expected}")
        # freeze check: re-read later, must not re-convert
        d = get_data(tok); stored = find_exp(d, e["id"])
        if stored and abs(stored["euroValue"] - expected) < 0.01:
            ok("USD euro_value persisted+frozen", f"{stored['euroValue']}")
        else:
            bad("USD persist mismatch", f"{stored}")
    else:
        bad("USD post rejected", r.text)

# EUR: euro_value == value
r, e = post_exp(tok, tid, value=123.45, currency="EUR", euroValue=5)
if r.status_code == 200 and abs(r.json()["euroValue"] - 123.45) < 1e-6:
    ok("EUR euro_value==value", f"{r.json()['euroValue']}")
else:
    bad("EUR euro_value wrong", r.text)

# Edit-freeze: label-only edit must NOT re-stamp euro_value
if rate_usd:
    eid = str(uuid.uuid4())
    r, e = post_exp(tok, tid, id=eid, value=200, currency="USD")
    first_ev = r.json()["euroValue"]
    upd = r.json()["updatedAt"]
    # mutate cache to a wildly different rate, then label-only edit
    saved = dict(fx_rates._cache)
    fx_rates._cache["USD"] = 0.0001  # 1 USD = 0.0001 EUR now
    r2, _ = post_exp(tok, tid, id=eid, value=200, currency="USD",
                     label="renamed", clientUpdatedAt=upd)
    fx_rates._cache = saved
    if r2.status_code == 200 and abs(r2.json()["euroValue"] - first_ev) < 0.01:
        ok("Edit-freeze (label-only)", f"euroValue stayed {first_ev}")
    else:
        bad("Edit re-stamped euro_value", f"was {first_ev} now {r2.json().get('euroValue')}")

# ── 2. No-rate currency path ─────────────────────────────────────────
print("\n--- 2. no-rate currency (ARS/VND/...) ---")
for code in ["ARS", "VND", "CLP", "COP"]:
    if fx_rates.get_rate_eur(code) is not None:
        ok(f"{code} HAS live rate now", "(skip no-rate assertion)")
        continue
    # no euroValue -> must 400
    r, e = post_exp(tok, tid, value=50000, currency=code, euroValue=0)
    if r.status_code == 400:
        ok(f"{code} blocked without euroValue", r.json().get("error", "")[:50])
    else:
        bad(f"{code} accepted without euroValue!", f"status={r.status_code} body={r.text[:120]}")
    # with positive euroValue -> stored verbatim
    r, e = post_exp(tok, tid, value=50000, currency=code, euroValue=33.33)
    if r.status_code == 200 and abs(r.json()["euroValue"] - 33.33) < 1e-6:
        ok(f"{code} stored client euroValue", "33.33")
    else:
        bad(f"{code} manual euroValue mishandled", r.text[:120])

# ── 3. Splits ────────────────────────────────────────────────────────
print("\n--- 3. splits validation ---")
# all-zero -> 400 (require_full single path)
r, e = post_exp(tok, tid, splits={"Alice": 0, "Bob": 0})
if r.status_code == 400:
    ok("all-zero split rejected (single path)", r.json().get("error","")[:50])
else:
    bad("all-zero split accepted", f"{r.status_code} {r.text[:120]}")
# 33.34/33.33/33.33 = 100 accepted
r, e = post_exp(tok, tid, splits={"A": 33.34, "B": 33.33, "C": 33.33})
ok("even 3-way ~100 accepted", "") if r.status_code == 200 else bad("even 3-way rejected", r.text[:120])
# 99.9 (33.3x3) -> within 1.0 tol, accepted
r, e = post_exp(tok, tid, splits={"A": 33.3, "B": 33.3, "C": 33.3})
ok("33.3x3=99.9 accepted (tol)", "") if r.status_code == 200 else bad("99.9 rejected", r.text[:120])
# sum 50 -> rejected
r, e = post_exp(tok, tid, splits={"A": 25, "B": 25})
ok("sum=50 rejected", "") if r.status_code == 400 else bad("sum=50 accepted", f"{r.status_code}")
# split value >100 -> rejected
r, e = post_exp(tok, tid, splits={"A": 150})
ok("split>100 rejected", "") if r.status_code == 400 else bad("split>100 accepted", f"{r.status_code}")
# negative split -> rejected
r, e = post_exp(tok, tid, splits={"A": -10, "B": 110})
ok("negative split rejected", "") if r.status_code == 400 else bad("negative split accepted", f"{r.status_code}")
# splits as a list -> 400 not 500
r, e = post_exp(tok, tid, splits=[1, 2, 3])
ok("list splits -> 400", "") if r.status_code == 400 else bad("list splits not 400", f"{r.status_code} {r.text[:80]}")

# ── 4. Date validation + numeric edge ───────────────────────────────
print("\n--- 4. date + numeric edge ---")
for bad_date in ["not-a-date-99999", "2026-13-40", "05/01/2024", "2024-1-1", "20240501"]:
    r, e = post_exp(tok, tid, date=bad_date)
    ok(f"date '{bad_date}' rejected", "") if r.status_code == 400 else bad(f"date '{bad_date}' accepted", f"{r.status_code}")
# empty date allowed
r, e = post_exp(tok, tid, date="")
ok("empty date allowed", "") if r.status_code == 200 else bad("empty date rejected", r.text[:80])
# NaN / Infinity / negative / huge values
import math
for label, v in [("NaN", "nan"), ("Inf", "inf"), ("-Inf", "-inf"),
                 ("negative", -5), ("zero", 0), ("huge", 1e15),
                 ("string", "abc")]:
    r, e = post_exp(tok, tid, value=v)
    if r.status_code == 400:
        ok(f"value {label} -> 400", "")
    elif r.status_code >= 500:
        bad(f"value {label} -> 500!", r.text[:80])
    else:
        bad(f"value {label} accepted ({r.status_code})", "")
# fractional value accepted
r, e = post_exp(tok, tid, value=12.349, currency="EUR")
ok("fractional value accepted", f"{r.json().get('euroValue')}") if r.status_code == 200 else bad("fractional rejected", r.text[:80])

# ── 5. unknown currency ─────────────────────────────────────────────
print("\n--- 5. unknown / malformed currency ---")
for code in ["XXX", "BTC", "us", "USDD", "123", ""]:
    r, e = post_exp(tok, tid, currency=code)
    if code == "":
        ok("empty currency -> EUR default", "") if r.status_code == 200 else bad("empty currency rejected", r.text[:80])
    else:
        ok(f"currency '{code}' rejected", "") if r.status_code == 400 else bad(f"currency '{code}' accepted ({r.status_code})", r.text[:80])

# ── 6. optimistic concurrency 409 ───────────────────────────────────
print("\n--- 6. optimistic concurrency ---")
eid = str(uuid.uuid4())
r, e = post_exp(tok, tid, id=eid, value=10, currency="EUR")
stamp1 = r.json()["updatedAt"]
# first edit with correct stamp
r2, _ = post_exp(tok, tid, id=eid, value=11, currency="EUR", clientUpdatedAt=stamp1)
stamp2 = r2.json()["updatedAt"]
ok("fresh-stamp edit ok", f"{stamp1}->{stamp2}") if r2.status_code == 200 else bad("fresh edit failed", r2.text[:80])
# stale edit with stamp1 -> 409
r3, _ = post_exp(tok, tid, id=eid, value=12, currency="EUR", clientUpdatedAt=stamp1)
if r3.status_code == 409:
    ok("stale edit -> 409", "")
else:
    bad("stale edit not 409", f"{r3.status_code} {r3.text[:80]}")

# ── 7. unicode/emoji/huge labels ────────────────────────────────────
print("\n--- 7. unicode / xss / huge labels ---")
for label, lab in [("emoji", "🍜🎉日本"), ("xss", "<script>alert(1)</script>"),
                   ("rtl", "مرحبا"), ("nul", "a\x00b")]:
    r, e = post_exp(tok, tid, label=lab)
    if r.status_code >= 500:
        bad(f"label {label} -> 500", r.text[:80])
    else:
        ok(f"label {label} ok ({r.status_code})", "")
# huge label > 200 -> 400
r, e = post_exp(tok, tid, label="A" * 5000)
ok("huge label -> 400", "") if r.status_code == 400 else bad("huge label accepted", f"{r.status_code}")

# ── 8. MANY currencies smoke (rate-backed + widened) ────────────────
print("\n--- 8. many-currency smoke ---")
codes = ["EUR","USD","GBP","JPY","CHF","AUD","CAD","CNY","HKD","SGD",
         "SEK","NOK","DKK","MXN","BRL","INR","KRW","TRY","NZD","ZAR",
         "PLN","CZK","HUF","RON","BGN","ISK","ILS","AED","SAR","THB",
         "IDR","MYR","PHP","TWD"]
stored_ok = 0; refused = []
for c in codes:
    r, e = post_exp(tok, tid, value=100, currency=c, euroValue=50)
    if r.status_code == 200:
        stored_ok += 1
    elif r.status_code == 400 and "no live exchange" in r.text:
        refused.append(c)  # no-rate, no manual euro accepted? we sent euroValue=50
    else:
        bad(f"{c} unexpected", f"{r.status_code} {r.text[:60]}")
ok("many-currency stored", f"{stored_ok}/{len(codes)} accepted; refused={refused}")

# Verify a HUF (large-denomination) round-trips with a real rate
r_huf = fx_rates.get_rate_eur("HUF")
if r_huf:
    r, e = post_exp(tok, tid, value=400000, currency="HUF", euroValue=1)
    exp = round(400000 * r_huf, 4)
    if r.status_code == 200 and abs(r.json()["euroValue"] - exp) < 0.01:
        ok("HUF 400k server-converted", f"{r.json()['euroValue']} (client 1 ignored)")
    else:
        bad("HUF conversion wrong", f"{r.json().get('euroValue')} vs {exp}")

print("\n" + "="*60)
print(f"RESULT: {len(PASS)} pass / {len(FAIL)} fail")
if FAIL:
    print("FAILURES:")
    for l, d in FAIL:
        print(f"  - {l}: {d}")
srv.shutdown()
