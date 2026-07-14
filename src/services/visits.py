"""Lightweight, privacy-respecting first-party visit logging.

Counts anonymous landings on the SPA shell (GET "/") so the developer
dashboard can answer "how many curious people clicked my LinkedIn link"
— *without* third-party trackers, without storing raw IPs, and without
trying to identify anyone.

What we store per visit (see `visits` table):
- visitor_id : a first-party `gg_vid` cookie (random UUID) — the primary
               unique-visitor signal. Survives across sessions on the same
               browser. Not linked to any account.
- ip_hash    : sha256(salt + client_ip)[:32] — a fallback unique signal for
               cookie-less clients. The raw IP is NEVER stored.
- referrer_host : the EXTERNAL host that sent them (e.g. "linkedin.com"),
               normalised; empty for direct / same-site navigation. Only the
               host — never the full URL / query string.
- region     : a ROUGH locale from the Accept-Language header (country subtag
               if present, else the language). Not IP geolocation — it's a
               best-effort hint, deliberately coarse and privacy-friendly.
- device / browser : coarse buckets parsed from the User-Agent.

Bots (incl. the LinkedIn/Facebook link-preview scrapers) are skipped so the
count reflects real humans.

Everything here is best-effort: `record_visit` swallows all errors so a
logging hiccup can never break the page load.
"""

from __future__ import annotations

import hashlib
import logging
import os
import uuid
from urllib.parse import urlparse

from database import get_db

logger = logging.getLogger(__name__)

# Salt for the IP hash. Override in prod via env for a per-deployment secret;
# the constant fallback still keeps raw IPs out of the DB.
_IP_SALT = os.getenv("GG_VISIT_SALT", "gg-visit-salt-2026")

# 2 years — long enough that a returning curious visitor isn't recounted.
_VID_MAX_AGE = 60 * 60 * 24 * 730

_BOT_MARKERS = (
    "bot",
    "crawler",
    "spider",
    "slurp",
    "facebookexternalhit",
    "embedly",
    "quora link preview",
    "pinterest",
    "preview",
    "headless",
    "python-requests",
    "curl/",
    "wget",
    "monitor",
    "ahrefs",
    "semrush",
    "bingpreview",
    "whatsapp",
    "telegrambot",
    "discordbot",
    "slackbot",
    "vercel",
    "lighthouse",
    "gtmetrix",
    # Generic automation / HTTP-client UAs — never a real human browser.
    "python",
    "werkzeug",
    "go-http",
    "okhttp",
    "httpx",
    "aiohttp",
    "java/",
    "libwww",
    "scrapy",
    "postman",
    "insomnia",
    "node-fetch",
    "axios",
    "dart:io",
)

# Normalise the noisy real-world referrer hosts to a stable label so the
# dashboard groups them sensibly.
_REFERRER_ALIASES = {
    "lnkd.in": "linkedin.com",
    "l.linkedin.com": "linkedin.com",
    "lm.linkedin.com": "linkedin.com",
    "com.linkedin.android": "linkedin.com",
    "t.co": "twitter.com",
    "l.facebook.com": "facebook.com",
    "m.facebook.com": "facebook.com",
    "l.instagram.com": "instagram.com",
    "com.google.android.gm": "gmail.com",
    "out.reddit.com": "reddit.com",
}


def _client_ip(request) -> str:
    """Best client IP behind PythonAnywhere's proxy: first X-Forwarded-For
    hop, else X-Real-IP, else the socket peer."""
    xff = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return xff or request.headers.get("X-Real-IP") or (request.remote_addr or "")


def _ip_hash(ip: str) -> str:
    if not ip:
        return ""
    return hashlib.sha256(f"{_IP_SALT}:{ip}".encode()).hexdigest()[:32]


def _is_bot(ua: str) -> bool:
    ua = (ua or "").lower()
    if not ua:
        return True  # no UA → almost always automated; don't count it
    return any(m in ua for m in _BOT_MARKERS)


def _parse_device(ua: str) -> str:
    ua = (ua or "").lower()
    if "ipad" in ua or ("android" in ua and "mobile" not in ua) or "tablet" in ua:
        return "tablet"
    if "mobi" in ua or "iphone" in ua or "ipod" in ua or ("android" in ua and "mobile" in ua):
        return "mobile"
    return "desktop"


def _parse_browser(ua: str) -> str:
    ua = (ua or "").lower()
    # Order matters — Edge/Opera/Chrome all carry "chrome" in the UA.
    if "edg/" in ua or "edga" in ua or "edgios" in ua:
        return "Edge"
    if "opr/" in ua or "opera" in ua:
        return "Opera"
    if "samsungbrowser" in ua:
        return "Samsung"
    if "crios" in ua or "chrome" in ua:
        return "Chrome"
    if "fxios" in ua or "firefox" in ua:
        return "Firefox"
    if "safari" in ua:
        return "Safari"
    return "Other"


def _rough_region(accept_language: str) -> str:
    """Coarse locale hint from Accept-Language. Country subtag when present
    (e.g. "pt-BR" → "BR"), else the uppercased language ("en" → "EN"). NOT
    a geolocation — a rough, dependency-free, privacy-friendly signal."""
    if not accept_language:
        return ""
    token = accept_language.split(",")[0].strip().split(";")[0].strip()
    if not token:
        return ""
    parts = token.replace("_", "-").split("-")
    if len(parts) >= 2 and len(parts[1]) == 2:
        return parts[1].upper()
    return parts[0][:3].upper()


def _referrer_host(request) -> str:
    """External referring host (normalised), or "" for direct / same-site."""
    ref = request.referrer
    if not ref:
        return ""
    try:
        host = (urlparse(ref).netloc or "").lower()
    except Exception:
        return ""
    if not host:
        return ""
    host = host.split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    # Same-site navigation isn't an external referral.
    self_host = (request.host or "").lower().split(":")[0]
    if self_host.startswith("www."):
        self_host = self_host[4:]
    if host == self_host:
        return ""
    return _REFERRER_ALIASES.get(host, host)


def record_visit(request, response) -> None:
    """Log a landing + ensure the first-party `gg_vid` cookie. Best-effort:
    any failure is swallowed so it can never break the page render. Bots are
    skipped. Sets the cookie on `response` when the visitor is new."""
    try:
        ua = request.headers.get("User-Agent", "")
        if _is_bot(ua):
            return

        vid = request.cookies.get("gg_vid")
        if not vid:
            vid = uuid.uuid4().hex
            response.set_cookie(
                "gg_vid",
                vid,
                max_age=_VID_MAX_AGE,
                httponly=True,
                samesite="Lax",
                secure=bool(request.is_secure),
            )

        row = (
            uuid.uuid4().hex,
            vid,
            _ip_hash(_client_ip(request)),
            _referrer_host(request),
            _rough_region(request.headers.get("Accept-Language", "")),
            _parse_device(ua),
            _parse_browser(ua),
        )
        with get_db() as conn:
            conn.execute(
                "INSERT INTO visits "
                "(id, visitor_id, ip_hash, referrer_host, region, device, browser) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                row,
            )
            conn.commit()
    except Exception:
        # Never let analytics break the page. Log at debug so a broken
        # visits table (e.g. mid-migration) doesn't spam prod logs.
        logger.debug("record_visit failed", exc_info=True)
