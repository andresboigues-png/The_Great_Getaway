"""Server-side FX rate cache.

Audit fix (2026-05-26): pre-fix the frontend shipped a 17-currency
table from constants.ts (~2024 era), frozen at bundle build time.
Sign-in on a fresh device, currency conversion in the expense
form, settlement balance math — all of it ran against rates that
were 2+ years stale. EGP / IDR / KRW / etc. weren't in the table
at all and silently fell back to rate=1 (an EGP 100 expense was
stored as €100).

This module sits between the rate provider (Frankfurter, free
ECB-derived API) and the rest of the server. Single in-memory
cache, refreshed once per 24h. The first cache MISS during a
request triggers a synchronous fetch; subsequent calls hit the
warm cache.

Surfaces:
  - `get_rate_eur(code)`: rate to convert 1 unit of `code` to EUR
    (so an amount in `code` × this rate = amount in EUR)
  - `get_all_rates_eur()`: full dict the /api/fx-rates endpoint
    returns to the frontend, shaped { "USD": 0.92, ... }

Behavior on provider failure: fall back to a small frozen-EUR-
parity table (every code → None, meaning "I don't know"). The
caller is then responsible for either skipping the conversion or
using EUR rate 1.0 as a degraded fallback — same fallback the
frontend has had forever, just now with a logged warning.

The cache is in-memory + per-process; PA is single-process so a
single cache is shared across all requests. Multi-worker deployments
will fetch independently (~N × 1 fetch per day, still well within
Frankfurter's free quota).
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# Cache TTL — 24h. Daily rate changes are well below the noise
# floor of travel-spend reporting, so refreshing more often is
# wasted I/O. The cache is keyed on a single timestamp (we always
# fetch the full base-EUR table together).
_TTL_SECONDS = 24 * 60 * 60

# Frankfurter's "latest" endpoint returns 1 EUR = N <currency>. We
# need the inverse (1 currency = M EUR). The transform happens in
# `_refresh` so callers get the pre-transformed dict.
_FRANKFURTER_LATEST = "https://api.frankfurter.app/latest?from=EUR"

# Module-private cache.
_cache: dict[str, Optional[float]] = {}
_cache_set_at: float = 0.0
# R2 audit fix: failed-fetch back-off. When Frankfurter is down,
# _refresh() returns without bumping _cache_set_at, so every
# subsequent read sees an "expired" cache and dogpiles the failing
# fetch — wall-clock latency of every /api/data poll goes up by
# the 5s timeout. _refresh_fail_until lets us back off for 5min
# after a failure so the hot path stays fast.
_refresh_fail_until: float = 0.0
# Audit fix (2026-05-27, fix #61): per-worker re-entrant lock so
# concurrent _maybe_refresh() calls within the same Python process
# don't dogpile Frankfurter. Without this, a cold worker that
# receives 10 simultaneous /api/data polls fires 10 parallel
# refreshes — burns Frankfurter quota, wastes sockets, and racy
# writes to _cache could land in any order. The lock is per-process
# (cross-worker dedup would need an external Redis lock — not worth
# the complexity for a 24h-TTL value).
_refresh_lock = threading.RLock()


def _refresh() -> None:
    """Pull the latest rates from Frankfurter and replace the
    cache. Inverts the provider's `EUR → X` table to `X → EUR`
    so the rest of the server reads in the convention it expects."""
    global _cache, _cache_set_at, _refresh_fail_until
    try:
        # 5s connect/read budget — Frankfurter is normally < 200ms.
        # A slow upstream shouldn't block the request handler for
        # more than a few seconds; on timeout the cache stays warm
        # (or stays empty + every read returns None).
        with requests.get(_FRANKFURTER_LATEST, timeout=5) as res:
            res.raise_for_status()
            data = res.json()
    except Exception as e:
        logger.warning("fx_rates refresh failed: %s", e)
        # R2 audit fix: 5-minute back-off after a failed fetch so
        # the hot path doesn't dogpile the failing API for the
        # whole TTL window.
        _refresh_fail_until = time.time() + 300
        return
    raw = data.get("rates") or {}
    new_cache: dict[str, Optional[float]] = {"EUR": 1.0}
    for code, eur_to_code in raw.items():
        try:
            rate = float(eur_to_code)
        except (TypeError, ValueError):
            continue
        if not rate or rate <= 0:
            continue
        # Frankfurter ships `EUR → code` (e.g. EUR → USD = 1.08).
        # We store the inverse (`code → EUR`) so callers can
        # multiply: amount_in_code * rate = amount_in_EUR.
        new_cache[code] = 1.0 / rate
    # R2 audit fix: tighter floor — was `< 5`, but Frankfurter
    # serves ~30 currencies normally. A 6-row response (most of
    # the world missing) would have overwritten a working cache.
    # 20 is the sweet spot: covers a degraded-but-usable response
    # while rejecting an outright partial.
    if len(new_cache) < 20:
        logger.warning(
            "fx_rates refresh returned suspiciously small set (%d); keeping prior cache",
            len(new_cache),
        )
        _refresh_fail_until = time.time() + 300
        return
    # R2 audit fix: atomic swap. Pre-fix `_cache.clear(); _cache.
    # update(new_cache)` had a microsecond window where readers
    # saw an empty dict — even with the lock held by the writer,
    # the read path doesn't take the lock and could fall through
    # to rate=1 for every currency. Single reference-swap is
    # atomic under both GIL'd Python and free-threaded 3.13+.
    _cache = new_cache
    _cache_set_at = time.time()
    _refresh_fail_until = 0.0
    logger.info("fx_rates refreshed: %d currencies", len(_cache))


def _maybe_refresh() -> None:
    # Fast-path no-op under the read view: most calls find a warm
    # cache and avoid the lock entirely.
    if _cache and (time.time() - _cache_set_at) <= _TTL_SECONDS:
        return
    # R2 audit fix: back-off after a failed fetch. Without this,
    # a sustained Frankfurter outage made every read block on the
    # 5s timeout (TTL expired → retry → timeout → return).
    if _refresh_fail_until and time.time() < _refresh_fail_until:
        return
    # Lock + double-check inside the critical section. A concurrent
    # caller that won the race to refresh has already populated
    # _cache by the time we get the lock; the second check skips
    # the redundant fetch.
    with _refresh_lock:
        if _cache and (time.time() - _cache_set_at) <= _TTL_SECONDS:
            return
        if _refresh_fail_until and time.time() < _refresh_fail_until:
            return
        _refresh()


def get_rate_eur(code: str) -> Optional[float]:
    """Returns the rate to convert 1 unit of `code` into EUR, or
    None if we don't have a rate for that currency (caller should
    skip the conversion). EUR itself returns 1.0."""
    if not code:
        return None
    _maybe_refresh()
    return _cache.get(code.upper())


def get_all_rates_eur() -> dict[str, float]:
    """Full {currency: rate-to-EUR} dict for the /api/fx-rates
    endpoint. Excludes None entries (the API contract is "every
    key has a number")."""
    _maybe_refresh()
    return {k: v for k, v in _cache.items() if v is not None}
