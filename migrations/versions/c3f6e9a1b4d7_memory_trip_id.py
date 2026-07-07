"""profile_quotes — optional link to a common trip per memory

Revision ID: c3f6e9a1b4d7
Revises: b2e5d8c3f4a6
Create Date: 2026-07-07 00:00:00.000000

Adds one nullable column (memory_trip_id) so a memory can point at a trip
both the author and the profile owner share. Additive only — old rows read
NULL. Mirrors the CREATE in database.py so a fresh boot and a migrated DB
converge.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "c3f6e9a1b4d7"
down_revision: str | Sequence[str] | None = "b2e5d8c3f4a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.exec_driver_sql("ALTER TABLE profile_quotes ADD COLUMN memory_trip_id TEXT")


def downgrade() -> None:
    # SQLite < 3.35 can't DROP COLUMN, so this additive column is left in place.
    pass
