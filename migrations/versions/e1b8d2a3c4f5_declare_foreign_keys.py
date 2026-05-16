"""declare foreign keys with ON DELETE behaviour (FIXING_ROADMAP §1.4 Phase 4).

The migration that gives the database actual referential integrity.
Before this, FK clauses were declared in CREATE TABLE statements but
PRAGMA foreign_keys=OFF (the SQLite default) meant they were
advisory — `INSERT INTO expenses VALUES('e1', 'trip-does-not-exist',
…)` succeeded silently. After this migration ships AND get_db() flips
`foreign_keys=ON` (separate change in src/database.py), the DB
physically refuses to write rows that reference non-existent parents.

## What this migration does

For every table that has (or should have) a foreign-key relationship,
rebuild the table with explicit `FOREIGN KEY … REFERENCES …
ON DELETE …` clauses. SQLite cannot `ALTER TABLE ADD CONSTRAINT
FOREIGN KEY` on an existing column — the only supported way to add
or change an FK is the "rebuild" pattern: rename the old table,
create a new one with the desired shape, copy the data, drop the
old. Foreign-key enforcement is OFF during the migration (the
PRAGMA flip lands in src/database.py in the same release), so
cascade behaviour doesn't fire mid-copy.

The audit pass (Phase 1, scripts/fk_audit.py) ran against the live
PA DB on 2026-05-16 and found ZERO orphan rows across all 28
relationships. That's why this migration can ship without a
preceding `fk_repair.py` step — there's nothing to clean up. The
audit is also the regression net: a fresh init_db() must continue
producing 0 orphans, and tests/test_fk_audit.py asserts exactly
that.

## ON DELETE choices

CASCADE — applied to "owned" relationships where the child row is
meaningless without the parent. Deleting the parent should
automatically GC the children, matching the manual cleanup the
route handlers already perform (delete_trip explicitly DELETEs
expenses + trip_members before DELETEing the trip; same shape
becomes the DB-level guarantee).

  trips.user_id            → users(id)   ON DELETE CASCADE
  expenses.trip_id         → trips(id)   ON DELETE CASCADE
  trip_days.trip_id        → trips(id)   ON DELETE CASCADE
  trip_members.trip_id     → trips(id)   ON DELETE CASCADE
  trip_members.user_id     → users(id)   ON DELETE CASCADE
  trip_collaborators.*     → … CASCADE   (legacy table, paired w/ trip_members)
  friends.user_id          → users(id)   ON DELETE CASCADE
  friends.friend_id        → users(id)   ON DELETE CASCADE
  companions.user_id       → users(id)   ON DELETE CASCADE
  categories.user_id       → users(id)   ON DELETE CASCADE
  budgets.user_id          → users(id)   ON DELETE CASCADE
  notifications.user_id    → users(id)   ON DELETE CASCADE
  feed_posts.user_id       → users(id)   ON DELETE CASCADE
  feed_posts.trip_id       → trips(id)   ON DELETE CASCADE
  feed_likes.user_id       → users(id)   ON DELETE CASCADE
  feed_bookmarks.user_id   → users(id)   ON DELETE CASCADE
  feed_comments.user_id    → users(id)   ON DELETE CASCADE
  follows.follower_id      → users(id)   ON DELETE CASCADE
  follows.followee_id      → users(id)   ON DELETE CASCADE
  user_achievements.user_id → users(id)  ON DELETE CASCADE
  settlements.trip_id      → trips(id)   ON DELETE CASCADE
  settlements.from_user_id → users(id)   ON DELETE CASCADE
  settlements.to_user_id   → users(id)   ON DELETE CASCADE

SET NULL — applied to optional/breakable references where the
child row should survive the parent's deletion with a NULL
"forgotten" reference. All four target columns are already
nullable in the current schema, so the SET NULL semantics fit
without further constraint changes.

  budgets.trip_id                → trips(id)      ON DELETE SET NULL
      Budgets can be global (trip_id NULL); a trip deletion
      naturally degrades a trip-scoped budget to a global one.
  trip_members.invited_by        → users(id)      ON DELETE SET NULL
      A member's membership should survive their inviter's account
      deletion. They were invited, they accepted; the inviter
      vanishing later doesn't undo the membership.
  companions.linked_user_id      → users(id)      ON DELETE SET NULL
      The companion row (a friend you tagged on past trips) survives
      even if the friend deletes their account; just the linked
      account reference is forgotten.
  feed_posts.repost_of_post_id   → feed_posts(id) ON DELETE SET NULL
      A repost survives even if the original post is deleted. The
      repost loses its "originally from" reference but the repost
      caption + audience stay intact.

Settlements: defaulted to CASCADE for the user FKs (matches the
expense / data ownership pattern — account deletion scrubs the
user's settlement participation). If the product later treats
settlements as audit-trail records that must outlive account
deletion, swap these specific FKs to SET NULL in a follow-up
migration. The choice is logged here because there is currently
no user-deletion endpoint; this is forward-looking policy.

## Indexes

Dropping a table drops its indexes. Each rebuild step re-creates
the indexes that lived on that table (idx_trips_share_token,
idx_friends_user_status, etc.), preserving the §2.1 index work
that landed in earlier migrations. All CREATE INDEX statements
use IF NOT EXISTS so re-running the migration is safe.

## Tables not touched

  users — no FKs to add (parent of everything).
  alembic_version — Alembic's own bookkeeping; do not touch.

## Rebuild pattern

`_rebuild` is the workhorse. For each table:
  1. ALTER TABLE <t> RENAME TO _old_<t>   — preserve the data
  2. CREATE TABLE <t> (new schema)         — with the new FK clauses
  3. INSERT INTO <t> (cols) SELECT cols FROM _old_<t>
                                           — copy every row
  4. DROP TABLE _old_<t>                   — release the renamed copy
  5. CREATE INDEX … on <t>                 — restore indexes

Foreign-key enforcement is OFF during the migration (default
PRAGMA state). Once the matching code change in src/database.py
flips foreign_keys=ON in get_db(), the FK constraints become
live. Until then they're declared-but-not-enforced — same posture
as before this migration, just with explicit ON DELETE behaviour
declared for when enforcement turns on.

## Downgrade

Not supported. The downgrade() raises — rolling back an integrity
upgrade by stripping the constraints would silently re-open the
gate to orphan rows, which is exactly the bug we just closed.
Roll forward, not back. If a regression DOES require reverting,
the explicit path is: write a new forward-migration that recreates
the tables WITHOUT FK clauses, after auditing whether any orphan
inserts have shipped.

Revision ID: e1b8d2a3c4f5
Revises: f9a3b7e1c842
Create Date: 2026-05-16
"""

from typing import Sequence, Union

from alembic import op


revision: str = 'e1b8d2a3c4f5'
down_revision: Union[str, Sequence[str], None] = 'f9a3b7e1c842'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _rebuild(name: str, new_create_sql: str, copy_columns: list[str]) -> None:
    """Replace `name` with the new schema while preserving its data.

    SQLite's ALTER TABLE doesn't support adding FK constraints to
    existing columns; the supported workaround is to recreate the
    table. Foreign-key checks are off during the migration (default
    PRAGMA state), so cascades don't fire mid-copy and we don't have
    to defer them.

    The copy step lists columns explicitly so a schema with extra
    columns in the old table (drift from manual ALTER) doesn't break
    the migration — only the named columns get copied. If the new
    schema adds a column that didn't exist before, that column gets
    its DEFAULT value (or NULL) on every row, matching what an
    `ALTER TABLE … ADD COLUMN` would have produced.
    """
    op.execute(f'ALTER TABLE {name} RENAME TO _old_{name}')
    op.execute(new_create_sql)
    cols = ", ".join(copy_columns)
    op.execute(f'INSERT INTO {name} ({cols}) SELECT {cols} FROM _old_{name}')
    op.execute(f'DROP TABLE _old_{name}')


def upgrade() -> None:
    # ── trips ────────────────────────────────────────────────────────
    # FK: user_id → users(id) ON DELETE CASCADE
    # Keeps every share-related column + all the post-baseline JSON
    # columns. The partial UNIQUE on share_token gets re-created at
    # the bottom of this rebuild block (DROP TABLE drops its indexes).
    _rebuild(
        "trips",
        """
        CREATE TABLE trips (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT,
            country TEXT,
            country_code TEXT,
            is_archived INTEGER DEFAULT 0,
            is_public INTEGER DEFAULT 0,
            public_show_expenses INTEGER DEFAULT 0,
            place_id TEXT,
            lat REAL,
            lng REAL,
            viewport_json TEXT,
            place_types TEXT,
            companions_json TEXT,
            marked_places_json TEXT,
            documents_json TEXT,
            photos_json TEXT,
            checklist_json TEXT,
            cover_url TEXT,
            actions_hidden INTEGER DEFAULT 0,
            share_token TEXT,
            share_views INTEGER DEFAULT 0,
            share_show_cost INTEGER DEFAULT 0,
            share_show_plans INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        [
            "id", "user_id", "name", "country", "country_code",
            "is_archived", "is_public", "public_show_expenses",
            "place_id", "lat", "lng", "viewport_json", "place_types",
            "companions_json", "marked_places_json", "documents_json",
            "photos_json", "checklist_json", "cover_url",
            "actions_hidden", "share_token", "share_views",
            "share_show_cost", "share_show_plans", "created_at",
        ],
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share_token "
        "ON trips(share_token) WHERE share_token IS NOT NULL"
    )

    # ── expenses ─────────────────────────────────────────────────────
    # FK: trip_id → trips(id) ON DELETE CASCADE
    # category_id stays declared but unconstrained — categories has a
    # composite primary key (id, user_id) so a single-column FK from
    # expenses won't match. Treated as a deferred follow-up.
    _rebuild(
        "expenses",
        """
        CREATE TABLE expenses (
            id TEXT PRIMARY KEY,
            trip_id TEXT,
            who TEXT,
            category_id TEXT,
            label TEXT,
            date TEXT,
            country TEXT,
            value REAL,
            currency TEXT,
            euro_value REAL,
            receipt_url TEXT,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
        )
        """,
        [
            "id", "trip_id", "who", "category_id", "label", "date",
            "country", "value", "currency", "euro_value", "receipt_url",
        ],
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id)")

    # ── friends ──────────────────────────────────────────────────────
    # Both FKs cascade: deleting a user removes their friendships.
    # Symmetric, idempotent (no orphan side after cleanup).
    _rebuild(
        "friends",
        """
        CREATE TABLE friends (
            user_id TEXT,
            friend_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME,
            PRIMARY KEY(user_id, friend_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        ["user_id", "friend_id", "status", "created_at"],
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_friends_user_status "
        "ON friends(user_id, status)"
    )

    # ── trip_collaborators ───────────────────────────────────────────
    # Legacy table, mostly empty in prod. Kept with FKs for consistency.
    _rebuild(
        "trip_collaborators",
        """
        CREATE TABLE trip_collaborators (
            trip_id TEXT,
            user_id TEXT,
            PRIMARY KEY(trip_id, user_id),
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        ["trip_id", "user_id"],
    )

    # ── trip_members ─────────────────────────────────────────────────
    # invited_by becomes a real (nullable) FK with SET NULL on parent
    # deletion. NULL is valid (owner self-membership rows have no
    # inviter); a dangling value would become NULL automatically when
    # FK enforcement turns on, matching the implicit-FK semantics the
    # audit already enforces.
    _rebuild(
        "trip_members",
        """
        CREATE TABLE trip_members (
            trip_id TEXT,
            user_id TEXT,
            role TEXT DEFAULT 'planner',
            is_archived INTEGER DEFAULT 0,
            invitation_status TEXT DEFAULT 'accepted',
            invited_by TEXT,
            PRIMARY KEY(trip_id, user_id),
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE SET NULL
        )
        """,
        [
            "trip_id", "user_id", "role", "is_archived",
            "invitation_status", "invited_by",
        ],
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_trip_members_trip_user "
        "ON trip_members(trip_id, user_id)"
    )

    # ── companions ───────────────────────────────────────────────────
    # linked_user_id (the friend-account this companion points at) is
    # nullable and gets SET NULL on linked-account deletion — the
    # companion as a per-user-named placeholder survives.
    _rebuild(
        "companions",
        """
        CREATE TABLE companions (
            user_id TEXT,
            name TEXT,
            linked_user_id TEXT,
            link_status TEXT,
            PRIMARY KEY(user_id, name),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(linked_user_id) REFERENCES users(id) ON DELETE SET NULL
        )
        """,
        ["user_id", "name", "linked_user_id", "link_status"],
    )

    # ── categories ───────────────────────────────────────────────────
    # User-scoped custom categories.
    _rebuild(
        "categories",
        """
        CREATE TABLE categories (
            id TEXT,
            user_id TEXT,
            name TEXT,
            icon TEXT,
            color TEXT,
            PRIMARY KEY(id, user_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        ["id", "user_id", "name", "icon", "color"],
    )

    # ── budgets ──────────────────────────────────────────────────────
    # trip_id becomes a real (nullable) FK: SET NULL so a trip
    # deletion gracefully degrades a trip-scoped budget to a global
    # one rather than wiping it.
    _rebuild(
        "budgets",
        """
        CREATE TABLE budgets (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            trip_id TEXT,
            label TEXT,
            amount REAL,
            currency TEXT DEFAULT 'EUR',
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL
        )
        """,
        ["id", "user_id", "trip_id", "label", "amount", "currency"],
    )

    # ── notifications ────────────────────────────────────────────────
    # related_id stays unconstrained — it's polymorphic (trip / user /
    # feed event id depending on `type`). Application-layer integrity.
    _rebuild(
        "notifications",
        """
        CREATE TABLE notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            type TEXT,
            title TEXT,
            related_id TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        [
            "id", "user_id", "type", "title", "related_id", "message",
            "is_read", "created_at",
        ],
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_user_created "
        "ON notifications(user_id, created_at)"
    )

    # ── feed_posts ───────────────────────────────────────────────────
    # repost_of_post_id becomes a real self-referential FK with SET
    # NULL — a repost survives original-post deletion, just loses its
    # "originally from" reference.
    _rebuild(
        "feed_posts",
        """
        CREATE TABLE feed_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            trip_id TEXT NOT NULL,
            repost_of_post_id INTEGER,
            caption TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
            FOREIGN KEY(repost_of_post_id) REFERENCES feed_posts(id) ON DELETE SET NULL
        )
        """,
        [
            "id", "user_id", "trip_id", "repost_of_post_id", "caption",
            "created_at",
        ],
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_feed_posts_user ON feed_posts(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_feed_posts_trip ON feed_posts(trip_id)")

    # ── feed_likes ───────────────────────────────────────────────────
    # event_id stays polymorphic; no FK there.
    _rebuild(
        "feed_likes",
        """
        CREATE TABLE feed_likes (
            user_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, event_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        ["user_id", "event_id", "created_at"],
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_feed_likes_event ON feed_likes(event_id)")

    # ── feed_bookmarks ───────────────────────────────────────────────
    _rebuild(
        "feed_bookmarks",
        """
        CREATE TABLE feed_bookmarks (
            user_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, event_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        ["user_id", "event_id", "created_at"],
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_bookmarks_event "
        "ON feed_bookmarks(event_id)"
    )

    # ── feed_comments ────────────────────────────────────────────────
    _rebuild(
        "feed_comments",
        """
        CREATE TABLE feed_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        ["id", "event_id", "user_id", "body", "created_at"],
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_comments_event "
        "ON feed_comments(event_id, created_at)"
    )

    # ── trip_days ────────────────────────────────────────────────────
    _rebuild(
        "trip_days",
        """
        CREATE TABLE trip_days (
            id TEXT PRIMARY KEY,
            trip_id TEXT,
            day_number INTEGER,
            date TEXT,
            name TEXT,
            morning TEXT,
            afternoon TEXT,
            evening TEXT,
            notes TEXT,
            photos TEXT,
            documents TEXT,
            tip TEXT,
            lat REAL,
            lng REAL,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
        )
        """,
        [
            "id", "trip_id", "day_number", "date", "name",
            "morning", "afternoon", "evening", "notes", "photos",
            "documents", "tip", "lat", "lng",
        ],
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_trip_days_trip ON trip_days(trip_id)")

    # ── follows ──────────────────────────────────────────────────────
    _rebuild(
        "follows",
        """
        CREATE TABLE follows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            follower_id TEXT NOT NULL,
            followee_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(follower_id, followee_id),
            FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        ["id", "follower_id", "followee_id", "created_at"],
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)")

    # ── user_achievements ────────────────────────────────────────────
    _rebuild(
        "user_achievements",
        """
        CREATE TABLE user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            badge_id TEXT NOT NULL,
            earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            context_json TEXT,
            UNIQUE(user_id, badge_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        ["id", "user_id", "badge_id", "earned_at", "context_json"],
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_achievements_user "
        "ON user_achievements(user_id, badge_id)"
    )

    # ── settlements ──────────────────────────────────────────────────
    # All three FKs cascade. Forward-looking policy note in the
    # module docstring above re: switching from_user_id / to_user_id
    # to SET NULL if settlements should outlive account deletions.
    _rebuild(
        "settlements",
        """
        CREATE TABLE settlements (
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
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
            FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """,
        [
            "id", "trip_id", "from_user_id", "to_user_id",
            "amount", "currency", "euro_value", "method", "note",
            "created_at",
        ],
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_settlements_trip "
        "ON settlements(trip_id)"
    )


def downgrade() -> None:
    """Not supported by design.

    Reverting this migration would strip every FK constraint and
    re-open the gate to orphan rows — the exact bug we just closed.
    If a regression DOES require reverting, write a NEW forward
    migration that recreates the tables without FK clauses, after
    explicitly auditing whether any orphan inserts have shipped on
    top of FK enforcement (they shouldn't have, by definition, but
    paranoia is cheap).
    """
    raise NotImplementedError(
        "FIXING_ROADMAP §1.4 Phase 4 declares foreign keys; downgrade "
        "would re-open the orphan-row gate. Roll forward, not back. "
        "If reverting is genuinely necessary, write a new forward "
        "migration with explicit reasoning."
    )
