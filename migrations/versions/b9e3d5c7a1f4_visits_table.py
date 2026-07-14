"""add anonymous first-party visits table

Revision ID: b9e3d5c7a1f4
Revises: a8d2c4f6b1e3
Create Date: 2026-07-13 17:00:00.000000

Privacy-respecting landing analytics (see src/services/visits.py). Answers
"how many curious people clicked my LinkedIn link" without third-party
trackers and without storing personal data:

- `visits` (all anonymous — never linked to an account):
    id            TEXT PK
    visitor_id    TEXT  first-party `gg_vid` cookie (unique-visitor signal)
    ip_hash       TEXT  salted sha256 of the client IP — raw IP NEVER stored
    referrer_host TEXT  external referring host only (e.g. "linkedin.com")
    region        TEXT  rough locale from Accept-Language (not IP geo)
    device        TEXT  coarse bucket (mobile/tablet/desktop)
    browser       TEXT  coarse bucket
    created_at    DATETIME

Additive + backward-compatible. Idempotent (CREATE TABLE / INDEX IF NOT
EXISTS mirror the init_db CREATE for fresh installs). `down_revision` is the
current head a8d2c4f6b1e3.
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'b9e3d5c7a1f4'
down_revision: str | Sequence[str] | None = 'a8d2c4f6b1e3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS visits (
            id TEXT PRIMARY KEY,
            visitor_id TEXT,
            ip_hash TEXT,
            referrer_host TEXT,
            region TEXT,
            device TEXT,
            browser TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_id)")


def downgrade() -> None:
    # Drop the analytics table + its indexes (no dependents; safe).
    op.execute("DROP INDEX IF EXISTS idx_visits_visitor")
    op.execute("DROP INDEX IF EXISTS idx_visits_created")
    op.execute("DROP TABLE IF EXISTS visits")
