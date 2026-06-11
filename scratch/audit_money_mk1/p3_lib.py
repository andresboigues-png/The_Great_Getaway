#!/usr/bin/env python3
"""Persona-3 settlements audit helpers. ONLY hits :5154. Findings-only."""
import json
import uuid
import requests

BASE = "http://127.0.0.1:5154"
ORIGIN = "http://127.0.0.1:5154"


def session():
    s = requests.Session()
    s.headers.update({"Origin": ORIGIN})
    return s


def auth(s, token, name):
    r = s.post(f"{BASE}/api/auth/google", json={"token": token, "name": name})
    r.raise_for_status()
    j = r.json()
    return j["token"], j.get("user", {}).get("id")


def H(jwt):
    return {"Authorization": f"Bearer {jwt}", "Origin": ORIGIN}


def nid(p="x"):
    return f"{p}-{uuid.uuid4().hex[:12]}"


def mk_trip(s, jwt, tid, name="Trip", companions=None):
    trip = {
        "id": tid,
        "name": name,
        "country": "Portugal",
        "countryCode": "PT",
        "companions": companions or [],
    }
    r = s.post(f"{BASE}/api/trips", json={"trip": trip}, headers=H(jwt))
    return r.status_code, _body(r)


def mk_expense(s, jwt, tid, value, who, splits, currency="EUR", euroValue=None,
               eid=None, label="exp"):
    e = {
        "id": eid or nid("exp"),
        "tripId": tid,
        "value": value,
        "currency": currency,
        "who": who,
        "label": label,
        "categoryId": "cat-food",
        "country": "Portugal",
        "date": "2026-05-20",
        "splits": splits,
    }
    if euroValue is not None:
        e["euroValue"] = euroValue
    r = s.post(f"{BASE}/api/expenses", json={"expense": e}, headers=H(jwt))
    return r.status_code, _body(r), e["id"]


def settle(s, jwt, tid, frm, to, amount, currency="EUR", method="cash",
           euroValue=None, note=None):
    payload = {
        "tripId": tid, "fromUserId": frm, "toUserId": to,
        "amount": amount, "currency": currency, "method": method,
    }
    if euroValue is not None:
        payload["euroValue"] = euroValue
    if note is not None:
        payload["note"] = note
    r = s.post(f"{BASE}/api/settlements", json=payload, headers=H(jwt))
    return r.status_code, _body(r)


def list_settlements(s, jwt, tid):
    r = s.get(f"{BASE}/api/settlements/{tid}", headers=H(jwt))
    return r.status_code, _body(r)


def del_settlement(s, jwt, sid):
    r = s.delete(f"{BASE}/api/settlements/{sid}", headers=H(jwt))
    return r.status_code, _body(r)


def invite(s, jwt, tid, target, role="planner"):
    r = s.post(f"{BASE}/api/trips/invite",
               json={"trip_id": tid, "target_user_id": target, "role": role},
               headers=H(jwt))
    return r.status_code, _body(r)


def accept(s, jwt, tid, acceptit=True):
    r = s.post(f"{BASE}/api/trips/invite/respond",
               json={"trip_id": tid, "accept": acceptit}, headers=H(jwt))
    return r.status_code, _body(r)


def remove_member(s, jwt, tid, target):
    r = s.post(f"{BASE}/api/trips/members/remove",
               json={"trip_id": tid, "target_user_id": target}, headers=H(jwt))
    return r.status_code, _body(r)


def get_data(s, jwt):
    r = s.get(f"{BASE}/api/data", headers=H(jwt))
    return r.status_code, _body(r)


def fx_rate(s, jwt, code):
    """The /api/fx-rates endpoint nests rates under a `rates` key:
    {"rates": {"USD": 0.85, ...}}. Read that, fall back to top-level."""
    r = s.get(f"{BASE}/api/fx-rates", headers=H(jwt))
    try:
        d = r.json()
        rates = d.get("rates", d) if isinstance(d, dict) else {}
        return rates.get(code)
    except Exception:
        return None


def _body(r):
    try:
        return r.json()
    except Exception:
        return r.text


def setup_members():
    """Auth users 1..6 each in their OWN requests.Session (the server
    sets a gg_session cookie on auth that otherwise bleeds across users
    in a shared session). Returns {n: (session, jwt, uid, name)}."""
    names = {1: "Alex Owner", 2: "Bob Two", 3: "Sara Lopez",
             4: "Sara Kim", 5: "Charlie Five", 6: "Dana Six"}
    out = {}
    for n, nm in names.items():
        s = session()
        jwt, uid = auth(s, f"test:test-user-{n}", nm)
        out[n] = (s, jwt, uid, nm)
    return out
