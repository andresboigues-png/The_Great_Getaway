"""P1 numbers audit: seed a big multi-currency/multi-year trip, reconcile
every Insights surface against lib.insights() for both homes + both modes,
test overrides, investigate the JPY discrepancy."""
import os, sys, json
os.environ.setdefault("GG_AUDIT_BASE", "http://127.0.0.1:5201")
sys.path.insert(0, "scratch/audit_insights_mk3")
import lib

tok, user = lib.auth("test-p1", "P1Auditor")
print("auth ok:", user.get("id"))

TRIP = "p1-bigtrip"
out, st = lib.create_trip(tok, {"id": TRIP, "name": "P1 World Tour",
                                "startDate": "2010-01-01", "endDate": "2030-12-31",
                                "countries": ["USA"], "currency": "EUR"})
print("create_trip:", st, out if st != 200 else "")

# 30+ expenses. (date, who, cat, label, country, value, currency, [euroValue])
# Spans 1995 -> 2030, weekend, undated, future-dated, 7 currencies incl VND/EGP.
RAW = [
    ("1995-07-04", "Andres", "flights", "PRE-EURO flight", "USA", 500.0, "USD"),
    ("2008-03-10", "Sara", "lodging", "old hotel", "GBR", 200.0, "GBP"),
    ("2010-06-15", "Andres", "food", "diner 2010", "USA", 80.0, "USD"),
    ("2010-06-16", "Sara", "transport", "metro", "USA", 12.5, "USD"),
    ("2012-11-20", "Andres", "lodging", "tokyo hotel", "JPN", 30000.0, "JPY"),
    ("2013-01-05", "Sara", "food", "sushi", "JPN", 4500.0, "JPY"),
    ("2014-09-09", "Andres", "shopping", "mumbai market", "IND", 3000.0, "INR"),
    ("2015-05-01", "Sara", "transport", "rio taxi", "BRA", 60.0, "BRL"),
    ("2015-12-25", "Andres", "food", "xmas dinner", "FRA", 95.0, "EUR"),
    ("2016-06-01", "Sara", "lodging", "london flat", "GBR", 450.0, "GBP"),
    ("2017-03-17", "Andres", "food", "ny brunch", "USA", 75.25, "USD"),
    ("2018-08-08", "Sara", "shopping", "kyoto gifts", "JPN", 18000.0, "JPY"),
    ("2018-08-11", "Andres", "transport", "weekend train (Sat)", "JPN", 6200.0, "JPY"),  # 2018-08-11 is a Saturday
    ("2019-02-14", "Sara", "food", "valentine", "FRA", 120.0, "EUR"),
    ("2019-07-20", "Andres", "lodging", "sao paulo", "BRA", 800.0, "BRL"),
    ("2020-01-01", "Sara", "food", "nye delhi", "IND", 5500.0, "INR"),
    ("2020-10-31", "Andres", "shopping", "halloween", "USA", 40.0, "USD"),
    ("2021-04-15", "Sara", "lodging", "kyoto ryokan", "JPN", 30000.0, "JPY"),
    ("2021-09-09", "Andres", "food", "ramen", "JPN", 1200.0, "JPY"),
    ("2022-06-30", "Sara", "transport", "eurostar", "GBR", 180.0, "GBP"),
    ("2022-12-12", "Andres", "shopping", "xmas shop", "USA", 250.0, "USD"),
    ("2023-03-03", "Sara", "food", "paris cafe", "FRA", 35.0, "EUR"),
    ("2023-08-19", "Andres", "lodging", "goa beach (Sat)", "IND", 7000.0, "INR"),  # 2023-08-19 Saturday
    ("2024-01-20", "Sara", "transport", "tokyo jr", "JPN", 3300.0, "JPY"),
    ("2024-07-04", "Andres", "food", "july4 bbq", "USA", 90.0, "USD"),
    ("2024-11-28", "Sara", "shopping", "blackfriday", "USA", 320.0, "USD"),
    ("2025-02-02", "Andres", "lodging", "rio carnival", "BRA", 1500.0, "BRL"),
    ("2025-05-15", "Sara", "food", "london pub", "GBR", 65.0, "GBP"),
    ("2026-01-10", "Andres", "food", "recent meal", "USA", 50.0, "USD"),
    ("2026-05-01", "Sara", "transport", "recent taxi", "FRA", 25.0, "EUR"),
    # NON-Frankfurter currencies: need client euroValue (C1 gate). Pick plausible euroValues.
    ("2019-06-01", "Andres", "food", "hanoi pho (VND)", "VND", 120000.0, "VND", 4.5),
    ("2023-04-10", "Sara", "lodging", "cairo hotel (EGP)", "EGP", 2000.0, "EGP", 60.0),
    # undated + future-dated
    ("", "Andres", "shopping", "undated souvenir", "USA", 33.0, "USD"),
    ("2030-06-15", "Sara", "food", "future feast", "FRA", 200.0, "EUR"),
]

seeded = []
fails = []
for i, row in enumerate(RAW):
    date, who, cat, label, country, value, cur = row[:7]
    ev = row[7] if len(row) > 7 else None
    e = {"id": f"{TRIP}-e{i:02d}", "tripId": TRIP, "who": who, "categoryId": cat,
         "label": label, "date": date, "country": country, "value": value, "currency": cur}
    if ev is not None:
        e["euroValue"] = ev
    out, st = lib.add_expense(tok, e)
    if st == 200:
        seeded.append(e)
    else:
        fails.append((e["id"], cur, st, out))

print(f"seeded {len(seeded)}/{len(RAW)} expenses")
for f in fails:
    print("  FAIL", f)

# Pull back from server (canonical euroValue + what /api/data actually returns)
data = lib.get("/api/data", tok)
server_exps = [e for e in data.get("expenses", []) if e.get("tripId") == TRIP]
print("server returned", len(server_exps), "expenses for trip")
# dump a couple to compare euroValue
import collections
by_id = {e["id"]: e for e in server_exps}
# Save server expenses for downstream reconciliation
json.dump(server_exps, open("scratch/audit_insights_mk3/_p1_server_exps.json", "w"))
print("WROTE _p1_server_exps.json")
# quick look at JPY-2021 30000 row euroValue and the VND/EGP rows
for eid in [f"{TRIP}-e17", f"{TRIP}-e30", f"{TRIP}-e31"]:
    e = by_id.get(eid)
    if e:
        print(f"  {eid}: {e['value']} {e['currency']} euroValue={e.get('euroValue')}")
