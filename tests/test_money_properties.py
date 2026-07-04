"""MK1 Wave J (T3-5) — property-based tests for the money engine.

The settlement/split/FX pipeline has a documented history of epsilon
regressions (BUG-37 all-zero splits, IA-2 degenerate sums, BUG-092
truncation-vs-round, MM-1/MM-5 re-stamping) — but until now only
example-based tests pinned it. Hypothesis explores the input space the
examples never covered: boundary sums, tiny/huge floats, weird-but-legal
split maps, string coercions.

Contracts under test (from the modules' own docstrings):
  * validate_money  — finite float in [0, 1e9] (exclusive 0 when
    allow_zero=False); NaN/±inf/negative/oversize rejected; numeric
    strings coerce.
  * validate_splits — {nonempty-str → float in [0,100]}; require_full
    demands |Σ − 100| ≤ 1 (the 33.33×3 allowance); the LENIENT path
    drops an all-zero map (Σ ≤ 1e-9) to None (IA-2) but passes
    odd-but-nonzero sums through unchanged.
  * compute_euro_value — EUR identity; live rate → round(value·rate, 4)
    with the client hint IGNORED (anti-tamper R3-Fix-#6); cold path →
    finite non-negative hint honoured, else 1:1 fallback.
"""

import math

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

import fx_rates
from fx_rates import compute_euro_value
from validators import ValidationError, validate_money, validate_splits

# Keep CI time bounded — 200 examples/property is plenty at this input
# dimensionality, and deadline=None avoids flaking on a busy runner.
settings.register_profile("gg", max_examples=200, deadline=None)
settings.load_profile("gg")

_money = st.floats(min_value=0.0, max_value=1e9, allow_nan=False, allow_infinity=False)
_names = st.text(min_size=1, max_size=20).filter(lambda s: bool(s.strip()))
_pcts = st.floats(min_value=0.0, max_value=100.0, allow_nan=False, allow_infinity=False)
_splits = st.dictionaries(_names, _pcts, min_size=1, max_size=8)


# ── validate_money ───────────────────────────────────────────────────


@given(_money)
def test_money_accepts_range_and_is_identity(m):
    assert validate_money(m) == float(m)


@given(_money)
def test_money_string_coercion_matches_float(m):
    assert validate_money(str(m)) == float(str(m))


@given(st.floats(max_value=0.0, exclude_max=True, allow_nan=False, allow_infinity=False))
def test_money_rejects_negative(m):
    with pytest.raises(ValidationError):
        validate_money(m)


@given(st.floats(min_value=1e9, exclude_min=True, allow_nan=False, allow_infinity=False))
def test_money_rejects_oversize(m):
    with pytest.raises(ValidationError):
        validate_money(m)


@given(st.sampled_from([float("nan"), float("inf"), float("-inf")]))
def test_money_rejects_non_finite(m):
    with pytest.raises(ValidationError):
        validate_money(m)


@given(
    st.floats(min_value=0.0, max_value=1e9, exclude_min=True, allow_nan=False, allow_infinity=False)
)
def test_money_allow_zero_false_accepts_positive(m):
    assert validate_money(m, allow_zero=False) == float(m)


def test_money_allow_zero_boundary():
    assert validate_money(0.0) == 0.0
    with pytest.raises(ValidationError):
        validate_money(0.0, allow_zero=False)


# ── validate_splits ──────────────────────────────────────────────────


@given(_splits)
def test_splits_lenient_preserves_or_drops_degenerate(d):
    """Lenient path: values/keys pass through unchanged — EXCEPT the
    IA-2 degenerate all-zero map, which collapses to None so the
    balance reducer falls back to Σ-safe equal share."""
    result = validate_splits(d)
    if sum(float(v) for v in d.values()) <= 1e-9:
        assert result is None
    else:
        assert result == {k: float(v) for k, v in d.items()}


@given(_splits)
def test_splits_lenient_is_idempotent(d):
    once = validate_splits(d)
    assume(once is not None)
    assert validate_splits(once) == once


@given(_splits)
def test_splits_require_full_enforces_the_documented_epsilon(d):
    """|Σ − 100| ≤ 1 accepted (the 33.33×3 = 99.99 allowance);
    anything further out rejected. Stay off the razor edge — float
    noise exactly AT the boundary isn't a behavior anyone relies on."""
    total = sum(float(v) for v in d.values())
    assume(abs(abs(total - 100.0) - 1.0) > 1e-6)
    if abs(total - 100.0) <= 1.0:
        assert validate_splits(d, require_full=True) == {k: float(v) for k, v in d.items()}
    else:
        with pytest.raises(ValidationError):
            validate_splits(d, require_full=True)


@given(st.lists(_names, min_size=1, max_size=6, unique=True))
def test_splits_equal_share_always_passes_require_full(names):
    """The frontend's own equal-share construction (100/n per head)
    must NEVER be rejected — this is the exact shape ManualTab submits."""
    share = 100.0 / len(names)
    d = dict.fromkeys(names, share)
    result = validate_splits(d, require_full=True)
    assert result is not None
    assert math.isclose(sum(result.values()), 100.0, abs_tol=1.0)


@given(_splits, st.sampled_from([float("nan"), float("inf"), -5.0, 101.0]))
def test_splits_rejects_any_bad_value(d, bad):
    d = dict(d)
    d["offender"] = bad
    with pytest.raises(ValidationError):
        validate_splits(d)


# ── compute_euro_value ───────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _fx_cache():
    """Deterministic rate cache per test; restored after."""
    import time as _time

    saved = (fx_rates._cache, fx_rates._cache_set_at)
    fx_rates._cache = {"EUR": 1.0, "USD": 0.5}
    fx_rates._cache_set_at = _time.time()
    yield
    fx_rates._cache, fx_rates._cache_set_at = saved


@given(_money)
def test_euro_eur_identity(value):
    assert compute_euro_value(value, "EUR") == float(value)


@given(_money, st.floats(min_value=0.0, max_value=1e9, allow_nan=False, allow_infinity=False))
def test_euro_live_rate_ignores_client_hint(value, hint):
    """Anti-tamper (R3-Fix #6): with a live rate the client hint must
    change NOTHING."""
    expected = round(float(value) * 0.5, 4)
    assert compute_euro_value(value, "USD") == expected
    assert compute_euro_value(value, "USD", client_euro_value=hint) == expected


@given(_money)
def test_euro_live_rate_rounds_to_storage_precision(value):
    result = compute_euro_value(value, "USD")
    assert result == round(result, 4)
    assert math.isfinite(result) and result >= 0


@given(_money, st.floats(min_value=0.0, max_value=1e9, allow_nan=False, allow_infinity=False))
def test_euro_cold_path_honours_finite_hint(value, hint):
    """JPY is absent from the injected cache → cold path: a finite
    non-negative hint wins; no hint → 1:1 fallback."""
    assert compute_euro_value(value, "JPY", client_euro_value=hint) == float(hint)
    assert compute_euro_value(value, "JPY") == float(value)


@given(
    _money, st.sampled_from([float("nan"), float("inf"), float("-inf"), -1.0, "garbage", object()])
)
def test_euro_cold_path_rejects_bad_hint_to_1to1(value, bad_hint):
    assert compute_euro_value(value, "JPY", client_euro_value=bad_hint) == float(value)


@given(_money, _money)
def test_euro_live_rate_is_monotonic(a, b):
    """More foreign money never converts to less EUR (same rate)."""
    lo, hi = sorted((a, b))
    assert compute_euro_value(lo, "USD") <= compute_euro_value(hi, "USD")
