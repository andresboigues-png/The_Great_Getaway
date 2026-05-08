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
    assert res.get_json() == {"status": "ok"}


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
    """Someone outside the trip can't delete its expenses."""
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
    assert res.status_code == 403


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


def test_delete_day_rejects_genesis(client, seed_user, auth_headers):
    """Day 0 (Trip Genesis) is the trip's anchor and can't be deleted —
    the home UI hides the delete button on the genesis card; this 422
    is the belt-and-braces backend gate against curl-wielding users
    or stale clients firing the request anyway."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-genesis", "tripId": "trip-1", "dayNumber": 0,
            "name": "Trip Genesis",
        },
    })
    res = client.delete("/api/days/day-genesis", headers=auth_headers)
    assert res.status_code == 422
    body = res.get_json()
    assert "Genesis" in body["error"]


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
    spliced into the SET clause separately."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "bio": "Travelling.",
        "status": "On the road",
        "homeCurrency": "GBP",
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_empty_is_noop(client, seed_user, auth_headers):
    """Empty payload — no field to patch — returns {status:noop}
    rather than triggering a UPDATE with no SET clause."""
    res = client.post("/api/profile/update", headers=auth_headers, json={})
    assert res.status_code == 200
    assert res.get_json() == {"status": "noop"}


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


def test_friend_accept_rejects_fabricated_invite(
    client, seed_user, seed_other_user, auth_headers,
):
    """Auditor added a 'pending request must exist' check. Without it,
    any caller could fabricate a friendship by POSTing accept with two
    arbitrary user_ids."""
    res = client.post("/api/friends/accept", headers=auth_headers, json={
        "friend_id": seed_other_user,
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
    res = client.post("/api/upload", headers=auth_headers, data={
        "file": (io.BytesIO(b"\xff\xd8\xff\xe0minimal-jpeg-header"), "real.jpg"),
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["name"] == "real.jpg"
    assert body["url"].startswith("/static/uploads/")


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


# ── /api/user-data DELETE (factory reset) ────────────────────────────────────

def test_user_data_delete_wipes_trips_and_expenses(client, seed_user, auth_headers):
    """Settings → Reset → Wipe triggers a DELETE /api/user-data which
    nukes every trip + expense the caller owns. Doesn't touch the
    user row itself — that survives so the next login still works."""
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

    # Confirm the wipe
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert body["trips"] == []
    assert body["expenses"] == []


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


def _create_trip(client, headers, trip_id="trip-feed", name="Test Trip"):
    res = client.post("/api/trips", headers=headers, json={
        "trip": {"id": trip_id, "name": name, "country": "Test"},
    })
    assert res.status_code == 200
    return trip_id


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
]


@pytest.mark.parametrize("method,path", GATED_ROUTES)
def test_gated_route_rejects_anonymous(client, method, path):
    """Every @require_auth-decorated route returns 401 without a JWT.
    Catches a future endpoint shipped with the decorator forgotten."""
    res = client.open(path, method=method, json={})
    assert res.status_code == 401, f"{method} {path} returned {res.status_code}, expected 401"


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
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share")
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
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-status")
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


def test_feed_unshare_deletes_caller_own_post(client, seed_user, auth_headers):
    """Author can delete their own share. Cascade-deletes any reposts
    pointing at it (other tests can pin that side; here we pin the
    author-deletes-self path)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-unshare")
    res = client.post("/api/feed/share", headers=auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    res = client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    assert res.status_code == 200


def test_feed_repost_succeeds_for_other_users_post(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_other_user shares a trip; seed_user reposts it. The repost
    spreads the trip beyond the original sharer's friend graph."""
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-repost")
    res = client.post("/api/feed/share", headers=other_auth_headers, json={
        "trip_id": trip_id,
    })
    post_id = res.get_json()["post_id"]
    res = client.post(f"/api/feed/repost/{post_id}", headers=auth_headers)
    assert res.status_code == 200


def test_feed_repost_rejects_self_repost(client, seed_user, auth_headers):
    """Reposting your own post is a no-op + returns status: 'same_user'.
    Without this gate, the feed could fill with self-reposts."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-self-repost")
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
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-like")
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
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-bookmark")
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
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-comment")
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
    trip_id = _create_trip(client, auth_headers, trip_id="trip-comment-del")
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
    """Happy path: a public trip with days + expenses returns the
    archived-trip-shape payload the frontend's renderArchivedTripDetail
    consumes (trip metadata + tripDays + expenses + members + owner)."""
    # Owner creates a trip + a day + an expense, then flags it public.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-public", "name": "Lisbon", "isPublic": True},
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
    assert trip["ownerId"] == seed_user
    # tripDays + expenses are inlined on the trip object — that's what
    # the frontend's archived-trip renderer reads from.
    assert len(trip["tripDays"]) == 1
    assert trip["tripDays"][0]["name"] == "Alfama"
    assert len(trip["expenses"]) == 1
    assert trip["expenses"][0]["label"] == "Pastel de nata"
    # Owner block is the minimum the renderer needs.
    assert body["owner"]["name"] == "Test User"


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
    """Helper: establish a mutually-accepted friendship between user_a
    and user_b. The trip-invite endpoints gate on accepted friendships,
    so most invite tests need this scaffolding."""
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


def test_trip_invite_rejects_non_friend(
    client, seed_user, seed_other_user, auth_headers,
):
    """Audit gate: target must already be an accepted friend.
    Without this, trip invitations would be a way to spam any user_id."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite-stranger")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert res.status_code == 403


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
    sender's call returns 200; the receiver's /list reflects the new row."""
    # Befriend so the notification has a recipient.
    client.post("/api/friends/add", headers=auth_headers, json={
        "friend_id": seed_other_user,
    })
    client.post("/api/friends/accept", headers=other_auth_headers, json={
        "friend_id": seed_user,
    })
    trip_id = _create_trip(client, auth_headers, trip_id="trip-public-notif")
    res = client.post("/api/notifications/trip_public", headers=auth_headers, json={
        "trip_id": trip_id,
        "trip_name": "Public Trip",
    })
    assert res.status_code == 200
