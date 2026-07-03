"""settlements: change party FKs from CASCADE to SET NULL

Revision ID: 19b2c3d4e5f6
Revises: 18a1b2c3d4e5
Create Date: 2026-05-27 14:30:00.000000

R3-Fix #5. Pre-fix settlements.from_user_id and to_user_id were
declared with ON DELETE CASCADE. When Bruno deleted his account,
every "Ana paid Bruno €50" row on Ana's OWN trip was CASCADE-deleted.
Bruno's row in the trip's `companions_json` snapshot survives, so
Ana's balance page re-shows her owing €50 to "Bruno" — debt resurrected
silently because the settlement that paid it is gone.

The right semantic: when a party deletes their account, NULL out the
FK but keep the row. The `from_name` / `to_name` columns added in
a6b7c8d9e0f1 already snapshot the display name at settlement time,
so balance math at `balances.ts:78-89` reads them by name regardless
of whether user_id is still resolvable.

trip_id stays CASCADE — settlements ARE trip-scoped, deleting the
trip should delete its settlements. recorded_by was already SET NULL
(f5a6b7c8d9e1).

SQLite can't ALTER a column's FK in place — this is a table-recreate.
"""

from collections.abc import Sequence

from alembic import op

revision: str = '19b2c3d4e5f6'
down_revision: str | Sequence[str] | None = '18a1b2c3d4e5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Disable FK enforcement during the swap; otherwise the temp
    # rename + INSERT cycle trips the cascade we're trying to change.
    op.execute("PRAGMA foreign_keys = OFF")

    # Build the replacement table with the new FK actions.
    op.execute(
        """
        CREATE TABLE settlements_new (
            id TEXT PRIMARY KEY,
            trip_id TEXT NOT NULL,
            from_user_id TEXT,
            to_user_id TEXT,
            from_name TEXT,
            to_name TEXT,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            euro_value REAL,
            method TEXT,
            note TEXT,
            recorded_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
            FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY(recorded_by) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )

    # Copy every row across with the same column values.
    op.execute(
        """
        INSERT INTO settlements_new (
            id, trip_id, from_user_id, to_user_id, from_name, to_name,
            amount, currency, euro_value, method, note, recorded_by,
            created_at
        )
        SELECT
            id, trip_id, from_user_id, to_user_id, from_name, to_name,
            amount, currency, euro_value, method, note, recorded_by,
            created_at
        FROM settlements
        """
    )

    # Swap.
    op.execute("DROP TABLE settlements")
    op.execute("ALTER TABLE settlements_new RENAME TO settlements")

    # Re-create the index that lived on the original table.
    op.execute("CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id)")

    op.execute("PRAGMA foreign_keys = ON")


def downgrade() -> None:
    # Symmetric swap back to CASCADE on the party FKs. Not strictly
    # reversible if any rows were written with NULL user_ids in the
    # interim — those would re-fail the CASCADE FK because the
    # NULL doesn't reference anything. Treating that as a one-way
    # migration: any NULL user_ids stay NULL post-downgrade (the
    # CASCADE FK accepts NULL fine, it just won't cascade-delete
    # them on future user-row deletes).
    op.execute("PRAGMA foreign_keys = OFF")
    op.execute(
        """
        CREATE TABLE settlements_old (
            id TEXT PRIMARY KEY,
            trip_id TEXT NOT NULL,
            from_user_id TEXT NOT NULL,
            to_user_id TEXT NOT NULL,
            from_name TEXT,
            to_name TEXT,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            euro_value REAL,
            method TEXT,
            note TEXT,
            recorded_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
            FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(recorded_by) REFERENCES users(id) ON DELETE SET NULL
        )
        """
    )
    op.execute(
        """
        INSERT INTO settlements_old SELECT * FROM settlements
        WHERE from_user_id IS NOT NULL AND to_user_id IS NOT NULL
        """
    )
    op.execute("DROP TABLE settlements")
    op.execute("ALTER TABLE settlements_old RENAME TO settlements")
    op.execute("CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id)")
    op.execute("PRAGMA foreign_keys = ON")
