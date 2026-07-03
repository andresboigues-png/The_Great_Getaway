"""add share_show_plans to trips

Revision ID: c2e3d4f5a6b7
Revises: b1d2e3f4c5a6
Create Date: 2026-05-13 13:15:00.000000

FIXING_ROADMAP §4.1 follow-up — second privacy toggle on the share-
via-link surface. share_show_cost (added in b1d2e3f4c5a6) opt-in
unlocks the cost banner; share_show_plans opt-in unlocks the
day-by-day plan blocks (morning / afternoon / evening text + tip).
Defaults to 0 so a casual Share doesn't expose itinerary notes —
those can be the most private part of a trip (e.g. "meet Jamie at
the apartment, key under the mat").

Photos and documents stay off the public artifact entirely for
now; if we want to expose them later, that'll be a third column
(share_show_media) so each surface has its own opt-in.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c2e3d4f5a6b7'
down_revision: str | Sequence[str] | None = 'b1d2e3f4c5a6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE trips ADD COLUMN share_show_plans INTEGER DEFAULT 0")


def downgrade() -> None:
    """SQLite has no reliable DROP COLUMN. Leave the column; safe
    no-op once the route is gone."""
    pass
