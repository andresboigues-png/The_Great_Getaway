"""NULL trip_members.invited_by where invited_by = user_id (owner self-row cleanup)

Revision ID: 18a1b2c3d4e5
Revises: 17b8c9d0e1f3
Create Date: 2026-05-27 12:00:00.000000

The owner of a trip wasn't invited by anyone — they created the trip.
Two paths stamped `invited_by = owner_id` for the owner's own row:

  1. e7b8c9d0e1f2's backfill SELECTed `t.user_id` as invited_by for
     every trip's owner row.
  2. helpers.ensure_owner_member_row() did the same on every fresh
     /api/trips upsert and /api/sync trip loop.

Both have been fixed at source (NULL instead of owner_id). This
migration cleans up the rows already written under the old model so
any code that reads invited_by for messaging copy ("X invited Y")
doesn't see "you invited yourself" for owner rows.

Idempotent — only UPDATEs rows where the condition still holds.
"""
from collections.abc import Sequence

from alembic import op

revision: str = '18a1b2c3d4e5'
down_revision: str | Sequence[str] | None = '17b8c9d0e1f3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE trip_members
        SET invited_by = NULL
        WHERE invited_by = user_id
        """
    )


def downgrade() -> None:
    # No-op: we can't reconstruct "was this owner_id originally NULL
    # or set to themselves" without keeping a journal. The post-upgrade
    # state IS the canonical state.
    pass
