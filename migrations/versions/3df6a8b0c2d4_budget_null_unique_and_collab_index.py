"""budgets NULL-UNIQUE + trip_collaborators(user_id) index

Revision ID: 3df6a8b0c2d4
Revises: 2ce5f7a9b1c3
Create Date: 2026-05-28 12:00:00.000000

R9-B2 fixes two distinct schema issues:

  H2 — budgets UNIQUE(user_id, trip_id, category_id, owner_name)
  cannot prevent duplicate "generic" trip budgets because SQLite
  treats NULL != NULL for UNIQUE constraints. The single most
  common shape (trip-wide, all-categories, all-people — both
  nullable cols NULL) can be duplicated freely, causing phantom
  overspend warnings when the same €500 trip budget appears
  twice and spend-against-target double-counts.

  Fix: add a partial UNIQUE INDEX scoped to the all-NULL case so
  that specific shape is deduplicated, while leaving the original
  UNIQUE constraint to cover the partially-filled cases (where
  NULL semantics are less ambiguous because at least one of the
  filter cols carries a real value).

  M1 — trip_collaborators has only PRIMARY KEY(trip_id, user_id).
  The /api/data join filters `WHERE c.user_id = ?` — leading PK
  column is trip_id, so SQLite cannot use the PK index for that
  predicate and full-scans the table on every /api/data poll
  (every 15s per active tab). Today's table is tiny so it's fast,
  but legacy accounts with thousands of trip_collaborators rows
  add ms per poll. Cheap to fix: add a secondary index on user_id.

Idempotency-guarded per R4-B5 convention (CREATE INDEX IF NOT EXISTS
already covers the partial-UNIQUE case; we just bail safely on
re-run).
"""

from collections.abc import Sequence

from alembic import op

revision: str = '3df6a8b0c2d4'
down_revision: str | Sequence[str] | None = '2ce5f7a9b1c3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # H2: partial UNIQUE INDEX for the all-NULL filter shape. Before
    # creating the index, sweep any pre-existing dupes — keep the
    # row with the smallest id, drop the rest. Without this the
    # CREATE INDEX would fail on a DB that already has the bug's
    # consequences (two phantom budgets for the same user+trip).
    op.execute(
        """
        DELETE FROM budgets
        WHERE id NOT IN (
            SELECT MIN(id) FROM budgets
            WHERE category_id IS NULL AND owner_name IS NULL
            GROUP BY user_id, trip_id
        )
        AND category_id IS NULL
        AND owner_name IS NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_budgets_user_trip_generic
        ON budgets(user_id, trip_id)
        WHERE category_id IS NULL AND owner_name IS NULL
        """
    )

    # M1: secondary index on trip_collaborators.user_id.
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS
        idx_trip_collaborators_user
        ON trip_collaborators(user_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_trip_collaborators_user")
    op.execute("DROP INDEX IF EXISTS idx_budgets_user_trip_generic")
