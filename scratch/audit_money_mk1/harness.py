#!/usr/bin/env python3
"""Money-correctness audit harness for The Great Getaway.
ONLY hits http://127.0.0.1:5152. Findings-only; never mutates source.
"""
import json
import sys
import time
import uuid
import requests

BASE = "http://127.0.0.1:5152"
ORIGIN = "http://127.0.0.1:5152"
S = requests.Session()
S.headers.update({"Origin": ORIGIN})

RESULTS = []


def log(tag, msg):
    line = f"[{tag}] {msg}"
    print(line)
    RESULTS.append(line)


def auth(token="test:test-user-1", name="Alex"):
    r = S.post(f"{BASE}/api/auth/google", json={"token": token, "name": name})
    r.raise_for_status()
    jwt = r.json()["token"]
    return jwt


def hdr(jwt):
    return {"Authorization": f"Bearer {jwt}", "Origin": ORIGIN}


def newid(prefix="exp"):
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def post_expense(jwt, e, expect=None, note=""):
    r = S.post(f"{BASE}/api/expenses", json={"expense": e}, headers=hdr(jwt))
    body = None
    try:
        body = r.json()
    except Exception:
        body = r.text
    status_ok = "?" if expect is None else ("OK" if r.status_code == expect else "!!MISMATCH")
    log("EXP-POST", f"{status_ok} status={r.status_code} expect={expect} note={note} body={body}")
    return r.status_code, body


def post_trip(jwt, trip):
    r = S.post(f"{BASE}/api/trips", json={"trip": trip}, headers=hdr(jwt))
    log("TRIP", f"status={r.status_code} id={trip.get('id')} body={_short(r)}")
    return r


def post_budget(jwt, b):
    r = S.post(f"{BASE}/api/budgets", json=b, headers=hdr(jwt))
    log("BUDGET", f"status={r.status_code} body={_short(r)}")
    return r


def get_data(jwt):
    r = S.get(f"{BASE}/api/data", headers=hdr(jwt))
    r.raise_for_status()
    return r.json()


def del_expense(jwt, eid):
    r = S.delete(f"{BASE}/api/expenses/{eid}", headers=hdr(jwt))
    log("DEL", f"status={r.status_code} id={eid} body={_short(r)}")
    return r


def get_fx(jwt):
    r = S.get(f"{BASE}/api/fx-rates", headers=hdr(jwt))
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text


def _short(r):
    try:
        b = r.json()
        s = json.dumps(b)
    except Exception:
        s = r.text
    return s[:300]


def find_expense(data, eid):
    for e in data.get("expenses", []):
        if e.get("id") == eid:
            return e
    return None
