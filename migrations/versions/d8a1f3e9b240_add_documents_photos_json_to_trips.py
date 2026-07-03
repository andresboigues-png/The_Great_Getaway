"""add documents_json + photos_json to trips

Revision ID: d8a1f3e9b240
Revises: c374584f6044
Create Date: 2026-05-06 16:30:00.000000

Trip-level media stores. Both arrays carry items with an optional
`dayId` — when set, the item is tied to a specific day; when null/
absent, the item is trip-wide (passport, multi-day hotel voucher,
return flight, etc.).

documents_json shape:
  [{ id, name, url, dayId?, addedAt? }, ...]

photos_json shape:
  [{ id, src, dayId?, addedAt? }, ...]

The legacy `day.tickets[]` and `day.photos[]` per-day arrays remain
for backwards compatibility — the new Documents/Photos tabs on Home
present a UNION view, so no migration is required for old data.
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd8a1f3e9b240'
down_revision: str | Sequence[str] | None = 'c374584f6044'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add documents_json + photos_json columns to trips."""
    op.execute("ALTER TABLE trips ADD COLUMN documents_json TEXT")
    op.execute("ALTER TABLE trips ADD COLUMN photos_json TEXT")


def downgrade() -> None:
    """SQLite < 3.35 has no reliable DROP COLUMN. Leaving the columns
    on downgrade is safe — the app just ignores them. If a strict
    downgrade is needed, recreate the trips table without these
    columns."""
    pass
