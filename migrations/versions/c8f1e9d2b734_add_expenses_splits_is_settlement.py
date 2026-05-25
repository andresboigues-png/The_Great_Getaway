"""add splits + is_settlement columns to expenses (audit S1)

Revision ID: c8f1e9d2b734
Revises: a8b9c0d1e2f3
Create Date: 2026-05-25 14:00:00.000000

The frontend has always tracked two per-expense fields that the
schema never persisted:

  - `splits` — a JSON map `{ "name": pct }` describing how the
    expense is shared between trip members. Empty / null = equal
    share across the trip roster (legacy fallback).
  - `is_settlement` — a flag marking rows that exist purely to
    zero out a debt between two parties (Path-B fake-expense
    pattern from before the dedicated `settlements` table landed).

Without these columns the frontend kept them in memory only:
every `/api/data` refresh wiped them, and the next render took the
no-splits fallback (equal share across the whole roster) AND
counted legacy settlements as regular expenses. Net effect: every
uneven-split expense silently rounded to 50/50 on reload, and every
Path-B settlement double-counted the original debt.

This migration:
  1. Adds `splits TEXT` (JSON-shaped) and `is_settlement INTEGER
     NOT NULL DEFAULT 0` to `expenses`.
  2. Adds a CHECK(json_valid(splits) OR splits IS NULL) constraint
     via the `JSON1` extension, matching the §M1 pattern from
     a8b9c0d1e2f3.

The DEFAULT 0 on is_settlement means existing rows backfill
correctly without a separate UPDATE pass — pre-migration rows
were all "not settlements" anyway.

`splits` ships as NULL on existing rows; the frontend's no-splits
fallback handles that correctly (equal share). New writes will
carry the explicit map.

## Pre-flight: nothing — these are pure ADD COLUMN, no
   constraint-violation risk against existing data.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c8f1e9d2b734'
down_revision: Union[str, Sequence[str], None] = 'a8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add splits + is_settlement to expenses."""
    # ALTER TABLE ADD COLUMN with a NOT NULL constraint requires a
    # DEFAULT value at this point in SQLite — 0 is the right backfill
    # since pre-migration rows weren't settlements.
    op.execute("ALTER TABLE expenses ADD COLUMN splits TEXT")
    op.execute(
        "ALTER TABLE expenses ADD COLUMN is_settlement INTEGER NOT NULL DEFAULT 0"
    )

    # Match the §M1 pattern: enforce json_valid() on the splits blob.
    # SQLite can't add a CHECK constraint via ALTER TABLE, so we
    # rebuild the table. The rebuild preserves data + primary key +
    # foreign keys (CASCADE on trip_id).
    op.execute("PRAGMA foreign_keys=OFF")
    op.execute("""
        CREATE TABLE expenses_new (
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
        INSERT INTO expenses_new
        SELECT id, trip_id, who, category_id, label, date, country,
               value, currency, euro_value, receipt_url, splits, is_settlement
        FROM expenses
    """)
    op.execute("DROP TABLE expenses")
    op.execute("ALTER TABLE expenses_new RENAME TO expenses")
    op.execute("PRAGMA foreign_keys=ON")

    # Recreate any indexes that lived on expenses. There aren't any
    # custom ones in the codebase as of this revision (the only access
    # patterns are by-trip-id which uses the FK index, and by-user-id
    # which traverses via trips). If a future migration adds an index,
    # update this rebuild path.


def downgrade() -> None:
    """Drop splits + is_settlement columns by rebuilding without them."""
    op.execute("PRAGMA foreign_keys=OFF")
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
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        INSERT INTO expenses_old
        SELECT id, trip_id, who, category_id, label, date, country,
               value, currency, euro_value, receipt_url
        FROM expenses
    """)
    op.execute("DROP TABLE expenses")
    op.execute("ALTER TABLE expenses_old RENAME TO expenses")
    op.execute("PRAGMA foreign_keys=ON")
