"""add marked_places_json to trips

Revision ID: c374584f6044
Revises: 0c7a67724fda
Create Date: 2026-05-06 14:00:21.294172

Stores the user's "places I've marked from the home map" — both the
AI-planner shortlist (places to feed into Gemini's prompt) and the
manual shortlist (places to pick from when filling in days by hand).
JSON shape:
  [{
      placeId, name, address, lat, lng, icon, color,
      forAI: bool, forManual: bool,
      dayId: string | null, timeOfDay: 'morning'|'afternoon'|'evening'|null
  }, ...]
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c374584f6044'
down_revision: str | Sequence[str] | None = '0c7a67724fda'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the marked_places_json column to trips."""
    op.execute("ALTER TABLE trips ADD COLUMN marked_places_json TEXT")


def downgrade() -> None:
    """SQLite doesn't support DROP COLUMN before 3.35 reliably; leaving
    the column in place on downgrade is safe — the app simply ignores
    it. If a strict downgrade is needed, recreate the trips table
    without the column."""
    pass
