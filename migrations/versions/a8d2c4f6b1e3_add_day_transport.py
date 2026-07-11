"""add per-day transport recommendation

Revision ID: a8d2c4f6b1e3
Revises: c3f7a1b9e2d4
Create Date: 2026-07-11 12:00:00.000000

Transportation feature Phase 1 (design: "Transportation design MK1.md").

Adds:
- trip_days.transport_json (TEXT, nullable): the day's "how to get around"
  recommendation as JSON {"mode": "metro", "note": "24h pass €7.50",
  "source": "ai"|"suggest"|"user"}. NULL = no recommendation yet. Validated
  server-side in services/day_writes.py (mode enum + note cap); written via
  the conditional-bind pattern so a payload omitting the key can never
  clobber it.

Additive + backward-compatible. Idempotent (guard mirrors the init_db
CREATE for fresh installs). `down_revision` is the current head
c3f7a1b9e2d4.
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'a8d2c4f6b1e3'
down_revision: str | Sequence[str] | None = 'c3f7a1b9e2d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(trip_days)").fetchall()]
    if "transport_json" not in cols:
        op.execute("ALTER TABLE trip_days ADD COLUMN transport_json TEXT")


def downgrade() -> None:
    # Leave the column in place — additive + harmless (SQLite DROP COLUMN
    # is awkward pre-3.35), matching the accommodation/plan-blocks posture.
    pass
