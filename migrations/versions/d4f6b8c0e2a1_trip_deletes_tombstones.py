"""trip_deletes tombstones (per-row delta sync, Phase 1)

Revision ID: d4f6b8c0e2a1
Revises: c3e5a7b9d1f0
Create Date: 2026-06-03 20:55:00.000000

Sync-model Phase 1 (extends tombstone reconciliation to trips — the last
hard-delete entity).

delete_trip is owner-only and HARD-deletes the trip + a 7-table cascade
(expenses, settlements, trip_days, budgets, trip_members, feed_*,
notifications…). With no tombstone, a member whose offline outbox still
held a queued upsertTrip would RESURRECT the trip as a childless zombie:
after the cascade the trips row + trip_members rows are gone, so
upsert_trip sees no existing row, treats the replay as a fresh insert, and
re-creates the trip (auto-stamping the replayer as owner).

We keep the hard cascade delete (it's deliberate + correct) and add a
`trip_deletes` tombstone table, mirroring category_deletes / budget_deletes:

- delete_trip records a tombstone after the owner gate.
- upsert_trip refuses any trip_id carrying a tombstone (terminal — trips
  always get a fresh uuid on create, so a legit re-create never reuses a
  tombstoned id).

The tombstone is keyed by trip_id alone (no user_id): trips are shared, so
a deletion is global — any member's replay must be refused, and the
Phase-2 `?since=` delta ships the tombstone list wholesale (clients drop
any tombstoned trip they still hold, since trip_members is gone and the
server can no longer reconstruct who to notify).

`deleted_at` is TEXT in the `strftime('%Y-%m-%d %H:%M:%f')` shape matching
trips.updated_at so the Phase-2 delta cursor ranges over both uniformly.

Additive + backward-compatible: only the new delete path writes it and
only the new upsert guard + future delta read it.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'd4f6b8c0e2a1'
down_revision: str | Sequence[str] | None = 'c3e5a7b9d1f0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS trip_deletes (
            trip_id TEXT PRIMARY KEY,
            deleted_at TEXT NOT NULL DEFAULT ''
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS trip_deletes")
