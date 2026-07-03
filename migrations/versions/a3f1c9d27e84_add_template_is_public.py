"""add trip_templates.is_public for the per-template Discover toggle

Revision ID: a3f1c9d27e84
Revises: d8f3b1a06c52
Create Date: 2026-06-11 02:00:00.000000

Templates can now be marked public (listed on the Discover feed) or
unlisted (code-only). Default 1 (public) so existing templates keep
showing on Discover exactly as before — the column adds an OPT-OUT, not
a behaviour change. A creator can flip a template to unlisted so it's
reachable only via its /t/<code> share link.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'a3f1c9d27e84'
down_revision: str | Sequence[str] | None = 'd8f3b1a06c52'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE trip_templates ADD COLUMN is_public INTEGER DEFAULT 1")


def downgrade() -> None:
    op.execute("ALTER TABLE trip_templates DROP COLUMN is_public")
