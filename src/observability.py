"""Observability — structured logging + optional Sentry integration.

FIXING_ROADMAP §3.8. Goals:

1. One place where the root logger gets its handler / format. `main.py`
   imports + calls `setup_logging()` once at boot; everywhere else uses
   `logging.getLogger(__name__)` — no `print(...)` for diagnostics.

2. Sentry SDK initialises ONLY when the `SENTRY_DSN` env var is set.
   No DSN → no Sentry import attempted (so it stays an optional dep
   without breaking dev / tests). When the DSN IS set, the Flask + SQLite
   + logging integrations all auto-attach.

3. Every request carries a per-request `request_id` (8-char hex) that
   gets attached to the log line + Sentry scope. Makes it trivial to
   correlate one request's log lines across the multi-route call graph
   (e.g. /api/sync → /api/data → /api/notifications race).

The module is DEFENSIVE about its imports — `sentry_sdk` is wrapped in a
try/except so a missing dep silently falls back to logging-only mode.
Same for the integrations (each Sentry integration is opt-in via SDK
version probing, not hard-required).

Usage from a route:

    from observability import get_logger, log_extra
    logger = get_logger(__name__)

    logger.info("share rotated", extra=log_extra(user_id=uid, trip_id=tid))
    logger.exception("share rotate failed", extra=log_extra(user_id=uid))

The `log_extra(...)` helper builds the dict of structured fields. Plain
`logger.info(msg)` still works for one-off / context-free messages.
"""

import logging
import os
import secrets
import subprocess
from typing import Any

# ── Public helpers ───────────────────────────────────────────────────


def get_logger(name: str) -> logging.Logger:
    """Module-scoped logger. Each call site uses `__name__` so log
    records carry their module path (`src.routes.feed`, `src.main`)
    automatically — that's the first level of "structured" we get for
    free from `logging`."""
    return logging.getLogger(name)


def log_extra(**fields: Any) -> dict:
    """Build the `extra` dict for `logger.*(msg, extra=...)`. Filters
    out None so call sites can pass `log_extra(user_id=uid, trip_id=tid)`
    without having to branch on which fields are set.

    Sentry's `LoggingIntegration` reads these as `contexts` on the event;
    the local handler ignores them by default (the formatter below
    doesn't render `extra` fields unless we tell it to). The keys
    therefore flow into Sentry without bloating the local log output."""
    return {k: v for k, v in fields.items() if v is not None}


def new_request_id() -> str:
    """8-char hex request id. Short enough to fit in a log line, wide
    enough (2^32) that collisions inside a 15-second polling window are
    astronomically unlikely."""
    return secrets.token_hex(4)


def resolve_release() -> str | None:
    """Resolve the deploy release identifier — used as Sentry's `release`
    tag so every error event is associated with a specific commit. The
    deploy script doesn't have to set anything; if a `.git` dir is reachable
    at runtime, we read HEAD ourselves.

    Resolution order:
      1. `SENTRY_RELEASE` env var (explicit override — wins everything).
      2. `GG_RELEASE` env var (deploy convention — useful when the running
         user can't read `.git` but the deploy step DID know the SHA).
      3. `git rev-parse --short=12 HEAD` via subprocess. Short SHA, not
         full — Sentry uses the value as a free-text identifier, no
         reason to bloat the log line with the full 40 chars.
      4. None — Sentry then auto-generates a release based on the SDK's
         own heuristics (typically "<unknown>"), which is fine for dev.

    Subprocess errors (no git binary, no .git dir, repo in weird state)
    fall through silently to `None` — observability MUST NOT block boot.
    The function is intentionally cheap (≤30ms for `git rev-parse`) so
    calling it once at setup_sentry() time has no measurable overhead.

    Returns the resolved identifier, or None when no source produced one.
    The setup_sentry() caller uses the returned value (or None → omit
    `release=` from `sentry_sdk.init(...)`).

    FIXING_ROADMAP §3.8.
    """
    env_release = os.getenv("SENTRY_RELEASE") or os.getenv("GG_RELEASE")
    if env_release:
        return env_release.strip() or None

    try:
        # 1.5s timeout — `git rev-parse` should be <30ms; a longer hang
        # means something is wrong (filesystem, repo lock) and we'd
        # rather drop the tag than block app startup.
        result = subprocess.run(
            ["git", "rev-parse", "--short=12", "HEAD"],
            capture_output=True,
            text=True,
            timeout=1.5,
            check=False,
            # cwd defaults to whatever the Flask process was launched
            # from. On PA that's the repo root (via `manage.py runserver`
            # in dev or the WSGI loader in prod). If launched from
            # elsewhere `git rev-parse` will fail with the standard
            # "not a git repository" error → we fall through to None.
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None

    if result.returncode != 0:
        return None
    sha = result.stdout.strip()
    return sha or None


# ── Setup — called once from main.py boot ────────────────────────────


def setup_logging() -> None:
    """Configure the root logger. Idempotent — if `main.py` is re-imported
    (Flask debug reload, test fixtures), the second call is a no-op."""
    root = logging.getLogger()
    # If a handler is already attached (e.g. Flask's default StreamHandler
    # added before this ran), don't double-attach — that doubles every log
    # line. The presence of `_gg_observability_configured` on the root
    # logger is our sentinel.
    if getattr(root, "_gg_observability_configured", False):
        return

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    root.setLevel(level)

    # Strip any handlers Flask / Werkzeug may have already attached so
    # the formatter below is the single source of truth for log output.
    # (Werkzeug installs its own handler at WARNING level for access
    # logs — we keep that separate; only stripping handlers on the ROOT
    # logger, not on `werkzeug` specifically.)
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler()
    handler.setLevel(level)
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root.addHandler(handler)
    root._gg_observability_configured = True  # type: ignore[attr-defined]


def setup_sentry() -> bool:
    """Initialise Sentry iff `SENTRY_DSN` is set in env. Returns True
    when Sentry is actually attached, False when skipped (no DSN, SDK
    not installed, or init failed). No-op + no warning in the no-DSN
    case — Sentry is intentionally opt-in for dev / tests."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        # SDK not installed — the user can `pip install sentry-sdk[flask]`
        # whenever they want it. Until then we run logging-only.
        get_logger(__name__).info(
            "SENTRY_DSN set but sentry-sdk not installed — running "
            "logging-only. `pip install sentry-sdk[flask]` to enable."
        )
        return False

    # WARN-and-above breadcrumbs from the standard library logger, ERROR
    # and exceptions promoted to Sentry events.
    logging_integration = LoggingIntegration(
        level=logging.WARNING,   # breadcrumb threshold
        event_level=logging.ERROR,
    )
    # §3.8 — auto-resolve the release tag from git SHA when neither
    # SENTRY_RELEASE nor GG_RELEASE is set in env. With releases tagged,
    # every Sentry event is associated with a specific commit and the
    # SDK can auto-resolve issues once a fix ships on a later release.
    release = resolve_release()
    if release:
        get_logger(__name__).info(
            "sentry release tag resolved: %s",
            release,
            extra=log_extra(release=release),
        )

    sentry_sdk.init(
        dsn=dsn,
        integrations=[FlaskIntegration(), logging_integration],
        # Conservative defaults — the user can tune via env once they
        # see real volume.
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
        profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
        environment=os.getenv("SENTRY_ENV", "production"),
        release=release,
        send_default_pii=False,  # email/IP off by default; PII opt-in only
    )
    return True


def bind_trip_context(trip_id: str | None) -> None:
    """Stash the trip_id this request is operating on. Route handlers
    call this once they've resolved the trip from a URL param or body
    payload; the after_request hook then includes the trip_id on the
    per-request log line AND attaches it as a Sentry tag.

    Idempotent + tolerant — `None` / empty / non-trip requests are no-ops
    so callers don't need to branch. Calling outside a request context
    is also a no-op (e.g. from a CLI / job; Flask raises on g access).

    Usage in a route:

        @bp.delete("/api/trips/<trip_id>")
        def delete_trip(trip_id):
            bind_trip_context(trip_id)
            # … rest of the handler …

    FIXING_ROADMAP §3.8 — gives every error event a trip_id tag, so
    Sentry can filter "errors hitting this specific trip" or roll up by
    trip on a regression. Beats sprinkling `extra=log_extra(trip_id=tid)`
    on every individual log call.
    """
    if not trip_id:
        return
    try:
        from flask import g, has_request_context
        if not has_request_context():
            return
        g.trip_id = trip_id
    except Exception:
        # Flask not available / no app context — observability MUST NOT
        # raise into the caller's hot path.
        return

    try:
        import sentry_sdk
        scope = sentry_sdk.get_current_scope()
        scope.set_tag("trip_id", trip_id)
    except ImportError:
        pass
    except Exception:
        # SDK init half-failed / scope unavailable — silently degrade.
        pass


def attach_request_context(app, current_user_id_fn) -> None:
    """Wire Flask before_request / after_request hooks so every request:
      - gets a fresh `request_id` stashed on `flask.g`
      - logs an INFO line at completion with method, path, status, user_id
        AND trip_id (when the route has called `bind_trip_context(tid)`)
      - sets the user_id + request_id (+ trip_id when set) on the Sentry
        scope (no-op without Sentry)

    `current_user_id_fn` is injected so this module doesn't import auth
    (would be a circular import — auth uses helpers from us instead).
    """
    from flask import g, request

    try:
        import sentry_sdk
        _have_sentry = True
    except ImportError:
        _have_sentry = False

    logger = get_logger("gg.request")

    @app.before_request
    def _gg_attach_request_id():
        g.request_id = new_request_id()
        # trip_id starts unset — route handlers call bind_trip_context()
        # once they've resolved the trip from URL or payload. The
        # after_request hook reads g.trip_id if set.
        g.trip_id = None
        if _have_sentry:
            scope = sentry_sdk.get_current_scope()
            scope.set_tag("request_id", g.request_id)
            try:
                uid = current_user_id_fn()
                if uid:
                    scope.set_user({"id": uid})
                    scope.set_tag("user_id", uid)
            except Exception:
                # current_user_id_fn might throw on a malformed token;
                # request still runs, just without user context attached.
                pass

    @app.after_request
    def _gg_log_request(response):
        # Skip static + bundle chunks — they're loud and uninteresting.
        # The route-level logs (in routes/*.py) already cover the
        # interesting paths with their own structured fields.
        path = request.path or ""
        if path.startswith("/static/") or path.endswith(".map"):
            return response
        try:
            uid = current_user_id_fn() or "-"
        except Exception:
            uid = "-"
        logger.info(
            "%s %s -> %s",
            request.method,
            path,
            response.status_code,
            extra=log_extra(
                request_id=getattr(g, "request_id", None),
                user_id=uid if uid != "-" else None,
                trip_id=getattr(g, "trip_id", None),
                status=response.status_code,
            ),
        )
        return response
