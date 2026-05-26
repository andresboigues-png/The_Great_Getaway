"""add trip_members.completed_at for completion semantics

Revision ID: e4f5a6b8c9d0
Revises: d3e4f5a6c7b9
Create Date: 2026-05-26 22:50:00.000000

Audit #C-26: `trips.is_archived` does triple duty (archive flag +
completion event trigger + public broadcast trigger), and the
"friend_archived_trip" feed event used `t.created_at` as its
timestamp. Result: a trip created 31+ days ago that the user
completes today never surfaces in their friends' feed because the
30-day window check is on the creation date, not the completion
date — the system FORGETS that anyone ever completed an old trip.

Add `trip_members.completed_at` as a nullable TIMESTAMP. Filled by
the archive endpoint (the moment the per-user archive flag flips
0→1), cleared by unarchive. The feed-event window check + sort key
move to this column so completing an old trip surfaces correctly.

Pre-existing archived rows get NULL — they'll behave like legacy
data (no surfacing in the freshly-completed window), which is
acceptable because the original use case ("trips I just finished
should show up in my friends' feed") only matters going forward.
The next archive toggle on those rows stamps completed_at.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'e4f5a6b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd3e4f5a6c7b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE trip_members ADD COLUMN completed_at DATETIME DEFAULT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE trip_members DROP COLUMN completed_at")
