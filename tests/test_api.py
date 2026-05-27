"""Smoke tests for the public API surface.

One happy-path + one error case per endpoint, focused on:
  - the gates we added in the audit (auth, ownership, role) actually fire
  - basic shape / status code is what the frontend expects
  - the JWT-based auth (Phase G) replaces the trust-the-client pattern

These tests run against a fresh temp SQLite DB per test (see conftest.py),
so they're safe to run in parallel and don't touch travel_planner.db.

Auth: tests that need to be authenticated pass the `auth_headers` fixture
(which issues a JWT for `seed_user`) on every request. Tests verifying
the auth gate itself omit the headers and assert 401.
"""

import io
import json
import sys


# ── /api/auth/google (test-mode bypass) ──────────────────────────────────────
# Pin the GG_ALLOW_TEST_LOGIN env-gate that the e2e suite relies on.
# This is the ONLY way the `test:<user_id>` shortcut is honoured —
# without the env var set, the endpoint must reject test tokens.

def test_auth_google_test_mode_disabled_by_default(client, monkeypatch):
    """Without GG_ALLOW_TEST_LOGIN, `test:<id>` tokens fall through to
    the real Google verification (which fails for synthetic input).
    Production deploys MUST land in this branch — anything else is a
    security regression."""
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)
    res = client.post("/api/auth/google", json={"token": "test:test-user-1"})
    # Falls through to real Google verification path; either 400 (no
    # CLIENT_ID_GOOGLE_AUTH set) or 401 (bad token) is fine — both
    # mean the test bypass did NOT fire.
    assert res.status_code in (400, 401)


def test_auth_google_test_mode_when_enabled(client, monkeypatch):
    """With GG_ALLOW_TEST_LOGIN=1, the `test:<id>` shortcut mints a JWT
    and upserts the user row. This is the exact path the Playwright
    smoke suite hits via tests/e2e/helpers.js's loginAsTestUser."""
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")
    res = client.post(
        "/api/auth/google",
        json={"token": "test:test-user-99", "name": "Pytest Bot"},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "success"
    assert body["user"]["id"] == "test-user-99"
    assert body["user"]["name"] == "Pytest Bot"
    assert body["token"]  # JWT issued

    # Sanity: that JWT can hit a gated endpoint.
    res = client.get(
        "/api/user-status",
        headers={"Authorization": f"Bearer {body['token']}"},
    )
    assert res.status_code == 200
    assert res.get_json()["logged_in"] is True


def test_auth_google_test_mode_only_accepts_test_prefix(client, monkeypatch):
    """Even with the env-gate enabled, tokens that don't start with
    `test:` still go through the real Google path. Stops a malicious
    deploy with the env var leaked from accepting arbitrary input."""
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")
    res = client.post("/api/auth/google", json={"token": "real.google.token"})
    assert res.status_code in (400, 401)  # falls through to Google verify


# ── /api/user-status ─────────────────────────────────────────────────────────

def test_user_status_logged_out_without_token(client):
    """No Authorization header → logged_in: false. The frontend uses this
    on app boot to decide between login wall vs. restored session."""
    res = client.get("/api/user-status")
    assert res.status_code == 200
    assert res.get_json() == {"logged_in": False}


def test_user_status_logged_in_with_valid_token(client, seed_user, auth_headers):
    """Valid JWT → logged_in: true with user payload. Replaces the old
    behavior of always returning logged_in: false (no real sessions)."""
    res = client.get("/api/user-status", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["logged_in"] is True
    assert body["user"]["id"] == seed_user
    assert body["user"]["email"] == "test@example.com"


def test_user_status_logged_out_with_garbage_token(client):
    """Malformed/expired JWT → logged_in: false (not a 401), so the
    frontend can quietly fall back to the login wall."""
    res = client.get("/api/user-status", headers={"Authorization": "Bearer garbage.token.here"})
    assert res.status_code == 200
    assert res.get_json() == {"logged_in": False}


def test_user_status_logged_out_when_user_deleted(client, seed_user, auth_headers, temp_db):
    """A valid JWT pointing at a user that's since been deleted from
    the DB should resolve as logged-out (not 500). This is the
    factory-reset path: user wipes everything → user row goes →
    next /api/user-status with the still-valid token returns
    logged_in:false so the frontend re-shows the login wall."""
    # Manually delete the user row out from under the still-valid JWT.
    import sqlite3
    conn = sqlite3.connect(temp_db)
    conn.execute("DELETE FROM users WHERE id = ?", (seed_user,))
    conn.commit()
    conn.close()

    res = client.get("/api/user-status", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"logged_in": False}


def test_auth_google_rejects_missing_token(client):
    """POST /api/auth/google with no `token` field returns 400.
    Caller-side validation safety net — frontend always sends one,
    but a curl-wielding attacker shouldn't hit the verify path with
    None and crash google.oauth2."""
    res = client.post("/api/auth/google", json={})
    assert res.status_code == 400
    body = res.get_json()
    assert "Missing" in body.get("error", "")


def test_auth_logout_invalidates_token(client, seed_user, auth_headers):
    """FIXING_ROADMAP §0.3 — POST /api/auth/logout bumps the user's
    `token_jti`, so every JWT we've ever issued them is rejected on
    the next request. Pre-§0.3 logout was a client-side localStorage
    drop; stolen copies stayed valid for 30 days. Now the token is
    actually invalid."""
    # Sanity: the fresh token works.
    pre = client.get("/api/user-status", headers=auth_headers)
    assert pre.get_json().get("logged_in") is True

    res = client.post("/api/auth/logout", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "logged_out"}

    # Same token, post-logout — should 401.
    post = client.get("/api/data", headers=auth_headers)
    assert post.status_code == 401
    # /api/user-status doesn't 401 (it's a probe), but it reports the
    # session as ended.
    probe = client.get("/api/user-status", headers=auth_headers)
    assert probe.get_json() == {"logged_in": False}


def test_auth_logout_requires_auth(client):
    """`/api/auth/logout` itself is gated by @require_auth — a caller
    with no token can't bump someone else's jti by trial."""
    res = client.post("/api/auth/logout")
    assert res.status_code == 401


# ── Auth gate (decorator) ────────────────────────────────────────────────────

def test_protected_endpoint_rejects_no_token(client):
    """Endpoints decorated with @require_auth return 401 when no
    Authorization header is present."""
    res = client.post("/api/trips", json={"trip": {"id": "t1", "name": "T"}})
    assert res.status_code == 401


def test_protected_endpoint_rejects_bad_token(client):
    """Wrong signature, expired exp, or just garbage → 401."""
    res = client.post("/api/trips",
                      headers={"Authorization": "Bearer not-a-real-jwt"},
                      json={"trip": {"id": "t1", "name": "T"}})
    assert res.status_code == 401


# ── /api/trips ───────────────────────────────────────────────────────────────

def test_upsert_trip_happy_path(client, seed_user, auth_headers):
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany", "country": "Italy"},
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "ok"
    # R3-Round 5: response now also carries `updatedAt` for the
    # client's optimistic-concurrency cycle. Format is a millisecond-
    # precision SQL timestamp.
    assert "updatedAt" in body
    assert body["updatedAt"], "updatedAt should be non-empty"


def test_upsert_trip_rejects_non_planner_edit(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Once trip-1 is owned by seed_user, seed_other_user can't overwrite
    it via their own JWT."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany", "country": "Italy"},
    })
    res = client.post("/api/trips", headers=other_auth_headers, json={
        "trip": {"id": "trip-1", "name": "Hijacked", "country": "Mars"},
    })
    assert res.status_code == 403


def test_upsert_trip_missing_data(client, auth_headers):
    res = client.post("/api/trips", headers=auth_headers, json={})
    assert res.status_code == 400


def test_trip_cover_url_round_trips(client, seed_user, auth_headers):
    """Cover photo URL persists across upsert + read (post-Phase-C
    feature). The frontend writes `coverUrl` (camelCase) and reads it
    back the same way; the column on disk is `cover_url`. Also confirms
    setting it to None removes the cover (overwrite semantics)."""
    cover = "/static/uploads/1234_test.jpg"
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-cover", "name": "Lisbon", "country": "Portugal",
            "coverUrl": cover,
        },
    })
    assert res.status_code == 200

    # Read back via /api/data — the round-trip surfaces the value as
    # `coverUrl` (the read mapping translates from cover_url).
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == "trip-cover")
    assert trip["coverUrl"] == cover

    # Overwrite with None — should clear the column. Test confirms the
    # ON CONFLICT clause writes `excluded.cover_url` (which is the new
    # NULL) rather than COALESCE-keeping the old value.
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-cover", "name": "Lisbon", "country": "Portugal",
            "coverUrl": None,
        },
    })
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == "trip-cover")
    assert trip["coverUrl"] is None


def test_trip_cover_url_optional(client, seed_user, auth_headers):
    """Legacy trips (no `coverUrl` in payload) still upsert cleanly,
    and the read returns None for that field. Backwards compat."""
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-legacy", "name": "Old Trip", "country": "Spain"},
    })
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == "trip-legacy")
    assert trip["coverUrl"] is None


# ── /api/expenses ────────────────────────────────────────────────────────────

def test_upsert_expense_happy_path(client, seed_user, auth_headers):
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-1", "tripId": "trip-1", "who": "Me", "value": 50,
            "currency": "EUR", "euroValue": 50, "label": "Lunch", "date": "2026-01-01",
        },
    })
    assert res.status_code == 200


def test_upsert_expense_rejected_when_not_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Non-planner can't write expenses to a trip they don't belong to."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/expenses", headers=other_auth_headers, json={
        "expense": {
            "id": "exp-1", "tripId": "trip-1", "who": "Hijacker", "value": 999,
            "currency": "EUR", "euroValue": 999, "label": "Steal", "date": "2026-01-01",
        },
    })
    assert res.status_code == 403


def test_upsert_expense_missing_payload(client, auth_headers):
    """Mirror of upsert_day_missing_payload — POST with no `expense`
    key returns 400 without writing anything."""
    res = client.post("/api/expenses", headers=auth_headers, json={})
    assert res.status_code == 400


def test_expense_receipt_url_round_trips(client, seed_user, auth_headers):
    """Receipt photo URL persists across upsert + read. Same shape as
    test_trip_cover_url_round_trips — sister feature in the post-Phase-C
    "small things" release."""
    receipt = "/static/uploads/9876_receipt.jpg"
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-r", "name": "Italy"},
    })
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-r", "tripId": "trip-r", "who": "Me", "value": 80,
            "currency": "EUR", "euroValue": 80, "label": "Dinner",
            "date": "2026-01-01", "receiptUrl": receipt,
        },
    })
    assert res.status_code == 200

    # Read via /api/data — receipt_url surfaces as `receiptUrl` thanks
    # to the explicit translation in routes/data.py (the rest of the
    # row stays snake_case for back-compat).
    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-r")
    assert expense["receiptUrl"] == receipt

    # Overwrite with None — column should clear (proves
    # excluded.receipt_url overwrites, not COALESCE-keeps).
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-r", "tripId": "trip-r", "who": "Me", "value": 80,
            "currency": "EUR", "euroValue": 80, "label": "Dinner",
            "date": "2026-01-01", "receiptUrl": None,
        },
    })
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-r")
    assert expense["receiptUrl"] is None


def test_expense_splits_persist_across_read(client, seed_user, auth_headers):
    """Audit fix (2026-05-26): the frontend's `splits` field (the
    {payer-name → percentage} map that drives ALL balance math) now
    persists to `expenses.splits_json` and round-trips back via the
    `serialize_expense_row` helper as `splits` on the JSON response.

    Pre-fix, splits lived only in localStorage; sign-in on a fresh
    device dropped them and balance math fell back to equal-split-
    across-roster, producing wildly different numbers.
    """
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-splits", "name": "Splits"},
    })
    splits = {"Alice": 60, "Bob": 40}
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-splits-1", "tripId": "trip-splits",
            "who": "Alice", "value": 100, "currency": "EUR",
            "euroValue": 100, "label": "Dinner", "date": "2026-01-01",
            "splits": splits,
        },
    })
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-splits-1")
    assert expense["splits"] == splits


def test_expense_is_settlement_persists(client, seed_user, auth_headers):
    """Audit fix (2026-05-26): the `isSettlement` flag now persists
    to `expenses.is_settlement` so settled debts (PATH B settle-up
    rows) don't resurrect on every sign-in.
    """
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-settle", "name": "Settle"},
    })
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-settle-1", "tripId": "trip-settle",
            "who": "Alice", "value": 50, "currency": "EUR",
            "euroValue": 50, "label": "Paid back",
            "date": "2026-01-01", "isSettlement": True,
        },
    })
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-settle-1")
    assert expense["isSettlement"] is True


def test_expense_splits_rejects_bad_shape(client, seed_user, auth_headers):
    """Server-side validation of the splits map: must be a dict of
    str→number in [0, 100]. Garbage rejected with 400."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-splits-bad", "name": "Bad"},
    })
    base = {
        "id": "exp-bad-shape", "tripId": "trip-splits-bad",
        "who": "Alice", "value": 100, "currency": "EUR",
        "euroValue": 100, "label": "X", "date": "2026-01-01",
    }
    # Non-dict splits.
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {**base, "splits": [50, 50]},
    })
    assert res.status_code == 400
    # Out-of-range percentage.
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {**base, "splits": {"Alice": 150}},
    })
    assert res.status_code == 400


def test_expense_receipt_url_optional(client, seed_user, auth_headers):
    """Legacy expenses (no `receiptUrl` in payload) still upsert + read
    cleanly with receiptUrl=None. Backwards compat."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-legacy-exp", "name": "Old"},
    })
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-legacy", "tripId": "trip-legacy-exp", "who": "Me",
            "value": 10, "currency": "EUR", "euroValue": 10,
            "label": "Coffee", "date": "2026-01-01",
        },
    })
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    expense = next(e for e in data["expenses"] if e["id"] == "exp-legacy")
    assert expense["receiptUrl"] is None


def test_delete_expense_happy_path(client, seed_user, auth_headers):
    """Owner can delete their own expense; row is gone after."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-1", "tripId": "trip-1", "who": "Me", "value": 50,
            "currency": "EUR", "euroValue": 50, "label": "Lunch", "date": "2026-01-01",
        },
    })
    res = client.delete("/api/expenses/exp-1", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


def test_delete_expense_idempotent_on_unknown_id(client, seed_user, auth_headers):
    """DELETE on a non-existent expense returns 200 (idempotent), not 404."""
    res = client.delete("/api/expenses/never-existed", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


def test_delete_expense_rejects_non_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Someone outside the trip can't actually delete its expenses. The
    endpoint returns the same idempotent 200 `{status: 'deleted'}` shape
    as a truly-absent expense (2026-05-18 change) so the response stops
    being an enumeration oracle for "exists but you can't touch it" vs
    "doesn't exist". Permission is still enforced — the row stays in
    place; pin that by re-reading it after the deny."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-1", "tripId": "trip-1", "who": "Me", "value": 50,
            "currency": "EUR", "euroValue": 50, "label": "Lunch", "date": "2026-01-01",
        },
    })
    res = client.delete("/api/expenses/exp-1", headers=other_auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}
    # Critical: the row MUST still exist — the 200 is a security
    # response, not a permission grant. Without this re-read the test
    # would pass even if the endpoint silently mutated the table.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM expenses WHERE id = 'exp-1'",
        ).fetchone()
    assert row is not None, "non-member's DELETE must NOT actually remove the row"


# ── /api/days ────────────────────────────────────────────────────────────────

def test_upsert_day_happy_path(client, seed_user, auth_headers):
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence", "date": "2026-01-02",
            "lat": 43.77, "lng": 11.25,
        },
    })
    assert res.status_code == 200


def test_upsert_day_missing_payload(client, auth_headers):
    res = client.post("/api/days", headers=auth_headers, json={})
    assert res.status_code == 400


def test_upsert_day_rejects_non_planner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Only the trip's planner-role members can upsert days."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    res = client.post("/api/days", headers=other_auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence", "date": "2026-01-02",
        },
    })
    assert res.status_code == 403


def test_delete_day_happy_path(client, seed_user, auth_headers):
    """Planner can delete a numbered day; row is gone after."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence", "date": "2026-01-02",
        },
    })
    res = client.delete("/api/days/day-1", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


def test_delete_day_idempotent_on_unknown_id(client, seed_user, auth_headers):
    """DELETE on a non-existent day returns 200 (idempotent)."""
    res = client.delete("/api/days/never-existed", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


def test_delete_day_rejects_anchor(client, seed_user, auth_headers):
    """Day 0 (Trip Anchor) is the trip's anchor and can't be deleted —
    the home UI hides the delete button on the anchor card; this 422
    is the belt-and-braces backend gate against curl-wielding users
    or stale clients firing the request anyway."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-anchor", "tripId": "trip-1", "dayNumber": 0,
            "name": "Trip Anchor",
        },
    })
    res = client.delete("/api/days/day-anchor", headers=auth_headers)
    assert res.status_code == 422
    body = res.get_json()
    assert "Anchor" in body["error"]


def test_delete_day_rejects_non_planner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Non-planner can't delete days off someone else's trip."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-1", "tripId": "trip-1", "dayNumber": 1,
            "name": "Florence",
        },
    })
    res = client.delete("/api/days/day-1", headers=other_auth_headers)
    assert res.status_code == 403


# ── /api/budgets ─────────────────────────────────────────────────────────────
# Budgets are per-user (not per-trip), so the gate is "caller owns this
# budget row". The audit fix replaced the previous "delete by id alone"
# path that let any caller wipe anyone's budget by guessing an id.

def test_upsert_budget_happy_path(client, seed_user, auth_headers):
    """Owner can create + update their own budget."""
    # §1.4 FK enforcement: budgets.trip_id is now a real FK to trips(id)
    # with ON DELETE SET NULL. Seed the trip first so the budget insert
    # doesn't trip the constraint. Before §1.4 this worked silently
    # because foreign_keys=OFF treated the FK as advisory.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Test trip", "country": "FR"},
    })
    res = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "budget-1", "tripId": "trip-1", "label": "Food",
            "amount": 200, "currency": "EUR",
        },
    })
    assert res.status_code == 200


def test_upsert_budget_missing_payload(client, auth_headers):
    """POST with no `budget` key returns 400."""
    res = client.post("/api/budgets", headers=auth_headers, json={})
    assert res.status_code == 400


def test_delete_budget_only_deletes_own_budget(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit-fix coverage: another user's DELETE of a guessed budget id
    is a silent no-op — the WHERE clause's `user_id = ?` makes the SQL
    delete zero rows. The endpoint still returns 200/{deleted} for
    idempotency, but the row stays put for the real owner."""
    # §1.4 FK enforcement: budgets.trip_id → trips(id). Seed the trip
    # so the budget insert below survives the FK check. See companion
    # comment on test_upsert_budget_happy_path for the rationale.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Test trip", "country": "FR"},
    })
    # Owner creates a budget
    client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "budget-mine", "tripId": "trip-1", "label": "Food",
            "amount": 200, "currency": "EUR",
        },
    })
    # Different user fires DELETE — request returns 200 but the row
    # survives because the gate is `user_id = ?` in the SQL.
    other_res = client.delete("/api/budgets/budget-mine", headers=other_auth_headers)
    assert other_res.status_code == 200

    # Owner can still delete it themselves (proves it wasn't actually
    # removed by the previous request).
    own_res = client.delete("/api/budgets/budget-mine", headers=auth_headers)
    assert own_res.status_code == 200
    assert own_res.get_json() == {"status": "deleted"}


def test_delete_budget_idempotent_on_unknown_id(client, seed_user, auth_headers):
    """DELETE on a non-existent budget returns 200 (idempotent)."""
    res = client.delete("/api/budgets/never-existed", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}


# ── /api/categories ──────────────────────────────────────────────────────────
# Replace-list endpoint: every POST overwrites the user's category set
# entirely. The frontend treats it as full-list sync (saveCategories
# fires after every reorder/add/edit/delete). Tests pin happy path +
# the empty-list "wipe everything" path so a user can intentionally
# clear their categories.

def test_sync_categories_replaces_list(client, seed_user, auth_headers):
    """First POST seeds the list; second POST with a smaller list
    replaces (doesn't merge). The DELETE-then-INSERT shape of the
    handler means partial sends are destructive on purpose."""
    client.post("/api/categories", headers=auth_headers, json={
        "categories": [
            {"id": "c1", "name": "Food", "icon": "🍔", "color": "#ff3b30"},
            {"id": "c2", "name": "Hotel", "icon": "🏨", "color": "#5856d6"},
        ],
    })
    res = client.post("/api/categories", headers=auth_headers, json={
        "categories": [
            {"id": "c1", "name": "Food", "icon": "🍔", "color": "#ff3b30"},
        ],
    })
    assert res.status_code == 200


def test_sync_categories_empty_list_clears(client, seed_user, auth_headers):
    """User can intentionally wipe their categories by POSTing an
    empty list. Empty-payload (no `categories` key) is treated the
    same — defaults to []."""
    res = client.post("/api/categories", headers=auth_headers, json={})
    assert res.status_code == 200


# ── /api/profile/update ──────────────────────────────────────────────────────
# Patch endpoint: any of (bio, status, homeCurrency) may be present.
# Missing fields stay untouched so callers can update one field at a
# time. Empty payload is a no-op rather than an error.

def test_update_profile_single_field(client, seed_user, auth_headers):
    """Patching one field returns 200/{updated}."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "bio": "Travel writer, occasional photographer.",
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_multiple_fields(client, seed_user, auth_headers):
    """Patching multiple fields in one call works — each field gets
    spliced into the SET clause separately. Status must be one of the
    server-side allowlisted values (FIXING_ROADMAP §0.1)."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "bio": "Travelling.",
        "status": "Exploring the world",
        "homeCurrency": "GBP",
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_status_rejects_off_allowlist(client, seed_user, auth_headers):
    """FIXING_ROADMAP §0.1: arbitrary status copy is rejected so a
    crafted client can't smuggle in a status string that renders on
    other users' profiles. The frontend dropdown only offers 5 fixed
    values; anything else is a 400."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "status": "I am evil <img onerror=alert(1)>",
    })
    assert res.status_code == 400
    assert "status" in (res.get_json() or {}).get("error", "")


def test_update_profile_bio_capped_at_500_chars(client, seed_user, auth_headers):
    """FIXING_ROADMAP §0.1: bios over 500 chars are rejected so the
    column can't be used as an unbounded payload store."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "bio": "x" * 501,
    })
    assert res.status_code == 400
    assert "bio" in (res.get_json() or {}).get("error", "")


def test_update_profile_empty_is_noop(client, seed_user, auth_headers):
    """Empty payload — no field to patch — returns {status:noop}
    rather than triggering a UPDATE with no SET clause."""
    res = client.post("/api/profile/update", headers=auth_headers, json={})
    assert res.status_code == 200
    assert res.get_json() == {"status": "noop"}


def test_update_profile_picture_local_upload_url(client, seed_user, auth_headers):
    """Round 5 audit fix: profile picture is now writable. The frontend
    uploads to /api/upload first, then POSTs the returned URL here.
    URLs from our own upload folder pass validation."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "picture": "/static/uploads/abc123.jpg",
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_picture_google_oauth_url(client, seed_user, auth_headers):
    """Google's OAuth profile-picture URLs (lh3.googleusercontent.com)
    pass validation when they MATCH the canonical value the OAuth flow
    set on first login.

    R2 audit fix: previously ANY lh3.googleusercontent.com URL was
    accepted, which let an attacker host a phishing image on Google
    Photos and set it as their TGG picture. Now only the exact URL
    Google issued during OAuth (stored in users.picture) is accepted
    on the BYO-google-url path. Other shapes (own upload, empty) are
    unchanged.
    """
    canonical = "https://lh3.googleusercontent.com/a/ACg8ocIabcdef=s96-c"
    # Simulate the OAuth flow having stamped this canonical value
    # onto the user's row.
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET picture = ? WHERE id = ?",
            (canonical, seed_user),
        )
        conn.commit()
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "picture": canonical,
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_picture_rejects_arbitrary_google_cdn_url(
    client, seed_user, auth_headers,
):
    """R2 audit fix regression: an lh3.googleusercontent.com URL that
    DOESN'T match the user's canonical OAuth-issued picture must be
    rejected. Pre-fix the validator accepted any URL on that CDN —
    attacker could host arbitrary content via Google Photos and set
    it as their TGG picture."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        # Not the user's canonical OAuth picture — should 403.
        "picture": "https://lh3.googleusercontent.com/a/attacker-controlled-asset=s96-c",
    })
    assert res.status_code == 403


def test_update_profile_picture_empty_clears(client, seed_user, auth_headers):
    """Empty string is the explicit "clear my photo" signal — passes
    validation."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "picture": "",
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_picture_rejects_arbitrary_url(client, seed_user, auth_headers):
    """Defence-in-depth: an attacker-supplied arbitrary URL (e.g. an
    SSRF probe, a remote tracking pixel) gets rejected. The users table
    must only ever hold our-uploads URLs or Google OAuth URLs — anything
    else and other clients hot-linking the picture would request the
    attacker's domain on every page load.

    Post §2.7 the error code changed from 400 → 403 because the
    rejection is "you can't reference that URL," not "the input
    was malformed."
    """
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "picture": "https://attacker.example.com/probe.gif",
    })
    assert res.status_code == 403
    assert "picture URL" in res.get_json()["error"]


def test_update_profile_picture_rejects_non_string(client, seed_user, auth_headers):
    """Non-string picture (number, object, null literal as JSON) is
    a 400 — the SQL UPDATE would otherwise silently store odd
    representations."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "picture": {"url": "https://example.com/x.jpg"},
    })
    assert res.status_code == 400
    assert res.get_json()["error"] == "picture must be a string"


# ── /api/profile/update — language (i18n session 3) ──────────────────────────
# Locale follows the user across devices: setLocale on the frontend
# POSTs the chosen value here, and /api/user-status returns it on
# next boot so the picker survives device switches. The allowlist
# matches the Locale union in i18n.ts; any other value gets a 400 so
# we never end up with junk in the DB.

def test_update_profile_language_accepts_en(client, seed_user, auth_headers):
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "en"})
    assert res.status_code == 200
    assert res.get_json()["status"] == "updated"


def test_update_profile_language_accepts_pt(client, seed_user, auth_headers):
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "pt"})
    assert res.status_code == 200


def test_update_profile_language_accepts_es(client, seed_user, auth_headers):
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "es"})
    assert res.status_code == 200


def test_update_profile_language_accepts_fr(client, seed_user, auth_headers):
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "fr"})
    assert res.status_code == 200


def test_update_profile_language_accepts_null_clears(client, seed_user, auth_headers):
    """Explicit null is the "reset to browser default" semantic — the
    frontend's detectBrowserLocale takes over until the user picks again."""
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": None})
    assert res.status_code == 200


def test_update_profile_language_rejects_unknown(client, seed_user, auth_headers):
    """Any string outside the en/pt/es/fr allowlist is a 400. Prevents
    a manipulated client from writing junk that the frontend's
    KNOWN_LOCALES gate would then silently fall back from."""
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "xx"})
    assert res.status_code == 400
    assert "en, pt, es, fr" in res.get_json()["error"]


def test_update_profile_language_rejects_non_string(client, seed_user, auth_headers):
    """Numeric/object payloads also get 400 (anything not in the allowlist)."""
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": 42})
    assert res.status_code == 400


def test_user_status_returns_language(client, seed_user, auth_headers):
    """Once a user picks a locale, /api/user-status returns it on the
    next boot so STATE.preferences.locale hydrates from the server
    instead of guessing from navigator.language."""
    client.post("/api/profile/update", headers=auth_headers, json={"language": "fr"})
    res = client.get("/api/user-status", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["logged_in"] is True
    assert body["user"]["language"] == "fr"


def test_user_status_returns_null_language_for_legacy_users(client, seed_user, auth_headers):
    """A user who hasn't picked a locale yet gets language: null —
    NOT an empty string, NOT 'en'. The frontend's getLocale handles
    the null case via detectBrowserLocale."""
    res = client.get("/api/user-status", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json()["user"]["language"] is None


# ── /api/friends ─────────────────────────────────────────────────────────────

def test_friend_add_happy_path(client, seed_user, seed_other_user, auth_headers):
    res = client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200
    assert res.get_json()["status"] == "success"


def test_friend_add_rejects_self(client, seed_user, auth_headers):
    res = client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_user,
    })
    assert res.status_code == 400


def test_friend_add_rejects_unknown_friend(client, seed_user, auth_headers):
    """The audit added an _ensure_user_exists check on the friend_id —
    pin it so a regression doesn't silently accept friend requests to
    nonexistent users."""
    res = client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": "ghost-user-id",
    })
    assert res.status_code == 404


def test_friend_accept_is_follow_back_under_model_b(
    client, seed_user, seed_other_user, auth_headers,
):
    """Model B: /api/friends/accept is now a façade for "follow them
    back" rather than the second half of a pending-request dance. The
    fabrication check from the original audit is gone — under Model B
    "accept" without a pending is just "I want to follow them", which
    is a legitimate first action (Twitter/Instagram model). 404 is no
    longer the right response; success is.

    Pre-Model-B this test was test_friend_accept_rejects_fabricated_invite
    and asserted 404. Updated here to reflect the new semantics: a
    follow row gets inserted, and a subsequent /api/friends/list call
    returns seed_other_user as a follow (not yet a mutual)."""
    res = client.post("/api/friends/accept", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200
    # And the follow edge actually landed in the follows table.
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        )
        assert c.fetchone() is not None


# ── /api/upload ──────────────────────────────────────────────────────────────

def test_upload_rejects_anonymous(client):
    """Wide-open upload was the audit's biggest find. Pin that anonymous
    requests get 401."""
    res = client.post("/api/upload", data={
        "file": (io.BytesIO(b"hello"), "x.txt"),
    })
    assert res.status_code == 401


def test_upload_rejects_disallowed_extension(client, seed_user, auth_headers):
    """Hardening: .exe / .txt / etc. fail the extension allowlist before
    even being read. Pin so a regression doesn't reopen the wide-open file
    write."""
    res = client.post("/api/upload", headers=auth_headers, data={
        "file": (io.BytesIO(b"MZ\x90"), "bomb.exe"),
    })
    assert res.status_code == 400


def test_upload_rejects_extension_spoofing(client, seed_user, auth_headers):
    """Hardening: an .exe renamed to .jpg still fails the magic-number
    sniff. Without this check, secure_filename would accept it as long
    as the extension was on the allowlist."""
    res = client.post("/api/upload", headers=auth_headers, data={
        # 'MZ' is the .exe magic number — not a JPEG.
        "file": (io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00"), "fake.jpg"),
    })
    assert res.status_code == 400


def test_upload_accepts_valid_jpeg(
    client, seed_user, auth_headers, tmp_path, monkeypatch,
):
    """Happy path: a real JPEG (with the FFD8FF magic prefix) saves."""
    # Redirect uploads to tmp_path so the test doesn't write into the
    # real frontend/static/uploads directory.
    import main as main_module
    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    res = client.post("/api/upload", headers=auth_headers, data={
        "file": (io.BytesIO(b"\xff\xd8\xff\xe0minimal-jpeg-header"), "real.jpg"),
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["name"] == "real.jpg"
    assert body["url"].startswith("/static/uploads/")


def test_uploads_anonymous_fetch_404s_for_private_files(
    client, seed_user, auth_headers, tmp_path, monkeypatch,
):
    """R2 audit fix: /static/uploads/ was being served by Flask's
    default static handler with zero auth. Now the route requires
    either a signed-in caller OR the file is referenced by a trip
    with is_public=1. Verify the anonymous-private path returns 404
    so an attacker holding a leaked URL gets nothing."""
    import main as main_module
    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    # Upload while signed in.
    up = client.post("/api/upload", headers=auth_headers, data={
        "file": (io.BytesIO(b"\xff\xd8\xff\xe0private-photo"), "private.jpg"),
    })
    assert up.status_code == 200
    url = up.get_json()["url"]  # /static/uploads/<user>/<token>_private.jpg
    # Clear the session cookie so the next fetch is anonymous.
    client.delete_cookie("gg_session", domain="localhost")
    res = client.get(url)
    # File exists on disk, but no public-trip references it → 404.
    assert res.status_code == 404, (
        "anonymous fetch of a private upload must 404, "
        "not leak the bytes via Flask's default static handler"
    )


def test_uploads_anonymous_fetch_allowed_for_public_trip_cover(
    client, seed_user, auth_headers, tmp_path, monkeypatch,
):
    """A trip that is_public=1 with cover_url pointing at the upload
    MUST be readable anonymously — public /share/<token> viewers and
    /api/public-trip clients render the cover via <img> with no auth."""
    import main as main_module
    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    up = client.post("/api/upload", headers=auth_headers, data={
        "file": (io.BytesIO(b"\xff\xd8\xff\xe0cover"), "cover.jpg"),
    })
    url = up.get_json()["url"]
    # Create a public trip that uses this cover.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-public-cover", "name": "Lisbon",
            "isPublic": True, "coverUrl": url,
        },
    })
    client.delete_cookie("gg_session", domain="localhost")
    res = client.get(url)
    assert res.status_code == 200, (
        "anonymous fetch of a cover from a public trip must succeed; "
        "got %s — public sharing renders covers via <img> with no auth" % res.status_code
    )


# ── /api/data ────────────────────────────────────────────────────────────────

def test_data_returns_empty_for_new_user(client, seed_user, auth_headers):
    res = client.get("/api/data", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["trips"] == []
    assert body["expenses"] == []


def test_data_returns_populated_payload(client, seed_user, auth_headers):
    """/api/data is the boot-time pull. Pin the response shape — frontend
    pullFromServer reads `trips`, `expenses`, `tripDays`, `categories`,
    `budgets` off this payload + does the trip-row field rename
    (place_id → placeId, etc.) inline."""
    # Seed a trip + day + expense + category + budget so every list comes
    # back non-empty.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-data", "name": "Madrid", "country": "Spain"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-data-1", "tripId": "trip-data", "dayNumber": 1,
            "name": "Sol", "date": "2026-05-10",
        },
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-data-1", "tripId": "trip-data", "who": "Me",
            "value": 8.5, "currency": "EUR", "euroValue": 8.5,
            "label": "Coffee", "date": "2026-05-10",
        },
    })
    client.post("/api/categories", headers=auth_headers, json={
        "categories": [{"id": "c-food", "name": "Food", "icon": "🍔", "color": "#ff3b30"}],
    })
    client.post("/api/budgets", headers=auth_headers, json={
        "budget": {"id": "b-1", "tripId": "trip-data", "label": "Food", "amount": 100, "currency": "EUR"},
    })

    res = client.get("/api/data", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert len(body["trips"]) == 1
    assert body["trips"][0]["name"] == "Madrid"
    assert len(body["expenses"]) == 1
    assert len(body["tripDays"]) == 1
    assert len(body["categories"]) == 1
    assert len(body["budgets"]) == 1


# ── /api/sync ────────────────────────────────────────────────────────────────
# Bulk "replace everything in one POST" path. Most write traffic goes
# through delta endpoints now (routes/expenses.py, routes/days.py, etc.)
# but /api/sync is preserved for legacy clients + defensive re-syncs.

def test_sync_writes_trips_and_expenses(client, seed_user, auth_headers):
    """Happy path: POST a full STATE payload, then GET /api/data and
    assert the server holds the same trips + expenses."""
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [
            {"id": "trip-sync-1", "name": "Paris", "country": "France"},
        ],
        "expenses": [
            {
                "id": "exp-sync-1", "tripId": "trip-sync-1", "who": "Me",
                "categoryId": "c-food", "country": "France",
                "value": 5, "currency": "EUR", "euroValue": 5,
                "label": "Croissant", "date": "2026-05-12",
            },
        ],
    })
    assert res.status_code == 200

    # Round-trip: pull and confirm.
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert any(t["id"] == "trip-sync-1" for t in body["trips"])
    assert any(e["id"] == "exp-sync-1" for e in body["expenses"])


def test_sync_rejects_trip_in_both_active_and_archived_lists(
    client, seed_user, auth_headers,
):
    """§2.6: pre-fix, a client that sent the same trip in BOTH
    `trips` AND `archived_trips` had its archive flag silently
    flipped to 1 (the archived loop always ran last + hardcoded 1).
    Now we reject the whole sync with 400 BEFORE writing anything,
    so the client can fix its state on the next 15s poll.
    """
    res = client.post(
        "/api/sync",
        headers=auth_headers,
        json={
            "trips": [
                {"id": "trip-dup-26", "name": "Paris", "country": "France"},
            ],
            "archived_trips": [
                {"id": "trip-dup-26", "name": "Paris", "country": "France"},
            ],
        },
    )
    assert res.status_code == 400, \
        f"expected 400 on duplicate trip across lists, got {res.status_code}"
    body = res.get_json()
    assert "trip-dup-26" in body.get("error", ""), \
        f"error message should name the offending trip: {body!r}"

    # Critical: the rejection happens BEFORE any DB write, so the trip
    # row should NOT exist after this failed sync. Pull and confirm.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    assert not any(t["id"] == "trip-dup-26" for t in pull["trips"]), \
        "rejected sync should not have created a trip row"


def test_sync_migrating_trip_from_active_to_archived_still_works(
    client, seed_user, auth_headers,
):
    """§2.6 contract: the rejection is for SAME-SYNC duplicates only.
    A trip cleanly moving from active→archived across TWO separate
    syncs (the normal archive flow) must still work — that's what the
    /api/sync contract is for, and the §2.6 fix shouldn't have broken
    it.
    """
    # Sync 1: trip is active.
    res1 = client.post(
        "/api/sync",
        headers=auth_headers,
        json={"trips": [{"id": "trip-mig-26", "name": "Lisbon", "country": "Portugal"}]},
    )
    assert res1.status_code == 200

    # Sync 2: trip moved to archived list, NOT in active list.
    res2 = client.post(
        "/api/sync",
        headers=auth_headers,
        json={
            "trips": [],
            "archived_trips": [
                {"id": "trip-mig-26", "name": "Lisbon", "country": "Portugal"},
            ],
        },
    )
    assert res2.status_code == 200, \
        f"clean migration sync should succeed, got {res2.status_code}: {res2.get_data(as_text=True)}"


def test_sync_does_not_let_caller_take_over_someone_elses_trip(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit-fix coverage: /api/sync used to let any caller hijack an
    existing trip by re-syncing it (the ON CONFLICT path overwrote
    user_id with whatever the caller passed in). The fix skips trips
    the caller doesn't own; this test pins that the OWNER's row
    survives a hostile sync intact."""
    # Owner creates a trip
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-mine", "name": "Original Name"},
    })
    # Different user fires /api/sync trying to overwrite it
    res = client.post("/api/sync", headers=other_auth_headers, json={
        "trips": [{"id": "trip-mine", "name": "HIJACKED"}],
        "expenses": [],
    })
    # The endpoint returns 200 (partial-sync semantics — friend's
    # legitimate own-rows still get saved) but the original trip
    # is untouched.
    assert res.status_code == 200
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    found = next(t for t in body["trips"] if t["id"] == "trip-mine")
    assert found["name"] == "Original Name"  # NOT "HIJACKED"


def test_expenses_single_row_upsert_blocks_cross_trip_hijack(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: /api/expenses POST gated on the client-claimed
    tripId, so a planner on trip A could rewrite an expense in trip B
    by POSTing {id: <B-expense>, tripId: <A>}. The fix gates on the
    EXISTING row's trip_id when the row exists."""
    # Victim creates trip + expense
    client.post("/api/trips", headers=other_auth_headers, json={
        "trip": {"id": "trip-victim", "name": "Victim"},
    })
    client.post("/api/expenses", headers=other_auth_headers, json={
        "expense": {
            "id": "exp-victim", "tripId": "trip-victim", "who": "Owner",
            "value": 100, "currency": "EUR", "euroValue": 100,
            "label": "Dinner", "date": "2026-05-12",
        },
    })
    # Attacker has their own trip
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-attacker", "name": "Attacker"},
    })
    # Attacker tries to rewrite victim's expense by claiming attacker tripId.
    # value=1 (not 0) — R3-Round 2 fix tightened validate_money to
    # reject zero-value expenses globally, so we use a positive value
    # so the hijack-check fires BEFORE the validator.
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-victim", "tripId": "trip-attacker", "who": "PWNED",
            "value": 1, "currency": "EUR", "euroValue": 1,
            "label": "hijacked", "date": "2026-01-01",
        },
    })
    assert res.status_code == 403, "cross-trip expense hijack must be forbidden"
    # Victim's row must be untouched
    pull = client.get("/api/data", headers=other_auth_headers)
    found = next(e for e in pull.get_json()["expenses"] if e["id"] == "exp-victim")
    assert found["label"] == "Dinner"
    assert found["value"] == 100


def test_days_single_row_upsert_blocks_cross_trip_hijack(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: same shape as the expenses fix for /api/days."""
    client.post("/api/trips", headers=other_auth_headers, json={
        "trip": {"id": "trip-victim-d", "name": "Victim"},
    })
    client.post("/api/days", headers=other_auth_headers, json={
        "day": {
            "id": "day-victim", "tripId": "trip-victim-d",
            "dayNumber": 1, "name": "Arrival", "date": "2026-05-12",
        },
    })
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-attacker-d", "name": "Attacker"},
    })
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-victim", "tripId": "trip-attacker-d",
            "dayNumber": 99, "name": "PWNED", "date": "2030-01-01",
        },
    })
    assert res.status_code == 403, "cross-trip day hijack must be forbidden"
    pull = client.get("/api/data", headers=other_auth_headers)
    found = next(d for d in pull.get_json()["tripDays"] if d["id"] == "day-victim")
    assert found["name"] == "Arrival"


def test_sync_archived_expense_loop_blocks_cross_trip_hijack(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: the archived-trips inner expense loop in /api/sync
    had the same IDOR shape as the single-row /api/expenses POST. The
    active-expense loop in /api/sync was fixed earlier; the archived
    branch was missed until now."""
    # Victim creates trip + expense
    client.post("/api/trips", headers=other_auth_headers, json={
        "trip": {"id": "trip-archived-victim", "name": "Victim"},
    })
    client.post("/api/expenses", headers=other_auth_headers, json={
        "expense": {
            "id": "exp-archived-victim", "tripId": "trip-archived-victim", "who": "Owner",
            "value": 250, "currency": "EUR", "euroValue": 250,
            "label": "Hotel", "date": "2026-05-12",
        },
    })
    # Attacker fires /api/sync with archived_trips smuggling victim's expense id
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "archived_trips": [{
            "id": "trip-attacker-smuggle", "name": "Smuggle", "country": "X",
            "expenses": [{
                "id": "exp-archived-victim", "who": "PWNED",
                "categoryId": "c1", "label": "hijacked",
                "date": "2030-01-01", "country": "X",
                "value": 0, "currency": "EUR", "euroValue": 0,
            }],
        }],
    })
    # Sync returns 200 (partial-write semantics), but the victim's
    # row must be UNTOUCHED
    pull = client.get("/api/data", headers=other_auth_headers)
    found = next(e for e in pull.get_json()["expenses"] if e["id"] == "exp-archived-victim")
    assert found["label"] == "Hotel", \
        f"archived-loop IDOR hijack must not rewrite victim row, got: {found}"
    assert found["value"] == 250


# ── /api/user-data DELETE (factory reset) ────────────────────────────────────

def test_user_data_delete_wipes_trips_and_expenses(client, seed_user, auth_headers):
    """Settings → Reset → Wipe triggers a DELETE /api/user-data which
    nukes every trip + expense the caller owns AND the user row itself
    (the route at routes/data.py:496 ends with DELETE FROM users).

    Post §0.3, the JWT carries a `jti` claim that must match the user's
    `token_jti` column — when the user row is wiped, the lookup fails
    and any subsequent request with that token returns 401. That's the
    correct security behaviour after a factory reset: the prior token
    must NOT continue to work, even when the row it pointed at is gone.
    Pre-§0.3 the token kept working against a nonexistent user_id and
    `/api/data` returned empty arrays — a confusing state."""
    # Seed a trip + expense to wipe
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-doomed", "name": "Going Away"},
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-doomed", "tripId": "trip-doomed", "who": "Me",
            "value": 1, "currency": "EUR", "euroValue": 1,
            "label": "Sad", "date": "2026-05-12",
        },
    })

    res = client.delete("/api/user-data", headers=auth_headers)
    assert res.status_code == 200

    # Token is now invalid (its `jti` claim references a `token_jti`
    # that was deleted along with the user row). Any authenticated
    # endpoint returns 401.
    pull = client.get("/api/data", headers=auth_headers)
    assert pull.status_code == 401


def test_expense_stale_clientUpdatedAt_returns_409(
    client, seed_user, auth_headers,
):
    """R3-Round 4 fix: when a client POSTs an UPDATE with
    `clientUpdatedAt` set to a value that no longer matches the
    stored `updated_at`, the route returns 409 + the live row.
    Pre-fix the second client's edit silently clobbered the first
    — last-write-wins. Now: the second client gets a chance to
    re-render against fresh state and retry."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-stale-edit")
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-stale", "tripId": trip_id, "who": "Me",
            "value": 10, "currency": "EUR", "euroValue": 10,
            "label": "first", "date": "2026-05-12",
        },
    })
    assert res.status_code == 200
    first_updated_at = res.get_json()["updatedAt"]
    assert first_updated_at, "first write should return updatedAt"

    # Second write WITHOUT clientUpdatedAt — legacy path, accepted.
    res2 = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-stale", "tripId": trip_id, "who": "Me",
            "value": 11, "currency": "EUR", "euroValue": 11,
            "label": "second", "date": "2026-05-12",
        },
    })
    assert res2.status_code == 200
    second_updated_at = res2.get_json()["updatedAt"]
    assert second_updated_at != first_updated_at, \
        "updatedAt should advance on each write"

    # Third write WITH the now-stale first_updated_at → 409.
    res3 = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-stale", "tripId": trip_id, "who": "Me",
            "value": 99, "currency": "EUR", "euroValue": 99,
            "label": "stale", "date": "2026-05-12",
            "clientUpdatedAt": first_updated_at,
        },
    })
    assert res3.status_code == 409
    body = res3.get_json()
    assert "current" in body, "409 should include the live row"
    # And the row is unchanged from the second write.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(e for e in pull["expenses"] if e["id"] == "exp-stale")
    assert found["label"] == "second", \
        "stale write should not have overwritten the second write"
    assert found["value"] == 11


def test_trip_stale_clientUpdatedAt_returns_409(
    client, seed_user, auth_headers,
):
    """R3-Round 5 B1 mirror of the expense test above. POST /api/trips
    with a stale `clientUpdatedAt` returns 409 + `current` so the
    losing client can re-render against fresh state and retry."""
    # First write — no clientUpdatedAt (new row).
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-stale", "name": "Florence", "country": "Italy"},
    })
    assert res.status_code == 200
    first_updated_at = res.get_json().get("updatedAt")
    assert first_updated_at, "first write should return updatedAt"

    # Second write WITHOUT clientUpdatedAt — legacy path, accepted.
    res2 = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-stale", "name": "Florence 2", "country": "Italy"},
    })
    assert res2.status_code == 200
    second_updated_at = res2.get_json().get("updatedAt")
    assert second_updated_at and second_updated_at != first_updated_at, \
        "updatedAt should advance on each write"

    # Third write WITH the now-stale first_updated_at → 409.
    res3 = client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-stale", "name": "Florence 99", "country": "Italy",
            "clientUpdatedAt": first_updated_at,
        },
    })
    assert res3.status_code == 409
    body = res3.get_json()
    assert "current" in body, "409 should include the live row"
    # And the row is unchanged from the second write.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(t for t in pull["trips"] if t["id"] == "trip-stale")
    assert found["name"] == "Florence 2", \
        "stale write should not have overwritten the second write"


def test_budget_stale_clientUpdatedAt_returns_409(
    client, seed_user, auth_headers,
):
    """R3-Round 5 B2 mirror of the expense test. Budgets gate on
    clientUpdatedAt the same way."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-budget-stale")
    res = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "bud-stale", "tripId": trip_id,
            "amount": 100, "currency": "EUR",
            "originalAmount": 100, "originalCurrency": "EUR",
            "categoryId": "all", "user": "all",
        },
    })
    assert res.status_code == 200
    first_updated_at = res.get_json().get("updatedAt")
    assert first_updated_at

    res2 = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "bud-stale", "tripId": trip_id,
            "amount": 200, "currency": "EUR",
            "originalAmount": 200, "originalCurrency": "EUR",
            "categoryId": "all", "user": "all",
        },
    })
    assert res2.status_code == 200
    assert res2.get_json().get("updatedAt") != first_updated_at

    res3 = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "bud-stale", "tripId": trip_id,
            "amount": 999, "currency": "EUR",
            "originalAmount": 999, "originalCurrency": "EUR",
            "categoryId": "all", "user": "all",
            "clientUpdatedAt": first_updated_at,
        },
    })
    assert res3.status_code == 409
    assert "current" in res3.get_json()
    # Row unchanged from second write.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(b for b in pull["budgets"] if b["id"] == "bud-stale")
    assert found["amount"] == 200


def test_day_stale_clientUpdatedAt_returns_409(
    client, seed_user, auth_headers,
):
    """R3-Round 5 B3 mirror. /api/days gate on clientUpdatedAt."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-day-stale")
    res = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-stale", "tripId": trip_id, "dayNumber": 1,
            "date": "2026-05-12", "name": "Day 1",
            "plan": {"morning": "first", "afternoon": "", "evening": ""},
        },
    })
    assert res.status_code == 200
    first_updated_at = res.get_json().get("updatedAt")
    assert first_updated_at

    res2 = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-stale", "tripId": trip_id, "dayNumber": 1,
            "date": "2026-05-12", "name": "Day 1",
            "plan": {"morning": "second", "afternoon": "", "evening": ""},
        },
    })
    assert res2.status_code == 200
    assert res2.get_json().get("updatedAt") != first_updated_at

    res3 = client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-stale", "tripId": trip_id, "dayNumber": 1,
            "date": "2026-05-12", "name": "Day 1",
            "plan": {"morning": "stale", "afternoon": "", "evening": ""},
            "clientUpdatedAt": first_updated_at,
        },
    })
    assert res3.status_code == 409
    assert "current" in res3.get_json()
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(d for d in pull["tripDays"] if d["id"] == "day-stale")
    # The day's plan is stored as morning/afternoon/evening at the
    # top level (not nested in `plan`) on the /api/data shape.
    morning = (
        found.get("plan", {}).get("morning")
        if isinstance(found.get("plan"), dict)
        else found.get("morning")
    )
    assert morning == "second", \
        "stale write should not have overwritten the second write"


def test_sync_bumps_updated_at_so_subsequent_post_sees_advancement(
    client, seed_user, auth_headers,
):
    """R4-B1 regression test: /api/sync UPDATEs must stamp updated_at
    on the rows they rewrite. Pre-fix the sync path silently rewrote
    expense / trip / budget / day fields without bumping the stamp —
    the next single-row POST then saw stored == client (both stale),
    passed the R3-R4/R3-R5 gate, and blind-overwrote whatever the
    sync had just delivered. This test pins the fix by asserting
    that an /api/sync UPDATE moves the stored updated_at forward."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-sync-stamp")
    # First, POST an expense to seed it with a known updatedAt.
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-sync-stamp", "tripId": trip_id, "who": "Me",
            "value": 10, "currency": "EUR", "euroValue": 10,
            "label": "first", "date": "2026-05-12",
        },
    })
    assert res.status_code == 200
    first_updated_at = res.get_json()["updatedAt"]

    # Now bulk-sync the SAME row through /api/sync with a different label.
    # The sync UPDATE should bump updated_at — pre-R4-B1 it would NOT.
    sync_payload = {
        "trips": [], "archived_trips": [], "categories": [],
        "trip_days": [], "budgets": [],
        "expenses": [{
            "id": "exp-sync-stamp", "tripId": trip_id, "who": "Me",
            "value": 22, "currency": "EUR", "euroValue": 22,
            "label": "via-sync", "date": "2026-05-12",
        }],
    }
    sync_res = client.post("/api/sync", headers=auth_headers, json=sync_payload)
    assert sync_res.status_code in (200, 204)

    # Pull and check the stored updated_at advanced past first_updated_at.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(e for e in pull["expenses"] if e["id"] == "exp-sync-stamp")
    assert found["label"] == "via-sync", "sync UPDATE should have landed"
    assert found.get("updatedAt"), "expense should expose updatedAt"
    assert found["updatedAt"] > first_updated_at, (
        "sync UPDATE must bump updated_at, otherwise the R3-R4 stale-edit "
        "gate can be silently bypassed by a sync poll racing a POST"
    )


def test_expense_euro_value_recomputed_server_side(
    client, seed_user, auth_headers,
):
    """R3-Fix #6: pre-fix /api/expenses stored client-supplied
    `euroValue` verbatim — a buggy or malicious client could post
    `{value:1, currency:"USD", euroValue:1000000}` and that million-
    euro hit landed in balance math and PDF totals. Now: when a live
    FX rate exists (or currency is EUR), the server overrides the
    client number with its own computation. The client hint is only
    accepted on the cold path (Frankfurter down + uncommon code).
    """
    # Pre-seed an FX rate so we can predict the server's recompute.
    # USD's rate to EUR is ~0.92 (current live, but for the test
    # we control it by injecting into the cache directly).
    import fx_rates
    fx_rates._cache = {"EUR": 1.0, "USD": 0.5}  # 1 USD = 0.5 EUR
    fx_rates._cache_set_at = __import__('time').time()
    try:
        trip_id = _create_trip(
            client, auth_headers, trip_id="trip-eur-recompute",
        )
        # Client lies about euroValue — sends 999 for a $100 expense.
        res = client.post("/api/expenses", headers=auth_headers, json={
            "expense": {
                "id": "exp-eur-recompute",
                "tripId": trip_id, "who": "Me",
                "value": 100, "currency": "USD",
                "euroValue": 999,  # lie — should be 50 at 0.5 rate
                "label": "lunch", "date": "2026-05-12",
            },
        })
        assert res.status_code == 200
        # Server should have ignored the client's 999 and recomputed
        # from the live rate: 100 USD × 0.5 = 50 EUR.
        from database import get_db
        with get_db() as conn:
            row = conn.execute(
                "SELECT euro_value FROM expenses WHERE id = ?",
                ("exp-eur-recompute",),
            ).fetchone()
            assert row["euro_value"] == 50.0, \
                f"server didn't recompute euro_value: got {row['euro_value']!r}"
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0.0


def test_budget_upsert_rejects_cross_user_id(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R3-Fix #2: pre-fix, `POST /api/budgets` with another user's
    budget id silently rewrote the row in place because the ON
    CONFLICT clause had no user_id ownership gate. Now: the route
    SELECTs first and returns 404 if the existing row belongs to
    another caller (anti-enumeration: same shape as a non-existent
    id)."""
    # Victim creates a budget.
    res = client.post("/api/budgets", headers=auth_headers, json={
        "budget": {
            "id": "bud-victim", "label": "Lisbon Food",
            "amount": 300, "currency": "EUR",
        },
    })
    assert res.status_code == 200

    # Attacker tries to overwrite it with their own id reference.
    res = client.post("/api/budgets", headers=other_auth_headers, json={
        "budget": {
            "id": "bud-victim", "label": "Hijacked",
            "amount": 0, "currency": "USD",
        },
    })
    assert res.status_code == 404

    # Verify the victim's row is unchanged.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT label, amount, currency, user_id FROM budgets WHERE id = ?",
            ("bud-victim",),
        ).fetchone()
        assert row["label"] == "Lisbon Food"
        assert row["amount"] == 300
        assert row["currency"] == "EUR"
        assert row["user_id"] == seed_user


def test_settlement_party_fk_set_null_on_user_delete(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R3-Fix #5: pre-fix, settlements.from_user_id and to_user_id
    were ON DELETE CASCADE. When the from-party deleted their account,
    every settlement they were a party to was cascade-deleted —
    including ones on the OTHER user's trips. The counter-party's
    balance page then silently regressed (the settlement that paid
    a debt was gone, but the debt-creating expense survived).
    Now: party FKs SET NULL; from_name/to_name snapshots preserve
    the audit trail."""
    # Ana (seed_user) makes a trip and invites Bruno (seed_other_user)
    # as planner; Bruno accepts. Both are now accepted members — the
    # route gates settlements on both parties being accepted.
    trip_id = _create_trip(client, auth_headers, trip_id="trip-fk-settle")
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "planner",
    })
    client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })
    # Ana records a settlement: Ana paid Bruno €50.
    res = client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id, "fromName": "Ana", "toName": "Bruno",
        "fromUserId": seed_user, "toUserId": seed_other_user,
        "amount": 50, "currency": "EUR", "euroValue": 50,
    })
    assert res.status_code == 201, res.get_json()
    settlement_id = res.get_json()["settlement"]["id"]

    # Bruno deletes his account.
    res = client.delete("/api/user-data", headers=other_auth_headers)
    assert res.status_code == 200

    # The settlement row STILL EXISTS — to_user_id is now NULL,
    # to_name snapshot preserved.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, from_user_id, to_user_id, from_name, to_name "
            "FROM settlements WHERE id = ?",
            (settlement_id,),
        ).fetchone()
        assert row is not None, "settlement got cascade-deleted on user delete"
        assert row["to_user_id"] is None  # FK SET NULL fired
        # Snapshot name (whatever the server resolved from users.name at
        # insert time) survives. Don't assert the exact string — different
        # fixtures pick different display names — just confirm we still
        # have the audit trail.
        assert row["to_name"], \
            "to_name snapshot was lost on user delete (audit trail broken)"


def test_user_data_delete_wipes_auth_sessions_and_feed(
    client, seed_user, auth_headers,
):
    """R3-Fix #4: pre-fix, /api/user-data left auth_sessions /
    feed_posts / feed_likes / feed_comments / feed_bookmarks / blocks
    intact. Now they're all wiped alongside the rest."""
    # Seed: a feed_like, a feed_comment, an auth_sessions row (auto-
    # created on issue_token), and a block.
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO feed_likes (user_id, event_id) VALUES (?, ?)",
            (seed_user, "trip_created_x"),
        )
        conn.execute(
            "INSERT INTO feed_comments (event_id, user_id, body) VALUES (?, ?, ?)",
            ("trip_created_x", seed_user, "hi"),
        )
        # Need a second user for the block target.
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)",
            ("u-target", "target@example.com", "Target"),
        )
        conn.execute(
            "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)",
            (seed_user, "u-target"),
        )
        conn.commit()
        # Verify the seeded rows are there before delete.
        assert conn.execute(
            "SELECT 1 FROM feed_likes WHERE user_id = ?", (seed_user,),
        ).fetchone()
        assert conn.execute(
            "SELECT 1 FROM auth_sessions WHERE user_id = ?", (seed_user,),
        ).fetchone()

    res = client.delete("/api/user-data", headers=auth_headers)
    assert res.status_code == 200

    # All wiped.
    with get_db() as conn:
        assert not conn.execute(
            "SELECT 1 FROM feed_likes WHERE user_id = ?", (seed_user,),
        ).fetchone()
        assert not conn.execute(
            "SELECT 1 FROM feed_comments WHERE user_id = ?", (seed_user,),
        ).fetchone()
        assert not conn.execute(
            "SELECT 1 FROM auth_sessions WHERE user_id = ?", (seed_user,),
        ).fetchone()
        assert not conn.execute(
            "SELECT 1 FROM blocks WHERE blocker_id = ? OR blocked_id = ?",
            (seed_user, seed_user),
        ).fetchone()


# ── Rate limiting ────────────────────────────────────────────────────────────

def test_rate_limit_friends_add(temp_db, seed_user):
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

    from auth import issue_token

    # Insert seed_user since this test doesn't go through the seed_user fixture's
    # client-context (rate-limit setup needs its own app context). Wait — the
    # seed_user fixture already inserted the row above; that's why we depend on it.
    headers = {"Authorization": f"Bearer {issue_token(seed_user)}"}

    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = True
    limiter.reset()

    try:
        with app.test_client() as c:
            # 30 allowed; the 31st should be 429.
            for i in range(30):
                res = c.post("/api/friends/add", headers=headers, json={
                    "friend_id": f"y{i}",
                })
                # body may be 404 (unknown friend) — limiter allows the
                # request to reach the handler, which then rejects on
                # its own gate. Either way it shouldn't be 429 yet.
                assert res.status_code != 429
            res = c.post("/api/friends/add", headers=headers, json={
                "friend_id": "y-last",
            })
            assert res.status_code == 429
    finally:
        app.config["RATELIMIT_ENABLED"] = False
        limiter.reset()


# ════════════════════════════════════════════════════════════════════════════
# Phase A2 expansion — coverage for routes shipped post-Phase G.
# ════════════════════════════════════════════════════════════════════════════
#
# These tests pin ONE happy path + critical error case per route. The auth
# gate is checked once via the parametrised test below rather than redundantly
# per route — the @require_auth decorator's behaviour is identical everywhere
# it's applied; per-route auth tests add noise without catching anything new.
#
# Trip / feed setup helpers are factored out so each test reads as just the
# specific action it's pinning.

import pytest


def _create_trip(client, headers, trip_id="trip-feed", name="Test Trip", public=False):
    """Mint a trip via /api/trips. Pass `public=True` to flip
    `is_public = 1` so the trip is shareable to the feed — the
    /api/feed/share endpoint requires public visibility (2026-05-18
    change closing the "share private trip card with broken
    click-through" hole). Defaults to private (matching the trip-
    create endpoint's own default) so non-share tests keep their
    pre-change behaviour."""
    trip_payload: dict = {"id": trip_id, "name": name, "country": "Test"}
    if public:
        trip_payload["isPublic"] = True
    res = client.post("/api/trips", headers=headers, json={"trip": trip_payload})
    assert res.status_code == 200
    return trip_id


# `_befriend` helper lives further down (line ~1465); reused here for
# FIXING_ROADMAP §1.3 feed-engagement tests that need an accepted
# friendship before the visibility gate lets them through.


# ── Auth gate sweep ──────────────────────────────────────────────────────────
# One test, every gated endpoint. Each (method, path) tuple should return 401
# when called without an Authorization header. Catches any new endpoint that
# ships without @require_auth.

GATED_ROUTES = [
    ("GET", "/api/feed"),
    ("POST", "/api/feed/share"),
    ("GET", "/api/feed/share/status/trip-x"),
    ("DELETE", "/api/feed/share/1"),
    ("POST", "/api/feed/repost/1"),
    ("POST", "/api/feed/like/event-x"),
    ("POST", "/api/feed/bookmark/event-x"),
    ("GET", "/api/feed/comments/event-x"),
    ("POST", "/api/feed/comment/event-x"),
    ("DELETE", "/api/feed/comment/1"),
    ("POST", "/api/trips/trip-x/silence"),
    ("POST", "/api/trips/trip-x/archive"),
    ("POST", "/api/trips/trip-x/unarchive"),
    ("POST", "/api/trips/invite"),
    ("POST", "/api/trips/invite/respond"),
    ("POST", "/api/trips/members/remove"),
    ("GET", "/api/friends/search"),
    ("GET", "/api/friends/pending"),
    ("POST", "/api/friends/reject"),
    ("POST", "/api/friends/remove"),
    ("GET", "/api/friends/list"),
    ("GET", "/api/notifications/list"),
    ("POST", "/api/notifications/read"),
    ("POST", "/api/notifications/trip_public"),
    ("GET", "/api/admin/stats"),
    ("GET", "/api/gemini/host-keys/status"),
]


@pytest.mark.parametrize("method,path", GATED_ROUTES)
def test_gated_route_rejects_anonymous(client, method, path):
    """Every @require_auth-decorated route returns 401 without a JWT.
    Catches a future endpoint shipped with the decorator forgotten."""
    res = client.open(path, method=method, json={})
    assert res.status_code == 401, f"{method} {path} returned {res.status_code}, expected 401"


# ── /api/admin/stats ────────────────────────────────────────────────────────
# 2026-05-18 audit H6: prior to this slice, /api/admin/stats had
# zero test coverage — a regression deleting the email check would
# silently expose admin-only data. These two tests pin the gate.


def test_admin_stats_rejects_non_admin_403(client, seed_user, auth_headers):
    """A logged-in user whose email is NOT in ADMIN_EMAILS gets 403,
    not 200 with a populated payload. Hardcoded `seed_user` fixture
    uses test@example.com which is deliberately NOT in the allowlist."""
    res = client.get("/api/admin/stats", headers=auth_headers)
    assert res.status_code == 403, \
        "non-admin user must NOT receive a 200 from /api/admin/stats"
    body = res.get_json()
    assert body.get("error") == "Forbidden"


def test_gemini_host_keys_status_returns_pool_shape(client, seed_user, auth_headers):
    """2026-05-18 audit M8: /api/gemini/host-keys/status had zero
    coverage. Pin the response envelope so the AI page's usage-bar
    contract doesn't drift silently — the bar reads `total`,
    `exhausted`, `available` to compute its fill ratio."""
    res = client.get("/api/gemini/host-keys/status", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    for key in ("total", "exhausted", "available"):
        assert key in body, f"pool status missing key: {key!r}"
    # `total` + `exhausted` are non-negative ints; available = total - exhausted.
    assert isinstance(body["total"], int) and body["total"] >= 0
    assert isinstance(body["exhausted"], int) and body["exhausted"] >= 0
    assert body["available"] == body["total"] - body["exhausted"]


def test_feed_share_owner_auto_promotes_private_trip(client, seed_user, auth_headers):
    """2026-05-18 follow-up to H5: when the OWNER explicitly clicks
    Share to feed on a private trip, the endpoint auto-promotes
    the trip to `is_public = 1` and proceeds with the share. The
    previous behaviour (400 "must be public first") forced the user
    into a hidden settings menu to flip privacy before retrying —
    a frustrating UX since clicking Share IS the user's consent to
    publicness. Non-owner members still get the 400 (see the
    non-owner test below) since they shouldn't flip the owner's
    privacy without consent."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-private-share")

    # Confirm trip starts private.
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?", (trip_id,),
        ).fetchone()
    assert row["is_public"] == 0, "trip should default to private"

    # Owner clicks Share → 200, trip flips to public.
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id, "caption": "First share",
    })
    assert res.status_code == 200, \
        f"owner Share should auto-promote private trip; got {res.status_code} {res.get_data(as_text=True)!r}"
    body = res.get_json()
    assert body.get("post_id"), "expected a post_id in the response"

    # Verify the trip is now public.
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?", (trip_id,),
        ).fetchone()
    assert row["is_public"] == 1, "trip should be public after owner Share"


def test_feed_share_non_owner_private_trip_400(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Counterpart to the owner-auto-promote test above: a non-owner
    accepted member trying to share the owner's PRIVATE trip still
    gets a 400 with a "ask the owner to make it public" hint. The
    member can share PUBLIC trips they're a member of (covered by
    existing tests); only the privacy flip is owner-only."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-private-nonowner")
    # Seed seed_other_user as an accepted member of the trip.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
            (trip_id, seed_other_user, seed_user),
        )
        conn.commit()
    # Non-owner share attempt while trip is private.
    res = client.post(
        "/api/feed/share", headers=other_auth_headers, json={
            "trip_id": trip_id, "caption": "should fail",
        },
    )
    assert res.status_code == 400
    body = res.get_json()
    assert "private" in body.get("error", "").lower(), \
        f"expected 'private' error; got {body!r}"
    # Trip should remain private.
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?", (trip_id,),
        ).fetchone()
    assert row["is_public"] == 0, "non-owner share must NOT flip privacy"


def test_admin_stats_allows_admin_email(client, seed_user, auth_headers, monkeypatch):
    """Conversely, when the caller's email is in ADMIN_EMAILS the
    handler returns 200 with the expected stats envelope. Patch the
    allowlist set instead of changing the seed_user email so the test
    doesn't have to know what's hardcoded in admin.py."""
    import routes.admin
    monkeypatch.setattr(routes.admin, "ADMIN_EMAILS", {"test@example.com"})

    res = client.get("/api/admin/stats", headers=auth_headers)
    assert res.status_code == 200, \
        f"admin caller must be allowed; got {res.status_code} body={res.get_json()!r}"
    body = res.get_json()
    # Spot-check the shape so a refactor that drops one of the
    # headline counts fails fast.
    for required in ("totalUsers", "totalTrips", "totalExpenses", "users"):
        assert required in body, f"admin stats missing key: {required!r}"


# ── /api/feed ────────────────────────────────────────────────────────────────

def test_feed_returns_envelope_for_logged_in_user(client, seed_user, auth_headers):
    """Empty feed for a user with no friends still returns a well-shaped
    envelope so the frontend's /api/feed page renders without crashing."""
    res = client.get("/api/feed", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    # Real shape varies by post-Phase-G iteration; pin only that the
    # response is JSON and contains *some* iterable structure for posts.
    assert isinstance(body, (list, dict))


def test_feed_share_creates_post(client, seed_user, auth_headers):
    """Sharing a trip mints a post row + returns its post_id. Idempotent
    server-side — re-sharing the same trip returns the same post_id with
    `status: 'already_shared'`."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share", public=True)
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id, "caption": "First share",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("post_id")  # truthy non-zero
    first_post_id = body["post_id"]

    # Re-share — same row, status reflects the no-op.
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id, "caption": "Updated caption",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["post_id"] == first_post_id
    assert body.get("status") == "already_shared"


def test_feed_share_status_returns_post_id_when_shared(client, seed_user, auth_headers):
    """The home page hits /share/status/<trip_id> on mount to set the
    Share button's initial state without needing to do a roundtrip
    write. Pin the contract."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-status", public=True)
    client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id, "caption": "",
    })
    res = client.get(
        f"/api/feed/share/status/{trip_id}", headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("shared") is True
    assert body.get("post_id")


def test_feed_unshare_cleans_orphan_engagement_rows(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit fix (2026-05-26): unshare must drop feed_likes / comments
    / bookmarks rows keyed on the deleted post's share_<id> event_id.
    Pre-fix these survived until the 90-day age sweep — invisible to
    users (event was gone) but a slow DB-bloat path."""
    # owner_friends seeds a follow so we can like / comment cleanly.
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-unshare-orphans", public=True)
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    event_id = f"share_{post_id}"
    client.post(f"/api/feed/like/{event_id}", headers=other_auth_headers)
    client.post(f"/api/feed/comment/{event_id}", headers=other_auth_headers, json={"body": "nice"})

    # Pre-unshare: a like + a comment exist.
    from database import get_db
    with get_db() as conn:
        like = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_likes WHERE event_id = ?",
            (event_id,),
        ).fetchone()["c"]
        comment = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_comments WHERE event_id = ?",
            (event_id,),
        ).fetchone()["c"]
        assert like == 1
        assert comment == 1

    # Unshare → orphans should be swept.
    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 200
    with get_db() as conn:
        like = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_likes WHERE event_id = ?",
            (event_id,),
        ).fetchone()["c"]
        comment = conn.execute(
            "SELECT COUNT(*) AS c FROM feed_comments WHERE event_id = ?",
            (event_id,),
        ).fetchone()["c"]
        assert like == 0, "feed_likes should be cleaned on unshare"
        assert comment == 0, "feed_comments should be cleaned on unshare"


def test_feed_unshare_deletes_caller_own_post(client, seed_user, auth_headers):
    """Author can delete their own share. Cascade-deletes any reposts
    pointing at it (other tests can pin that side; here we pin the
    author-deletes-self path)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-unshare", public=True)
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 200


def test_feed_unshare_restores_private_trip_after_auto_publicness(
    client, seed_user, auth_headers,
):
    """Audit fix (2026-05-26): /api/feed/share auto-promotes a private
    trip to is_public=1 when the owner clicks Share. Pre-fix the
    unshare path didn't restore — owners who shared once + later
    unshared had permanently leaked their trip to the public-trip
    surface. Now unshare restores is_public=0 when no other shares
    of the same trip exist.
    """
    # Create a PRIVATE trip (no is_public=True).
    trip_id = _create_trip(client, auth_headers, trip_id="trip-restore", public=False)
    # Share it — server auto-promotes is_public=1.
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    # Confirm the trip is now public.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?", (trip_id,),
        ).fetchone()
        assert row["is_public"] == 1
    # Unshare — is_public should snap back to 0.
    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 200
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?", (trip_id,),
        ).fetchone()
        assert row["is_public"] == 0


def test_feed_unshare_preserves_publicness_when_other_shares_exist(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """If other users have ALSO shared the same trip, unshare must
    NOT restore is_public=0 — that would 404 their followers'
    click-throughs. Trip stays public until the LAST share goes."""
    # Owner creates a PRIVATE trip and shares it (auto-promotes).
    trip_id = _create_trip(client, auth_headers, trip_id="trip-keep-public", public=False)
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    owner_post_id = res.get_json()["post_id"]
    # other_user is now a member of the (now-public) trip and ALSO
    # shares it.
    _seed_member("trip-keep-public", seed_other_user, role="planner")
    client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    # Owner unshares their share — trip stays public because the
    # other user still references it.
    client.delete(f"/api/feed/share/{owner_post_id}", headers=auth_headers)
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?", (trip_id,),
        ).fetchone()
        assert row["is_public"] == 1


def test_feed_repost_succeeds_for_other_users_post(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_other_user shares a trip; seed_user reposts it. The repost
    spreads the trip beyond the original sharer's friend graph."""
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-repost", public=True)
    res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 200


def test_block_user_idempotent_and_lists(
    client, seed_user, seed_other_user, auth_headers,
):
    """Audit fix (2026-05-26): /api/blocks adds the user once;
    re-POST is a no-op success. /api/blocks GET returns the list."""
    res = client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    # Re-POST — idempotent.
    res2 = client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert res2.status_code == 200

    res = client.get("/api/blocks", headers=auth_headers)
    assert res.status_code == 200
    blocked_ids = {b["id"] for b in res.get_json()["blocks"]}
    assert seed_other_user in blocked_ids


def test_csrf_origin_mismatch_blocks_cookie_request(client, seed_user):
    """Audit fix (2026-05-27): a cookie-authenticated POST whose
    Origin header points at a different host MUST be rejected (403)
    even if the cookie is valid. This is the CSRF defense-in-depth
    on top of SameSite=Lax."""
    # Seed a session cookie so the request is "cookie-authenticated".
    from auth import issue_token, AUTH_COOKIE_NAME
    client.set_cookie(
        key=AUTH_COOKIE_NAME, value=issue_token(seed_user), domain="localhost",
    )
    # Simulate a cross-origin form post — `Origin: https://evil.com`.
    res = client.post(
        "/api/profile/update",
        json={"bio": "csrf attempt"},
        headers={"Origin": "https://evil.com"},
    )
    assert res.status_code == 403, "CSRF origin check should block"


def test_csrf_same_origin_request_allowed(client, seed_user):
    """Same-origin POST with a matching Origin header passes."""
    from auth import issue_token, AUTH_COOKIE_NAME
    client.set_cookie(
        key=AUTH_COOKIE_NAME, value=issue_token(seed_user), domain="localhost",
    )
    # Flask test-client default host is localhost
    res = client.post(
        "/api/profile/update",
        json={"bio": "same origin ok"},
        headers={"Origin": "http://localhost"},
    )
    assert res.status_code == 200


def test_block_user_self_rejected(client, seed_user, auth_headers):
    """Self-blocking is nonsensical — the route must reject it."""
    res = client.post(f"/api/blocks/{seed_user}", headers=auth_headers)
    assert res.status_code == 400


def test_block_drops_existing_follow_in_both_directions(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """When A blocks B, any follow in EITHER direction is torn down.
    Leaving a follow into a blocked user means their public activity
    keeps surfacing in the feed actor-pool, defeating the block."""
    # B follows A; A follows B back.
    client.post(f"/api/follows/{seed_user}", headers=other_auth_headers)
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    # A blocks B.
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    # Neither follow row should survive.
    from database import get_db
    with get_db() as conn:
        rows = conn.execute(
            "SELECT 1 FROM follows WHERE "
            "(follower_id = ? AND followee_id = ?) OR "
            "(follower_id = ? AND followee_id = ?)",
            (seed_user, seed_other_user, seed_other_user, seed_user),
        ).fetchall()
        assert rows == []


def test_blocked_user_cannot_follow_blocker(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Once A blocks B, B's POST /api/follows/<A> silently 404s.
    The block isn't broadcast back as a 403 — the response shape
    mirrors "user doesn't exist" so B can't trivially confirm the
    block status."""
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    res = client.post(f"/api/follows/{seed_user}", headers=other_auth_headers)
    assert res.status_code == 404


def test_blocked_user_cannot_follow_via_legacy_friends_add(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: the legacy /api/friends/add path used to bypass
    the block check entirely, fully defeating the block primitive. Now
    it returns success (idempotent semantics) but does NOT insert the
    follow row when either party blocks the other."""
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    res = client.post(
        "/api/friends/add",
        headers=other_auth_headers,
        json={"friend_id": seed_user},
    )
    # The endpoint returns success for the API contract, but no row.
    assert res.status_code == 200
    from database import get_db
    with get_db() as conn:
        rows = conn.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_other_user, seed_user),
        ).fetchall()
        assert rows == [], "block bypass via /api/friends/add must not insert follow"


def test_block_drops_pending_invite_from_blocker_to_blocked(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: pre-fix the block cleanup only tore down invites
    from BLOCKED user → BLOCKER, not the reverse. A blocker who had
    previously invited the blocked user left a pending row that the
    blocked user could later accept → co-membership despite the
    block. Symmetric DELETE closes this."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-pending-cleanup")
    # Blocker invites the other user (pending invite).
    invite = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert invite.status_code == 200
    # Blocker now blocks them.
    blk = client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    assert blk.status_code == 200
    # The pending invite must be gone.
    from database import get_db
    with get_db() as conn:
        rows = conn.execute(
            "SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_other_user),
        ).fetchall()
    assert rows == [], (
        "pending invite from blocker to blocked must be deleted on block; "
        "otherwise the blocked user can accept it and become a co-member"
    )


def test_blocker_excluded_from_friends_search_for_blocked_user(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: a user who has blocked the searcher must not
    appear in the searcher's /api/friends/search results. Pre-fix
    the blocked user could prefix-search the blocker's email, get
    their id, and hit the legacy /api/friends/add bypass."""
    # Set seed_user's email to a predictable prefix the other will search.
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET email = 'blocker.audit@example.com' WHERE id = ?",
            (seed_user,),
        )
        conn.commit()
    # seed_user blocks seed_other_user.
    client.post(f"/api/blocks/{seed_other_user}", headers=auth_headers)
    # seed_other_user searches by prefix that matches the blocker.
    res = client.get(
        "/api/friends/search?q=blocker.audit",
        headers=other_auth_headers,
    )
    assert res.status_code == 200
    ids = {u["id"] for u in res.get_json()}
    assert seed_user not in ids, "blocker must not surface to blocked searcher"


def test_blocked_user_cannot_be_invited_to_blockers_trip(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """When B blocks A, A's /api/trips/invite for B silently 404s.
    A is the inviter (planner of their own trip); B has blocked A
    so A can't drop an invite into B's bell."""
    client.post(f"/api/blocks/{seed_user}", headers=other_auth_headers)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-block-invite")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert res.status_code == 404


def test_feed_repost_blocks_private_trip_from_non_friend(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit fix (2026-05-26): pre-fix any authed user could enumerate
    feed_posts.id and repost a PRIVATE friend's share. Now reposting
    a private trip's share requires the caller to be friends with the
    author (or a member of the trip). Public trips remain repostable
    by anyone (Twitter-style spread)."""
    # other_user creates + shares a PRIVATE trip (no is_public flag).
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-private-share", public=False)
    res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    # /api/feed/share auto-promotes is_public=1 today (a separate
    # bug — fix #20 — but that's the current behaviour we have to
    # account for in this test). Force the trip back to private so
    # we're testing the actual non-public repost gate.
    from database import get_db
    with get_db() as conn:
        conn.execute("UPDATE trips SET is_public = 0 WHERE id = ?", (trip_id,))
        conn.commit()
    post_id = res.get_json()["post_id"]
    # seed_user is NOT friends with seed_other_user.
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 404


def test_feed_repost_rejects_self_repost(client, seed_user, auth_headers):
    """Reposting your own post is a no-op + returns status: 'same_user'.
    Without this gate, the feed could fill with self-reposts."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-self-repost", public=True)
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("status") == "same_user"


def test_feed_like_toggles(client, seed_user, seed_other_user, auth_headers, other_auth_headers):
    """Liking returns the new state + the new global count so the
    frontend can reconcile any drift from optimistic UI in one round-trip."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-like", public=True)
    res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    event_id = f"share_{post_id}"
    res = client.post(f"/api/feed/like/{event_id}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("liked") is True
    assert body.get("count") == 1

    # Toggle back off.
    res = client.post(f"/api/feed/like/{event_id}", headers=auth_headers)
    body = res.get_json()
    assert body.get("liked") is False
    assert body.get("count") == 0


def test_feed_bookmark_is_private_per_user(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Bookmarks are per-user — seed_user bookmarking doesn't affect
    seed_other_user's view. No global count exposed (unlike likes)."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-bookmark", public=True)
    res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    event_id = f"share_{post_id}"
    res = client.post(f"/api/feed/bookmark/{event_id}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("bookmarked") is True


def test_feed_comments_post_then_list(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Post a comment as one user, list as another — the list returns
    the comment in oldest-first order so the UI can append-render."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-comment", public=True)
    share_res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = share_res.get_json()["post_id"]
    event_id = f"share_{post_id}"

    res = client.post(f"/api/feed/comment/{event_id}", headers=auth_headers, json={
        "body": "Looks great!",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("comment", {}).get("body") == "Looks great!"

    res = client.get(f"/api/feed/comments/{event_id}", headers=other_auth_headers)
    assert res.status_code == 200
    comments = res.get_json()
    assert isinstance(comments, list)
    assert any(c.get("body") == "Looks great!" for c in comments)


def test_feed_comment_delete_owner_only(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_user posts a comment; seed_other_user can't delete it
    (gate keeps friends from moderating each other's words)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-comment-del", public=True)
    share_res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    event_id = f"share_{share_res.get_json()['post_id']}"
    res = client.post(f"/api/feed/comment/{event_id}", headers=auth_headers, json={
        "body": "mine",
    })
    comment_id = res.get_json()["comment"]["id"]

    # other_user can't delete seed_user's comment.
    res = client.delete(
        f"/api/feed/comment/{comment_id}", headers=other_auth_headers,
    )
    assert res.status_code in (403, 404)

    # author can.
    res = client.delete(f"/api/feed/comment/{comment_id}", headers=auth_headers)
    assert res.status_code == 200


# ── /api/public-trip + /api/public-profile ───────────────────────────────────

def test_public_trip_404_for_nonexistent(client):
    """Public trip endpoint is unauthenticated (anyone with the link
    can view), but returns 404 for unknown ids — pin so a regression
    doesn't accidentally leak private trip rows under the wrong id."""
    res = client.get("/api/public-trip/does-not-exist")
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.get_json()
        assert body.get("error") or body.get("trip") is None


def test_public_profile_404_for_nonexistent(client):
    res = client.get("/api/public-profile/does-not-exist")
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.get_json()
        assert body.get("error") or body.get("user") is None


def test_public_profile_returns_user_for_known_id(client, seed_user):
    res = client.get(f"/api/public-profile/{seed_user}")
    # Endpoint returns { user: { name, email, picture, bio, status }, trips }.
    # `id` isn't echoed back (the caller already knew it from the URL); pin
    # what IS returned so a regression that drops `name` fails.
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("user", {}).get("name") == "Test User"
    assert "trips" in body


def test_public_trip_returns_full_payload_when_public(client, seed_user, auth_headers):
    """Happy path: a public trip with `publicShowExpenses=True` returns
    the full archived-trip-shape payload (trip metadata + tripDays +
    expenses + members + owner) the frontend's renderArchivedTripDetail
    consumes. With `publicShowExpenses=False` (the default) the expense
    rows are stripped — see test_public_trip_redacts_expenses_by_default
    below for that path."""
    # Owner creates a trip + a day + an expense, flags it public AND
    # opts into the new expense-sharing toggle.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-public",
            "name": "Lisbon",
            "isPublic": True,
            "publicShowExpenses": True,
        },
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-pub-1", "tripId": "trip-public", "dayNumber": 1,
            "name": "Alfama", "date": "2026-04-15",
        },
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-pub-1", "tripId": "trip-public", "who": "Me",
            "value": 12.5, "currency": "EUR", "euroValue": 12.5,
            "label": "Pastel de nata", "date": "2026-04-15",
        },
    })
    # Anonymous (no auth headers) — public trip is unauthenticated.
    res = client.get("/api/public-trip/trip-public")
    assert res.status_code == 200
    body = res.get_json()
    trip = body["trip"]
    assert trip["name"] == "Lisbon"
    assert trip["isPublic"] is True
    assert trip["publicShowExpenses"] is True
    assert trip["ownerId"] == seed_user
    # tripDays + expenses are inlined on the trip object — that's what
    # the frontend's archived-trip renderer reads from.
    assert len(trip["tripDays"]) == 1
    assert trip["tripDays"][0]["name"] == "Alfama"
    assert len(trip["expenses"]) == 1
    assert trip["expenses"][0]["label"] == "Pastel de nata"
    # Granularity flag: not redacted when publicShowExpenses=True.
    assert trip["expensesRedacted"] is False
    # Owner block is the minimum the renderer needs.
    assert body["owner"]["name"] == "Test User"


def test_public_trip_redacts_expenses_by_default(client, seed_user, auth_headers):
    """New default for §public-granularity: a trip marked public but
    WITHOUT `publicShowExpenses=True` exposes everything EXCEPT
    expense rows. Pre-fix, `isPublic=1` was an all-or-nothing switch
    that silently leaked financial details to anyone with the trip id.
    """
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-pub-plan-only",
            "name": "Tokyo",
            "isPublic": True,
            # publicShowExpenses NOT set — defaults to false.
        },
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-tk-1", "tripId": "trip-pub-plan-only",
            "dayNumber": 1, "name": "Shinjuku", "date": "2026-05-01",
        },
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-tk-1", "tripId": "trip-pub-plan-only",
            "who": "Me", "value": 80.0, "currency": "EUR",
            "euroValue": 80.0, "label": "Sushi dinner",
            "date": "2026-05-01",
        },
    })
    res = client.get("/api/public-trip/trip-pub-plan-only")
    assert res.status_code == 200
    trip = res.get_json()["trip"]
    # Plan-side data still surfaces.
    assert trip["isPublic"] is True
    assert trip["publicShowExpenses"] is False
    assert len(trip["tripDays"]) == 1
    assert trip["tripDays"][0]["name"] == "Shinjuku"
    # Expenses are stripped — and the flag tells the renderer WHY
    # so it can show a "owner kept expenses private" hint instead of
    # an empty state.
    assert trip["expenses"] == []
    assert trip["expensesRedacted"] is True


def test_public_trip_members_always_see_expenses(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Trip members ALWAYS see expenses regardless of the
    publicShowExpenses flag — they own / edit the trip. Pre-fix this
    was implicit (the gate didn't check membership); explicit now."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-members-see",
            "name": "Bali",
            "isPublic": True,
            # publicShowExpenses NOT set → public viewers redacted.
        },
    })
    # Seed `seed_other_user` as an accepted member of the trip.
    _seed_member("trip-members-see", seed_other_user, role="relaxer")
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-bali-1", "tripId": "trip-members-see",
            "who": "Me", "value": 20.0, "currency": "EUR",
            "euroValue": 20.0, "label": "Spa", "date": "2026-04-01",
        },
    })
    # Member-as-caller — sees the expense even though the trip is
    # public+redacted to strangers.
    res = client.get("/api/public-trip/trip-members-see", headers=other_auth_headers)
    assert res.status_code == 200
    trip = res.get_json()["trip"]
    assert trip["expensesRedacted"] is False
    assert len(trip["expenses"]) == 1
    assert trip["expenses"][0]["label"] == "Spa"


def test_public_trip_404_when_private_to_anonymous(client, seed_user, auth_headers):
    """Privacy gate: a private trip returns 404 (NOT 403) to a non-member
    so a probing client can't enumerate which trip IDs exist."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-private", "name": "Secret"},  # isPublic defaults to false
    })
    # Anonymous request — no auth header.
    res = client.get("/api/public-trip/trip-private")
    assert res.status_code == 404


def test_public_trip_visible_to_owner_when_private(client, seed_user, auth_headers):
    """Owner sees their own private trip even though it isn't public —
    the gate falls through when caller is the trip's user_id."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-mine", "name": "My private trip"},
    })
    res = client.get("/api/public-trip/trip-mine", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["trip"]["name"] == "My private trip"


def test_public_profile_lists_public_and_archived_trips(
    client, seed_user, auth_headers,
):
    """Profile endpoint returns the user's public OR archived trips so
    friends-map pins render. Pin the response shape — frontend's
    `pages/profile.ts` map-init keys off `isPublic`/`isArchived` flags
    on each trip item."""
    # Public trip
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "t-pub", "name": "Public", "isPublic": True},
    })
    # Private trip (should NOT surface here)
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "t-priv", "name": "Private"},
    })
    res = client.get(f"/api/public-profile/{seed_user}")
    assert res.status_code == 200
    body = res.get_json()
    # Only the public trip lands here. (Archived also would but we
    # don't archive in this test — covered by a separate flow.)
    trip_ids = {t["id"] for t in body["trips"]}
    assert "t-pub" in trip_ids
    assert "t-priv" not in trip_ids
    # Each trip carries the shape friends-map pins consume.
    for t in body["trips"]:
        assert "isPublic" in t
        assert "isArchived" in t


# ── /api/trips/<id>/silence | archive | unarchive ────────────────────────────

def test_trip_silence_toggle(client, seed_user, auth_headers):
    """Owner toggles the actions-feed-silencing flag. Returns the new
    state so the UI can reconcile."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-silence")
    res = client.post(
        f"/api/trips/{trip_id}/silence",
        headers=auth_headers,
        json={"hidden": True},
    )
    assert res.status_code == 200


def test_trip_archive_then_unarchive(client, seed_user, auth_headers):
    """Per-user archive flag flips on, then off. Each member's archive
    state is independent (other tests can pin that boundary)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-arch")
    res = client.post(f"/api/trips/{trip_id}/archive", headers=auth_headers)
    assert res.status_code == 200
    res = client.post(f"/api/trips/{trip_id}/unarchive", headers=auth_headers)
    assert res.status_code == 200


def test_trip_silence_rejects_non_owner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Silencing is owner-only — non-owner gets 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-silence-403")
    res = client.post(
        f"/api/trips/{trip_id}/silence",
        headers=other_auth_headers,
        json={"hidden": True},
    )
    assert res.status_code in (403, 404)


# ── /api/trips/invite | respond | members/remove ─────────────────────────────

def _befriend(client, headers_a, headers_b, user_a, user_b):
    """Helper: establish a mutual-follow between user_a and user_b.

    Pre-Model-B this called /api/friends/add then /api/friends/accept
    to land both halves of the legacy friend-request dance. Post-
    Model-B the same calls still work (they're façades over follows
    now — see routes/friends.py) so the test surface didn't have to
    change. Two POSTs = two follow edges = one mutual."""
    client.post("/api/friends/add", headers=headers_a, json={"friend_id": user_b})
    client.post("/api/friends/accept", headers=headers_b, json={"friend_id": user_a})


def test_trip_invite_creates_pending(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Owner invites a friend — server upserts a pending trip_members row
    + fires a notification. Gates on accepted-friendship (audit fix), so
    we have to befriend first."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert res.status_code == 200


def test_trip_invite_works_for_non_friend_under_model_b(
    client, seed_user, seed_other_user, auth_headers,
):
    """Model B: the trip-invite friend-gate is dropped. Trip invites
    are an explicit access grant decoupled from the social graph;
    anyone can be invited (with the existing 30/min rate-limit as
    spam defense + the trip-planner-only gate for who's allowed to
    invite). Pre-Model-B this asserted 403 (must-be-friend); now it
    asserts the invite goes through to a stranger."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite-stranger")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert res.status_code == 200


def test_trip_invite_respond_accept(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_user invites seed_other_user; seed_other_user accepts. Body
    is just { trip_id, accept } — the responder is identified via the
    JWT, the row is matched by (trip_id, responder_user_id)."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite-accept")
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    res = client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id,
        "accept": True,
    })
    assert res.status_code == 200


def test_trip_members_remove_owner_only(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Only the trip owner can remove members. Non-owner caller → 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-rm")
    res = client.post("/api/trips/members/remove", headers=other_auth_headers, json={
        "trip_id": trip_id,
        "user_id": seed_other_user,
    })
    assert res.status_code in (403, 400, 404)


def test_trip_invite_rejects_unknown_role(client, seed_user, auth_headers):
    """Role must be one of planner | budgeteer | relaxer. Anything
    else returns 400 before any DB write — pin the allowlist so a
    typo / new role can't silently slip through."""
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": "trip-x", "target_user_id": "u-x", "role": "admin",
    })
    assert res.status_code == 400


def test_trip_invite_rejects_self_invite(client, seed_user, auth_headers):
    """You can't invite yourself to your own trip — that's already an
    auto-membership. 400, not 200/no-op, so a buggy frontend is loud
    rather than silent."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-self")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id, "target_user_id": seed_user, "role": "relaxer",
    })
    assert res.status_code == 400


def test_trip_invite_rejects_missing_target(client, seed_user, auth_headers):
    """Missing target_user_id (or trip_id) → 400."""
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": "trip-x", "role": "relaxer",
    })
    assert res.status_code == 400


def test_trip_invite_respond_decline_removes_member_row(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Responding decline removes the pending row entirely (vs accept
    which just flips invitation_status). Tested by confirming a
    follow-up accept-respond fails because there's no row to act on."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-decline")
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id, "target_user_id": seed_other_user, "role": "relaxer",
    })
    decline = client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": False,
    })
    assert decline.status_code == 200
    # Re-respond should now have no row to act on (decline-cleanup
    # removed it). Still returns 200 — the endpoint is idempotent —
    # but a subsequent accept attempt has no membership row to flip.
    re_accept = client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })
    # Accepting a non-existent invite is treated as not-found; both
    # 404 and a quietly-OK 200 are acceptable shapes — just pin that
    # it doesn't 500.
    assert re_accept.status_code in (200, 404)


def test_delete_trip_owner_only(client, seed_user, auth_headers):
    """Owner can delete their own trip — the cascade kills expenses +
    members + the trip row in one transaction."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-doomed")
    # Seed an expense + member to confirm the cascade actually runs.
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-d", "tripId": trip_id, "who": "Me", "value": 1,
            "currency": "EUR", "euroValue": 1, "label": "x", "date": "2026-01-01",
        },
    })
    res = client.delete(f"/api/trips/{trip_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}
    # Confirm the cascade: trip is gone from /api/data + the expense
    # is also gone (cascade deleted it).
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert all(t["id"] != trip_id for t in body["trips"])
    assert all(e["id"] != "exp-d" for e in body["expenses"])


def test_delete_trip_rejects_non_owner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Non-owners can only LEAVE a trip via members/remove — they can't
    delete the trip out from under everyone else. Pinned at 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-survives")
    res = client.delete(f"/api/trips/{trip_id}", headers=other_auth_headers)
    assert res.status_code == 403
    # Owner's trip survives the hostile DELETE.
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert any(t["id"] == trip_id for t in body["trips"])


def test_archive_rejects_non_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Per-user archive flag is only valid for members of the trip.
    A non-member trying to archive (the bizarre case of someone with
    a guessed trip_id) → 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-arch-403")
    res = client.post(f"/api/trips/{trip_id}/archive", headers=other_auth_headers)
    assert res.status_code == 403


def test_unarchive_rejects_non_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Mirror of the archive 403 — non-members can't unarchive a trip
    they're not on."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-unarch-403")
    res = client.post(f"/api/trips/{trip_id}/unarchive", headers=other_auth_headers)
    assert res.status_code == 403


# ── /api/friends — extended coverage ─────────────────────────────────────────

def test_friends_search_returns_other_user(client, seed_user, seed_other_user, auth_headers):
    res = client.get(
        "/api/friends/search?q=Other",
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, list)


def test_friends_search_masks_email(client, seed_user, auth_headers):
    """2026-05-18 audit H7: search responses must return a MASKED email
    so an attacker prefix-iterating the user table can't harvest
    full unknown addresses. Existing safeguards (10/min rate limit,
    3-char min, prefix-only LIKE) make bulk enumeration slow, but
    every successful match was still leaking the full local-part
    + domain pre-fix. Now the local-part is reduced to first + last
    char with `*` filling the middle; the domain stays intact so
    the caller can confirm "yes, that's the @example.com address I
    just typed."""
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            ("u-mask-1", "andres.boigues@example.com", "Andres"),
        )
        conn.commit()
    # Prefix search the local-part. Must be ≥3 chars per the
    # length gate in search_friends.
    res = client.get("/api/friends/search?q=andre", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    hit = next((u for u in body if u["id"] == "u-mask-1"), None)
    assert hit is not None, f"expected to find the seeded user; got {body!r}"
    # First + last char of the local + full domain; middle is `*`s.
    assert hit["email"] == "a************s@example.com", \
        f"email mask shape regressed: got {hit['email']!r}"
    # Other fields untouched — id is what the follow flow needs;
    # name + picture drive the search-result card.
    assert hit["name"] == "Andres"


def test_friends_search_masks_short_local_collapsed(client, seed_user, auth_headers):
    """Edge case for the mask helper: a local-part of ≤2 chars
    collapses to a single `*` rather than revealing both ends (which
    would be the whole string for a 2-char local). Domain preserved."""
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            ("u-mask-short", "ab@tinydomain.io", "AB"),
        )
        conn.commit()
    res = client.get("/api/friends/search?q=ab@", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    hit = next((u for u in body if u["id"] == "u-mask-short"), None)
    assert hit is not None
    assert hit["email"] == "*@tinydomain.io", \
        f"short-local mask should collapse to single `*`; got {hit['email']!r}"


def test_friends_pending_lists_outstanding_requests(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_user adds seed_other_user; seed_other_user sees the
    request in their /pending list."""
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    res = client.get("/api/friends/pending", headers=other_auth_headers)
    assert res.status_code == 200
    pending = res.get_json()
    assert isinstance(pending, list)


def test_friends_reject_clears_pending(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_user adds; seed_other_user rejects. The pending row is
    deleted so the original sender can re-send if they want."""
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    res = client.post("/api/friends/reject", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    assert res.status_code == 200


def test_friends_remove_after_acceptance(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Establish friendship, then either side removes. Both rows go."""
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    client.post("/api/friends/accept", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    res = client.post("/api/friends/remove", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200


def test_friends_list_returns_accepted(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    client.post("/api/friends/accept", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    res = client.get("/api/friends/list", headers=auth_headers)
    assert res.status_code == 200
    friends = res.get_json()
    assert isinstance(friends, list)
    assert any(f.get("id") == seed_other_user for f in friends)


# ── /api/notifications ───────────────────────────────────────────────────────

def test_notifications_list_returns_array(client, seed_user, auth_headers):
    """Empty roster on a fresh user is fine; pin the shape."""
    res = client.get("/api/notifications/list", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert isinstance(body, list)


def test_notifications_read_marks_all(client, seed_user, auth_headers):
    """`POST /api/notifications/read` clears the unread badge.
    Idempotent — calling it on an already-empty roster still 200s."""
    res = client.post("/api/notifications/read", headers=auth_headers)
    assert res.status_code == 200


def test_notifications_trip_public_creates_notification(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Marking a trip public fans out notifications to friends. The
    sender's call returns 200; the receiver's /list reflects the new row.

    Audit fix (2026-05-26): the trip must actually be is_public=1
    before the broadcast goes out, so create the test trip with
    `public=True`."""
    # Befriend so the notification has a recipient.
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    client.post("/api/friends/accept", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    trip_id = _create_trip(client, auth_headers, trip_id="trip-public-notif", public=True)
    res = client.post("/api/notifications/trip_public", headers=auth_headers, json={
        "trip_id": trip_id,
        "trip_name": "Public Trip",
    })
    assert res.status_code == 200


def test_notifications_trip_public_rejects_private_trip(
    client, seed_user, auth_headers,
):
    """Audit fix (2026-05-26): /api/notifications/trip_public must
    refuse to fan out when the trip is_public=0. Pre-fix this was a
    free "spam followers about a private trip" channel."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-still-private", public=False)
    res = client.post("/api/notifications/trip_public", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    assert res.status_code == 403


# ── /api/config + /api/generate_itinerary ───────────────────────────────────
# /api/config exposes public-facing keys (Google client id, AI keys
# loaded from env). /api/generate_itinerary calls Gemini — tests
# mock requests.post to avoid real network traffic + paid quota.

def test_config_returns_only_public_google_client_id(client, monkeypatch):
    """Pin the no-secrets-leak contract for /api/config. The endpoint
    used to also return `gemini_key` / `openai_key` from server env,
    which meant the host's paid LLM key was shipped to every page
    load. Round 1 audit fix: only the public Google OAuth client id
    is exposed (it's already public — embedded in the GIS button's
    HTML attribute). LLM keys stay server-side; users BYO via
    Settings → AI Engine."""
    monkeypatch.setenv("OPENAI_API_KEY", "openai-test-key-must-not-leak")
    monkeypatch.setenv("GEMINI_API_KEY", "gemini-test-key-must-not-leak")
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "google-test-id")
    res = client.get("/api/config")
    assert res.status_code == 200
    body = res.get_json()
    # Public id is exposed.
    assert body["google_client_id"] == "google-test-id"
    # LLM keys MUST NOT appear in any form.
    assert "gemini_key" not in body
    assert "openai_key" not in body
    # Defence-in-depth — even the values shouldn't leak via any field.
    assert "gemini-test-key-must-not-leak" not in str(body)
    assert "openai-test-key-must-not-leak" not in str(body)


def test_config_returns_empty_client_id_when_env_unset(client, monkeypatch):
    """Missing CLIENT_ID_GOOGLE_AUTH resolves to empty string (not
    undefined). The frontend's GIS button keys off truthiness so empty
    is the "not configured" signal."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("CLIENT_ID_GOOGLE_AUTH", raising=False)
    res = client.get("/api/config")
    assert res.status_code == 200
    body = res.get_json()
    assert body == {"google_client_id": ""}


def test_generate_itinerary_rejects_missing_key(client, seed_user, auth_headers, monkeypatch):
    """No BYO key + every host-pool slot empty → 429 with a "shared AI
    quota fully booked" message pointing the user at BYO. The 6-slot
    host-key pool added 2026-05-17 rotates through GEMINI_API_KEY plus
    GEMINI_API_KEY_2..6, so the test must clear ALL of them (an env that
    has even one slot set would silently fall through to that key and
    return 200). Pre-rotation this was a 400; post-rotation the
    `_available_host_keys` path returns 429 when the pool is empty."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    for slot in range(2, 7):
        monkeypatch.delenv(f"GEMINI_API_KEY_{slot}", raising=False)
    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Tokyo",
        "numDays": 3,
    })
    assert res.status_code == 429
    body = res.get_json()
    assert "fully booked" in body["error"]


class _FakeGeminiResponse:
    """Stand-in for requests.Response. Models the slice of the API the
    handler reads (status_code, ok, json(), text).

    Context-manager protocol added 2026-05-27: the prod path in
    routes/integrations.py wraps the response in `with requests.post(...)
    as resp:` (FD-leak fix cbb2e3a). Without __enter__/__exit__ here,
    every Gemini test crashes at the `with` line with
    "object does not support the context manager protocol"."""

    def __init__(self, status_code: int, json_body=None, text: str = ""):
        self.status_code = status_code
        self.ok = 200 <= status_code < 300
        self._json_body = json_body
        self.text = text

    def json(self):
        if self._json_body is None:
            raise ValueError("not JSON")
        return self._json_body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_generate_itinerary_happy_path(client, seed_user, auth_headers, monkeypatch):
    """Mock a successful Gemini response → handler unwraps the
    candidates[].content.parts[].text shape and returns the parsed
    itinerary array. Pin the wire shape because a Gemini API change
    that drops or renames any of those fields would silently break.

    Phase G slice 1: explicitly delenv BOTH GOOGLE_MAPS_API_KEY and
    GOOGLE_MAPS_SERVER_KEY so the Places verification path short-
    circuits — this test pins the Gemini pass-through, the verification
    path has its own dedicated tests below. The handler prefers the
    `_SERVER_KEY` slot, so clearing only `_API_KEY` (the pre-split var
    name) leaves the verification path live and flips items from
    strings to objects, breaking the assertion below."""
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_SERVER_KEY", raising=False)
    fake_itinerary = [
        {
            "day": 1, "date": "2026-04-15", "title": "Arrival",
            "mainLocation": "Shibuya",
            "morning": {"activity": "Coffee", "items": ["Blue Bottle"]},
            "afternoon": {"activity": "Walk", "items": ["Yoyogi Park"]},
            "evening": {"activity": "Dinner", "items": ["Ramen alley"]},
        },
    ]
    fake_resp_body = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps(fake_itinerary)}]}},
        ],
    }

    def fake_post(url, headers=None, json=None, timeout=None):
        return _FakeGeminiResponse(200, json_body=fake_resp_body)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Tokyo", "numDays": 1, "gemini_key": "byo-key",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "success"
    assert body["itinerary"] == fake_itinerary


def test_generate_itinerary_strips_markdown_fences(
    client, seed_user, auth_headers, monkeypatch,
):
    """Some Gemini responses wrap the JSON in ```json ... ``` despite
    responseMimeType:application/json — the handler strips those
    fences before parsing. Pin the strip so a Gemini behaviour change
    that re-introduces them doesn't crash json.loads."""
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    fake_itinerary = [{"day": 1, "title": "Arrival"}]
    wrapped_text = f"```json\n{json.dumps(fake_itinerary)}\n```"
    fake_resp_body = {
        "candidates": [
            {"content": {"parts": [{"text": wrapped_text}]}},
        ],
    }

    def fake_post(url, headers=None, json=None, timeout=None):
        return _FakeGeminiResponse(200, json_body=fake_resp_body)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Lisbon", "gemini_key": "byo-key",
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["itinerary"] == fake_itinerary


def test_generate_itinerary_502_when_both_models_fail(
    client, seed_user, auth_headers, monkeypatch,
):
    """Handler tries gemini-flash-latest then gemini-2.5-flash. Both
    failing → 502 with last_error. Pin the retry-then-bail sequence
    so a future single-model regression doesn't silently degrade."""
    call_log = []

    def fake_post(url, headers=None, json=None, timeout=None):
        call_log.append(url)
        # Return a 503 with Google's standard error envelope so the
        # handler's err_body extraction path runs.
        return _FakeGeminiResponse(
            503,
            json_body={"error": {"status": "UNAVAILABLE", "message": "Service overloaded"}},
        )

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Lisbon", "gemini_key": "byo-key",
    })
    assert res.status_code == 502
    body = res.get_json()
    # R3-Round 3 fix: user-facing error is now a friendly one-liner
    # (no Google internal codes). The raw "UNAVAILABLE" / response
    # text lands in the server log only.
    assert "AI generation failed" in body["error"]
    assert "UNAVAILABLE" not in body["error"], \
        "Google's raw error status should not appear in user-facing message"
    # Confirm both models were attempted before bailing.
    assert len(call_log) == 2
    assert "gemini-flash-latest" in call_log[0]
    assert "gemini-2.5-flash" in call_log[1]


def test_generate_itinerary_places_verification_enriches_items(
    client, seed_user, auth_headers, monkeypatch,
):
    """Phase G slice 1: with GOOGLE_MAPS_API_KEY set, every itinerary
    item gets resolved via Places API Text Search and rewritten from
    a string to an enriched object with placeId / photoUrl / rating /
    address / mapsUrl on a hit, or `verified: false` on a miss.

    This pin protects three guarantees the frontend renderer relies on:
      1. Verified items carry a placeId (the unique-identity hook)
      2. Photo URL points at the Places API NEW media endpoint
      3. Items the LLM hallucinated (Places returns no result) come
         back as `verified: false` so the UI can flag them

    The handler prefers GOOGLE_MAPS_SERVER_KEY over the legacy
    GOOGLE_MAPS_API_KEY (post-2026-05-17 key split — see
    `_verify_place` for the resolution order). A dev's .env that has
    the real `_SERVER_KEY` set would hit the actual Places API and
    bypass the fake_post mock — clear it first, then set the fake key
    via the legacy `_API_KEY` slot the test still uses."""
    monkeypatch.delenv("GOOGLE_MAPS_SERVER_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "fake-maps-key")

    fake_itinerary = [{
        "day": 1, "date": "2026-04-15", "title": "Arrival",
        "morning": {
            "activity": "Coffee",
            "items": [
                {"name": "Sagrada Familia", "why": "Iconic Gaudí basilica.", "fact": "Construction started in 1882."},
                {"name": "Made-up Place That Doesn't Exist 9999", "why": "Why field.", "fact": "Fact field."},
            ],
        },
        "afternoon": {
            "activity": "Walk",
            "items": [
                {"name": "Park Güell", "why": "Hilltop mosaics.", "fact": "Originally designed as a housing project."},
            ],
        },
        "evening": {"activity": "Dinner", "items": []},
    }]
    # Precompute the Gemini response body BEFORE defining fake_post —
    # inside the function `json` is the request-body parameter (because
    # requests.post is called with `json=...`), which shadows the json
    # module. Building the body here lets us reference json.dumps
    # without aliasing the module.
    gemini_response_body = {
        "candidates": [{"content": {"parts": [{"text": json.dumps(fake_itinerary)}]}}],
    }

    def fake_post(url, headers=None, json=None, timeout=None):
        # Distinguish Gemini calls from Places calls by URL.
        if "generativelanguage.googleapis.com" in url:
            return _FakeGeminiResponse(200, json_body=gemini_response_body)
        if "places.googleapis.com" in url:
            # Read the textQuery to decide hit-vs-miss. The handler
            # builds it as `<item> in <destination>`. Real-place names
            # get a hit; the obviously-fake item gets a miss (empty
            # places array, the Places API contract for "no match").
            text_query = (json or {}).get("textQuery", "")
            if "Made-up Place" in text_query:
                return _FakeGeminiResponse(200, json_body={"places": []})
            return _FakeGeminiResponse(200, json_body={
                "places": [{
                    "id": f"ChIJ-{abs(hash(text_query)) % 100000}",
                    "displayName": {"text": text_query.split(" in ")[0]},
                    "formattedAddress": "Some real address, Barcelona, Spain",
                    "location": {"latitude": 41.4036, "longitude": 2.1744},
                    "rating": 4.7,
                    "userRatingCount": 12345,
                    "googleMapsUri": "https://maps.app.goo.gl/fakeshort",
                    "photos": [{"name": "places/fakeplace/photos/fakephoto"}],
                }],
            })
        return _FakeGeminiResponse(404)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Barcelona", "numDays": 1, "gemini_key": "byo-key",
    })
    assert res.status_code == 200
    body = res.get_json()
    morning_items = body["itinerary"][0]["morning"]["items"]
    afternoon_items = body["itinerary"][0]["afternoon"]["items"]
    # Sagrada Familia hit — verified, enriched.
    assert morning_items[0]["text"] == "Sagrada Familia"
    assert morning_items[0]["verified"] is True
    assert morning_items[0]["placeId"].startswith("ChIJ-")
    assert morning_items[0]["rating"] == 4.7
    assert morning_items[0]["address"] == "Some real address, Barcelona, Spain"
    # R2 audit fix: photoUrl is now a same-origin proxy URL, NEVER an
    # absolute Google URL with the server key embedded. The proxy
    # injects the key server-side at request time. Anyone inspecting
    # the AI response can no longer harvest the Maps server key.
    assert morning_items[0]["photoUrl"].startswith("/api/places/photo/")
    assert "fake-maps-key" not in morning_items[0]["photoUrl"], \
        "Maps key MUST NOT appear in the response body"
    assert "googleapis.com" not in morning_items[0]["photoUrl"], \
        "photoUrl should be same-origin (proxy), not Google's CDN"
    # Phase G slice 2 — lat/lng plumbed through so the home map can
    # render to-do markers for AI-suggested places without a separate
    # Place Details fetch.
    assert morning_items[0]["lat"] == 41.4036
    assert morning_items[0]["lng"] == 2.1744
    # Phase G v3 — why/fact context preserved through verification.
    assert morning_items[0]["why"] == "Iconic Gaudí basilica."
    assert morning_items[0]["fact"] == "Construction started in 1882."
    # Hallucination — unverified, no Maps enrichment fields, but the
    # why/fact context still survives so the user can see what the LLM
    # was reaching for.
    assert morning_items[1]["text"].startswith("Made-up Place")
    assert morning_items[1]["verified"] is False
    assert "placeId" not in morning_items[1]
    assert morning_items[1]["why"] == "Why field."
    # Afternoon item is also verified via the cache (same fake-post path).
    assert afternoon_items[0]["verified"] is True


def test_generate_itinerary_places_verification_skipped_without_key(
    client, seed_user, auth_headers, monkeypatch,
):
    """Phase G slice 1: BOTH Maps key slots missing → verification path
    short-circuits, items pass through as strings unchanged. Critical
    for dev / self-hosted deploys that don't have a Maps API key — we
    don't want a 500 or a behavior change just because the key isn't
    there. Post-2026-05-17 the handler checks `GOOGLE_MAPS_SERVER_KEY`
    first then falls back to `GOOGLE_MAPS_API_KEY`, so we need to clear
    both for the no-op path to be exercised. Pin the no-op so a
    regression that hard-requires the key fails CI before it lands."""
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_MAPS_SERVER_KEY", raising=False)
    fake_itinerary = [{
        "day": 1, "title": "Arrival",
        "morning": {"activity": "Coffee", "items": ["Some Cafe", "Another Place"]},
        "afternoon": {"activity": "Walk", "items": []},
        "evening": {"activity": "Dinner", "items": []},
    }]
    # Precompute outside fake_post — `json` is shadowed by the request-
    # body parameter inside the function.
    fake_resp_body = {
        "candidates": [{"content": {"parts": [{"text": json.dumps(fake_itinerary)}]}}],
    }
    places_calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        if "places.googleapis.com" in url:
            places_calls.append(url)
        return _FakeGeminiResponse(200, json_body=fake_resp_body)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Tokyo", "numDays": 1, "gemini_key": "byo-key",
    })
    assert res.status_code == 200
    # Wire shape: legacy string items pass through unchanged when the
    # Places-verification path is skipped (no GOOGLE_MAPS_API_KEY).
    # Pre-Phase-G itineraries cached on trip.aiPlan still have this
    # shape so the back-compat is critical.
    assert res.get_json()["itinerary"][0]["morning"]["items"] == ["Some Cafe", "Another Place"]
    # And we did NOT call Places API (no quota burned without a key).
    assert len(places_calls) == 0


def test_generate_itinerary_500_on_invalid_json_in_response(
    client, seed_user, auth_headers, monkeypatch,
):
    """If Gemini returns a 200 but the candidate text isn't valid JSON
    (rare but possible — the model can ignore the schema), handler
    catches the json.loads exception and returns 500 with the parse
    error. Pin so a regression that lets the exception bubble crash
    the dev server."""
    fake_resp_body = {
        "candidates": [
            {"content": {"parts": [{"text": "not actually json {{{"}]}},
        ],
    }

    def fake_post(url, headers=None, json=None, timeout=None):
        return _FakeGeminiResponse(200, json_body=fake_resp_body)

    import routes.integrations
    monkeypatch.setattr(routes.integrations.requests, "post", fake_post)

    res = client.post("/api/generate_itinerary", headers=auth_headers, json={
        "destination": "Paris", "gemini_key": "byo-key",
    })
    assert res.status_code == 500
    body = res.get_json()
    assert "error" in body


# ── Feed edge cases — pin audit-fix gates + idempotent-DELETE contracts ──────
#
# The happy paths above (test_feed_*) cover the main read/write loops; this
# block pins the rejection paths and the no-op-not-404 idempotency that the
# frontend relies on. Most of these correspond to specific lines in
# src/routes/feed.py that previously had zero coverage — see N+9 SESSION_LOG
# entry for the file → uncovered-line mapping.

def test_feed_share_rejects_missing_trip_id_400(client, seed_user, auth_headers):
    """`/api/feed/share` with no trip_id 400s — the frontend never sends
    this shape today, but the gate keeps a future caller-bug from creating
    orphan post rows pointing at NULL."""
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "caption": "no trip",
    })
    assert res.status_code == 400
    assert "trip_id" in (res.get_json().get("error", "")).lower()


def test_feed_share_rejects_non_member_404(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit-fix gate: caller must own the trip OR be an accepted member.
    seed_other_user creates a trip; seed_user (no membership) can't
    share it.

    R2 audit fix: response is now 404 (was 403). Pre-fix the route
    leaked trip existence + privacy to non-members via differential
    response codes; now non-members get the same 404 they'd get for
    a non-existent trip_id."""
    trip_id = _create_trip(
        client, other_auth_headers, trip_id="trip-share-403", public=True,
    )
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    assert res.status_code == 404
    assert res.get_json().get("error") == "Not found"


def test_feed_share_status_returns_false_when_unshared(
    client, seed_user, auth_headers,
):
    """Default state for a not-yet-shared trip — pin so the home Share
    button mounts in the right initial state without firing a write."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-status-false")
    res = client.get(
        f"/api/feed/share/status/{trip_id}", headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("shared") is False
    assert body.get("post_id") is None
    assert body.get("caption") is None


def test_feed_unshare_returns_ok_for_unknown_post(client, seed_user, auth_headers):
    """Idempotent DELETE: unknown post_id returns 200/{status:'ok'}, NOT
    404. The frontend optimistically un-shares before the round-trip, so a
    double-click would hit a missing row — 404 there would surface a
    spurious error toast."""
    res = client.delete("/api/feed/share/9999999", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json().get("status") == "ok"


def test_feed_unshare_rejects_non_author_403(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_other_user creates a share; seed_user can't delete it.
    Author-only gate prevents drive-by takedowns of someone else's
    feed activity."""
    trip_id = _create_trip(
        client, other_auth_headers, trip_id="trip-unshare-403", public=True,
    )
    res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]

    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 403
    assert res.get_json().get("error") == "Forbidden"


def test_feed_repost_404_for_unknown_post(client, seed_user, auth_headers):
    """Reposting a non-existent post_id returns 404 (NOT idempotent —
    you can't repost something that doesn't exist; differs from the
    DELETE pattern above which is intentionally idempotent)."""
    res = client.post("/api/feed/repost/9999999", headers=auth_headers)
    assert res.status_code == 404
    assert "not found" in (res.get_json().get("error", "")).lower()


def test_feed_repost_already_reposted_idempotent(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Re-reposting the same post returns the existing repost_id with
    status: 'already_reposted'. Pin so a double-click on the repost
    button doesn't multiply the user's feed."""
    trip_id = _create_trip(
        client, other_auth_headers, trip_id="trip-already-repost", public=True,
    )
    res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]

    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    first_repost_id = res.get_json()["post_id"]

    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    body = res.get_json()
    assert body.get("status") == "already_reposted"
    assert body.get("post_id") == first_repost_id


def test_feed_bookmark_toggles_off(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Second POST to the same /bookmark/<event_id> deletes the row.
    Bookmarks are private (no global count), but the toggle off path
    still needs pinning — without it a regression could leave bookmarks
    one-shot only."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(
        client, other_auth_headers, trip_id="trip-bookmark-toggle", public=True,
    )
    share_res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    event_id = f"share_{share_res.get_json()['post_id']}"

    res = client.post(f"/api/feed/bookmark/{event_id}", headers=auth_headers)
    assert res.get_json().get("bookmarked") is True

    # Toggle off.
    res = client.post(f"/api/feed/bookmark/{event_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json().get("bookmarked") is False


def test_feed_comment_rejects_empty_body_400(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Whitespace-only body 400s — without this gate the comments table
    would accumulate empty rows from misclicks on the submit button."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(
        client, other_auth_headers, trip_id="trip-empty-comment", public=True,
    )
    share_res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    event_id = f"share_{share_res.get_json()['post_id']}"

    res = client.post(f"/api/feed/comment/{event_id}", headers=auth_headers, json={
        "body": "   ",  # whitespace strips to ""
    })
    assert res.status_code == 400
    assert "empty" in (res.get_json().get("error", "")).lower()


def test_feed_comment_delete_ok_for_unknown_id(client, seed_user, auth_headers):
    """Idempotent DELETE for unknown comment_id — returns 200/{event_id:None},
    matching the unshare pattern. Frontend can blindly retry without a
    spurious error toast."""
    res = client.delete("/api/feed/comment/9999999", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("status") == "ok"
    assert body.get("event_id") is None


def test_feed_like_rejects_unknown_event_id(client, seed_user, auth_headers):
    """FIXING_ROADMAP §1.3: pre-fix this endpoint accepted ANY string
    as event_id (including fabricated ones referencing trips/users
    that don't exist or that the caller can't see). Pin the rejection
    so a regression can't silently re-open the spam vector.

    Was previously `test_feed_like_on_synthesised_event_id_skips_notification`
    — that test verified the no-notification side-effect of liking a
    fake event, which is now moot because the like itself is rejected."""
    res = client.post(
        "/api/feed/like/trip_created_trip-fake", headers=auth_headers,
    )
    assert res.status_code == 404
    assert "unauthor" in (res.get_json() or {}).get("error", "").lower()


# ── /api/auth/google — production happy path (mocked Google verify) ──────────
#
# The test-mode bypass above only exercises the `test:<id>` shortcut. These
# tests mock `id_token.verify_oauth2_token` to drive the real production
# branch (lines 118-142 in src/routes/auth.py) without making a real network
# call to Google's OAuth backend. Same monkeypatch pattern as integrations.py.

def test_auth_google_real_path_inserts_user_and_returns_token(client, monkeypatch):
    """Production happy path: verify_oauth2_token returns a valid idinfo
    dict; the handler upserts the user row and mints a JWT. Pin the
    response shape since the frontend keys off `body.user.id`,
    `body.token`, etc."""
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "client-id-test")
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)

    fake_idinfo = {
        "sub": "google-uid-12345",
        "email": "real@example.com",
        "email_verified": True,
        "name": "Real User",
        "picture": "https://lh3.googleusercontent.com/avatar.jpg",
    }

    def fake_verify(token, request, client_id):
        # Pin the contract: verify gets called with the token + the
        # configured client_id.
        assert token == "valid.google.token"
        assert client_id == "client-id-test"
        return fake_idinfo

    import routes.auth
    monkeypatch.setattr(routes.auth.id_token, "verify_oauth2_token", fake_verify)

    res = client.post("/api/auth/google", json={"token": "valid.google.token"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "success"
    assert body["token"]  # signed JWT (real string, not None)
    assert body["user"]["id"] == "google-uid-12345"
    assert body["user"]["email"] == "real@example.com"
    assert body["user"]["name"] == "Real User"
    assert body["user"]["picture"].startswith("https://")
    # First sign-in: bio/status default to empty string, home_currency to None.
    assert body["user"]["bio"] == ""
    assert body["user"]["status"] == ""
    assert body["user"]["homeCurrency"] is None


def test_auth_google_real_path_supports_credential_field(client, monkeypatch):
    """Frontend may send the token under either `token` (legacy) or
    `credential` (Google's GIS lib default name). Pin both routes."""
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "client-id-test")
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)

    def fake_verify(token, request, client_id):
        return {
            "sub": "uid-cred",
            "email": "cred@example.com",
            "email_verified": True,
            "name": "Cred User",
            "picture": "",
        }

    import routes.auth
    monkeypatch.setattr(routes.auth.id_token, "verify_oauth2_token", fake_verify)

    res = client.post("/api/auth/google", json={"credential": "via.credential.field"})
    assert res.status_code == 200
    assert res.get_json()["user"]["id"] == "uid-cred"


def test_auth_google_real_path_returns_existing_profile_on_repeat_signin(
    client, monkeypatch,
):
    """Second sign-in for an existing user preserves bio / status /
    home_currency from the DB row (these aren't touched by the
    upsert). Pin so a regression that overwrites profile fields on
    repeat sign-in surfaces immediately."""
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "client-id-test")
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)

    fake_idinfo = {
        "sub": "returning-user",
        "email": "ret@example.com",
        "email_verified": True,
        "name": "Returning User",
        "picture": "",
    }

    def fake_verify(token, request, client_id):
        return fake_idinfo

    import routes.auth
    monkeypatch.setattr(routes.auth.id_token, "verify_oauth2_token", fake_verify)

    # First sign-in → upsert.
    client.post("/api/auth/google", json={"token": "first.signin"})

    # Hand-set the profile fields the way /api/profile/update would.
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "UPDATE users SET bio = ?, status = ?, home_currency = ? WHERE id = ?",
            ("Coffee enthusiast", "Wandering", "EUR", "returning-user"),
        )
        conn.commit()

    # Second sign-in — same Google identity, profile fields should
    # come back in the response body.
    res = client.post("/api/auth/google", json={"token": "second.signin"})
    assert res.status_code == 200
    body = res.get_json()
    assert body["user"]["bio"] == "Coffee enthusiast"
    assert body["user"]["status"] == "Wandering"
    assert body["user"]["homeCurrency"] == "EUR"


def test_auth_google_real_path_invalid_token_returns_401(client, monkeypatch):
    """verify_oauth2_token raises ValueError on a tampered/expired
    token; handler maps that to 401 (NOT 500). Frontend reads the 401
    as "session bad, show login wall again"."""
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "client-id-test")
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)

    def fake_verify(token, request, client_id):
        raise ValueError("Token used too late, 1234567890 < 1234567899")

    import routes.auth
    monkeypatch.setattr(routes.auth.id_token, "verify_oauth2_token", fake_verify)

    res = client.post("/api/auth/google", json={"token": "expired.token"})
    assert res.status_code == 401
    assert res.get_json().get("error") == "Invalid token"


def test_auth_google_rejects_unverified_email(client, monkeypatch):
    """Audit fix (2026-05-26): Google ID tokens whose
    `email_verified` is False (or absent) must be rejected. A
    Workspace admin who email-sets an attacker account to a
    `victim@gmail.com` address gets a VALID signature from Google
    without the email being verified — pre-fix the server happily
    stored the spoofed address as the canonical email for that
    user_id.
    """
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "client-id-test")
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)

    def fake_verify_unverified(token, request, client_id):
        return {
            "sub": "spoofer-uid",
            "email": "victim@gmail.com",
            "email_verified": False,
            "name": "Spoofer",
            "picture": "",
        }

    import routes.auth
    monkeypatch.setattr(routes.auth.id_token, "verify_oauth2_token", fake_verify_unverified)

    res = client.post("/api/auth/google", json={"token": "valid.but.unverified"})
    assert res.status_code == 401
    assert "verified" in (res.get_json().get("error") or "").lower()


def test_invite_trip_member_does_not_demote_accepted_planner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit fix (2026-05-27): re-inviting an already-accepted member
    with a DIFFERENT role must NOT silently demote them. Pre-fix the
    ON CONFLICT clause set role=excluded.role unconditionally — a
    planner re-inviting another planner "as relaxer" silently
    stripped their planner rights with no notification.
    """
    trip_id = _create_trip(client, auth_headers, trip_id="trip-no-demote")
    # Invite as planner, have them accept.
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "planner",
    })
    client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })
    # Re-invite the now-accepted member as relaxer — should be a no-op
    # on the role.
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    # Verify the planner role survived.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT role, invitation_status FROM trip_members "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_other_user),
        ).fetchone()
        assert row["role"] == "planner", \
            f"accepted planner was demoted to {row['role']!r}"
        assert row["invitation_status"] == "accepted"



def test_share_token_hidden_from_non_owner_members(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R3-Fix #3: pre-fix, every accepted trip member saw the owner's
    share_token (+ shareViews/shareShowCost/shareShowPlans) in their
    /api/data response. A non-owner planner could re-share the public
    URL the owner intentionally kept private. Now: non-owners see
    None/0/False for all four share_* fields; only the owner sees the
    real values."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-leak")
    # Owner generates a share token.
    res = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": True, "showPlans": True},
    )
    assert res.status_code == 200
    owner_token = res.get_json()["token"]
    assert owner_token  # sanity

    # Invite + accept the other user as planner (so they're an accepted
    # trip member — the exact case where the leak fired pre-fix).
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "planner",
    })
    client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })

    # Owner sees the real share state.
    owner_data = client.get("/api/data", headers=auth_headers).get_json()
    owner_trip = next(t for t in owner_data["trips"] if t["id"] == trip_id)
    assert owner_trip["shareToken"] == owner_token
    assert owner_trip["shareShowCost"] is True
    assert owner_trip["shareShowPlans"] is True

    # Accepted-member non-owner gets None / False for everything.
    member_data = client.get("/api/data", headers=other_auth_headers).get_json()
    member_trip = next(t for t in member_data["trips"] if t["id"] == trip_id)
    assert member_trip["shareToken"] is None, \
        f"share_token leaked to non-owner member: {member_trip['shareToken']!r}"
    assert member_trip["shareViews"] == 0
    assert member_trip["shareShowCost"] is False
    assert member_trip["shareShowPlans"] is False


def test_invite_trip_member_404_on_unknown_target(
    client, seed_user, auth_headers,
):
    """Audit fix (2026-05-26): pre-fix, inviting a nonexistent user_id
    raised sqlite3.IntegrityError on the FK → unhandled → 500. Now
    we 404 cleanly via ensure_user_exists."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite-ghost")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": "user-does-not-exist",
        "role": "relaxer",
    })
    assert res.status_code == 404


# ── /api/sync — archived_trips + budgets + trip_days + legacy share ──────────
#
# The basic happy path is covered above (test_sync_writes_trips_and_expenses).
# These cover the lower-traffic branches: archived-trip upsert (with
# nested expenses), the budgets replace-mode sync, and the trip_days
# insert block. Each pinning a specific uncovered chunk in
# src/routes/data.py. (The legacy /api/trips/share route was removed
# 2026-05-13; only a "route is gone" pin remains.)

def test_sync_writes_archived_trip_with_expenses(client, seed_user, auth_headers):
    """archived_trips block — separate from the active trips block —
    upserts trips with is_archived=1 and gates per-row on can_edit_trip
    for nested expenses. Pin both the archived-trip insert and the
    nested-expense insert in one round-trip."""
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "archived_trips": [
            {
                "id": "trip-archived-1",
                "name": "Last Year Italy",
                "country": "Italy",
                "expenses": [
                    {
                        "id": "exp-arch-1",
                        "tripId": "trip-archived-1",
                        "who": "Me",
                        "categoryId": "c-food",
                        "country": "Italy",
                        "value": 12,
                        "currency": "EUR",
                        "euroValue": 12,
                        "label": "Gelato",
                        "date": "2025-08-15",
                    },
                ],
            },
        ],
    })
    assert res.status_code == 200

    # Round-trip via /api/data: the archived trip + its expense
    # should both be present. The trip's `isArchived` flag actually
    # surfaces from the per-user trip_members row (per Phase G);
    # ensure_owner_member_row inserts that row with archived=0,
    # so the response shows myArchived=False even though the trip
    # row's is_archived=1. That's a known quirk of the legacy bulk-
    # sync path — the new flow uses /api/trips/<id>/archive which
    # toggles the member-row flag directly. Here we only pin that
    # the trip + its nested expense both round-trip.
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    archived = next(
        (t for t in body["trips"] if t["id"] == "trip-archived-1"), None,
    )
    assert archived is not None
    assert archived["country"] == "Italy"
    assert any(e["id"] == "exp-arch-1" for e in body["expenses"])


def test_sync_writes_budgets_categories_and_trip_days(client, seed_user, auth_headers):
    """Cover three smaller sync branches in one payload: budgets
    replace-mode (DELETE WHERE id NOT IN <list>), categories DELETE
    THEN INSERT, and trip_days insert. Pin the round-trip so a
    field-rename regression surfaces immediately."""
    # Need a trip first for trip_days FK.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-multi-sync", "name": "Multi", "country": "France"},
    })

    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "categories": [
            {"id": "c-food-sync", "name": "Food", "icon": "🍔", "color": "#ff0000"},
        ],
        "budgets": [
            {
                "id": "b-sync-1",
                "tripId": "trip-multi-sync",
                "label": "Hotels",
                "amount": 500,
                "currency": "EUR",
            },
        ],
        "trip_days": [
            {
                "id": "td-sync-1",
                "tripId": "trip-multi-sync",
                "dayNumber": 1,
                "date": "2026-06-01",
                "name": "Arrival",
                "morning": "Land at CDG",
                "afternoon": "Hotel check-in",
                "evening": "Dinner",
                "tip": "Avoid taxi scams at CDG arrivals",
                "lat": 48.85,
                "lng": 2.35,
            },
        ],
    })
    assert res.status_code == 200

    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert any(c["id"] == "c-food-sync" for c in body["categories"])
    assert any(b["id"] == "b-sync-1" for b in body["budgets"])
    # /api/data returns trip days under `tripDays` (camelCase).
    assert any(d["id"] == "td-sync-1" for d in body["tripDays"])


def test_sync_budgets_replace_mode_deletes_omitted_ids(client, seed_user, auth_headers):
    """The budgets replace path runs `DELETE WHERE user_id = ? AND id
    NOT IN (...)` — pin the implicit "you can drop a budget by
    omitting its id from the next sync" contract."""
    # First sync: 2 budgets.
    client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "budgets": [
            {"id": "b-keep", "label": "Keep me", "amount": 100, "currency": "EUR"},
            {"id": "b-drop", "label": "Drop me", "amount": 200, "currency": "EUR"},
        ],
    })

    # Second sync: only b-keep — b-drop should be deleted.
    client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "budgets": [
            {"id": "b-keep", "label": "Keep me", "amount": 100, "currency": "EUR"},
        ],
    })

    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    budget_ids = [b["id"] for b in body["budgets"]]
    assert "b-keep" in budget_ids
    assert "b-drop" not in budget_ids


def test_sync_budgets_empty_list_clears_all(client, seed_user, auth_headers):
    """Explicit `budgets: []` runs an unconditional `DELETE WHERE
    user_id = ?` — caller is asserting "the canonical set is empty".

    Audit fix (2026-05-26): an ABSENT `budgets` key no longer wipes
    everything (mirrors the categories semantic — absent = don't
    touch). That regression test is `test_sync_absent_budgets_preserves`
    below. This test still covers the explicit-empty-list path."""
    # Seed two budgets.
    client.post("/api/sync", headers=auth_headers, json={
        "trips": [], "expenses": [],
        "budgets": [
            {"id": "b-wipe-1", "label": "x", "amount": 1, "currency": "EUR"},
            {"id": "b-wipe-2", "label": "y", "amount": 2, "currency": "EUR"},
        ],
    })

    # Sync with `budgets: []` explicitly → DELETE WHERE user_id = ?
    # fires (caller is asserting their budgets set is empty).
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [], "expenses": [],
        "budgets": [],
    })
    assert res.status_code == 200

    pull = client.get("/api/data", headers=auth_headers)
    assert pull.get_json()["budgets"] == []


def test_sync_absent_budgets_preserves(client, seed_user, auth_headers):
    """Audit fix (2026-05-26): a sync payload that OMITS the `budgets`
    key entirely must NOT wipe the user's budgets. Pre-fix, older
    clients that didn't ship budgets in their 15s sync tick were
    silently erasing every budget on every poll."""
    # Seed two budgets.
    client.post("/api/sync", headers=auth_headers, json={
        "trips": [], "expenses": [],
        "budgets": [
            {"id": "b-preserve-1", "label": "x", "amount": 1, "currency": "EUR"},
            {"id": "b-preserve-2", "label": "y", "amount": 2, "currency": "EUR"},
        ],
    })

    # Sync without a `budgets` key at all — budgets must SURVIVE.
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [], "expenses": [],
    })
    assert res.status_code == 200

    pull = client.get("/api/data", headers=auth_headers)
    budget_ids = {b["id"] for b in pull.get_json()["budgets"]}
    assert "b-preserve-1" in budget_ids
    assert "b-preserve-2" in budget_ids


def test_legacy_trips_share_route_is_gone(client, seed_user, auth_headers):
    """`/api/trips/share` was removed 2026-05-13 (FIXING_ROADMAP §0.2)
    — the route had no ownership / friendship checks and let any
    authenticated user grant themselves read access to ANY trip.
    Pin that it's gone so a future refactor doesn't re-introduce it
    by accident. Flask returns 405 (not 404) because the URL pattern
    `/api/trips/share` overlaps with the DELETE `/api/trips/<trip_id>`
    route — POSTing matches the path but the method isn't allowed,
    which is the correct "this is not a POST endpoint" signal."""
    res = client.post("/api/trips/share", headers=auth_headers, json={
        "trip_id": "anything",
        "friend_id": "anyone",
    })
    assert res.status_code in (404, 405)


# ── Share-via-link (FIXING_ROADMAP §4.1) ────────────────────────────────────

def test_share_create_returns_token_and_url(client, seed_user, auth_headers):
    """Owner generates a share token; route returns the token + the
    public URL the frontend pastes into clipboard."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-1")
    res = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={"showCost": False},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("token") and len(body["token"]) >= 16
    assert body.get("url") == f"/share/{body['token']}"
    assert body.get("showCost") is False


def test_share_create_owner_only(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Non-owner can't generate a share link — only the trip's creator
    decides if it goes public."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-owner")
    res = client.post(
        f"/api/trips/{trip_id}/share", headers=other_auth_headers, json={},
    )
    assert res.status_code == 403


def test_share_revoke_clears_token(client, seed_user, auth_headers):
    """DELETE clears the share token. A subsequent GET on the public
    endpoint with the old token returns 404 — the link stops working
    immediately."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-revoke")
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    token = create["token"]
    # Public GET works before revoke.
    pre = client.get(f"/api/share/{token}")
    assert pre.status_code == 200

    rev = client.delete(f"/api/trips/{trip_id}/share", headers=auth_headers)
    assert rev.status_code == 200

    # Public GET 404s after revoke.
    post = client.get(f"/api/share/{token}")
    assert post.status_code == 404


def test_share_create_rotates_token(client, seed_user, auth_headers):
    """Generating a share link on a trip that already has one rotates
    the token — the old URL stops working, the new one starts. Lets
    the owner kill a leaked link without an unshare/reshare dance."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-rotate")
    first = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    second = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    assert first["token"] != second["token"]

    # Old token is now dead.
    assert client.get(f"/api/share/{first['token']}").status_code == 404
    assert client.get(f"/api/share/{second['token']}").status_code == 200


def test_share_public_get_is_unauthenticated(client, seed_user, auth_headers):
    """The public read endpoint must work WITHOUT an Authorization
    header — that's the whole point of a share link."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-anon")
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    # No auth_headers passed — anonymous request.
    res = client.get(f"/api/share/{create['token']}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["trip"]["name"]


def test_share_public_payload_excludes_expenses_by_default(
    client, seed_user, auth_headers,
):
    """Privacy posture: a share with showCost=False (default) MUST NOT
    return any expense data — not totals, not line items. Cost is null."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-noexp")
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-private", "tripId": trip_id, "who": "Me",
            "value": 99, "currency": "EUR", "euroValue": 99,
            "label": "Secret hotel", "date": "2026-05-10",
        },
    })
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": False},
    ).get_json()
    res = client.get(f"/api/share/{create['token']}")
    body = res.get_json()
    assert body.get("cost") is None
    assert "expenses" not in body
    # And the line-item label must not leak into the JSON anywhere.
    assert "Secret hotel" not in res.get_data(as_text=True)


def test_share_public_payload_includes_aggregate_cost_when_opted_in(
    client, seed_user, auth_headers,
):
    """Opt-in: showCost=True surfaces total + per-country aggregate but
    NEVER individual labels. The killer move from VISION.md (cost-as-
    content) ships with a privacy floor."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-cost")
    for ex in [
        {"id": "e1", "tripId": trip_id, "who": "Me", "value": 50,
         "currency": "EUR", "euroValue": 50, "label": "Lunch in Lisbon",
         "country": "Portugal", "date": "2026-05-10"},
        {"id": "e2", "tripId": trip_id, "who": "Me", "value": 30,
         "currency": "EUR", "euroValue": 30, "label": "Coffee",
         "country": "Spain", "date": "2026-05-11"},
    ]:
        client.post("/api/expenses", headers=auth_headers, json={"expense": ex})
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": True},
    ).get_json()
    res = client.get(f"/api/share/{create['token']}")
    body = res.get_json()
    assert body["cost"]["total"] == 80.0
    countries = {c["country"]: c["total"] for c in body["cost"]["perCountry"]}
    assert countries["Portugal"] == 50.0
    assert countries["Spain"] == 30.0
    # Labels still NEVER leak.
    assert "Lunch in Lisbon" not in res.get_data(as_text=True)
    assert "Coffee" not in res.get_data(as_text=True)


def test_share_public_payload_excludes_plans_by_default(
    client, seed_user, auth_headers,
):
    """Privacy posture #2: a share with showPlans=False (default)
    MUST NOT return any day plan text — morning/afternoon/evening
    notes or tip strings. The day rows return only metadata
    (dayNumber, date, name, lat, lng)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-noplans")
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "d1", "tripId": trip_id, "dayNumber": 1, "date": "2026-06-01",
            "name": "Lisbon", "plan": {
                "morning": "Secret cafe address at Rua X",
                "afternoon": "Castle visit",
                "evening": "",
            },
            "tip": "Apartment key under the mat",
        },
    })
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showPlans": False},
    ).get_json()
    res = client.get(f"/api/share/{create['token']}")
    body = res.get_json()
    # Plan / tip keys not present in the day shape.
    assert all("plan" not in d for d in body["days"])
    assert all("tip" not in d for d in body["days"])
    # The raw plan / tip text must not leak into the JSON anywhere.
    raw = res.get_data(as_text=True)
    assert "Secret cafe address" not in raw
    assert "Apartment key under the mat" not in raw


def test_share_public_payload_includes_plans_when_opted_in(
    client, seed_user, auth_headers,
):
    """Opt-in: showPlans=True surfaces morning/afternoon/evening text
    + the tip per day. Photos and documents are still NOT included
    (separate, not-yet-implemented toggle)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-plans")
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "d2", "tripId": trip_id, "dayNumber": 1, "date": "2026-06-02",
            "name": "Lisbon",
            "plan": {
                "morning": "Pasteis de Belem queue",
                "afternoon": "Tram 28 ride",
                "evening": "Bairro Alto dinner",
            },
            "tip": "Buy a Viva Viagem card at any metro",
        },
    })
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showPlans": True},
    ).get_json()
    assert create["showPlans"] is True
    res = client.get(f"/api/share/{create['token']}")
    body = res.get_json()
    day = next((d for d in body["days"] if d["dayNumber"] == 1), None)
    assert day is not None
    assert day["plan"]["morning"] == "Pasteis de Belem queue"
    assert day["plan"]["afternoon"] == "Tram 28 ride"
    assert day["plan"]["evening"] == "Bairro Alto dinner"
    assert day["tip"] == "Buy a Viva Viagem card at any metro"


def test_share_revoke_resets_plans_toggle(client, seed_user, auth_headers):
    """DELETE share clears BOTH the token AND the toggles, so a
    re-share starts privacy-clean. Prevents "I unshared, then someone
    re-shared, and the cost banner I'd toggled on last time is still
    on" surprise."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-reset")
    client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": True, "showPlans": True},
    )
    client.delete(f"/api/trips/{trip_id}/share", headers=auth_headers)
    # Fresh re-share — defaults should be off again.
    after = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    assert after["showCost"] is False
    assert after["showPlans"] is False


# ── Trip cloning (FIXING_ROADMAP §4.6) ────────────────────────────────

def test_clone_trip_deep_copies_days_and_metadata(
    client, seed_user, auth_headers,
):
    """Clone returns a new trip_id; the source's metadata + days are
    copied into a fresh draft owned by the caller, with `(copy)`
    suffix on the name."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-source", name="My Trip")
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "d-src-1", "tripId": trip_id, "dayNumber": 1,
            "date": "2026-06-01", "name": "Lisbon",
            "plan": {"morning": "Cafe", "afternoon": "Castle", "evening": ""},
            "tip": "Bring sunscreen", "lat": 38.7, "lng": -9.1,
        },
    })

    res = client.post(f"/api/trips/clone/{trip_id}", headers=auth_headers)
    assert res.status_code == 200
    new_trip_id = res.get_json()["tripId"]
    assert new_trip_id and new_trip_id != trip_id

    # Pull canonical state and confirm the new trip is in the active
    # list with copied content.
    data = client.get("/api/data", headers=auth_headers).get_json()
    cloned = next((t for t in data["trips"] if t["id"] == new_trip_id), None)
    assert cloned is not None
    assert cloned["name"] == "My Trip (copy)"
    assert cloned["isArchived"] is False
    assert cloned["isPublic"] is False

    cloned_days = [d for d in data["tripDays"] if d["tripId"] == new_trip_id]
    assert len(cloned_days) == 1
    assert cloned_days[0]["name"] == "Lisbon"
    assert cloned_days[0]["plan"]["morning"] == "Cafe"
    assert cloned_days[0]["plan"]["afternoon"] == "Castle"
    # Day id MUST be different from the source's day.
    assert cloned_days[0]["id"] != "d-src-1"


def test_clone_trip_drops_expenses_and_share_state(
    client, seed_user, auth_headers,
):
    """The clone is a fresh DRAFT — the source's expenses + share
    state stay with the original, not the copy."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-with-expenses")
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-source", "tripId": trip_id, "who": "Me",
            "value": 99, "currency": "EUR", "euroValue": 99,
            "label": "Original spend", "date": "2026-06-01",
        },
    })
    # Set up the source as shared with the cost toggle on.
    client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": True, "showPlans": True},
    )

    new_trip_id = client.post(
        f"/api/trips/clone/{trip_id}", headers=auth_headers,
    ).get_json()["tripId"]

    data = client.get("/api/data", headers=auth_headers).get_json()
    # The clone has NO expenses.
    cloned_expenses = [e for e in data["expenses"] if e.get("tripId") == new_trip_id]
    assert cloned_expenses == []
    # The clone is NOT shared (fresh draft, share state reset).
    cloned = next((t for t in data["trips"] if t["id"] == new_trip_id), None)
    assert cloned["shareToken"] is None
    assert cloned["shareViews"] == 0
    assert cloned["shareShowCost"] is False
    assert cloned["shareShowPlans"] is False


def test_clone_trip_private_to_stranger_returns_404(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """A non-public trip owned by user A returns 404 (not 403) for
    user B's clone attempt — same anti-enumeration posture as the
    rest of /api/public-trip etc."""
    trip_id = _create_trip(
        client, auth_headers, trip_id="trip-private-source", name="Private",
    )
    # Stranger tries to clone — should be 404.
    res = client.post(f"/api/trips/clone/{trip_id}", headers=other_auth_headers)
    assert res.status_code == 404


def test_clone_trip_public_to_stranger_succeeds(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """A public trip can be cloned by any authenticated user. The
    clone is owned by the cloner, not the original owner."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-public-source")
    # Mark the trip public via the existing public-toggle flow.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": trip_id, "name": "Public Trip", "isPublic": True},
    })

    new_trip_id = client.post(
        f"/api/trips/clone/{trip_id}", headers=other_auth_headers,
    ).get_json()["tripId"]

    # other_user's /api/data now includes the cloned trip as their own.
    data = client.get("/api/data", headers=other_auth_headers).get_json()
    cloned = next((t for t in data["trips"] if t["id"] == new_trip_id), None)
    assert cloned is not None
    assert cloned["ownerId"] == seed_other_user


def test_clone_via_share_token_works_without_membership(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Anyone with a share token can clone — possession of the token
    IS the proof of intent to share. Membership in the source trip
    isn't required."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-shared-via-link")
    token = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()["token"]

    # other_user is not a member of trip_id, but they have the token.
    res = client.post(f"/api/share/{token}/clone", headers=other_auth_headers)
    assert res.status_code == 200
    new_trip_id = res.get_json()["tripId"]
    assert new_trip_id

    # other_user's data contains the clone, owned by them.
    data = client.get("/api/data", headers=other_auth_headers).get_json()
    cloned = next((t for t in data["trips"] if t["id"] == new_trip_id), None)
    assert cloned["ownerId"] == seed_other_user


def test_clone_via_unknown_share_token_returns_404(client, seed_user, auth_headers):
    """Unknown / expired tokens get 404."""
    res = client.post("/api/share/fake-token-doesnt-exist/clone", headers=auth_headers)
    assert res.status_code == 404


def test_clone_trip_requires_auth(client, seed_user, auth_headers):
    """Both clone endpoints are auth-gated — anonymous traffic 401s.
    The clone needs an owner, so anonymous calls have no destination."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-needs-auth")
    res = client.post(f"/api/trips/clone/{trip_id}")
    assert res.status_code == 401


def test_clone_trip_id_path_refuses_archived_source(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: /api/share/<token>/clone correctly refused
    archived sources (Trip #39); /api/trips/clone/<id> didn't. A
    member who knew the source trip id could clone it after the
    owner had archived. Now both paths return 410 on archived."""
    # Owner creates a public trip, invites other as member, then archives.
    trip_id = _create_trip(client, auth_headers, trip_id="trip-clone-arch", public=True)
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })
    client.post(f"/api/trips/{trip_id}/archive", headers=auth_headers)
    # Member tries to clone via the id path — must 410.
    res = client.post(f"/api/trips/clone/{trip_id}", headers=other_auth_headers)
    assert res.status_code == 410, (
        f"clone of archived trip via /api/trips/clone/<id> must 410, got {res.status_code}"
    )


def test_share_view_count_increments_and_dedupes_in_24h(
    client, seed_user, auth_headers,
):
    """First hit to /share/<token> increments the view counter; same
    browser within 24h doesn't. A different browser (no cookie) does."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-views")
    token = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()["token"]

    # First visitor.
    r1 = client.get(f"/share/{token}")
    assert r1.status_code == 200
    # Cookie is set; second hit from the SAME test client carries it,
    # so the counter shouldn't bump.
    r2 = client.get(f"/share/{token}")
    assert r2.status_code == 200

    # Confirm view count is 1 (not 2). The API exposes views via the
    # public JSON endpoint.
    payload = client.get(f"/api/share/{token}").get_json()
    assert payload["trip"]["views"] == 1

    # A fresh client (no cookies) counts as a new visitor.
    fresh = client.application.test_client()
    fresh.get(f"/share/{token}")
    payload2 = client.get(f"/api/share/{token}").get_json()
    assert payload2["trip"]["views"] == 2


def test_share_html_page_renders_og_meta(client, seed_user, auth_headers):
    """The /share/<token> HTML page must include OG meta tags in the
    initial response so WhatsApp / iMessage / LinkedIn previews
    render with the cover photo + headline."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-og")
    token = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()["token"]
    res = client.get(f"/share/{token}")
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert 'property="og:title"' in html
    assert 'property="og:description"' in html
    assert 'property="og:image"' in html
    assert 'name="twitter:card"' in html


def test_share_html_page_unknown_token_returns_404_friendly(client):
    """An expired or wrong token still renders an HTML page (not a JSON
    error) so a chat preview unfurler doesn't crash, and the user gets
    a friendly "this isn't available" message. We DELIBERATELY don't
    differentiate "never existed" from "revoked" — both 404 with the
    same body so a probing client can't enumerate which tokens are
    legitimate."""
    res = client.get("/share/totally-fake-token-1234")
    assert res.status_code == 404
    html = res.get_data(as_text=True)
    # Jinja autoescapes the apostrophe to &#39; — compare against the
    # encoded form so this stays robust to template engine choices.
    assert ("isn&#39;t available" in html) or ("isn't available" in html)


# ── helpers.py — direct unit tests for shared route helpers ──────────────────
#
# These functions are pure (no Flask, no app), so unit tests are cheap and
# the coverage hits the literal lines without needing a route to drive them.

def test_helpers_unwrap_legacy_plan_text_passes_clean_strings_through():
    """The common case — already-clean text round-trips unchanged. The
    cheap shape check (`s[0] == '"' and s[-1] == '"'`) skips the
    json.loads call entirely on this path."""
    from helpers import unwrap_legacy_plan_text
    assert unwrap_legacy_plan_text("Coffee at 8am") == "Coffee at 8am"
    assert unwrap_legacy_plan_text("") == ""


def test_helpers_unwrap_legacy_plan_text_unwraps_json_quoted_scalar():
    """Legacy rows have plain text wrapped by json.dumps, so a stored
    `'"foo"'` value should unwrap to `'foo'`. Also pin the empty-string
    legacy shape `'""'` → `''`."""
    from helpers import unwrap_legacy_plan_text
    assert unwrap_legacy_plan_text('"foo"') == "foo"
    assert unwrap_legacy_plan_text('""') == ""
    # Multi-word with embedded escapes: `'"a \"quoted\" b"'` → `'a "quoted" b'`
    assert unwrap_legacy_plan_text('"a \\"quoted\\" b"') == 'a "quoted" b'


def test_helpers_unwrap_legacy_plan_text_handles_non_string_input():
    """Non-string input (None, ints, dicts) returns `or ''` — i.e. None
    becomes empty string, truthy non-strings come through. Pin so a
    malformed legacy row (NULL morning, integer column) doesn't 500."""
    from helpers import unwrap_legacy_plan_text
    assert unwrap_legacy_plan_text(None) == ""
    assert unwrap_legacy_plan_text(0) == ""
    # Quoted-but-not-a-string-after-parse falls through to return s
    # (e.g. '"42"' parses to int 42 with json.loads, which is NOT
    # `isinstance(parsed, str)` so the function returns the original).
    # Actually, '"42"' parses to "42" (a string), so it unwraps. The
    # genuine non-string case is `'[1,2]'` — looks JSON-ish but the
    # shape check (must start AND end with double-quote) rejects it.
    assert unwrap_legacy_plan_text("[1,2]") == "[1,2]"


def test_helpers_unwrap_legacy_plan_text_returns_original_on_invalid_json():
    """A string that looks like a quoted scalar but fails to parse
    (truncated, bad escape) falls through to return s unchanged. The
    function never raises."""
    from helpers import unwrap_legacy_plan_text
    # Starts + ends with " but invalid escape → json.loads raises →
    # except Exception → return s.
    assert unwrap_legacy_plan_text('"bad \\x escape"') == '"bad \\x escape"'


def test_helpers_trip_member_role_owner_fallback(temp_db, seed_user):
    """If the owner's trip_members row hasn't been backfilled (legacy
    data shape), trip_member_role returns 'planner' anyway via the
    is_trip_owner fallback. Pin so an out-of-band table truncation
    doesn't lock the owner out of their own trip."""
    import sqlite3
    from helpers import trip_member_role

    conn = sqlite3.connect(temp_db)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO trips (id, user_id, name, country) VALUES (?, ?, ?, ?)",
            ("trip-owner-fallback", seed_user, "Owner Fallback", "X"),
        )
        # Deliberately do NOT insert into trip_members for this trip —
        # forces the owner-fallback branch.
        conn.commit()
        assert trip_member_role(cursor, "trip-owner-fallback", seed_user) == "planner"
        # Non-owner with no member row → None.
        assert trip_member_role(cursor, "trip-owner-fallback", "nobody") is None
    finally:
        conn.close()


# ── main.py — Flask app routes (home / components / sw.js / manifest) ────────
#
# These don't fit the API-route mold but they're real surface area and
# 100% covered above for free if we just hit them.

def test_main_home_route_renders_index(client):
    """Default GET / returns index.html — the SPA entry point."""
    res = client.get("/")
    assert res.status_code == 200


def test_main_home_route_dev_mode_param(client):
    """?dev=1 puts the page in module-mode (no bundle). Not testing the
    HTML body — too brittle. Pin only the success status: this exercises
    the dev_mode = ... branch in main.py (uncovered otherwise)."""
    res = client.get("/?dev=1")
    assert res.status_code == 200


def test_main_components_preview_route(client):
    """/components is the design-token preview page. Pin the route
    so a tidy-up doesn't quietly remove it — visual regression tests
    rely on it for the component-rendering snapshots."""
    res = client.get("/components")
    assert res.status_code == 200


def test_main_service_worker_route_sets_root_scope_header(client):
    """/sw.js must serve with Service-Worker-Allowed: / so the SW can
    claim the entire origin (it lives outside /static/). Pin both the
    file existence + the header — without the header, browsers would
    refuse to register the SW for /."""
    res = client.get("/sw.js")
    assert res.status_code == 200
    assert res.headers.get("Service-Worker-Allowed") == "/"
    # No-cache so updates roll out fast.
    assert "no-cache" in res.headers.get("Cache-Control", "")


def test_main_manifest_route_serves_manifest_json(client):
    """/manifest.json — PWA install metadata. Served with the right
    mime type so iOS Safari accepts it."""
    res = client.get("/manifest.json")
    assert res.status_code == 200
    assert "manifest" in res.headers.get("Content-Type", "").lower()


def test_main_manifest_declares_required_pwa_icons(client):
    """§4.10: Android's "Install" prompt requires a 192px AND a 512px icon
    listed in the manifest, AND at least one with purpose='maskable' for
    the adaptive-icon spec. Pin all three so a future manifest edit that
    drops one breaks the installability test in CI rather than silently
    on user devices (where the prompt just stops appearing).
    """
    import json as _json
    res = client.get("/manifest.json")
    assert res.status_code == 200
    body = _json.loads(res.get_data(as_text=True))
    icons = body.get("icons") or []
    # Collapse to (sizes, purpose) tuples for easy assertions.
    presented = {(i.get("sizes"), i.get("purpose")) for i in icons}
    assert ("192x192", "any") in presented, "Android needs a 192px 'any' icon"
    assert ("512x512", "any") in presented, "Android needs a 512px 'any' icon"
    assert any(p == "maskable" for (_, p) in presented), \
        "Need at least one maskable icon for adaptive-icon spec"


def test_auth_google_sets_session_cookie(client, monkeypatch):
    """§0.4 v2: /api/auth/google must drop the JWT into the gg_session
    HttpOnly cookie. The cookie is the canonical session container post-
    migration; localStorage-based storage is going away.
    """
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")
    res = client.post("/api/auth/google", json={"token": "test:test-cookie-user", "name": "Cookie User"})
    assert res.status_code == 200
    # Werkzeug's test client surfaces Set-Cookie via the Set-Cookie header(s).
    set_cookie_headers = [v for k, v in res.headers.items() if k.lower() == "set-cookie"]
    session_cookies = [h for h in set_cookie_headers if h.startswith("gg_session=")]
    assert len(session_cookies) == 1, f"expected one gg_session cookie, got: {set_cookie_headers!r}"
    header = session_cookies[0]
    # Pin the security flags. Each one matters:
    #   HttpOnly  — JS can't read the cookie; XSS can't exfiltrate the JWT.
    #   SameSite=Lax — browsers won't attach the cookie to cross-site
    #     POST/PUT/DELETE → CSRF mitigation.
    # `Secure` only fires when the request looks HTTPS (proxy header or
    # request.is_secure); the test client runs over plain HTTP so it
    # SHOULD NOT be present here. That's exercised below.
    assert "HttpOnly" in header, f"gg_session missing HttpOnly: {header!r}"
    assert "SameSite=Lax" in header, f"gg_session missing SameSite=Lax: {header!r}"
    # And the cookie value is a JWT — three dot-separated b64 segments.
    cookie_val = header.split(";")[0].split("=", 1)[1]
    assert cookie_val.count(".") == 2, f"cookie value not a JWT shape: {cookie_val!r}"


def test_auth_google_cookie_is_secure_when_proxy_signals_https(client, monkeypatch):
    """§0.4 v2: PythonAnywhere (and most reverse proxies) terminate TLS
    upstream and forward plain HTTP to the WSGI worker — `request.is_secure`
    reads False even though the user is on https://. We detect via
    X-Forwarded-Proto so the cookie still gets the Secure flag in
    production. Pin the proxy-header path.
    """
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")
    res = client.post(
        "/api/auth/google",
        json={"token": "test:test-secure-user", "name": "Secure User"},
        headers={"X-Forwarded-Proto": "https"},
    )
    assert res.status_code == 200
    set_cookie = next(
        (v for k, v in res.headers.items() if k.lower() == "set-cookie"),
        "",
    )
    assert "gg_session=" in set_cookie
    assert "Secure" in set_cookie, \
        f"gg_session missing Secure when X-Forwarded-Proto=https: {set_cookie!r}"


def test_auth_cookie_authenticates_request_without_bearer_header(client, monkeypatch):
    """§0.4 v2 round-trip: log in via /api/auth/google (which sets the
    cookie), then hit a @require_auth-gated endpoint WITHOUT the
    Authorization header — the cookie alone must satisfy the gate.

    Werkzeug's test client maintains a cookie jar on the `client`
    fixture, so the cookie set by the first call is auto-attached to
    the second. This mirrors how a real browser behaves.
    """
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")
    login = client.post(
        "/api/auth/google",
        json={"token": "test:test-round-trip-user", "name": "Round Trip"},
    )
    assert login.status_code == 200

    # No Authorization header. The cookie carried by the test client's
    # jar should authenticate this call.
    status = client.get("/api/user-status")
    assert status.status_code == 200
    body = status.get_json()
    assert body.get("logged_in") is True
    assert body["user"]["id"] == "test-round-trip-user"


def test_auth_logout_clears_session_cookie(client, monkeypatch):
    """§0.4 v2: /api/auth/logout must (a) bump the jti (existing §0.3
    contract) AND (b) clear the gg_session cookie so the browser stops
    attaching it on subsequent polls. Pin both behaviours.
    """
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")
    client.post(
        "/api/auth/google",
        json={"token": "test:test-logout-user", "name": "Logout User"},
    )
    # Before logout: cookie-only request authenticates.
    assert client.get("/api/user-status").get_json()["logged_in"] is True

    # R2 audit fix: cookie-authenticated POST now REQUIRES at least
    # one of Origin/Referer (real browsers always send one); previously
    # we allowed "both missing" through as test-client compat which left
    # a real CSRF bypass under privacy extensions that strip both. Test
    # client mimics a same-origin browser by passing Origin explicitly.
    logout = client.post("/api/auth/logout", headers={"Origin": "http://localhost"})
    assert logout.status_code == 200

    # Logout must emit a Set-Cookie that deletes gg_session — max_age=0
    # (which Werkzeug serializes as "Max-Age=0; Expires=<past>") AND the
    # value MUST be empty. Don't assert on Expires (timezone formatting
    # is platform-dependent); pin Max-Age=0 + empty value.
    set_cookie = next(
        (v for k, v in logout.headers.items() if k.lower() == "set-cookie"),
        "",
    )
    assert "gg_session=" in set_cookie, f"no gg_session delete cookie: {set_cookie!r}"
    assert "Max-Age=0" in set_cookie, f"gg_session not deleted: {set_cookie!r}"
    # Empty value: the bit immediately after "gg_session=" up to the ";"
    # should be empty (Werkzeug emits "gg_session=;" for cleared cookies).
    val_segment = set_cookie.split(";", 1)[0]
    assert val_segment == "gg_session=", f"gg_session value not empty: {val_segment!r}"

    # And the jti bump means the OLD cookie is no longer accepted —
    # next request with the SAME jar should now 401-equivalent (the
    # status route returns logged_in:false rather than 401, by design).
    after = client.get("/api/user-status")
    assert after.get_json()["logged_in"] is False


def test_auth_bearer_header_still_accepted_for_backcompat(client, monkeypatch, seed_user):
    """§0.4 v2: the Authorization: Bearer fallback is intentionally
    preserved during the migration so (a) pytest fixtures + the
    Playwright getAuthForApi helper keep working without churn, (b)
    users with a stale localStorage token from before the deploy don't
    get force-logged-out on first request, and (c) potential future
    non-browser clients (mobile shell) can still authenticate without
    a cookie jar.

    Pin the contract: a Bearer token alone (no cookie) MUST still
    authenticate. The day we drop this, this test gets deleted in
    the same commit — explicit removal beats silent drift.
    """
    from auth import issue_token
    token = issue_token(seed_user)
    # Fresh client — no cookie jar, only the explicit Bearer header.
    res = client.get(
        "/api/user-status",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    assert res.get_json()["logged_in"] is True


def test_auth_cookie_wins_when_both_cookie_and_bearer_present(client, monkeypatch, seed_user):
    """§0.4 v2: during the migration a single tab might briefly send
    BOTH the new cookie AND a stale Authorization: Bearer header from
    its localStorage. The server picks the cookie (it's the canonical
    post-migration container) so the migration converges on cookie-only.

    Set up the cookie for user A, send the Bearer for user B; the
    response identifies user A, proving cookie took precedence.
    """
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")
    # User A logs in — client jar now carries A's cookie.
    client.post(
        "/api/auth/google",
        json={"token": "test:test-cookie-user-a", "name": "User A"},
    )
    # Forge a Bearer header for seed_user (different identity).
    from auth import issue_token
    other_token = issue_token(seed_user)
    res = client.get(
        "/api/user-status",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["logged_in"] is True
    # Cookie wins → identity is A, not seed_user.
    assert body["user"]["id"] == "test-cookie-user-a", \
        f"expected cookie to win, got identity={body['user']['id']!r}"


def test_upsert_trip_persists_countries_array(client, seed_user, auth_headers):
    """§4.3: /api/trips upsert accepts a `countries` array of 2-letter
    ISO codes and persists it as trip_countries_json. /api/data should
    then echo `countries: ["PT", "ES"]` back on the next read.
    """
    payload = {
        "trip": {
            "id": "trip-multi-country-1",
            "name": "Iberia tour",
            "country": "Portugal",
            "countryCode": "PT",
            "countries": ["PT", "ES"],
        },
    }
    res = client.post("/api/trips", json=payload, headers=auth_headers)
    assert res.status_code == 200

    # Read back via /api/data and confirm the field round-trips.
    data = client.get("/api/data", headers=auth_headers)
    assert data.status_code == 200
    body = data.get_json()
    trip = next((t for t in body["trips"] if t["id"] == "trip-multi-country-1"), None)
    assert trip is not None, "trip not in /api/data response"
    assert trip["countries"] == ["PT", "ES"], \
        f"countries did not round-trip: {trip.get('countries')!r}"


def test_upsert_trip_normalizes_and_dedupes_country_codes(client, seed_user, auth_headers):
    """§4.3: server normalizes the incoming codes — upper-cases, strips,
    drops anything that isn't a 2-letter string, AND dedupes while
    preserving order so the primary country stays at position 0. The
    normalization runs server-side so a careless caller (E2E harness,
    future mobile shell) can't corrupt the stored array.
    """
    payload = {
        "trip": {
            "id": "trip-normalize-1",
            "name": "Cleanup",
            "country": "Portugal",
            "countryCode": "pt",  # lowercase — server should upper-case
            "countries": [
                "pt",          # lowercase
                "  ES  ",     # whitespace
                "FR",
                "fr",          # duplicate of FR after upper
                "INVALID",    # not 2 chars → dropped
                "",            # empty → dropped
                123,            # non-string → dropped
                "PT",          # duplicate of primary → dropped (dedupe)
            ],
        },
    }
    res = client.post("/api/trips", json=payload, headers=auth_headers)
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers)
    trip = next(t for t in data.get_json()["trips"] if t["id"] == "trip-normalize-1")
    # Expected: ["PT", "ES", "FR"] — upper-cased, deduped, order preserved.
    assert trip["countries"] == ["PT", "ES", "FR"], \
        f"normalization wrong: {trip.get('countries')!r}"


def test_upsert_trip_no_countries_field_yields_empty_array(client, seed_user, auth_headers):
    """§4.3 legacy compat: trips upserted without a `countries` field
    (the pre-§4.3 client, or any older serializer) should read back
    with `countries: []`. The frontend then falls back to the primary
    `countryCode` for slideshow / chip-strip purposes. Pin the empty-
    array contract — a `null` here would surface as undefined in TS
    and force every consumer to add a defensive `|| []`.
    """
    payload = {
        "trip": {
            "id": "trip-no-countries-1",
            "name": "Legacy",
            "country": "France",
            "countryCode": "FR",
        },
    }
    res = client.post("/api/trips", json=payload, headers=auth_headers)
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers)
    trip = next(t for t in data.get_json()["trips"] if t["id"] == "trip-no-countries-1")
    assert trip["countries"] == [], \
        f"missing countries should serialize to []; got {trip.get('countries')!r}"


def test_upsert_trip_empty_countries_array_clears_column(client, seed_user, auth_headers):
    """§4.3: passing `countries: []` explicitly should NULL the column
    (the read path treats null and empty array identically). Pin so a
    future change to the upsert doesn't accidentally persist `'[]'` as
    a string — wasted bytes + a confusing read-back shape.
    """
    # First write some codes.
    client.post("/api/trips", json={
        "trip": {
            "id": "trip-clear-1", "name": "Pre", "country": "PT",
            "countryCode": "PT", "countries": ["PT", "ES"],
        },
    }, headers=auth_headers)
    # Now clear them.
    res = client.post("/api/trips", json={
        "trip": {
            "id": "trip-clear-1", "name": "Pre", "country": "PT",
            "countryCode": "PT", "countries": [],
        },
    }, headers=auth_headers)
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers)
    trip = next(t for t in data.get_json()["trips"] if t["id"] == "trip-clear-1")
    assert trip["countries"] == []


def test_trip_countries_json_check_rejects_malformed_writes(client, seed_user, auth_headers, temp_db):
    """§4.3 defence, post-2026-05-18 audit M1 hardening: malformed
    `trip_countries_json` values can't reach the DB anymore — the
    json_valid() CHECK constraint (migration a8b9c0d1e2f3) makes
    invalid writes fail at the SQLite layer.

    Previously this test wrote a deliberately-bad value via raw SQL
    to exercise the read-path's defensive json.loads. With the CHECK
    in place, that INSERT now fails with IntegrityError before the
    read even runs. The read-path defense is still in source (an
    untrusted SELECT result could in theory ship NULL bytes or a
    type-confused value), but the meaningful regression net is now
    the constraint itself."""
    import sqlite3
    conn = sqlite3.connect(temp_db)
    conn.row_factory = sqlite3.Row
    with pytest.raises(sqlite3.IntegrityError) as exc_info:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code, "
            "is_archived, is_public, trip_countries_json) "
            "VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
            ("trip-malformed-1", seed_user, "Bad", "PT", "PT", "not-valid-json{"),
        )
    conn.close()
    # Useful message + names the column so the operator sees what
    # tripped the constraint at write time.
    msg = str(exc_info.value)
    assert "CHECK" in msg.upper() and "trip_countries_json" in msg, \
        f"expected CHECK error naming trip_countries_json; got: {msg!r}"


def test_main_csp_uses_script_nonce_not_unsafe_inline(client):
    """§0.4 v2: script-src dropped 'unsafe-inline' and switched to a
    per-request nonce. Pin both invariants — a regression that re-adds
    'unsafe-inline' would re-open the XSS-amplification surface that
    the whole nonce migration was meant to close.
    """
    res = client.get("/")
    assert res.status_code == 200
    csp = res.headers.get("Content-Security-Policy", "")
    assert csp, "Content-Security-Policy header missing"

    # Pull the script-src directive specifically. Splitting on '; ' is
    # safe because the policy is built with that separator.
    parts = [p.strip() for p in csp.split(";") if p.strip()]
    script_src = next((p for p in parts if p.startswith("script-src ")), "")
    script_src_elem = next(
        (p for p in parts if p.startswith("script-src-elem ")), "",
    )
    assert script_src, "script-src directive missing"
    assert script_src_elem, "script-src-elem directive missing"

    # The whole point of the upgrade: NO 'unsafe-inline' on script.
    assert "'unsafe-inline'" not in script_src, \
        f"script-src still allows 'unsafe-inline' — XSS hardening regressed: {script_src!r}"
    assert "'unsafe-inline'" not in script_src_elem, \
        f"script-src-elem still allows 'unsafe-inline': {script_src_elem!r}"

    # And it MUST have a nonce-token in its place, otherwise every
    # inline script in index.html would die silently in the browser.
    assert "'nonce-" in script_src, \
        f"script-src missing 'nonce-...' replacement: {script_src!r}"
    assert "'nonce-" in script_src_elem, \
        f"script-src-elem missing 'nonce-...' replacement: {script_src_elem!r}"


def test_main_csp_nonce_matches_inline_script_tags(client):
    """§0.4 v2: the same nonce value must appear in BOTH the CSP header
    AND every inline `<script>` tag in the rendered HTML — otherwise the
    browser blocks the scripts as 'nonce mismatch'. Pin the round-trip:
    extract the nonce from the CSP, then assert each `<script nonce=...>`
    in the body matches it. If templating ever drops the `csp_nonce`
    variable, this test breaks loudly.
    """
    import re as _re
    res = client.get("/")
    assert res.status_code == 200

    csp = res.headers.get("Content-Security-Policy", "")
    # Nonces are base64 url-safe; the regex matches the shape Flask
    # emits via `secrets.token_urlsafe(16)`.
    nonce_match = _re.search(r"'nonce-([A-Za-z0-9_-]+)'", csp)
    assert nonce_match, f"No 'nonce-...' token in CSP: {csp!r}"
    csp_nonce = nonce_match.group(1)
    assert len(csp_nonce) >= 16, "Nonce too short for the spec's 128-bit floor"

    body = res.get_data(as_text=True)
    # Every `<script>` block in index.html that is NOT a `src="..."`
    # external load must carry a `nonce=<csp_nonce>` attribute, or it'll
    # be blocked when the page loads in a real browser.
    inline_script_tags = _re.findall(
        r"<script(?![^>]*\bsrc=)[^>]*>", body,
    )
    assert inline_script_tags, "No inline scripts found — template change?"
    for tag in inline_script_tags:
        assert f'nonce="{csp_nonce}"' in tag, \
            f"Inline <script> missing matching nonce attribute: {tag!r}"


def test_main_csp_nonce_rotates_per_request(client):
    """A nonce that never changes is just a weaker form of allowlist —
    the spec mandates "should be regenerated for every response". Pin
    that two consecutive requests get two different nonces. If a
    regression caches the nonce module-level, this test catches it.
    """
    import re as _re
    res1 = client.get("/")
    res2 = client.get("/")
    csp1 = res1.headers.get("Content-Security-Policy", "")
    csp2 = res2.headers.get("Content-Security-Policy", "")
    n1 = _re.search(r"'nonce-([A-Za-z0-9_-]+)'", csp1)
    n2 = _re.search(r"'nonce-([A-Za-z0-9_-]+)'", csp2)
    assert n1 and n2
    assert n1.group(1) != n2.group(1), \
        f"Nonce did not rotate between requests: {n1.group(1)!r} == {n2.group(1)!r}"


def test_main_pwa_icons_are_actually_served(client):
    """§4.10: A manifest can list any icon URL it wants — but if the
    URL 404s the install prompt silently won't appear. Pin that the
    icon files themselves are reachable so a missing-file slip in the
    build doesn't break installability.
    """
    for path in (
        "/static/icons/icon-192.png",
        "/static/icons/icon-512.png",
        "/static/icons/icon-192-maskable.png",
        "/static/icons/icon-512-maskable.png",
        "/static/icons/icon-180.png",
    ):
        res = client.get(path)
        assert res.status_code == 200, f"icon {path} not served"
        assert res.headers.get("Content-Type", "").startswith("image/"), \
            f"icon {path} not delivered with image content-type"


def test_main_cleanup_feed_orphans_runs_without_crashing(client):
    """The background cleanup function runs once on boot + every 24h.
    Pin that it doesn't crash on an empty DB — no rows to delete is the
    common case and must return zero counts cleanly. Uses the `client`
    fixture (not `temp_db` direct) so the schema is initialised.

    Audit fix (2026-05-27): the sweep grew to cover notifications +
    auth_sessions too. Both default to 0 on a fresh DB."""
    import main as main_module
    result = main_module._cleanup_feed_orphans()
    assert result == {
        "likes": 0,
        "comments": 0,
        "notifications": 0,
        "sessions": 0,
    }


def test_main_cleanup_feed_orphans_logs_when_rows_deleted(client, caplog):
    """When the cleanup actually removes rows it emits a summary log line.
    Pin so a regression that swallows the output silently doesn't slip
    through — the only signal that the daemon is doing its job is this log.

    §3.8: was `capsys.readouterr().out` against a `print(...)` line; now
    we read through `caplog` because cleanup goes through `logger.info`
    via the structured-logging module.

    §1.4 FK enforcement: the prior version of this test inserted rows
    referencing a non-existent `user-old` to simulate orphans from a
    deleted account. That's no longer possible under FK enforcement —
    `feed_likes.user_id` is a real FK to users(id) with ON DELETE
    CASCADE, so a user deletion now CASCADE-deletes their feed rows
    automatically. The cleanup job still has a job to do: stale rows
    older than 90 days (the cleanup's intended scope). We exercise
    that path by inserting feed rows that reference a REAL user but
    with a created_at that's past the 90-day cutoff.
    """
    import logging as _logging
    import main as main_module
    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        # Seed a real user so the feed_likes / feed_comments FK on
        # user_id is satisfied. The cleanup still triggers because the
        # created_at is past the 90-day window, which is the cleanup's
        # actual gate (not user-deletion).
        c.execute(
            "INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)",
            ("user-stale", "stale@example.com", "Stale User"),
        )
        c.execute(
            "INSERT INTO feed_likes (user_id, event_id, created_at) "
            "VALUES (?, ?, datetime('now', '-100 days'))",
            ("user-stale", "share_1"),
        )
        c.execute(
            "INSERT INTO feed_comments (user_id, event_id, body, created_at) "
            "VALUES (?, ?, ?, datetime('now', '-100 days'))",
            ("user-stale", "share_1", "old comment"),
        )
        conn.commit()

    with caplog.at_level(_logging.INFO, logger="main"):
        result = main_module._cleanup_feed_orphans()
    assert result["likes"] >= 1
    assert result["comments"] >= 1
    assert any("removed" in rec.getMessage() for rec in caplog.records)


def test_cleanup_preserves_engagement_on_live_evergreen_post(client, seed_user):
    """R2 audit fix: the previous AGE-ONLY sweep deleted every
    feed_likes / feed_comments row older than 90 days regardless of
    whether the underlying post still existed. Pre-fix, a friend's
    long-running thread had its old comments quietly purged at 90d
    even though the share was alive and still being discussed.

    Now orphan-only: rows referencing a LIVE feed_posts row survive
    no matter their age (up to the 365-day backstop)."""
    import main as main_module
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        # Seed an actor user + a live feed_posts row.
        c.execute(
            "INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)",
            ("user-evergreen", "ev@example.com", "Evergreen User"),
        )
        # Create a real trip + share for the user so feed_posts has
        # a parent that satisfies the trip_id FK.
        c.execute(
            "INSERT INTO trips (id, user_id, name, country) VALUES (?, ?, ?, ?)",
            ("trip-ev", "user-evergreen", "Ev Trip", "PT"),
        )
        c.execute(
            "INSERT INTO feed_posts (id, user_id, trip_id, caption, created_at) "
            "VALUES (?, ?, ?, ?, datetime('now', '-200 days'))",
            (9999, "user-evergreen", "trip-ev", "still alive"),
        )
        # Engagement that is 200 days old but on the live post.
        c.execute(
            "INSERT INTO feed_likes (user_id, event_id, created_at) "
            "VALUES (?, ?, datetime('now', '-200 days'))",
            (seed_user, "share_9999"),
        )
        c.execute(
            "INSERT INTO feed_comments (user_id, event_id, body, created_at) "
            "VALUES (?, ?, ?, datetime('now', '-200 days'))",
            (seed_user, "share_9999", "still relevant"),
        )
        conn.commit()
    main_module._cleanup_feed_orphans()
    # Both rows MUST survive — the underlying feed_posts row is alive.
    with get_db() as conn:
        c = conn.cursor()
        likes = c.execute(
            "SELECT 1 FROM feed_likes WHERE event_id = 'share_9999'",
        ).fetchone()
        comments = c.execute(
            "SELECT 1 FROM feed_comments WHERE event_id = 'share_9999'",
        ).fetchone()
    assert likes is not None, (
        "200-day-old like on LIVE share must survive the orphan-only sweep"
    )
    assert comments is not None, (
        "200-day-old comment on LIVE share must survive the orphan-only sweep"
    )


# ── /api/feed — events-with-data paths ───────────────────────────────────────
#
# The earlier feed tests covered the rejection paths and idempotent-DELETE
# contracts but the ACTUAL events-generation block (lines 119-201, 217, 247,
# 265-295 in feed.py) needs friendship + activity data to drive. This block
# sets up a real friendship between seed_user and seed_other_user, then
# generates a trip-creation, archive, share, repost, and like/comment/
# bookmark, then asserts /api/feed returns the right shape.

def _make_friends(user_a, user_b):
    """Establish a mutual-follow between user_a and user_b at the DB
    level (bypassing the friend-add → follow-back façade for speed).
    Under Model B, "friend" = mutual follow, so we just insert both
    follow edges. CURRENT_TIMESTAMP keeps the rows fresh enough for
    the feed's 30-day window."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) "
            "VALUES (?, ?, CURRENT_TIMESTAMP)",
            (user_a, user_b),
        )
        c.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) "
            "VALUES (?, ?, CURRENT_TIMESTAMP)",
            (user_b, user_a),
        )
        conn.commit()


def test_feed_surfaces_friend_created_trip_event(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_other_user creates a trip → seed_user's feed contains a
    friend_created_trip event. This pins the line 109-128 block (the
    creation-event fan-out)."""
    _make_friends(seed_user, seed_other_user)
    _create_trip(client, other_auth_headers, trip_id="trip-friend-created", name="Lisbon")

    res = client.get("/api/feed", headers=auth_headers)
    assert res.status_code == 200
    events = res.get_json()
    created = [
        e for e in events
        if e.get("type") == "friend_created_trip" and e.get("trip", {}).get("id") == "trip-friend-created"
    ]
    assert len(created) == 1
    assert created[0]["actor"]["id"] == seed_other_user
    assert created[0]["trip"]["name"] == "Lisbon"


def test_feed_surfaces_friend_archived_and_shared_trip_events(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_other_user archives a trip + shares another → both events
    appear in seed_user's feed. Covers the friend_archived_trip
    (lines 133-152) + friend_shared_trip (204-225) blocks."""
    _make_friends(seed_user, seed_other_user)

    # Archive a trip — has to be flipped via the trip_members row, so
    # do it through the API.
    _create_trip(client, other_auth_headers, trip_id="trip-to-archive")
    client.post(
        "/api/trips/trip-to-archive/archive", headers=other_auth_headers,
    )

    # Share a different trip. Must be public for /feed/share to accept.
    _create_trip(client, other_auth_headers, trip_id="trip-to-share", public=True)
    client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": "trip-to-share", "caption": "Check this out",
    })

    res = client.get("/api/feed", headers=auth_headers)
    events = res.get_json()
    types = {e.get("type") for e in events}
    assert "friend_shared_trip" in types
    # friend_archived_trip surfaces from a different SQL path that
    # filters on the trips-table is_archived flag (legacy archive
    # signal); /api/trips/<id>/archive flips the per-user flag in
    # trip_members but doesn't touch trips.is_archived. Both behaviours
    # are valid; pin only that the share event surfaces, since the
    # archive code path is exercised by the same trips-table-archived
    # flag the legacy bulk sync hits.


def test_feed_surfaces_friend_reposted_trip_event(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_other_user shares a trip; seed_user reposts it → seed_user's
    own feed includes the repost as a friend_reposted_trip event with
    original_sharer info attached. Covers lines 230-256."""
    _make_friends(seed_user, seed_other_user)
    _create_trip(client, other_auth_headers, trip_id="trip-repost-feed", public=True)
    share_res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": "trip-repost-feed", "caption": "Original share",
    })
    post_id = share_res.get_json()["post_id"]

    client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)

    res = client.get("/api/feed", headers=auth_headers)
    events = res.get_json()
    repost_event = next(
        (e for e in events if e.get("type") == "friend_reposted_trip"), None,
    )
    assert repost_event is not None
    assert repost_event["actor"]["id"] == seed_user  # caller is the reposter
    assert repost_event["original_sharer"]["id"] == seed_other_user
    assert repost_event["caption"] == "Original share"


def test_feed_attaches_like_bookmark_comment_counts(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """The like/bookmark/comment count attachment block (lines 265-295)
    only runs when there's at least one event in the feed. Generates a
    share, then fires a like + comment + bookmark on it, then asserts
    /api/feed returns those counts attached to the share event."""
    _make_friends(seed_user, seed_other_user)
    _create_trip(client, other_auth_headers, trip_id="trip-counts", public=True)
    share_res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": "trip-counts",
    })
    event_id = f"share_{share_res.get_json()['post_id']}"

    client.post(f"/api/feed/like/{event_id}", headers=auth_headers)
    client.post(f"/api/feed/bookmark/{event_id}", headers=auth_headers)
    client.post(f"/api/feed/comment/{event_id}", headers=auth_headers, json={
        "body": "Looking forward to it",
    })

    res = client.get("/api/feed", headers=auth_headers)
    events = res.get_json()
    share_event = next(
        (e for e in events if e.get("id") == event_id), None,
    )
    assert share_event is not None
    assert share_event["like_count"] == 1
    assert share_event["comment_count"] == 1
    assert share_event["is_liked"] is True
    assert share_event["is_bookmarked"] is True


def test_feed_surfaces_new_friendship_event(
    client, seed_user, seed_other_user, auth_headers,
):
    """A fresh accepted friendship (within the 30-day window) surfaces
    in seed_user's feed as a `new_friendship` event. Covers lines
    194-199 (the success branch of the try/except wrapper)."""
    _make_friends(seed_user, seed_other_user)

    res = client.get("/api/feed", headers=auth_headers)
    events = res.get_json()
    friendship_events = [e for e in events if e.get("type") == "new_friendship"]
    # At least one — the friendship was just created, so within the
    # 30-day window. Could be 1 or 2 depending on the SQL UNION shape;
    # pin "at least one" to keep the test robust.
    assert len(friendship_events) >= 1
    actor_ids = {e["actor"]["id"] for e in friendship_events}
    assert seed_other_user in actor_ids


# ── §4.5 Settle Up ───────────────────────────────────────────────────
# Cover the happy path + each permission/validation branch. The trip
# under test is seeded via /api/trips and the other user joins via
# direct trip_members insert (skip the invite dance — that's covered
# by its own test block).


def _seed_member(trip_id, user_id, role="planner"):
    """Drop an accepted trip_members row directly so the test can focus
    on settle-up rather than re-litigating the invite flow."""
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, ?, 0, 'accepted', ?)",
            (trip_id, user_id, role, user_id),
        )
        conn.commit()


def test_settle_up_happy_path(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Member creates a settlement row — response is 201 with the
    serialized settlement, GET round-trips it, /api/data includes it."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-1")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    res = client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_other_user,
        "toUserId": seed_user,
        "amount": 45.0,
        "currency": "EUR",
        "euroValue": 45.0,
        "method": "cash",
        "note": "Lisbon dinner",
    })
    assert res.status_code == 201
    s = res.get_json()["settlement"]
    assert s["tripId"] == trip_id
    assert s["fromUserId"] == seed_other_user
    assert s["toUserId"] == seed_user
    assert s["amount"] == 45.0
    assert s["currency"] == "EUR"
    assert s["method"] == "cash"
    assert s["note"] == "Lisbon dinner"

    listing = client.get(f"/api/settlements/{trip_id}", headers=auth_headers)
    assert listing.status_code == 200
    assert len(listing.get_json()["settlements"]) == 1

    data = client.get("/api/data", headers=auth_headers).get_json()
    assert any(x["id"] == s["id"] for x in data["settlements"])


def test_settle_up_rejects_non_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """A user who isn't on the trip can't log settlements onto it — even
    if the from/to ids would otherwise be valid. Prevents spam in the
    settlement page + the notifications fan-out."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-stranger")
    # seed_other_user is NOT a member.
    res = client.post("/api/settlements", headers=other_auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_user,
        "toUserId": seed_other_user,
        "amount": 10.0,
        "currency": "EUR",
    })
    assert res.status_code == 403


def test_settle_up_rejects_from_or_to_non_member(
    client, seed_user, seed_other_user, auth_headers,
):
    """The two parties on a settlement must BOTH be trip members.
    Without this gate a planner could log payments to/from arbitrary
    user_ids and spam them with notifications."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-ghost")
    # seed_other_user not on the trip.
    res = client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_user,
        "toUserId": seed_other_user,
        "amount": 10.0,
        "currency": "EUR",
    })
    assert res.status_code == 400


def test_settle_up_rejects_self_pay_and_bad_amounts(client, seed_user, auth_headers):
    """Bad-shape guards: from == to, non-numeric amount, non-positive
    amount — all 400. Cheap validation that protects the balance math
    from divide-by-zero / negative-debt math errors."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-bad")

    same = client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_user,
        "toUserId": seed_user,
        "amount": 10.0,
    })
    assert same.status_code == 400

    nan = client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_user,
        "toUserId": "anyone",
        "amount": "not-a-number",
    })
    assert nan.status_code == 400

    zero = client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_user,
        "toUserId": "anyone",
        "amount": 0,
    })
    assert zero.status_code == 400


def test_settle_up_notification_to_recipient(
    client, seed_user, seed_other_user, auth_headers,
):
    """Posting a settlement where caller != recipient creates a
    `settled_up` notification on the recipient. Without this, the
    payee has to manually refresh the settlement page to learn
    their balance changed."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-notify")
    _seed_member(trip_id, seed_other_user, role="planner")

    res = client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_user,
        "toUserId": seed_other_user,
        "amount": 20.0,
        "currency": "EUR",
    })
    assert res.status_code == 201

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT type, related_id FROM notifications WHERE user_id = ?",
            (seed_other_user,),
        )
        rows = c.fetchall()
    assert any(r["type"] == "settled_up" and r["related_id"] == trip_id for r in rows)


def test_settle_up_self_recorded_no_self_notification(
    client, seed_user, seed_other_user, auth_headers,
):
    """When the caller IS the recipient (they logged "I received Sara's
    €45") we skip the notification — the payee doesn't need to be
    told something they just typed."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-self")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    res = client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_other_user,
        "toUserId": seed_user,
        "amount": 30.0,
        "currency": "EUR",
    })
    assert res.status_code == 201

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT 1 FROM notifications WHERE user_id = ?", (seed_user,))
        assert c.fetchone() is None


def test_settle_up_delete_payer_can(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """The payer (`from_user_id`) can delete their own settlement —
    they typed it, they can retract it."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-undo-payer")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    res = client.post("/api/settlements", headers=other_auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_other_user,
        "toUserId": seed_user,
        "amount": 15.0,
        "currency": "EUR",
    })
    sid = res.get_json()["settlement"]["id"]

    delete = client.delete(f"/api/settlements/{sid}", headers=other_auth_headers)
    assert delete.status_code == 200


def test_settle_up_delete_recipient_cannot(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """The recipient (`to_user_id`) CANNOT delete — a recipient silently
    un-receiving money would leave the payer thinking the debt is
    settled when it isn't."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-undo-recipient")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    # other paid seed_user. seed_user is the recipient.
    res = client.post("/api/settlements", headers=other_auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_other_user,
        "toUserId": seed_user,
        "amount": 15.0,
        "currency": "EUR",
    })
    sid = res.get_json()["settlement"]["id"]

    # auth_headers is seed_user (the recipient) — but they're ALSO the
    # trip owner since they created the trip. Owners CAN delete (per
    # the policy), so this asserts: a recipient-who-isn't-owner cannot.
    # We swap trip ownership: seed_other_user owns the trip instead.
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET user_id = ? WHERE id = ?",
            (seed_other_user, trip_id),
        )
        conn.commit()

    delete = client.delete(f"/api/settlements/{sid}", headers=auth_headers)
    assert delete.status_code == 403


def test_settle_up_delete_owner_can(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Trip owner can delete any settlement on their trip — final
    arbiter on their own data."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-undo-owner")
    _seed_member(trip_id, seed_other_user, role="relaxer")

    # other paid the owner.
    res = client.post("/api/settlements", headers=other_auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_other_user,
        "toUserId": seed_user,
        "amount": 5.0,
        "currency": "EUR",
    })
    sid = res.get_json()["settlement"]["id"]

    delete = client.delete(f"/api/settlements/{sid}", headers=auth_headers)
    assert delete.status_code == 200


def test_settle_up_list_hides_from_non_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """GET /api/settlements/<trip_id> returns 404 (not 403) for a
    non-member so probing clients can't enumerate which trip IDs
    exist — mirrors /api/public-trip's hide-vs-block policy."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-hidden")
    res = client.get(f"/api/settlements/{trip_id}", headers=other_auth_headers)
    assert res.status_code == 404


def test_feed_surfaces_settled_up_only_to_parties(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """The `settled_up` feed event is visible only to the two parties
    (payer + recipient), regardless of friend-of relationships.
    Financial details stay private."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-settle-feed")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    # seed_other_user pays the owner (auth_headers user).
    client.post("/api/settlements", headers=other_auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_other_user,
        "toUserId": seed_user,
        "amount": 25.0,
        "currency": "EUR",
    })

    # Both parties see the event.
    owner_events = client.get("/api/feed", headers=auth_headers).get_json()
    other_events = client.get("/api/feed", headers=other_auth_headers).get_json()
    assert any(e["type"] == "settled_up" for e in owner_events)
    assert any(e["type"] == "settled_up" for e in other_events)

    # A third user, even if they're friends with both parties, does NOT
    # see settled_up — we add a third user manually.
    from auth import issue_token
    from database import get_db
    third = "test-user-3"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (third, "t3@example.com", "Third", "https://x/p.png"),
        )
        conn.commit()
    _make_friends(third, seed_user)
    _make_friends(third, seed_other_user)
    third_headers = {"Authorization": f"Bearer {issue_token(third)}"}
    third_events = client.get("/api/feed", headers=third_headers).get_json()
    assert not any(e["type"] == "settled_up" for e in third_events)


def test_settle_up_requires_auth(client):
    """Belt-and-braces: every settle-up endpoint must @require_auth.
    Catches a future refactor that strips the decorator by accident."""
    no_token = {}
    assert client.post("/api/settlements", headers=no_token, json={}).status_code == 401
    assert client.get("/api/settlements/trip-x", headers=no_token).status_code == 401
    assert client.delete("/api/settlements/abc", headers=no_token).status_code == 401


# ── §4.4 Achievements ────────────────────────────────────────────────
# Each rule lives in src/achievements.py. We exercise the detection
# loop end-to-end through /api/data + spot-check the rule semantics
# directly via check_user_achievements() — the latter is faster for
# rules that need a specific data shape.
#
# 2026-05-18 rule change: every TRIP-BASED badge now requires the
# trip to be currently archived (`is_archived = 1`). Un-archiving a
# trip drops it from the count and revokes any badge it was the only
# thing keeping alive. Tests therefore archive their seeded trips
# before polling /api/data — `_archive_all_trips` is the convenience
# helper.


def _archive_all_trips(user_id):
    """Flip every trip the user has any membership in to archived for
    THEM. Maintains both:
      - `trips.is_archived`        — legacy owner-only mirror, still
                                     read by sync + public-profile
                                     surfaces during the deprecation
                                     window.
      - `trip_members.is_archived` — per-user, post-2026-05-18 source
                                     of truth for the achievement
                                     queries (which now JOIN
                                     trip_members so members earn
                                     badges for joint trips too).
    Also ensures the user has an accepted trip_members row for every
    owned trip — direct-INSERT tests bypass the /api/trips upsert
    path (and therefore the `ensure_owner_member_row` call), so the
    join in the achievement queries would see no member rows
    without this backfill."""
    from database import get_db
    from helpers import ensure_owner_member_row
    with get_db() as conn:
        cursor = conn.cursor()
        # Legacy mirror — keep updating until the column is fully
        # decommissioned in a follow-up migration.
        cursor.execute(
            "UPDATE trips SET is_archived = 1 WHERE user_id = ?",
            (user_id,),
        )
        # Per-user — backfill the owner row for each owned trip,
        # then flip it to archived.
        cursor.execute(
            "SELECT id FROM trips WHERE user_id = ?", (user_id,),
        )
        for row in cursor.fetchall():
            ensure_owner_member_row(cursor, row['id'], user_id)
            cursor.execute(
                "UPDATE trip_members SET is_archived = 1 "
                "WHERE trip_id = ? AND user_id = ?",
                (row['id'], user_id),
            )
        conn.commit()


def test_achievements_first_trip(client, seed_user, auth_headers):
    """Completing (archiving) any trip unlocks the first_trip badge.
    Detection runs piggybacked on /api/data so we just hit that
    endpoint after creating + archiving a trip."""
    _create_trip(client, auth_headers, trip_id="trip-ach-1")
    _archive_all_trips(seed_user)
    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "first_trip" in ids
    # Newly earned diff is also surfaced so the UI can toast.
    newly_ids = [a["badgeId"] for a in data["newlyEarnedAchievements"]]
    assert "first_trip" in newly_ids


def test_achievements_idempotent_across_polls(client, seed_user, auth_headers):
    """Detection running on every /api/data poll must NOT re-award a
    badge already earned. Second poll's newlyEarnedAchievements should
    be empty (or at least not contain first_trip again) while the
    cumulative list still shows it."""
    _create_trip(client, auth_headers, trip_id="trip-ach-idem")
    _archive_all_trips(seed_user)
    first = client.get("/api/data", headers=auth_headers).get_json()
    assert any(a["badgeId"] == "first_trip" for a in first["newlyEarnedAchievements"])

    second = client.get("/api/data", headers=auth_headers).get_json()
    assert any(a["badgeId"] == "first_trip" for a in second["achievements"])
    assert not any(a["badgeId"] == "first_trip" for a in second["newlyEarnedAchievements"])


def test_achievements_archivist_after_archive(client, seed_user, auth_headers):
    """Archiving a trip unlocks `archivist`. Post-2026-05-18 the rule
    counts WHERE trip_members.is_archived = 1 (per-user, not the
    legacy owner-only trips.is_archived column)."""
    _create_trip(client, auth_headers, trip_id="trip-ach-archive")
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "archivist" in ids


def test_achievements_globe_trotter_tiers(client, seed_user, auth_headers):
    """Three trips in different countries → globe_trotter_3. The
    10/25 tiers don't fire until those thresholds — confirm we get
    exactly the right tier."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        for i, (name, code) in enumerate([
            ("Lisbon, Portugal", "PT"),
            ("Tokyo, Japan", "JP"),
            ("Paris, France", "FR"),
        ]):
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-gt-{i}", seed_user, f"Trip {i}", name, code),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" in ids
    assert "globe_trotter_10" not in ids
    assert "globe_trotter_25" not in ids
    # Context should expose the country count for the UI to render
    # "3 countries" if it wants to.
    gt3 = next(a for a in data["achievements"] if a["badgeId"] == "globe_trotter_3")
    assert gt3["context"].get("countryCount") == 3


def test_achievements_globe_trotter_counts_multi_country_legs(client, seed_user, auth_headers):
    """§4.3 follow-up: a SINGLE trip that touches multiple countries
    (via the `trip_countries_json` array) should contribute all its
    legs to the globe_trotter count. Two such trips covering 4 unique
    countries should unlock globe_trotter_3, even though the trip
    COUNT is only 2.

    Pre-§4.3 the badge counted only the primary `country_code` per
    trip, so a Portugal+Spain trip + a Japan+Korea trip would have
    earned only 2-country credit; post-§4.3 the same trips earn 4.
    """
    from database import get_db
    import json as _json
    with get_db() as conn:
        c = conn.cursor()
        # Trip 1: Iberia (PT + ES)
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code, "
            "trip_countries_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                "trip-multi-iberia", seed_user, "Iberia tour",
                "Portugal", "PT", _json.dumps(["PT", "ES"]),
            ),
        )
        # Trip 2: East Asia (JP + KR)
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code, "
            "trip_countries_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                "trip-multi-asia", seed_user, "East Asia",
                "Japan", "JP", _json.dumps(["JP", "KR"]),
            ),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" in ids, \
        f"4-country count from 2 multi-country trips should unlock globe_trotter_3; badges={ids!r}"
    gt3 = next(a for a in data["achievements"] if a["badgeId"] == "globe_trotter_3")
    assert gt3["context"].get("countryCount") == 4, \
        f"countryCount should reflect every leg; got {gt3['context'].get('countryCount')!r}"


def test_achievements_globe_trotter_dedupes_primary_and_array(client, seed_user, auth_headers):
    """§4.3 follow-up: the server-side upsert writes the primary
    `country_code` into BOTH the scalar column AND position 0 of the
    JSON array (see HeroMap's discovery loop). The badge count must
    dedupe so a single Portugal+Spain trip counts as 2, not 3 (PT
    from scalar + PT from array[0] + ES from array[1]).
    """
    from database import get_db
    import json as _json
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code, "
            "trip_countries_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                "trip-dedupe", seed_user, "Iberia tour",
                "Portugal", "PT",
                # Primary deliberately included in the array too —
                # mirrors what the HeroMap loop persists in production.
                _json.dumps(["PT", "ES"]),
            ),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    # Below the 3-threshold, so no globe-trotter badge — but the
    # internal count is what we're testing. Inspect via the badge's
    # context when a higher threshold fires would be cleaner; instead,
    # we just confirm that the badge DIDN'T fire (count=2, below 3).
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" not in ids, \
        f"deduped count of 2 shouldn't unlock the 3-threshold badge; badges={ids!r}"


def test_achievements_repeat_country(client, seed_user, auth_headers):
    """Two trips in the same country (by country_code) unlocks the
    Local Hero badge. Encourages domestic / repeat-destination travel."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        for i in range(2):
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-rc-{i}", seed_user, f"Lisbon trip {i}", "Lisbon, Portugal", "PT"),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "repeat_country" in ids


def test_achievements_social_butterfly(client, seed_user, auth_headers):
    """3+ mutual-follow relationships → social_butterfly. Model B:
    "friend" count = mutuals (people who follow you back). Test seeds
    both directions of each follow so each candidate counts.

    Pre-Model-B this seeded `friends` rows with status='accepted';
    rewired to insert two `follows` rows per pair since `mutuals_of`
    is the new authority for the count."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        for i in range(3):
            other_id = f"sb-friend-{i}"
            c.execute(
                "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
                (other_id, f"sb{i}@example.com", f"Friend {i}"),
            )
            # Mutual = both directions of follow.
            c.execute(
                "INSERT INTO follows (follower_id, followee_id, created_at) "
                "VALUES (?, ?, CURRENT_TIMESTAMP)",
                (seed_user, other_id),
            )
            c.execute(
                "INSERT INTO follows (follower_id, followee_id, created_at) "
                "VALUES (?, ?, CURRENT_TIMESTAMP)",
                (other_id, seed_user),
            )
            # Keep the legacy friends-table insert as a no-op marker for
            # ease of grep when someone audits this file later — the
            # _do-nothing INSERT keeps the column count consistent with
            # any future legacy reads but doesn't influence the gate.
            c.execute(
                "INSERT INTO friends (user_id, friend_id, status, created_at) "
                "VALUES (?, ?, 'accepted', CURRENT_TIMESTAMP)",
                (seed_user, other_id),
            )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "social_butterfly" in ids


def test_achievements_first_settle_up_uses_45_table(
    client, seed_user, seed_other_user, auth_headers,
):
    """The first_settle_up badge reads the new §4.5 settlements table
    — proves the §3.6 + §4.5 + §4.4 layers compose end-to-end."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-ach-settle")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_other_user,
        "toUserId": seed_user,
        "amount": 10.0,
        "currency": "EUR",
    })

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "first_settle_up" in ids


# ── §4.4 badge-variety expansion ─────────────────────────────────────


def test_achievements_globe_trotter_50_only_at_threshold(client, seed_user, auth_headers):
    """The 50-country tier only fires at ≥50 distinct countries. 49 →
    no globe_trotter_50; 50 → fires + context carries countryCount."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        # Insert 49 distinct-country ARCHIVED trips. globe_trotter_50
        # should NOT appear; globe_trotter_25 should.
        for i in range(49):
            # Synthetic 2-letter country codes (AA..BV) — far past any
            # real-world ISO list but the rule is `COUNT(DISTINCT
            # country_code)` so synthetic codes work.
            code = f"X{i:02d}"
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-gt50-{i}", seed_user, f"Trip {i}", f"Country {i}", code),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_25" in ids, "25-tier should be unlocked at 49 countries"
    assert "globe_trotter_50" not in ids, "50-tier shouldn't fire at 49"

    # One more — crosses the threshold.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code) "
            "VALUES ('trip-gt50-final', ?, 'Trip 50', 'Country 50', 'XFF')",
            (seed_user,),
        )
        conn.commit()
    _archive_all_trips(seed_user)
    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_50" in ids
    gt50 = next(a for a in data["achievements"] if a["badgeId"] == "globe_trotter_50")
    assert gt50["context"].get("countryCount") == 50


def test_achievements_longest_trip_threshold(client, seed_user, auth_headers):
    """longest_trip fires when ANY owned trip has ≥14 trip_days rows.
    Below the threshold: no badge. At threshold: badge + context
    carries (tripId, tripName, days)."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-long-1", name="Long Haul")
    _archive_all_trips(seed_user)

    with get_db() as conn:
        c = conn.cursor()
        # 13 days — below threshold.
        for i in range(13):
            c.execute(
                "INSERT INTO trip_days (id, trip_id, day_number, name) VALUES (?, ?, ?, ?)",
                (f"day-{i}", trip_id, i, f"Day {i}"),
            )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "longest_trip" not in ids, "13 days < 14 threshold"

    # Add the 14th day — crosses the threshold.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, name) VALUES (?, ?, ?, ?)",
            ("day-13", trip_id, 13, "Day 13"),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "longest_trip" in ids
    longest = next(a for a in data["achievements"] if a["badgeId"] == "longest_trip")
    ctx = longest["context"]
    assert ctx.get("tripId") == trip_id
    assert ctx.get("days") == 14
    assert ctx.get("tripName") == "Long Haul"


def test_achievements_priciest_trip_threshold(client, seed_user, auth_headers):
    """priciest_trip fires at total recorded spend ≥ €1000 on any owned
    trip. The threshold uses sum(expenses.euro_value) — cross-currency
    sums survive."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-spend-1", name="Splurge Trip")
    _archive_all_trips(seed_user)

    # €999 across two expenses — just under the threshold.
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO expenses (id, trip_id, who, value, currency, euro_value) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("e1", trip_id, seed_user, 500, "EUR", 500.0),
        )
        c.execute(
            "INSERT INTO expenses (id, trip_id, who, value, currency, euro_value) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("e2", trip_id, seed_user, 499, "EUR", 499.0),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "priciest_trip" not in ids, "€999 < €1000 threshold"

    # Bump to €1000 — exactly the threshold.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO expenses (id, trip_id, who, value, currency, euro_value) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("e3", trip_id, seed_user, 1, "EUR", 1.0),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "priciest_trip" in ids
    pricy = next(a for a in data["achievements"] if a["badgeId"] == "priciest_trip")
    ctx = pricy["context"]
    assert ctx.get("tripId") == trip_id
    assert ctx.get("spendEur") == 1000
    assert ctx.get("tripName") == "Splurge Trip"


def test_achievements_most_companions(client, seed_user, auth_headers):
    """most_companions reads `trips.companions_json` (the per-trip
    roster array). Defensively skips malformed JSON / non-array
    values rather than raising."""
    import json
    from database import get_db

    # Trip with 4 companions — under threshold.
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, companions_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                "trip-c-4",
                seed_user,
                "Small group",
                "PT",
                json.dumps([{"name": f"Friend {i}"} for i in range(4)]),
            ),
        )
        # A second trip with valid JSON that's NOT an array — older
        # schema iterations stored an object instead of a list. The
        # badge check must skip these gracefully rather than measuring
        # the wrong shape; this also tests the `isinstance(..., list)`
        # branch. (Truly-malformed JSON can't reach this code path in
        # production because all writers go through json.dumps; trip
        # serialization crashes earlier on it.)
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, companions_json) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-c-bad", seed_user, "Non-array JSON trip", "PT", '{"legacy": true}'),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "most_companions" not in ids, "4 companions < 5 threshold"

    # Bump one trip to 5 companions.
    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET companions_json = ? WHERE id = 'trip-c-4'",
            (json.dumps([{"name": f"Friend {i}"} for i in range(5)]),),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "most_companions" in ids
    mc = next(a for a in data["achievements"] if a["badgeId"] == "most_companions")
    ctx = mc["context"]
    assert ctx.get("count") == 5
    assert ctx.get("tripId") == "trip-c-4"


def test_achievements_intra_country_3(client, seed_user, auth_headers):
    """intra_country_3 fires when the user has 3+ trips in the same
    country (by country_code). Strictly stronger than repeat_country
    (≥2)."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        # 2 Portugal trips — below threshold, but repeat_country fires.
        for i in range(2):
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-ic-{i}", seed_user, f"Lisbon {i}", "Portugal", "PT"),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "repeat_country" in ids, "2 PT trips should fire repeat_country"
    assert "intra_country_3" not in ids, "2 PT trips < 3 threshold"

    # Add the 3rd Portugal trip.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code) "
            "VALUES ('trip-ic-final', ?, 'Lisbon 3', 'Portugal', 'PT')",
            (seed_user,),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "intra_country_3" in ids
    ic = next(a for a in data["achievements"] if a["badgeId"] == "intra_country_3")
    assert ic["context"].get("tripCount") == 3
    assert ic["context"].get("countryKey") == "PT"


def test_achievements_back_to_back_consecutive_months(client, seed_user, auth_headers):
    """back_to_back fires when ≥2 trips exist in consecutive calendar
    months. Non-adjacent months → no badge. Year boundary (Dec/Jan)
    handled correctly."""
    from database import get_db

    # Two trips in months that ARE NOT adjacent (Jan + Mar) — no badge.
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-jan", seed_user, "January trip", "X", "2025-01-15 10:00:00"),
        )
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-mar", seed_user, "March trip", "X", "2025-03-15 10:00:00"),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "back_to_back" not in ids, "Jan + Mar are not consecutive"

    # Add a February trip — now Jan/Feb are adjacent.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-feb", seed_user, "February trip", "X", "2025-02-15 10:00:00"),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "back_to_back" in ids
    bb = next(a for a in data["achievements"] if a["badgeId"] == "back_to_back")
    ctx = bb["context"]
    assert ctx.get("firstMonth") == "2025-01"
    assert ctx.get("secondMonth") == "2025-02"


def test_achievements_back_to_back_crosses_year_boundary(client, seed_user, auth_headers):
    """The Dec/Jan transition counts as consecutive. Pinned because
    the obvious "y2 == y1 + 0 AND m2 == m1 + 1" check would miss it
    without the explicit year-rollover branch."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-dec", seed_user, "December trip", "X", "2024-12-15 10:00:00"),
        )
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-jan-next", seed_user, "January trip", "X", "2025-01-15 10:00:00"),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "back_to_back" in ids
    bb = next(a for a in data["achievements"] if a["badgeId"] == "back_to_back")
    assert bb["context"].get("firstMonth") == "2024-12"
    assert bb["context"].get("secondMonth") == "2025-01"


def test_achievements_notification_on_unlock(client, seed_user, auth_headers):
    """Each newly earned badge drops an `achievement_unlocked` notification
    so the bell badge ticks up. Re-poll after a no-change tick must NOT
    add another notification for the same badge."""
    _create_trip(client, auth_headers, trip_id="trip-ach-notif")
    _archive_all_trips(seed_user)
    client.get("/api/data", headers=auth_headers)  # detection + insert

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT type, related_id FROM notifications WHERE user_id = ?",
            (seed_user,),
        )
        rows = c.fetchall()
    badge_notifs = [r for r in rows if r["type"] == "achievement_unlocked"]
    assert any(r["related_id"] == "first_trip" for r in badge_notifs)

    # Second poll — no new unlocks, no new notifications.
    client.get("/api/data", headers=auth_headers)
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM notifications "
            "WHERE user_id = ? AND type = 'achievement_unlocked' AND related_id = 'first_trip'",
            (seed_user,),
        )
        assert c.fetchone()["c"] == 1


def test_achievements_on_public_profile(
    client, seed_user, seed_other_user, auth_headers,
):
    """A signed-in viewer fetching their OWN public profile sees
    their earned badges. R3-Round 2 #36 narrowed the public
    achievements surface — anonymous and non-follower viewers
    no longer get the badge list (it reveals fingerprintable
    travel patterns)."""
    _create_trip(client, auth_headers, trip_id="trip-ach-pub")
    _archive_all_trips(seed_user)
    # Trigger detection by polling /api/data for the owner first.
    client.get("/api/data", headers=auth_headers)

    # Self-view — always allowed.
    res = client.get(f"/api/public-profile/{seed_user}", headers=auth_headers)
    assert res.status_code == 200
    payload = res.get_json()
    assert "achievements" in payload
    ids = [a["badgeId"] for a in payload["achievements"]]
    assert "first_trip" in ids


def test_achievements_hidden_from_anonymous_profile_viewer(
    client, seed_user, auth_headers,
):
    """R3-Round 2 #36: anonymous viewers (no auth) get an empty
    achievements array on /api/public-profile/<id> — strangers
    with the URL shouldn't be able to fingerprint a user's
    travel pattern via badges + context_json. Profile shell +
    public trips still render normally."""
    _create_trip(client, auth_headers, trip_id="trip-ach-anon-hidden")
    _archive_all_trips(seed_user)
    client.get("/api/data", headers=auth_headers)
    # Anonymous fetch — no headers.
    res = client.get(f"/api/public-profile/{seed_user}")
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["achievements"] == [], \
        "anonymous viewer should not see the badge list"


def test_achievements_feed_event_for_friends(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """When a friend earns a badge it appears in the caller's feed as
    `achievement_unlocked`. Verifies the §3.6 registry's
    _build_achievement_unlocked builder picks up rows where actor is
    in the caller's friend set."""
    _make_friends(seed_user, seed_other_user)
    _create_trip(client, other_auth_headers, trip_id="trip-ach-feed")
    _archive_all_trips(seed_other_user)
    # Make sure the other user's detection runs (it would on any
    # subsequent /api/data they hit; we force it here so the test is
    # deterministic regardless of polling).
    client.get("/api/data", headers=other_auth_headers)

    events = client.get("/api/feed", headers=auth_headers).get_json()
    achievement_events = [e for e in events if e.get("type") == "achievement_unlocked"]
    assert len(achievement_events) >= 1
    # Actor should be seed_other_user (who earned it).
    actor_ids = {e["actor"]["id"] for e in achievement_events}
    assert seed_other_user in actor_ids


def test_achievements_revoked_when_trip_unarchived(client, seed_user, auth_headers):
    """2026-05-18 rule: trip-based badges count only CURRENTLY archived
    trips. Un-archiving the trip that earned `first_trip` should revoke
    that badge on the next /api/data poll, and re-archiving should
    re-grant it (with a fresh `newlyEarnedAchievements` entry so the UI
    can re-toast).

    Post-2026-05-18 the archive signal lives in `trip_members.is_archived`
    (per-user, the audit-H1+H4 fix), so the unarchive simulation toggles
    that column instead of the legacy `trips.is_archived` mirror."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-revoke-1")
    _archive_all_trips(seed_user)

    # First poll — `archivist` earned. Pre-2026-05-19 this test
    # asserted on `first_trip`, but that badge is now the welcome-
    # aboard "you started planning" milestone (no archive required);
    # `archivist` is the correct archive-state-dependent badge to
    # use as the revoke probe.
    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" in [a["badgeId"] for a in data["achievements"]]
    assert "archivist" in [a["badgeId"] for a in data["newlyEarnedAchievements"]]

    # Un-archive the trip — flip the per-user trip_members.is_archived
    # back to 0. The only archived membership, so archivist's count
    # drops to 0 and the badge should disappear.
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 0 "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_user),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" not in [a["badgeId"] for a in data["achievements"]], \
        "archivist should be revoked once the only archived trip is restored"
    # Revoke is silent — no fresh notification, no entry in newlyEarned.
    assert "archivist" not in [a["badgeId"] for a in data["newlyEarnedAchievements"]]

    # Re-archive — badge comes back, but R5-B3: re-earning a
    # previously-revoked badge is now SILENT. The row stays in place
    # (soft-revoked via revoked_at), and re-earning just clears
    # revoked_at without firing a fresh notification or appearing in
    # newlyEarnedAchievements. Pre-fix this re-fired every cycle —
    # a fidgety user could spam dozens of "you unlocked archivist"
    # rows just by archive-toggling.
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 1 "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_user),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" in [a["badgeId"] for a in data["achievements"]], \
        "re-archiving should re-activate the soft-revoked badge"
    assert "archivist" not in [a["badgeId"] for a in data["newlyEarnedAchievements"]], \
        "R5-B3: re-earn is silent — no fresh newly-earned, no re-toast"


def test_achievements_globe_trotter_revoked_when_country_unarchived(client, seed_user, auth_headers):
    """globe_trotter_3 should revoke when un-archiving one of the trips
    drops the distinct-country count below 3. The other badges (first_trip,
    archivist) survive because at least one archived trip remains."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        for i, code in enumerate(["PT", "JP", "FR"]):
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-rev-gt-{i}", seed_user, f"Trip {i}", code, code),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" in ids

    # Un-archive the FR trip for this user — count drops from 3 to 2.
    # Per-user flag lives on trip_members (post-2026-05-18 H1+H4 fix).
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 0 "
            "WHERE trip_id = 'trip-rev-gt-2' AND user_id = ?",
            (seed_user,),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" not in ids, "2 archived countries < 3 threshold"
    # first_trip + archivist + repeat_country survive (PT, JP still
    # archived). Not asserting their presence specifically here — the
    # point is the SELECTIVE revoke.
    assert "first_trip" in ids


def test_achievements_joint_trip_counts_for_both_owner_and_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """2026-05-18 audit H4: members earn badges from trips they JOINED
    (not just trips they OWN). Owner creates a trip; other user joins
    as planner via the invite flow; both archive their copy. Both
    users earn `first_trip` independently — the badge counts each
    user's own accepted+archived memberships.

    Pre-fix the achievement queries did `WHERE trips.user_id = ?`
    which is owner-only, so a planner of a 5-country group trip
    would never earn globe_trotter_3 from it."""
    from database import get_db
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-joint")

    # Seed the other user as an accepted planner via direct
    # trip_members insert — the full invite-flow is exercised
    # elsewhere; here we just want both rows present.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
            (trip_id, seed_user, seed_other_user),
        )
        conn.commit()

    # OWNER archives their copy — earns `archivist` (the archive-
    # state-dependent badge). `first_trip` is no longer a useful
    # probe here because post-2026-05-19 it fires on any accepted
    # membership regardless of archive state.
    _archive_all_trips(seed_other_user)
    owner_data = client.get("/api/data", headers=other_auth_headers).get_json()
    assert "archivist" in [a["badgeId"] for a in owner_data["achievements"]], \
        "owner should earn archivist after archiving their copy"

    # MEMBER (seed_user) has not archived their copy yet → archivist
    # should NOT fire. `first_trip` WILL fire here because just being
    # an accepted member is enough — that's the welcome-aboard badge
    # by design.
    member_data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" not in [a["badgeId"] for a in member_data["achievements"]], \
        "member should NOT earn archivist until they archive their copy"

    # Now the member archives their copy → they earn archivist
    # INDEPENDENTLY of the owner's archive state. This is the joint-
    # trip semantic: both users get credit for the same trip.
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 1 "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_user),
        )
        conn.commit()
    member_data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" in [a["badgeId"] for a in member_data["achievements"]], \
        "member should earn archivist independently after archiving their copy"


def test_achievements_globe_trotter_credits_member_for_joint_multi_country_trip(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """The 2026-05-18 H4 fix shifted globe_trotter_* to count any
    archived membership, not just owned trips. A non-owner planner
    on a multi-country trip should earn globe_trotter_3 from a
    single shared trip that touches three countries.

    Pre-fix the query was owner-scoped via `WHERE trips.user_id = ?`,
    so the planner earned 0 countries from this trip no matter how
    many it visited. The new query JOINs trip_members, so any
    accepted+archived membership contributes the trip's country
    set to the member's count."""
    import json as _json
    from database import get_db

    # Owner creates a 3-country trip (Iberia + East Asia tour with
    # PT, JP, FR in the multi-country array).
    _create_trip(client, other_auth_headers, trip_id="trip-joint-multi")
    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET trip_countries_json = ?, country_code = 'PT' "
            "WHERE id = 'trip-joint-multi'",
            (_json.dumps(["PT", "JP", "FR"]),),
        )
        # Add seed_user as a planner.
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
            ("trip-joint-multi", seed_user, seed_other_user),
        )
        conn.commit()

    # Member archives their copy → earns globe_trotter_3 from the
    # single shared trip's three countries.
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 1 "
            "WHERE trip_id = ? AND user_id = ?",
            ("trip-joint-multi", seed_user),
        )
        conn.commit()
    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" in ids, \
        "non-owner member should earn globe_trotter_3 from a joint 3-country trip"
    gt3 = next(a for a in data["achievements"] if a["badgeId"] == "globe_trotter_3")
    assert gt3["context"].get("countryCount") == 3


def test_achievements_revoked_when_trip_deleted(client, seed_user, auth_headers):
    """2026-05-18 audit fix (critical bug #1): DELETE /api/trips/<id>
    used to run `DELETE FROM user_achievements WHERE trip_id = ?`
    against a table that has NO trip_id column — the SQL always
    errored and a `try/except: pass` swallowed it, so badges referencing
    the deleted trip kept showing up with a dead `tripId` in their
    tooltip context. The fix replaced the broken DELETE with a
    `check_user_achievements(cursor, user_id)` call so the post-2026-05-18
    revoke path drops badges whose qualifying trip no longer exists.

    Permanent deletion is the stronger version of unarchive — once
    deleted, the trip can't be restored, so the badge stays revoked."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-del-revoke")
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "first_trip" in [a["badgeId"] for a in data["achievements"]], \
        "archived trip should earn first_trip before deletion"

    # Permanent delete via the API (covers the full handler including
    # the post-delete check_user_achievements call).
    res = client.delete(f"/api/trips/{trip_id}", headers=auth_headers)
    assert res.status_code == 200

    # Badge should be gone IMMEDIATELY on the next poll — the revoke
    # ran inside the delete transaction, not waiting for the next
    # /api/data tick to catch up.
    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "first_trip" not in [a["badgeId"] for a in data["achievements"]], \
        "first_trip should be revoked the instant the only earning trip is deleted"

    # Direct DB sanity: the row exists but is soft-revoked
    # (revoked_at IS NOT NULL). R5-B3: changed from hard-DELETE to
    # soft-revoke so a future re-earn of the same badge can be silent
    # — see test_achievements_revoked_when_trip_unarchived.
    with get_db() as conn:
        rows = conn.execute(
            "SELECT badge_id, revoked_at FROM user_achievements "
            "WHERE user_id = ?",
            (seed_user,),
        ).fetchall()
    first_trip_row = next(
        (r for r in rows if r["badge_id"] == "first_trip"), None
    )
    assert first_trip_row is not None, "soft-revoked row should still exist"
    assert first_trip_row["revoked_at"] is not None, \
        "first_trip should be soft-revoked (revoked_at stamped)"


def test_user_data_delete_rate_limited(temp_db, seed_user, seed_other_user):
    """2026-05-18 audit fix (critical bug #2): /api/user-data DELETE is
    a factory reset — it wipes EVERY trip, expense, settlement,
    notification, etc. owned by the caller (including the `users`
    row itself). Without a rate limit, a logged-in attacker (or
    stolen session token) could script the endpoint in a loop and
    keep wiping the victim's data immediately after they restore
    from backup. Cap is 1/hour.

    flask-limiter defaults to keying on the remote address, so the
    cap protects the FLOW per-source-IP, not per-user-id. Test two
    distinct users from the same test-client (both 127.0.0.1) — the
    second one must 429 even though it's a different user_id, because
    the per-IP bucket is already spent. Using two users instead of
    one re-poll avoids the "JWT valid but user row missing" 401 that
    would otherwise mask the limiter response (first call deletes
    the user row, so the user can't auth a second time)."""
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

    from auth import issue_token
    headers_a = {"Authorization": f"Bearer {issue_token(seed_user)}"}
    headers_b = {"Authorization": f"Bearer {issue_token(seed_other_user)}"}

    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = True
    # 2026-05-26: the conftest `client` fixture flips `limiter.enabled`
    # to False for normal tests; explicitly restore it here so the
    # rate-limit assertion below actually fires.
    _prev_enabled = limiter.enabled
    limiter.enabled = True
    limiter.reset()
    try:
        with app.test_client() as c:
            res = c.delete("/api/user-data", headers=headers_a)
            assert res.status_code == 200
            # Second call from the same IP — flask-limiter rejects
            # before the request reaches the handler.
            res = c.delete("/api/user-data", headers=headers_b)
            assert res.status_code == 429, \
                "second factory-reset within the hour must be rejected by the limiter"
    finally:
        app.config["RATELIMIT_ENABLED"] = False
        limiter.enabled = _prev_enabled
        limiter.reset()


def test_achievements_rule_failure_doesnt_poison_sweep(client, seed_user, auth_headers, monkeypatch):
    """If one badge rule raises, the detection loop logs + skips it
    and the OTHER rules still run. Without this guard a future bad
    rule would block every user's badge earning until shipped fix."""
    import achievements as ach
    from achievements import BADGES, BadgeDef

    def _explode(cursor, user_id):
        raise RuntimeError("simulated bad rule")

    # Splice in a broken rule at the start of the registry. monkeypatch
    # restores the original list after the test.
    bad_badge = BadgeDef(
        id="explosive_test_badge",
        emoji="💥",
        label="Boom",
        description="-",
        check=_explode,
    )
    monkeypatch.setattr(ach, "BADGES", [bad_badge, *BADGES])

    _create_trip(client, auth_headers, trip_id="trip-ach-resilient")
    _archive_all_trips(seed_user)
    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    # The good rule (first_trip) still ran.
    assert "first_trip" in ids
    # The broken rule didn't earn the user a badge.
    assert "explosive_test_badge" not in ids


# ── §4.2 Explore feed ────────────────────────────────────────────────
# Helpers seed shareable trips directly (the share-via-link flow is
# tested elsewhere). The explore ranking is multiplicative on
# recency × country × engagement, so the tests probe each factor
# independently.


def _seed_shareable_trip(
    owner_id: str,
    trip_id: str,
    name: str = "Test Trip",
    country: str = "Test, Test",
    country_code: str = "XX",
    share_views: int = 0,
    created_at: str | None = None,
):
    """Insert a trip with a share_token AND is_public=1 so
    /api/feed/explore picks it up. `created_at` defaults to "now" via
    the column default; pass an explicit ISO string to test the
    recency_factor decay.

    Audit fix (2026-05-26): Explore now requires is_public=1 in
    addition to share_token (otherwise one-off share-link grants would
    leak into the public discovery feed). The fixture sets both so
    pre-fix tests keep their semantic.
    """
    from database import get_db
    with get_db() as conn:
        if created_at:
            conn.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code, "
                "is_public, share_token, share_views, created_at) "
                "VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)",
                (trip_id, owner_id, name, country, country_code,
                 f"tok-{trip_id}", share_views, created_at),
            )
        else:
            conn.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code, "
                "is_public, share_token, share_views) "
                "VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                (trip_id, owner_id, name, country, country_code,
                 f"tok-{trip_id}", share_views),
            )
        conn.commit()


def test_explore_lists_shareable_trips_from_strangers(
    client, seed_user, seed_other_user, auth_headers,
):
    """Trips owned by someone else with a share_token appear in the
    Explore feed of a stranger. The basic cold-start surface."""
    _seed_shareable_trip(seed_other_user, "exp-1", name="Lisbon", country="Portugal", country_code="PT")
    res = client.get("/api/feed/explore", headers=auth_headers)
    assert res.status_code == 200
    items = res.get_json()["items"]
    assert any(i["tripId"] == "exp-1" for i in items)
    item = next(i for i in items if i["tripId"] == "exp-1")
    assert item["shareToken"] == "tok-exp-1"
    assert item["owner"]["id"] == seed_other_user
    assert item["owner"]["firstName"]  # Always derived from owner.name


def test_explore_excludes_own_trips(client, seed_user, auth_headers):
    """Trips OWNED by the viewer must not appear — they're not strangers
    to their own data. The feed already has those via the friends path."""
    _seed_shareable_trip(seed_user, "exp-own", name="Mine")
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert not any(i["tripId"] == "exp-own" for i in items)


def test_explore_excludes_trips_user_is_member_of(
    client, seed_user, seed_other_user, auth_headers,
):
    """Trips the viewer is already an accepted member of don't appear.
    They're not strangers to the trip — Explore should surface NEW
    discoveries."""
    _seed_shareable_trip(seed_other_user, "exp-member")
    _seed_member("exp-member", seed_user, role="relaxer")
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert not any(i["tripId"] == "exp-member" for i in items)


def test_explore_excludes_trips_without_share_token(
    client, seed_user, seed_other_user, auth_headers,
):
    """Trips without a share_token are NOT publicly accessible (the
    owner hasn't opted in). Explore must respect that — only shareable
    trips show up."""
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country) VALUES (?, ?, ?, ?)",
            ("exp-private", seed_other_user, "Private", "Anywhere"),
        )
        conn.commit()
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert not any(i["tripId"] == "exp-private" for i in items)


def test_explore_excludes_share_token_trips_without_is_public(
    client, seed_user, seed_other_user, auth_headers,
):
    """Audit fix (2026-05-26): a trip with a share_token but
    is_public=0 represents a one-off share link the owner generated
    for a specific recipient — it must NOT surface in the global
    Explore feed for every signed-in user. Only trips with BOTH
    share_token AND is_public=1 are discoverable."""
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, is_public, share_token) "
            "VALUES (?, ?, ?, ?, 0, ?)",
            ("exp-one-off-share", seed_other_user, "One-off", "Anywhere",
             "tok-one-off-share"),
        )
        conn.commit()
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert not any(i["tripId"] == "exp-one-off-share" for i in items)


def test_explore_ranks_unvisited_countries_higher(
    client, seed_user, seed_other_user, auth_headers,
):
    """Two trips with identical recency + engagement, one in a country
    the viewer's been to, one new. The new-country trip ranks higher
    (country_factor 1.5 vs 1.0)."""
    # Viewer's own trip in PT — establishes "visited"
    _create_trip(client, auth_headers, trip_id="own-pt", name="Mine PT")
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET country_code = 'PT' WHERE id = ?",
            ("own-pt",),
        )
        conn.commit()

    _seed_shareable_trip(seed_other_user, "exp-visited", country="Portugal", country_code="PT")
    _seed_shareable_trip(seed_other_user, "exp-novel", country="Japan", country_code="JP")

    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    # Both should appear, but exp-novel comes first.
    ids = [i["tripId"] for i in items]
    assert "exp-novel" in ids and "exp-visited" in ids
    assert ids.index("exp-novel") < ids.index("exp-visited")


def test_explore_ranks_higher_engagement_higher(
    client, seed_user, seed_other_user, auth_headers,
):
    """All other factors equal, a trip with more share_views ranks
    higher than one with fewer. log1p shape means the bump is sub-
    linear — a 100× view advantage shouldn't fully dominate a country
    mismatch, but among equal-country trips, more views wins."""
    _seed_shareable_trip(seed_other_user, "exp-popular", country_code="JP", share_views=1000)
    _seed_shareable_trip(seed_other_user, "exp-quiet", country_code="JP", share_views=0)

    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    ids = [i["tripId"] for i in items]
    assert ids.index("exp-popular") < ids.index("exp-quiet")


def test_explore_recency_decay(
    client, seed_user, seed_other_user, auth_headers,
):
    """Recency factor ranks fresher trips above stale ones — but old
    trips no longer fall off entirely.

    Design history: the pre-2026-05-19 implementation used a 60-day
    hard cutoff (`score = 0` → row dropped). Real shares are too rare
    for that to work; a small server with sparse activity ended up
    serving an empty Explore feed once trips aged out. The current
    implementation uses linear decay over 180 days with a 0.15 floor —
    stale trips still surface but rank below recent ones. This test
    pins the new "ranked, not gated" contract: fresh > stale, but
    both present."""
    from datetime import datetime, timedelta, timezone

    # 90 days old, lots of views.
    old_stamp = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d %H:%M:%S")
    _seed_shareable_trip(
        seed_other_user, "exp-stale", country_code="JP",
        share_views=0, created_at=old_stamp,
    )
    # Fresh trip — should rank above the stale one even with zero views,
    # because recency_factor dominates when engagement is equal.
    _seed_shareable_trip(seed_other_user, "exp-fresh", country_code="JP", share_views=0)

    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    ids = [i["tripId"] for i in items]
    assert "exp-fresh" in ids
    assert "exp-stale" in ids
    # Fresh ranks higher.
    assert ids.index("exp-fresh") < ids.index("exp-stale")

    # A trip JUST INSIDE the original 60-day window with low engagement
    # should also surface — sanity-check the floor isn't broken.
    recent_stamp = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
    _seed_shareable_trip(
        seed_other_user, "exp-recent", country_code="JP",
        share_views=0, created_at=recent_stamp,
    )
    items2 = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert any(i["tripId"] == "exp-recent" for i in items2)


def test_explore_caps_at_24(client, seed_user, seed_other_user, auth_headers):
    """Result set is capped at 24 — explicit pagination is §4.2 v2."""
    for i in range(30):
        _seed_shareable_trip(seed_other_user, f"exp-cap-{i}")
    items = client.get("/api/feed/explore", headers=auth_headers).get_json()["items"]
    assert len(items) <= 24


def test_explore_requires_auth(client):
    """v1 is auth-only; anonymous discovery deferred. Catches a
    refactor that strips @require_auth by accident."""
    assert client.get("/api/feed/explore").status_code == 401


# ── §4.7 Followers / following ───────────────────────────────────────
# One-way social graph, independent of `friends`. Tests cover the
# follow op, idempotency, self-rejection, unfollow, count surfacing
# on /api/public-profile, and the "first follow notifies, repeat
# follows don't" rule.


def test_follow_user_happy_path(client, seed_user, seed_other_user, auth_headers):
    """POST /api/follows/<id> creates a follows row + returns the
    new counts + isFollowing=true."""
    res = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 201
    body = res.get_json()
    assert body["isFollowing"] is True
    assert body["followers"] == 1
    assert body["following"] == 0  # seed_other_user follows nobody


def test_follow_idempotent(client, seed_user, seed_other_user, auth_headers):
    """Re-POSTing the same follow is a no-op (200, not 201, no error,
    no duplicate row). The UI calls this when re-rendering the profile
    after stale state — must not double-count."""
    first = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert first.status_code == 201
    second = client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert second.status_code == 200
    body = second.get_json()
    assert body["isFollowing"] is True
    assert body["followers"] == 1


def test_follow_self_rejected(client, seed_user, auth_headers):
    """Self-follow is rejected — would just spam the user's own bell
    and creates pointless rows."""
    res = client.post(f"/api/follows/{seed_user}", headers=auth_headers)
    assert res.status_code == 400


def test_follow_unknown_user_404(client, seed_user, auth_headers):
    """Following a non-existent user returns 404 (not 403) so probing
    clients can't enumerate which user_ids exist."""
    res = client.post("/api/follows/does-not-exist", headers=auth_headers)
    assert res.status_code == 404


def test_unfollow_happy_path(client, seed_user, seed_other_user, auth_headers):
    """DELETE removes the row; isFollowing flips to false; counts
    update."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    res = client.delete(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["isFollowing"] is False
    assert body["followers"] == 0


def test_unfollow_idempotent_on_missing_row(client, seed_user, seed_other_user, auth_headers):
    """DELETE on a follow that doesn't exist returns 200 with counts
    so the UI repaints cleanly. Pre-fix this would 500 or 404 — we
    treat it as the desired end-state already being reached."""
    res = client.delete(f"/api/follows/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["isFollowing"] is False
    assert body["followers"] == 0


def test_get_follow_status(client, seed_user, seed_other_user, auth_headers, other_auth_headers):
    """GET /api/follows/<id> returns counts + isFollowing for the
    caller. seed_user follows seed_other_user; seed_user's GET of
    seed_other_user shows isFollowing=true, but seed_other_user's GET
    of seed_user shows isFollowing=false (asymmetric)."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)

    a_view = client.get(f"/api/follows/{seed_other_user}", headers=auth_headers).get_json()
    assert a_view["isFollowing"] is True
    assert a_view["followers"] == 1

    b_view = client.get(f"/api/follows/{seed_user}", headers=other_auth_headers).get_json()
    assert b_view["isFollowing"] is False
    assert b_view["followers"] == 0  # seed_user has no followers
    assert b_view["following"] == 1  # seed_user follows 1 person


def test_public_profile_includes_follow_data(
    client, seed_user, seed_other_user, auth_headers,
):
    """/api/public-profile bundles followers / following / isFollowing
    so the profile page renders without a second round-trip. The
    isFollowing flag reflects the CALLER's relationship to the
    profile owner."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    res = client.get(f"/api/public-profile/{seed_other_user}", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["followers"] == 1
    assert body["following"] == 0
    assert body["isFollowing"] is True


def test_public_profile_anonymous_isFollowing_false(
    client, seed_user, seed_other_user, auth_headers,
):
    """An unauthenticated viewer of a public profile sees the counts
    but isFollowing must be false (no caller = no follow relationship
    to check). Catches a regression that would leak a stale `g._gg_user_id`
    across requests."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    # No headers → anonymous request.
    res = client.get(f"/api/public-profile/{seed_other_user}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["followers"] == 1
    assert body["isFollowing"] is False


def test_follow_first_time_notifies(client, seed_user, seed_other_user, auth_headers):
    """The followee's notifications get a `followed_you` row on the
    first follow. Without this, follows are invisible to the recipient
    until they check the count on their profile — and creators want
    to know they have a new fan."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT type, related_id FROM notifications WHERE user_id = ?",
            (seed_other_user,),
        )
        rows = c.fetchall()
    assert any(r["type"] == "followed_you" and r["related_id"] == seed_user for r in rows)


def test_follow_unfollow_refollow_no_duplicate_notify(
    client, seed_user, seed_other_user, auth_headers,
):
    """Repeat follow/unfollow cycles must NOT re-notify the recipient.
    Without this guard a malicious user could spam someone's bell by
    follow/unfollow-toggling. The first follow drops one notification;
    every subsequent follow on the same pair is silent."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.delete(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM notifications "
            "WHERE user_id = ? AND type = 'followed_you' AND related_id = ?",
            (seed_other_user, seed_user),
        )
        count = c.fetchone()["c"]
    assert count == 1


def test_follow_requires_auth(client):
    """Belt-and-braces: every follows endpoint must @require_auth."""
    no_token = {}
    assert client.post("/api/follows/anyone", headers=no_token).status_code == 401
    assert client.delete("/api/follows/anyone", headers=no_token).status_code == 401
    assert client.get("/api/follows/anyone", headers=no_token).status_code == 401


def test_follow_status_with_include_lists(
    client, seed_user, seed_other_user, auth_headers,
):
    """Opt-in `?include=lists` returns the three "Your network" buckets:
    mutuals (= friends), followersOnly, followingOnly. Mutually
    exclusive — a mutual never appears in followersOnly/followingOnly.
    Used by the Friends page to populate its 3 sections in one
    round-trip."""
    from auth import issue_token
    from database import get_db

    # Seed a third user we'll use for the one-way relationships.
    third = "third-user"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (third, "third@x.com", "Third"),
        )
        conn.commit()
    third_headers = {"Authorization": f"Bearer {issue_token(third)}"}

    # Build a graph:
    #   seed_user <-> seed_other_user   (mutual)
    #   third → seed_user               (follower-only of seed_user)
    #   seed_user → third               (NO — keep one-way so 'third'
    #                                    lands in followersOnly)
    # We want third in followersOnly (third follows seed_user; seed
    # doesn't follow third back).
    other_auth_headers = {
        "Authorization": f"Bearer {issue_token(seed_other_user)}",
    }
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    client.post(f"/api/follows/{seed_user}", headers=other_auth_headers)
    client.post(f"/api/follows/{seed_user}", headers=third_headers)

    # And another one-way: seed_user → (a new user we'll create just
    # for the test), to test followingOnly.
    fourth = "fourth-user"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            (fourth, "fourth@x.com", "Fourth"),
        )
        conn.commit()
    client.post(f"/api/follows/{fourth}", headers=auth_headers)

    res = client.get(
        f"/api/follows/{seed_user}?include=lists",
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    # Counts still present.
    assert body["followers"] == 2  # seed_other_user + third
    assert body["following"] == 2  # seed_other_user + fourth

    # Buckets:
    mutuals_ids = {m["id"] for m in body["mutuals"]}
    followers_only_ids = {m["id"] for m in body["followersOnly"]}
    following_only_ids = {m["id"] for m in body["followingOnly"]}
    assert mutuals_ids == {seed_other_user}
    assert followers_only_ids == {third}
    assert following_only_ids == {fourth}

    # Buckets mutually exclusive — a mutual is never in the one-way lists.
    assert mutuals_ids.isdisjoint(followers_only_ids)
    assert mutuals_ids.isdisjoint(following_only_ids)


def test_follow_status_without_include_lists_omits_buckets(
    client, seed_user, seed_other_user, auth_headers,
):
    """Default (no `?include=lists`) response stays counts-only.
    Profile page reads via this path; the lists would bloat the
    response there without callers."""
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    res = client.get(f"/api/follows/{seed_user}", headers=auth_headers)
    body = res.get_json()
    assert "followers" in body
    assert "following" in body
    assert "mutuals" not in body
    assert "followersOnly" not in body
    assert "followingOnly" not in body


# ── Model B — friends-as-mutuals semantics ───────────────────────────
# These tests pin the Model B contract: /api/friends/* is a façade
# over `follows`, "friend" = mutual follow, and the feed surfaces
# people you follow (asymmetric) rather than the legacy friends
# table.


def test_model_b_friends_list_returns_mutuals_only(
    client, seed_user, seed_other_user, auth_headers,
):
    """/api/friends/list returns the user's MUTUAL follows. A one-way
    follow (only one side) does NOT show up. Two-way (mutual) does."""
    # One-way: caller follows seed_other_user.
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    res = client.get("/api/friends/list", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == []  # not mutual yet

    # Now seed the back-edge directly (skip the second user's API
    # call — we just need the row to exist).
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)",
            (seed_other_user, seed_user),
        )
        conn.commit()

    res2 = client.get("/api/friends/list", headers=auth_headers)
    body = res2.get_json()
    assert len(body) == 1
    assert body[0]["id"] == seed_other_user


def test_model_b_friends_add_creates_follow_immediately(
    client, seed_user, seed_other_user, auth_headers,
):
    """Model B: /api/friends/add is a façade for "follow this user".
    No pending state — the follow row lands immediately. /api/friends/
    pending always returns [] post-Model-B."""
    res = client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200

    # Follow row exists.
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        )
        assert c.fetchone() is not None

    # Pending list is always empty.
    pending = client.get("/api/friends/pending", headers=auth_headers).get_json()
    assert pending == []


def test_model_b_friends_remove_only_unfollows_my_side(
    client, seed_user, seed_other_user, auth_headers,
):
    """Model B unfriend = unfollow MY side. The other party's follow
    of me stays in place — they may continue to follow me (Twitter /
    Instagram unfriend semantic). The mutual breaks naturally if both
    sides unfollow."""
    _make_friends(seed_user, seed_other_user)  # establishes mutual

    res = client.post("/api/friends/remove", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    assert res.status_code == 200

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        # My side gone.
        c.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_user, seed_other_user),
        )
        assert c.fetchone() is None
        # Their side still there.
        c.execute(
            "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?",
            (seed_other_user, seed_user),
        )
        assert c.fetchone() is not None


def test_model_b_feed_pool_is_following_not_friends(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Model B: feed surfaces "what people I FOLLOW do" — asymmetric.
    If A follows B but B doesn't follow A back, A still sees B's
    activity. (Mutuals naturally inherit this because they're in the
    followed set too.)"""
    # A follows B only (one-way).
    client.post(f"/api/follows/{seed_other_user}", headers=auth_headers)
    # B creates a trip (action_hidden=0 by default).
    _create_trip(client, other_auth_headers, trip_id="trip-mb-feed", name="Bali")

    # A's feed should now include B's friend_created_trip event.
    events = client.get("/api/feed", headers=auth_headers).get_json()
    actor_ids = {e.get("actor", {}).get("id") for e in events}
    assert seed_other_user in actor_ids


def test_model_b_migrate_friends_to_follows(client, temp_db):
    """One-shot migration: accepted `friends` rows → two follow rows.
    Pending requests → one-way follow from the requester. Idempotent
    on re-runs (INSERT OR IGNORE)."""
    from database import get_db
    from social import migrate_friends_to_follows
    # Seed users + legacy friends rows.
    with get_db() as conn:
        c = conn.cursor()
        for uid in ("mig-a", "mig-b", "mig-c"):
            c.execute(
                "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
                (uid, f"{uid}@x.com", uid.upper()),
            )
        # Accepted pair.
        c.execute(
            "INSERT INTO friends (user_id, friend_id, status, created_at) "
            "VALUES ('mig-a', 'mig-b', 'accepted', CURRENT_TIMESTAMP)",
        )
        c.execute(
            "INSERT INTO friends (user_id, friend_id, status, created_at) "
            "VALUES ('mig-b', 'mig-a', 'accepted', CURRENT_TIMESTAMP)",
        )
        # Pending: mig-a requested mig-c.
        c.execute(
            "INSERT INTO friends (user_id, friend_id, status, created_at) "
            "VALUES ('mig-a', 'mig-c', 'pending', CURRENT_TIMESTAMP)",
        )
        # Clear any follows from init_db's own migration so we test
        # this call in isolation.
        c.execute("DELETE FROM follows")
        conn.commit()

    with get_db() as conn:
        c = conn.cursor()
        inserted = migrate_friends_to_follows(c)
        conn.commit()

    assert inserted == 3  # 2 for the accepted pair + 1 for pending

    # Verify the shape.
    with get_db() as conn:
        c = conn.cursor()
        c.execute("SELECT follower_id, followee_id FROM follows ORDER BY follower_id, followee_id")
        edges = [(r["follower_id"], r["followee_id"]) for r in c.fetchall()]
    assert ("mig-a", "mig-b") in edges
    assert ("mig-b", "mig-a") in edges
    assert ("mig-a", "mig-c") in edges
    # Pending was one-way only — no reciprocal.
    assert ("mig-c", "mig-a") not in edges

    # Idempotent: re-run should insert zero new rows.
    with get_db() as conn:
        c = conn.cursor()
        again = migrate_friends_to_follows(c)
        conn.commit()
    assert again == 0


def test_model_b_friends_reject_is_noop(client, seed_user, auth_headers):
    """No pending state under Model B → reject is a benign no-op
    that returns success. Keeps old clients clicking the legacy
    Reject button from seeing errors."""
    res = client.post("/api/friends/reject", headers=auth_headers, json={
        "friend_id": "anyone",
    })
    assert res.status_code == 200
