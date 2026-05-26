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
    """Legacy per-user jti store. Pre-2026-05-27 every token shared
    this single jti, so logout-from-any-device invalidated all of
    them. Kept around as a fallback for tokens minted before the
    per-session move (verify_token falls back to this when no
    auth_sessions row matches a JWT's jti)."""
    with get_db() as conn:
        cursor = conn.cursor()
        row = cursor.execute(
            "SELECT token_jti FROM users WHERE id = ?", (user_id,),
        ).fetchone()
        existing = row["token_jti"] if row else None
        if existing:
            return existing
        new_jti = secrets.token_hex(16)
        cursor.execute(
            "UPDATE users SET token_jti = ? WHERE id = ?", (new_jti, user_id),
        )
        conn.commit()
        return new_jti


def bump_user_jti(user_id: str) -> str:
    """Rotate the user's legacy `token_jti`. Pre-2026-05-27 this was
    the sole logout primitive (which invalidated every device).
    The new logout path uses `revoke_session_by_jti` to scope the
    revocation to one device; this function is still called on
    logout as a belt-and-braces sweep that ALSO kills any
    legacy-shaped tokens the user has lying around."""
    new_jti = secrets.token_hex(16)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET token_jti = ? WHERE id = ?", (new_jti, user_id),
        )
        conn.commit()
    return new_jti


def _create_session(user_id: str, device_label: str | None) -> str:
    """Create a fresh auth_sessions row + return its jti. Each call
    yields a unique jti so devices don't share one. device_label
    is best-effort metadata (user-agent fragment) — handy for the
    /api/auth/sessions UI ("revoke iPhone session")."""
    new_jti = secrets.token_hex(16)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO auth_sessions (user_id, jti, device_label, last_seen_at) "
            "VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
            (user_id, new_jti, (device_label or "")[:120] or None),
        )
        conn.commit()
    return new_jti


def revoke_session_by_jti(jti: str) -> bool:
    """Stamp `revoked_at = NOW` on the session row matching `jti`.
    Returns True iff a row was updated. Idempotent — re-revoking
    is a no-op."""
    if not jti:
        return False
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP "
            "WHERE jti = ? AND revoked_at IS NULL",
            (jti,),
        )
        conn.commit()
        return cursor.rowcount > 0


def issue_token(user_id: str, device_label: str | None = None) -> str:
    """Sign and return a JWT for the given user_id.

    Audit fix (2026-05-27): each token now gets a UNIQUE per-session
    jti backed by a row in `auth_sessions`. Logout / revoke kills
    one session without affecting others — sign in on phone +
    laptop, log out from laptop, phone keeps working.

    `device_label` is a best-effort hint for the /api/auth/sessions
    UI (e.g. "iPhone Safari", "Chrome on Mac"). The route handler
    derives it from the User-Agent header.
    """
    now = datetime.now(timezone.utc)
    new_jti = _create_session(user_id, device_label)
    payload = {
        "sub": user_id,
        "jti": new_jti,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_LIFETIME_DAYS)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    """Return the user_id for a valid JWT, or None for
    invalid/expired/revoked.

    Verification path (audit fix 2026-05-27):
      1. Decode + signature check via PyJWT.
      2. Pull (jti, user_id) from the payload — reject if either
         missing (legacy pre-§0.3 tokens with no jti are dead).
      3. Try the per-session table FIRST: a row in `auth_sessions`
         with this jti is the post-fix authority. If the row
         exists, the token is valid IFF `revoked_at IS NULL`.
      4. If no auth_sessions row matches, fall back to the legacy
         `users.token_jti` shared-jti scheme. This keeps existing
         in-flight tokens (minted before this commit) working
         until they naturally expire / get revoked via the
         legacy bump path.

    Also bumps `last_seen_at` on the session row when found, so
    /api/auth/sessions can show "last active 12m ago" without an
    extra round trip.
    """
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    token_jti = payload.get("jti")
    if not user_id or not token_jti:
        return None
    with get_db() as conn:
        cursor = conn.cursor()
        # Per-session lookup first (the post-2026-05-27 path).
        session_row = cursor.execute(
            "SELECT id, revoked_at FROM auth_sessions WHERE jti = ?",
            (token_jti,),
        ).fetchone()
        if session_row is not None:
            if session_row["revoked_at"] is not None:
                try:
                    import logging
                    logging.getLogger(__name__).info(
                        "JWT session revoked",
                        extra={"user_id": user_id, "jti": token_jti},
                    )
                except Exception:
                    pass
                return None
            # Touch last_seen_at so the /api/auth/sessions UI can
            # show "last active N min ago".
            cursor.execute(
                "UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP "
                "WHERE id = ?",
                (session_row["id"],),
            )
            conn.commit()
            return user_id

        # Legacy fallback — match against users.token_jti for tokens
        # minted before the per-session move.
        row = cursor.execute(
            "SELECT token_jti FROM users WHERE id = ?", (user_id,),
        ).fetchone()
    if not row:
        try:
            import logging
            logging.getLogger(__name__).warning(
                "JWT valid but user row missing", extra={"user_id": user_id},
            )
        except Exception:
            pass
        return None
    if row["token_jti"] != token_jti:
        try:
            import logging
            logging.getLogger(__name__).info(
                "JWT jti mismatch (revoked legacy token)",
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
