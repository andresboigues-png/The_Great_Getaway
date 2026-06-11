"""add trip_days accommodation columns

Revision ID: d8f3b1a06c52
Revises: c7e2a9b4d106
Create Date: 2026-06-11 01:00:00.000000

Wave 2 of the trip-features build. A day can now record WHERE you're
staying. Three flat, nullable TEXT columns on trip_days:

  - accommodation         display name ("Hotel Garnier")
  - accommodation_place_id  Google Place id (NULL = manual pin / no Places)
  - accommodation_address   formatted address from Places

Flat columns (not a JSON blob) so they bind directly through the
upsert_day column writer, matching every other day field. When set via
Places, the day's existing lat/lng are updated to the hotel coordinates
— the hotel IS the day pin, so no extra marker/column is needed.

Pre-existing rows get NULL (no accommodation), which the UI renders as
an empty picker. No backfill.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd8f3b1a06c52'
down_revision: Union[str, Sequence[str], None] = 'c7e2a9b4d106'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE trip_days ADD COLUMN accommodation TEXT DEFAULT NULL")
    op.execute("ALTER TABLE trip_days ADD COLUMN accommodation_place_id TEXT DEFAULT NULL")
    op.execute("ALTER TABLE trip_days ADD COLUMN accommodation_address TEXT DEFAULT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE trip_days DROP COLUMN accommodation_address")
    op.execute("ALTER TABLE trip_days DROP COLUMN accommodation_place_id")
    op.execute("ALTER TABLE trip_days DROP COLUMN accommodation")
