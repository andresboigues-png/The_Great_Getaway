"""soft-delete tombstones for expenses + trip_days (audit SY5)

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-05-26 17:30:00.000000

The mega audit's SY5 finding:

  > Expense upsert resurrects deleted expense from offline queue.
  > User A deletes Expense E. User B (offline) syncs queued state
  > which still has E. ON CONFLICT(id) UPDATE on the server
  > resurrects E on the trip — A's delete is silently undone.

Same shape applies to trip_days (delete a day, second device's
queued state re-inserts it via the same upsert pattern).

Fix: replace the hard `DELETE FROM expenses WHERE id = ?` (and
the trip_days equivalent) with a soft-delete that stamps a
`deleted_at` timestamp on the row. The /api/data read filters out
tombstoned rows so clients never see them. The upsert paths add
`WHERE deleted_at IS NULL` to the ON CONFLICT UPDATE clause so a
queued resurrection no-ops on the server (the existing tombstoned
row is left alone instead of being overwritten with stale data).

Why two columns, not a separate "tombstones" table:
  - Resurrection-protection needs the conflict gate to see the
    existing row's deleted_at INSIDE the same upsert statement.
    A separate table means a pre-INSERT existence check, which
    races against concurrent inserts.
  - Tombstones are sparse (most rows aren't deleted) so the
    storage cost is negligible (NULL column, no rowid overhead).
  - The /api/data SELECT can filter with `WHERE deleted_at IS
    NULL` as a single AND clause — no JOIN.

Cleanup is intentionally NOT wired here. Tombstones accumulate
forever for now; if a /admin tool needs to reclaim space later
we add a scheduled `DELETE WHERE deleted_at < NOW - 30d` job.
SQLite's `VACUUM` after that would re-pack pages.

Settlements are NOT covered by this migration. Their write/read
path is server-only (no client offline queue, no `/api/sync`
upsert), so the resurrection bug doesn't apply — a deleted
settlement stays deleted because no client can resurrect it.
The /api/data pull just stops surfacing it, the next refresh on
each device drops the row from local state.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add deleted_at TEXT to expenses + trip_days."""
    op.execute("ALTER TABLE expenses ADD COLUMN deleted_at TEXT")
    op.execute("ALTER TABLE trip_days ADD COLUMN deleted_at TEXT")

    # Indexes biased toward the hot /api/data read path: most rows
    # are NOT tombstoned, so a partial index on `WHERE deleted_at
    # IS NOT NULL` keeps the index small AND lets the cleanup job
    # (future) target tombstones in O(tombstone_count) rather than
    # O(table_size).
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_expenses_deleted "
        "ON expenses(deleted_at) WHERE deleted_at IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_trip_days_deleted "
        "ON trip_days(deleted_at) WHERE deleted_at IS NOT NULL"
    )


def downgrade() -> None:
    """Drop the tombstone columns + indexes.

    SQLite < 3.35 doesn't support DROP COLUMN, so we rebuild the
    tables sans deleted_at. Indexes drop via the table rebuild.
    Stays in dependency order so the FKs reattach cleanly.
    """
    op.execute("PRAGMA foreign_keys=OFF")

    # ── expenses rollback ──
    op.execute("""
        CREATE TABLE expenses_old (
            id TEXT PRIMARY KEY,
            trip_id TEXT,
            who TEXT,
            category_id TEXT,
            label TEXT,
            date TEXT,
            country TEXT,
            value REAL,
            currency TEXT,
            euro_value REAL,
            receipt_url TEXT,
            splits TEXT CHECK(splits IS NULL OR json_valid(splits)),
            is_settlement INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        INSERT INTO expenses_old
        SELECT id, trip_id, who, category_id, label, date, country,
               value, currency, euro_value, receipt_url, splits,
               is_settlement
        FROM expenses
        WHERE deleted_at IS NULL
    """)
    op.execute("DROP TABLE expenses")
    op.execute("ALTER TABLE expenses_old RENAME TO expenses")
    # Recreate the original index from f9a3b7e1c842_catchup_post_baseline.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_expenses_trip "
        "ON expenses(trip_id)"
    )

    # ── trip_days rollback ──
    op.execute("""
        CREATE TABLE trip_days_old (
            id TEXT PRIMARY KEY,
            trip_id TEXT,
            day_number INTEGER,
            date TEXT,
            name TEXT,
            morning TEXT,
            afternoon TEXT,
            evening TEXT,
            notes TEXT,
            photos TEXT,
            documents TEXT,
            tip TEXT,
            lat REAL,
            lng REAL,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        INSERT INTO trip_days_old
        SELECT id, trip_id, day_number, date, name, morning,
               afternoon, evening, notes, photos, documents, tip,
               lat, lng
        FROM trip_days
        WHERE deleted_at IS NULL
    """)
    op.execute("DROP TABLE trip_days")
    op.execute("ALTER TABLE trip_days_old RENAME TO trip_days")

    op.execute("PRAGMA foreign_keys=ON")
