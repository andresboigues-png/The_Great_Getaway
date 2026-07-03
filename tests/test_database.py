"""Unit tests for src/database.py helpers.

Covers the retry_on_lock decorator added 2026-05-14 in response to the
PA-incident wave of 500s on /api/sync + /api/friends/add (both
sqlite3.OperationalError: database is locked at commit time).

The decorator is the third layer of SQLite contention defence:
  1. busy_timeout=30s — SQLite waits up to 30s for the lock.
  2. sync_data batches commits per-table — releases the lock between
     sections so concurrent writers can slip in.
  3. retry_on_lock at the route boundary — retries the whole handler
     up to 3 times with exponential backoff if the first two layers
     still fail.

These tests pin the decorator's contract so a future refactor can't
silently regress any of:
  - retries on `database is locked` and eventually returns the value
  - retries on `database is busy` (alternate phrasing SQLite uses)
  - does NOT retry on other OperationalErrors (disk full, no such table)
  - does NOT retry on non-OperationalError exceptions
  - gives up after max_attempts and re-raises the lock error
"""

import sqlite3
import sys
from pathlib import Path

import pytest

# Same path setup as conftest.py — src/ on sys.path so `import database`
# works without a leading `src.` prefix.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from database import _is_locked_error, retry_on_lock  # noqa: E402

# ── _is_locked_error classification ─────────────────────────────────


def test_is_locked_error_detects_database_is_locked():
    exc = sqlite3.OperationalError("database is locked")
    assert _is_locked_error(exc) is True


def test_is_locked_error_detects_database_is_busy():
    """SQLite uses both phrasings depending on which lock state is hit."""
    exc = sqlite3.OperationalError("database is busy")
    assert _is_locked_error(exc) is True


def test_is_locked_error_case_insensitive():
    exc = sqlite3.OperationalError("Database Is Locked")
    assert _is_locked_error(exc) is True


def test_is_locked_error_rejects_other_operational_errors():
    """Schema drift, disk full, missing table — none of these should
    trigger a retry."""
    for msg in (
        "no such table: trips",
        "disk I/O error",
        "table trips has no column named foo",
        "UNIQUE constraint failed",
    ):
        exc = sqlite3.OperationalError(msg)
        assert _is_locked_error(exc) is False, f"misclassified: {msg!r}"


def test_is_locked_error_rejects_non_operational_errors():
    """A KeyError or ValueError isn't a lock error even if the string
    happens to say 'locked'."""
    assert _is_locked_error(KeyError("database is locked")) is False
    assert _is_locked_error(ValueError("database is locked")) is False
    assert _is_locked_error(RuntimeError("database is locked")) is False


# ── retry_on_lock retry behaviour ───────────────────────────────────


def _make_flaky(
    failures_before_success: int, exc_factory=lambda: sqlite3.OperationalError("database is locked")
):
    """Build a callable that raises `exc_factory()` the first N times,
    then returns "ok". Calls are counted on the wrapped function's
    `calls` attribute so tests can assert how many attempts ran."""
    state = {"calls": 0}

    def fn():
        state["calls"] += 1
        if state["calls"] <= failures_before_success:
            raise exc_factory()
        return "ok"

    fn.state = state  # type: ignore[attr-defined]
    return fn


def test_retry_on_lock_succeeds_on_first_call():
    """No retry needed when the wrapped function succeeds immediately."""

    @retry_on_lock()
    def fn():
        return 42

    assert fn() == 42


def test_retry_on_lock_retries_then_succeeds():
    """Two transient locks then success — caller sees the success."""
    inner = _make_flaky(failures_before_success=2)
    wrapped = retry_on_lock(max_attempts=4, base_delay=0.001)(inner)
    assert wrapped() == "ok"
    assert inner.state["calls"] == 3  # 2 failures + 1 success


def test_retry_on_lock_gives_up_after_max_attempts():
    """If every attempt hits the lock, the error eventually escapes."""
    inner = _make_flaky(failures_before_success=10)  # always fails
    wrapped = retry_on_lock(max_attempts=3, base_delay=0.001)(inner)
    with pytest.raises(sqlite3.OperationalError) as info:
        wrapped()
    assert "database is locked" in str(info.value)
    assert inner.state["calls"] == 3  # capped at max_attempts


def test_retry_on_lock_does_not_retry_other_operational_errors():
    """A `no such table` error should bubble up immediately — no point
    burning retry budget on a schema bug."""
    inner = _make_flaky(
        failures_before_success=10,
        exc_factory=lambda: sqlite3.OperationalError("no such table: trips"),
    )
    wrapped = retry_on_lock(max_attempts=5, base_delay=0.001)(inner)
    with pytest.raises(sqlite3.OperationalError) as info:
        wrapped()
    assert "no such table" in str(info.value)
    assert inner.state["calls"] == 1  # no retry


def test_retry_on_lock_does_not_retry_non_operational_errors():
    """KeyError, ValueError, etc. should propagate untouched."""
    state = {"calls": 0}

    @retry_on_lock(max_attempts=5, base_delay=0.001)
    def fn():
        state["calls"] += 1
        raise KeyError("nope")

    with pytest.raises(KeyError):
        fn()
    assert state["calls"] == 1  # no retry


def test_retry_on_lock_preserves_function_metadata():
    """functools.wraps means tooling (Flask URL map, pytest, debuggers)
    sees the original function name + docstring."""

    @retry_on_lock()
    def named_handler():
        """My docstring."""
        return None

    assert named_handler.__name__ == "named_handler"
    assert named_handler.__doc__ == "My docstring."


def test_retry_on_lock_passes_args_through():
    """Positional + keyword args should reach the wrapped function on
    every retry attempt."""
    state = {"calls": 0}

    @retry_on_lock(max_attempts=3, base_delay=0.001)
    def fn(a, b, *, c):
        state["calls"] += 1
        if state["calls"] < 2:
            raise sqlite3.OperationalError("database is locked")
        return (a, b, c)

    assert fn(1, 2, c=3) == (1, 2, 3)
    assert state["calls"] == 2


def test_expected_columns_covers_golden_path_columns():
    """MK6 P2: _EXPECTED_COLUMNS must list every column the golden path relies
    on, or a stale DB boots clean (CREATE TABLE IF NOT EXISTS no-ops) then 500s.
    users.is_creator (SELECTed on every login) + categories.updated_at (delta
    sync) were both missing — this pins them so the drift tripwire covers them."""
    from database import _EXPECTED_COLUMNS

    assert "is_creator" in _EXPECTED_COLUMNS["users"], (
        "users.is_creator missing from the schema-drift tripwire"
    )
    assert "updated_at" in _EXPECTED_COLUMNS["categories"], (
        "categories.updated_at missing from the schema-drift tripwire"
    )
