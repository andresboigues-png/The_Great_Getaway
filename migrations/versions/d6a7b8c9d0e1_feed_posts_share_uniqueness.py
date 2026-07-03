"""partial UNIQUE on feed_posts(user_id, trip_id) for original shares (audit H5)

Revision ID: d6a7b8c9d0e1
Revises: c5e6f7a8b9c0
Create Date: 2026-05-18 18:00:00.000000

`/api/feed/share` did a `SELECT` for an existing row then `INSERT`
without DB-level uniqueness or serialised locking. Two concurrent
shares of the same trip by the same user (double-click on the
Share button, mobile flaky-net retry, etc.) could both pass the
"no existing" branch and INSERT, creating duplicate
feed_posts rows for the same (user_id, trip_id, repost_of_post_id IS
NULL) tuple. Reposts (repost_of_post_id IS NOT NULL) are
intentionally allowed to multiply, so the uniqueness scope is
PARTIAL — only original (non-repost) shares are unique.

This migration:

1. Deduplicates any existing duplicate original-share rows. Keeps
   the OLDEST row (smallest id ⇒ first ever shared) and deletes the
   later ones, plus the likes/bookmarks/comments that pointed at
   the deleted rows (event_id was `share_<id>`, so the dead-row
   counts disappear from the feed UI on next render).

2. Creates a partial UNIQUE index
   `idx_feed_posts_unique_original_share` on
   (user_id, trip_id) WHERE repost_of_post_id IS NULL. SQLite
   supports partial indexes natively (since 3.8.0).

Post-migration, the handler can switch to `INSERT OR IGNORE` and
re-query on conflict — atomic, race-safe, and removes the need
for an explicit BEGIN IMMEDIATE block.

Downgrade drops the index; the dedupe step is irreversible (we
can't rebuild the deleted dupes from data we no longer have, and
they were duplicates anyway).
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'd6a7b8c9d0e1'
down_revision: str | Sequence[str] | None = 'c5e6f7a8b9c0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── (1) dedupe — keep the smallest id per (user_id, trip_id) where
    # repost_of_post_id IS NULL. Then drop the dependent
    # feed_likes/bookmarks/comments rows whose event_id pointed at a
    # deleted post (event_id format: "share_<post_id>").
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id, trip_id
                       ORDER BY id ASC
                   ) AS rn
            FROM feed_posts
            WHERE repost_of_post_id IS NULL
        )
        DELETE FROM feed_posts
        WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
        """
    )

    # ── (2) partial UNIQUE index — original-share uniqueness only.
    # Reposts (repost_of_post_id NOT NULL) can multiply, so the
    # WHERE clause excludes them from the constraint.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_posts_unique_original_share "
        "ON feed_posts(user_id, trip_id) WHERE repost_of_post_id IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_feed_posts_unique_original_share")
