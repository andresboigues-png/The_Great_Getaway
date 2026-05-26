"""add settlements.recorded_by for audit trail

Revision ID: f5a6b7c8d9e1
Revises: e4f5a6b8c9d0
Create Date: 2026-05-26 23:15:00.000000

Audit #D-6: any accepted member of a trip can record a settlement
"on behalf of" two OTHER members ("the four of us settled at
dinner; Andre handled it"). Pre-fix the row only carried
from_user_id + to_user_id — there was NO record of WHO actually
clicked save. A malicious planner could fabricate
"Bob paid Alice €1000" without either party's knowledge, and Bob
had no signal it was Charlie who wrote the row.

Add `recorded_by` (nullable, FK to users(id) ON DELETE SET NULL).
The create endpoint stamps it; the notification body includes the
recorder when they differ from the payer ("Charlie recorded that
Bob paid you €50 — confirm with them"). Existing rows get NULL
and are treated as recorder-unknown by the renderer.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f5a6b7c8d9e1'
down_revision: Union[str, Sequence[str], None] = 'e4f5a6b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TABLE ADD COLUMN with a FK reference isn't supported on
    # all SQLite versions — declare the column without the inline FK
    # here. The init_db CREATE TABLE on fresh DBs has the FK; existing
    # prod DBs get the column without FK enforcement, which is
    # acceptable because the value is only ever set to a valid
    # `current_user_id()` (already validated by require_auth) and
    # the column is read defensively.
    op.execute(
        "ALTER TABLE settlements ADD COLUMN recorded_by TEXT DEFAULT NULL"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE settlements DROP COLUMN recorded_by")
