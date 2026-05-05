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
    app.config["RATELIMIT_ENABLED"] = False
    with app.test_client() as client:
        yield client


@pytest.fixture
def seed_user(temp_db):
    """Insert a baseline user row so endpoints that gate on user existence
    don't reject the test request. Returns the user_id."""
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
    from database import get_db
    user_id = "test-user-2"
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)",
            (user_id, "other@example.com", "Other User", "https://example.com/o.png"),
        )
        conn.commit()
    return user_id
