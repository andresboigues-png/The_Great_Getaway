"""enforce UNIQUE(trip_id, day_number) on trip_days

Revision ID: b1d2e3f4c5a7
Revises: a9c0d1e2f3b4
Create Date: 2026-05-26 20:00:00.000000

Pre-fix, the `trip_days` table had no UNIQUE constraint on
`(trip_id, day_number)`. Two parallel POSTs `/api/days` with the
same `dayNumber` both succeeded — the frontend had band-aid dedup
on the read side (api.ts:283-310) but the underlying race wasn't
prevented.

The audit flagged this as CRITICAL (#22) because:
  - Multi-planner trips can race day creation; both writes win;
    the trip then has two "Day 5" cards.
  - The `ensureDayZero` frontend fixer creates a Day 0 anchor on
    every poll; multiple browser tabs can race the same insert.
  - Renumber-after-delete is local-only and can also race.

Strategy:
  1. Pre-clean any duplicates that may exist in prod. For each
     (trip_id, day_number) collision, we keep the row with the
     LOWEST `id` (stable, deterministic across runs) and DELETE
     the rest.
  2. Add a UNIQUE INDEX so future races collide at the DB layer
     and the application can either retry or fail loudly instead
     of silently growing duplicates.

Trade-offs:
  - The pre-clean is a destructive op. We pick lowest-id because
    it's the most predictable; in practice we don't have a
    business rule for "which dup to keep" so any deterministic
    choice is acceptable. The frontend dedup logic (api.ts) was
    already willing to drop duplicates blindly, so this matches
    that behavior.
  - We use a regular (non-partial) UNIQUE index so even
    NULL trip_id (which shouldn't happen, but isn't blocked
    today) coexists per SQLite's "NULLs distinct" semantic.
  - SQLite's UNIQUE on (trip_id, day_number) WHERE day_number IS
    NOT NULL would be slightly more lenient but the application
    expects day_number to always be set; if it isn't, that's a
    separate bug to fix.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b1d2e3f4c5a7'
down_revision: Union[str, Sequence[str], None] = 'a9c0d1e2f3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Pre-clean any (trip_id, day_number) duplicates. Keep the row
    # with the lowest id; delete the rest. Idempotent — if there
    # are no dups, this is a no-op.
    op.execute(
        """
        DELETE FROM trip_days
        WHERE id NOT IN (
            SELECT MIN(id) FROM trip_days
            WHERE trip_id IS NOT NULL AND day_number IS NOT NULL
            GROUP BY trip_id, day_number
        )
          AND trip_id IS NOT NULL
          AND day_number IS NOT NULL
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_days_trip_day_number "
        "ON trip_days(trip_id, day_number) "
        "WHERE trip_id IS NOT NULL AND day_number IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_trip_days_trip_day_number")
