"""Tests for scripts/fk_audit.py — FIXING_ROADMAP §1.4 Phase 1.

The audit script is the prerequisite for flipping PRAGMA foreign_keys=ON
in get_db(). It MUST:

  1. Return zero orphans against a freshly-initialised DB (regression
     net — if any future schema change introduces an orphan-by-default
     row, this test catches it).
  2. Find synthetic orphans we inject — proves the orphan detection
     actually works, not just that it always returns clean.
  3. Honour nullable FKs — NULL values in nullable_ok columns are not
     orphans.
  4. Emit valid JSON when --json is passed (machine consumption).
  5. Exit 0 / 1 / 2 per the documented contract.

The tests live OUTSIDE tests/conftest.py's `client` fixture because
they only need a SQLite DB; spinning up Flask is wasted overhead and
adds an init_db side-effect that complicates synthetic-row tests.
"""

from __future__ import annotations

import json
import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parent.parent
AUDIT_SCRIPT = ROOT / "scripts" / "fk_audit.py"


# Ensure src/ is on the import path so the in-process `audit()` call
# can `import database` for init_db. Re-applied here rather than relying
# on conftest because we want this module to be runnable standalone.
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT / "scripts"))


@pytest.fixture
def fresh_db(monkeypatch):
    """A freshly initialised SQLite DB containing the full schema +
    nothing else. Yields the file path."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("GG_DB_PATH", path)
    # init_db is the canonical schema producer until §1.6 retires it.
    from database import init_db
    init_db()
    yield path
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture
def fresh_db_with_users(fresh_db):
    """Adds two user rows so we can write trips / expenses / friend
    links that DO have valid parents (so we can isolate which inserts
    are orphans and which aren't)."""
    with sqlite3.connect(fresh_db) as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES "
            "('u1', 'a@example.com', 'Alice'), "
            "('u2', 'b@example.com', 'Bob')"
        )
        conn.commit()
    return fresh_db


# ── In-process audit() ────────────────────────────────────────────────


def test_audit_fresh_db_has_zero_orphans(fresh_db):
    """The clean-baseline regression test. If a future schema change
    accidentally introduces default rows that violate referential
    integrity, this turns red."""
    import fk_audit
    classes = fk_audit.audit(fresh_db, samples=0)
    total = sum(c.orphan_count for c in classes)
    assert total == 0, (
        f"fresh init_db produced {total} orphans across "
        f"{sum(1 for c in classes if c.orphan_count)} class(es): "
        + ", ".join(
            f"{c.child_table}.{c.child_column}={c.orphan_count}"
            for c in classes if c.orphan_count
        )
    )


def test_audit_discovers_declared_relationships(fresh_db):
    """Every FK declared in CREATE TABLE FOREIGN KEY clauses must show
    up in the audit set with source="declared". As of §1.4 Phase 4
    the three formerly-implicit FKs (budgets.trip_id,
    trip_members.invited_by, feed_posts.repost_of_post_id) ALSO
    became declared via migration e1b8d2a3c4f5 — they're now
    discovered by PRAGMA foreign_key_list along with the rest.
    IMPLICIT_FKS is currently empty (the migration absorbed every
    relationship that was on it); the test for "implicit" coverage
    re-arms automatically as soon as a future schema change adds a
    new column that can't get a real FK without a rebuild."""
    import fk_audit
    classes = fk_audit.audit(fresh_db, samples=0)
    sources = {(c.child_table, c.child_column): c.source for c in classes}

    # Baseline-era declared FKs.
    assert sources.get(("expenses", "trip_id")) == "declared"
    assert sources.get(("trip_members", "user_id")) == "declared"
    assert sources.get(("settlements", "from_user_id")) == "declared"

    # Phase 4 promoted these three from implicit to declared.
    assert sources.get(("budgets", "trip_id")) == "declared"
    assert sources.get(("trip_members", "invited_by")) == "declared"
    assert sources.get(("feed_posts", "repost_of_post_id")) == "declared"

    # No duplicates: each (child_table, child_column) pair appears
    # exactly once in the audit set (the bug §1.4 deploy surfaced —
    # if IMPLICIT_FKS lists a now-declared FK, the audit reports it
    # twice).
    keys = [(c.child_table, c.child_column) for c in classes]
    assert len(keys) == len(set(keys)), (
        f"duplicate FK entries in audit: "
        f"{[k for k in keys if keys.count(k) > 1]}"
    )


def test_audit_detects_synthetic_orphan_expense(fresh_db_with_users):
    """Inject an expense pointing at a trip id that doesn't exist; the
    audit must spot it under expenses.trip_id → trips.id."""
    with sqlite3.connect(fresh_db_with_users) as conn:
        conn.execute(
            "INSERT INTO expenses (id, trip_id, who, value) VALUES "
            "('e-orphan', 'trip-that-doesnt-exist', 'u1', 9.99)"
        )
        conn.commit()

    import fk_audit
    classes = fk_audit.audit(fresh_db_with_users, samples=5)
    expense_class = next(
        c for c in classes
        if c.child_table == "expenses" and c.child_column == "trip_id"
    )
    assert expense_class.orphan_count == 1
    assert expense_class.total_count == 1
    # The sample row should expose the dangling value so the operator
    # can correlate against the live DB.
    assert len(expense_class.samples) == 1
    sample = expense_class.samples[0]
    assert sample.get("dangling_value") == "trip-that-doesnt-exist"


def test_audit_detects_synthetic_orphan_trip_member(fresh_db_with_users):
    """trip_members has a composite PK (trip_id, user_id). The sample
    selection must surface BOTH PK columns so the operator can identify
    the exact row."""
    with sqlite3.connect(fresh_db_with_users) as conn:
        conn.execute(
            "INSERT INTO trip_members (trip_id, user_id, role) VALUES "
            "('phantom-trip', 'u1', 'planner')"
        )
        conn.commit()

    import fk_audit
    classes = fk_audit.audit(fresh_db_with_users, samples=5)
    tm_trip = next(
        c for c in classes
        if c.child_table == "trip_members" and c.child_column == "trip_id"
    )
    assert tm_trip.orphan_count == 1
    sample = tm_trip.samples[0]
    # Composite PK: both `trip_id` and `user_id` should be in the
    # sample so the operator can pinpoint the row uniquely.
    assert sample.get("trip_id") == "phantom-trip"
    assert sample.get("user_id") == "u1"
    assert sample.get("dangling_value") == "phantom-trip"


def test_audit_nullable_implicit_fk_with_null_is_not_orphan(fresh_db_with_users):
    """trip_members.invited_by is nullable (owner self-membership rows
    have NULL there). A NULL must NOT be flagged as an orphan — the
    audit's nullable_ok branch is doing real work."""
    with sqlite3.connect(fresh_db_with_users) as conn:
        # Need a real trip parent so trip_id FK passes.
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES "
            "('t1', 'u1', 'My trip')"
        )
        # Owner self-membership row: invited_by IS NULL (no inviter).
        conn.execute(
            "INSERT INTO trip_members (trip_id, user_id, role, invited_by) "
            "VALUES ('t1', 'u1', 'planner', NULL)"
        )
        conn.commit()

    import fk_audit
    classes = fk_audit.audit(fresh_db_with_users, samples=5)
    invited_by = next(
        c for c in classes
        if c.child_table == "trip_members" and c.child_column == "invited_by"
    )
    assert invited_by.orphan_count == 0
    assert invited_by.nullable_ok is True


def test_audit_nullable_implicit_fk_with_dangling_value_is_orphan(fresh_db_with_users):
    """The other half of the nullable case: when the column IS set but
    references a non-existent parent, it IS an orphan."""
    with sqlite3.connect(fresh_db_with_users) as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES "
            "('t2', 'u1', 'Another trip')"
        )
        conn.execute(
            "INSERT INTO trip_members (trip_id, user_id, role, invited_by) "
            "VALUES ('t2', 'u2', 'relaxer', 'ghost-inviter-id')"
        )
        conn.commit()

    import fk_audit
    classes = fk_audit.audit(fresh_db_with_users, samples=5)
    invited_by = next(
        c for c in classes
        if c.child_table == "trip_members" and c.child_column == "invited_by"
    )
    assert invited_by.orphan_count == 1
    assert invited_by.samples[0].get("dangling_value") == "ghost-inviter-id"


def test_audit_polymorphic_columns_not_checked(fresh_db_with_users):
    """notifications.related_id MUST NOT appear as a checked class.
    Even though `notifications` has FK declarations elsewhere
    (user_id → users), the polymorphic related_id column must NOT be
    in the audit set."""
    import fk_audit
    classes = fk_audit.audit(fresh_db_with_users, samples=0)
    polymorphic_keys = {(t, c) for (t, c, _) in fk_audit.POLYMORPHIC_COLUMNS}
    audited_keys = {(c.child_table, c.child_column) for c in classes}
    assert not (polymorphic_keys & audited_keys), (
        "polymorphic columns leaked into the audit set: "
        f"{polymorphic_keys & audited_keys}"
    )


# ── CLI subprocess ────────────────────────────────────────────────────


def _run_audit_cli(db_path: str, *extra_args: str) -> subprocess.CompletedProcess:
    """Invoke the script as a subprocess (the exit-code contract is
    part of the public interface — must be exercised end-to-end)."""
    return subprocess.run(
        [sys.executable, str(AUDIT_SCRIPT), "--db", db_path, *extra_args],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )


def test_cli_exit_code_zero_on_clean_db(fresh_db):
    result = _run_audit_cli(fresh_db)
    assert result.returncode == 0, result.stderr
    assert "0 orphan rows total" in result.stdout


def test_cli_exit_code_one_on_dirty_db(fresh_db_with_users):
    """Inject an orphan, then expect exit code 1 + non-zero orphan
    counter in the report header."""
    with sqlite3.connect(fresh_db_with_users) as conn:
        conn.execute(
            "INSERT INTO expenses (id, trip_id, who, value) "
            "VALUES ('e-orphan', 'phantom-trip', 'u1', 1.0)"
        )
        conn.commit()
    result = _run_audit_cli(fresh_db_with_users)
    assert result.returncode == 1, (result.stdout, result.stderr)
    assert "1 orphan" in result.stdout


def test_cli_exit_code_two_on_missing_db(tmp_path):
    """A path that doesn't exist must produce exit 2 (script error),
    not 0/1 — the audit must NOT silently report "clean" on a
    missing DB."""
    missing = str(tmp_path / "does-not-exist.db")
    result = _run_audit_cli(missing)
    assert result.returncode == 2
    assert "not found" in result.stderr.lower()


def test_cli_json_output_is_parseable(fresh_db):
    """--json mode must produce valid JSON the tooling layer can
    consume. We don't snapshot the full payload (would lock us into
    the exact schema) but check the toplevel shape + a couple of
    invariants."""
    result = _run_audit_cli(fresh_db, "--json")
    assert result.returncode == 0
    payload = json.loads(result.stdout)
    assert payload["db_path"] == fresh_db
    assert payload["total_orphans"] == 0
    assert isinstance(payload["classes"], list)
    assert len(payload["classes"]) > 20  # 28 today, leave headroom for growth
    # Every class entry should expose the standard fields.
    sample = payload["classes"][0]
    for field in (
        "child_table", "child_column", "parent_table", "parent_column",
        "source", "nullable_ok", "orphan_count", "total_count", "samples",
    ):
        assert field in sample, f"missing field: {field}"
    # The polymorphic skip-list MUST be surfaced so operators know
    # what we didn't check.
    assert isinstance(payload["polymorphic_skipped"], list)
    assert any(
        s["table"] == "notifications" and s["column"] == "related_id"
        for s in payload["polymorphic_skipped"]
    )


def test_cli_samples_limit_is_honoured(fresh_db_with_users):
    """--samples N caps the number of orphan samples returned per FK
    class. Inject 5 orphans, ask for 2, expect at most 2 samples in
    the JSON output."""
    with sqlite3.connect(fresh_db_with_users) as conn:
        for i in range(5):
            conn.execute(
                "INSERT INTO expenses (id, trip_id, who, value) "
                "VALUES (?, ?, ?, ?)",
                (f"e{i}", f"phantom-trip-{i}", "u1", 1.0),
            )
        conn.commit()
    result = _run_audit_cli(fresh_db_with_users, "--json", "--samples", "2")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    expense_class = next(
        c for c in payload["classes"]
        if c["child_table"] == "expenses" and c["child_column"] == "trip_id"
    )
    assert expense_class["orphan_count"] == 5
    # Sample window capped at 2 — the count is still accurate.
    assert len(expense_class["samples"]) == 2


def test_cli_zero_samples_returns_no_sample_rows(fresh_db_with_users):
    """--samples 0 means count only, no samples emitted. Useful for
    fast CI checks where the row IDs aren't needed."""
    with sqlite3.connect(fresh_db_with_users) as conn:
        conn.execute(
            "INSERT INTO expenses (id, trip_id, who, value) "
            "VALUES ('e1', 'ghost-trip', 'u1', 1.0)"
        )
        conn.commit()
    result = _run_audit_cli(fresh_db_with_users, "--json", "--samples", "0")
    assert result.returncode == 1
    payload = json.loads(result.stdout)
    expense_class = next(
        c for c in payload["classes"]
        if c["child_table"] == "expenses" and c["child_column"] == "trip_id"
    )
    assert expense_class["orphan_count"] == 1
    assert expense_class["samples"] == []
