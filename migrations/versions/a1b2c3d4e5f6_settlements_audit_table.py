"""add settlements_audit table for deletion repudiation trail

Revision ID: a1b2c3d4e5f6
Revises: 3df6a8b0c2d4
Create Date: 2026-05-29 15:00:00.000000

R12-B3 (security P1): close the settlement-deletion repudiation gap.

`recorded_by` (migration f5a6b7c8d9e1) gave us a CREATION audit —
who wrote a settlement. But DELETE FROM settlements is a HARD delete
and the only deletion record was an ephemeral stdout `logger.info`
that rotates off PA's disk. A planner-owner can silently revert a
member's settlement; the recipient gets a `settled_up_reverted`
notification but it names the original PAYER, not the deleter, so
the parties can't reconstruct WHO took the money back or WHEN.

Fix: an append-only `settlements_audit` table. Before each DELETE,
the route snapshots the full row + the actor (deleted_by) + a
timestamp into this table. No foreign keys — audit rows are
immutable historical facts that must survive even if the trip /
user / settlement they reference is later deleted (an FK CASCADE
would erase the very record we're keeping). IDs are stored as
opaque TEXT.

No read path changes — the settlements table reads exactly as
before; this is a write-side-only addition.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: str | Sequence[str] | None = '3df6a8b0c2d4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # CREATE TABLE IF NOT EXISTS so this is idempotent against a DB
    # where init_db already created the table on a fresh boot (the
    # CREATE also lives in database.py for fresh installs — same
    # dual-write belt-and-braces pattern as the indexes). No FKs:
    # audit rows are immutable, must outlive their referents.
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS settlements_audit (
            audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
            settlement_id TEXT NOT NULL,
            trip_id TEXT,
            from_user_id TEXT,
            to_user_id TEXT,
            from_name TEXT,
            to_name TEXT,
            amount REAL,
            currency TEXT,
            euro_value REAL,
            recorded_by TEXT,
            action TEXT NOT NULL DEFAULT 'deleted',
            actor_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # Index for the common audit lookups: "show me the deletion
    # history for this settlement" + "what did this user delete".
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_settlements_audit_settlement "
        "ON settlements_audit(settlement_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_settlements_audit_actor "
        "ON settlements_audit(actor_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_settlements_audit_actor")
    op.execute("DROP INDEX IF EXISTS idx_settlements_audit_settlement")
    op.execute("DROP TABLE IF EXISTS settlements_audit")
