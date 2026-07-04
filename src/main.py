import os

from dotenv import load_dotenv
from flask import Flask, render_template, request, send_from_directory, url_for
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename

from auth import current_user_id
from database import get_db, init_db
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
from routes.public import fetch_share_payload
from routes.settings import bp as settings_bp
from routes.settlements import bp as settlements_bp
from routes.templates import bp as templates_bp
from routes.templates import fetch_template_preview
from routes.trip_io import bp as trip_io_bp
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
    """Mirror auth.py's dev-detection so the prod-only boot guards
    below stay consistent with the JWT-secret guard. Dev/test if ANY
    of: FLASK_ENV=development, FLASK_DEBUG=1, or running under pytest.

    MK6 (GG_ALLOW_TEST_LOGIN blast-radius fix): dropped GG_ALLOW_TEST_LOGIN
    from this set. That flag only unlocks the test-login shortcut; letting
    it also skip the CLIENT_ID_GOOGLE_AUTH fail-fast + expose dev-only
    routes widened its blast radius. The Playwright dev server sets
    FLASK_ENV=development explicitly (playwright.config.js)."""
    return (
        os.getenv("FLASK_ENV") == "development"
        or os.getenv("FLASK_DEBUG") == "1"
        or os.getenv("PYTEST_CURRENT_TEST") is not None
    )


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
    return render_template(
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
@limiter.limit("60/minute")
def share_page(token):
    # R10-B6c S1: thread the (possibly None) caller_id so a signed-in
    # viewer who's mutually blocked with the trip owner sees the
    # same friendly empty page as a wrong/revoked token. Anonymous
    # hits (caller_id=None) fall through; share URLs are designed to
    # work for logged-out recipients by definition.
    payload = fetch_share_payload(token, caller_id=current_user_id())
    if not payload:
        # Wrong / revoked token. Render a friendly empty page instead
        # of leaking "this trip used to exist" vs "this trip never
        # existed" via differential 404s.
        return render_template(
            "share.html",
            trip={"name": "This trip isn't available", "country": "", "coverUrl": None, "views": 0},
            days=[],
            owner=None,
            cost=None,
            og_description="This trip's share link has expired or been revoked.",
            og_image_url=url_for("static", filename="favicon.svg", _external=True),
            # R5-B6: canonical url is the clean /share/<token> path.
            # Pre-fix this was `request.url`, which reflected any
            # visitor-appended query string (e.g. /share/<token>?utm=x)
            # into the rendered og:url metatag AND into the clone-CTA
            # href (where the trailing-slash split yielded a polluted
            # "<token>?utm=x" pseudo-token that broke the clone flow).
            canonical_url=url_for("share_page", token=token, _external=True),
        ), 404

    # Dedup by anonymous cookie. The cookie value is just "1" — we
    # don't need to identify the visitor, just whether THIS browser
    # has seen THIS token in the last 24h. The cookie is httponly so
    # JS can't tamper with it; samesite=lax so it follows link clicks
    # from chat apps.
    # R3-Round 3 fix: hash the token before using it as a cookie
    # name suffix. Pre-fix the first 16 chars of the share_token
    # rode in plain text in the `Set-Cookie` header — a determined
    # observer (SW debug, browser DevTools, network log) could lift
    # ~16/22 = 73% of the token from a single share-page response.
    # SHA-256 keeps the dedup property (same token → same cookie
    # name → same dedup window) without leaking any source bytes.
    import hashlib

    cookie_name = f"gg_viewed_{hashlib.sha256(token.encode()).hexdigest()[:16]}"
    has_seen = request.cookies.get(cookie_name) is not None
    if not has_seen:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE trips SET share_views = COALESCE(share_views, 0) + 1 WHERE share_token = ?",
                (token,),
            )
            # R3-Round 3 fix: only mutate the payload when the UPDATE
            # actually wrote a row. If the owner revoked the token
            # between fetch_share_payload and this UPDATE (microsecond
            # race), rowcount=0 — pre-fix the payload still showed
            # `+1` views, a phantom increment the visitor would see
            # in their session that never made it to DB.
            row_count = cursor.rowcount
            conn.commit()
        if row_count == 1:
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
        og_description = f"A trip to {payload['trip']['country']} on The Great Getaway."
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

    response = app.make_response(
        render_template(
            "share.html",
            trip=payload["trip"],
            days=payload["days"],
            owner=payload["owner"],
            cost=payload["cost"],
            og_description=og_description,
            og_image_url=og_image_url,
            # R5-B6: canonical url is the clean /share/<token> path.
            # Pre-fix this was `request.url`, which reflected any
            # visitor-appended query string (e.g. /share/<token>?utm=x)
            # into the rendered og:url metatag AND into the clone-CTA
            # href (where the trailing-slash split yielded a polluted
            # "<token>?utm=x" pseudo-token that broke the clone flow).
            canonical_url=url_for("share_page", token=token, _external=True),
        )
    )
    # R3-Fix #15: don't let intermediaries (CDNs, corp proxies,
    # transparent ISP caches) hold a copy of this response. The
    # body embeds the dedup cookie + view counter — caching it
    # means visitor B downstream sees visitor A's set-cookie +
    # view count rather than incrementing their own.
    response.headers["Cache-Control"] = "private, no-store"
    if not has_seen:
        response.set_cookie(
            cookie_name,
            "1",
            max_age=24 * 60 * 60,
            httponly=True,
            samesite="Lax",
            # R5-B6: Secure flag so the token-hash cookie doesn't
            # leak in cleartext if a visitor's first contact is
            # over http (captive portals, injected http img tags
            # downgrading the connection). HSTS protects most
            # users post-first-visit, but the first visit on a
            # fresh host can still be plain http.
            secure=request.is_secure,
        )
    return response


@app.route("/t/<code>")
@limiter.limit("60/minute")
def template_preview_page(code):
    """Public, server-rendered preview of a Trip Template by code, with a
    "Use this template" CTA that deep-links into the SPA
    (/?fromTemplate=<code>). The SPA's template-intent.ts captures the code
    and instantiates it into a new owned trip after sign-in. Read-only; the
    preview payload is pre-stripped of all sensitive data by construction, so
    nothing private can leak here."""
    preview = fetch_template_preview(code)
    canonical = url_for("template_preview_page", code=code, _external=True)
    og_image = url_for("static", filename="favicon.svg", _external=True)
    status = 200 if preview else 404
    response = app.make_response(
        (
            render_template(
                "template.html",
                preview=preview,
                canonical_url=canonical,
                og_image_url=og_image,
            ),
            status,
        )
    )
    # Same privacy posture as the share page — don't let intermediaries
    # cache a per-code response.
    response.headers["Cache-Control"] = "private, no-store"
    return response


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


# --- Auth-gated user uploads ---------------------------------------------
#
# R2 audit fix: the previous "auth-gate on /static/uploads/" task was
# scoped only at the upload-write side (unguessable 132-bit filename via
# `secrets.token_urlsafe(16)`). The READ side still served via Flask's
# default static handler with zero auth — anyone holding (or guessing,
# or harvesting from an OG-preview, browser history, server log) a URL
# could pull the bytes.
#
# Stronger gate: catch /static/uploads/<user_dir>/<filename> BEFORE the
# default static handler. Tier the access by caller identity:
#
#   1. Caller is signed in           → allow (trusting the unguessable
#                                       filename + the auth wall as
#                                       defense-in-depth; users routinely
#                                       see receipts shared by other
#                                       trip members and we don't want
#                                       to query trip membership on
#                                       every photo render).
#   2. Caller is anonymous           → allow IFF the file is referenced
#                                       by at least one trip with
#                                       is_public=1. Public shares need
#                                       to render their cover + photos
#                                       to anonymous /share/<token>
#                                       viewers; nothing else should
#                                       reach anonymous callers.
#
# The /static/uploads route is registered explicitly so it wins over
# Flask's default /static/<path:filename> rule. The shared base dir is
# UPLOAD_FOLDER (which can be remapped via GG_UPLOAD_ROOT for PA), so
# we serve from there directly rather than via the static_folder
# subdirectory (which may not be the same path on prod).
def _send_upload(relpath: str):
    """MK1 Wave C (T1-5): honour `?size=thumb|display` by serving the
    downscaled variant when one exists, falling back to the original
    (PDFs, animated images, pre-variant uploads, or an original already
    smaller than the requested edge). Called ONLY after serve_upload's
    ACL has passed on the ORIGINAL path — variants inherit exactly the
    original's access control. Unknown size values are ignored."""
    size = request.args.get("size")
    if size in ("thumb", "display"):
        head, name = os.path.split(relpath)
        ext = os.path.splitext(name)[1].lower()
        variant_rel = os.path.join(head, "_variants", f"{name}.{size}{ext}")
        if os.path.isfile(os.path.join(UPLOAD_FOLDER, variant_rel)):
            return send_from_directory(UPLOAD_FOLDER, variant_rel)
    return send_from_directory(UPLOAD_FOLDER, relpath)


@app.route("/static/uploads/<path:relpath>")
def serve_upload(relpath: str):
    from auth import current_user_id

    # R3-Fix #1: pre-fix this called `_extract_token(request)` but the
    # helper takes ZERO arguments, raising TypeError. The bare
    # `except Exception` swallowed it, so every authenticated request
    # silently fell into the anonymous branch and 404'd for the file's
    # own owner. `current_user_id()` does cookie+bearer extraction +
    # verify_token + auth_sessions revocation check internally, returns
    # the user_id string (NOT a dict — `payload.get("sub")` would have
    # AttributeError'd too).
    caller_id = current_user_id()
    needle_exact = f"/static/uploads/{relpath}"
    from database import get_db

    if caller_id:
        # 4.8 audit PLAT-3: gate authenticated reads by ownership +
        # membership. Pre-fix ANY signed-in user could read ANY upload —
        # including expense RECEIPTS — just by holding the URL (harvested
        # from an /api/data or /api/public-trip payload, browser history,
        # or a log), and a removed/declined trip member kept that access
        # FOREVER (files are only deleted when the whole trip/day is).
        # Now:
        #   1. Owner fast-path — the first path segment is the uploader's
        #      secure_filename(user_id); no DB hit for your own files.
        #   2. Else allow only if the caller is an ACCEPTED member of a
        #      trip referencing the file (cover / photos / documents) or
        #      an expense receipt on such a trip.
        #   3. Else fall through to the public-cover check below, so an
        #      authenticated non-member can still render a PUBLIC trip's
        #      cover (same surface an anonymous viewer gets).
        owner_dir = relpath.split('/', 1)[0]
        if owner_dir == secure_filename(caller_id):
            return _send_upload(relpath)
        # Anchored JSON-string match, same shape as the anon cover check.
        _like = f'%"{needle_exact}"%'
        with get_db() as conn:
            c = conn.cursor()
            # MK4 audit MED-4: the original gate ran a `LIKE '%"url"%'`
            # substring scan across EVERY accepted trip's photos_json +
            # documents_json (each up to ~512KB, un-indexable) on every
            # foreign-image render — a per-image scale cliff on a shared
            # gallery. Uploads encode the owner in the path
            # (/static/uploads/<owner_dir>/...), and owner_dir is
            # secure_filename(owner_user_id) — which is the identity for
            # every real user id (Google `sub` = digits; test ids =
            # alnum/hyphen). So resolve the owner via a PRIMARY-KEY lookup
            # and add an indexed trip_members self-join keyed on the owner:
            # only trips where BOTH the caller AND the owner are accepted
            # members can reference the file, which shrinks the candidate
            # set (via idx_trip_members_trip_user) BEFORE the JSON LIKE
            # runs — so the LIKE touches a handful of shared-trip rows
            # instead of all of the caller's trips.
            #
            # Removed-member-loses-access is PRESERVED: the file's trip is
            # only matched when the caller is still an `accepted` member of
            # it (the secondary JSON tightening is kept, not dropped), so a
            # member removed from the file's trip fails the join even if
            # they share an UNRELATED trip with the owner — verified by
            # test_serve_upload_removed_member_denied in test_media_mk4.py.
            #
            # The narrowed query is used only when owner_dir resolves to a
            # real user id (the ~100% case). If it doesn't (a legacy
            # secure_filename-altered id), we fall back to the original
            # caller-only query so no legitimate render regresses.
            c.execute("SELECT id FROM users WHERE id = ?", (owner_dir,))
            owner_row = c.fetchone()
            owner_id = owner_row["id"] if owner_row else None
            if owner_id is not None:
                c.execute(
                    "SELECT 1 FROM trips t "
                    "JOIN trip_members tm_caller "
                    "  ON tm_caller.trip_id = t.id "
                    " AND tm_caller.user_id = ? "
                    " AND tm_caller.invitation_status = 'accepted' "
                    "JOIN trip_members tm_owner "
                    "  ON tm_owner.trip_id = t.id "
                    " AND tm_owner.user_id = ? "
                    " AND tm_owner.invitation_status = 'accepted' "
                    "WHERE (t.cover_url = ? OR t.photos_json LIKE ? "
                    "       OR t.documents_json LIKE ?) "
                    "LIMIT 1",
                    (caller_id, owner_id, needle_exact, _like, _like),
                )
                if c.fetchone():
                    return _send_upload(relpath)
                # Receipts, same owner-narrowed shape.
                c.execute(
                    "SELECT 1 FROM expenses e "
                    "JOIN trip_members tm_caller "
                    "  ON tm_caller.trip_id = e.trip_id "
                    " AND tm_caller.user_id = ? "
                    " AND tm_caller.invitation_status = 'accepted' "
                    "JOIN trip_members tm_owner "
                    "  ON tm_owner.trip_id = e.trip_id "
                    " AND tm_owner.user_id = ? "
                    " AND tm_owner.invitation_status = 'accepted' "
                    "WHERE e.receipt_url = ? LIMIT 1",
                    (caller_id, owner_id, needle_exact),
                )
                if c.fetchone():
                    return _send_upload(relpath)
            else:
                # Fallback: owner_dir didn't map to a real user id (rare
                # legacy secure_filename-altered path). Use the original
                # caller-only gate so a legitimate member still renders it.
                c.execute(
                    "SELECT 1 FROM trips t "
                    "JOIN trip_members tm ON tm.trip_id = t.id "
                    "WHERE tm.user_id = ? AND tm.invitation_status = 'accepted' "
                    "  AND (t.cover_url = ? OR t.photos_json LIKE ? OR t.documents_json LIKE ?) "
                    "LIMIT 1",
                    (caller_id, needle_exact, _like, _like),
                )
                if c.fetchone():
                    return _send_upload(relpath)
                c.execute(
                    "SELECT 1 FROM expenses e "
                    "JOIN trip_members tm ON tm.trip_id = e.trip_id "
                    "WHERE tm.user_id = ? AND tm.invitation_status = 'accepted' "
                    "  AND e.receipt_url = ? LIMIT 1",
                    (caller_id, needle_exact),
                )
                if c.fetchone():
                    return _send_upload(relpath)
        # Not owner, not a member of any referencing trip → fall through
        # to the public-cover check (a public trip's cover is readable by
        # anyone, authenticated or not). Don't 404 yet.

    # Anonymous (or authenticated-non-member) branch — allow when at
    # least one trip with PUBLIC reach references the file as its cover.
    # "Public reach" = is_public=1 (Explore feed) OR share_token IS NOT
    # NULL (share-link surface).
    #
    # R3-Fix #13: pre-fix this only checked is_public=1. Share-only
    # trips (share_token set but is_public=0) rendered as broken images
    # to every recipient because the cover_url all 404'd through the SW.
    #
    # R3-Fix #22: cover_url is matched by exact-equality so a malicious
    # owner who plants a scheme-prefixed pollution string can't match.
    with get_db() as conn:
        cursor = conn.cursor()
        # R5-B1: anonymous viewers can ONLY fetch a trip's cover_url
        # (the share + explore templates only render the cover; photos
        # and documents are members-only by contract). Pre-fix the
        # photos_json / documents_json LIKE clauses widened the anon
        # surface to every photo/document on any public-or-shared trip
        # — fine when nothing links to them, but a defense-in-depth
        # liability if a future template tweak, OG-crawler log, or
        # browser-history leak ever exposes a deep URL. Anon stays
        # cover-only; authenticated members get the rest via the
        # session_user_id branch above (which already gates by membership
        # and includes the photos/documents matches).
        cursor.execute(
            "SELECT 1 FROM trips "
            "WHERE (is_public = 1 OR share_token IS NOT NULL) "
            "  AND cover_url = ? "
            "LIMIT 1",
            (needle_exact,),
        )
        if cursor.fetchone():
            return _send_upload(relpath)
    # Anonymous + no public-trip reference → 404 (don't differentiate
    # from "file doesn't exist" to avoid leaking the existence of
    # private uploads via status-code differential).
    from flask import abort

    abort(404)


# --- Authentication ---


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
