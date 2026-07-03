"""feed_comments: add edited_at column

Revision ID: 1ac3d4e5f6a7
Revises: 19b2c3d4e5f6
Create Date: 2026-05-27 17:30:00.000000

R3-Round 2 audit finding: PATCH /api/feed/comments/<id> rewrites
`body` in place with no audit signal. A user reading the thread
later sees the latest version as if it had always been there —
opens a gaslighting / harassment-cover-up vector on a public
share. Add `edited_at` so the renderer can show "(edited)" next
to comments whose body has been changed.

Nullable so existing rows preserve their "never edited" state
(NULL = never edited).
"""

from collections.abc import Sequence

from alembic import op

revision: str = '1ac3d4e5f6a7'
down_revision: str | Sequence[str] | None = '19b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_exists(table: str, column: str) -> bool:
    """R4-B5: same idempotency guard as 1bd4e5f6a7b8 — a re-run of
    this migration must be a no-op, not a `duplicate column name`
    crash that leaves alembic_version stuck."""
    bind = op.get_bind()
    rows = bind.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def upgrade() -> None:
    if not _column_exists("feed_comments", "edited_at"):
        op.execute("ALTER TABLE feed_comments ADD COLUMN edited_at DATETIME")


def downgrade() -> None:
    if _column_exists("feed_comments", "edited_at"):
        op.execute("ALTER TABLE feed_comments DROP COLUMN edited_at")
