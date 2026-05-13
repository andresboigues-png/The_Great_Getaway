import os
import json
import sqlite3
import requests
from flask import Flask, render_template, request, jsonify, send_from_directory, url_for
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from flask_limiter.util import get_remote_address
from database import get_db, init_db
from auth import issue_token, current_user_id, require_auth
from extensions import limiter
from observability import (
    attach_request_context,
    get_logger,
    log_extra,
    setup_logging,
    setup_sentry,
)
from routes.auth import bp as auth_bp
from routes.budgets import bp as budgets_bp
from routes.data import bp as data_bp
from routes.days import bp as days_bp
from routes.expenses import bp as expenses_bp
from routes.feed import bp as feed_bp
from routes.friends import bp as friends_bp
from routes.integrations import bp as integrations_bp
from routes.media import bp as media_bp
from routes.notifications import bp as notifications_bp
from routes.public import bp as public_bp, fetch_share_payload
from routes.settings import bp as settings_bp
from routes.settlements import bp as settlements_bp
from routes.trips import bp as trips_bp

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
app = Flask(__name__, 
            template_folder="../frontend/templates",
            static_folder="../frontend/static")

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

# E2E test mode shares the env-gate with the test-login bypass: Playwright
# runs 30+ tests against the same Flask process, each calling
# /api/auth/google to sign in, easily tripping the 10/min limit. The flag
# has to be set BEFORE Limiter() is instantiated (Flask-Limiter snapshots
# the config at init), so this branch comes ahead of the limiter block
# below. Pytest disables limits independently in conftest.
if os.getenv("GG_ALLOW_TEST_LOGIN") == "1":
    app.config["RATELIMIT_ENABLED"] = False

# Rate limiting. Per-IP for now; will switch to per-user once Phase G's
# auth lands. In-memory storage is fine for single-process dev — production
# should set RATELIMIT_STORAGE_URI=redis://... so limits survive restarts
# and apply across worker processes.
#
# `limiter` is instantiated in src/extensions.py so route blueprints can
# import it without a circular dependency on this module. We bind it to
# the app via init_app (deferred-init pattern); the storage URI is read
# from app.config (Flask-Limiter standard).
app.config["RATELIMIT_STORAGE_URI"] = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
limiter.init_app(app)

# ── Blueprint registration ──────────────────────────────────────────────────
# Phase B4 splits each domain (media / auth / trips / feed / ...) into its
# own routes/<domain>.py blueprint. Add new blueprints to this list as the
# split progresses; main.py shrinks accordingly.
app.register_blueprint(auth_bp)
app.register_blueprint(budgets_bp)
app.register_blueprint(data_bp)
app.register_blueprint(days_bp)
app.register_blueprint(expenses_bp)
app.register_blueprint(feed_bp)
app.register_blueprint(friends_bp)
app.register_blueprint(integrations_bp)
app.register_blueprint(media_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(public_bp)
app.register_blueprint(settings_bp)
app.register_blueprint(settlements_bp)
app.register_blueprint(trips_bp)

# Ensure DB is initialized
init_db()

# §3.8 — wire per-request id + user context. Every request gets a
# fresh `g.request_id` and (when Sentry is attached) sets the user
# id on the active Sentry scope. The after_request hook logs a single
# structured INFO line per non-static request so prod logs let us
# correlate "user X did Y" without grepping multiple sources.
attach_request_context(app, current_user_id)


# ── Security headers (FIXING_ROADMAP §0.4) ───────────────────────────
# Content-Security-Policy is the headline addition. With it in place,
# any future XSS oversight (post §0.1's escape pass) can't ship its
# stolen tokens to attacker-controlled domains — the browser blocks
# the outbound fetch. It also stops an injection from loading scripts
# from anywhere outside the explicit allowlist below, so the worst
# case shrinks from "full account takeover" to "in-page DOM mischief
# that can't talk to the network."
#
# This is a PERMISSIVE first-pass CSP: it keeps 'unsafe-inline' for
# script and style because the codebase has ~5 inline <script> blocks
# in index.html (Sentry init, early-theme paint, Maps key bootstrap)
# AND hundreds of inline style="..." attributes. Tightening to nonces
# for scripts is tracked as a follow-up — every <script> tag in
# index.html would gain `nonce="{{ csp_nonce }}"` and the policy
# would say `'nonce-{{ csp_nonce }}'` instead of `'unsafe-inline'`.
# Inline-style elimination is a separate, bigger refactor that pairs
# with the CSS-modules split in §3.1.
#
# Allowlist rationale, by directive:
#   script-src + script-src-elem
#     - accounts.google.com: Google Identity Services (gsi/client)
#     - maps.googleapis.com:  Maps JS SDK
#     - cdn.jsdelivr.net:     chart.js + xlsx CDN bundles
#     - *.sentry-cdn.com:     Sentry loader script
#   img-src
#     - data:, blob:: SVG icons inlined as data URIs, blob URLs for
#       camera-roll uploads before they reach the server
#     - https:: user-uploaded photos may be hosted on any HTTPS origin
#       (legacy Google photos, future external image host per
#       MAKING_THE_WEBSITE_LIVE.md), so we keep this permissive — the
#       XSS surface here is "the attacker shows a picture," which is
#       far less serious than script execution
#   connect-src
#     - *.googleapis.com:    Maps, Weather, Routes, Generative
#                            Language (Gemini), Time Zone APIs
#     - accounts.google.com: token exchange / signing
#     - api.frankfurter.app: currency rates
#     - *.sentry.io / *.ingest.sentry.io: Sentry telemetry endpoint
#     - images.unsplash.com / raw.githubusercontent.com: facts/quotes
#       feeds (only the JSON metadata; the images themselves go
#       through img-src above)
#   frame-src
#     - accounts.google.com: Google Sign-In renders a sign-in iframe
#       on some platforms; without this it falls back to popup
#   object-src 'none' + base-uri 'self' + form-action 'self'
#     - Standard hardening triplet: kill <object>/<embed> (Flash-era
#       attack surface), pin the document base URI, and prevent a
#       crafted <form action="https://evil"> from exfiltrating data.
#
# Other security headers:
#   X-Content-Type-Options: nosniff
#       — stops a `text/plain` upload being interpreted as HTML by
#         older IE / sniff-happy clients (still recommended by OWASP)
#   X-Frame-Options: DENY
#       — back-compat for browsers that don't honour `frame-ancestors`
#         in CSP. TGG isn't meant to be iframe-embedded anywhere.
#   Referrer-Policy: strict-origin-when-cross-origin
#       — outbound link clicks don't leak the full URL (which may
#         contain trip / user identifiers) to third parties
@app.after_request
def add_security_headers(response):
    response.headers.setdefault(
        "Content-Security-Policy",
        "; ".join([
            "default-src 'self'",
            (
                "script-src 'self' 'unsafe-inline' "
                "https://accounts.google.com "
                "https://maps.googleapis.com "
                "https://cdn.jsdelivr.net "
                "https://*.sentry-cdn.com"
            ),
            (
                "script-src-elem 'self' 'unsafe-inline' "
                "https://accounts.google.com "
                "https://maps.googleapis.com "
                "https://cdn.jsdelivr.net "
                "https://*.sentry-cdn.com"
            ),
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data: https://fonts.gstatic.com",
            (
                "connect-src 'self' "
                "https://accounts.google.com "
                "https://*.googleapis.com "
                "https://api.frankfurter.app "
                "https://images.unsplash.com "
                "https://raw.githubusercontent.com "
                "https://*.sentry.io "
                "https://*.ingest.sentry.io"
            ),
            "frame-src https://accounts.google.com",
            "worker-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ]),
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Referrer-Policy", "strict-origin-when-cross-origin",
    )
    return response


# ── Background maintenance ───────────────────────────────────────────
# Periodic cleanup of orphan feed_likes / feed_comments rows whose
# underlying event has aged out of the 30-day /api/feed window. Without
# this the tables grow without bound — counts on dead events are
# invisible to users (the event itself isn't rendered) but still take
# up rows. We deliberately do NOT clean feed_bookmarks: bookmarks are
# the user's permanent save list and must outlive the feed window.
#
# Strategy: dumb-and-simple background thread that runs on import and
# then once every 24h. Catches its own exceptions so a bad query
# doesn't kill the worker. Cheap enough at this scale (single-digit-K
# rows) that we don't bother with cron / job queues yet.
def _cleanup_feed_orphans():
    """Delete feed_likes and feed_comments rows older than 90 days that
    refer to a synthesised event (trip_*, friendship_*, share_*,
    repost_*) which no longer matches a live underlying record. Bookmarks
    are exempt — saves are permanent. Returns counts for logging."""
    deleted_likes = 0
    deleted_comments = 0
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # Likes: drop everything older than 90 days. Active events
            # within the 30-day window will have fresh likes restamped
            # whenever someone clicks again, so we don't lose heat on
            # current content.
            cursor.execute(
                "DELETE FROM feed_likes WHERE created_at < datetime('now', '-90 days')"
            )
            deleted_likes = cursor.rowcount or 0
            cursor.execute(
                "DELETE FROM feed_comments WHERE created_at < datetime('now', '-90 days')"
            )
            deleted_comments = cursor.rowcount or 0
            conn.commit()
    except sqlite3.DatabaseError as e:
        # §2.15: narrow to DB errors so the daemon thread doesn't
        # silently swallow programming bugs (NameError, ImportError,
        # etc.) — those should crash the thread loudly. DatabaseError
        # is the right catch-all for "DB had a hiccup" (locked, disk
        # full, file moved) and recoverable on the next iteration.
        # §3.8: structured logging — flows into Sentry as a breadcrumb
        # (and as an event at ERROR level).
        logger.warning("feed orphans sweep failed: %s", e, exc_info=True)
    if deleted_likes or deleted_comments:
        logger.info(
            "feed cleanup removed %d likes + %d comments older than 90d",
            deleted_likes,
            deleted_comments,
            extra=log_extra(deleted_likes=deleted_likes, deleted_comments=deleted_comments),
        )
    return {"likes": deleted_likes, "comments": deleted_comments}


def _start_cleanup_thread():
    """Spin up a daemon thread that runs the cleanup once on boot, then
    sleeps 24h and repeats. Daemon=True so it doesn't keep the process
    alive on shutdown.

    FIXING_ROADMAP §2.2: the previous gate was
    `if WERKZEUG_RUN_MAIN == "false": return` — backwards. Werkzeug's
    dev reloader sets the var to "true" in the WORKER and leaves it
    UNSET in the PARENT, so the old check skipped on... neither
    process. Under gunicorn on PA the var is also unset, so the
    thread always ran (correct by accident) but with `flask run
    --reload` it ran in BOTH the parent and the child, double-firing
    the cleanup. The correct gate: only run when we're definitely
    not the Werkzeug reloader parent — i.e., the var is `"true"`
    (child worker) OR unset (production WSGI worker). Skip when the
    var is literally any other value (today only `"false"` is used
    by Werkzeug for the parent, but conservatively narrow the
    pass-through condition rather than the skip condition)."""
    werkzeug_run_main = os.getenv("WERKZEUG_RUN_MAIN")
    if werkzeug_run_main is not None and werkzeug_run_main != "true":
        return
    import threading
    import time
    def loop():
        while True:
            _cleanup_feed_orphans()
            time.sleep(86400)  # 24h
    t = threading.Thread(target=loop, daemon=True, name="feed-orphan-cleanup")
    t.start()


_start_cleanup_thread()

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


@app.route("/")
def home():
    """Serve the main Single Page Application (SPA) index file."""
    # ?dev=1 loads source modules directly (live edits, no rebuild) instead of the bundle.
    dev_mode = request.args.get("dev") == "1"
    return render_template("index.html",
                           google_client_id=os.getenv("CLIENT_ID_GOOGLE_AUTH"),
                           google_maps_api_key=os.getenv("GOOGLE_MAPS_API_KEY"),
                           dev_mode=dev_mode,
                           bundle_version=_asset_version("js/app.bundle.js"),
                           css_version=_asset_version("css/index.css"))


# ── FIXING_ROADMAP §4.1 — public share page ──────────────────────────
# The URL the owner pastes into WhatsApp / iMessage / LinkedIn. Renders
# a standalone HTML page (NOT the SPA shell) so link-preview crawlers
# get OG meta tags in the first response, and so a fresh visitor on
# a slow connection sees the trip without downloading the React bundle.
#
# View counter: each visit increments share_views, deduped by an
# anonymous 24h cookie keyed on the token. Refreshing the page or
# coming back the same day doesn't double-count; a new visitor (or
# the same person tomorrow) does.
@app.route("/share/<token>")
def share_page(token):
    payload = fetch_share_payload(token)
    if not payload:
        # Wrong / revoked token. Render a friendly empty page instead
        # of leaking "this trip used to exist" vs "this trip never
        # existed" via differential 404s.
        return render_template(
            "share.html",
            trip={"name": "This trip isn't available", "country": "",
                  "coverUrl": None, "views": 0},
            days=[],
            owner=None,
            cost=None,
            og_description="This trip's share link has expired or been revoked.",
            og_image_url=url_for("static", filename="favicon.svg", _external=True),
            canonical_url=request.url,
        ), 404

    # Dedup by anonymous cookie. The cookie value is just "1" — we
    # don't need to identify the visitor, just whether THIS browser
    # has seen THIS token in the last 24h. The cookie is httponly so
    # JS can't tamper with it; samesite=lax so it follows link clicks
    # from chat apps.
    cookie_name = f"gg_viewed_{token[:16]}"
    has_seen = request.cookies.get(cookie_name) is not None
    if not has_seen:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE trips SET share_views = COALESCE(share_views, 0) + 1 "
                "WHERE share_token = ?",
                (token,),
            )
            conn.commit()
        payload["trip"]["views"] = payload["trip"].get("views", 0) + 1

    # Build the OG description from what's in the payload — keep it
    # short (LinkedIn caps around 200 chars) and lead with the most
    # interesting datum we have. Cost banner wins if enabled, then
    # country, then a generic phrase.
    cost = payload.get("cost")
    if cost and cost.get("total"):
        og_description = (
            f"€{int(cost['total']):,} across {cost.get('dayCount', 0)} days "
            f"in {payload['trip']['country'] or 'the world'}."
        )
    elif payload["trip"].get("country"):
        og_description = (
            f"A trip to {payload['trip']['country']} on The Great Getaway."
        )
    else:
        og_description = "A trip shared on The Great Getaway."

    # OG image — prefer the trip's cover photo (absolute URL needed for
    # crawlers). Cover URLs in the DB are stored relative (e.g.
    # /static/uploads/abc.jpg); convert to absolute against the
    # current request host. Fall back to the favicon SVG which most
    # crawlers can render at preview size.
    cover_rel = payload["trip"].get("coverUrl")
    if cover_rel:
        if cover_rel.startswith("http://") or cover_rel.startswith("https://"):
            og_image_url = cover_rel
        else:
            og_image_url = request.url_root.rstrip("/") + cover_rel
    else:
        og_image_url = url_for("static", filename="favicon.svg", _external=True)

    response = app.make_response(render_template(
        "share.html",
        trip=payload["trip"],
        days=payload["days"],
        owner=payload["owner"],
        cost=payload["cost"],
        og_description=og_description,
        og_image_url=og_image_url,
        canonical_url=request.url,
    ))
    if not has_seen:
        response.set_cookie(
            cookie_name, "1",
            max_age=24 * 60 * 60,
            httponly=True, samesite="Lax",
        )
    return response


@app.route("/components")
def components_preview():
    """Component-system preview page — renders every UI primitive in every
    state (rest / hover / focus-visible / disabled where applicable) at
    both desktop width and iPhone-SE width side by side. Useful for
    visual regression checks and iterating on the design tokens."""
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
    return send_from_directory(app.static_folder, "manifest.json", mimetype="application/manifest+json")


# --- Authentication ---



if __name__ == "__main__":
    # FIXING_ROADMAP §0.6: gate debug mode behind an env var. Production
    # serves through wsgi_pythonanywhere.py:application so this __main__
    # block is normally dormant — but a stray `python main.py` on a
    # server would otherwise expose Werkzeug's interactive debugger,
    # which (post-PIN-prompt) is a remote-code-execution console. Default
    # off; opt in with FLASK_DEBUG=1 in your local dev shell.
    debug_mode = os.getenv("FLASK_DEBUG") == "1"
    app.run(host="0.0.0.0", port=5001, debug=debug_mode)
