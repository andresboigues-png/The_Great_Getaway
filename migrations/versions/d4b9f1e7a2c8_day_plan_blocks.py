"""trip_days.plan_blocks_json — ordered text+place block content per time-part

Revision ID: d4b9f1e7a2c8
Revises: c3f6e9a1b4d7
Create Date: 2026-07-07 00:00:00.000000

Additive column: an ordered list of content blocks (text + place-reference
blocks) per time-part, letting places be interleaved anywhere in a day's
plan. Null for every existing day — the flat morning/afternoon/evening
strings remain the source of truth until a day is edited in the block
editor, so nothing is migrated. Place DATA stays in trips.marked_places.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4b9f1e7a2c8"
down_revision: str | Sequence[str] | None = "c3f6e9a1b4d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.exec_driver_sql("ALTER TABLE trip_days ADD COLUMN plan_blocks_json TEXT")


def downgrade() -> None:
    # SQLite pre-3.35 can't DROP COLUMN; the additive column is left in place.
    pass
