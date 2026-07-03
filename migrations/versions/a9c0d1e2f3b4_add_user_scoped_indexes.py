"""add missing user_id / related_id indexes (audit fixes)

Revision ID: a9c0d1e2f3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-05-26 19:50:00.000000

NOTE: down_revision re-pointed from `a8b9c0d1e2f3` → `b7c8d9e0f1a2`
on 2026-05-27 to linearize the migration graph after merging two
parallel audit branches. Original parent was the json_valid CHECK
revision; new parent is the tombstone-columns revision (the actual
last migration on the remote audit branch's chain). The chain
now is:

  ... → b7c8d9e0f1a2 (remote tip — tombstones)
      → a9c0d1e2f3b4 (this)
      → b1d2e3f4c5a7 → d3e4f5a6c7b9 → e4f5a6b8c9d0
      → f5a6b7c8d9e1 → 06a7b8c9d0e2 → 17b8c9d0e1f3 (head)

Three sites that the audit flagged as full-scan-per-request:

  - `categories(user_id)` — PK is `(id, user_id)` with id LEADING, so
    `WHERE user_id = ?` (every /api/data poll, every /api/categories
    POST) can't use the PK. Adds the missing single-column index.

  - `budgets(user_id)` — no index at all. `WHERE user_id = ?` runs
    on every /api/data poll and every budget upsert. Adds the index.

  - `notifications(related_id)` — `notify_trip_public`'s 24h dedupe
    and `delete_trip`'s notification cleanup both filter on
    `related_id`. Existing index is on `(user_id, created_at)` which
    doesn't cover this. Adds the index.

  - `feed_posts(repost_of_post_id)` — already added by migration
    b3c2a1d4e5f6 but ALSO needs to be added to src/database.py's
    init_db so fresh DBs get it without running migrations. Same
    for `feed_comments(user_id)` from the same migration. Audit
    found those two indexes were Alembic-only; this revision
    intentionally re-asserts them (CREATE INDEX IF NOT EXISTS is
    idempotent so re-running is safe).

All indexes use `IF NOT EXISTS` so the migration is idempotent on
DBs that may have been hand-patched.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a9c0d1e2f3b4'
down_revision: str | Sequence[str] | None = 'b7c8d9e0f1a2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_notifications_related ON notifications(related_id)")
    # Re-assert audit-era indexes that the init_db source-of-truth
    # didn't mirror — fresh DBs without alembic upgrade would miss
    # them otherwise (which is what src/database.py is for).
    op.execute("CREATE INDEX IF NOT EXISTS idx_feed_posts_repost ON feed_posts(repost_of_post_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_feed_comments_user ON feed_comments(user_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_feed_comments_user")
    op.execute("DROP INDEX IF EXISTS idx_feed_posts_repost")
    op.execute("DROP INDEX IF EXISTS idx_notifications_related")
    op.execute("DROP INDEX IF EXISTS idx_budgets_user")
    op.execute("DROP INDEX IF EXISTS idx_categories_user")
