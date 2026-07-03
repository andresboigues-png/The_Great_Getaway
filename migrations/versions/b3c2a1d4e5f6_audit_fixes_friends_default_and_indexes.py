"""audit fixes — restore friends.created_at default + add missing indexes

Revision ID: b3c2a1d4e5f6
Revises: a2c5e8d1f7b3
Create Date: 2026-05-18 00:00:00.000000

Three audit findings from the 2026-05-18 full-stack sweep:

1. `friends.created_at` lost its `DEFAULT CURRENT_TIMESTAMP` when
   migration `e1b8d2a3c4f5_declare_foreign_keys.py` rebuilt the
   table to attach FOREIGN KEY clauses. `init_db()` still declares
   the default, but `CREATE TABLE IF NOT EXISTS` no-ops on the prod
   DB. Any new `INSERT INTO friends (...)` without an explicit
   `created_at` would write NULL — friend-graph timestamps silently
   broken.

   Verified live on PA with `PRAGMA table_info(friends)`:
       2 | created_at | DATETIME | 0 | None | 0
                                              ^ dflt_value: None

2. Missing index on `feed_comments.user_id`. The FK exists (added
   in `e1b8d2a3c4f5`) but the only index covers
   `(event_id, created_at)`. `DELETE FROM users WHERE id = ?`
   triggers a full table scan on feed_comments per delete (the
   `ON DELETE CASCADE` planner has no usable index to find rows).
   Same problem for `feed_posts.repost_of_post_id` (self-FK for
   repost chains).

3. Backfill: any existing `friends` row with `created_at IS NULL`
   gets stamped with `CURRENT_TIMESTAMP`. Cheap one-shot fixup
   so the historical roster reads correctly in the new-friendship
   feed builder's 30-day window check.
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'b3c2a1d4e5f6'
down_revision = 'a2c5e8d1f7b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── (3) Backfill any pre-existing NULL friends.created_at so the
    # 30-day window check in the new-friendship feed builder doesn't
    # silently drop legacy rows. Cheap one-shot UPDATE.
    op.execute(
        "UPDATE friends SET created_at = CURRENT_TIMESTAMP "
        "WHERE created_at IS NULL"
    )

    # ── (1) Restore the DEFAULT CURRENT_TIMESTAMP on friends.created_at.
    # SQLite doesn't support ALTER COLUMN, so the only path is a table
    # rebuild: rename old, create new with the default, copy data,
    # drop old. We replicate the exact column set + composite PK +
    # FKs from `e1b8d2a3c4f5_declare_foreign_keys.py` (which itself
    # had built the table with `created_at DATETIME` and no default —
    # the bug we're fixing).
    #
    # Schema reference (current live shape, captured 2026-05-18 via
    # PRAGMA table_info(friends)):
    #   user_id    TEXT
    #   friend_id  TEXT
    #   status     TEXT DEFAULT 'pending'
    #   created_at DATETIME   ← restoring DEFAULT CURRENT_TIMESTAMP
    #   PRIMARY KEY (user_id, friend_id)
    #   FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE
    #   FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
    op.execute("ALTER TABLE friends RENAME TO _friends_old")
    op.execute(
        """
        CREATE TABLE friends (
            user_id TEXT,
            friend_id TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(user_id, friend_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        "INSERT INTO friends (user_id, friend_id, status, created_at) "
        "SELECT user_id, friend_id, status, created_at "
        "FROM _friends_old"
    )
    op.execute("DROP TABLE _friends_old")

    # ── (2) Cover-index the FK referencing columns that previously
    # forced a full scan on cascade. `IF NOT EXISTS` so this migration
    # is safe to re-run.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_comments_user "
        "ON feed_comments(user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_repost "
        "ON feed_posts(repost_of_post_id)"
    )


def downgrade() -> None:
    # Downgrade is intentionally a no-op for the friends rebuild —
    # reversing a DEFAULT change would mean another table rebuild for
    # zero observable gain, and `e1b8d2a3c4f5`'s downgrade already
    # raises (the whole FK-rebuild chain is forward-only). The two
    # new indexes are removable for completeness, but harmless to
    # leave behind.
    op.execute("DROP INDEX IF EXISTS idx_feed_comments_user")
    op.execute("DROP INDEX IF EXISTS idx_feed_posts_repost")
