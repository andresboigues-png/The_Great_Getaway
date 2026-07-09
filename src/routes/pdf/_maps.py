"""PDF export — network layer: Google Static Maps fetchers + photo loader.

Behaviour-preserving extract of the coordinate validators, the in-memory
Static Maps response cache, the three map fetchers (cover / overview /
day-pin), and the user-photo fetch+validate pipeline (incl. the SSRF
guard). These are the functions the test-suite monkeypatches on
``routes.pdf`` (``_fetch_cover_map`` / ``_fetch_overview_pins_map`` /
``_fetch_day_pin_map``); they are star-imported into ``routes.pdf`` so a
``monkeypatch.setattr(routes.pdf, "_fetch_cover_map", ...)`` rebinds the
name in ``routes.pdf``'s namespace — and ``_build_trip_pdf`` (defined in
that same namespace) sees the patch.
"""

from __future__ import annotations

import collections
import hashlib as _hashlib
import io
import os
import threading as _threading
from typing import Any

import requests

from observability import get_logger

logger = get_logger(__name__)

# R2 audit fix helpers ----------------------------------------------------
# Promoted to validators.scrub_key in R3-Fix #14 so integrations.py can
# share the same scrub before logging Gemini's response bodies. The
# local alias keeps existing call sites in this file unchanged.
from helpers import can_read_trip
from validators import scrub_key as _scrub_key  # noqa: F401


def _safe_coord(value, lo: float, hi: float):
    """Validate a lat/lng-shaped value before interpolating into a
    Static Maps URL. Returns the float when valid, None otherwise.

    R2 audit fix: pre-fix the URL builders embedded
    `f"{lat},{lng}"` from raw marked_places_json. A crafted
    `lat="0|markers:color:red|99,99"` smuggled extra pins (or
    polylines / styles) into the paid Google API call. Now every
    coord goes through this gate first; non-numeric or out-of-range
    values are dropped so the marker is skipped silently rather than
    flowing through as an injection vector."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n != n or n in (float("inf"), float("-inf")):
        return None
    if n < lo or n > hi:
        return None
    return n


def _safe_latlng(lat, lng):
    """Convenience for the common pair-validation shape. Returns
    `(lat, lng)` when BOTH are valid; (None, None) otherwise so
    callers can `if not lat or not lng: skip`."""
    safe_lat = _safe_coord(lat, -90, 90)
    safe_lng = _safe_coord(lng, -180, 180)
    if safe_lat is None or safe_lng is None:
        return None, None
    return safe_lat, safe_lng


def _place_label_for_index(i: int) -> str:
    """Map a 0-based marker index to its display label.
    R3-Round 3 fix: pre-fix the >26 case rendered "" on the map and
    "·" in the legend, both useless. Now wrap A-Z so index 26 → A,
    27 → B, etc. Accepts that two pins on a 30-marker trip will
    share a label — honest ambiguity beats invisible labels. Callers
    can read each card's name below for disambiguation."""
    return chr(ord("A") + (i % 26))


# R3-Round 4 fix: in-memory cache for Static Maps responses keyed
# on the request params. Mariana's 30-tab PDF burst routinely hits
# the same trip-cover map 30 times because each export request is
# independent — at $2/1000 calls + a few hundred kB of bandwidth
# each, that's both money and time wasted. The cache is process-
# level (PA is single-process; multi-worker plans get parallel
# caches, which is fine — eventual convergence). TTL 1 hour so
# a multi-export session reuses; old entries naturally roll out
# under churn.
_MAP_CACHE_MAX = 200
# MK6 P2: also bound by BYTES, not just entry count. These are scale=2
# roadmap PNGs (up to ~2400x1200), realistically ~200-800 KB each — NOT the
# ~2 KB the old comment assumed. 200 entries could pin 60-160 MB of resident
# PNG bytes for an hour, competing with the app's working set on the single
# PA worker. Evict on whichever cap trips first.
_MAP_CACHE_MAX_BYTES = 24 * 1024 * 1024  # ~24 MB ceiling
_MAP_CACHE_TTL_SECONDS = 60 * 60
_map_cache: collections.OrderedDict[str, tuple[float, bytes]] = collections.OrderedDict()
_map_cache_lock = _threading.Lock()


def _map_cache_key(url: str, params) -> str:
    """SHA-1 of `url + sorted-params`. Accepts dict OR list of (k, v)
    tuples (Google Static Maps uses repeated `markers` keys so the
    overview/day-pin paths pass tuple lists). Excludes the API key so
    a key rotation doesn't invalidate the entire cache, and so the
    same map content with or without the key string yields the same
    cache hit."""
    # Normalise to list of (k, v) pairs, drop API key, sort.
    if isinstance(params, dict):
        pairs = list(params.items())
    else:
        pairs = list(params)
    pairs = [(str(k), str(v)) for k, v in pairs if k != "key"]
    pairs.sort()
    payload = url + "?" + "&".join(f"{k}={v}" for k, v in pairs)
    return _hashlib.sha1(payload.encode()).hexdigest()


def _map_cache_get(key: str) -> bytes | None:
    with _map_cache_lock:
        entry = _map_cache.get(key)
        if entry is None:
            return None
        ts, content = entry
        import time as _time

        if (_time.time() - ts) > _MAP_CACHE_TTL_SECONDS:
            # Evict stale.
            _map_cache.pop(key, None)
            return None
        # Move to end (LRU touch).
        _map_cache.move_to_end(key)
        return content


def _map_cache_put(key: str, content: bytes) -> None:
    if not content:
        return
    import time as _time

    with _map_cache_lock:
        _map_cache[key] = (_time.time(), content)
        _map_cache.move_to_end(key)
        # Evict oldest until under BOTH the entry cap and the byte budget.
        # sum() over <=200 small tuples is negligible per put.
        total = sum(len(c) for _, c in _map_cache.values())
        while _map_cache and (len(_map_cache) > _MAP_CACHE_MAX or total > _MAP_CACHE_MAX_BYTES):
            _, evicted = _map_cache.popitem(last=False)
            total -= len(evicted)


# MK1 Wave H (T2-4): promoted to helpers.can_read_trip — this module keeps
# the underscore alias because routes/pdf/__init__ re-exports it (the
# load-bearing re-export namespace tests monkeypatch through).
_can_read_trip = can_read_trip


def _fetch_cover_map(lat: float | None, lng: float | None, place_id: str | None) -> bytes | None:
    """Return a Google Static Maps PNG for the trip's location, or
    None if we can't / shouldn't. Centers on lat/lng when known;
    falls back to place_id otherwise (Static Maps supports a
    `markers` param with place_id resolution via the Places API,
    but the simpler path is lat/lng — every trip in this app has
    coords by the time it's saved). Failure logs and returns
    None — the PDF still renders without the cover."""
    key = os.getenv("GOOGLE_MAPS_SERVER_KEY") or os.getenv("GOOGLE_MAPS_API_KEY") or ""
    if not key:
        logger.warning(
            "pdf cover map skipped: neither GOOGLE_MAPS_SERVER_KEY "
            "nor GOOGLE_MAPS_API_KEY is set in env"
        )
        return None
    lat, lng = _safe_latlng(lat, lng)
    if lat is None or lng is None:
        logger.warning("pdf cover map skipped: trip has no valid lat/lng")
        return None
    try:
        params = {
            "center": f"{lat},{lng}",
            "zoom": "9",
            "size": "1200x600",
            "scale": "2",
            "maptype": "roadmap",
            "key": key,
        }
        # R3-Round 4 fix: cache by content hash. Mariana's 30-tab PDF
        # burst would otherwise refetch the identical cover map 30
        # times (~$0.06 + ~6 MB bandwidth saved per session).
        cache_key = _map_cache_key(
            "https://maps.googleapis.com/maps/api/staticmap",
            params,
        )
        cached = _map_cache_get(cache_key)
        if cached is not None:
            return cached
        # 2026-05-20: wrap in `with` so the response socket is
        # released immediately. Without it the keep-alive socket
        # stays in the requests-library pool until GC; under heavy
        # PDF export traffic that piles up FDs and trips the dev
        # server's ulimit (Errno 24 Too many open files).
        with requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
            # SEC-4: the API key rides in `params`; a 3xx to an
            # attacker-controlled host would leak it in the forwarded
            # query string. Pin to the literal Google endpoint.
            allow_redirects=False,
        ) as res:
            if not res.ok:
                logger.warning(
                    "pdf cover map: Google Static Maps returned %d — %s",
                    res.status_code,
                    _scrub_key((res.text or "")[:300]),
                )
                return None
            _map_cache_put(cache_key, res.content)
            return res.content
    except Exception as e:
        logger.warning("pdf cover map: fetch failed: %s", e)
        return None


def _fetch_overview_pins_map(
    pins: list[tuple[float, float, str]],
    center_lat: float | None = None,
    center_lng: float | None = None,
) -> bytes | None:
    """Wide overview map showing many pins at once — used for the
    "all your days on one map" hero image at the top of the Day-by-
    day section, and (when called with marked-place pins) for the
    Marked-places section's overview.

    `pins` is a list of (lat, lng, label) tuples where `label` is a
    single character (Google Static Maps marker labels accept one
    alphanumeric — A-Z or 0-9). Pass numeric day numbers for days,
    or letters/dots for places.

    Google auto-centers + zooms when `center` is omitted as long as
    we pass markers — the map fits all markers in the viewport. We
    still pass `center` when known so the framing matches the trip's
    main location even if a couple of day pins are outliers.

    Brand-coloured markers: brand-blue for the day list. Each marker
    gets a labeled circular icon by default. Returns the PNG bytes
    or None on missing key / network error / empty pin list."""
    if not pins:
        logger.info("pdf overview map skipped: no pins provided")
        return None
    key = os.getenv("GOOGLE_MAPS_SERVER_KEY") or os.getenv("GOOGLE_MAPS_API_KEY") or ""
    if not key:
        logger.warning(
            "pdf overview map skipped: neither GOOGLE_MAPS_SERVER_KEY "
            "nor GOOGLE_MAPS_API_KEY is set in env"
        )
        return None
    try:
        params: list[tuple[str, str]] = [
            ("size", "1200x520"),
            ("scale", "2"),
            ("maptype", "roadmap"),
            ("key", key),
        ]
        clat, clng = _safe_latlng(center_lat, center_lng)
        if clat is not None and clng is not None:
            params.append(("center", f"{clat},{clng}"))
        for plat_raw, plng_raw, plabel in pins[:20]:  # URL size cap
            plat, plng = _safe_latlng(plat_raw, plng_raw)
            if plat is None or plng is None:
                continue  # R2 fix: skip injection-shaped coords
            # label must be a single alphanumeric char; truncate
            safe_label = (str(plabel) or "")[:1].upper() if plabel else ""
            # Reject non-alphanumeric labels (e.g. `|`, `:` smuggling).
            if safe_label and not safe_label.isalnum():
                safe_label = ""
            marker = (
                f"color:0x0071e3|label:{safe_label}|{plat},{plng}"
                if safe_label
                else f"color:0x0071e3|{plat},{plng}"
            )
            params.append(("markers", marker))
        # R3-Round 4 fix: content-hash cache. Same overview map for
        # identical pin set hits cache instead of re-fetching from
        # Google.
        cache_key = _map_cache_key(
            "https://maps.googleapis.com/maps/api/staticmap",
            params,
        )
        cached = _map_cache_get(cache_key)
        if cached is not None:
            return cached
        # 2026-05-20: see note on the cover-map fetch above —
        # `with requests.get(...)` releases the socket immediately
        # on exit to keep the FD pool from growing under heavy
        # PDF export traffic.
        with requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
            # SEC-4: the API key rides in `params`; a 3xx to an
            # attacker-controlled host would leak it in the forwarded
            # query string. Pin to the literal Google endpoint.
            allow_redirects=False,
        ) as res:
            if not res.ok:
                logger.warning(
                    "pdf overview map: Google Static Maps returned %d — %s",
                    res.status_code,
                    _scrub_key((res.text or "")[:300]),
                )
                return None
            logger.info(
                "pdf overview map: fetched %d pin(s), %d bytes",
                len(pins),
                len(res.content),
            )
            _map_cache_put(cache_key, res.content)
            return res.content
    except Exception as e:
        logger.warning("pdf overview map: fetch failed: %s", e)
        return None


def _fetch_day_pin_map(
    lat: float | None,
    lng: float | None,
    extra_pins: list[tuple[float, float]] | None = None,
) -> bytes | None:
    """A smaller per-day map with the main anchor pin + optional
    extra pins for each verified slot item. Same fail-soft path as
    the cover map."""
    key = os.getenv("GOOGLE_MAPS_SERVER_KEY") or os.getenv("GOOGLE_MAPS_API_KEY") or ""
    lat, lng = _safe_latlng(lat, lng)
    if not key or lat is None or lng is None:
        return None
    # Audit fix (2026-05-26): Google Static Maps marker labels MUST
    # be a single alphanumeric char (A-Z, 0-9). The pre-fix value
    # `•` was rejected — the entire URL 400'd and the per-day map
    # silently failed for every PDF that opted into includeDayPins.
    # Drop the label entirely (no label = default marker pin, which
    # is what we want for a single-pin anchor map).
    markers = [f"color:0x0071e3|{lat},{lng}"]
    for plat_raw, plng_raw in (extra_pins or [])[:8]:  # cap the URL size
        plat, plng = _safe_latlng(plat_raw, plng_raw)
        if plat is None or plng is None:
            continue  # R2 fix: skip injection-shaped coords
        markers.append(f"color:0x9b59b6|size:small|{plat},{plng}")
    try:
        params = [
            ("size", "800x320"),
            ("scale", "2"),
            ("maptype", "roadmap"),
            ("key", key),
        ]
        # AUTO-FIT: when the day has real place pins (more than just the
        # anchor), OMIT center+zoom so Google Static Maps frames ALL of them
        # tightly — the map hugs exactly the day's places. With only the
        # anchor pin, keep a fixed tight zoom (14) so a lone pin isn't shown
        # at world scale (auto-fit on a single point picks an ugly max zoom).
        if len(markers) <= 1:
            params.insert(0, ("center", f"{lat},{lng}"))
            params.insert(1, ("zoom", "14"))
        for m in markers:
            params.append(("markers", m))
        # R3-Round 4 fix: same content-hash cache as the other two
        # fetchers above. Per-day pin maps are particularly cacheable
        # across export sessions because the underlying coords don't
        # change without a trip edit.
        cache_key = _map_cache_key(
            "https://maps.googleapis.com/maps/api/staticmap",
            params,
        )
        cached = _map_cache_get(cache_key)
        if cached is not None:
            return cached
        # 2026-05-20: `with` releases the socket on exit (FD-leak fix).
        with requests.get(
            "https://maps.googleapis.com/maps/api/staticmap",
            params=params,
            timeout=10,
            # SEC-4: the API key rides in `params`; a 3xx to an
            # attacker-controlled host would leak it in the forwarded
            # query string. Pin to the literal Google endpoint.
            allow_redirects=False,
        ) as res:
            if not res.ok:
                return None
            _map_cache_put(cache_key, res.content)
            return res.content
    except Exception:
        return None


# ── PDF-4: user-photo embedding ──────────────────────────────────────
# Same fail-soft + size-cap discipline as the map fetchers. We accept
# three URL shapes that the app actually produces and IGNORE everything
# else (returns None, no crash):
#   1. `data:image/...;base64,...` — decoded inline, no network.
#   2. `/static/uploads/<...>`     — the app's OWN uploads, read from the
#      local UPLOAD_FOLDER filesystem (no network → no SSRF surface).
#   3. `http(s)://...`             — fail-soft capped GET (10s timeout,
#      hard byte cap). Validated by re-decoding through PIL, which both
#      rejects non-image bytes AND normalises to a reportlab-safe PNG.
# Every photo is re-encoded to PNG via PIL so a corrupt / malicious /
# truncated image can never reach reportlab's Image flowable raw.
_PHOTO_MAX_BYTES = 8 * 1024 * 1024  # 8 MB hard cap per photo download
_PHOTO_MAX_PER_TRIP = 60  # bound total embeds so a 500-photo
#                                    trip can't balloon the doc / RAM


def _resolve_first_public_ip(url: str) -> str | None:
    """Resolve the URL's host and return its FIRST address, but ONLY when
    EVERY resolved address is public + routable (else None). Blocks loopback,
    link-local (incl. the 169.254.169.254 cloud-metadata endpoint), private
    (RFC1918), and other reserved ranges. The returned IP is PINNED for the
    fetch (see `_pinned_get`) so the host cannot be re-resolved to an internal
    address between this check and the GET — closing the DNS-rebinding bypass
    (A6-B2) where a short-TTL domain passes the guard then answers the fetch
    from an internal IP."""
    try:
        import ipaddress
        import socket
        from urllib.parse import urlparse

        host = urlparse(url).hostname
        if not host:
            return None
        # Resolve ALL addresses; reject if ANY is non-public. Keep order so we
        # can pin the first one for the connection.
        infos = socket.getaddrinfo(host, None)
        addrs = [info[4][0] for info in infos]
        if not addrs:
            return None
        for addr in addrs:
            ip = ipaddress.ip_address(addr)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                return None
        return addrs[0]
    except Exception:
        return None


def _is_public_http_url(url: str) -> bool:
    """SSRF guard for the photo fetcher — True only when the URL's host
    resolves entirely to PUBLIC, routable IPs. Delegates to
    `_resolve_first_public_ip` so the bool check and the pinned fetch share
    ONE resolution + validation pass."""
    return _resolve_first_public_ip(url) is not None


# A6-B2: the create_connection override in _pinned_get is process-global, so
# serialize pinned fetches. Photo fetches are rare + per-export byte-capped, so
# the contention is negligible.
_dns_pin_lock = _threading.Lock()


def _pinned_get(url: str, resolved_ip: str, **kwargs):
    """`requests.get` that FORCES the TCP connection to `resolved_ip` (a
    pre-validated public IP) while keeping the hostname for the Host header +
    TLS SNI / cert validation. This closes the DNS-rebinding window: without
    it, requests re-resolves the host independently of `_resolve_first_public_ip`,
    so a short-TTL domain could pass the check then connect to an internal IP.
    Only the TCP target is overridden — SNI + cert still validate the hostname."""
    from urllib.parse import urlparse

    import urllib3.util.connection as _u3c

    host = urlparse(url).hostname
    _orig_create_conn = _u3c.create_connection

    def _patched(address, *args, **kw):
        h, port = address
        return _orig_create_conn((resolved_ip, port) if h == host else address, *args, **kw)

    with _dns_pin_lock:
        _u3c.create_connection = _patched
        try:
            return requests.get(url, **kwargs)
        finally:
            _u3c.create_connection = _orig_create_conn


def _photo_src(entry: Any) -> str | None:
    """Pull the URL/src out of a photo entry. Day photos are bare URL
    strings; trip photos_json entries are {src|url, dayId, ...} dicts."""
    if isinstance(entry, str):
        return entry.strip() or None
    if isinstance(entry, dict):
        for k in ("src", "url", "dataUrl", "data_url"):
            v = entry.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
    return None


def _load_photo_png(src: str) -> bytes | None:
    """Resolve one photo `src` to validated PNG bytes, or None on any
    failure. Fail-soft everywhere — a single bad photo must never break
    the export."""
    if not src or not isinstance(src, str):
        return None
    raw: bytes | None = None
    try:
        if src.startswith("data:"):
            # data:[<mediatype>][;base64],<data>
            header, _, payload = src.partition(",")
            if not payload:
                return None
            if ";base64" in header.lower():
                import base64

                raw = base64.b64decode(payload, validate=False)
            else:
                from urllib.parse import unquote_to_bytes

                raw = unquote_to_bytes(payload)
            if raw and len(raw) > _PHOTO_MAX_BYTES:
                return None
        elif src.startswith("/static/uploads/") or src.startswith("static/uploads/"):
            # App's own upload — read from disk, never the network.
            try:
                from flask import current_app

                root = current_app.config.get("UPLOAD_FOLDER")
            except Exception:
                root = None
            if not root:
                root = os.getenv("GG_UPLOAD_ROOT")
            if not root:
                return None
            rel = src.split("/static/uploads/", 1)[-1].lstrip("/")
            # Defend against path traversal — resolve + confine to root.
            abspath = os.path.realpath(os.path.join(root, rel))
            root_real = os.path.realpath(root)
            if not abspath.startswith(root_real + os.sep):
                return None
            if not os.path.isfile(abspath):
                return None
            if os.path.getsize(abspath) > _PHOTO_MAX_BYTES:
                return None
            with open(abspath, "rb") as fh:
                raw = fh.read(_PHOTO_MAX_BYTES + 1)
            if raw and len(raw) > _PHOTO_MAX_BYTES:
                return None
        elif src.startswith("http://") or src.startswith("https://"):
            # SSRF guard: refuse to fetch internal / loopback / link-local
            # / private addresses. A user-controlled photo `src` must not
            # let the export probe the metadata endpoint (169.254.169.254)
            # or internal services. App photos are same-origin uploads
            # (handled above) or data URLs — arbitrary external hosts are
            # the only ones that reach here, and only public ones are OK.
            _pinned_ip = _resolve_first_public_ip(src)
            if _pinned_ip is None:
                logger.warning("PDF photo skipped: non-public URL host")
                return None
            # Fail-soft capped GET — same `with requests.get(...)` socket
            # discipline + timeout as the map fetchers.
            # MK6 P2 (SEC-4): allow_redirects=False. _is_public_http_url only
            # vetted the ORIGINAL host; without this a 302 to
            # http://169.254.169.254/ (or an RFC1918 host) would be followed
            # and its body embedded — an SSRF bypass. The map fetchers already
            # pin this; the photo GET had been on the requests default (True).
            # A6-B2: pin the validated IP for the connection so the host can't
            # rebind to an internal address between the check above and this GET.
            with _pinned_get(
                src, _pinned_ip, timeout=10, stream=True, allow_redirects=False
            ) as res:
                if not res.ok:
                    return None
                # Enforce the byte cap while streaming so a huge/streaming
                # body can't exhaust RAM.
                chunks: list[bytes] = []
                total = 0
                for chunk in res.iter_content(64 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > _PHOTO_MAX_BYTES:
                        return None
                    chunks.append(chunk)
                raw = b"".join(chunks)
        else:
            return None
    except Exception:
        logger.warning("PDF photo fetch failed", exc_info=True)
        return None

    if not raw:
        return None
    # Re-decode through PIL and re-encode to PNG. This validates the
    # bytes really are an image, strips any trailing junk, and hands
    # reportlab a format it always accepts. Downscale very large photos
    # so the embedded image stays light.
    try:
        from PIL import Image as _PILImage

        with _PILImage.open(io.BytesIO(raw)) as im:
            im = im.convert("RGB")
            # Cap the long edge so a 12 MP phone photo doesn't bloat the
            # PDF — 1280px is plenty for a print thumbnail grid.
            max_edge = 1280
            if max(im.size) > max_edge:
                im.thumbnail((max_edge, max_edge))
            out = io.BytesIO()
            im.save(out, format="PNG")
            return out.getvalue()
    except Exception:
        logger.warning("PDF photo decode failed", exc_info=True)
        return None


def _collect_photos(entries: Any, limit: int) -> list[bytes]:
    """Resolve up to `limit` photo entries to validated PNG bytes,
    skipping any that fail. `entries` may be a list of strings or dicts."""
    out: list[bytes] = []
    if not isinstance(entries, list):
        return out
    for entry in entries:
        if len(out) >= limit:
            break
        src = _photo_src(entry)
        if not src:
            continue
        png = _load_photo_png(src)
        if png:
            out.append(png)
    return out
