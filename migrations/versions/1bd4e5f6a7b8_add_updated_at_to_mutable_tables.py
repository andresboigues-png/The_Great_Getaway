"""add updated_at to trips / expenses / budgets / trip_days

Revision ID: 1bd4e5f6a7b8
Revises: 1ac3d4e5f6a7
Create Date: 2026-05-27 19:00:00.000000

R3-Round 4 fix: every mutable user table grows an `updated_at`
TIMESTAMP that the per-row write routes (POST /api/expenses,
/api/budgets, /api/trips upsert, /api/days POST) stamp on every
INSERT/UPDATE. Serializers ship it to the client; the optimistic-
UI write path on the frontend captures the value at edit-time and
sends it back in subsequent writes. The server compares
client-supplied `clientUpdatedAt` to the stored `updated_at`;
mismatch → 409 with the fresh row attached, so the client can
re-render and let the user retry against the latest state.

This closes the last-write-wins class of bugs the R3 personas
flagged: two-tab Maria edit, Diego's 3-week offline sync, the
two-planner race on the same expense. Bulk /api/sync stays
exempt — it's a catch-up channel meant to merge offline state.

Backfill: every row's `updated_at` is initialised to its
`created_at` (so existing client snapshots that don't carry an
`updated_at` field treat the row as freshly-touched and won't
trip the 409 on their first edit).
"""
from typing import Sequence, Union

from alembic import op


revision: str = '1bd4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = '1ac3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite ALTER TABLE ADD COLUMN can't take a non-constant
    # DEFAULT, so the column is added nullable and backfilled in a
    # second statement. Going forward, the per-row routes stamp it
    # explicitly via `CURRENT_TIMESTAMP` (see routes/{expenses,
    # budgets, trips, days}.py).
    op.execute("ALTER TABLE trips ADD COLUMN updated_at DATETIME")
    op.execute("UPDATE trips SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP)")

    op.execute("ALTER TABLE expenses ADD COLUMN updated_at DATETIME")
    # expenses has no created_at column, so backfill to a constant
    # past timestamp. New rows post-deploy will get a real stamp via
    # the per-row INSERT path.
    op.execute("UPDATE expenses SET updated_at = CURRENT_TIMESTAMP")

    op.execute("ALTER TABLE budgets ADD COLUMN updated_at DATETIME")
    op.execute("UPDATE budgets SET updated_at = CURRENT_TIMESTAMP")

    op.execute("ALTER TABLE trip_days ADD COLUMN updated_at DATETIME")
    op.execute("UPDATE trip_days SET updated_at = CURRENT_TIMESTAMP")


def downgrade() -> None:
    op.execute("ALTER TABLE trips DROP COLUMN updated_at")
    op.execute("ALTER TABLE expenses DROP COLUMN updated_at")
    op.execute("ALTER TABLE budgets DROP COLUMN updated_at")
    op.execute("ALTER TABLE trip_days DROP COLUMN updated_at")
