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
