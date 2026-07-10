"""add is_public to users (profile visibility)

Revision ID: c3f7a1b9e2d4
Revises: d4b9f1e7a2c8
Create Date: 2026-07-10 12:00:00.000000

Profile privacy feature.

Adds:
- users.is_public (INTEGER DEFAULT 1): 1 = public profile (discoverable in
  user search + viewable by anyone, the existing always-public behaviour);
  0 = private (viewable + findable only by the owner and their current
  followers/friends). Default 1 so every EXISTING row keeps today's
  always-public behaviour — private is a deliberate opt-in, no user's
  profile silently disappears when this ships.

Additive + backward-compatible. Idempotent (the guard mirrors the init_db
CREATE for fresh installs). `down_revision` is the current head
d4b9f1e7a2c8.
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'c3f7a1b9e2d4'
down_revision: str | Sequence[str] | None = 'd4b9f1e7a2c8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # users.is_public — additive, guarded so a re-run / fresh install
    # (which gets the column from init_db's CREATE) doesn't error.
    cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()]
    if "is_public" not in cols:
        op.execute("ALTER TABLE users ADD COLUMN is_public INTEGER DEFAULT 1")


def downgrade() -> None:
    # Leave users.is_public in place — SQLite DROP COLUMN is awkward pre-3.35
    # and the column is a harmless additive flag.
    pass
