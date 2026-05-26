"""add feed_posts.trip_was_public for share→unshare publicness restore

Revision ID: d3e4f5a6c7b9
Revises: c2d3e4f5b6a8
Create Date: 2026-05-26 21:40:00.000000

Audit #C-6: /api/feed/share auto-promotes a private trip to is_public=1
when the owner clicks Share. /api/feed/share unshare deletes the
feed_posts row but DOES NOT restore is_public. Result: an owner who
shares once, then unshares, has silently flipped their trip's privacy
permanently — followers / Explore still see it.

Fix shape: each share remembers what the trip's `is_public` value
was at share-creation time. On unshare we restore IFF (a) this share
was the one that flipped the bit, AND (b) no other original shares
of the same trip still exist. If other shares exist (different users
who also shared the same trip), leave is_public alone — pulling the
rug out from under their shares would 404 their followers.

`trip_was_public` is nullable:
  - NULL → pre-fix row, or a share where the trip was already
    public (nothing to restore). Treated as "do nothing on unshare".
  - 0    → the trip was private at share time; this row's unshare
    is a candidate for restoration.
  - 1    → defensively recorded; equivalent to NULL for the
    restore logic.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd3e4f5a6c7b9'
down_revision: Union[str, Sequence[str], None] = 'c2d3e4f5b6a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE feed_posts ADD COLUMN trip_was_public INTEGER DEFAULT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE feed_posts DROP COLUMN trip_was_public")
