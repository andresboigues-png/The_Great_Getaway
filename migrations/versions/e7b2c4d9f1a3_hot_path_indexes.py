"""hot-path indexes: trip_members(user_id) + serve_upload scan columns

Revision ID: e7b2c4d9f1a3
Revises: c4a7e9b2d1f8
Create Date: 2026-07-04 12:00:00.000000

MK1 Wave E (T2-5 / DATA-2, `Best-in-class audit MK1.md`).

1. idx_trip_members_user — trip_members(user_id).
   The existing idx_trip_members_trip_user leads on trip_id, so every
   query that filters by USER alone walks the whole table: the /api/data
   poll's editable/writable-set batching (helpers.batch_*_trip_ids), the
   achievements sweep, and the membership arm of the /api/data UNION.
   Those run on every 15s poll for every user.

2. idx_expenses_receipt_url (partial, receipt_url IS NOT NULL) and
3. idx_trips_cover_url (partial, cover_url IS NOT NULL).
   serve_upload's ACL fallbacks exact-match these columns on EVERY
   image request a non-owner member makes (receipts) and every
   anonymous share/Explore cover render — both were full scans. The
   partial form keeps the index tiny (most rows have NULL there).

Idempotent (IF NOT EXISTS) and mirrored in database.py init_db for
fresh installs, per the schema-lockstep rule.
"""

from collections.abc import Sequence

from alembic import op

revision: str = 'e7b2c4d9f1a3'
down_revision: str | Sequence[str] | None = 'c4a7e9b2d1f8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_expenses_receipt_url "
    "ON expenses(receipt_url) WHERE receipt_url IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_trips_cover_url "
    "ON trips(cover_url) WHERE cover_url IS NOT NULL",
)


def upgrade() -> None:
    conn = op.get_bind()
    for stmt in _INDEXES:
        conn.exec_driver_sql(stmt)


def downgrade() -> None:
    conn = op.get_bind()
    for name in ("idx_trip_members_user", "idx_expenses_receipt_url", "idx_trips_cover_url"):
        conn.exec_driver_sql(f"DROP INDEX IF EXISTS {name}")
