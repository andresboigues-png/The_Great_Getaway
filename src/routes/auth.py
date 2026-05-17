"""Auth routes — /api/user-status (boot probe) + /api/auth/google
(Google ID-token verify + session mint).

The /api/auth/google handler grew a test-mode bypass: when
GG_ALLOW_TEST_LOGIN=1 (set by playwright.config.js's webServer block,
never in production), it accepts tokens shaped `test:<user_id>` and
mints a session without going through Google. The env-gate is the
only check — any deploy that doesn't set the var refuses test-login
bodies entirely.
"""

import logging
import os

from flask import Blueprint, jsonify, make_response, request
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from auth import (
    bump_user_jti,
    clear_auth_cookie,
    current_user_id,
    issue_token,
    require_auth,
    set_auth_cookie,
)
from database import get_db, retry_on_lock
from extensions import limiter


logger = logging.getLogger(__name__)
bp = Blueprint("auth", __name__)


@bp.route("/api/user-status")
def user_status():
    """Probe endpoint for the frontend to check whether the stored JWT
    is still valid on app boot. Returns the user info if so, or
    `{logged_in: false}` otherwise. Does NOT 401 — the frontend uses
    this to decide whether to render the login wall, not as a gate."""
    user_id = current_user_id()
    if not user_id:
        return jsonify({"logged_in": False})
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, email, name, picture, bio, status, home_currency, home_country, language FROM users WHERE id = ?",
            (user_id,),
        )
        row = cursor.fetchone()
    if not row:
        # Token is valid but user was deleted — treat as logged out.
        return jsonify({"logged_in": False})
    return jsonify({
        "logged_in": True,
        "user": {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "picture": row["picture"],
            "bio": row["bio"] or "",
            "status": row["status"] or "",
            "homeCurrency": row["home_currency"],
            "homeCountry": row["home_country"],
            # i18n session 3 — null for users who never set a preference;
            # the frontend then derives from navigator.language via
            # detectBrowserLocale (i18n.ts).
            "language": row["language"],
        },
    })


@bp.route("/api/auth/google", methods=["POST"])
@limiter.limit("10 per minute")
@retry_on_lock()
def google_auth():
    """Verify Google ID Token and manage user session."""
    # Support both 'token' and 'credential' keys
    # §2.3 — guard against a non-JSON body (curl with no
    # Content-Type, malformed POST). request.json returns None in
    # that case and `.get(...)` would AttributeError.
    body = request.json or {}
    token = body.get("token") or body.get("credential")
    client_id = os.getenv("CLIENT_ID_GOOGLE_AUTH")

    # ── Test-mode bypass ──────────────────────────────────────────────
    # When GG_ALLOW_TEST_LOGIN=1 (set by the Playwright test runner,
    # never in production), accept tokens shaped `test:<user_id>` and
    # mint a session for them without going through Google. The user
    # row is upserted on first use so /api/data and friends don't 404
    # for the test identity.
    #
    # The env-gate is the ONLY check here — any deploy that doesn't
    # set the var refuses test-login bodies entirely.
    if (
        os.getenv("GG_ALLOW_TEST_LOGIN") == "1"
        and isinstance(token, str)
        and token.startswith("test:")
    ):
        user_id = token[len("test:"):] or "test-user-1"
        email = f"{user_id}@test.local"
        name = body.get("name") or "Test User"
        picture = ""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO users (id, email, name, picture)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name
                """,
                (user_id, email, name, picture),
            )
            conn.commit()
        # §0.4 v2: also drop the JWT into the HttpOnly session cookie
        # so test-mode login mirrors the production cookie behaviour.
        # `token` stays in the JSON body for backward-compat with any
        # caller (e.g. the existing E2E `getAuthForApi` helper) that
        # extracts it from the response and replays it as Authorization
        # in subsequent calls.
        token = issue_token(user_id)
        response = make_response(jsonify({
            "status": "success",
            "token": token,
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "picture": picture,
                "bio": "",
                "status": "",
                "homeCurrency": None,
                # Test users start with no locale preference — frontend
                # falls back to navigator.language.
                "language": None,
            },
        }))
        set_auth_cookie(response, token)
        return response

    if not token or not client_id:
        return jsonify({"error": "Missing token or Client ID"}), 400

    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)

        user_id = idinfo['sub']
        email = idinfo['email']
        name = idinfo['name']
        picture = idinfo['picture']

        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO users (id, email, name, picture)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    picture=excluded.picture
            ''', (user_id, email, name, picture))

            cursor.execute("SELECT bio, status, home_currency, home_country, language FROM users WHERE id = ?", (user_id,))
            user_row = cursor.fetchone()
            db_bio = user_row['bio'] if user_row else ""
            db_status = user_row['status'] if user_row else ""
            # NULL means "never set" — frontend defaults from browser locale.
            db_home_currency = user_row['home_currency'] if user_row else None
            db_home_country = user_row['home_country'] if user_row else None
            db_language = user_row['language'] if user_row else None

            conn.commit()

        # §0.4 v2: drop the JWT into an HttpOnly session cookie
        # (`gg_session`) so JS can't read it — XSS-via-localStorage
        # exfiltration of the session token is no longer possible. The
        # `token` field stays in the JSON body for one more deploy
        # cycle so non-browser callers (pytest's auth_headers fixture,
        # the Playwright `getAuthForApi` helper) keep working without
        # any client-side change. The frontend stops READING this
        # field in the same slice but the surface stays compatible.
        token = issue_token(user_id)
        response = make_response(jsonify({
            "status": "success",
            "token": token,
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "picture": picture,
                "bio": db_bio or "",
                "status": db_status or "",
                "homeCurrency": db_home_currency,
                "homeCountry": db_home_country,
                # i18n session 3 — null until the user picks a locale in
                # Settings. Frontend's detectBrowserLocale handles the
                # default before that happens.
                "language": db_language,
            },
        }))
        set_auth_cookie(response, token)
        return response
    except ValueError as e:
        logger.error(f"Token verification failed: {e}")
        return jsonify({"error": "Invalid token"}), 401


@bp.route("/api/auth/logout", methods=["POST"])
@require_auth
@retry_on_lock()
def logout():
    """Server-side logout — bumps the user's `token_jti` so every
    JWT we've ever issued them is rejected on the next request, AND
    clears the HttpOnly session cookie so the browser stops attaching
    it.

    FIXING_ROADMAP §0.3: before this endpoint existed, logout just
    dropped the JWT from the client's localStorage. A stolen copy
    of the token (XSS, lost device, leaked log) stayed valid for
    its 30-day lifetime. Now logout actually invalidates.

    FIXING_ROADMAP §0.4 v2: also clears the `gg_session` cookie. The
    jti bump alone would expire the token at the server, but the
    browser would still send the (now-invalid) cookie on every
    request — wasting a verify round-trip + producing 401s on every
    poll until the cookie naturally expires. Clearing it tells the
    browser to stop sending.
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    bump_user_jti(user_id)
    response = make_response(jsonify({"status": "logged_out"}))
    clear_auth_cookie(response)
    return response
