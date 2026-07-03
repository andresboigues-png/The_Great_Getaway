"""add token_jti to users

Revision ID: a8c7e2f1b9d4
Revises: d8a1f3e9b240
Create Date: 2026-05-13 09:30:00.000000

FIXING_ROADMAP §0.3 — JWT revocation. Each user row gets a token_jti
column. issue_token() reads it (creating one on first use); the value
is embedded as the JWT's `jti` claim. verify_token() compares the
embedded jti against the row's current value, rejecting if mismatch.

Logout bumps token_jti to a fresh value, which invalidates every JWT
issued before the bump (including tokens stored on other devices).
This is the simpler "single jti per user" model — for finer-grained
per-session revocation we'd track a list of active jtis per user,
but for an alpha-stage product the simple model is enough.

The column is nullable. issue_token() lazily fills it on first call
per user, so we don't need a data backfill.
"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a8c7e2f1b9d4'
down_revision: str | Sequence[str] | None = 'd8a1f3e9b240'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN token_jti TEXT")


def downgrade() -> None:
    """SQLite < 3.35 has no reliable DROP COLUMN. Leaving the column
    on downgrade is safe — auth.py treats missing/null as 'no jti to
    check yet' under the lazy-init path, so old code keeps working."""
    pass
