"""budgets half-scoped partial UNIQUE indexes (MK4 audit BUD-7)

Revision ID: a1f4c7e2b9d3
Revises: d4f6b8c0e2a1
Create Date: 2026-06-03 12:00:00.000000

The base UNIQUE(user_id, trip_id, category_id, owner_name) only fires when
ALL FOUR columns are non-NULL, because SQLite treats NULL as DISTINCT in a
UNIQUE constraint. Migration 3df6a8b0c2d4 added a partial UNIQUE index for
the all-NULL ("trip-wide, all categories, all people") shape, but the two
HALF-scoped shapes had NO DB-level dedupe at all:

  - (category set, owner_name NULL)  — e.g. "Rome → Food → everyone"
  - (owner_name set, category NULL)  — e.g. "Rome → all categories → Alice"

They relied entirely on the per-row POST /api/budgets app-level `IS`
pre-check. The MK4 audit (BUD-1) showed the legacy /api/sync budget loop
bypassed that pre-check and could duplicate all four shapes; even with the
sync loop now removed, leaning on a single write path for a money-integrity
invariant is fragile. Add a partial UNIQUE index for each half-scoped shape
so the DB enforces one-budget-per-scope regardless of write path.

Before each CREATE INDEX, dedupe any pre-existing duplicates of that exact
shape — keep the highest id per scope (roughly "most recently created",
since the frontend's generateId is time-derived) — otherwise the unique
index would fail to build on a DB that already carries the bug's
consequences.

Idempotency-guarded (CREATE UNIQUE INDEX IF NOT EXISTS) per R4-B5
convention.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'a1f4c7e2b9d3'
down_revision: str | Sequence[str] | None = 'd4f6b8c0e2a1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Shape A: (category set, owner_name NULL). Dedupe, keep MAX(id) per
    # (user_id, trip_id, category_id) — COALESCE(trip_id, '') so a NULL
    # trip groups uniformly ("all trips → Food → everyone").
    op.execute(
        """
        DELETE FROM budgets
        WHERE category_id IS NOT NULL AND owner_name IS NULL
          AND id NOT IN (
            SELECT MAX(id) FROM budgets
            WHERE category_id IS NOT NULL AND owner_name IS NULL
            GROUP BY user_id, COALESCE(trip_id, ''), category_id
          )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_budgets_user_trip_cat
        ON budgets(user_id, trip_id, category_id)
        WHERE category_id IS NOT NULL AND owner_name IS NULL
        """
    )

    # Shape B: (owner_name set, category_id NULL). Mirror of the above.
    op.execute(
        """
        DELETE FROM budgets
        WHERE owner_name IS NOT NULL AND category_id IS NULL
          AND id NOT IN (
            SELECT MAX(id) FROM budgets
            WHERE owner_name IS NOT NULL AND category_id IS NULL
            GROUP BY user_id, COALESCE(trip_id, ''), owner_name
          )
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_budgets_user_trip_owner
        ON budgets(user_id, trip_id, owner_name)
        WHERE owner_name IS NOT NULL AND category_id IS NULL
        """
    )


def downgrade() -> None:
    # Index drops only; the dedupe is not reversible (deleted rows were
    # duplicates by definition — no information loss beyond row count).
    op.execute("DROP INDEX IF EXISTS idx_budgets_user_trip_owner")
    op.execute("DROP INDEX IF EXISTS idx_budgets_user_trip_cat")
