"""profile_quotes — optional year + country per memory

Revision ID: b2e5d8c3f4a6
Revises: a1f4c7e2b9d5
Create Date: 2026-07-07 00:00:00.000000

Adds two nullable columns (memory_year, memory_country) so a memory can
carry when/where it happened. Additive only — old rows read NULL.
Mirrors the CREATE in database.py so a fresh boot and a migrated DB
converge.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b2e5d8c3f4a6"
down_revision: str | Sequence[str] | None = "a1f4c7e2b9d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    # SQLite allows only one ADD COLUMN per ALTER, so split into two.
    conn.exec_driver_sql("ALTER TABLE profile_quotes ADD COLUMN memory_year INTEGER")
    conn.exec_driver_sql("ALTER TABLE profile_quotes ADD COLUMN memory_country TEXT")


def downgrade() -> None:
    # SQLite < 3.35 can't DROP COLUMN, so these additive columns are left in place.
    pass
