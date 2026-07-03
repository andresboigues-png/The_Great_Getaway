"""add trips.notes for the Trip Hub tab

Revision ID: c7e2a9b4d106
Revises: e2a4c6b8d0f1
Create Date: 2026-06-11 00:00:00.000000

Wave 1 of the Trip Hub feature. The "Trip Hub" (day-0 anchor) is
being promoted out of the Path-tab wheel into its own tab — the home
for trip-wide stuff (anchor pin, checklist, documents, photos, stats)
plus a NEW trip-wide free-text notes field.

`notes` is plain TEXT, nullable, defaults NULL (= no notes). It rides
the trip METADATA write path (upsert_trip), never the dedicated media
write path — so it cannot reopen the R12-B4 media-loss class. It is
member-only: serialize_trip_row passes it through to /api/data, and the
public-trip read path strips it (the /share/<token> path never selects
it). Pre-existing rows get NULL, which the frontend renders as an empty
notes box — no backfill needed.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'c7e2a9b4d106'
down_revision: str | Sequence[str] | None = 'e2a4c6b8d0f1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE trips ADD COLUMN notes TEXT DEFAULT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE trips DROP COLUMN notes")
