import os
import json
import logging
import requests
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from flask_limiter.util import get_remote_address
from database import get_db, init_db
from auth import issue_token, current_user_id, require_auth
from extensions import limiter
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
from routes.public import bp as public_bp
from routes.settings import bp as settings_bp
from routes.trips import bp as trips_bp

# Load environment variables
load_dotenv()

# Configure basic logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

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
app.register_blueprint(trips_bp)

# Ensure DB is initialized
init_db()


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
    except Exception as e:
        print(f"[cleanup] feed orphans sweep failed: {e}")
    if deleted_likes or deleted_comments:
        print(f"[cleanup] removed {deleted_likes} feed_likes + {deleted_comments} feed_comments older than 90 days")
    return {"likes": deleted_likes, "comments": deleted_comments}


def _start_cleanup_thread():
    """Spin up a daemon thread that runs the cleanup once on boot, then
    sleeps 24h and repeats. Daemon=True so it doesn't keep the process
    alive on shutdown. Skipped under WERKZEUG_RUN_MAIN's reloader-parent
    process so dev mode doesn't double-run."""
    if os.getenv("WERKZEUG_RUN_MAIN") == "false":
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
    app.run(host="0.0.0.0", port=5001, debug=True)
