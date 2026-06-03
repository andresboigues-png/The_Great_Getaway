"""budget_deletes tombstones (per-row delta sync, Phase 1)

Revision ID: c3e5a7b9d1f0
Revises: b2d4f6a8c0e1
Create Date: 2026-06-03 20:30:00.000000

Sync-model Phase 1 (extends #3's category tombstones to budgets).

Budgets used a HARD delete with no tombstone, so an offline peer whose
outbox still held a queued `upsertBudget` would RESURRECT a budget that
another device had deleted (the next upsert re-INSERTs the row). This is
the same class of bug the category tombstones (b2d4f6a8c0e1) and the
expense/day soft-deletes already close — budgets were the outlier.

Budgets carry a TABLE-LEVEL `UNIQUE(user_id, trip_id, category_id,
owner_name)`, so an in-table `deleted_at` soft-delete (the expense/day
pattern) would leave a tombstoned row squatting the unique scope slot and
block re-creating a same-scope budget — and dropping a table-level
constraint in SQLite needs a full table rebuild. So budgets follow the
CATEGORY pattern instead: keep the hard delete (which frees the slot) and
record a separate tombstone row.

`budget_deletes` records (user_id, budget_id, deleted_at). delete_budget
writes a tombstone; upsert_budget refuses to re-create any id that carries
one (tombstone is terminal — budgets always get a fresh uuid on create,
so a legit re-create never reuses a tombstoned id). The tombstone also
becomes the deletion channel for the upcoming `?since=` incremental pull
(Phase 2), so a delete on one tab propagates to others once full-snapshot
pulls stop.

`deleted_at` is TEXT in the same `strftime('%Y-%m-%d %H:%M:%f')` shape as
`budgets.updated_at` so the Phase-2 delta can range over both with one
lexically-ordered cursor.

Additive + backward-compatible: the table is only written by the new
delete path and only read by the new upsert guard + the future delta, so
this is safe to deploy ahead of the server/client changes that use it.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c3e5a7b9d1f0'
down_revision: Union[str, Sequence[str], None] = 'b2d4f6a8c0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS budget_deletes (
            user_id TEXT NOT NULL,
            budget_id TEXT NOT NULL,
            deleted_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_id, budget_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS budget_deletes")
