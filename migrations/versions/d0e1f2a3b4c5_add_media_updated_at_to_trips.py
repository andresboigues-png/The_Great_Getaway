"""add media_updated_at to trips (TRIP-4 media optimistic concurrency)

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-05-29 18:30:00.000000

4.8 audit TRIP-4 fix.

The per-trip media write path (POST /api/trips/<id>/media) is
deliberately decoupled from the metadata `updated_at` optimistic-
concurrency token (so a photo-add doesn't 409 a slow rename in another
tab). But that left the media path with NO concurrency control at all:
two warm devices each POST the full media array, and the later write
silently last-write-wins — clobbering the other device's just-added
photo / checklist item / marked place.

This adds a SEPARATE version stamp, `media_updated_at`, bumped on every
media write. The endpoint gates on it (clientMediaUpdatedAt) and returns
409 + the live media on a mismatch, so the client can union-merge the
concurrent adds and retry instead of clobbering.

Nullable + no backfill: NULL means "no media version yet", which the
endpoint's `(? IS NULL OR media_updated_at IS NULL OR media_updated_at
= ?)` gate treats as "pass" — the first versioned write stamps a real
value and subsequent writes are gated. Mirrored in database.py init_db
for fresh installs.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'd0e1f2a3b4c5'
down_revision: str | Sequence[str] | None = 'c9d0e1f2a3b4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Idempotent guard: skip if the column already exists (fresh installs
    # get it from init_db's CREATE TABLE; a re-run shouldn't error).
    conn = op.get_bind()
    cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(trips)").fetchall()]
    if "media_updated_at" not in cols:
        op.execute("ALTER TABLE trips ADD COLUMN media_updated_at DATETIME")


def downgrade() -> None:
    # SQLite can't DROP COLUMN before 3.35 and a table-rebuild here is
    # risky for a nullable additive column — leave it in place on
    # downgrade (harmless; the app simply stops reading/writing it).
    pass
