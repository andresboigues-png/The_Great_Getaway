"""categories.updated_at + category_deletes tombstones (per-row delta sync)

Revision ID: b2d4f6a8c0e1
Revises: d0e1f2a3b4c5
Create Date: 2026-06-03 16:45:00.000000

#3 (sync reconciliation): migrate categories off the bulk DELETE+reinsert
to a per-row delta protocol with timestamp last-write-wins reconciliation,
closing the multi-tab wholesale-clobber hazard (two tabs editing categories
near-simultaneously used to lose one tab's changes wholesale).

Two ADDITIVE, backward-compatible changes:

1. `categories.updated_at` (INTEGER epoch-ms, default 0) — the per-row
   version stamp. Set by the client on every add/edit; the server only
   applies an incoming upsert when its `updated_at` is >= the stored row's,
   so the newer write wins deterministically regardless of tab/request order.
   Existing rows backfill to 0 ("oldest"), so the first real client write to
   any legacy row always wins (correct — there's no competing newer stamp).

2. `category_deletes` tombstone table — records (user_id, category_id,
   deleted_at). A delete writes a tombstone; a stale tab that still holds the
   category and later upserts it is refused resurrection when its `updated_at`
   predates the tombstone's `deleted_at`. Without tombstones, per-row upsert
   sync can't distinguish "I deleted X" from "I never knew about X", so a
   stale full-list would resurrect deleted rows.

Both are additive — the existing bulk path keeps working (it ignores
updated_at and writes no tombstones), so this migration is safe to deploy
ahead of the server/client changes that use them.
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b2d4f6a8c0e1'
down_revision: Union[str, Sequence[str], None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE categories ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS category_deletes (
            user_id TEXT NOT NULL,
            category_id TEXT NOT NULL,
            deleted_at INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, category_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS category_deletes")
    op.execute("ALTER TABLE categories DROP COLUMN updated_at")
