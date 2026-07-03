"""add trip_countries_json to trips (§4.3 multi-country support)

Revision ID: a2c5e8d1f7b3
Revises: e1b8d2a3c4f5
Create Date: 2026-05-17 02:30:00.000000

Persists the FULL set of ISO 3166-1 alpha-2 country codes a trip
touches, not just the primary `country_code` from when the user
first picked a place. The "real" set is discovered client-side via
reverse-geocoding day-pin lat/lng; before this column the discovery
was rebuilt on every page load (cached in sessionStorage). Persisting
it server-side:

  - Insights can roll expenses up by country leg without the frontend
    having to re-derive the set.
  - The trip header chip strip renders `🇵🇹 🇯🇵 🇪🇸` from a single read.
  - The slideshow doesn't have to wait for the reverse-geocode loop
    to repopulate sessionStorage on every reload — cold-load gets the
    right flags + facts immediately.
  - Profile country-color maps key off this array instead of the
    scalar `country` field (queued for follow-up slice).

JSON shape: `["PT", "ES", "FR"]` — upper-case ISO codes, primary
country first, additional codes in discovery order. Empty array
when no codes are known (legacy trips with neither `country_code`
nor any day-pin reverse-geocode data). Null is treated the same as
empty by the read path so the column can be left unset for legacy
rows; the upsert always writes either an array or `[]`.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a2c5e8d1f7b3'
down_revision: str | Sequence[str] | None = 'e1b8d2a3c4f5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add the trip_countries_json column to trips.

    Idempotent — checks the column list first so a re-run on a DB
    that's already been touched (e.g. via init_db's CREATE TABLE
    fallback in dev) doesn't crash with `duplicate column name`.
    """
    bind = op.get_bind()
    cols = bind.execute(__import__("sqlalchemy").text("PRAGMA table_info(trips)")).fetchall()
    if any(c[1] == "trip_countries_json" for c in cols):
        return
    op.execute("ALTER TABLE trips ADD COLUMN trip_countries_json TEXT")


def downgrade() -> None:
    """SQLite's DROP COLUMN pre-3.35 requires a table rebuild — leaving
    the column in place on downgrade is safe (the read path ignores
    null/missing values). If a strict downgrade is ever needed, do the
    rename → create → copy → drop dance the FK enforcement migration
    uses."""
    pass
