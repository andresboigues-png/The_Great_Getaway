"""trip templates + creator flag

Revision ID: e2a4c6b8d0f1
Revises: a1f4c7e2b9d3
Create Date: 2026-06-04 16:30:00.000000

Trip Templates feature.

Adds:
- users.is_creator (INTEGER DEFAULT 0): 1 = a "Creator" account that may
  publish trip templates. Granted by the dev account only (the dev email
  is always treated as a creator regardless of this flag). Nullable-safe
  additive column; existing rows default to 0 (not a creator).
- trip_templates table: a creator's FROZEN, pre-stripped snapshot of a
  trip, addressable by a short human-typeable code. `snapshot_json` holds
  ONLY shareable content (name, place, day structure + optional plans /
  marked places / checklist per the include_* toggles) — never expenses,
  settlements, budgets, companions, photos, or documents. That pre-strip
  is the privacy boundary for the public preview-by-code endpoint.

Both are additive + backward-compatible. Idempotent (guards mirror the
init_db CREATE for fresh installs). `down_revision` is the current head
a1f4c7e2b9d3.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'e2a4c6b8d0f1'
down_revision: Union[str, Sequence[str], None] = 'a1f4c7e2b9d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # users.is_creator — additive, guarded so a re-run / fresh install
    # (which gets the column from init_db's CREATE) doesn't error.
    cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()]
    if "is_creator" not in cols:
        op.execute("ALTER TABLE users ADD COLUMN is_creator INTEGER DEFAULT 0")

    # trip_templates table.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS trip_templates (
            id TEXT PRIMARY KEY,
            code TEXT UNIQUE NOT NULL,
            owner_id TEXT NOT NULL,
            name TEXT NOT NULL,
            source_trip_id TEXT,
            include_plans INTEGER DEFAULT 1,
            include_places INTEGER DEFAULT 1,
            include_checklist INTEGER DEFAULT 1,
            snapshot_json TEXT
                CHECK(snapshot_json IS NULL OR json_valid(snapshot_json)),
            use_count INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_trip_templates_owner "
        "ON trip_templates(owner_id)"
    )


def downgrade() -> None:
    # Drop the table; leave users.is_creator in place (SQLite DROP COLUMN
    # is awkward pre-3.35 and the column is a harmless additive flag).
    op.execute("DROP TABLE IF EXISTS trip_templates")
