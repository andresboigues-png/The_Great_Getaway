"""JWT-based session helpers for the API.

Replaces the trust-the-client-user_id pattern: every endpoint that needs
to know who's calling now reads the user_id out of a signed JWT. The
JWT is issued by /api/auth/google after Google verifies the user's
identity, so the server knows the user_id wasn't fabricated by the
caller.

Token shape:
    { "sub": "<google_user_id>", "jti": "<per-user revocation id>",
      "iat": ..., "exp": ... }
Signed with HS256 using GG_JWT_SECRET.

Lifetime: 30 days. Long because we don't have refresh tokens — the
frontend keeps using the same JWT until it expires, then the user
re-signs in.

FIXING_ROADMAP §0.3 — every token now carries a `jti` claim that
matches the user's `token_jti` row in the DB. `/api/auth/logout`
bumps the row to a fresh value, which invalidates every JWT issued
before the bump (single-jti-per-user model). Pre-§0.3 tokens (no
`jti` claim at all) are rejected — users had to re-login post-deploy.

FIXING_ROADMAP §0.4 (v2, 2026-05-17) — JWT now lives in an
HttpOnly/Secure/SameSite=Lax cookie instead of localStorage. JS can
no longer read the token, so a future XSS oversight can't exfiltrate
it. CSRF is mitigated by SameSite=Lax (browsers won't attach the
cookie to embedded cross-site POST/PUT/DELETE requests). The
Authorization: Bearer header is still accepted as a fallback path so
(a) pytest fixtures that issue tokens directly keep working,
(b) the deploy doesn't force-log-out every active user with a stale
localStorage token, and (c) potential future non-browser clients
(mobile shell, Capacitor) can still authenticate without a cookie
jar. `_extract_token` walks cookie first, then header.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Optional

import jwt
from flask import request, jsonify, g

from database import get_db


JWT_ALGORITHM = "HS256"
JWT_LIFETIME_DAYS = 30


def _secret() -> str:
    """Read the signing secret from env. We do NOT fall back to a
    hardcoded default — that would silently allow forging tokens in
    any deploy where the operator forgot to set the env var. Generate
    one with: python -c "import secrets; print(secrets.token_hex(32))"
    and put it in .env.

    FIXING_ROADMAP §1.12: in non-dev environments, missing
    GG_JWT_SECRET is fatal. Under gunicorn the previous ephemeral
    fallback generated a different secret PER WORKER, so a JWT
    issued by worker A failed verification on worker B — manifesting
    as flaky 401s the user couldn't reproduce. The dev fallback is
    safe ONLY in single-process dev/test scenarios, so we gate it
    on FLASK_ENV (or GG_ALLOW_TEST_LOGIN, which the Playwright
    harness sets).
    """
    s = os.getenv("GG_JWT_SECRET")
    if s:
        return s
    is_dev = (
        os.getenv("FLASK_ENV") == "development"
        or os.getenv("FLASK_DEBUG") == "1"
        or os.getenv("GG_ALLOW_TEST_LOGIN") == "1"
        or os.getenv("PYTEST_CURRENT_TEST") is not None
    )
    if not is_dev:
        raise RuntimeError(
            "GG_JWT_SECRET is not set. Refusing to start in production "
            "without a stable JWT signing key — every gunicorn worker "
            "would otherwise generate its own ephemeral secret and "
            "fail to verify tokens issued by other workers. Generate "
            "one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    # Tests / first-run dev: generate an ephemeral one. Tokens signed
    # with it become invalid on next process start, which is the right
    # behavior — anyone running without the env var set is in dev mode
    # and can re-login at will.
    if not hasattr(_secret, "_dev_fallback"):
        _secret._dev_fallback = secrets.token_hex(32)
    return _secret._dev_fallback


def _read_or_init_user_jti(user_id: str) -> str:
    """Return the user's current `token_jti`, generating + persisting
    one on first call. Idempotent — once a jti exists, this is a
    single indexed lookup. The lazy-init avoids needing a data
    backfill when the column was first added."""
    with get_db() as conn:
        cursor = conn.cursor()
        row = cursor.execute(
            "SELECT token_jti FROM users WHERE id = ?", (user_id,),
        ).fetchone()
        existing = row["token_jti"] if row else None
        if existing:
            return existing
        new_jti = secrets.token_hex(16)
        # If the user row doesn't exist yet, the UPDATE is a silent
        # no-op; the caller (issue_token) is invoked AFTER the user
        # row is created by /api/auth/google, so this is fine.
        cursor.execute(
            "UPDATE users SET token_jti = ? WHERE id = ?", (new_jti, user_id),
        )
        conn.commit()
        return new_jti


def bump_user_jti(user_id: str) -> str:
    """Rotate the user's `token_jti` — invalidates every JWT we've
    ever issued them. Used by `/api/auth/logout` so a real logout
    actually invalidates the token (the prior "drop client copy and
    hope" approach left stolen tokens valid for 30 days)."""
    new_jti = secrets.token_hex(16)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET token_jti = ? WHERE id = ?", (new_jti, user_id),
        )
        conn.commit()
    return new_jti


def issue_token(user_id: str) -> str:
    """Sign and return a JWT for the given user_id. Embeds the
    user's current `token_jti` so `/api/auth/logout` can invalidate
    by bumping it."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "jti": _read_or_init_user_jti(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_LIFETIME_DAYS)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    """Return the user_id for a valid JWT, or None for
    invalid/expired/revoked. A token is revoked when its `jti` claim
    no longer matches the user's current `token_jti` (logout bumped
    the column out from under it). Tokens with NO `jti` claim are
    rejected outright — those were issued before §0.3 landed and
    forcing re-login is the simplest cutover."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    token_jti = payload.get("jti")
    if not user_id or not token_jti:
        return None
    # Compare against the current jti stored on the user row. Cheap
    # indexed lookup (users.id is PK). One DB hit per request — the
    # caller (current_user_id) caches the result on `g` for the
    # remainder of the request so multi-helper requests don't re-query.
    with get_db() as conn:
        cursor = conn.cursor()
        row = cursor.execute(
            "SELECT token_jti FROM users WHERE id = ?", (user_id,),
        ).fetchone()
    if not row:
        # Token signed correctly for a user_id that no longer exists
        # (e.g. user deleted, DB rolled back). Log so ghost-401s in
        # production are diagnosable instead of silent.
        try:
            import logging
            logging.getLogger(__name__).warning(
                "JWT valid but user row missing", extra={"user_id": user_id},
            )
        except Exception:
            pass
        return None
    if row["token_jti"] != token_jti:
        # Signature valid but jti mismatched — token was revoked (user
        # logged out, password reset, or admin-revoked). Also worth a
        # log so legitimate logout-on-stale-tab cases stand out from
        # actual exploitation attempts in production telemetry.
        try:
            import logging
            logging.getLogger(__name__).info(
                "JWT jti mismatch (revoked token)",
                extra={"user_id": user_id, "jti": token_jti},
            )
        except Exception:
            pass
        return None
    return user_id


# ── Session cookie (FIXING_ROADMAP §0.4 v2) ──────────────────────────
# Name picked to be obviously app-owned and to NOT collide with the old
# `gg_auth_token` localStorage key (so a user with stale localStorage
# from before this slice doesn't get confused with the cookie). 30-day
# Max-Age matches the JWT lifetime — they expire together so a JWT-
# valid cookie never sits in the jar past its usefulness, and a fresh
# login replaces both atomically.
AUTH_COOKIE_NAME = "gg_session"
AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * JWT_LIFETIME_DAYS


def _is_secure_request() -> bool:
    """Detect HTTPS even when running behind a reverse proxy that
    terminates TLS upstream (PythonAnywhere does this — the WSGI worker
    sees plain http unless we honour X-Forwarded-Proto). The check is
    deliberately permissive: any signal of HTTPS upstream → mark the
    cookie Secure. Local dev over plain http remains http-only because
    none of these signals fire.
    """
    if request.is_secure:
        return True
    if request.headers.get("X-Forwarded-Proto", "").lower() == "https":
        return True
    # Belt-and-suspenders: some hosts use X-Forwarded-Ssl or
    # Forwarded: proto=https. Cheap to check, no false-positive risk on
    # plain http localhost.
    if request.headers.get("X-Forwarded-Ssl", "").lower() == "on":
        return True
    forwarded = request.headers.get("Forwarded", "")
    if "proto=https" in forwarded.lower():
        return True
    return False


def set_auth_cookie(response, token: str) -> None:
    """Attach the session cookie to a response. Flagged HttpOnly (JS
    can't read it — that's the whole point of the §0.4 v2 migration),
    Secure (HTTPS only — prevents accidental leak over plain http),
    SameSite=Lax (browsers won't attach the cookie to embedded cross-
    site POST/PUT/DELETE → CSRF mitigation), Path=/ (sent on every
    route including /share/<token> and /sw.js).

    The `secure` flag is auto-detected via `_is_secure_request`. In
    local dev over http, the cookie is set without Secure so Chrome
    actually saves it; in production over https, Secure is enabled and
    the cookie won't be sent over plain http downgrades.
    """
    response.set_cookie(
        AUTH_COOKIE_NAME,
        token,
        max_age=AUTH_COOKIE_MAX_AGE,
        httponly=True,
        secure=_is_secure_request(),
        samesite="Lax",
        path="/",
    )


def clear_auth_cookie(response) -> None:
    """Wipe the session cookie. Sets max_age=0 + an empty value, with
    the SAME flags that were used to mint the cookie — browsers require
    the delete-cookie attributes to match the original set or the
    delete is silently ignored (this is the most common cookie-deletion
    bug). Called by /api/auth/logout and any 401-clear path.
    """
    response.set_cookie(
        AUTH_COOKIE_NAME,
        "",
        max_age=0,
        httponly=True,
        secure=_is_secure_request(),
        samesite="Lax",
        path="/",
    )


def _cookie_token() -> Optional[str]:
    """Extract the JWT from the session cookie set by `set_auth_cookie`.
    Returns None if the cookie is absent or empty (which is the
    `clear_auth_cookie` state — the cookie technically still exists in
    the jar with value="" until it expires, but treat empty as absent).
    """
    val = request.cookies.get(AUTH_COOKIE_NAME)
    return val.strip() if val else None


def _bearer_token() -> Optional[str]:
    """Extract the token from the Authorization: Bearer ... header.
    Kept as the fallback path so (a) pytest fixtures that issue tokens
    via `issue_token` and pass them as Bearer keep working, (b) the
    deploy doesn't force-log-out users with a stale localStorage token
    that the old client code still attaches as Authorization, and (c)
    potential future non-browser clients (mobile shell) can still
    authenticate without a cookie jar.
    """
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header[len("Bearer "):].strip() or None


def _extract_token() -> Optional[str]:
    """Find the JWT for the current request. Cookie wins over header
    when both are present — the cookie is the canonical post-§0.4-v2
    storage, and any browser that has both is mid-migration (old
    Authorization-Bearer code path + new cookie path). Picking cookie
    keeps the migration converging on the cookie-only future state.
    """
    return _cookie_token() or _bearer_token()


def current_user_id() -> Optional[str]:
    """Return the authenticated user's id, or None if no/bad token.
    Cached on `g` so a single request only decodes once even if multiple
    helpers ask."""
    if hasattr(g, "_gg_user_id"):
        return g._gg_user_id
    token = _extract_token()
    user_id = verify_token(token) if token else None
    g._gg_user_id = user_id
    return user_id


def require_auth(fn):
    """Decorator: rejects the request with 401 unless current_user_id()
    resolves. Place AFTER @app.route in the decorator chain (closer to
    the function) so Flask routes the request, then this gate runs."""
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if current_user_id() is None:
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapped
