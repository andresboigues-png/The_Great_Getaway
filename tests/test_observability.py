"""Tests for src/observability.py — the structured logging + Sentry glue.

Covers:
  - resolve_release() resolution order (env override → git SHA → None)
  - bind_trip_context() — request-scoped no-op safety + g.trip_id wire-up
  - attach_request_context() — after_request log line carries trip_id when bound

The tests intentionally do NOT touch the real Sentry SDK; the helper is
import-guarded so missing sentry-sdk is a supported state (CI / dev).
FIXING_ROADMAP §3.8.
"""

from __future__ import annotations

import logging
import subprocess
from unittest import mock

# ── resolve_release() ─────────────────────────────────────────────────


def test_resolve_release_prefers_sentry_release_env(monkeypatch):
    """SENTRY_RELEASE wins over everything — explicit deploy-side override."""
    from observability import resolve_release

    monkeypatch.setenv("SENTRY_RELEASE", "rel-from-env")
    monkeypatch.setenv("GG_RELEASE", "rel-from-gg")  # ignored

    assert resolve_release() == "rel-from-env"


def test_resolve_release_falls_back_to_gg_release_env(monkeypatch):
    """GG_RELEASE is the second-priority env var (deploy convention)."""
    from observability import resolve_release

    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    monkeypatch.setenv("GG_RELEASE", "rel-deploy-sha")

    assert resolve_release() == "rel-deploy-sha"


def test_resolve_release_strips_whitespace(monkeypatch):
    """Env values often carry trailing newlines from `echo $SHA > .env` —
    strip them so the tag matches Sentry's expectation."""
    from observability import resolve_release

    monkeypatch.setenv("SENTRY_RELEASE", "  rel-trimmed\n")

    assert resolve_release() == "rel-trimmed"


def test_resolve_release_returns_none_when_no_source(monkeypatch):
    """No env vars + no git binary → return None so Sentry init omits the
    release tag entirely (rather than blocking on subprocess errors)."""
    from observability import resolve_release

    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    monkeypatch.delenv("GG_RELEASE", raising=False)

    # Simulate `git` not on PATH.
    with mock.patch("observability.subprocess.run", side_effect=FileNotFoundError):
        assert resolve_release() is None


def test_resolve_release_runs_git_when_no_env(monkeypatch):
    """When no env override is set we shell out to `git rev-parse --short=12
    HEAD`. Use a mocked subprocess so the test passes regardless of the
    actual repo state."""
    from observability import resolve_release

    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    monkeypatch.delenv("GG_RELEASE", raising=False)

    fake_result = subprocess.CompletedProcess(
        args=["git", "rev-parse", "--short=12", "HEAD"],
        returncode=0,
        stdout="abc123def456\n",
        stderr="",
    )
    with mock.patch("observability.subprocess.run", return_value=fake_result) as run_mock:
        assert resolve_release() == "abc123def456"

    run_mock.assert_called_once()
    args, kwargs = run_mock.call_args
    assert args[0] == ["git", "rev-parse", "--short=12", "HEAD"]
    # Must capture output so it doesn't pollute stdout in prod logs.
    assert kwargs.get("capture_output") is True
    # Must have a timeout — observability MUST NOT block app boot.
    assert kwargs.get("timeout") and kwargs["timeout"] <= 2.0


def test_resolve_release_handles_git_nonzero_returncode(monkeypatch):
    """`git` exits non-zero when not in a repo → fall through to None
    instead of returning an error string."""
    from observability import resolve_release

    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    monkeypatch.delenv("GG_RELEASE", raising=False)

    fake_result = subprocess.CompletedProcess(
        args=["git", "rev-parse", "--short=12", "HEAD"],
        returncode=128,
        stdout="",
        stderr="fatal: not a git repository\n",
    )
    with mock.patch("observability.subprocess.run", return_value=fake_result):
        assert resolve_release() is None


def test_resolve_release_handles_git_timeout(monkeypatch):
    """A hanging filesystem / locked repo shouldn't block app startup —
    timeout should fall through to None."""
    from observability import resolve_release

    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    monkeypatch.delenv("GG_RELEASE", raising=False)

    with mock.patch(
        "observability.subprocess.run",
        side_effect=subprocess.TimeoutExpired(cmd="git", timeout=1.5),
    ):
        assert resolve_release() is None


# ── bind_trip_context() ───────────────────────────────────────────────


def test_bind_trip_context_no_request_is_noop():
    """Calling outside a Flask request context is a no-op — observability
    MUST NOT raise into the caller. Keeps the helper safe to call from
    background jobs / CLI tools without a wrapping try/except."""
    from observability import bind_trip_context

    # No app context, no request context — should silently succeed.
    bind_trip_context("trip-123")  # nothing to assert; just MUST NOT raise


def test_bind_trip_context_empty_trip_id_is_noop():
    """None / empty trip_id is intentionally a no-op so callers don't
    have to branch on `if trip_id:` before calling."""
    from observability import bind_trip_context

    bind_trip_context(None)
    bind_trip_context("")
    # No exceptions = pass.


def test_bind_trip_context_sets_g_trip_id_inside_request(client, auth_headers, seed_user):
    """When inside a request handler, bind_trip_context() stashes the
    trip_id on flask.g. We exercise this via /api/trips which calls
    bind_trip_context(t["id"]) — then peek at the request log line
    captured by the gg.request logger."""
    # Make a real request to a trip endpoint that calls bind_trip_context
    # internally. The after_request hook emits a structured log line
    # — capture it with a handler attached to gg.request.

    captured = []

    class Capture(logging.Handler):
        def emit(self, record):
            captured.append(record)

    logger = logging.getLogger("gg.request")
    handler = Capture()
    handler.setLevel(logging.INFO)
    logger.addHandler(handler)
    try:
        # Send a valid upsert_trip body — minimum viable shape.
        resp = client.post(
            "/api/trips",
            json={"trip": {"id": "trip-obs-test", "name": "Test", "country": "PT"}},
            headers=auth_headers,
        )
        assert resp.status_code in (200, 201), resp.get_data(as_text=True)
    finally:
        logger.removeHandler(handler)

    # The captured log records should include one for /api/trips with
    # trip_id="trip-obs-test" attached as a structured extra field.
    trip_records = [r for r in captured if "/api/trips" in r.getMessage()]
    assert trip_records, "no log record for /api/trips request"

    # `extra=` fields are merged into the LogRecord as attributes — check
    # by getattr() rather than expecting a dict, because that's how the
    # logging stdlib actually exposes them.
    matched = [r for r in trip_records if getattr(r, "trip_id", None) == "trip-obs-test"]
    assert matched, (
        f"no /api/trips log record had trip_id='trip-obs-test'; "
        f"records: {[(r.getMessage(), getattr(r, 'trip_id', None)) for r in trip_records]}"
    )


def test_bind_trip_context_unbound_logs_without_trip_id(client, auth_headers):
    """A request to a non-trip route (e.g. /api/auth/whoami via 401 or
    /api/data) should NOT have trip_id on its log record. The before_request
    hook initialises g.trip_id = None so log_extra() filters it out."""
    captured = []

    class Capture(logging.Handler):
        def emit(self, record):
            captured.append(record)

    logger = logging.getLogger("gg.request")
    handler = Capture()
    handler.setLevel(logging.INFO)
    logger.addHandler(handler)
    try:
        # /api/data doesn't take a trip_id — should not call bind_trip_context.
        resp = client.get("/api/data", headers=auth_headers)
        assert resp.status_code in (200, 304)
    finally:
        logger.removeHandler(handler)

    data_records = [r for r in captured if "/api/data" in r.getMessage()]
    assert data_records, "no log record for /api/data request"

    # No trip_id attribute should appear (log_extra strips Nones).
    for r in data_records:
        assert getattr(r, "trip_id", None) is None, (
            f"unexpected trip_id={getattr(r, 'trip_id', None)} on /api/data"
        )
