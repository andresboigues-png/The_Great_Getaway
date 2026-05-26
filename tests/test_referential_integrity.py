"""Tests that prove FK enforcement + ON DELETE behaviour are live.

FIXING_ROADMAP §1.4 Phase 5. This file is the regression net: if a
future commit silently turns FK enforcement off (drops the
`PRAGMA foreign_keys=ON` from get_db, removes a FOREIGN KEY clause
in init_db, ships a migration that rebuilds a table without the
constraint, etc.) these tests turn red.

They cover three layers:

  1. The PRAGMA layer — every connection from get_db() has
     `foreign_keys=ON` set. This is the actual mechanism that makes
     constraints enforced; without it the clauses below are
     advisory and the tests would pass even with no integrity.

  2. The constraint layer — INSERTing a child row with a dangling
     parent reference raises sqlite3.IntegrityError. Covers a
     representative member of each FK family (trip-scoped, user-
     scoped, settlements).

  3. The ON DELETE layer — deleting the parent triggers the
     declared CASCADE / SET NULL behaviour. Covers the four
     SET NULL relationships explicitly (budgets.trip_id,
     companions.linked_user_id, trip_members.invited_by,
     feed_posts.repost_of_post_id) because they're the unusual
     case; CASCADE is the default we apply to most FKs and a
     handful of spot-checks proves the migration wired them too.

The tests use direct sqlite3 inserts (rather than going through
API routes) so the assertions are about the DATA LAYER specifically,
not the route logic. If a route changes its INSERT to add a defensive
check before the FK fires, the route tests cover that — but the
data layer must still refuse to accept the row if the route somehow
slipped past its own check.
"""

from __future__ import annotations

import sqlite3

import pytest


# ── Helpers ───────────────────────────────────────────────────────────


@pytest.fixture
def db(temp_db, seed_user, seed_other_user):
    """Yield a sqlite3 connection plus the two seeded user ids.

    Reuses the existing conftest fixtures so this file inherits the
    schema-init + user-seeding machinery without duplication.

    2026-05-26: `get_db()` is now a contextmanager (FD-leak fix), so
    the fixture has to enter the context to extract the connection
    and ensure it's closed at test teardown.
    """
    from database import get_db
    with get_db() as conn:
        yield conn, seed_user, seed_other_user


# ── (1) PRAGMA layer ──────────────────────────────────────────────────


def test_get_db_has_foreign_keys_pragma_on(temp_db):
    """Every connection from get_db() must report foreign_keys=1.

    This is the SINGLE pragma flip that makes everything else in this
    module meaningful. Without it, every other test in this file
    would still pass — the constraints would be advisory and the
    cascade-on-delete behaviour wouldn't fire — so the green test
    suite would silently lie. Pinning the pragma value here catches
    any regression that removes the pragma call from get_db.
    """
    from database import init_db, get_db
    init_db()
    with get_db() as conn:
        result = conn.execute("PRAGMA foreign_keys").fetchone()
        assert result[0] == 1, (
            f"foreign_keys=OFF on a fresh get_db() connection — "
            f"FK enforcement is silently dead. Got: {result[0]}"
        )


# ── (2) Constraint layer — INSERTs that should fail ───────────────────


def test_inserting_expense_with_dangling_trip_id_raises(db):
    """expenses.trip_id → trips(id): dangling trip_id is rejected."""
    conn, _, _ = db
    with conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO expenses (id, trip_id, who, value, currency, "
                "euro_value) VALUES (?, ?, ?, ?, ?, ?)",
                ("e1", "trip-does-not-exist", "u1", 9.99, "EUR", 9.99),
            )


def test_inserting_trip_with_dangling_user_id_raises(db):
    """trips.user_id → users(id): dangling user_id is rejected."""
    conn, _, _ = db
    with conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
                ("t1", "user-ghost", "Ghost trip"),
            )


def test_inserting_trip_member_with_dangling_trip_id_raises(db):
    """trip_members.trip_id → trips(id) — even composite-PK tables
    enforce their FKs."""
    conn, _, u1, _ = (db[0], db[0], db[1], db[2])
    with conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO trip_members (trip_id, user_id, role) "
                "VALUES (?, ?, ?)",
                ("trip-phantom", u1, "planner"),
            )


def test_inserting_settlement_with_dangling_from_user_id_raises(db):
    """settlements.from_user_id → users(id). Pre-§1.4 a dangling
    from_user_id slipped silently in; that's the bug §1.4 closed."""
    conn, u1, _ = db
    # First seed a real trip so trip_id passes — we want the failure
    # to be specifically on from_user_id, not on trip_id.
    with conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("trip-for-settle", u1, "Lisbon"),
        )
    with conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO settlements (id, trip_id, from_user_id, "
                "to_user_id, amount, currency) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                ("s1", "trip-for-settle", "user-ghost", u1, 50.0, "EUR"),
            )


def test_inserting_follow_with_dangling_followee_id_raises(db):
    """follows.followee_id → users(id). Common pattern: bulk-import
    follows from external data must validate every id first."""
    conn, u1, _ = db
    with conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO follows (follower_id, followee_id) "
                "VALUES (?, ?)",
                (u1, "user-imaginary"),
            )


def test_inserting_user_achievement_with_dangling_user_id_raises(db):
    """user_achievements.user_id → users(id)."""
    conn, _, _ = db
    with conn:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO user_achievements (user_id, badge_id) "
                "VALUES (?, ?)",
                ("user-ghost", "globe-trotter-5"),
            )


# ── (3) ON DELETE behaviour — CASCADE ─────────────────────────────────


def test_delete_trip_cascades_to_expenses(db):
    """Deleting a trip must auto-delete its expenses via CASCADE.

    Before §1.4 the delete_trip route DELETEd expenses manually
    before deleting the trip — that's still safe (becomes a no-op
    second pass). The cascade is the safety net for any future
    code path that misses the manual cleanup.
    """
    conn, u1, _ = db
    with conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("t1", u1, "Lisbon"),
        )
        conn.execute(
            "INSERT INTO expenses (id, trip_id, who, value, currency) "
            "VALUES (?, ?, ?, ?, ?)",
            ("e1", "t1", u1, 25.0, "EUR"),
        )
    # Sanity: the row exists.
    assert conn.execute("SELECT 1 FROM expenses WHERE id='e1'").fetchone()

    with conn:
        conn.execute("DELETE FROM trips WHERE id='t1'")

    # CASCADE: the expense is gone too.
    assert not conn.execute("SELECT 1 FROM expenses WHERE id='e1'").fetchone()


def test_delete_trip_cascades_to_trip_days(db):
    """trip_days.trip_id → trips(id) ON DELETE CASCADE. Pre-§1.4 the
    delete_trip route did NOT manually delete trip_days — they would
    have been left as orphans. Now CASCADE handles it."""
    conn, u1, _ = db
    with conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("t1", u1, "Lisbon"),
        )
        conn.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, date, name) "
            "VALUES (?, ?, ?, ?, ?)",
            ("d1", "t1", 1, "2026-06-01", "Arrival"),
        )

    with conn:
        conn.execute("DELETE FROM trips WHERE id='t1'")

    assert not conn.execute("SELECT 1 FROM trip_days WHERE id='d1'").fetchone()


def test_delete_user_cascades_to_their_trips_and_dependents(db):
    """The full user-deletion cascade chain: deleting a user removes
    their trips, which cascades to expenses + trip_days + trip_members
    + settlements that referenced them. The /api/user-data route does
    explicit cleanup for the bulk of it, but the cascade is now the
    safety net so a missed table can't leak orphans."""
    conn, u1, u2 = db
    with conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("t1", u1, "u1's trip"),
        )
        conn.execute(
            "INSERT INTO trip_days (id, trip_id, day_number) "
            "VALUES (?, ?, ?)",
            ("d1", "t1", 1),
        )
        conn.execute(
            "INSERT INTO expenses (id, trip_id, who, value, currency) "
            "VALUES (?, ?, ?, ?, ?)",
            ("e1", "t1", u1, 5.0, "EUR"),
        )
        conn.execute(
            "INSERT INTO trip_members (trip_id, user_id, role) "
            "VALUES (?, ?, ?)",
            ("t1", u1, "planner"),
        )

    with conn:
        conn.execute("DELETE FROM users WHERE id=?", (u1,))

    # u1 + every dependent row is gone.
    assert not conn.execute("SELECT 1 FROM trips WHERE id='t1'").fetchone()
    assert not conn.execute("SELECT 1 FROM trip_days WHERE id='d1'").fetchone()
    assert not conn.execute("SELECT 1 FROM expenses WHERE id='e1'").fetchone()
    assert not conn.execute(
        "SELECT 1 FROM trip_members WHERE trip_id='t1'"
    ).fetchone()
    # u2 still exists (unaffected by u1's deletion).
    assert conn.execute("SELECT 1 FROM users WHERE id=?", (u2,)).fetchone()


# ── (3) ON DELETE behaviour — SET NULL ────────────────────────────────


def test_delete_trip_sets_budget_trip_id_to_null(db):
    """budgets.trip_id → trips(id) ON DELETE SET NULL. A trip-scoped
    budget gracefully becomes a global budget when its trip is
    deleted, rather than vanishing or blocking the trip delete."""
    conn, u1, _ = db
    with conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("t1", u1, "Lisbon"),
        )
        conn.execute(
            "INSERT INTO budgets (id, user_id, trip_id, label, amount) "
            "VALUES (?, ?, ?, ?, ?)",
            ("b1", u1, "t1", "Trip budget", 500.0),
        )

    with conn:
        conn.execute("DELETE FROM trips WHERE id='t1'")

    row = conn.execute(
        "SELECT trip_id, amount, label FROM budgets WHERE id='b1'"
    ).fetchone()
    assert row is not None, "budget vanished — expected SET NULL"
    assert row[0] is None, f"budget.trip_id should be NULL, got {row[0]!r}"
    # Other fields preserved.
    assert row[1] == 500.0
    assert row[2] == "Trip budget"


def test_delete_user_sets_companion_linked_user_id_to_null(db):
    """companions.linked_user_id → users(id) ON DELETE SET NULL. The
    companion row (a friend you tagged on past trips) survives even
    if the friend deletes their account; just the account-link
    reference is forgotten."""
    conn, u1, u2 = db
    with conn:
        conn.execute(
            "INSERT INTO companions (user_id, name, linked_user_id, "
            "link_status) VALUES (?, ?, ?, ?)",
            (u1, "Bob", u2, "accepted"),
        )

    with conn:
        conn.execute("DELETE FROM users WHERE id=?", (u2,))

    row = conn.execute(
        "SELECT linked_user_id, name FROM companions "
        "WHERE user_id=? AND name='Bob'", (u1,),
    ).fetchone()
    assert row is not None, "companion vanished — expected SET NULL"
    assert row[0] is None, f"linked_user_id should be NULL, got {row[0]!r}"
    assert row[1] == "Bob"


def test_delete_user_sets_trip_member_invited_by_to_null(db):
    """trip_members.invited_by → users(id) ON DELETE SET NULL. The
    membership survives the inviter's account deletion — the member
    was invited, they accepted; the inviter vanishing later doesn't
    undo the membership."""
    conn, u1, u2 = db
    # u1 is a 3rd-party inviter; u2 is the trip owner; we need a
    # separate user that joins as the invitee. seed_user / seed_other
    # only give us two — sufficient if we reframe: u2 is invited TO
    # u1's trip BY u1 (self-invite is silly but exercises the SET
    # NULL path; u1 is the inviter being deleted).
    with conn:
        # u2's trip; u1 invites u2 — wait, u2 is the OWNER of u2's
        # trip; we need u1 invited TO u2's trip BY u2.
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("t1", u2, "u2's trip"),
        )
        # u1 joins u2's trip; u2 invited them.
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, invitation_status, invited_by) "
            "VALUES (?, ?, ?, ?, ?)",
            ("t1", u1, "relaxer", "accepted", u2),
        )

    with conn:
        # Delete the inviter (u2). Expect: u2's TRIP gets cascade-
        # deleted (trips.user_id CASCADE), which would cascade to
        # trip_members for that trip. So we need a different setup
        # to exercise SET NULL on invited_by. Restart: u2 owns the
        # trip AND invites u1; we delete a THIRD party that was
        # invited_by but isn't otherwise involved — not possible
        # with two seeded users.
        pass  # see structured retry below

    # ── Restart with a hand-rolled u3 so we can isolate the SET NULL
    # path without colliding with the trips.user_id CASCADE.
    with conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            ("u3-inviter", "u3@example.com", "Inviter"),
        )
        # u3 invited u1 to u2's trip. The membership row references
        # u3 only via invited_by — u3 isn't a member or owner.
        conn.execute(
            "UPDATE trip_members SET invited_by = ? "
            "WHERE trip_id = 't1' AND user_id = ?",
            ("u3-inviter", u1),
        )

    # Sanity: invited_by is currently set.
    assert conn.execute(
        "SELECT invited_by FROM trip_members WHERE trip_id='t1' AND user_id=?",
        (u1,),
    ).fetchone()[0] == "u3-inviter"

    with conn:
        conn.execute("DELETE FROM users WHERE id='u3-inviter'")

    # Membership row preserved; invited_by reference NULLed.
    row = conn.execute(
        "SELECT invited_by, role FROM trip_members "
        "WHERE trip_id='t1' AND user_id=?", (u1,),
    ).fetchone()
    assert row is not None, "membership vanished — expected SET NULL"
    assert row[0] is None, f"invited_by should be NULL, got {row[0]!r}"
    assert row[1] == "relaxer"


def test_delete_post_cascades_to_reposts(db):
    """feed_posts.repost_of_post_id → feed_posts(id) ON DELETE
    CASCADE. 2026-05-18 audit M3: pre-fix the FK was SET NULL, which
    left orphan reposts in the table with `repost_of_post_id = NULL`
    — and since the feed query for ORIGINAL shares filters on
    `WHERE repost_of_post_id IS NULL`, those orphans masqueraded as
    new originals (with the repost's caption, pointing at the same
    trip). CASCADE makes the repost share the original's lifecycle —
    when the original is deleted, the reposts go with it. Matches
    Twitter / Bluesky / Mastodon semantics.

    Migration f3c4d5e6a7b8 applies the same FK change to prod DBs."""
    conn, u1, _ = db
    with conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
            ("t1", u1, "Lisbon"),
        )
        # Original post.
        c = conn.execute(
            "INSERT INTO feed_posts (user_id, trip_id, caption) "
            "VALUES (?, ?, ?)",
            (u1, "t1", "original"),
        )
        original_id = c.lastrowid
        # Repost referencing the original.
        c = conn.execute(
            "INSERT INTO feed_posts (user_id, trip_id, "
            "repost_of_post_id, caption) VALUES (?, ?, ?, ?)",
            (u1, "t1", original_id, "reposted"),
        )
        repost_id = c.lastrowid

    with conn:
        conn.execute("DELETE FROM feed_posts WHERE id=?", (original_id,))

    row = conn.execute(
        "SELECT repost_of_post_id, caption FROM feed_posts WHERE id=?",
        (repost_id,),
    ).fetchone()
    assert row is None, \
        "repost should cascade-delete with the original; got a survivor row"


# ── (4) Reflexive check: audit still finds zero orphans ───────────────


def test_audit_returns_zero_orphans_after_init_db_with_fks_on(temp_db):
    """With FK enforcement live + the new ON DELETE clauses in init_db,
    a fresh DB still produces a clean audit. This is the bridge between
    the FK regression suite here and the audit-suite in
    test_fk_audit.py — both have to keep agreeing as the schema
    evolves."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
    from database import init_db
    import fk_audit

    init_db()
    classes = fk_audit.audit(temp_db, samples=0)
    total = sum(c.orphan_count for c in classes)
    assert total == 0
