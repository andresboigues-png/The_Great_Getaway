import os
import json
import secrets
import sqlite3
import requests
from flask import Flask, g, render_template, request, jsonify, send_from_directory, url_for
from werkzeug.middleware.proxy_fix import ProxyFix
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
from routes.pdf import bp as pdf_bp
from routes.public import bp as public_bp, fetch_share_payload
from routes.settings import bp as settings_bp
from routes.settlements import bp as settlements_bp
from routes.templates import bp as templates_bp, fetch_template_preview
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
app = Flask(__name__,
            template_folder="../frontend/templates",
            static_folder="../frontend/static")

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
    app.wsgi_app, x_for=_trusted_proxies, x_proto=_trusted_proxies,
    x_host=_trusted_proxies, x_prefix=_trusted_proxies,
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
IMPORT_MAX_CONTENT_LENGTH = 64 * 1024 * 1024  # 64 MB

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


# ── Security headers (FIXING_ROADMAP §0.4) ───────────────────────────
# Content-Security-Policy is the headline addition. With it in place,
# any future XSS oversight (post §0.1's escape pass) can't ship its
# stolen tokens to attacker-controlled domains — the browser blocks
# the outbound fetch. It also stops an injection from loading scripts
# from anywhere outside the explicit allowlist below, so the worst
# case shrinks from "full account takeover" to "in-page DOM mischief
# that can't talk to the network."
#
# Tightened to NONCES on 2026-05-17 (§0.4 v2). The first-pass CSP
# kept `'unsafe-inline'` for scripts because index.html has three
# inline `<script>` blocks (Sentry init, early-theme paint, Google
# globals); the nonce strategy now lets those three blocks through
# while still blocking attacker-injected `<script>` elements. The
# nonce regenerates per request via `_attach_csp_nonce` below, and
# the templates pick it up via the `csp_nonce` Jinja variable.
#
# Style-src STILL keeps `'unsafe-inline'`: the codebase has hundreds
# of inline `style="..."` attributes (mostly in index.html's sidebar
# / modal scaffolds), and tightening would require either (a) hashing
# every distinct inline style — brittle and exhausting — or (b) the
# bigger refactor of extracting them into the per-page CSS chunks
# from §3.1. Queued as its own slice.
#
# Allowlist rationale, by directive:
#   script-src + script-src-elem
#     - 'nonce-<csp_nonce>': inline scripts in index.html (3 blocks).
#       Browsers IGNORE 'unsafe-inline' when a nonce is also listed,
#       so inline scripts NOT carrying the nonce are blocked. This is
#       the whole point of the upgrade.
#     - accounts.google.com: Google Identity Services (gsi/client)
#     - maps.googleapis.com:  Maps JS SDK
#     - cdn.jsdelivr.net:     chart.js + xlsx CDN bundles
#     - *.sentry-cdn.com:     Sentry loader script
#       External scripts loaded by `src=` match the URL allowlist
#       without needing a nonce, so we DON'T have to thread the nonce
#       into every <script src="..."> tag — only the inline blocks.
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
#     - api.frankfurter.app + api.frankfurter.dev: currency rates.
#       Frankfurter migrated .app -> .dev/v1 (the .app host now 301s);
#       we keep BOTH whitelisted so a direct .dev fetch AND any stray
#       .app->.dev redirect both pass CSP (the browser re-checks CSP on
#       the redirect target).
#     - api.worldbank.org: annual CPI (FP.CPI.TOTL) for the Insights
#       "Worth today" inflation calc, fetched browser-direct.
#     - *.sentry.io / *.ingest.sentry.io: Sentry telemetry endpoint
#     - raw.githubusercontent.com: natural-earth GeoJSON country
#       outlines for the FootprintMap on the profile (fetched once
#       at module load). CSP doesn't support path-prefix scoping,
#       so the origin grant is as tight as the spec allows.
#     - (Unsplash images load via <img src=...> which is governed by
#       img-src above, NOT connect-src, so no entry needed here.)
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

@app.before_request
def _raise_import_upload_limit():
    """MK6 P2: lift the 10 MB body cap for /api/trips/import only, so a media-
    bearing trip export can actually be re-imported. Runs before the handler
    touches request.files, so Werkzeug's multipart parser uses the larger cap
    for this one route; every other route keeps the tight 10 MB default."""
    if request.method == "POST" and request.path == "/api/trips/import":
        request.max_content_length = IMPORT_MAX_CONTENT_LENGTH


@app.before_request
def _attach_csp_nonce():
    """Generate a fresh, cryptographically-random nonce for every
    request and stash it on `flask.g`. Both the after_request CSP
    builder and the template context processor read it from there,
    so the same value lands in (a) the response's CSP header and (b)
    every `<script nonce="...">` attribute rendered into the page.

    16 url-safe bytes → 22 base64 chars: well above the 128-bit
    entropy threshold the CSP spec recommends, and short enough that
    the extra header bytes are imperceptible.
    """
    g.csp_nonce = secrets.token_urlsafe(16)


# Audit fix (2026-05-27): CSRF defense-in-depth via Origin/Referer
# header check on every mutating request. Pre-fix the only CSRF
# defense was the SameSite=Lax flag on the session cookie — which
# blocks most cross-site POSTs but has known edge cases (top-frame
# form submissions in legacy browsers, sub-domain leakage). Now
# we also reject any non-GET request whose Origin (preferred) or
# Referer (fallback) doesn't match the request's own host.
#
# Excluded from the check:
#   - GET / HEAD / OPTIONS — read-only, can't mutate state
#   - /api/auth/google — the OAuth callback flow legitimately
#     arrives without a same-origin Origin in some browser configs;
#     it's protected by Google's signed ID-token verification, which
#     is a stronger contract than Origin matching.
#   - /api/fx-rates GET (no auth, read-only) and other GET routes.

_CSRF_EXEMPT_PATHS = frozenset({
    "/api/auth/google",
    # R12-B1: the browser POSTs CSP violation reports here WITHOUT a
    # matching Origin/Referer (reports are sent uncredentialed, often
    # with a `null` Origin), so the same-origin CSRF gate would 403
    # every report. Safe to exempt: the endpoint only logs a bounded
    # body, mutates nothing, and is rate-limited (30/min).
    "/api/csp-report",
})


def _host_matches(value: str | None) -> bool:
    """True iff the given Origin or Referer URL is same-origin with
    the current request's host. Compares scheme+host+port (port is
    omitted when it's the protocol default). Empty / malformed
    inputs return False."""
    if not value:
        return False
    try:
        from urllib.parse import urlparse
        parsed = urlparse(value)
    except (ValueError, TypeError):
        return False
    if not parsed.scheme or not parsed.netloc:
        return False
    expected = request.host_url.rstrip("/")
    # Origin sends `scheme://host[:port]` (no path); Referer sends
    # the full URL. Reconstruct just the origin portion of the
    # value to compare.
    value_origin = f"{parsed.scheme}://{parsed.netloc}"
    return value_origin == expected


@app.before_request
def _csrf_origin_check():
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return None
    if request.path in _CSRF_EXEMPT_PATHS:
        return None
    # Pure-Bearer-token requests (no cookie attached) come from
    # non-browser clients — they can't be CSRF'd in the traditional
    # sense because the attacker would need to know the token.
    # Skip the Origin check for those; the JWT itself is the auth
    # boundary.
    has_cookie = bool(request.cookies.get("gg_session"))
    if not has_cookie:
        return None
    origin = request.headers.get("Origin")
    referer = request.headers.get("Referer")
    # R2 audit fix: when the request carries the gg_session cookie
    # (so we're past the Bearer-only short-circuit above), require
    # at least ONE of Origin / Referer to be present AND match.
    # Pre-fix we allowed "both missing" through as test-client
    # compat — that left a real bypass: a privacy extension that
    # strips both headers on a victim's browser turned every
    # mutating cookie-auth POST into a free CSRF. Test clients
    # don't carry the session cookie (they use the Authorization
    # header), so they fall into the Bearer short-circuit above
    # and are unaffected.
    if origin is None and referer is None:
        return jsonify({
            "error": "Cross-origin request rejected (missing Origin/Referer)",
        }), 403
    if _host_matches(origin) or _host_matches(referer):
        return None
    # Hard block. JSON so the frontend's fetch error handler
    # surfaces a clean message rather than HTML.
    return jsonify({"error": "Cross-origin request rejected"}), 403


@app.context_processor
def _inject_csp_nonce():
    """Expose `csp_nonce` to every Jinja template so `<script
    nonce="{{ csp_nonce }}">` resolves to the same value that the
    after_request hook embeds in the CSP header.

    The `getattr` fallback returns '' on edge paths that bypass
    before_request (e.g. template render during test setup outside
    a request context). With no nonce on those scripts AND no
    `'unsafe-inline'` in the policy, they'd be blocked — but those
    paths don't render `<script>` tags, so the empty string is fine.
    """
    return {"csp_nonce": getattr(g, "csp_nonce", "")}


@app.after_request
def _gzip_response(response):
    """MK3-10: gzip large text/JSON responses. `/api/data` is JSON (~85%
    compressible) and shipped uncompressed on every 15s poll. Registered
    before add_security_headers so it runs LAST (Flask runs after_request in
    reverse registration order) — i.e. it's the final body transform.

    Skips: clients that don't accept gzip, already-encoded or streamed
    (`direct_passthrough`, e.g. PDF/file downloads) responses, non-compressible
    content types, and tiny bodies. Wrapped in try/except so a compression
    failure can never corrupt a response (falls back to uncompressed)."""
    try:
        if "gzip" not in (request.headers.get("Accept-Encoding") or "").lower():
            return response
        if response.direct_passthrough or response.headers.get("Content-Encoding"):
            return response
        ctype = response.headers.get("Content-Type", "") or ""
        if not (
            ctype.startswith("application/json")
            or ctype.startswith("text/")
            or "javascript" in ctype
        ):
            return response
        body = response.get_data()
        if len(body) < 1024:  # not worth the CPU for tiny bodies
            return response
        import gzip as _gzip
        compressed = _gzip.compress(body, 6)
        response.set_data(compressed)
        response.headers["Content-Encoding"] = "gzip"
        response.headers["Content-Length"] = str(len(compressed))
        vary = response.headers.get("Vary")
        response.headers["Vary"] = (
            f"{vary}, Accept-Encoding" if vary else "Accept-Encoding"
        )
    except Exception:
        return response
    return response


@app.after_request
def add_security_headers(response):
    nonce = getattr(g, "csp_nonce", "")
    # Defensive: every request goes through before_request first, so
    # `g.csp_nonce` should always be set by the time we reach here.
    # The fallback covers edge cases (e.g. an error handler that fires
    # before before_request runs) without leaving CSP in a broken state.
    if not nonce:
        nonce = secrets.token_urlsafe(16)
    nonce_src = f"'nonce-{nonce}'"

    response.headers.setdefault(
        "Content-Security-Policy",
        "; ".join([
            "default-src 'self'",
            (
                f"script-src 'self' {nonce_src} "
                "https://accounts.google.com "
                "https://maps.googleapis.com "
                "https://cdn.jsdelivr.net "
                "https://*.sentry-cdn.com"
            ),
            (
                f"script-src-elem 'self' {nonce_src} "
                "https://accounts.google.com "
                "https://maps.googleapis.com "
                "https://cdn.jsdelivr.net "
                "https://*.sentry-cdn.com"
            ),
            # accounts.google.com — Google Identity Services injects a
            # stylesheet (gsi/style) for the sign-in button. Without
            # this entry the console fills with CSP violations and the
            # button renders unstyled. See FIXING_ROADMAP §0.4 follow-up.
            "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data: https://fonts.gstatic.com",
            (
                # R11-B7 (P3): tightened connect-src. Removed
                # `images.unsplash.com` — Unsplash photos are loaded via
                # <img src=...> tags (img-src 'https:' covers them); no
                # JS fetch() ever hits that origin, so the connect-src
                # entry was dead permission. Kept `raw.githubusercontent.com`
                # — FootprintMap pulls the natural-earth GeoJSON country
                # outlines from `/nvkelso/natural-earth-vector/master/`
                # at module load. CSP can't narrow to a path prefix
                # (origin granularity only), so the origin grant stays;
                # the JSON parse itself is safe (no eval, structured
                # GeoJSON consumed by maplibre-gl). If we ever vendor
                # the GeoJSON into our static assets, this entry can
                # come out entirely.
                "connect-src 'self' "
                "https://accounts.google.com "
                "https://*.googleapis.com "
                "https://api.frankfurter.app "
                "https://api.frankfurter.dev "
                "https://api.worldbank.org "
                "https://raw.githubusercontent.com "
                # cdn.jsdelivr.net is already trusted in script-src (it serves
                # the Chart.js + XLSX bundles); allow connect-src too so the
                # browser can fetch their `.js.map` source maps when devtools
                # is open (CSP was blocking the .map fetch — dev-only noise).
                "https://cdn.jsdelivr.net "
                "https://*.sentry.io "
                "https://*.ingest.sentry.io"
            ),
            "frame-src https://accounts.google.com",
            "worker-src 'self'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            # R12-B1: report violations to our own endpoint so a blocked
            # script / an XSS attempt / a CDN url that silently shifted
            # produces a server-side log line instead of failing into the
            # void. `report-uri` is the widely-supported (if deprecated)
            # directive; `report-to` needs a companion Report-To header +
            # endpoint group that not all targets honour yet, so we ship
            # the simpler one. The route is same-origin + rate-limited.
            "report-uri /api/csp-report",
        ]),
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Referrer-Policy", "strict-origin-when-cross-origin",
    )
    # Audit fix (2026-05-27): HSTS on HTTPS requests. Pre-fix the
    # only HTTPS pinning was via the Secure cookie flag — a
    # downgrade-to-HTTP attack would have nothing to push back
    # against. 6 months is the standard middle ground (Google + the
    # major preload lists ask for at least 6 months); includeSubDomains
    # because tgg.app + every future subdomain is served by the same
    # backend. Only set on a secure request — sending HSTS over plain
    # HTTP would be ignored by the browser anyway, and we want local
    # http://localhost dev to remain reachable.
    if request.is_secure:
        # R11-B5: added `; preload` so we're preload-eligible once tgg.app
        # is ready and an operator submits to hstspreload.org. Until then
        # the directive is a no-op (it doesn't affect browser HSTS
        # caching for already-visited sites; only the first-time
        # cold-visit downgrade window is closed by preload list inclusion).
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=15768000; includeSubDomains; preload",
        )
    # Audit fix (2026-05-27, REVISED 2026-05-28): Cross-Origin-Opener-Policy.
    # `same-origin` puts the document in its own browsing context
    # group, isolating it from other tabs / popups that link back
    # via window.opener. Without this, a malicious page opened
    # from a Maps Place click could read window.name and other
    # cross-context state.
    #
    # ORIGINAL COMMENT WAS WRONG: claimed "Google Sign-In already
    # supports same-origin via the redirect flow we use" — but we
    # actually use the POPUP flow (GIS One Tap + renderButton). With
    # COOP `same-origin`, the GSI popup at accounts.google.com tries
    # to `window.opener.postMessage(...)` the credential back after
    # the user picks an account; COOP severs the opener relationship
    # and the message is lost. Symptom: popup hangs blank at
    # `accounts.google.com/gsi/transform`, our page never receives
    # the callback, login appears broken with no errors.
    #
    # Switch to `same-origin-allow-popups` — keeps the isolation from
    # arbitrary cross-origin opens (the Maps Place click threat
    # model still holds) while letting OUR explicitly-opened popups
    # (Google Sign-In) talk back via postMessage. Standard choice
    # for sites that use OAuth-style popups.
    response.headers.setdefault(
        "Cross-Origin-Opener-Policy", "same-origin-allow-popups",
    )
    # R11-B5: Permissions-Policy. Even if a hypothetical XSS slips past
    # CSP's nonce gate, the attacker still can't call sensitive browser
    # APIs we never use — geolocation (we use Google Places for trip
    # geocoding instead), microphone/camera (no audio/video features),
    # payment (no Payment Request integration), USB/MIDI/HID (no
    # hardware features). Each disabled directive shrinks the post-XSS
    # blast radius by one capability. `=()` means "denied for all
    # origins" including self.
    response.headers.setdefault(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=(), payment=(), "
        "usb=(), midi=(), hid=(), accelerometer=(), gyroscope=(), "
        "magnetometer=()",
    )
    return response


# ── Global error handler ─────────────────────────────────────────────
# R11-B3: catch any uncaught Exception that escapes the route handlers
# and return a JSON envelope the frontend's apiFetch can actually parse.
# Pre-fix, an unexpected route crash gave Flask's default HTML 500 page;
# apiFetch would then `await res.json()` and throw on the HTML, producing
# a generic "network error" toast instead of the real 500 signal — AND
# the operator never saw the actual exception in Sentry because the
# HTML page short-circuited the JSON-shaped logger chain.
#
# Also stops a stack trace from leaking if FLASK_DEBUG=1 ever lands
# in prod by accident (FLASK_DEBUG renders the interactive debugger
# page, which exposes server-side paths + environment).
#
# 4xx HTTPException subclasses (404, 403, etc.) pass through unchanged
# so Flask's own JSON handlers + route-level returns keep their shape.

from werkzeug.exceptions import HTTPException


@app.errorhandler(HTTPException)
def _handle_http_exception(e):
    """Pass-through for routes that explicitly raise an HTTPException
    (abort(404), abort(403), etc.). Returns the same JSON shape every
    /api/* route uses so the frontend has one error contract."""
    return jsonify({
        "error": e.description or e.name,
        "status": e.code,
    }), (e.code or 500)


@app.errorhandler(Exception)
def _handle_uncaught_exception(e):
    """Catches every Exception NOT already handled by an HTTPException
    handler. Logs with exc_info so Sentry's LoggingIntegration captures
    the stack; returns a generic JSON 500 with NO traceback so we don't
    leak internals to the client.

    `request_id` (when present) lets the user paste a request id back
    to support / operator triage."""
    from flask import g, has_request_context
    request_id = None
    try:
        if has_request_context():
            request_id = getattr(g, "request_id", None)
    except Exception:
        pass
    logger.error(
        "uncaught exception: %s",
        e,
        exc_info=True,
        extra={"request_id": request_id} if request_id else None,
    )
    payload = {"error": "Internal server error", "status": 500}
    if request_id:
        payload["requestId"] = request_id
    return jsonify(payload), 500


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
    """Delete feed_likes and feed_comments rows that refer to a
    synthesised event_id whose underlying record no longer exists.
    Bookmarks are exempt — saves are permanent. Also sweeps read
    notifications older than 30 days + revoked auth_sessions older
    than 30 days.

    R2 audit fix: the previous implementation was an AGE-ONLY sweep
    ("delete everything older than 90 days") which destroyed
    engagement on EVERGREEN content. A friend's share that stays
    actively discussed for >90 days had every old comment silently
    deleted, and the visible comment_count dropped without
    explanation. The DOCSTRING claimed orphan-only behaviour; the
    IMPLEMENTATION did age-only.

    Now genuinely orphan-only:
      - share_<n> / repost_<n>  → drop when feed_posts.id = n is gone
      - settled_up_<n>          → drop when settlements.id = n is gone
      - trip_*_<id>             → drop when trips.id = id is gone
      - friendship_<a>_<b>      → drop when neither side exists in
                                  follows anymore
      - achievement_<n>         → drop when user_achievements.id = n
                                  is gone
    Plus a 365-day backstop on any engagement row regardless of event
    type, so rows for unknown / future event types don't accrue
    forever. 365 ≫ the 30-day display window so legitimate engagement
    on an evergreen event still has plenty of headroom.

    Audit fix (2026-05-27): added notification + auth_sessions sweep
    too.
    """
    deleted_likes = 0
    deleted_comments = 0
    deleted_notifications = 0
    deleted_sessions = 0
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # Orphan cleanup: delete rows whose event_id no longer
            # resolves to a live record. Apply per-event-type because
            # the synthesised id encodes the parent table+id.
            orphan_where = """
                -- share_<n> + repost_<n> point at feed_posts.id
                (
                    (event_id LIKE 'share\\_%' ESCAPE '\\'
                     OR event_id LIKE 'repost\\_%' ESCAPE '\\')
                    AND CAST(SUBSTR(event_id, INSTR(event_id, '_') + 1) AS INTEGER)
                        NOT IN (SELECT id FROM feed_posts)
                )
                OR (
                    -- settled_up_<n> points at settlements.id
                    event_id LIKE 'settled\\_up\\_%' ESCAPE '\\'
                    AND SUBSTR(event_id, LENGTH('settled_up_') + 1)
                        NOT IN (SELECT id FROM settlements)
                )
                OR (
                    -- achievement_<n> points at user_achievements.id
                    event_id LIKE 'achievement\\_%' ESCAPE '\\'
                    AND CAST(SUBSTR(event_id, LENGTH('achievement_') + 1) AS INTEGER)
                        NOT IN (SELECT id FROM user_achievements)
                )
                OR (
                    -- trip_created_<id> / trip_archived_<id> /
                    -- trip_joined_<id>_<user> — extract the trip id
                    -- between the second underscore and the next
                    -- underscore (or end). Easier: check that no
                    -- live trip's id appears as a substring of the
                    -- event_id; cheap because trips count is small.
                    event_id LIKE 'trip\\_%' ESCAPE '\\'
                    AND NOT EXISTS (
                        SELECT 1 FROM trips t
                        WHERE event_id LIKE 'trip\\_%\\_' || t.id ESCAPE '\\'
                           OR event_id LIKE 'trip\\_%\\_' || t.id || '\\_%' ESCAPE '\\'
                    )
                )
                -- 365-day age backstop for rows whose event_id shape
                -- isn't covered above (friendship_*, achievement_*,
                -- future types). R3-Fix #9: pre-fix this read
                -- `OR created_at < datetime('now', '-365 days')`
                -- which matched EVERY row regardless of event_id —
                -- including legitimate engagement on known event
                -- shapes whose parent record was still very much
                -- alive. Result: a 365d+1 day-old like on a still-
                -- public share got wiped. Now: only fires when the
                -- event_id is none of the known prefixes (catches
                -- truly-orphaned future shapes without harming the
                -- known ones, which already have their orphan
                -- predicate above).
                OR (
                    event_id NOT LIKE 'share\\_%' ESCAPE '\\'
                    AND event_id NOT LIKE 'repost\\_%' ESCAPE '\\'
                    AND event_id NOT LIKE 'settled\\_up\\_%' ESCAPE '\\'
                    AND event_id NOT LIKE 'achievement\\_%' ESCAPE '\\'
                    AND event_id NOT LIKE 'trip\\_%' ESCAPE '\\'
                    AND created_at < datetime('now', '-365 days')
                )
            """
            cursor.execute(f"DELETE FROM feed_likes WHERE {orphan_where}")
            deleted_likes = cursor.rowcount or 0
            cursor.execute(f"DELETE FROM feed_comments WHERE {orphan_where}")
            deleted_comments = cursor.rowcount or 0
            # Read notifications older than 30 days. Unread rows stay
            # so the user's bell keeps surfacing them until they
            # acknowledge. Audit #31: pre-fix notifications grew
            # forever — only the LIMIT 50 in /api/notifications/list
            # hid them from the UI.
            cursor.execute(
                "DELETE FROM notifications WHERE is_read = 1 "
                "AND created_at < datetime('now', '-30 days')"
            )
            deleted_notifications = cursor.rowcount or 0
            # Revoked auth_sessions older than 30 days. After per-
            # device logout (fix #50) rows pile up forever; once the
            # JWT has expired (30-day lifetime) the row is no longer
            # useful for the verify path.
            cursor.execute(
                "DELETE FROM auth_sessions WHERE revoked_at IS NOT NULL "
                "AND revoked_at < datetime('now', '-30 days')"
            )
            deleted_sessions = cursor.rowcount or 0
            # BUG-022: also reap UNREVOKED sessions whose 30-day JWT has expired.
            # Most logins are never explicitly revoked (the tab just closes), so
            # the unrevoked-but-expired rows dominate and grew the table
            # unbounded; the token can't authenticate past 30 days anyway.
            cursor.execute(
                "DELETE FROM auth_sessions WHERE revoked_at IS NULL "
                "AND created_at < datetime('now', '-30 days')"
            )
            deleted_sessions += cursor.rowcount or 0
            conn.commit()
    except sqlite3.DatabaseError as e:
        # §2.15: narrow to DB errors so the daemon thread doesn't
        # silently swallow programming bugs (NameError, ImportError,
        # etc.) — those should crash the thread loudly. DatabaseError
        # is the right catch-all for "DB had a hiccup" (locked, disk
        # full, file moved) and recoverable on the next iteration.
        # §3.8: structured logging — flows into Sentry as a breadcrumb
        # (and as an event at ERROR level).
        logger.warning("background cleanup sweep failed: %s", e, exc_info=True)
    if deleted_likes or deleted_comments or deleted_notifications or deleted_sessions:
        logger.info(
            "background cleanup removed: likes=%d comments=%d "
            "notifications=%d sessions=%d",
            deleted_likes,
            deleted_comments,
            deleted_notifications,
            deleted_sessions,
            extra=log_extra(
                deleted_likes=deleted_likes,
                deleted_comments=deleted_comments,
                deleted_notifications=deleted_notifications,
                deleted_sessions=deleted_sessions,
            ),
        )
    return {
        "likes": deleted_likes,
        "comments": deleted_comments,
        "notifications": deleted_notifications,
        "sessions": deleted_sessions,
    }


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
    # R12-B5: single-worker gate. The WERKZEUG_RUN_MAIN check above only
    # handles the dev reloader's parent/child double-fire — under
    # gunicorn with N>1 workers (PA paid plans) the var is unset in
    # every worker, so each one spun up its own 24h cleanup loop →
    # concurrent DELETE storms once a day. Harmless (the queries are
    # idempotent) but wasteful. An advisory file lock elects ONE worker:
    # the first to grab the exclusive non-blocking lock keeps it for the
    # process lifetime + runs the loop; the rest skip. fcntl.flock is
    # POSIX (PA is Linux); on a non-POSIX host we fall through and run
    # unconditionally — still correct because the cleanup is idempotent.
    # Tradeoff: if the elected worker dies mid-life the cleanup pauses
    # until a full app restart re-elects one — acceptable for a daily
    # janitor (worst case: one missed 24h cycle).
    global _CLEANUP_LOCK_FD
    try:
        import fcntl
        import tempfile as _tempfile
        _lock_path = os.path.join(_tempfile.gettempdir(), "gg_feed_cleanup.lock")
        _CLEANUP_LOCK_FD = open(_lock_path, "w")  # noqa: SIM115 — held for process life
        fcntl.flock(_CLEANUP_LOCK_FD.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except ImportError:
        pass  # non-POSIX — run unconditionally (idempotent)
    except (OSError, BlockingIOError):
        # Another worker holds the lock → it owns the cleanup. Skip.
        return
    import threading
    import time
    def loop():
        while True:
            _cleanup_feed_orphans()
            time.sleep(86400)  # 24h
    t = threading.Thread(target=loop, daemon=True, name="feed-orphan-cleanup")
    t.start()


# Module-level so the advisory-lock fd survives for the process
# lifetime — closing it (or letting it GC) would release the flock and
# let a second worker elect itself on its next boot attempt.
_CLEANUP_LOCK_FD = None
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


@app.route("/healthz")
@limiter.limit("60/minute")
def healthz():
    """R9-F4: liveness + readiness probe for uptime monitors.
    Returns 200 + a small JSON envelope when the app is alive and
    the DB responds to a trivial SELECT. Returns 503 if the DB
    ping fails — useful for monitors to alert on "WSGI is up but
    something downstream is broken" (e.g. PA filesystem hiccup,
    alembic migration mid-flight, sqlite locked by a long write).

    No auth — this endpoint is intentionally public so external
    monitors (UptimeRobot, Better Uptime, Pingdom, etc.) can poll
    without holding a session token. Response carries NO sensitive
    info: just status + release SHA (already public via Sentry
    breadcrumbs in production errors) + alembic head (already
    public via the migrations dir in the repo). No user counts,
    no env vars, no path info.

    Rate-limited to 60/min/IP so a misconfigured monitor (or a
    bored actor) can't hammer it into a writer-lock contention
    storm. UptimeRobot's free tier polls every 5 min anyway.

    Operator note: alert on (status != 'ok') OR (HTTP != 200) —
    don't alert on 'release' or 'alembicHead' value changes
    (those flap on every deploy + may be missing in some
    environments).
    """
    from observability import resolve_release
    from database import get_db
    release = resolve_release() or "unknown"
    # DB ping — cheapest query that exercises the connection +
    # confirms the FD is real (not a stale PA worker socket).
    db_ok = False
    write_ok = False
    alembic_head = None
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            # Pull the current alembic revision (best-effort —
            # absent on a pre-migrations DB, which is also valid).
            try:
                cursor.execute(
                    "SELECT version_num FROM alembic_version LIMIT 1"
                )
                row = cursor.fetchone()
                alembic_head = row["version_num"] if row else None
            except Exception:
                pass
            db_ok = True
    except Exception as e:
        # Don't leak the exception text — could include a path or
        # connection string fragment. Log it for operator triage.
        from observability import get_logger
        get_logger("gg.health").warning("healthz db ping failed: %s", e)

    # R12-B1: write-capability probe. A SELECT-only ping returns 200
    # even when the DB is READ-ONLY (disk full, read-only mount — PA's
    # classic failure mode), so every POST 500s while uptime monitoring
    # thinks we're healthy. `BEGIN IMMEDIATE` forces SQLite to acquire
    # the RESERVED write lock immediately; on a read-only DB it raises
    # ("attempt to write a readonly database" / "disk I/O error").
    # ROLLBACK releases without persisting anything — no data mutated,
    # no schema needed, no journal churn. We use a dedicated autocommit
    # connection (isolation_level=None) so Python's sqlite3 doesn't
    # auto-wrap our explicit BEGIN in its own transaction.
    if db_ok:
        import sqlite3 as _sqlite3
        from database import _db_path, BUSY_TIMEOUT_MS
        _probe = None
        try:
            _probe = _sqlite3.connect(_db_path(), isolation_level=None)
            _probe.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
            _probe.execute("BEGIN IMMEDIATE")
            _probe.execute("ROLLBACK")
            write_ok = True
        except Exception as e:
            from observability import get_logger
            get_logger("gg.health").warning(
                "healthz write probe failed (DB may be read-only): %s", e
            )
        finally:
            if _probe is not None:
                try:
                    _probe.close()
                except Exception:
                    pass

    healthy = db_ok and write_ok
    payload = {
        "status": "ok" if healthy else "degraded",
        "release": release,
        "alembicHead": alembic_head,
        # Expose both legs so a monitor can tell "DB unreachable" from
        # "DB reachable but read-only".
        "dbRead": db_ok,
        "dbWrite": write_ok,
    }
    return jsonify(payload), (200 if healthy else 503)


@app.route("/api/csp-report", methods=["POST"])
@limiter.limit("30/minute")
def csp_report():
    """R12-B1: CSP violation sink. Browsers POST a JSON body
    (`application/csp-report` or `application/reports+json`) here when
    a directive blocks something. We log it as a structured WARNING so
    a blocked script / XSS attempt / shifted-CDN url surfaces in the
    operator log + Sentry instead of failing silently.

    Defensive:
    - Bounded body read (CSP reports are tiny; reject anything large to
      avoid a log-spam DoS via a crafted oversized report).
    - 30/min limit caps a misbehaving / malicious client hammering it.
    - Always 204 (no content) regardless — the browser doesn't care
      about the response, and we never want this endpoint to 500 and
      pollute the 5xx rate.
    """
    try:
        raw = request.get_data(cache=False, as_text=True) or ""
        if len(raw) > 4096:
            raw = raw[:4096] + "…(truncated)"
        from observability import get_logger
        get_logger("gg.csp").warning("CSP violation report: %s", raw)
    except Exception:
        # Never let the report sink itself error — it'd inflate the
        # 5xx rate the CSP report was supposed to help us watch.
        pass
    return ("", 204)


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
                           css_version=_asset_version("css/index.css"),
                           # §0.4 follow-up: Tailwind v4 bundled CSS lives
                           # at /static/js/assets/main.css (stable name
                           # via vite.config's assetFileNames). Same
                           # mtime-based cache-buster pattern.
                           tailwind_css_version=_asset_version("js/assets/main.css"))


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
            trip={"name": "This trip isn't available", "country": "",
                  "coverUrl": None, "views": 0},
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
                "UPDATE trips SET share_views = COALESCE(share_views, 0) + 1 "
                "WHERE share_token = ?",
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
        # R5-B6: canonical url is the clean /share/<token> path.
        # Pre-fix this was `request.url`, which reflected any
        # visitor-appended query string (e.g. /share/<token>?utm=x)
        # into the rendered og:url metatag AND into the clone-CTA
        # href (where the trailing-slash split yielded a polluted
        # "<token>?utm=x" pseudo-token that broke the clone flow).
        canonical_url=url_for("share_page", token=token, _external=True),
    ))
    # R3-Fix #15: don't let intermediaries (CDNs, corp proxies,
    # transparent ISP caches) hold a copy of this response. The
    # body embeds the dedup cookie + view counter — caching it
    # means visitor B downstream sees visitor A's set-cookie +
    # view count rather than incrementing their own.
    response.headers["Cache-Control"] = "private, no-store"
    if not has_seen:
        response.set_cookie(
            cookie_name, "1",
            max_age=24 * 60 * 60,
            httponly=True, samesite="Lax",
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
    response = app.make_response((
        render_template(
            "template.html",
            preview=preview,
            canonical_url=canonical,
            og_image_url=og_image,
        ),
        status,
    ))
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
    return send_from_directory(app.static_folder, "manifest.json", mimetype="application/manifest+json")


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
            return send_from_directory(UPLOAD_FOLDER, relpath)
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
                    return send_from_directory(UPLOAD_FOLDER, relpath)
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
                    return send_from_directory(UPLOAD_FOLDER, relpath)
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
                    return send_from_directory(UPLOAD_FOLDER, relpath)
                c.execute(
                    "SELECT 1 FROM expenses e "
                    "JOIN trip_members tm ON tm.trip_id = e.trip_id "
                    "WHERE tm.user_id = ? AND tm.invitation_status = 'accepted' "
                    "  AND e.receipt_url = ? LIMIT 1",
                    (caller_id, needle_exact),
                )
                if c.fetchone():
                    return send_from_directory(UPLOAD_FOLDER, relpath)
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
            return send_from_directory(UPLOAD_FOLDER, relpath)
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
