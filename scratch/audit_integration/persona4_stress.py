#!/usr/bin/env python3
"""Persona 4 — Settlement stress / adversarial. Money-lifecycle audit.

Drives the LIVE server at 127.0.0.1:5155 ONLY. Findings-only; never
mutates code. Attacks the settlement endpoint + balance math with
bad/edge-case amounts and sequences, capturing HTTP status+body and
re-pulling balances after each to judge sanity.

IMPORTANT harness note: the auth endpoint sets a `gg_session` cookie and
several write endpoints (/api/trips create, /api/trips/invite) resolve
identity from THAT COOKIE, not the Bearer header. A single shared
requests.Session() therefore bleeds identity between users. We give each
user their OWN Session so Alex stays Alex.
"""
import json
import requests

BASE = "http://127.0.0.1:5155"
ORIGIN = "http://127.0.0.1:5155"
TRIP = "trip-p4-stress"
TRIP_ZERO = "trip-p4-zero"
A_UID = "test-user-1"   # Alex (owner)
S_UID = "test-user-2"   # Sara (member)
C_UID = "test-user-3"   # Carol (non-member stranger)

RESULTS = []


def mk_session(token_user, name):
    """One Session per user — avoids the gg_session cookie bleed."""
    s = requests.Session()
    j = s.post(f"{BASE}/api/auth/google",
               json={"token": f"test:{token_user}", "name": name},
               headers={"Origin": ORIGIN}, timeout=15).json()
    s.headers.update({"Origin": ORIGIN,
                      "Authorization": f"Bearer {j['token']}",
                      "Content-Type": "application/json"})
    return s


def jp(r):
    try:
        return r.json()
    except Exception:
        return {"_raw": r.text[:300]}


def settle(sess, body):
    return sess.post(f"{BASE}/api/settlements", data=json.dumps(body), timeout=20)


def settle_raw(sess, raw_str):
    return sess.post(f"{BASE}/api/settlements", data=raw_str, timeout=20)


def delete_settlement(sess, sid):
    return sess.delete(f"{BASE}/api/settlements/{sid}", timeout=20)


def data_for(sess):
    return jp(sess.get(f"{BASE}/api/data", timeout=20))


def balances_for(sess, trip_id):
    """Replicate balances.ts: expense splits + settlements, first-name
    keyed. Returns (balance_map, settlement_rows)."""
    d = data_for(sess)
    expenses = [e for e in d.get("expenses", []) if e.get("tripId") == trip_id]
    settlements = [s for s in d.get("settlements", []) if s.get("tripId") == trip_id]
    trip = next((t for t in d.get("trips", []) if t.get("id") == trip_id), None)
    roster = set()
    if trip:
        for c in trip.get("companions", []) or []:
            if c.get("name"):
                roster.add(c["name"])
    for e in expenses:
        if e.get("who"):
            roster.add(e["who"])
        for k in (e.get("splits") or {}).keys():
            roster.add(k)
    bal = {p: 0.0 for p in roster}
    for e in expenses:
        amt = e.get("euroValue") or e.get("value") or 0
        if e.get("who") in bal:
            bal[e["who"]] += amt
        splits = e.get("splits") or {}
        if splits:
            total = sum(float(v or 0) for v in splits.values()) or 100
            for person, pct in splits.items():
                if person in bal:
                    bal[person] -= amt * (float(pct) / total)
        else:
            share = amt / max(len(roster), 1)
            for p in roster:
                bal[p] -= share

    def resolve(full):
        if full and full in bal:
            return full
        first = (full or "").split()[0] if full else None
        if first and first in bal:
            return first
        return full
    for s in settlements:
        amt = s.get("euroValue") or s.get("amount") or 0
        fr = resolve(s.get("fromName"))
        to = resolve(s.get("toName"))
        if fr is None or to is None:
            continue
        bal.setdefault(fr, 0.0)
        bal.setdefault(to, 0.0)
        bal[fr] += amt
        bal[to] -= amt
    return {k: round(v, 4) for k, v in bal.items()}, settlements


def rec(case, r, note=""):
    body = jp(r)
    status = r.status_code
    RESULTS.append({"case": case, "status": status, "body": body, "note": note})
    print(f"[{case}] -> {status}  {json.dumps(body, default=str)[:200]}  {note}")
    return status, body


def snapshot(case, sess, trip_id, note):
    bal, sets = balances_for(sess, trip_id)
    RESULTS.append({"case": case, "status": "BAL", "body": bal, "note": note})
    print(f"[{case}] BAL {bal}  {note}")
    return bal, sets


def main():
    alexS = mk_session("test-user-1", "Alex")
    saraS = mk_session("test-user-2", "Sara")
    carolS = mk_session("test-user-3", "Carol")

    # ── fresh trips ───────────────────────────────────────────────
    for tid in (TRIP, TRIP_ZERO):
        for sess in (alexS, saraS, carolS):
            sess.delete(f"{BASE}/api/trips/{tid}")

    alexS.post(f"{BASE}/api/trips", data=json.dumps({"trip": {
        "id": TRIP, "name": "Settle Stress", "country": "Spain",
        "countryCode": "ES", "isPublic": False,
        "companions": [{"name": "Sara"}]}}))
    alexS.post(f"{BASE}/api/trips/invite", data=json.dumps(
        {"trip_id": TRIP, "target_user_id": S_UID, "role": "planner"}))
    saraS.post(f"{BASE}/api/trips/invite/respond", data=json.dumps(
        {"trip_id": TRIP, "accept": True}))

    alexS.post(f"{BASE}/api/trips", data=json.dumps({"trip": {
        "id": TRIP_ZERO, "name": "Zero Spend", "country": "Spain",
        "countryCode": "ES", "isPublic": False,
        "companions": [{"name": "Sara"}]}}))
    alexS.post(f"{BASE}/api/trips/invite", data=json.dumps(
        {"trip_id": TRIP_ZERO, "target_user_id": S_UID, "role": "planner"}))
    saraS.post(f"{BASE}/api/trips/invite/respond", data=json.dumps(
        {"trip_id": TRIP_ZERO, "accept": True}))

    # 4 EUR expenses paid by Alex, split 50/50 -> total 200; Sara owes 100
    for eid, label, val in [("e-p4-1", "Hotel", 100.0), ("e-p4-2", "Dinner", 40.0),
                            ("e-p4-3", "Tour", 40.0), ("e-p4-4", "Taxi", 20.0)]:
        alexS.post(f"{BASE}/api/expenses", data=json.dumps({"expense": {
            "id": eid, "tripId": TRIP, "label": label, "categoryId": "food",
            "value": val, "currency": "EUR", "who": "Alex",
            "date": "2026-07-01", "splits": {"Alex": 50, "Sara": 50}}}))
    snapshot("BASELINE", alexS, TRIP, "Sara owes Alex ~100; cap=200*1.01+.5=202.5")

    # ===== CASE 1: gross overpay & small overpay (inversion) =====
    r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 10000, "currency": "EUR", "method": "cash"})
    rec("1a-overpay-10000", r, "expect 400 overpay cap")

    r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 150, "currency": "EUR", "method": "cash"})
    s1b, b1b = rec("1b-overpay-150-under-cap", r,
                   "150>100 debt but <202.5 cap -> accepted; INVERTS?")
    snapshot("1b-after", alexS, TRIP, "Alex now owes Sara ~50? (inverted)")
    if s1b == 201:
        delete_settlement(alexS, b1b["settlement"]["id"])

    # ===== CASE 2: cap bypass on ZERO-expense trip =====
    r = settle(alexS, {"tripId": TRIP_ZERO, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 1e8, "currency": "EUR", "method": "cash"})
    s2, b2 = rec("2-zero-trip-1e8", r, "cap SKIPPED when no expenses -> 201?")
    snapshot("2-zero-bal", alexS, TRIP_ZERO, "1e8 phantom debt on zero-spend trip")
    if s2 == 201:
        delete_settlement(alexS, b2["settlement"]["id"])

    # ===== CASE 3: partial then over remaining (cap vs total-spend gap) =====
    r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 50, "currency": "EUR", "method": "cash", "note": "p3a"})
    s3a, b3a = rec("3a-partial-50", r, "pay 50 of 100")
    snapshot("3a-after", alexS, TRIP, "Sara owes ~50")
    r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 60, "currency": "EUR", "method": "cash", "note": "p3b"})
    s3b, b3b = rec("3b-over-remaining-60", r,
                   "60>remaining 50; total 110>100 debt but <202.5 cap -> GAP")
    snapshot("3b-after", alexS, TRIP, "total settled 110 vs 100 -> Alex owes Sara ~10")
    for sx in (b3a, b3b):
        sid = sx.get("settlement", {}).get("id")
        if sid:
            delete_settlement(alexS, sid)

    # ===== CASE 4: duplicate (idempotency?) =====
    dup = {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
           "amount": 30, "currency": "EUR", "method": "cash", "note": "dup-test"}
    r1 = settle(alexS, dup)
    r2 = settle(alexS, dup)
    rec("4a-dup-first", r1, "first 30")
    rec("4b-dup-second", r2, "identical 30 -> 2nd row? double-subtract?")
    bal, sets = snapshot("4-after", alexS, TRIP, "double-subtracted 60?")
    dups = [s for s in sets if s.get("note") == "dup-test"]
    RESULTS.append({"case": "4-dup-row-count", "status": "INFO",
                    "body": {"rows": len(dups)}, "note": "no idempotency = 2"})
    print(f"  dup row count = {len(dups)}")
    for s in dups:
        delete_settlement(alexS, s["id"])

    # ===== CASE 5: sub-cent / rounding / 6dp =====
    for amt, label in [(0.01, "5a-min-0.01"), (0.009, "5b-below-0.009"),
                       (0.014, "5c-0.014"), (33.333333, "5d-six-dp")]:
        r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                           "amount": amt, "currency": "EUR", "method": "cash"})
        st, bd = rec(label, r, f"amount={amt}")
        if st == 201:
            row = bd["settlement"]
            RESULTS.append({"case": label + "-stored", "status": st,
                            "body": {"amount": row["amount"], "euroValue": row["euroValue"]},
                            "note": "what got STORED"})
            print(f"  stored amount={row['amount']} euroValue={row['euroValue']}")
            delete_settlement(alexS, row["id"])

    # ===== CASE 6: wrong currency =====
    r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 50, "currency": "USD", "method": "cash"})
    s6a, b6a = rec("6a-usd-no-eurovalue", r, "convert via live rate")
    if s6a == 201:
        row = b6a["settlement"]
        RESULTS.append({"case": "6a-stored", "status": s6a,
                        "body": {"amount": row["amount"], "euroValue": row["euroValue"]},
                        "note": "USD->EUR server-derived"})
        print(f"  6a stored amount={row['amount']} euroValue={row['euroValue']}")
        delete_settlement(alexS, row["id"])
    # bogus/unsupported currency, no euroValue
    r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 50, "currency": "XAU", "method": "cash"})
    rec("6b-norate-no-eurovalue", r, "expect 400")
    # a SUPPORTED non-EUR currency with bogus client euroValue -> override?
    r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 50, "currency": "USD", "euroValue": 999999,
                       "method": "cash"})
    s6c, b6c = rec("6c-usd-bogus-eurovalue", r, "server OVERRIDES 999999?")
    if s6c == 201:
        row = b6c["settlement"]
        RESULTS.append({"case": "6c-stored", "status": s6c,
                        "body": {"amount": row["amount"], "euroValue": row["euroValue"]},
                        "note": "did server trust 999999 or override via rate?"})
        print(f"  6c stored amount={row['amount']} euroValue={row['euroValue']}")
        delete_settlement(alexS, row["id"])

    # ===== CASE 7: self & non-member =====
    r = settle(alexS, {"tripId": TRIP, "fromUserId": A_UID, "toUserId": A_UID,
                       "amount": 10, "currency": "EUR"})
    rec("7a-self-from==to", r, "expect 400")
    r = settle(alexS, {"tripId": TRIP, "fromUserId": A_UID, "toUserId": C_UID,
                       "amount": 10, "currency": "EUR"})
    rec("7b-nonmember-to", r, "Carol not member -> 400")
    r = settle(alexS, {"tripId": TRIP, "fromUserId": C_UID, "toUserId": A_UID,
                       "amount": 10, "currency": "EUR"})
    rec("7c-nonmember-from", r, "Carol not member -> 400")
    # member records own payment (Sara records Sara->Alex)
    r = settle(saraS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 5, "currency": "EUR", "method": "cash"})
    s7d, b7d = rec("7d-member-records-own", r, "member records -> 201")
    if s7d == 201:
        delete_settlement(alexS, b7d["settlement"]["id"])
    # caller is a member but NEITHER party: Carol can't (not member).
    # Confirm the design that ANY member may record between two others by
    # using Sara as recorder of a Sara->Alex (she IS a party). The pure
    # "member-but-neither-party" needs a 3rd member; document as design.

    # ===== CASE 8: settle-then-mutate (reconciliation) =====
    r = settle(alexS, {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                       "amount": 100, "currency": "EUR", "method": "cash", "note": "settle8"})
    s8, b8 = rec("8a-settle-full-100", r, "clears debt to ~0")
    sid8 = b8.get("settlement", {}).get("id")
    snapshot("8a-after", alexS, TRIP, "all ~0")
    # grow the hotel expense 100 -> 400 (debt re-opens; stale settlement stays)
    alexS.post(f"{BASE}/api/expenses", data=json.dumps({"expense": {
        "id": "e-p4-1", "tripId": TRIP, "label": "Hotel", "categoryId": "food",
        "value": 400.0, "currency": "EUR", "who": "Alex",
        "date": "2026-07-01", "splits": {"Alex": 50, "Sara": 50}}}))
    snapshot("8b-grow", alexS, TRIP, "debt grew; stale 100 settlement still applied")
    # delete the hotel expense entirely -> orphaned settlement
    alexS.delete(f"{BASE}/api/expenses/e-p4-1")
    snapshot("8c-delete", alexS, TRIP, "expense gone, settlement remains -> NEGATIVE/inverted?")
    # restore
    if sid8:
        delete_settlement(alexS, sid8)
    alexS.post(f"{BASE}/api/expenses", data=json.dumps({"expense": {
        "id": "e-p4-1", "tripId": TRIP, "label": "Hotel", "categoryId": "food",
        "value": 100.0, "currency": "EUR", "who": "Alex",
        "date": "2026-07-01", "splits": {"Alex": 50, "Sara": 50}}}))

    # ===== CASE 9: negatives / types =====
    for label, patch in [("9a-neg-5", {"amount": -5}), ("9b-zero", {"amount": 0}),
                         ("9c-string-abc", {"amount": "abc"}), ("9d-null", {"amount": None}),
                         ("9g-string-num", {"amount": "55"}),
                         ("9h-1e9+1", {"amount": 1e9 + 1}),
                         ("9i-exactly-1e9", {"amount": 1e9})]:
        body = {"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                "currency": "EUR", "method": "cash"}
        body.update(patch)
        st, bd = rec(label, settle(alexS, body), f"patch={patch}")
        if st == 201:
            delete_settlement(alexS, bd["settlement"]["id"])
    for label, raw_amt in [("9e-NaN-literal", "NaN"), ("9f-Inf-literal", "Infinity"),
                           ("9j-NaN-string", '"NaN"'), ("9k-Inf-string", '"Infinity"')]:
        raw = json.dumps({"tripId": TRIP, "fromUserId": S_UID, "toUserId": A_UID,
                          "currency": "EUR", "method": "cash"})
        raw = raw[:-1] + f', "amount": {raw_amt}' + "}"
        st, bd = rec(label, settle_raw(alexS, raw), f"raw amount={raw_amt}")
        if st == 201 and isinstance(bd, dict) and bd.get("settlement"):
            delete_settlement(alexS, bd["settlement"]["id"])

    # ===== CASE 10: delete auth =====
    # Alex (owner) records Alex->Sara so Sara is the recipient & NOT owner/creator.
    r = settle(alexS, {"tripId": TRIP, "fromUserId": A_UID, "toUserId": S_UID,
                       "amount": 25, "currency": "EUR", "method": "cash", "note": "delauth"})
    s10, b10 = rec("10-setup-alex-pays-sara", r, "Alex creator, Sara recipient(non-owner)")
    if s10 == 201:
        sid = b10["settlement"]["id"]
        # Sara (recipient, non-owner, non-creator) tries delete -> 403
        rec("10a-recipient-delete", delete_settlement(saraS, sid),
            "Sara=recipient -> expect 403")
        # Carol (stranger) -> 403/404
        rec("10b-stranger-delete", delete_settlement(carolS, sid),
            "Carol stranger -> expect 403/404")
        # Alex (creator+owner) -> 200, balance reverts
        rec("10c-creator-delete", delete_settlement(alexS, sid),
            "Alex creator -> 200")
        snapshot("10c-after-revert", alexS, TRIP, "back to Sara owes Alex ~100")
        # recipient-notification check: Sara should have a settled_up notif then a revert
        nd = jp(saraS.get(f"{BASE}/api/notifications", timeout=20))
        notifs = nd if isinstance(nd, list) else nd.get("notifications", [])
        types = [n.get("type") for n in notifs][:8]
        RESULTS.append({"case": "10d-sara-notif-types", "status": "INFO",
                        "body": types, "note": "settled_up + settled_up_reverted?"})
        print("  Sara notif types:", types)

    with open("scratch/audit_integration/persona4_results.json", "w") as f:
        json.dump(RESULTS, f, indent=2, default=str)
    print("\n=== DONE — results written ===")


if __name__ == "__main__":
    main()
