#!/usr/bin/env python3
"""p02 API edge-case probes for expenses + budgets + pdf + insights endpoints."""
import json
import sys
import requests

BASE = "http://127.0.0.1:5102"
ORIGIN = BASE


def login(token_id, name):
    r = requests.post(f"{BASE}/api/auth/google", json={"token": token_id, "name": name})
    return r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Origin": ORIGIN, "Content-Type": "application/json"}


def post_expense(tok, exp):
    return requests.post(f"{BASE}/api/expenses", headers=H(tok), json={"expense": exp})


def post_budget(tok, bud):
    return requests.post(f"{BASE}/api/budgets", headers=H(tok), json={"budget": bud})


def gen_id(p="x"):
    import uuid
    return f"{p}-{uuid.uuid4().hex[:12]}"


tok = login("test:test-user-1", "Alex Rivera")
print("=== EXPENSE EDGE CASES (trip-lisbon) ===")

cases = [
    ("zero value", {"value": 0, "currency": "EUR", "label": "zero", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("negative value", {"value": -50, "currency": "EUR", "label": "neg", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("huge value 1e12", {"value": 1e12, "currency": "EUR", "label": "huge", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("NaN value", {"value": float("nan"), "currency": "EUR", "label": "nan", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("Infinity value (as string)", {"value": "Infinity", "currency": "EUR", "label": "inf", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("many decimals", {"value": 12.3456789, "currency": "EUR", "label": "decimals", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("unknown currency XYZ", {"value": 10, "currency": "XYZ", "label": "xyz", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("weird date string", {"value": 10, "currency": "EUR", "label": "weird date", "who": "Alex", "categoryId": "food", "date": "not-a-date-99999"}),
    ("future date 2099", {"value": 10, "currency": "EUR", "label": "future", "who": "Alex", "categoryId": "food", "date": "2099-12-31"}),
    ("empty date", {"value": 10, "currency": "EUR", "label": "no date", "who": "Alex", "categoryId": "food", "date": ""}),
    ("very long label 500 chars", {"value": 10, "currency": "EUR", "label": "L" * 500, "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("emoji label", {"value": 10, "currency": "EUR", "label": "🍕🍔🌮 dinner 🎉", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("client euroValue spoof JPY", {"value": 1, "currency": "JPY", "label": "spoof", "who": "Alex", "categoryId": "food", "date": "2026-06-12", "euroValue": 1000000}),
    ("missing who", {"value": 10, "currency": "EUR", "label": "no who", "categoryId": "food", "date": "2026-06-12"}),
    ("missing category", {"value": 10, "currency": "EUR", "label": "no cat", "who": "Alex", "date": "2026-06-12"}),
    ("missing label (required client-side)", {"value": 10, "currency": "EUR", "who": "Alex", "categoryId": "food", "date": "2026-06-12"}),
    ("splits sum to 99", {"value": 100, "currency": "EUR", "label": "split99", "who": "Alex", "categoryId": "food", "date": "2026-06-12", "splits": {"Alex": 49, "Sara": 50}}),
    ("splits sum to 150", {"value": 100, "currency": "EUR", "label": "split150", "who": "Alex", "categoryId": "food", "date": "2026-06-12", "splits": {"Alex": 100, "Sara": 50}}),
    ("split pct 0", {"value": 100, "currency": "EUR", "label": "split0", "who": "Alex", "categoryId": "food", "date": "2026-06-12", "splits": {"Alex": 0, "Sara": 0}}),
]
for name, base in cases:
    eid = gen_id("exp")
    exp = {"id": eid, "tripId": "trip-lisbon", **base}
    try:
        r = post_expense(tok, exp)
        body = r.text[:160].replace("\n", " ")
        print(f"  [{r.status_code}] {name}: {body}")
    except Exception as ex:
        print(f"  [ERR-SEND] {name}: {ex}")

print("\n=== BUDGET EDGE CASES ===")
bcases = [
    ("zero amount", {"amount": 0, "currency": "EUR", "label": "zero bud", "tripId": "trip-lisbon"}),
    ("negative amount", {"amount": -100, "currency": "EUR", "label": "neg bud", "tripId": "trip-lisbon"}),
    ("NaN amount", {"amount": float("nan"), "currency": "EUR", "label": "nan bud", "tripId": "trip-lisbon"}),
    ("huge amount", {"amount": 1e12, "currency": "EUR", "label": "huge bud", "tripId": "trip-lisbon"}),
    ("no label", {"amount": 500, "currency": "EUR", "tripId": "trip-lisbon", "categoryId": "transport"}),
    ("currency mismatch USD budget", {"amount": 500, "currency": "USD", "label": "usd bud", "tripId": "trip-lisbon", "categoryId": "accommodation"}),
    ("all-trips global", {"amount": 5000, "currency": "EUR", "label": "global", "tripId": "all"}),
    ("dup scope (Food already exists tripId lisbon cat food)", {"amount": 999, "currency": "EUR", "label": "dup food", "tripId": "trip-lisbon", "categoryId": "food"}),
]
for name, base in bcases:
    bid = gen_id("bud")
    bud = {"id": bid, **base}
    try:
        r = post_budget(tok, bud)
        body = r.text[:160].replace("\n", " ")
        print(f"  [{r.status_code}] {name}: {body}")
    except Exception as ex:
        print(f"  [ERR-SEND] {name}: {ex}")

print("\n=== PDF EXPORT (lisbon, full) ===")
r = requests.post(f"{BASE}/api/trips/trip-lisbon/pdf", headers=H(tok), json={})
print(f"  status={r.status_code} content-type={r.headers.get('content-type')} bytes={len(r.content)}")
if r.headers.get('content-type', '').startswith('application/pdf'):
    with open('/tmp/p02_lisbon.pdf', 'wb') as f:
        f.write(r.content)
    print("  saved /tmp/p02_lisbon.pdf")
else:
    print("  body:", r.text[:200])

print("\n=== INSIGHTS endpoint? ===")
for ep in ["/api/insights", "/api/insights/trip-lisbon"]:
    r = requests.get(f"{BASE}{ep}", headers=H(tok))
    print(f"  GET {ep} -> {r.status_code} {r.text[:100].replace(chr(10),' ')}")
