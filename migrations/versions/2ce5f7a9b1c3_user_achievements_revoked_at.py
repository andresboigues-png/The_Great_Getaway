"""user_achievements: add revoked_at column for soft-revoke

Revision ID: 2ce5f7a9b1c3
Revises: 1bd4e5f6a7b8
Create Date: 2026-05-28 00:00:00.000000

R5-B3 fix: pre-fix `check_user_achievements` DELETEd a revoked
badge then re-INSERTed when the rule passed again — so every
flip cycle (archive → un-archive → archive) re-fired the
`achievement_unlocked` notification AND the matching feed event
spam fired to followers. A mischievous or fidgety user could
trivially generate dozens of "you unlocked Long Hauler" rows
just by archive-toggling.

Soft-revoke fixes it: instead of DELETE, the engine UPDATEs
`revoked_at = strftime('now')` and the row stays in place. A
re-earn UPDATEs `revoked_at = NULL` + refreshes `context_json`
silently (no notification, no feed event — the user "ever earned"
this badge once). list_user_achievements filters `revoked_at IS
NULL` so revoked badges don't render on the profile.

Idempotency-guarded ADD/DROP per R4-B5 convention.
"""

from collections.abc import Sequence

from alembic import op

revision: str = '2ce5f7a9b1c3'
down_revision: str | Sequence[str] | None = '1bd4e5f6a7b8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    rows = bind.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def upgrade() -> None:
    if not _column_exists("user_achievements", "revoked_at"):
        op.execute("ALTER TABLE user_achievements ADD COLUMN revoked_at DATETIME")
    # Backfill: every existing row is "active" (never revoked) — NULL
    # is already the default, so nothing to do.


def downgrade() -> None:
    if _column_exists("user_achievements", "revoked_at"):
        op.execute("ALTER TABLE user_achievements DROP COLUMN revoked_at")
