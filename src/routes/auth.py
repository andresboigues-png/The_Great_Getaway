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
from datetime import UTC, datetime

from flask import Blueprint, jsonify, make_response, request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from auth import (
    bump_user_jti,
    clear_auth_cookie,
    current_user_id,
    issue_token,
    require_auth,
    revoke_session_by_jti,
    set_auth_cookie,
)
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import json_body

# Single source of truth for the dev/admin allowlist. The dev account is
# always treated as a Creator (Trip Templates feature) regardless of the
# users.is_creator flag. Importing from the leaf admin route module is
# cycle-free (admin.py imports the lower-level `auth` module, not this one).
from routes.admin import ADMIN_EMAILS

logger = logging.getLogger(__name__)
bp = Blueprint("auth", __name__)


def _current_token_expiry() -> str | None:
    """Return the request JWT's `exp` claim as an ISO-8601 UTC string,
    or None if there's no token / no `exp`.

    F1-I1: the 30-day session has no refresh path — when the JWT expires
    while the app is open, the next apiFetch 401s and the user is thrown
    to the login wall mid-task. Surfacing the expiry on the boot probe
    lets restoreSession do a PROACTIVE check (warn / re-auth before the
    boundary, rather than after a silent 401). We decode without a DB
    round-trip — current_user_id() has already validated the token for
    this request; here we only need the already-verified `exp`.
    """
    import jwt as _jwt

    from auth import JWT_ALGORITHM, _extract_token, _secret

    token = _extract_token()
    if not token:
        return None
    try:
        payload = _jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except _jwt.PyJWTError:
        return None
    exp = payload.get("exp")
    if exp is None:
        return None
    # `.isoformat()` on a tz-aware datetime yields e.g.
    # "2026-08-06T12:34:56+00:00" — the frontend can Date.parse() it
    # directly to schedule an "expiring soon" warning.
    return datetime.fromtimestamp(exp, tz=UTC).isoformat()


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
            "SELECT id, email, name, picture, bio, status, home_currency, home_country, language, is_creator, is_public FROM users WHERE id = ?",
            (user_id,),
        )
        row = cursor.fetchone()
    if not row:
        # Token is valid but user was deleted — treat as logged out.
        return jsonify({"logged_in": False})
    # Trip Templates: the dev account is always a Creator; everyone else
    # needs the granted users.is_creator flag.
    is_creator = bool(row["is_creator"]) or (row["email"] or "").strip().lower() in ADMIN_EMAILS
    return jsonify(
        {
            "logged_in": True,
            # F1-I1: the JWT's expiry, so the frontend's restoreSession can
            # schedule a "your session is expiring" warning / re-auth prompt
            # BEFORE the token dies mid-task — instead of the current silent
            # 401 → wipeUserState → login wall with in-progress UI lost. Null
            # only for the (unreachable-here) no-`exp` legacy-token case.
            "expiresAt": _current_token_expiry(),
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
                "isCreator": is_creator,
                # Profile visibility — the owner's own client needs this to
                # render the public/private toggle in its current state on boot.
                # Absent column (unmigrated) → treat as public (the default).
                "isPublic": bool(row["is_public"]) if row["is_public"] is not None else True,
            },
        }
    )


def _seed_default_categories(cursor, user_id):
    """MK4: give a brand-new user the 3 starter expense categories so the
    expense form, budgets, and Personalization aren't empty on first run.

    Mirrors the frontend STATE defaults (state.ts) + the Settings
    'Reset categories' set, using the SAME ids — categories' PK is
    (id, user_id), so c1/c2/c3 don't collide across users — so the first
    /api/data pull is a clean match.

    Seeds ONLY when the user has zero categories AND no deletion history,
    i.e. genuinely new: this is idempotent for existing users and never
    resurrects categories a user has deliberately deleted.
    """
    cursor.execute("SELECT 1 FROM categories WHERE user_id = ? LIMIT 1", (user_id,))
    if cursor.fetchone():
        return  # already has categories
    cursor.execute("SELECT 1 FROM category_deletes WHERE user_id = ? LIMIT 1", (user_id,))
    if cursor.fetchone():
        return  # user cleared their categories on purpose — don't resurrect
    for cid, cname, icon, color in (
        ("c1", "Food", "🍔", "#ff3b30"),
        ("c2", "Transport", "✈️", "#007aff"),
        ("c3", "Accommodation", "🏨", "#5856d6"),
    ):
        cursor.execute(
            "INSERT OR IGNORE INTO categories (id, user_id, name, icon, color) "
            "VALUES (?, ?, ?, ?, ?)",
            (cid, user_id, cname, icon, color),
        )


@bp.route("/api/auth/google", methods=["POST"])
@limiter.limit("10 per minute")
@retry_on_lock()
def google_auth():
    """Verify Google ID Token and manage user session."""
    # Support both 'token' and 'credential' keys
    # §2.3 / SEC-2 — guard against a non-JSON OR non-object body
    # (curl with no Content-Type, malformed POST, or a valid-JSON
    # array/string/number root). request.json is None in the first
    # case and a non-dict in the second; either way `.get(...)`
    # would AttributeError → 500 on this UNAUTHENTICATED route.
    body = json_body()
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
        user_id = token[len("test:") :] or "test-user-1"
        # 2026-05-25 (audit 8.4 security): previously this path accepted
        # ANY user_id after the `test:` prefix — including the Google
        # `sub` of a real user. If GG_ALLOW_TEST_LOGIN=1 ever leaked to
        # prod (env-var misconfig, CI/CD bleed, etc.), an attacker who
        # knew a real user's sub could log in as them instantly. Now
        # the user_id must start with the literal `test-` prefix; any
        # other shape → 400, no row written, no token issued. This
        # caps the blast radius even when the gate is mis-set.
        if not user_id.startswith("test-"):
            return jsonify(
                {
                    "error": "Test-mode user_id must start with `test-` prefix",
                }
            ), 400
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
            _seed_default_categories(cursor, user_id)
            # Audit MK5 P2: surface isCreator in the test-login response too
            # (mirrors the real-login + user-status paths) so the Creator tab
            # appears immediately. A test user's email is never an admin email,
            # so the granted flag is the only source.
            cursor.execute("SELECT is_creator FROM users WHERE id = ?", (user_id,))
            _cr = cursor.fetchone()
            test_is_creator = bool(_cr["is_creator"]) if _cr else False
            conn.commit()
        # §0.4 v2: also drop the JWT into the HttpOnly session cookie
        # so test-mode login mirrors the production cookie behaviour.
        # `token` stays in the JSON body for backward-compat with any
        # caller (e.g. the existing E2E `getAuthForApi` helper) that
        # extracts it from the response and replays it as Authorization
        # in subsequent calls.
        token = issue_token(
            user_id, device_label=(request.headers.get("User-Agent") or "")[:120] or None
        )
        response = make_response(
            jsonify(
                {
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
                        # F1-B3: include homeCountry so the test-login response
                        # matches the real-login + /api/user-status shapes. The
                        # test user is created with only id/email/name/picture,
                        # so home_country is always NULL here — mirror that with
                        # None rather than omitting the key (an absent key leaves
                        # STATE.user.homeCountry undefined, blanking the home-
                        # country flag/tile until the next boot probe).
                        "homeCountry": None,
                        # Test users start with no locale preference — frontend
                        # falls back to navigator.language.
                        "language": None,
                        "isCreator": test_is_creator,
                        # Test users are created minimally (is_public defaults to
                        # 1), so they start public like any fresh account.
                        "isPublic": True,
                    },
                }
            )
        )
        set_auth_cookie(response, token)
        return response

    if not token or not client_id:
        return jsonify({"error": "Missing token or Client ID"}), 400

    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)

        # Audit fix (2026-05-26): require Google to have verified the
        # email before we trust it. `id_token.verify_oauth2_token`
        # only checks issuer / audience / signature — it doesn't
        # check that the email is verified. A Workspace admin who
        # email-sets `attacker@some-domain.com` to `victim@gmail.com`
        # (unverified) gets a valid ID token from Google; pre-fix
        # the server stored `victim@gmail.com` as that user's
        # canonical email + collided on the UNIQUE constraint, OR
        # — if no prior collision — became the canonical record for
        # the spoofed address. Reject unverified ID tokens outright.
        if not idinfo.get('email_verified'):
            logger.warning("Google ID token with unverified email rejected")
            return jsonify({"error": "Email not verified by Google"}), 401

        user_id = idinfo['sub']
        email = idinfo['email']
        # `sub` + `email` are guaranteed here (email is gated by the
        # email_verified check above), but `name` and `picture` are
        # OPTIONAL claims in a Google ID token — a brand-new account, a
        # minimal/Workspace profile, or a grant without the full profile
        # scope can omit them. Bracket access (`idinfo['name']`) then
        # raises KeyError, which the `except ValueError` below does NOT
        # catch → an unhandled 500 on this first-login path. Use `.get()`
        # with safe fallbacks so a thin profile logs in cleanly (the
        # frontend already falls back to the email for a missing name).
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')

        with get_db() as conn:
            cursor = conn.cursor()
            # F1-B1: Google can rotate a user's `sub` (id-token subject) while
            # the verified email stays the same — a Workspace domain migration,
            # an account-type change, or Google's own opaque re-issuance. Our
            # `users.id` column IS the sub, and `users.email` is UNIQUE, so a
            # naive `INSERT ... ON CONFLICT(id)` for the NEW sub collides on the
            # EMAIL constraint (not the id), raising sqlite3.IntegrityError —
            # which the `except ValueError` below does NOT catch → a login 500.
            #
            # Reconcile instead: if this verified email already belongs to a
            # row under a DIFFERENT id, that IS the returning user. We keep the
            # existing account's id as the canonical identity (all their trips,
            # expenses, friends, etc. hang off it via FKs with no ON UPDATE
            # CASCADE — mutating the PK would orphan every child row) and mint
            # the session for that id. The email is Google-verified above, so
            # trusting it as the stable match key is safe.
            cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
            existing = cursor.fetchone()
            if existing and existing["id"] != user_id:
                user_id = existing["id"]
            cursor.execute(
                '''
                INSERT INTO users (id, email, name, picture)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    -- MK6 P3: keep a CUSTOM uploaded avatar across re-logins.
                    -- /api/profile/update persists a /static/uploads/<uid>/...
                    -- URL into users.picture; a bare picture=excluded.picture
                    -- reset it to the Google lh3 URL on every login, silently
                    -- reverting the user's chosen photo. Only overwrite when the
                    -- stored value ISN'T a custom upload.
                    picture=CASE
                        WHEN users.picture LIKE '/static/uploads/%' THEN users.picture
                        ELSE excluded.picture
                    END
            ''',
                (user_id, email, name, picture),
            )

            cursor.execute(
                "SELECT bio, status, home_currency, home_country, language, is_creator, is_public FROM users WHERE id = ?",
                (user_id,),
            )
            user_row = cursor.fetchone()
            db_bio = user_row['bio'] if user_row else ""
            db_status = user_row['status'] if user_row else ""
            # NULL means "never set" — frontend defaults from browser locale.
            db_home_currency = user_row['home_currency'] if user_row else None
            db_home_country = user_row['home_country'] if user_row else None
            db_language = user_row['language'] if user_row else None
            # Audit MK5 P2: include isCreator in the LOGIN response too (it was
            # only in /api/user-status), so a granted non-admin Creator sees the
            # Creator tab immediately instead of after a full page reload. The
            # dev account is always a creator (mirrors /api/user-status).
            db_is_creator = (bool(user_row['is_creator']) if user_row else False) or (
                email or ""
            ).strip().lower() in ADMIN_EMAILS
            # Profile visibility — default public (matches the column DEFAULT 1
            # and a brand-new user whose INSERT didn't set it).
            db_is_public = (
                bool(user_row['is_public'])
                if (user_row and user_row['is_public'] is not None)
                else True
            )

            # MK4: give brand-new users the 3 starter categories (no-op if
            # they already have any, or deliberately deleted them all).
            _seed_default_categories(cursor, user_id)
            conn.commit()

        # §0.4 v2: drop the JWT into an HttpOnly session cookie
        # (`gg_session`) so JS can't read it — XSS-via-localStorage
        # exfiltration of the session token is no longer possible. The
        # `token` field stays in the JSON body for one more deploy
        # cycle so non-browser callers (pytest's auth_headers fixture,
        # the Playwright `getAuthForApi` helper) keep working without
        # any client-side change. The frontend stops READING this
        # field in the same slice but the surface stays compatible.
        token = issue_token(
            user_id, device_label=(request.headers.get("User-Agent") or "")[:120] or None
        )
        response = make_response(
            jsonify(
                {
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
                        "isCreator": db_is_creator,
                        "isPublic": db_is_public,
                    },
                }
            )
        )
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
    import jwt as _jwt

    from auth import JWT_ALGORITHM, _extract_token, _secret

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
            # BUG-022: hide sessions whose 30-day JWT has expired — they can no
            # longer authenticate, so listing them as 'active devices' is
            # misleading (a daily user would see dozens of dead phantoms). The
            # background sweep (main.py) now also reaps these rows.
            "AND created_at > datetime('now', '-30 days') "
            "ORDER BY COALESCE(last_seen_at, created_at) DESC",
            (user_id,),
        )
        rows = cursor.fetchall()
    return jsonify(
        {
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
        }
    )


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
