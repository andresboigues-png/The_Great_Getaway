"""JWT-based session helpers for the API.

Replaces the trust-the-client-user_id pattern: every endpoint that needs
to know who's calling now reads the user_id out of a signed JWT in the
Authorization: Bearer header instead of from the request body. The JWT
is issued by /api/auth/google after Google verifies the user's identity,
so the server knows the user_id wasn't fabricated by the caller.

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
    if not row or row["token_jti"] != token_jti:
        return None
    return user_id


def _bearer_token() -> Optional[str]:
    """Extract the token from the Authorization: Bearer ... header."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header[len("Bearer "):].strip() or None


def current_user_id() -> Optional[str]:
    """Return the authenticated user's id, or None if no/bad token.
    Cached on `g` so a single request only decodes once even if multiple
    helpers ask."""
    if hasattr(g, "_gg_user_id"):
        return g._gg_user_id
    token = _bearer_token()
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
