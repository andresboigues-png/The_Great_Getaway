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
    revoke_session_by_jti,
    set_auth_cookie,
    verify_token as _verify_token,
)
from database import get_db, retry_on_lock
from extensions import limiter


logger = logging.getLogger(__name__)
bp = Blueprint("auth", __name__)


@bp.route("/api/user-status")
@limiter.limit("60/minute")
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
        # 2026-05-25 (audit 8.4 security): previously this path accepted
        # ANY user_id after the `test:` prefix — including the Google
        # `sub` of a real user. If GG_ALLOW_TEST_LOGIN=1 ever leaked to
        # prod (env-var misconfig, CI/CD bleed, etc.), an attacker who
        # knew a real user's sub could log in as them instantly. Now
        # the user_id must start with the literal `test-` prefix; any
        # other shape → 400, no row written, no token issued. This
        # caps the blast radius even when the gate is mis-set.
        if not user_id.startswith("test-"):
            return jsonify({
                "error": "Test-mode user_id must start with `test-` prefix",
            }), 400
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
        token = issue_token(user_id, device_label=(request.headers.get("User-Agent") or "")[:120] or None)
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
        token = issue_token(user_id, device_label=(request.headers.get("User-Agent") or "")[:120] or None)
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


def _extract_current_jti() -> str | None:
    """Decode the request's JWT just enough to pull its `jti` claim.
    Used by the logout / session-revoke routes to identify WHICH
    session to revoke. We don't fully `verify_token` here because
    that'd add a DB round-trip we don't need — the @require_auth
    decorator on the route has already done that work."""
    from auth import _extract_token
    import jwt as _jwt
    from auth import _secret, JWT_ALGORITHM
    token = _extract_token()
    if not token:
        return None
    try:
        payload = _jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except _jwt.PyJWTError:
        return None
    return payload.get("jti")


@bp.route("/api/auth/logout", methods=["POST"])
@limiter.limit("10 per minute")
@require_auth
@retry_on_lock()
def logout():
    """Server-side logout — revoke THIS session's auth_sessions row
    so the caller's device can no longer authenticate, then clear
    the HttpOnly session cookie.

    Audit fix (2026-05-27): pre-fix this bumped the user's single
    `token_jti` which invalidated EVERY device the user had ever
    signed in on. Now we revoke only the current session; other
    devices keep working.

    For legacy tokens (minted before the per-session move, no
    auth_sessions row exists), the jti will fall through the
    session-revoke + still get bumped on `users.token_jti` so the
    legacy verify-fallback path also rejects. Belt-and-braces.
    """
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    jti = _extract_current_jti()
    revoked = revoke_session_by_jti(jti) if jti else False
    if not revoked:
        # No matching session row → this is a legacy token. Bump
        # the user-wide jti so the fallback verify path rejects it.
        # Trade-off: legacy users get the all-devices logout
        # behaviour for one more cycle until they re-login + get
        # a per-session token.
        bump_user_jti(user_id)
    response = make_response(jsonify({"status": "logged_out"}))
    clear_auth_cookie(response)
    return response


@bp.route("/api/auth/sessions", methods=["GET"])
@require_auth
@limiter.limit("30 per minute")
def list_sessions():
    """Return the caller's active auth_sessions rows so the
    Settings page can show "Signed in on these devices". Sorted
    most-recently-active first.

    Audit fix (2026-05-27): pre-fix users had no visibility into
    where their account was signed in — a stolen token sat valid
    for 30 days with no recourse beyond a full logout (which used
    to invalidate every device). Now they can see + revoke
    individually.
    """
    user_id = current_user_id()
    current_jti = _extract_current_jti()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, jti, device_label, created_at, last_seen_at "
            "FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL "
            "ORDER BY COALESCE(last_seen_at, created_at) DESC",
            (user_id,),
        )
        rows = cursor.fetchall()
    return jsonify({
        "sessions": [
            {
                "id": r["id"],
                "deviceLabel": r["device_label"],
                "createdAt": r["created_at"],
                "lastSeenAt": r["last_seen_at"],
                "isCurrent": r["jti"] == current_jti,
            }
            for r in rows
        ],
    })


@bp.route("/api/auth/sessions/<int:session_id>", methods=["DELETE"])
@require_auth
@limiter.limit("30 per minute")
@retry_on_lock()
def revoke_session(session_id):
    """Revoke a specific auth_sessions row by id. Caller must own
    the session. Idempotent — revoking an already-revoked or
    missing session returns success."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
            (session_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "revoked"})
