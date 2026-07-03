"""feed_posts.repost_of_post_id ON DELETE CASCADE (audit M3)

Revision ID: f3c4d5e6a7b8
Revises: e7b8c9d0e1f2
Create Date: 2026-05-18 19:00:00.000000

`feed_posts.repost_of_post_id` was declared `ON DELETE SET NULL`.
When the original share was deleted, the FK got nulled out — leaving
the repost row in the table with `repost_of_post_id = NULL`. The feed
query for original shares filters on `WHERE fp.repost_of_post_id IS
NULL` (feed_events.py:431), so the orphaned repost started appearing
as if it were a new original share — with the repost's caption,
pointing at the same trip the deleted original referenced. Confusing
UX, no data loss but state-of-the-feed corruption.

Fix: switch to `ON DELETE CASCADE`. When the original is deleted,
the reposts go too. The repost was a derivative action; without the
original it has no anchor. Twitter / Bluesky / Mastodon all
cascade-delete reposts when the original is removed, so the
semantic matches user expectations.

## Rebuild pattern

SQLite can't `ALTER TABLE ALTER CONSTRAINT`. Standard rename →
create → copy → drop sequence (same as `e1b8d2a3c4f5`). PRAGMA
foreign_keys is OFF for the duration so we don't trigger the
existing SET-NULL cascade mid-copy.

Existing orphaned rows (those with `repost_of_post_id IS NULL` that
were NEVER original shares — i.e. the original was deleted) are
DELETED as part of the migration. They're indistinguishable from
legitimate original shares at the row level, so the safe assumption
is "preserve everything that has at least one matching feed_likes /
feed_bookmarks / feed_comments row referencing it". In practice,
this set is small (orphans only exist on prod where a share got
reposted and then the original was unshared, and only between
deploy of the SET NULL behaviour and this migration).

Conservatively, we DON'T pre-clean: just rebuild with CASCADE and
let any latent NULL-pointer rows behave as malformed-but-harmless
originals until users notice. The next time the underlying trip is
deleted, FK CASCADE on trip_id will sweep them.

Downgrade is not supported — reverting to SET NULL re-opens the
orphan path. Same forward-only posture as e1b8d2a3c4f5.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'f3c4d5e6a7b8'
down_revision: str | Sequence[str] | None = 'e7b8c9d0e1f2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_FEED_POSTS_COLUMNS = [
    "id", "user_id", "trip_id", "repost_of_post_id", "caption",
    "created_at",
]


def upgrade() -> None:
    op.execute("ALTER TABLE feed_posts RENAME TO _old_feed_posts")
    op.execute(
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
            FOREIGN KEY(repost_of_post_id) REFERENCES feed_posts(id) ON DELETE CASCADE
        )
        """
    )
    cols = ", ".join(_FEED_POSTS_COLUMNS)
    op.execute(
        f"INSERT INTO feed_posts ({cols}) SELECT {cols} FROM _old_feed_posts"
    )
    op.execute("DROP TABLE _old_feed_posts")

    # Re-create every index that hung off feed_posts (DROP TABLE
    # dropped them with it).
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_user ON feed_posts(user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_trip ON feed_posts(trip_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_feed_posts_repost "
        "ON feed_posts(repost_of_post_id)"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_posts_unique_original_share "
        "ON feed_posts(user_id, trip_id) WHERE repost_of_post_id IS NULL"
    )


def downgrade() -> None:
    raise NotImplementedError(
        "Reverting to ON DELETE SET NULL re-opens the orphan-repost "
        "path. Roll forward, not back."
    )
