#!/usr/bin/env python3
"""Persona 2 — Asia multi-currency couple. End-to-end money lifecycle driver.

Drives the LIVE server at 127.0.0.1:5153 only. Findings-only; never mutates code.
"""
import json
import sys
import requests
from http.cookiejar import DefaultCookiePolicy

BASE = "http://127.0.0.1:5153"
ORIGIN = "http://127.0.0.1:5153"
TRIP_ID = "trip-p2-asia"

# IMPORTANT: auth sets a gg_session cookie that the server prefers over the
# Bearer header. Use a cookie-less session and pass Bearer explicitly so the
# JWT identity is authoritative (otherwise the last-authed user wins).


def _fresh_session():
    s = requests.Session()
    # Reject all cookies so the Bearer header is the only identity signal.
    s.cookies.set_policy(DefaultCookiePolicy(allowed_domains=[]))
    return s


S = _fresh_session()


def auth(token_user, name):
    r = S.post(f"{BASE}/api/auth/google",
               json={"token": token_user, "name": name},
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


def main():
    out = {}

    # ── Auth both users ───────────────────────────────────────────────
    # test:<id> auth maps token suffix → user_id verbatim (routes/auth.py:103).
    alex = auth("test:test-user-1", "Alex")
    sara = auth("test:test-user-2", "Sara")
    alex_uid = "test-user-1"
    sara_uid = "test-user-2"
    out["uids"] = {"alex": alex_uid, "sara": sara_uid}
    print("UIDS", out["uids"])

    # ── Clean any prior trip with same id (best effort, either owner) ──
    S.delete(f"{BASE}/api/trips/{TRIP_ID}", headers=hdr(alex), timeout=20)
    S.delete(f"{BASE}/api/trips/{TRIP_ID}", headers=hdr(sara), timeout=20)

    # ── Create the 9-day, 3-country trip ──────────────────────────────
    trip_body = {"trip": {
        "id": TRIP_ID, "name": "Tokyo to Bangkok to Seoul",
        "country": "Japan", "countryCode": "JP", "isPublic": False,
        "companions": [{"name": "Sara"}],
        "countries": ["JP", "TH", "KR"],
    }}
    r = post("/api/trips", alex, trip_body)
    out["create_trip"] = {"status": r.status_code, "body": jp(r)}
    print("CREATE TRIP", r.status_code)

    # ── Add 9 days spanning 3 countries ───────────────────────────────
    days = [
        ("2026-07-01", "Tokyo", "JP"), ("2026-07-02", "Tokyo", "JP"),
        ("2026-07-03", "Tokyo", "JP"), ("2026-07-04", "Bangkok", "TH"),
        ("2026-07-05", "Bangkok", "TH"), ("2026-07-06", "Bangkok", "TH"),
        ("2026-07-07", "Seoul", "KR"), ("2026-07-08", "Seoul", "KR"),
        ("2026-07-09", "Seoul", "KR"),
    ]
    day_results = []
    for i, (d, city, cc) in enumerate(days):
        db = {"day": {"id": f"day-p2-{i+1}", "tripId": TRIP_ID,
                      "date": d, "title": city, "countryCode": cc,
                      "dayIndex": i}}
        rd = post("/api/days", alex, db)
        day_results.append((d, rd.status_code))
    out["days"] = day_results
    print("DAYS", day_results)

    # ── Invite Sara as a real member, accept as Sara ──────────────────
    ri = post("/api/trips/invite", alex,
              {"trip_id": TRIP_ID, "target_user_id": sara_uid, "role": "planner"})
    out["invite"] = {"status": ri.status_code, "body": jp(ri)}
    print("INVITE", ri.status_code, jp(ri))
    rr = post("/api/trips/invite/respond", sara,
              {"trip_id": TRIP_ID, "accept": True})
    out["invite_respond"] = {"status": rr.status_code, "body": jp(rr)}
    print("INVITE RESPOND", rr.status_code, jp(rr))

    with open("scratch/audit_integration/phase1.json", "w") as f:
        json.dump(out, f, indent=2)
    print("\n--- PHASE 1 DONE ---")


if __name__ == "__main__":
    main()
