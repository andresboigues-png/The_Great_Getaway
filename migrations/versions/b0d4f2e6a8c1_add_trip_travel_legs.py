"""add travel_json to trips (arrival/departure travel legs)

Revision ID: b0d4f2e6a8c1
Revises: b9e3d5c7a1f4
Create Date: 2026-07-14 09:00:00.000000

Persists how the traveller gets TO and FROM the trip — the arrival and
departure "travel legs" surfaced on the Transportation tab (nearest
airport + route). This is trip METADATA (it rides the normal /api/trips
upsert path, NOT the media write path), so the column lives next to the
other trip JSON blobs.

JSON shape (nullable):

    {
      "arrival":   {"mode": "flight", "note": "BA249"},
      "departure": {"mode": "car"}
    }

`mode` is the existing TransportMode union
('walk'|'metro'|'bus'|'train'|'tram'|'car'|'taxi'|'bike'|'ferry'|
 'flight'|'mixed'); each leg's `note` is optional. Either leg may be
absent or null. Null on the column means "no legs set" (legacy rows +
trips the user never filled in) — the read path treats null the same as
an absent object.

SQLite's ALTER TABLE ADD COLUMN can't carry a CHECK constraint; the
`CHECK(travel_json IS NULL OR json_valid(travel_json))` guard lives in
database.py's CREATE TABLE for fresh DBs, mirroring how every other
`*_json` column was added (e.g. a2c5e8d1f7b3 for trip_countries_json).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b0d4f2e6a8c1'
down_revision: str | Sequence[str] | None = 'b9e3d5c7a1f4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the travel_json column to trips.

    Idempotent — checks the column list first so a re-run on a DB
    that's already been touched (e.g. via init_db's CREATE TABLE
    fallback in dev) doesn't crash with `duplicate column name`.
    """
    bind = op.get_bind()
    cols = bind.execute(sa.text("PRAGMA table_info(trips)")).fetchall()
    if any(c[1] == "travel_json" for c in cols):
        return
    op.execute("ALTER TABLE trips ADD COLUMN travel_json TEXT")


def downgrade() -> None:
    """SQLite's DROP COLUMN pre-3.35 requires a table rebuild — leaving
    the column in place on downgrade is safe (the read path ignores
    null/missing values). Mirrors a2c5e8d1f7b3's no-op downgrade."""
    pass
