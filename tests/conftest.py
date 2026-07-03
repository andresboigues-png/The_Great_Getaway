"""Shared pytest fixtures for the API test suite.

Each test gets a fresh isolated SQLite DB via the GG_DB_PATH env var the
backend honors at connect time. We set the env var BEFORE importing
src.main so init_db() targets the temp file rather than the dev DB.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

# Ensure src/ is on the import path (so `import main` works from tests/)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

# MK1 NOW-2: neutralise Sentry for the whole test session. main.py runs
# load_dotenv() (override=False) BEFORE setup_sentry(), so a real
# SENTRY_DSN in the developer's .env had every local pytest run shipping
# test-generated error events to the PRODUCTION Sentry project (the
# "Sentry is attempting to send N pending events" trailer after each
# run). Pre-setting the var to "" here wins: load_dotenv never overrides
# an existing key, and setup_sentry treats a falsy DSN as opt-out.
# Module-top (not a fixture) because it must run before ANY test module
# triggers the `import main` chain.
os.environ["SENTRY_DSN"] = ""


@pytest.fixture
def temp_db(monkeypatch):
    """A fresh empty SQLite file for one test. Tests get full schema via init_db."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("GG_DB_PATH", path)
    yield path
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture
def client(temp_db):
    """Flask test client backed by the temp DB. Re-runs init_db so the
    test DB has the full schema before any request lands."""
    # Import here (after monkeypatched env var) so init_db at module load
    # runs against the temp DB, not the production travel_planner.db.
    if "main" in sys.modules:
        # Re-init the schema on the temp DB if main was already imported
        # (pytest collects modules once per session; first test imports
        # main, subsequent tests re-use it but with new temp DBs).
        from database import init_db

        init_db()
        from main import app
    else:
        import main
        from database import init_db

        init_db()
        app = main.app

    app.config["TESTING"] = True
    # Rate limits would otherwise interfere with the test that fires
    # many requests in a row. Disable per-test; a dedicated rate-limit
    # test re-enables and pins the behaviour.
    #
    # 2026-05-26: setting RATELIMIT_ENABLED alone wasn't taking effect
    # because Flask-Limiter caches state at init_app time. Also flip
    # the runtime `limiter.enabled` flag AND reset the per-process
    # counter storage so leftover counts from other tests can't push
    # this test over the limit. RESTORE the flag on teardown so the
    # dedicated rate-limit test (which doesn't use the `client`
    # fixture) sees a clean slate.
    app.config["RATELIMIT_ENABLED"] = False
    from extensions import limiter

    _previous_enabled = limiter.enabled
    limiter.enabled = False
    try:
        limiter.reset()
    except Exception:
        # In-memory backend supports reset(); other backends may not.
        # Failure here just means we fall back to the per-request
        # disable above, which is enough for the test_client.
        pass
    # R11-B5: reset the per-user daily counters (feed_comment, trip_create)
    # so a long test suite doesn't accumulate into the cap. The module-level
    # dict persists across tests within the same process; cumulative state
    # would silently 429 the ~50th test that creates a trip.
    try:
        from helpers import _USER_DAILY_BUCKETS

        _USER_DAILY_BUCKETS.clear()
    except Exception:
        pass
    try:
        with app.test_client() as client:
            yield client
    finally:
        limiter.enabled = _previous_enabled
        try:
            limiter.reset()
        except Exception:
            pass


def _ensure_schema():
    """Run init_db() if it hasn't run for the current temp DB.
    seed_user / seed_other_user can be called in tests that don't depend
    on the `client` fixture (e.g. rate-limit), so we init the schema
    inline here too."""
    from database import init_db

    init_db()


@pytest.fixture
def seed_user(temp_db):
    """Insert a baseline user row + return the user_id. Use `auth_headers`
    if the request needs Authorization. Use `seed_user` directly when you
    just need the id (e.g. as a friend_id to add)."""
    _ensure_schema()
    from database import get_db

    user_id = "test-user-1"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (user_id, "test@example.com", "Test User", "https://example.com/p.png"),
        )
        conn.commit()
    return user_id


@pytest.fixture
def seed_other_user(temp_db):
    """Second user, useful for friend / sharing tests."""
    _ensure_schema()
    from database import get_db

    user_id = "test-user-2"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (user_id, "other@example.com", "Other User", "https://example.com/o.png"),
        )
        conn.commit()
    return user_id


@pytest.fixture
def auth_headers(seed_user):
    """Authorization header for seed_user — every gated endpoint test
    passes these so the @require_auth decorator lets the request through."""
    from auth import issue_token

    return {"Authorization": f"Bearer {issue_token(seed_user)}"}


@pytest.fixture
def other_auth_headers(seed_other_user):
    """Authorization header for seed_other_user — used by tests that
    verify per-user gates (e.g. non-planner can't edit someone else's trip)."""
    from auth import issue_token

    return {"Authorization": f"Bearer {issue_token(seed_other_user)}"}


# ── Shared helpers hoisted from the former tests/test_api.py monolith ──────────
# Used across multiple test_api_*.py modules; imported via `from tests.conftest
# import _create_trip, ...`. Bodies are verbatim from the original file.


def _create_trip(client, headers, trip_id="trip-feed", name="Test Trip", public=False):
    """Mint a trip via /api/trips. Pass `public=True` to flip
    `is_public = 1` so the trip is shareable to the feed — the
    /api/feed/share endpoint requires public visibility (2026-05-18
    change closing the "share private trip card with broken
    click-through" hole). Defaults to private (matching the trip-
    create endpoint's own default) so non-share tests keep their
    pre-change behaviour."""
    trip_payload: dict = {"id": trip_id, "name": name, "country": "Test"}
    if public:
        trip_payload["isPublic"] = True
    res = client.post("/api/trips", headers=headers, json={"trip": trip_payload})
    assert res.status_code == 200
    return trip_id


def _befriend(client, headers_a, headers_b, user_a, user_b):
    """Helper: establish a mutual-follow between user_a and user_b.

    Pre-Model-B this called /api/friends/add then /api/friends/accept
    to land both halves of the legacy friend-request dance. Post-
    Model-B the same calls still work (they're façades over follows
    now — see routes/friends.py) so the test surface didn't have to
    change. Two POSTs = two follow edges = one mutual."""
    client.post("/api/friends/add", headers=headers_a, json={"friend_id": user_b})
    client.post("/api/friends/accept", headers=headers_b, json={"friend_id": user_a})


def _make_friends(user_a, user_b):
    """Establish a mutual-follow between user_a and user_b at the DB
    level (bypassing the friend-add → follow-back façade for speed).
    Under Model B, "friend" = mutual follow, so we just insert both
    follow edges. CURRENT_TIMESTAMP keeps the rows fresh enough for
    the feed's 30-day window."""
    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) "
            "VALUES (?, ?, CURRENT_TIMESTAMP)",
            (user_a, user_b),
        )
        c.execute(
            "INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) "
            "VALUES (?, ?, CURRENT_TIMESTAMP)",
            (user_b, user_a),
        )
        conn.commit()


def _seed_member(trip_id, user_id, role="planner"):
    """Drop an accepted trip_members row directly so the test can focus
    on settle-up rather than re-litigating the invite flow."""
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, ?, 0, 'accepted', ?)",
            (trip_id, user_id, role, user_id),
        )
        conn.commit()
