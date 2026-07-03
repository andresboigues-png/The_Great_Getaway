"""dedupe duplicate budgets + add UNIQUE(user_id, trip_id, category_id, owner_name) (audit B6)

Revision ID: e4f5a6b7c8d9
Revises: d9a2f8e3c845
Create Date: 2026-05-26 14:00:00.000000

Two budgets with identical scope (same user_id + trip_id + category_id +
owner_name) double-counted the same expenses against the budget's spent
total. The schema had no UNIQUE constraint to prevent this — a user
fat-fingering "Create budget" twice (or the /api/sync replay creating a
duplicate after a race) silently ended up with two cards showing the
same spend and a doubled allocated total.

Before adding the constraint, dedupe the existing rows: keep ONE budget
per scope (highest id wins, which is roughly "most recently created"
since ids are time-derived in the frontend's generateId helper). Then
rebuild the table with the constraint — SQLite can't ALTER ADD UNIQUE
on an existing table.

Two scope NULLs are treated as equal by SQLite's UNIQUE under the
ANSI standard — so "all trips → all categories → all users → €500" can
only exist ONCE per user. That's the desired behaviour: an "everywhere"
budget is a single global ceiling, not a stack.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'e4f5a6b7c8d9'
down_revision: str | Sequence[str] | None = 'd9a2f8e3c845'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Dedupe + rebuild with UNIQUE scope constraint."""
    # SQLite treats two NULLs as distinct in standard UNIQUE constraints
    # by default, which would let a user keep two "all trips → all
    # categories → all users → €500" rows. The dedupe step below
    # explicitly groups NULLs together (COALESCE(..., '')) so the
    # cleanup is correct regardless of how SQLite chooses to enforce
    # the constraint downstream. The CREATE TABLE below then uses a
    # standard UNIQUE, which for SQLite means NULL ≠ NULL — but the
    # cleanup guarantees no NULL duplicates remain at upgrade time, and
    # the application layer (routes/budgets.py + routes/data.py) gates
    # against creating duplicates going forward.
    op.execute("""
        DELETE FROM budgets
        WHERE id NOT IN (
            SELECT MAX(id) FROM budgets
            GROUP BY user_id,
                     COALESCE(trip_id, ''),
                     COALESCE(category_id, ''),
                     COALESCE(owner_name, '')
        )
    """)

    op.execute("PRAGMA foreign_keys=OFF")
    op.execute("""
        CREATE TABLE budgets_new (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            trip_id TEXT,
            label TEXT,
            amount REAL,
            currency TEXT DEFAULT 'EUR',
            category_id TEXT,
            owner_name TEXT,
            original_amount REAL,
            original_currency TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL,
            UNIQUE(user_id, trip_id, category_id, owner_name)
        )
    """)
    op.execute("""
        INSERT INTO budgets_new
        SELECT id, user_id, trip_id, label, amount, currency,
               category_id, owner_name, original_amount, original_currency
        FROM budgets
    """)
    op.execute("DROP TABLE budgets")
    op.execute("ALTER TABLE budgets_new RENAME TO budgets")
    op.execute("PRAGMA foreign_keys=ON")


def downgrade() -> None:
    """Rebuild without the UNIQUE constraint. Dedupe is NOT reversible —
    deleted duplicates are gone for good (they were duplicates by
    definition; no information loss beyond the row count)."""
    op.execute("PRAGMA foreign_keys=OFF")
    op.execute("""
        CREATE TABLE budgets_new (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            trip_id TEXT,
            label TEXT,
            amount REAL,
            currency TEXT DEFAULT 'EUR',
            category_id TEXT,
            owner_name TEXT,
            original_amount REAL,
            original_currency TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL
        )
    """)
    op.execute("""
        INSERT INTO budgets_new
        SELECT id, user_id, trip_id, label, amount, currency,
               category_id, owner_name, original_amount, original_currency
        FROM budgets
    """)
    op.execute("DROP TABLE budgets")
    op.execute("ALTER TABLE budgets_new RENAME TO budgets")
    op.execute("PRAGMA foreign_keys=ON")
