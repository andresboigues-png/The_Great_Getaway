"""snapshot from_name + to_name on settlements (audit S1 + S6)

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-05-26 16:30:00.000000

Path-A (server-backed) settlements store `from_user_id` and
`to_user_id`. The balance math then resolves those ids back to
companion names at read time via `findTripCompanionByLinkedUser()`.
If either party is unlinked from the trip after the settlement is
recorded (companion removed, linkedUserId nulled), the name lookup
silently returns undefined and the settlement is skipped entirely —
the row exists in the DB but doesn't affect balances. From the
user's perspective the debt persists even though the payment was
recorded.

Fix: snapshot the party display names at settlement-record time so
the balance math doesn't depend on live companion state. Resolution
priority on read:

  1. `from_name` / `to_name` (if present — snapshotted)
  2. fallback to live `findTripCompanionByLinkedUser()` (legacy
     rows from before this migration)
  3. fallback to the user's display `name` from the users table
  4. skip (current behaviour) if all three miss

Schema additions: `from_name TEXT`, `to_name TEXT` — both nullable
so legacy rows don't violate any constraints. Backfill from the
users table at upgrade time so existing settlements pick up names
immediately (subject to the user.name being still set — if the
user account was deleted entirely, the FK CASCADE already nuked
the settlement row, so we don't have to worry about that case).
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'a6b7c8d9e0f1'
down_revision: str | Sequence[str] | None = 'f5a6b7c8d9e0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add from_name + to_name columns + backfill existing rows."""
    op.execute("ALTER TABLE settlements ADD COLUMN from_name TEXT")
    op.execute("ALTER TABLE settlements ADD COLUMN to_name TEXT")
    # Backfill from the users table. If the user account is gone the
    # FK CASCADE already removed the settlement row, so a JOIN is
    # safe — every remaining settlement has a referencable user.
    op.execute("""
        UPDATE settlements
        SET from_name = (
            SELECT name FROM users WHERE id = settlements.from_user_id
        )
        WHERE from_name IS NULL
    """)
    op.execute("""
        UPDATE settlements
        SET to_name = (
            SELECT name FROM users WHERE id = settlements.to_user_id
        )
        WHERE to_name IS NULL
    """)


def downgrade() -> None:
    """Rebuild the table without the two columns."""
    op.execute("PRAGMA foreign_keys=OFF")
    op.execute("""
        CREATE TABLE settlements_old (
            id TEXT PRIMARY KEY,
            trip_id TEXT NOT NULL,
            from_user_id TEXT NOT NULL,
            to_user_id TEXT NOT NULL,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            euro_value REAL,
            method TEXT,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
            FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        INSERT INTO settlements_old
        SELECT id, trip_id, from_user_id, to_user_id, amount, currency,
               euro_value, method, note, created_at
        FROM settlements
    """)
    op.execute("DROP TABLE settlements")
    op.execute("ALTER TABLE settlements_old RENAME TO settlements")
    op.execute("PRAGMA foreign_keys=ON")
