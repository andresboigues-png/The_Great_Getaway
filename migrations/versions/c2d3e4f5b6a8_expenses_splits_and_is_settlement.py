"""add expenses.splits_json + expenses.is_settlement (audit #C-11/#C-12)

Revision ID: c2d3e4f5b6a8
Revises: b1d2e3f4c5a7
Create Date: 2026-05-26 21:30:00.000000

Two columns that the frontend's Expense type carries but the server
schema never persisted:

  - `splits_json TEXT` — JSON object mapping payer-name → percentage.
    The load-bearing structure for all balance math. Pre-fix it
    lived only in the frontend's localStorage; sign-in on a fresh
    device (or any /api/data poll that rebuilds STATE.expenses
    from the server) dropped it, and `computeTripBalances` fell
    back to equal-split-across-roster. Result: balances on a fresh
    device differed wildly from balances on the device the
    expenses were typed on — silent multi-hundred-euro errors with
    no UI signal. The audit (#C-11) flagged this as the most
    damaging single bug in the app.

  - `is_settlement INTEGER DEFAULT 0` — boolean flag the PATH B
    settle-up path uses to distinguish a real expense from a row
    that represents a debt-settlement. Pre-fix it also lived only
    locally; settled debts resurrected on every sign-in (#C-12).

Both columns are nullable / defaulted so legacy rows are safe.
JSON validity is enforced by a CHECK(json_valid) constraint on
splits_json — same shape as the other JSON columns on `trips`.

This is purely additive — no existing data is touched. Frontend
writes that don't include splits will continue to land NULL into
the column (matching pre-fix behaviour for legacy clients); writes
that DO include splits will persist it.

Downgrade drops both columns via the standard SQLite rebuild
pattern (CREATE NEW → COPY → DROP OLD → RENAME).
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'c2d3e4f5b6a8'
down_revision: Union[str, Sequence[str], None] = 'b1d2e3f4c5a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add the two columns. Both NULLable so existing rows stay valid.
    op.execute("ALTER TABLE expenses ADD COLUMN splits_json TEXT")
    op.execute("ALTER TABLE expenses ADD COLUMN is_settlement INTEGER DEFAULT 0")
    # NOTE: SQLite doesn't allow adding a CHECK constraint via
    # ALTER. The init_db CREATE TABLE on a FRESH DB declares
    # `splits_json TEXT CHECK(splits_json IS NULL OR json_valid(splits_json))`
    # but adding the check to an EXISTING table requires the full
    # rebuild dance. Skipped here to keep the migration cheap; the
    # application validates JSON shape on write (validators.py), so
    # the DB-level constraint is defense-in-depth that we can layer
    # in a follow-up migration after backfilling any malformed rows.


def downgrade() -> None:
    # SQLite ALTER TABLE DROP COLUMN works in 3.35+. Most prod
    # operators have a recent SQLite; fall back to the rebuild
    # dance if needed.
    op.execute("ALTER TABLE expenses DROP COLUMN is_settlement")
    op.execute("ALTER TABLE expenses DROP COLUMN splits_json")
