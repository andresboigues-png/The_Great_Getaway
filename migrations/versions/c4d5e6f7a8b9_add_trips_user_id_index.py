"""add missing trips.user_id index (audit critical #4)

Revision ID: c4d5e6f7a8b9
Revises: b3c2a1d4e5f6
Create Date: 2026-05-18 17:00:00.000000

Every user-scoped query on `trips` (`/api/data` poll, achievements,
admin stats, public-profile listings, feed builder) does
`WHERE user_id = ?` with no covering index. The trips table is
hot — touched by every authenticated request — so a full-scan per
poll degrades quadratically with the trip count. PA's free-tier
SQLite is single-process and CPU-bound, so the cost shows up first
there.

Adds two indexes:

  - `idx_trips_user`         (user_id)
      Covers the bare "list my trips" path. Used by /api/data's
      bulk fetch, every achievement check, and the per-trip
      ownership lookup.

  - `idx_trips_user_public`  (user_id, is_public)
      Composite for /api/public-profile/<id> which filters
      `WHERE user_id = ? AND is_public = 1`. The (user_id, is_public)
      ordering also lets the planner use it for plain user_id-only
      queries via the leading-column rule, so it's a strict superset
      of the bare index where space matters — but we add BOTH because
      the single-column index is half the size and the planner picks
      it for the simple case.

Backward-compatible. Down drops the indexes. Safe to re-run via
`IF NOT EXISTS`.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b3c2a1d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_trips_user_public "
        "ON trips(user_id, is_public)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_trips_user_public")
    op.execute("DROP INDEX IF EXISTS idx_trips_user")
