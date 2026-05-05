"""JWT-based session helpers for the API.

Replaces the trust-the-client-user_id pattern: every endpoint that needs
to know who's calling now reads the user_id out of a signed JWT in the
Authorization: Bearer header instead of from the request body. The JWT
is issued by /api/auth/google after Google verifies the user's identity,
so the server knows the user_id wasn't fabricated by the caller.

Token shape:
    { "sub": "<google_user_id>", "iat": ..., "exp": ... }
Signed with HS256 using GG_JWT_SECRET.

Lifetime: 30 days. Long because we don't have refresh tokens — the
frontend just keeps using the same JWT until it expires, then the user
has to sign in again. This is fine for a single-user / small-friend
group app; if usage grows, swap to access+refresh tokens.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from typing import Optional

import jwt
from flask import request, jsonify, g


JWT_ALGORITHM = "HS256"
JWT_LIFETIME_DAYS = 30


def _secret() -> str:
    """Read the signing secret from env. We do NOT fall back to a
    hardcoded default — that would silently allow forging tokens in
    any deploy where the operator forgot to set the env var. Generate
    one with: python -c "import secrets; print(secrets.token_hex(32))"
    and put it in .env."""
    s = os.getenv("GG_JWT_SECRET")
    if not s:
        # Tests / first-run dev: generate an ephemeral one. Tokens
        # signed with it become invalid on next process start, which
        # is the right behavior — anyone running without the env var
        # set is in dev mode and can re-login at will.
        if not hasattr(_secret, "_dev_fallback"):
            _secret._dev_fallback = secrets.token_hex(32)
        return _secret._dev_fallback
    return s


def issue_token(user_id: str) -> str:
    """Sign and return a JWT for the given user_id."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=JWT_LIFETIME_DAYS)).timestamp()),
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    """Return the user_id for a valid JWT, or None for invalid/expired."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    return payload.get("sub")


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
