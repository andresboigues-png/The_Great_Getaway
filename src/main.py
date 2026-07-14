import os

from dotenv import load_dotenv
from flask import Flask, make_response, render_template, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix

from auth import current_user_id
from config import is_dev_env
from database import init_db
from extensions import limiter
from observability import (
    attach_request_context,
    get_logger,
    setup_logging,
    setup_sentry,
)
from routes.admin import bp as admin_bp
from routes.auth import bp as auth_bp
from routes.blocks import bp as blocks_bp
from routes.budgets import bp as budgets_bp
from routes.data import bp as data_bp
from routes.days import bp as days_bp
from routes.expenses import bp as expenses_bp
from routes.feed import bp as feed_bp
from routes.follows import bp as follows_bp
from routes.friends import bp as friends_bp
from routes.integrations import bp as integrations_bp
from routes.media import bp as media_bp
from routes.notifications import bp as notifications_bp
from routes.ops import bp as ops_bp
from routes.pdf import bp as pdf_bp
from routes.public import bp as public_bp
from routes.quotes import bp as quotes_bp
from routes.settings import bp as settings_bp
from routes.settlements import bp as settlements_bp
from routes.templates import bp as templates_bp
from routes.trip_io import bp as trip_io_bp
from routes.trips import bp as trips_bp
from services.visits import record_visit

# Load environment variables
load_dotenv()

# Observability — structured logging + (optional) Sentry. See
# src/observability.py for the full setup contract. Order matters:
# setup_logging() configures the root logger BEFORE setup_sentry()
# attaches its LoggingIntegration, so Sentry's breadcrumb capture
# sees the same handler chain everyone else does.
setup_logging()
setup_sentry()  # No-op unless SENTRY_DSN is set in env.
logger = get_logger(__name__)

# Initialize Flask App
app = Flask(__name__, template_folder="../frontend/templates", static_folder="../frontend/static")

# Audit fix (2026-05-27): wrap the WSGI app with ProxyFix so the
# request's `scheme` / `host` / `client_addr` reflect the TRUSTED
# proxy's forwarded headers, not whatever a client crafted. PA
# terminates TLS one hop upstream, so x_for=1 + x_proto=1 + x_host=1
# matches the real topology — anything beyond a single trusted hop
# is rejected. The auth-cookie Secure flag previously read
# `X-Forwarded-Proto` directly via `_is_secure_request`; with
# ProxyFix in place, `request.is_secure` returns the right answer
# without trusting arbitrary client headers (a malicious client
# beyond PA's proxy can no longer flip Secure on/off by stuffing
# the header).
#
# GG_TRUSTED_PROXIES env-overrides the hop count for local dev /
# alternate hosting (gunicorn behind nginx → x_for=2, etc.).
_trusted_proxies = int(os.getenv("GG_TRUSTED_PROXIES", "1"))
app.wsgi_app = ProxyFix(
    app.wsgi_app,
    x_for=_trusted_proxies,
    x_proto=_trusted_proxies,
    x_host=_trusted_proxies,
    x_prefix=_trusted_proxies,
)

# Upload destination — defaults to frontend/static/uploads (under the
# app's static_folder, so Flask serves them directly in dev). Production
# deploys override via GG_UPLOAD_ROOT to point at a path OUTSIDE the
# cloned repo, so user-uploaded photos survive code redeploys
# (git pull / wipe-and-reclone). On PythonAnywhere we set
# GG_UPLOAD_ROOT=/home/USERNAME/gg_uploads and add a static-files
# mapping in the Web tab so the URL `/static/uploads/<file>` continues
# to resolve to that directory. Same naming convention as GG_DB_PATH
# (database.py) and GG_ALLOW_TEST_LOGIN (auth flow).
UPLOAD_FOLDER = os.getenv("GG_UPLOAD_ROOT") or os.path.join(app.static_folder, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Upload limits — Flask itself will refuse anything over MAX_CONTENT_LENGTH
# with a 413 before a single byte hits disk. Per-extension + magic-number
# checks live in routes/media.py alongside the upload handler.
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
app.config['MAX_CONTENT_LENGTH'] = MAX_UPLOAD_SIZE
# MK6 P2: /api/trips/import restores a whole media-bearing trip, so the 10 MB
# global cap (sized for single-photo uploads) rejected any export >10 MB with a
# bare 413 — breaking the export→import round-trip the feature exists for. The
# route below raises the per-request cap. Kept well under trip_io's 512 MB
# uncompressed guard on purpose: the import handler buffers the whole body in
# RAM (file.read()), so a 512 MB request would risk OOM-ing the single PA
# worker. 64 MB covers a typical media trip; full parity for very large trips
# needs streaming the upload to a temp file (follow-up).
# (IMPORT_MAX_CONTENT_LENGTH moved to security_middleware.py with its hook)

# E2E test mode disables rate limits so Playwright can run 30+ tests
# against the same Flask process without tripping per-IP throttles.
# Gated by its OWN env var (GG_E2E) so the test-login bypass flag
# (GG_ALLOW_TEST_LOGIN) doesn't also nuke rate limits — defense in
# depth in case GG_ALLOW_TEST_LOGIN ever leaks into a non-test env.
# The flag has to be set BEFORE Limiter() is instantiated (Flask-Limiter
# snapshots the config at init), so this branch comes ahead of the
# limiter block below. Pytest disables limits independently in conftest.
if os.getenv("GG_E2E") == "1":
    app.config["RATELIMIT_ENABLED"] = False
    # R11-B3: paranoia log. A misconfigured prod box that exports GG_E2E=1
    # (e.g. copy-pasted from CI) would silently lose every per-IP rate
    # limit — that's a security regression we'd otherwise have no chance
    # to notice until a scraper hits us. Boot-time WARN gives an operator
    # one clear signal to grep for in PA's error log.
    logger.warning(
        "GG_E2E=1 is set — ALL rate limits are DISABLED. "
        "If you see this in production, unset GG_E2E and restart immediately."
    )

# Rate limiting. Per-IP for now; will switch to per-user once Phase G's
# auth lands. In-memory storage is fine for single-process dev — production
# should set RATELIMIT_STORAGE_URI=redis://... so limits survive restarts
# and apply across worker processes.
#
# `limiter` is instantiated in src/extensions.py so route blueprints can
# import it without a circular dependency on this module. We bind it to
# the app via init_app (deferred-init pattern); the storage URI is read
# from app.config (Flask-Limiter standard).
_ratelimit_storage_uri = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
app.config["RATELIMIT_STORAGE_URI"] = _ratelimit_storage_uri
limiter.init_app(app)


def _is_dev_env() -> bool:
    """MK1 Wave H (T2-3): delegates to config.is_dev_env — the canonical
    dev/test detection (was one of THREE inline copies of the same
    triple). Kept as a module-level name because tests monkeypatch
    `main._is_dev_env` and the dev-only routes resolve it via this
    module's globals."""
    return is_dev_env()


# R12-B1: warn loudly when running in production on the default
# in-memory rate-limit backend. `memory://` forgets all counters on
# every gunicorn worker restart (PA reloads on each deploy AND idles
# after ~5 min of no traffic) AND doesn't share state across workers
# — so R11-B5's per-user abuse caps + every per-IP limit silently
# reset, handing a burst attacker a fresh empty bucket on each
# restart. PA's free tier has no Redis; a file/sqlite backend
# (RATELIMIT_STORAGE_URI=sqlite:////home/TGG/gg/ratelimits.db or
# memory:// → file:///…) persists across reloads. Boot-time WARN
# gives the operator one clear grep target.
if _ratelimit_storage_uri.startswith("memory://") and not _is_dev_env():
    logger.warning(
        "RATELIMIT_STORAGE_URI is 'memory://' in a non-dev environment. "
        "Rate-limit + per-user abuse-cap counters will RESET on every "
        "worker restart and won't apply across workers. Set "
        "RATELIMIT_STORAGE_URI to a persistent backend (e.g. "
        "sqlite:////home/TGG/gg/ratelimits.db) so the caps survive "
        "deploys + idle-spindown."
    )

# ── Blueprint registration ──────────────────────────────────────────────────
# Phase B4 splits each domain (media / auth / trips / feed / ...) into its
# own routes/<domain>.py blueprint. Add new blueprints to this list as the
# split progresses; main.py shrinks accordingly.
app.register_blueprint(admin_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(blocks_bp)
app.register_blueprint(budgets_bp)
app.register_blueprint(data_bp)
app.register_blueprint(days_bp)
app.register_blueprint(expenses_bp)
app.register_blueprint(feed_bp)
app.register_blueprint(follows_bp)
app.register_blueprint(friends_bp)
app.register_blueprint(integrations_bp)
app.register_blueprint(quotes_bp)
app.register_blueprint(media_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(ops_bp)
app.register_blueprint(pdf_bp)
app.register_blueprint(public_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(settlements_bp)
app.register_blueprint(templates_bp)
app.register_blueprint(trip_io_bp)
app.register_blueprint(trips_bp)

# Ensure DB is initialized
init_db()

# R12-B1: fail-fast on missing auth-critical env in production. Pre-fix
# a deploy that lost CLIENT_ID_GOOGLE_AUTH from .env still booted — the
# SPA rendered, but Google Sign-In silently failed to initialize (the
# client_id went into the template as an empty string) and EVERY login
# attempt dead-ended at a blank popup with no server error, no /healthz
# fail, just a user-visible WTF. Mirrors auth.py's GG_JWT_SECRET guard:
# refuse to start so the operator sees the problem at deploy time, not
# via a confused user report hours later. GOOGLE_MAPS_API_KEY is a WARN
# (maps degrade to the no-key watermark but the app still works), not
# fatal. Dev/test skip the gate via _is_dev_env().
if not _is_dev_env():
    if not os.getenv("CLIENT_ID_GOOGLE_AUTH"):
        raise RuntimeError(
            "CLIENT_ID_GOOGLE_AUTH is not set. Refusing to start in "
            "production without the Google OAuth client id — Google "
            "Sign-In would render a blank popup and every login would "
            "silently fail. Set it in ~/gg/.env and reload the worker."
        )
    if not os.getenv("GOOGLE_MAPS_API_KEY"):
        logger.warning(
            "GOOGLE_MAPS_API_KEY is not set in a non-dev environment. "
            "Maps will render with the 'for development only' watermark "
            "and Places/Routes calls will fail. Set it in ~/gg/.env."
        )

# §3.8 — wire per-request id + user context. Every request gets a
# fresh `g.request_id` and (when Sentry is attached) sets the user
# id on the active Sentry scope. The after_request hook logs a single
# structured INFO line per non-static request so prod logs let us
# correlate "user X did Y" without grepping multiple sources.
attach_request_context(app, current_user_id)


# ── Security + request middleware ────────────────────────────────────
# MK1 Wave G (T2-1): CSP/nonce, CSRF origin gate, security headers,
# gzip, error handlers + the import-size lift live in
# src/security_middleware.py; registered here in original order.
from security_middleware import init_security  # noqa: E402

init_security(app)

# ── Background maintenance ───────────────────────────────────────────
# MK1 Wave G (T2-1): the 235-line feed-orphan/notification/session
# janitor moved to src/maintenance.py verbatim. Same boot point.
from maintenance import start_cleanup_thread  # noqa: E402

start_cleanup_thread()


def _asset_version(rel_path: str) -> str:
    """Cache-busting version string for a static asset — the file's mtime
    in seconds. The browser caches `?v=…` URLs aggressively (good — saves
    bandwidth on no-change visits), and the moment the file changes on
    disk the URL changes too, forcing a re-fetch. Replaces the prior
    behavior where users had to manually hard-reload (Cmd+Shift+R) after
    every deploy to pick up CSS/bundle changes.

    Falls back to '0' if the file is missing — the URL still works, the
    browser just caches indefinitely until the file appears."""
    full_path = os.path.join(app.static_folder or "", rel_path)
    try:
        return str(int(os.path.getmtime(full_path)))
    except OSError:
        return "0"


# MK1 Wave G (T2-1): /healthz + /api/csp-report live in routes/ops.py.


@app.route("/")
def home():
    """Serve the main Single Page Application (SPA) index file."""
    # ?dev=1 loads source modules directly (live edits, no rebuild) instead of the bundle.
    dev_mode = request.args.get("dev") == "1"
    resp = make_response(
        render_template(
            "index.html",
            google_client_id=os.getenv("CLIENT_ID_GOOGLE_AUTH"),
            google_maps_api_key=os.getenv("GOOGLE_MAPS_API_KEY"),
            dev_mode=dev_mode,
            bundle_version=_asset_version("js/app.bundle.js"),
            css_version=_asset_version("css/index.css"),
            # §0.4 follow-up: Tailwind v4 bundled CSS lives
            # at /static/js/assets/main.css (stable name
            # via vite.config's assetFileNames). Same
            # mtime-based cache-buster pattern.
            tailwind_css_version=_asset_version("js/assets/main.css"),
        )
    )
    # Anonymous, best-effort landing log (+ first-party gg_vid cookie). Powers
    # the developer dashboard's traffic panel; never blocks the page render.
    record_visit(request, resp)
    return resp


# MK1 Wave G (T2-1): /share/<token> lives in routes/public.py;
# /t/<code> in routes/templates.py — each beside its data helper.


@app.route("/components")
def components_preview():
    """Component-system preview page — renders every UI primitive in every
    state (rest / hover / focus-visible / disabled where applicable) at
    both desktop width and iPhone-SE width side by side. Useful for
    visual regression checks and iterating on the design tokens."""
    # BUG-097: dev-only surface. In production this exposed the entire
    # design-system gallery (every primitive + internal class names) to
    # anonymous visitors — a recon surface + dead weight on the prod
    # routing table. 404 outside dev, matching the other _is_dev_env()
    # guards (JWT-secret / rate-limit).
    if not _is_dev_env():
        from flask import abort

        abort(404)
    return render_template("components.html")


# --- PWA: serve the service worker from root scope ---
# A service worker can only control URLs under its own path. Putting sw.js
# at /static/sw.js would limit its scope to /static/, so we expose it at /sw.js
# (and let it claim the entire origin via scope: '/').
@app.route("/sw.js")
def service_worker():
    response = send_from_directory(app.static_folder, "sw.js", mimetype="application/javascript")
    # Browsers honour this header for cross-scope SW registration.
    response.headers["Service-Worker-Allowed"] = "/"
    # SW shouldn't be cached aggressively — we want updates to roll out fast.
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.route("/manifest.json")
def manifest():
    return send_from_directory(
        app.static_folder, "manifest.json", mimetype="application/manifest+json"
    )


# MK1 Wave G (T2-1): the /static/uploads/<path> ACL server lives in
# routes/media.py now — read + write paths reviewed together.


if __name__ == "__main__":
    # FIXING_ROADMAP §0.6: gate debug mode behind an env var. Production
    # serves through wsgi_pythonanywhere.py:application so this __main__
    # block is normally dormant — but a stray `python main.py` on a
    # server would otherwise expose Werkzeug's interactive debugger,
    # which (post-PIN-prompt) is a remote-code-execution console. Default
    # off; opt in with FLASK_DEBUG=1 in your local dev shell.
    debug_mode = os.getenv("FLASK_DEBUG") == "1"
    # GG_PORT lets parallel local servers (e.g. multi-agent test runs) bind
    # distinct ports without colliding. Defaults to 5001 — prod is unaffected
    # (it serves via wsgi_pythonanywhere.py, not this __main__ block).
    app.run(host="0.0.0.0", port=int(os.getenv("GG_PORT", "5001")), debug=debug_mode)
