"""add blocks table for user-level safety primitive

Revision ID: 06a7b8c9d0e2
Revises: f5a6b7c8d9e1
Create Date: 2026-05-26 23:25:00.000000

Audit #C-9 / Issue 18: the app had NO block / mute / restrict
primitive. A harasser could repeatedly follow → unfollow → follow
(rate-limited at 60/min though), spam trip invites at 30/min,
comment on the victim's shared posts at 60/min, repost their
content, like their posts at 120/min. Victim's only recourse was
to mute their own notification bell entirely.

Add the minimal `blocks` table:
  - blocker_id: the user who initiated the block
  - blocked_id: the user being blocked
  - created_at: when

Symmetric semantic: once A blocks B, B cannot
  - follow A
  - invite A to a trip
  - comment / repost on A's shares
  - send A any notification

A can still see B's public trips via /api/public-trip (a one-sided
block doesn't redact public content — the audit doesn't ask for
"hide my public profile from the blocked user", which is a
separate harder feature). The point is to stop B from REACHING
A's bell.

UNIQUE(blocker_id, blocked_id) so the block op is idempotent.
PK is the composite — there's no separate id column needed.
"""

from collections.abc import Sequence

from alembic import op

revision: str = '06a7b8c9d0e2'
down_revision: str | Sequence[str] | None = 'f5a6b7c8d9e1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS blocks (
            blocker_id TEXT NOT NULL,
            blocked_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (blocker_id, blocked_id),
            FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
            CHECK (blocker_id != blocked_id)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_blocks_blocked")
    op.execute("DROP TABLE IF EXISTS blocks")
