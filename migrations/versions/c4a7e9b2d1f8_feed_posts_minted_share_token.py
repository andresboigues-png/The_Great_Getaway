"""add minted_share_token to feed_posts (MK6 P2 unshare-token privacy)

Revision ID: c4a7e9b2d1f8
Revises: a3f1c9d27e84
Create Date: 2026-07-02 20:00:00.000000

MK6 audit be-social#21 fix.

share_trip_to_feed auto-mints a trips.share_token when an owner shares a
PRIVATE trip to the feed (so it surfaces in Explore). unshare_feed_post
restored is_public=0 but LEFT the token live — so anyone who captured the
token from Explore during the shared window kept permanent read + clone
access to the re-privatised trip via /api/share/<token>.

The fix nulls that token on unshare — but ONLY when the feed-share is what
minted it, never an owner's EXPLICIT share link. This column records, per
original share, whether that share minted the token (rowcount of the
`WHERE share_token IS NULL` mint). create_share_link clears it for the
trip (the token is now owner-managed), so a later unshare can't destroy an
explicit link.

Additive, DEFAULT 0: legacy rows read as "did not mint" (safe — we never
null a token we can't prove we minted). Mirrored in database.py init_db for
fresh installs.
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'c4a7e9b2d1f8'
down_revision: str | Sequence[str] | None = 'a3f1c9d27e84'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Idempotent: fresh installs get the column from init_db's CREATE TABLE;
    # a re-run (or a partially-migrated DB) must not error.
    conn = op.get_bind()
    cols = [r[1] for r in conn.exec_driver_sql("PRAGMA table_info(feed_posts)").fetchall()]
    if "minted_share_token" not in cols:
        op.execute("ALTER TABLE feed_posts ADD COLUMN minted_share_token INTEGER DEFAULT 0")


def downgrade() -> None:
    # SQLite pre-3.35 can't DROP COLUMN and a table rebuild is risky for a
    # nullable/additive flag — leave it in place (harmless; app stops using it).
    pass
