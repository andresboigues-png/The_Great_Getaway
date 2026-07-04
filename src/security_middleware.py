"""Security + request-lifecycle middleware — every hook main.py ran inline.

MK1 Wave G (T2-1, ARCH-3): extracted verbatim from main.py so the
security-critical stack (CSP builder + nonce, the CSRF origin gate,
security headers, gzip, the global JSON error handlers, and the per-
route import-size lift) lives in ONE reviewable module instead of
being interleaved with app assembly. Wiring happens via
init_security(app) — same registration order the decorators produced.

IMPORT_MAX_CONTENT_LENGTH moved here with its hook (it has no other
consumers).
"""

import secrets

from flask import g, jsonify, request
from werkzeug.exceptions import HTTPException

from observability import get_logger

logger = get_logger(__name__)

# R12-B7: per-route request-size lift for the trip-ZIP import. The global
# MAX_CONTENT_LENGTH stays 10 MB; only /api/trips/import may carry more.
IMPORT_MAX_CONTENT_LENGTH = 64 * 1024 * 1024  # 64 MB

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


def _raise_import_upload_limit():
    """MK6 P2: lift the 10 MB body cap for /api/trips/import only, so a media-
    bearing trip export can actually be re-imported. Runs before the handler
    touches request.files, so Werkzeug's multipart parser uses the larger cap
    for this one route; every other route keeps the tight 10 MB default."""
    if request.method == "POST" and request.path == "/api/trips/import":
        request.max_content_length = IMPORT_MAX_CONTENT_LENGTH


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

_CSRF_EXEMPT_PATHS = frozenset(
    {
        "/api/auth/google",
        # R12-B1: the browser POSTs CSP violation reports here WITHOUT a
        # matching Origin/Referer (reports are sent uncredentialed, often
        # with a `null` Origin), so the same-origin CSRF gate would 403
        # every report. Safe to exempt: the endpoint only logs a bounded
        # body, mutates nothing, and is rate-limited (30/min).
        "/api/csp-report",
    }
)


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
        return jsonify(
            {
                "error": "Cross-origin request rejected (missing Origin/Referer)",
            }
        ), 403
    if _host_matches(origin) or _host_matches(referer):
        return None
    # Hard block. JSON so the frontend's fetch error handler
    # surfaces a clean message rather than HTML.
    return jsonify({"error": "Cross-origin request rejected"}), 403


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
        response.headers["Vary"] = f"{vary}, Accept-Encoding" if vary else "Accept-Encoding"
    except Exception:
        return response
    return response


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
        "; ".join(
            [
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
            ]
        ),
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Referrer-Policy",
        "strict-origin-when-cross-origin",
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
        "Cross-Origin-Opener-Policy",
        "same-origin-allow-popups",
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


def _handle_http_exception(e):
    """Pass-through for routes that explicitly raise an HTTPException
    (abort(404), abort(403), etc.). Returns the same JSON shape every
    /api/* route uses so the frontend has one error contract."""
    return jsonify(
        {
            "error": e.description or e.name,
            "status": e.code,
        }
    ), (e.code or 500)


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


def init_security(app) -> None:
    """Register every hook on `app` — call once at assembly time.
    Order matches the original decorator order in main.py exactly
    (before_request hooks run in registration order; after_request
    hooks run in REVERSE registration order, so preserving this
    sequence preserves gzip-before-headers semantics)."""
    app.before_request(_raise_import_upload_limit)
    app.before_request(_attach_csp_nonce)
    app.before_request(_csrf_origin_check)
    app.context_processor(_inject_csp_nonce)
    app.after_request(_gzip_response)
    app.after_request(add_security_headers)
    app.errorhandler(HTTPException)(_handle_http_exception)
    app.errorhandler(Exception)(_handle_uncaught_exception)
