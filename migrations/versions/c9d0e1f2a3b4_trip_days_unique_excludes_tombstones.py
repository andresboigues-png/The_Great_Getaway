"""trip_days unique (trip_id, day_number) excludes tombstones

Revision ID: c9d0e1f2a3b4
Revises: a1b2c3d4e5f6
Create Date: 2026-05-29 17:30:00.000000

4.8 audit TRIP-2 fix.

The partial UNIQUE index `idx_trip_days_trip_day_number` (added in
b1d2e3f4c5a7) covered ALL rows, including soft-deleted (tombstoned)
ones. `delete_day` sets `deleted_at` but leaves `day_number` intact,
so a deleted day kept occupying its `(trip_id, day_number)` slot.

The client renumbers surviving days after a delete (handlers.ts), so a
survivor renumbered INTO the just-freed slot collided with the
tombstone → IntegrityError. Combined with DAY-1 (the handler matched
the index NAME, which never appears in SQLite's message, so the
intended 409 was dead code), every such collision surfaced as a raw
500 and the renumber silently failed, leaving a permanent numbering
gap.

Fix: rebuild the index with `AND deleted_at IS NULL` so tombstoned
rows free their slot the instant a day is deleted. Mirrored in
database.py init_db for fresh installs.

Safety: the OLD index already guaranteed uniqueness across ALL rows,
so no two LIVE rows can share (trip_id, day_number) today — the new
(live-only) index therefore builds without collision and no pre-clean
is required.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'c9d0e1f2a3b4'
down_revision: str | Sequence[str] | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_trip_days_trip_day_number")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_days_trip_day_number "
        "ON trip_days(trip_id, day_number) "
        "WHERE trip_id IS NOT NULL AND day_number IS NOT NULL "
        "  AND deleted_at IS NULL"
    )


def downgrade() -> None:
    # Revert to the all-rows partial index (pre-4.8 shape).
    op.execute("DROP INDEX IF EXISTS idx_trip_days_trip_day_number")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_days_trip_day_number "
        "ON trip_days(trip_id, day_number) "
        "WHERE trip_id IS NOT NULL AND day_number IS NOT NULL"
    )
