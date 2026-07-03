"""add share_token / share_views / share_show_cost to trips

Revision ID: b1d2e3f4c5a6
Revises: a8c7e2f1b9d4
Create Date: 2026-05-13 10:00:00.000000

FIXING_ROADMAP §4.1 — public share-via-link. Each trip optionally
carries a `share_token` (NULL when not shared) that an unauthenticated
visitor uses to fetch the trip via /api/share/<token> + /share/<token>.

Columns added:
  share_token       — TEXT, UNIQUE, NULL means "not shared." Set to a
                      random hex string when the owner clicks Share,
                      cleared on Unshare. Unique so two trips can't
                      collide on the public URL.
  share_views       — INTEGER, default 0. Incremented on each visit
                      to /share/<token>, deduped by a 24h anonymous
                      cookie so a single viewer hitting refresh five
                      times doesn't inflate the count.
  share_show_cost   — INTEGER (0/1), default 0. Owner-controlled
                      privacy toggle: when 1, the public artifact
                      shows an aggregate cost summary (total + per-
                      country, no line items). Default off so a casual
                      Share never accidentally exposes spending.

UNIQUE constraint on share_token is enforced via a partial index
(SQLite supports it natively); NULL values are not deduplicated,
so unshared trips don't all collide on NULL.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b1d2e3f4c5a6'
down_revision: str | Sequence[str] | None = 'a8c7e2f1b9d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE trips ADD COLUMN share_token TEXT")
    op.execute("ALTER TABLE trips ADD COLUMN share_views INTEGER DEFAULT 0")
    op.execute("ALTER TABLE trips ADD COLUMN share_show_cost INTEGER DEFAULT 0")
    # Partial unique index — NULL values are NOT deduplicated so the
    # "not shared" trips don't all collide on a single NULL slot.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share_token "
        "ON trips(share_token) WHERE share_token IS NOT NULL"
    )


def downgrade() -> None:
    """SQLite has no reliable DROP COLUMN. Leave the columns; they
    sit unused once the route is gone."""
    op.execute("DROP INDEX IF EXISTS idx_trips_share_token")
