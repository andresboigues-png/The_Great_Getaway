"""add categoryId / user / originalAmount / originalCurrency to budgets (audit B1)

Revision ID: d9a2f8e3c845
Revises: c8f1e9d2b734
Create Date: 2026-05-25 14:30:00.000000

The frontend creates richer budgets than the schema persisted. The
existing columns were:

  budgets(id, user_id, trip_id, label, amount, currency)

…but the create / edit form lets the user pick:

  - `categoryId` — restrict the spend-against-target sum to a
    specific category (Food, Transport, etc.).
  - `user` — restrict to a specific companion's spend.
  - `originalAmount` + `originalCurrency` — the value the user
    actually typed before currency conversion, so the "was $500
    USD" subtitle on the budget card can render after the
    canonical `amount` is converted to EUR for cross-trip math.

Without these columns, every reload silently turned a focused
"Lisbon → Food → Sara → €500" budget into a generic "Lisbon →
all categories → everyone → €500" — at which point the
spend-against-target sum aggregated ALL expenses on the trip, so
the budget card showed catastrophic overspend.

This migration adds the 4 missing columns. `category_id` and
`owner_name` (the snake_case form of the frontend's `user`) ship
as NULL on existing rows — the no-filter case is the right legacy
backfill. `original_amount` defaults to whatever `amount` holds
and `original_currency` to `currency`, so the "was X" subtitle
keeps rendering correctly after this lands (no separate UPDATE
pass required at the per-row layer — the COALESCE in the read
path covers it).
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'd9a2f8e3c845'
down_revision: str | Sequence[str] | None = 'c8f1e9d2b734'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add 4 missing filter columns to budgets."""
    op.execute("ALTER TABLE budgets ADD COLUMN category_id TEXT")
    op.execute("ALTER TABLE budgets ADD COLUMN owner_name TEXT")
    op.execute("ALTER TABLE budgets ADD COLUMN original_amount REAL")
    op.execute("ALTER TABLE budgets ADD COLUMN original_currency TEXT")
    # Backfill: existing budgets pre-this-migration have `amount` already
    # in their original currency (no conversion was happening), so seed
    # original_amount = amount and original_currency = currency. After
    # the frontend starts shipping the actual original values, new rows
    # will carry the user's typed amount before conversion.
    op.execute("UPDATE budgets SET original_amount = amount WHERE original_amount IS NULL")
    op.execute("UPDATE budgets SET original_currency = currency WHERE original_currency IS NULL")


def downgrade() -> None:
    """Drop the 4 added columns by rebuilding the table."""
    op.execute("PRAGMA foreign_keys=OFF")
    op.execute("""
        CREATE TABLE budgets_old (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            trip_id TEXT,
            label TEXT,
            amount REAL,
            currency TEXT DEFAULT 'EUR',
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL
        )
    """)
    op.execute("""
        INSERT INTO budgets_old
        SELECT id, user_id, trip_id, label, amount, currency
        FROM budgets
    """)
    op.execute("DROP TABLE budgets")
    op.execute("ALTER TABLE budgets_old RENAME TO budgets")
    op.execute("PRAGMA foreign_keys=ON")
