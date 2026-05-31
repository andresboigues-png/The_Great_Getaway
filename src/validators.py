"""Input validators for money/text/URL fields written from client payloads.

Audit fix (2026-05-26): the write endpoints (`/api/expenses`,
`/api/budgets`, `/api/settlements`, `/api/sync`) trusted whatever the
client sent for `value`, `currency`, `who`, `label`, `receiptUrl`, etc.
That let an attacker post NaN/Infinity/negative amounts, currencies
that don't exist, 10 MB labels, or `receiptUrl` pointing at another
user's upload. These helpers are the central place for those checks
so every write path enforces the same bounds.

Design choices:
  - Validators return a *cleaned* value or raise `ValidationError`.
  - The route catches `ValidationError` and converts to a 400.
  - Currency is allowlisted against the same code list the frontend's
    constants.ts ships; unknown currencies are rejected rather than
    silently degrading the FX-rate lookup.
  - `who` is *not* validated against the trip's companion roster here
    (the route has the cursor, this module is pure). Routes that
    want that check should do it after this.
"""

import math
import re
from typing import Optional


# R2 + R3 shared helper: scrub `?key=...` / `&key=...` from any
# upstream-API URL or response body before logging or returning
# to the client. Google's Generative Language + Maps APIs both
# echo the request URL in some error response bodies, which would
# otherwise leak our server keys (or the user's BYO Gemini key)
# into logs, Sentry breadcrumbs, and HTTP 5xx response bodies.
# Centralised here so every external-API code path can `from
# validators import scrub_key`.
_KEY_QS_RE = re.compile(r"[?&]key=[^&\s]+")
# R6-B3: Google API keys are AIzaSy + 33 chars from [A-Za-z0-9_-].
# Sometimes Google's error JSON echoes the key OUTSIDE a querystring
# (e.g. `{"error": {"message": "API key AIzaSy... not valid"}}` or
# `keyValue: "AIzaSy..."` fields). The querystring regex above
# wouldn't catch those — this standalone-key regex does.
_STANDALONE_KEY_RE = re.compile(r"AIzaSy[A-Za-z0-9_-]{33}")


def scrub_key(text: str | None) -> str:
    """Replace any `?key=<value>` or `&key=<value>` substring with
    `?key=REDACTED`. Safe to call on None/empty (returns ''). Used
    before any logger.warning / RuntimeError that interpolates
    upstream-API output.

    R6-B3: also strips standalone Gemini key tokens (AIzaSy + 33
    chars) that Google sometimes echoes in error JSON bodies
    outside of querystring form. Both server-pool keys AND user
    BYO keys are covered."""
    if not text:
        return ""
    cleaned = _KEY_QS_RE.sub("?key=REDACTED", text)
    cleaned = _STANDALONE_KEY_RE.sub("AIza...REDACTED", cleaned)
    return cleaned


# ── Constants ────────────────────────────────────────────────────────

# ISO 4217 currencies we explicitly accept. Mirrors the frontend's
# constants.ts CONVERSION_RATES + the Frankfurter API supported set.
# Any code not on this list is rejected at write time — silently
# falling back to rate=1 (the pre-fix behaviour) lets an EGP 100
# expense get stored as €100 with no warning.
_ALLOWED_CURRENCIES = frozenset({
    "EUR", "USD", "GBP", "JPY", "CHF", "AUD", "CAD", "CNY", "HKD",
    "SGD", "SEK", "NOK", "DKK", "MXN", "BRL", "INR", "KRW", "TRY",
    "NZD", "ZAR", "PLN", "CZK", "HUF", "RON", "BGN", "HRK", "ISK",
    "ILS", "AED", "SAR", "THB", "IDR", "MYR", "PHP", "VND", "EGP",
    "ARS", "CLP", "COP", "PEN", "TWD",
})

# Maximum lengths for free-text fields. Generous enough that no
# legitimate user content gets cut, tight enough that a 10MB payload
# can't sneak through.
_MAX_LABEL_LEN = 200
_MAX_COUNTRY_LEN = 120
_MAX_WHO_LEN = 200
_MAX_NOTE_LEN = 500
_MAX_NAME_LEN = 200
_MAX_BUDGET_LABEL_LEN = 120

# Money bounds. Upper bound is paranoid — €1e9 is well above any
# realistic single-expense value but stops a malicious client from
# storing 1e308 (max float) which would break sum-aggregation
# downstream.
_MIN_MONEY = 0.0
_MAX_MONEY = 1e9

# Latitude / longitude bounds (WGS-84). Trips outside these aren't
# real locations.
_MIN_LAT, _MAX_LAT = -90.0, 90.0
_MIN_LON, _MAX_LON = -180.0, 180.0

# ISO 3166-1 alpha-2 country code shape.
_COUNTRY_CODE_RE = re.compile(r"^[A-Z]{2}$")


class ValidationError(ValueError):
    """Raised when a payload field fails its validation contract.
    Routes should catch this and return 400."""


# ── Primitives ───────────────────────────────────────────────────────


def _strip_controls(s: str) -> str:
    """Drop C0 control chars (0x00–0x1F) except newline (\\n=0x0A)
    and tab (\\t=0x09). Bios, notes, labels accept newlines but not
    bell/vertical-tab/etc."""
    return "".join(c for c in s if c == "\n" or c == "\t" or ord(c) >= 0x20)


def _strip_all_controls(s: str) -> str:
    """Drop ALL C0 control chars including newlines/tabs. Use for
    single-line fields (who, name, currency, country)."""
    return "".join(c for c in s if ord(c) >= 0x20)


def clean_text(
    value, *, max_len: int, allow_newlines: bool = False,
    field_name: str = "value",
) -> str:
    """Coerce a JSON value to a clean string. Returns the empty
    string for None. Raises ValidationError on non-string input or
    if the cleaned string exceeds max_len."""
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValidationError(f"{field_name} must be a string")
    cleaned = (_strip_controls(value) if allow_newlines
               else _strip_all_controls(value))
    cleaned = cleaned.strip()
    if len(cleaned) > max_len:
        raise ValidationError(
            f"{field_name} must be {max_len} characters or fewer",
        )
    return cleaned


# ── Money ────────────────────────────────────────────────────────────


def validate_money(value, *, field_name: str = "value",
                   allow_zero: bool = True) -> float:
    """Coerce to a finite float in (0, _MAX_MONEY] (or [0, _MAX_MONEY]
    if allow_zero). Raises ValidationError on NaN, ±Infinity, negative,
    non-numeric strings, or absurdly large values."""
    try:
        f = float(value)
    except (TypeError, ValueError):
        raise ValidationError(f"{field_name} must be a number")
    if not math.isfinite(f):
        raise ValidationError(f"{field_name} must be a finite number")
    if f < _MIN_MONEY:
        raise ValidationError(f"{field_name} must be non-negative")
    if not allow_zero and f == 0.0:
        raise ValidationError(f"{field_name} must be positive")
    if f > _MAX_MONEY:
        raise ValidationError(
            f"{field_name} exceeds the maximum allowed ({_MAX_MONEY:g})",
        )
    return f


def validate_splits(value, *, field_name: str = "splits") -> Optional[dict]:
    """Validate an expense `splits` map. Returns:
      - None when value is None / "" / {} (caller falls back to the
        legacy equal-share path).
      - A cleaned `{str → float}` dict otherwise.

    Raises ValidationError on shape failures (non-dict, empty key,
    non-numeric value, NaN/Inf, value outside [0, 100]).

    R10-B6a F2: lifted from routes/expenses.py:110-124 so /api/sync's
    bulk-write loops (data.py) get the same gate. Pre-fix the bulk
    sync path stored arbitrary garbage in the splits column — a
    curl-driven payload of `{"sara": "infinity"}` would land verbatim
    and crash the balance reducer on every subsequent read.
    """
    if value is None or value == "":
        return None
    if not isinstance(value, dict):
        raise ValidationError(f"{field_name} must be an object")
    cleaned: dict[str, float] = {}
    for k, v in value.items():
        if not isinstance(k, str) or not k.strip():
            raise ValidationError(
                f"{field_name} keys must be non-empty strings",
            )
        try:
            pct = float(v)
        except (TypeError, ValueError):
            raise ValidationError(f"{field_name} values must be numeric")
        if not math.isfinite(pct):
            raise ValidationError(f"{field_name} values must be finite")
        if pct < 0 or pct > 100:
            raise ValidationError(
                f"{field_name} values must be in [0, 100]",
            )
        cleaned[k] = pct
    return cleaned or None


def validate_currency(value) -> str:
    """Coerce to an uppercased ISO 4217 code we recognise. Raises
    ValidationError on unknown codes."""
    if value is None or value == "":
        return "EUR"
    if not isinstance(value, str):
        raise ValidationError("currency must be a string")
    code = value.strip().upper()
    if len(code) != 3 or not code.isalpha():
        raise ValidationError("currency must be a 3-letter ISO code")
    if code not in _ALLOWED_CURRENCIES:
        raise ValidationError(f"currency '{code}' is not supported")
    return code


def validate_date(value, *, field_name: str = "date") -> str:
    """Accept an empty string / None (no date set) or a strict ISO calendar
    date `YYYY-MM-DD`; reject anything else.

    MK2 BUG-8: garbage dates (e.g. "not-a-date-99999", or a batch-import cell
    that didn't parse) used to store verbatim and corrupt Insights — the
    avg-daily denominator gained phantom buckets, the timeline rendered
    "Invalid Date"/"Jan 1", and the date became the max of a Frankfurter
    historical-FX URL, breaking the whole trip's "at trip" rate fetch."""
    if value is None:
        return ""
    s = str(value).strip()
    if s == "":
        return ""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        raise ValidationError(f"{field_name} must be a date (YYYY-MM-DD)")
    from datetime import date as _date
    try:
        y, m, d = (int(p) for p in s.split("-"))
        _date(y, m, d)  # rejects impossible dates like 2026-13-40
    except (ValueError, TypeError):
        raise ValidationError(f"{field_name} must be a valid calendar date")
    return s


# ── Geo ──────────────────────────────────────────────────────────────


def validate_lat(value) -> Optional[float]:
    """Validate a WGS-84 latitude. Returns None if value is None.
    Raises on out-of-range or non-numeric."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        raise ValidationError("lat must be a number")
    if not math.isfinite(f):
        raise ValidationError("lat must be finite")
    if not (_MIN_LAT <= f <= _MAX_LAT):
        raise ValidationError(
            f"lat must be between {_MIN_LAT} and {_MAX_LAT}",
        )
    return f


def validate_lng(value) -> Optional[float]:
    """Validate a WGS-84 longitude. Returns None if value is None."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        raise ValidationError("lng must be a number")
    if not math.isfinite(f):
        raise ValidationError("lng must be finite")
    if not (_MIN_LON <= f <= _MAX_LON):
        raise ValidationError(
            f"lng must be between {_MIN_LON} and {_MAX_LON}",
        )
    return f


def validate_country_code(value) -> Optional[str]:
    """Validate an ISO 3166-1 alpha-2 country code. Returns None if
    value is None or empty. Raises on bad shape."""
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValidationError("countryCode must be a string")
    code = value.strip().upper()
    if not _COUNTRY_CODE_RE.match(code):
        raise ValidationError("countryCode must be 2 letters")
    return code


# ── URLs ─────────────────────────────────────────────────────────────


def validate_upload_url(
    value, *, user_id: str, allow_google: bool = False,
    field_name: str = "url", allow_empty: bool = True,
) -> Optional[str]:
    """Validate a URL that should point at an upload owned by the
    caller. Accepts:
      - "" (return "") when allow_empty=True
      - "/static/uploads/<user_id>/<file>" (per-user subdir layout)
      - "/static/uploads/<file>" (legacy flat layout, pre-§2.7)
      - "https://lh3.googleusercontent.com/..." if allow_google
        (used for profile pictures from Google OAuth)
    Anything else is rejected.

    Mirrors the validator already in src/routes/settings.py for the
    profile-picture field, just lifted to a helper so expenses,
    trips, and settings can share it.
    """
    if value is None or value == "":
        if allow_empty:
            return None
        raise ValidationError(f"{field_name} is required")
    if not isinstance(value, str):
        raise ValidationError(f"{field_name} must be a string")
    url = value.strip()
    if not url:
        if allow_empty:
            return None
        raise ValidationError(f"{field_name} is required")
    if allow_google and url.startswith("https://lh3.googleusercontent.com/"):
        return url
    # secure_filename is from werkzeug — strips path separators etc.
    from werkzeug.utils import secure_filename
    safe_user_dir = secure_filename(user_id) or "anon"
    owned_prefix = f"/static/uploads/{safe_user_dir}/"
    legacy_prefix = "/static/uploads/"
    if url.startswith(owned_prefix):
        return url
    if (
        url.startswith(legacy_prefix)
        and "/" not in url[len(legacy_prefix):]
        and url != legacy_prefix
    ):
        # Legacy flat layout — only accept paths with NO further subdir.
        return url
    raise ValidationError(
        f"{field_name} must point at your own upload",
    )


# ── Companions ──────────────────────────────────────────────────────
#
# R2 audit fix: the companions array (trip.companions_json) was
# previously persisted verbatim — no name length cap, no field-shape
# validation, no linkedUserId verification. This let:
#   - a malicious POST persist [{"name": "A" * 100000}] → 100KB stored
#     per trip, ballooning /api/data response sizes
#   - a crafted [{"name": "...", "linkedUserId": "<any-real-id>"}]
#     plant a fake link → balance math + member chips display the
#     fabricated name for any user the attacker names
#   - control chars / NUL bytes / unicode-overflow tricks slip into
#     downstream renderers
#
# `clean_companions(comps)` returns a normalised list with each entry
# guaranteed to be `{name: str (1-200 chars, control-stripped),
# linkedUserId: str | None}`. Invalid entries are DROPPED rather than
# raising — the route should accept a partial sync that includes
# garbage from a legacy client without failing the whole upsert.
# `verified_linked_ids` (set[str], optional) further constrains
# linkedUserId values: only entries whose linkedUserId is in this set
# (or None) survive. Pass the live trip_members user_ids to enforce
# "linkedUserId must correspond to an actual invited member".


def clean_companions(comps, verified_linked_ids=None):
    """Best-effort normalisation of a companions list. Returns a list
    of dicts shaped {name: str, linkedUserId: str | None,
    linkStatus: str | None}. Drops entries that can't be made sane.

    If `verified_linked_ids` is provided, any linkedUserId NOT in the
    set is coerced to None (the name + UI presence survive; the
    attacker-planted link silently disappears)."""
    if not isinstance(comps, list):
        return []
    out: list[dict] = []
    seen_names: set[str] = set()
    for c in comps:
        if not isinstance(c, dict):
            continue
        raw_name = c.get("name")
        if not isinstance(raw_name, str):
            continue
        # Strip C0 control chars + NUL.
        name = "".join(ch for ch in raw_name if ord(ch) >= 0x20).strip()
        if not name:
            continue
        # NFC normalise so visually-identical Unicode (decomposed vs
        # composed) doesn't dupe.
        import unicodedata
        name = unicodedata.normalize("NFC", name)[:_MAX_NAME_LEN]
        # Case-fold dedupe — same shape as the frontend's modal-level
        # check, mirrored server-side so a curl bypass can't sneak in
        # `Sara` + `sara`.
        key = name.lower()
        if key in seen_names:
            continue
        seen_names.add(key)
        linked = c.get("linkedUserId")
        if linked is not None and not isinstance(linked, str):
            linked = None
        if linked and len(linked) > 128:
            # User IDs are Google `sub` (~21 digits) or test-prefixed.
            # Anything past 128 chars is junk / malicious.
            linked = None
        if linked and verified_linked_ids is not None:
            if linked not in verified_linked_ids:
                linked = None
        link_status = c.get("linkStatus") if isinstance(c.get("linkStatus"), str) else None
        out.append({
            "name": name,
            "linkedUserId": linked,
            "linkStatus": link_status,
        })
    # Cap total length — no one needs 1000 companions on one trip.
    return out[:200]
