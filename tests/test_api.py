"""Smoke tests for the public API surface.

One happy-path + one error case per endpoint, focused on:
  - the gates we added in the audit (auth, ownership, role) actually fire
  - basic shape / status code is what the frontend expects

These tests run against a fresh temp SQLite DB per test (see conftest.py),
so they're safe to run in parallel and don't touch travel_planner.db.
"""

import io
import sys


# ── /api/user-status ─────────────────────────────────────────────────────────

def test_user_status_returns_logged_out(client):
    """Until we ship JWT/session support, this endpoint always reports
    logged_in:false. The test pins that contract so the auth refactor in
    Phase G ends up changing it deliberately, not by accident."""
    res = client.get("/api/user-status")
    assert res.status_code == 200
    assert res.get_json() == {"logged_in": False}


# ── /api/trips ───────────────────────────────────────────────────────────────

def test_upsert_trip_happy_path(client, seed_user):
    res = client.post("/api/trips", json={
        "user_id": seed_user,
        "trip": {"id": "trip-1", "name": "Tuscany", "country": "Italy"},
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "ok"}


def test_upsert_trip_rejects_non_planner_edit(client, seed_user, seed_other_user):
    """Once trip-1 is owned by seed_user, a different user can't overwrite
    it. The audit added _can_edit_trip; this pins the gate."""
    client.post("/api/trips", json={
        "user_id": seed_user,
        "trip": {"id": "trip-1", "name": "Tuscany", "country": "Italy"},
    })
    res = client.post("/api/trips", json={
        "user_id": seed_other_user,
        "trip": {"id": "trip-1", "name": "Hijacked", "country": "Mars"},
    })
    assert res.status_code == 403


def test_upsert_trip_missing_data(client, seed_user):
    res = client.post("/api/trips", json={"user_id": seed_user})
    assert res.status_code == 400


# ── /api/expenses ────────────────────────────────────────────────────────────

def test_upsert_expense_happy_path(client, seed_user):
    client.post("/api/trips", json={
        "user_id": seed_user,
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/expenses", json={
        "user_id": seed_user,
        "expense": {
            "id": "exp-1", "tripId": "trip-1", "who": "Me", "value": 50,
            "currency": "EUR", "euroValue": 50, "label": "Lunch", "date": "2026-01-01",
        },
    })
    assert res.status_code == 200


def test_upsert_expense_rejected_when_not_member(client, seed_user, seed_other_user):
    """Non-planner can't write expenses to a trip they don't belong to."""
    client.post("/api/trips", json={
        "user_id": seed_user,
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/expenses", json={
        "user_id": seed_other_user,
        "expense": {
            "id": "exp-1", "tripId": "trip-1", "who": "Hijacker", "value": 999,
            "currency": "EUR", "euroValue": 999, "label": "Steal", "date": "2026-01-01",
        },
    })
    assert res.status_code == 403


# ── /api/days ────────────────────────────────────────────────────────────────

def test_upsert_day_happy_path(client, seed_user):
    client.post("/api/trips", json={
        "user_id": seed_user,
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/days", json={
        "user_id": seed_user,
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence", "date": "2026-01-02",
            "lat": 43.77, "lng": 11.25,
        },
    })
    assert res.status_code == 200


def test_upsert_day_missing_user_id(client):
    res = client.post("/api/days", json={"day": {"id": "day-1"}})
    assert res.status_code == 400


# ── /api/friends ─────────────────────────────────────────────────────────────

def test_friend_add_happy_path(client, seed_user, seed_other_user):
    res = client.post("/api/friends/add", json={
        "user_id": seed_user, "friend_id": seed_other_user,
    })
    assert res.status_code == 200
    assert res.get_json()["status"] == "success"


def test_friend_add_rejects_self(client, seed_user):
    res = client.post("/api/friends/add", json={
        "user_id": seed_user, "friend_id": seed_user,
    })
    assert res.status_code == 400


def test_friend_add_rejects_unknown_user(client, seed_user):
    """The audit added an _ensure_user_exists check on the friend_id —
    pin it so a regression doesn't silently accept friend requests to
    nonexistent users."""
    res = client.post("/api/friends/add", json={
        "user_id": seed_user, "friend_id": "ghost-user-id",
    })
    assert res.status_code == 404


def test_friend_accept_rejects_fabricated_invite(client, seed_user, seed_other_user):
    """Auditor added a 'pending request must exist' check. Without it,
    any caller could fabricate a friendship by POSTing accept with two
    arbitrary user_ids."""
    res = client.post("/api/friends/accept", json={
        "user_id": seed_user, "friend_id": seed_other_user,
    })
    assert res.status_code == 404


# ── /api/upload ──────────────────────────────────────────────────────────────

def test_upload_rejects_anonymous(client):
    """Wide-open upload was the audit's biggest find. Pin that anonymous
    requests get 401."""
    res = client.post("/api/upload", data={
        "file": (io.BytesIO(b"hello"), "x.txt"),
    })
    assert res.status_code == 401


def test_upload_rejects_unknown_user(client):
    res = client.post("/api/upload", data={
        "user_id": "ghost-user-id",
        "file": (io.BytesIO(b"hello"), "x.txt"),
    })
    assert res.status_code == 401


def test_upload_rejects_disallowed_extension(client, seed_user):
    """Hardening: .exe / .txt / etc. fail the extension allowlist before
    even being read. Pin so a regression doesn't reopen the wide-open file
    write."""
    res = client.post("/api/upload", data={
        "user_id": seed_user,
        "file": (io.BytesIO(b"MZ\x90"), "bomb.exe"),
    })
    assert res.status_code == 400


def test_upload_rejects_extension_spoofing(client, seed_user):
    """Hardening: an .exe renamed to .jpg still fails the magic-number
    sniff. Without this check, secure_filename would accept it as long
    as the extension was on the allowlist."""
    res = client.post("/api/upload", data={
        "user_id": seed_user,
        # 'MZ' is the .exe magic number — not a JPEG.
        "file": (io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00"), "fake.jpg"),
    })
    assert res.status_code == 400


def test_upload_accepts_valid_jpeg(client, seed_user, tmp_path, monkeypatch):
    """Happy path: a real JPEG (with the FFD8FF magic prefix) saves."""
    # Redirect uploads to tmp_path so the test doesn't write into the
    # real frontend/static/uploads directory.
    import main as main_module
    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    res = client.post("/api/upload", data={
        "user_id": seed_user,
        "file": (io.BytesIO(b"\xff\xd8\xff\xe0minimal-jpeg-header"), "real.jpg"),
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["name"] == "real.jpg"
    assert body["url"].startswith("/static/uploads/")


# ── /api/data ────────────────────────────────────────────────────────────────

def test_data_returns_empty_for_new_user(client, seed_user):
    res = client.get(f"/api/data?user_id={seed_user}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["trips"] == []
    assert body["expenses"] == []


# ── Rate limiting ────────────────────────────────────────────────────────────

def test_rate_limit_friends_add(temp_db):
    """Pin the rate-limit gate on /api/friends/add at 30/minute. We
    re-enable limits inside this test (they're off elsewhere) and fire
    enough requests to trip the limiter."""
    if "main" in sys.modules:
        from database import init_db
        init_db()
        from main import app, limiter
    else:
        import main
        from database import init_db
        init_db()
        app = main.app
        limiter = main.limiter

    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = True
    limiter.reset()

    try:
        with app.test_client() as c:
            # 30 allowed, 31st should be 429.
            for i in range(30):
                res = c.post("/api/friends/add", json={
                    "user_id": "x", "friend_id": f"y{i}",
                })
                # body may be 401 (unknown user) — limiter allows the request
                # to reach the handler, which then rejects on its own gate.
                # Either way it shouldn't be 429 yet.
                assert res.status_code != 429
            res = c.post("/api/friends/add", json={
                "user_id": "x", "friend_id": "y-last",
            })
            assert res.status_code == 429
    finally:
        app.config["RATELIMIT_ENABLED"] = False
        limiter.reset()
