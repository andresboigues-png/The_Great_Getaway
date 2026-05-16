"""catchup — bring Alembic in sync with init_db() current state.

FIXING_ROADMAP §1.5 / §1.6 — until now, init_db() had two jobs:
  1. CREATE TABLE IF NOT EXISTS for the baseline schema (also covered
     by `0c7a67724fda_baseline.py`)
  2. A long chain of `_safe_alter(...)` ADD COLUMN calls that captured
     every schema delta since baseline.

That meant schema changes had no single source of truth: some lived
in Alembic revisions (token_jti, share_token, share_show_plans,
marked_places_json, documents_photos_json), others ONLY in the
`_safe_alter` chain (home_country, language, checklist_json,
actions_hidden, cover_url, public_show_expenses, receipt_url, friends.
created_at). The new tables shipped post-Phase G (feed_posts/likes/
bookmarks/comments, follows, user_achievements, settlements) were
created by init_db with no Alembic equivalent at all. Same for the
§2.1 perf indexes.

This revision catches Alembic up to current state: a fresh
`alembic upgrade head` from an empty DB now produces the same schema
that init_db() produces — meaning Alembic IS the canonical source of
truth, and init_db can shed its ALTER chain.

For DBs that already have these objects (PA prod, any developer DB
where init_db ran the ALTERs historically), the operator should run
`alembic stamp head` once to mark this revision applied without
re-running its DDL. Future schema changes go ONLY through new Alembic
revisions; init_db now just CREATE TABLEs the latest shape for fresh
DBs and asserts the schema is current at boot.

Revision ID: f9a3b7e1c842
Revises: c2e3d4f5a6b7
Create Date: 2026-05-16
"""

from typing import Sequence, Union

from alembic import op


revision: str = 'f9a3b7e1c842'
down_revision: Union[str, Sequence[str], None] = 'c2e3d4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Every DDL below is written defensively (IF NOT EXISTS for tables/indexes,
# wrapped in a duplicate-column swallow for ALTERs) so a partial-state
# DB upgrades cleanly. SQLite's `ALTER TABLE ADD COLUMN` lacks a native
# IF NOT EXISTS clause, hence the explicit try/except in `_add_column`.


def _add_column(table: str, column: str, ddl_type: str) -> None:
    """ADD COLUMN that's idempotent against pre-existing columns. SQLite
    raises OperationalError 'duplicate column name: X' when the column
    is already there — we swallow that single case + re-raise anything
    else (disk full, type mismatch, syntax error)."""
    try:
        op.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}")
    except Exception as exc:  # alembic wraps sqlite3.OperationalError
        msg = str(exc).lower()
        if "duplicate column" not in msg:
            raise


def upgrade() -> None:
    # ── User-level columns added post-baseline ────────────────────────
    # home_country: Profile "Home base" setting (FUTURE_FEATURES #2-ish).
    # language: i18n session 3 — per-user locale preference.
    _add_column("users", "home_country", "TEXT")
    _add_column("users", "language", "TEXT")

    # ── Trip-level optional columns ───────────────────────────────────
    # checklist_json: per-trip packing/errand list (Anchor day surface).
    # actions_hidden: per-trip Actions-feed silence toggle.
    # cover_url: user-picked trip hero photo (FUTURE_FEATURES #2).
    # public_show_expenses: granular public-trip privacy (default off).
    _add_column("trips", "checklist_json", "TEXT")
    _add_column("trips", "actions_hidden", "INTEGER DEFAULT 0")
    _add_column("trips", "cover_url", "TEXT")
    _add_column("trips", "public_show_expenses", "INTEGER DEFAULT 0")

    # ── Expense receipt photo (FUTURE_FEATURES #3) ────────────────────
    _add_column("expenses", "receipt_url", "TEXT")

    # ── Friends.created_at ────────────────────────────────────────────
    # SQLite forbids ALTER ADD with non-constant DEFAULT, so we add
    # NULL-able then backfill. New INSERTs in /api/friends/* stamp
    # created_at explicitly.
    _add_column("friends", "created_at", "DATETIME")
    op.execute(
        "UPDATE friends SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"
    )

    # ── Feed (social) tables ──────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS feed_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            trip_id TEXT NOT NULL,
            repost_of_post_id INTEGER,
            caption TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(trip_id) REFERENCES trips(id)
        )
    """)
    # caption was added after feed_posts launched — guard for prod
    # DBs where the table predates the column.
    _add_column("feed_posts", "caption", "TEXT")
    op.execute("""
        CREATE TABLE IF NOT EXISTS feed_likes (
            user_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, event_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS feed_bookmarks (
            user_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, event_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS feed_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    # ── Follows (one-way social graph, FIXING_ROADMAP §4.7) ──────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id TEXT NOT NULL,
            followee_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(follower_id, followee_id),
            FOREIGN KEY(follower_id) REFERENCES users(id),
            FOREIGN KEY(followee_id) REFERENCES users(id)
        )
    """)

    # ── Achievements (FIXING_ROADMAP §4.4) ───────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            badge_id TEXT NOT NULL,
            earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            context_json TEXT,
            UNIQUE(user_id, badge_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)

    # ── Settlements (FIXING_ROADMAP §4.5) ────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS settlements (
            id TEXT PRIMARY KEY,
            trip_id TEXT NOT NULL,
            from_user_id TEXT NOT NULL,
            to_user_id TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            euro_value REAL,
            method TEXT,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(trip_id) REFERENCES trips(id),
            FOREIGN KEY(from_user_id) REFERENCES users(id),
            FOREIGN KEY(to_user_id) REFERENCES users(id)
        )
    """)

    # ── Indexes (FIXING_ROADMAP §2.1 + new tables above) ─────────────
    # Each is IF NOT EXISTS so reruns are no-ops on prod where
    # init_db already created them.
    indexes = [
        # §4.1 — unique partial index on trips.share_token so two
        # trips can't collide on the same public URL.
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share_token "
        "ON trips(share_token) WHERE share_token IS NOT NULL",
        # §2.1 hot-table indexes
        "CREATE INDEX IF NOT EXISTS idx_feed_likes_event ON feed_likes(event_id)",
        "CREATE INDEX IF NOT EXISTS idx_feed_bookmarks_event ON feed_bookmarks(event_id)",
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_user ON feed_posts(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_trip ON feed_posts(trip_id)",
        "CREATE INDEX IF NOT EXISTS idx_feed_comments_event "
        "ON feed_comments(event_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_friends_user_status ON friends(user_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_notifications_user_created "
        "ON notifications(user_id, created_at)",
        "CREATE INDEX IF NOT EXISTS idx_trip_members_trip_user "
        "ON trip_members(trip_id, user_id)",
        "CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id)",
        "CREATE INDEX IF NOT EXISTS idx_trip_days_trip ON trip_days(trip_id)",
        # §4.5 settlements + §4.4 achievements + §4.7 follows
        "CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id)",
        "CREATE INDEX IF NOT EXISTS idx_user_achievements_user "
        "ON user_achievements(user_id, badge_id)",
        "CREATE INDEX IF NOT EXISTS idx_follows_followee "
        "ON follows(followee_id)",
        "CREATE INDEX IF NOT EXISTS idx_follows_follower "
        "ON follows(follower_id)",
    ]
    for ddl in indexes:
        op.execute(ddl)


def downgrade() -> None:
    """Reverse the catchup. Dropping tables is straightforward; dropping
    individual columns in SQLite would require batch-mode table-rebuild
    (since SQLite < 3.35 doesn't support DROP COLUMN directly) and is
    skipped — downgrade is rarely run in practice, and column-removal
    via Alembic is a future concern."""
    # Drop indexes first (they reference the tables / columns below).
    for ix in (
        "idx_trips_share_token",
        "idx_feed_likes_event",
        "idx_feed_bookmarks_event",
        "idx_feed_posts_user",
        "idx_feed_posts_trip",
        "idx_feed_comments_event",
        "idx_friends_user_status",
        "idx_notifications_user_created",
        "idx_trip_members_trip_user",
        "idx_expenses_trip",
        "idx_trip_days_trip",
        "idx_settlements_trip",
        "idx_user_achievements_user",
        "idx_follows_followee",
        "idx_follows_follower",
    ):
        op.execute(f"DROP INDEX IF EXISTS {ix}")

    # Drop the post-baseline tables.
    for tbl in (
        "settlements",
        "user_achievements",
        "follows",
        "feed_comments",
        "feed_bookmarks",
        "feed_likes",
        "feed_posts",
    ):
        op.execute(f"DROP TABLE IF EXISTS {tbl}")

    # NB: column drops (users.home_country / language, trips.*,
    # expenses.receipt_url, friends.created_at) are intentionally
    # not reversed — see docstring.
