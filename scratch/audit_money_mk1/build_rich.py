"""Build a rich 4-person, 4-currency, multi-day (past+future) trip with budgets
+ a settlement between REAL linked members, for full cross-surface reconciliation.

test-user-1 = Alex (owner). test-user-3 = Maya (invited+accepted -> linked member).
Companions: Maya(linked), Bea, Cory. Plus Alex (owner/payer).
Returns nothing; prints the created trip id + a JSON snapshot to _rich.json.
"""
import sys, json, time
sys.path.insert(0, ".")
from lib import auth, _req, _get, fx_rates

TRIP = "trip-rich-money"
tok1, u1 = auth("test-user-1", "Alex Rivera")
tok3, u3 = auth("test-user-3", "Maya Chen")
U1, U3 = u1["id"], u3["id"]
print("Alex:", U1, "Maya:", U3)
rates = fx_rates()
print("rates USD=%s JPY=%s THB=%s" % (rates["USD"], rates["JPY"], rates["THB"]))

# 1. create trip (owner) with companions; Maya linked to U3
trip = {
    "id": TRIP, "name": "Rich Money Trip", "country": "Portugal",
    "companions": [
        {"name": "Maya", "linkedUserId": U3},
        {"name": "Bea"},
        {"name": "Cory"},
    ],
}
out, st = _req("POST", "/api/trips", token=tok1, body={"trip": trip})
print("create trip:", st, out)

# 2. invite Maya as member + accept
out, st = _req("POST", "/api/trips/invite", token=tok1,
               body={"trip_id": TRIP, "target_user_id": U3, "role": "budgeteer"})
print("invite:", st, out)
out, st = _req("POST", "/api/trips/invite/respond", token=tok3,
               body={"trip_id": TRIP, "accept": True})
print("accept:", st, out)

# 3. expenses — 4 currencies, mixed past/future dates, varied splits.
# today = 2026-06-01. PAST: <= 06-01. FUTURE: > 06-01.
# Splits use companion names + Alex. One non-100 split (99) to test S5
# normalization. One no-splits expense (equal-share across roster).
EXPS = [
    # PAST EUR, even 4-way split (25 each among Alex,Maya,Bea,Cory)
    dict(id="rx-1", value=400.0, currency="EUR", categoryId="accommodation",
         who="Alex", date="2026-05-20",
         splits={"Alex": 25, "Maya": 25, "Bea": 25, "Cory": 25}),
    # PAST USD, Alex pays, split Alex/Maya 50/50
    dict(id="rx-2", value=120.0, currency="USD", categoryId="food",
         who="Alex", date="2026-05-21", splits={"Alex": 50, "Maya": 50}),
    # PAST JPY, Maya pays (but Maya is a name in splits/who), 3-way 33/33/33 (=99) -> S5 normalize
    dict(id="rx-3", value=9000.0, currency="JPY", categoryId="transport",
         who="Maya", date="2026-05-22", splits={"Alex": 33, "Maya": 33, "Bea": 33}),
    # PAST THB, Alex pays, NO splits -> equal share across roster (4 people)
    dict(id="rx-4", value=1500.0, currency="THB", categoryId="activities",
         who="Alex", date="2026-05-23", splits={}),
    # FUTURE EUR (should be excluded from daily-avg numerator)
    dict(id="rx-5", value=300.0, currency="EUR", categoryId="accommodation",
         who="Alex", date="2026-07-10", splits={"Alex": 50, "Maya": 50}),
    # FUTURE USD
    dict(id="rx-6", value=60.0, currency="USD", categoryId="shopping",
         who="Bea", date="2026-07-11", splits={"Alex": 50, "Bea": 50}),
    # PAST EUR small, Cory pays, Cory/Alex
    dict(id="rx-7", value=40.0, currency="EUR", categoryId="food",
         who="Cory", date="2026-05-24", splits={"Cory": 50, "Alex": 50}),
]
for e in EXPS:
    e["tripId"] = TRIP
    out, st = _req("POST", "/api/expenses", token=tok1, body={"expense": e})
    print("exp %s %s%s:" % (e["id"], e["value"], e["currency"]), st,
          {k: out.get(k) for k in ("status", "euroValue", "error")})

# 4. budgets
BUDS = [
    dict(id="rb-total", tripId=TRIP, categoryId="all", user="all",
         amount=900.0, originalAmount=900.0, originalCurrency="EUR", currency="EUR",
         label="Total"),
    dict(id="rb-food", tripId=TRIP, categoryId="food", user="all",
         amount=150.0, originalAmount=150.0, originalCurrency="EUR", currency="EUR",
         label="Food"),
    dict(id="rb-maya", tripId=TRIP, categoryId="all", user="Maya",
         amount=200.0, originalAmount=200.0, originalCurrency="EUR", currency="EUR",
         label="Maya budget"),
]
for b in BUDS:
    out, st = _req("POST", "/api/budgets", token=tok1, body={"budget": b})
    print("budget %s:" % b["id"], st, out.get("status", out.get("error")))

# 5. settlement: Alex pays Maya (real linked user_ids). Amount chosen to leave a
# clean balance; we reconcile the exact number from /api/data afterwards.
out, st = _req("POST", "/api/settlements", token=tok1, body={
    "tripId": TRIP, "fromUserId": U1, "toUserId": U3, "amount": 20.0,
    "currency": "EUR", "method": "cash",
})
print("settlement Alex->Maya 20 EUR:", st, {k: out.get(k) for k in ("id", "euroValue", "error", "maxEur")})

# snapshot
d = _get("/api/data", tok1)
json.dump(d, open("_rich.json", "w"), indent=2)
print("\nsnapshot written. trips:", [t["id"] for t in d["trips"]])
