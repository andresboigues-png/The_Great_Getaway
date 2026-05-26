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


def _refresh() -> None:
    """Pull the latest rates from Frankfurter and replace the
    cache. Inverts the provider's `EUR → X` table to `X → EUR`
    so the rest of the server reads in the convention it expects."""
    global _cache_set_at
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
    if not new_cache or len(new_cache) < 5:
        # Suspicious payload — refuse to overwrite a working cache
        # with a near-empty one.
        logger.warning("fx_rates refresh returned suspiciously small set; keeping prior cache")
        return
    _cache.clear()
    _cache.update(new_cache)
    _cache_set_at = time.time()
    logger.info("fx_rates refreshed: %d currencies", len(_cache))


def _maybe_refresh() -> None:
    if not _cache or (time.time() - _cache_set_at) > _TTL_SECONDS:
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
