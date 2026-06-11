#!/usr/bin/env python3
"""Phase 2 — add 15 multi-currency expenses, capture frozen euroValues,
do the 50/50 balance arithmetic by hand, and replicate the balance engine.
"""
import json
import requests
from http.cookiejar import DefaultCookiePolicy

BASE = "http://127.0.0.1:5153"
ORIGIN = "http://127.0.0.1:5153"
TRIP_ID = "trip-p2-asia"

S = requests.Session()
S.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))


def auth(tok, name):
    r = S.post(f"{BASE}/api/auth/google", json={"token": tok, "name": name},
               headers={"Origin": ORIGIN}, timeout=15)
    r.raise_for_status()
    return r.json()["token"]


def hdr(jwt):
    return {"Origin": ORIGIN, "Authorization": f"Bearer {jwt}",
            "Content-Type": "application/json"}


def post(path, jwt, body):
    return S.post(f"{BASE}{path}", headers=hdr(jwt), data=json.dumps(body), timeout=20)


def get(path, jwt):
    return S.get(f"{BASE}{path}", headers=hdr(jwt), timeout=20)


def jp(r):
    try:
        return r.json()
    except Exception:
        return {"_raw": r.text[:400]}


alex = auth("test:test-user-1", "Alex")
sara = auth("test:test-user-2", "Sara")

# Live rates captured from /api/fx-rates (X -> EUR).
RATES = jp(get("/api/fx-rates", alex))
RATES = RATES.get("rates", RATES)
print("LIVE RATES:", {k: RATES.get(k) for k in ["EUR", "JPY", "THB", "KRW"]})

# ── 15 expenses. (label, currency, value, who, date, country) ─────────
# Alternate payer; all split 50/50. Spread across the 9 days/3 countries.
EXP = [
    ("JR Rail Pass",        "JPY", 28000, "Alex", "2026-07-01", "Japan"),
    ("Ramen dinner",        "JPY",  4500, "Sara", "2026-07-01", "Japan"),
    ("Shibuya sushi",       "JPY", 12000, "Alex", "2026-07-02", "Japan"),
    ("TeamLab tickets",     "JPY",  7600, "Sara", "2026-07-02", "Japan"),
    ("Capsule hotel",       "JPY", 16000, "Alex", "2026-07-03", "Japan"),
    ("Tokyo metro cards",   "JPY",  3000, "Sara", "2026-07-03", "Japan"),
    ("Thai massage",        "THB",  1200, "Sara", "2026-07-04", "Thailand"),
    ("Street food night",   "THB",   350, "Alex", "2026-07-04", "Thailand"),
    ("Grand Palace entry",  "THB",   500, "Sara", "2026-07-05", "Thailand"),
    ("Riverside hotel BKK", "THB",  2800, "Alex", "2026-07-05", "Thailand"),
    ("Tuk-tuk + market",    "THB",   600, "Sara", "2026-07-06", "Thailand"),
    ("Korean BBQ",          "KRW", 45000, "Alex", "2026-07-07", "South Korea"),
    ("Gyeongbokgung tour",  "KRW", 30000, "Sara", "2026-07-08", "South Korea"),
    ("Myeongdong shopping", "KRW", 88000, "Alex", "2026-07-08", "South Korea"),
    ("Airport limousine",   "EUR",    35, "Sara", "2026-07-09", "South Korea"),
]

results = []
post_shapes = set()
for i, (label, cur, val, who, date, country) in enumerate(EXP):
    body = {"expense": {
        "id": f"exp-p2-{i+1:02d}", "tripId": TRIP_ID, "label": label,
        "categoryId": "food" if "food" in label.lower() or "BBQ" in label or "sushi" in label.lower() or "ramen" in label.lower() else "activity",
        "value": val, "currency": cur, "who": who, "date": date,
        "country": country,
        "splits": {"Alex": 50, "Sara": 50},
    }}
    poster = alex if who == "Alex" else sara
    r = post("/api/expenses", poster, body)
    j = jp(r)
    post_shapes.add(tuple(sorted(j.keys())))
    results.append({
        "id": f"exp-p2-{i+1:02d}",
        "label": label, "cur": cur, "val": val, "who": who, "date": date,
        "status": r.status_code, "euroValue": None,  # filled from /api/data
        "expected_ev": round(val * RATES.get(cur, 1), 4),
    })
print("POST response shapes:", post_shapes)

# euroValue is NOT echoed by the POST (returns {status, updatedAt}); read it
# back from /api/data, which is the canonical frozen value.
data = jp(get("/api/data", alex))
ev_by_id = {e["id"]: e.get("euroValue") for e in data.get("expenses", [])
            if e.get("tripId") == TRIP_ID}
for r in results:
    r["euroValue"] = ev_by_id.get(r["id"])
    print(f"{r['label']:22s} {r['cur']} {r['val']:>7} {r['who']:5s} -> {r['status']} "
          f"euroValue={r['euroValue']} (expect ~{r['expected_ev']})")

# ── Hand arithmetic ───────────────────────────────────────────────────
paid = {"Alex": 0.0, "Sara": 0.0}
total = 0.0
for r in results:
    if r["euroValue"] is not None:
        paid[r["who"]] += r["euroValue"]
        total += r["euroValue"]
# 50/50: each owes total/2. net = paid - owed.
net = {p: round(paid[p] - total / 2, 4) for p in paid}
print("\n--- HAND ARITHMETIC ---")
print("Alex paid:", round(paid["Alex"], 2), " Sara paid:", round(paid["Sara"], 2))
print("Total EUR:", round(total, 2), " each share:", round(total / 2, 2))
print("NET (positive = is owed):", net)
who_owes = "Sara" if net["Sara"] < 0 else "Alex"
amt = abs(net["Sara"])
print(f"=> {who_owes} owes the other ~EUR {round(amt,2)}")

out = {"rates": {k: RATES.get(k) for k in ["EUR", "JPY", "THB", "KRW"]},
       "expenses": results, "paid": paid, "total": total, "net": net}
with open("scratch/audit_integration/phase2.json", "w") as f:
    json.dump(out, f, indent=2)
print("\n--- PHASE 2 DONE ---")
