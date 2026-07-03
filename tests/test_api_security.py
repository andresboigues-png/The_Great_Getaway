"""GG API tests — Auth, session, CSRF/CSP, config, health, main routes, rate-limit + helper-unit tests.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""


import sys

import pytest


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
    # R11-B1: gates that were never covered by the parametrized sweep.
    ("POST", "/api/trips/trip-x/pdf"),
    ("POST", "/api/blocks/test-other"),
    ("DELETE", "/api/blocks/test-other"),
    ("GET", "/api/blocks"),
    ("GET", "/api/auth/sessions"),
    ("DELETE", "/api/auth/sessions/1"),
    # R11-B6: comment PATCH was missing from the gate sweep — the only
    # mutating /api/feed/comment surface covered was DELETE pre-fix.
    ("PATCH", "/api/feed/comment/1"),
    # R11-B2-followup Phase 1A: per-trip heavy-JSON fetch.
    ("GET", "/api/trips/trip-x/media"),
    # R12-B4: per-trip heavy-JSON write path.
    ("POST", "/api/trips/trip-x/media"),
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


def test_csrf_origin_mismatch_blocks_cookie_request(client, seed_user):
    """Audit fix (2026-05-27): a cookie-authenticated POST whose
    Origin header points at a different host MUST be rejected (403)
    even if the cookie is valid. This is the CSRF defense-in-depth
    on top of SameSite=Lax."""
    # Seed a session cookie so the request is "cookie-authenticated".
    from auth import AUTH_COOKIE_NAME, issue_token
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
    from auth import AUTH_COOKIE_NAME, issue_token
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


def test_auth_google_real_path_thin_profile_no_name_or_picture(client, monkeypatch):
    """Regression: a Google ID token may omit the OPTIONAL `name` /
    `picture` claims (brand-new account, minimal/Workspace profile, or a
    grant without full profile scope). The handler previously read them
    via `idinfo['name']` / `idinfo['picture']`, so a thin token raised
    KeyError → unhandled 500 on a first-time login (the symptom: a new
    user 'can't log in, Internal Server Error'). The handler now uses
    `.get()` with empty-string fallbacks, so this logs in cleanly."""
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "client-id-test")
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)

    def fake_verify(token, request, client_id):
        # No `name`, no `picture` — only the guaranteed claims.
        return {
            "sub": "thin-uid-999",
            "email": "thin@example.com",
            "email_verified": True,
        }

    import routes.auth
    monkeypatch.setattr(routes.auth.id_token, "verify_oauth2_token", fake_verify)

    res = client.post("/api/auth/google", json={"token": "thin.google.token"})
    assert res.status_code == 200  # was 500 before the .get() hardening
    body = res.get_json()
    assert body["status"] == "success"
    assert body["user"]["id"] == "thin-uid-999"
    assert body["user"]["name"] == ""
    assert body["user"]["picture"] == ""


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


def test_healthz_returns_ok_envelope(client):
    """R9-F4: /healthz is the public liveness probe for uptime
    monitors (UptimeRobot, Better Uptime, etc). Returns 200 + JSON
    when the app is alive and DB responds. Pins:
      - 200 status (NOT redirect, NOT 401 — no auth)
      - JSON envelope with `status: "ok"` on a healthy DB
      - includes `release` (best-effort SHA) + `alembicHead`
      - no sensitive info leaked (envs, paths, user counts)
    """
    res = client.get("/healthz")
    assert res.status_code == 200, \
        "healthz must be unauthenticated and return 200 when DB is reachable"
    body = res.get_json()
    assert isinstance(body, dict), "envelope, not bare value"
    assert body["status"] == "ok"
    # These keys must be present (values may be None / unknown);
    # the monitor needs to know its schema is stable.
    assert "release" in body
    assert "alembicHead" in body
    # R12-B1: write-capability probe. On a healthy (writable) test DB
    # both legs must be True and the overall status "ok". A SELECT-only
    # ping returned 200 on a read-only DB pre-fix; now dbWrite catches
    # that case (BEGIN IMMEDIATE fails on a read-only mount).
    assert body["dbRead"] is True
    assert body["dbWrite"] is True
    # Defensive: confirm we didn't accidentally leak any secret-
    # shaped key. Whitelist the response shape — anything else is
    # a regression that needs a human review.
    extra_keys = set(body.keys()) - {
        "status", "release", "alembicHead", "dbRead", "dbWrite",
    }
    assert not extra_keys, (
        f"healthz response shape drifted; extra keys {extra_keys}. "
        "If you're adding fields, double-check none of them carry "
        "sensitive info (this endpoint is public)."
    )


def test_csp_report_accepts_post_and_is_csrf_exempt(client):
    """R12-B1: the CSP violation sink must accept an uncredentialed,
    cross-origin POST (browsers send reports without a same-origin
    Origin/Referer) and return 204. Confirms the route is on the
    CSRF-exempt list — otherwise the same-origin gate would 403 every
    report and the directive would be useless."""
    res = client.post(
        "/api/csp-report",
        data='{"csp-report":{"violated-directive":"script-src",'
             '"blocked-uri":"https://evil.example/x.js"}}',
        content_type="application/csp-report",
        # Deliberately NO Origin/Referer — mimics the browser's report
        # POST. If the CSRF gate weren't exempting this path, we'd 403.
    )
    assert res.status_code == 204
    assert res.get_data(as_text=True) == ""


def test_csp_report_truncates_oversized_body(client):
    """R12-B1: an oversized report body must not crash the sink or get
    logged in full (log-spam DoS guard). Still returns 204 — the
    endpoint never 500s regardless of input."""
    huge = '{"csp-report":{"blocked-uri":"' + ("A" * 10000) + '"}}'
    res = client.post(
        "/api/csp-report", data=huge, content_type="application/csp-report",
    )
    assert res.status_code == 204


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


# ── R11-B1: /api/auth/sessions list + revoke ───────────────────────────────
# Per-device session management. R11 P0 — entire feature uncovered.

def test_list_sessions_returns_current_session(client, seed_user, auth_headers):
    """After login (auth_headers → issue_token → _create_session),
    /api/auth/sessions returns the freshly-minted session with
    isCurrent:true."""
    res = client.get("/api/auth/sessions", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert "sessions" in body
    sessions = body["sessions"]
    assert len(sessions) >= 1, "expected at least one session for the caller"
    current = [s for s in sessions if s.get("isCurrent")]
    assert len(current) == 1, (
        "exactly one session must be flagged isCurrent for the caller's own jti"
    )


def test_revoke_own_session_invalidates_token(client, seed_user, auth_headers):
    """Revoke the current session → next API call with the same token
    returns 401. R7 audit's revoke contract — pre-fix users had no way
    to kick a single device without invalidating every JWT."""
    # Find the current session id.
    listing = client.get("/api/auth/sessions", headers=auth_headers).get_json()
    current = next(s for s in listing["sessions"] if s.get("isCurrent"))
    sid = current["id"]
    # Revoke.
    revoke = client.delete(
        f"/api/auth/sessions/{sid}", headers=auth_headers,
    )
    assert revoke.status_code == 200
    # Same token should now be rejected.
    after = client.get("/api/data", headers=auth_headers)
    assert after.status_code == 401, (
        "JWT for a revoked session must be rejected on next request"
    )


def test_revoke_session_other_users_session_is_noop(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """User A revokes a session id that belongs to user B. The route's
    SQL gates on `user_id = ?`, so the revoke is a no-op and user B's
    token still works. Pre-add this could have been a cross-user kick
    primitive — pin the gate."""
    # Find user B's session id.
    b_listing = client.get(
        "/api/auth/sessions", headers=other_auth_headers,
    ).get_json()
    b_current = next(s for s in b_listing["sessions"] if s.get("isCurrent"))
    b_sid = b_current["id"]
    # User A tries to revoke B's session.
    a_revoke = client.delete(
        f"/api/auth/sessions/{b_sid}", headers=auth_headers,
    )
    # Route always 200s (idempotent), but B's token must still work.
    assert a_revoke.status_code == 200
    b_after = client.get("/api/data", headers=other_auth_headers)
    assert b_after.status_code == 200, (
        "cross-user session revoke must be a no-op for the victim"
    )


def test_list_sessions_excludes_expired_jwt_rows(client, seed_user, auth_headers):
    """Audit MK5 BUG-022: sessions whose 30-day JWT has expired must NOT appear
    in the Sessions list — they can't authenticate, so listing them as 'active
    devices' is misleading (and the table grew one row per login forever)."""
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO auth_sessions (user_id, jti, device_label, created_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (seed_user, "jti-fresh-022", "Fresh device"),
        )
        conn.execute(
            "INSERT INTO auth_sessions (user_id, jti, device_label, created_at) "
            "VALUES (?, ?, ?, datetime('now', '-40 days'))",
            (seed_user, "jti-old-022", "Old device"),
        )
        conn.commit()
    res = client.get("/api/auth/sessions", headers=auth_headers)
    assert res.status_code == 200, res.get_data(as_text=True)
    labels = {s.get("deviceLabel") for s in res.get_json()["sessions"]}
    assert "Fresh device" in labels, "a recent session must be listed"
    assert "Old device" not in labels, "an expired (>30d) session must be hidden (BUG-022)"


def test_auth_google_relogin_preserves_custom_avatar(client, monkeypatch):
    """MK6 P3: a Google re-login must NOT clobber a custom uploaded profile
    picture. /api/profile/update persists a /static/uploads/<uid>/... URL; a
    bare picture=excluded.picture reset it to the Google lh3 URL every login."""
    monkeypatch.setenv("CLIENT_ID_GOOGLE_AUTH", "client-id-test")
    monkeypatch.delenv("GG_ALLOW_TEST_LOGIN", raising=False)
    fake_idinfo = {
        "sub": "avatar-uid", "email": "av@example.com", "email_verified": True,
        "name": "Av", "picture": "https://lh3.googleusercontent.com/orig.jpg",
    }
    import routes.auth
    monkeypatch.setattr(routes.auth.id_token, "verify_oauth2_token",
                        lambda *a, **k: fake_idinfo)

    r1 = client.post("/api/auth/google", json={"token": "valid.google.token"})
    assert r1.status_code == 200
    assert r1.get_json()["user"]["picture"] == "https://lh3.googleusercontent.com/orig.jpg"

    from database import get_db
    with get_db() as conn:
        conn.execute("UPDATE users SET picture = ? WHERE id = ?",
                     ("/static/uploads/avatar-uid/me.jpg", "avatar-uid"))
        conn.commit()

    r2 = client.post("/api/auth/google", json={"token": "valid.google.token"})
    assert r2.status_code == 200
    with get_db() as conn:
        pic = conn.execute("SELECT picture FROM users WHERE id = ?", ("avatar-uid",)).fetchone()[0]
    assert pic == "/static/uploads/avatar-uid/me.jpg", \
        "Google re-login clobbered the user's custom uploaded avatar"
