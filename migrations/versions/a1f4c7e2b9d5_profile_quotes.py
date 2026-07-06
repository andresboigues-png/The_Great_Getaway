"""profile_quotes table — user-curated quotes left on a profile

Revision ID: a1f4c7e2b9d5
Revises: e7b2c4d9f1a3
Create Date: 2026-07-07 00:00:00.000000

Other users leave short quotes on a profile (author_id) about its owner
(profile_owner_id). New quotes are hidden (is_visible=0); the owner
curates which become publicly visible. Mirrors the CREATE in
database.py so a fresh boot and a migrated DB converge.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "a1f4c7e2b9d5"
down_revision: str | Sequence[str] | None = "e7b2c4d9f1a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.exec_driver_sql(
        """
        CREATE TABLE IF NOT EXISTS profile_quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_owner_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            content TEXT NOT NULL,
            is_visible INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_owner_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
            CHECK (profile_owner_id != author_id)
        )
        """
    )
    conn.exec_driver_sql(
        "CREATE INDEX IF NOT EXISTS idx_profile_quotes_owner ON profile_quotes(profile_owner_id)"
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.exec_driver_sql("DROP TABLE IF EXISTS profile_quotes")
