"""add notifications.post_id for engagement-notification routing + cascade (audit NF1 + NF3)

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-05-26 15:30:00.000000

Engagement notifications (share_liked / share_commented / share_reposted)
used to stash the actor's user_id in `related_id`. Two bugs fell out
of that:

  1. **NF1**: the frontend router couldn't route to the post the
     engagement happened on — `related_id` was the actor, not the
     post. Every "Sara liked your share" notification landed on
     HOME instead of the FEED entry the user wanted to revisit.

  2. **NF3**: when the share was unshared (the feed_post row was
     deleted), the engagement notifications stuck around as orphans
     pointing at the actor (still real) but referencing a deleted
     post implicitly via the type. No way for the system to clean
     them up because there was no FK / column linking notification
     row → post row.

Both fall out of a missing `post_id INTEGER` column. Add it now (NULL
on legacy rows + non-engagement types), then:
  - feed.py's `_fire_engagement_notification` populates it on insert
  - feed.py's unshare handler DELETEs notifications WHERE post_id = ?
    to cascade-clean orphans
  - the frontend router uses `notification.post_id` to navigate to
    the right FEED entry.

The audit also suggested an ON DELETE CASCADE foreign key, but SQLite
can't add FKs via ALTER TABLE. Application-level cleanup is the
shipped path here; a future schema rebuild can add the FK if drift
becomes an issue.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'f5a6b7c8d9e0'
down_revision: str | Sequence[str] | None = 'e4f5a6b7c8d9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add post_id column + supporting index."""
    op.execute("ALTER TABLE notifications ADD COLUMN post_id INTEGER")
    # Index for the cascade-cleanup path: unshare deletes WHERE post_id = ?
    # — without an index, scanning a notifications table that's grown
    # to thousands of rows is a noticeable hit on every unshare.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_post_id "
        "ON notifications(post_id)"
    )


def downgrade() -> None:
    """Drop the column by rebuilding the table (SQLite can't ALTER
    DROP COLUMN before 3.35; we're on 3.40+ but the table-rebuild
    pattern survives older deploys, so use it for safety)."""
    op.execute("DROP INDEX IF EXISTS idx_notifications_post_id")
    op.execute("PRAGMA foreign_keys=OFF")
    op.execute("""
        CREATE TABLE notifications_old (
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
    """)
    op.execute("""
        INSERT INTO notifications_old
        SELECT id, user_id, type, title, related_id, message, is_read, created_at
        FROM notifications
    """)
    op.execute("DROP TABLE notifications")
    op.execute("ALTER TABLE notifications_old RENAME TO notifications")
    op.execute("PRAGMA foreign_keys=ON")
