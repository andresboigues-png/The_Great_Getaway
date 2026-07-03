"""add auth_sessions table for per-device session revocation

Revision ID: 17b8c9d0e1f3
Revises: 06a7b8c9d0e2
Create Date: 2026-05-27 00:30:00.000000

Audit #A-4: pre-fix logout bumped the user's single `token_jti`
column, which invalidated EVERY device the user had ever signed
in on. Sign in on phone, sign in on laptop, then log out from
the laptop → the phone session dies too. There was no way to
revoke a single device.

Move to a per-session model:
  - `auth_sessions(id, user_id, jti, device_label, created_at,
    last_seen_at, revoked_at)`
  - issue_token inserts a new row + uses ITS jti
  - verify_token looks the jti up here; rejects if not found
    OR if `revoked_at IS NOT NULL`
  - logout revokes the CURRENT session only
  - new /api/auth/sessions endpoints let the user see + revoke
    individual devices

Backwards compat: legacy JWTs minted before this change carry a
jti that matches `users.token_jti` directly (no row in
auth_sessions). The verify path falls back to the legacy column
when no auth_sessions row matches AND the jti equals
users.token_jti — so existing-tab tokens keep working until they
naturally expire (30 days) or get revoked via the legacy
bump_user_jti path.
"""

from collections.abc import Sequence

from alembic import op

revision: str = '17b8c9d0e1f3'
down_revision: str | Sequence[str] | None = '06a7b8c9d0e2'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS auth_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            jti TEXT NOT NULL UNIQUE,
            device_label TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen_at DATETIME,
            revoked_at DATETIME DEFAULT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, revoked_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_auth_sessions_user")
    op.execute("DROP TABLE IF EXISTS auth_sessions")
