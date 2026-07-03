"""add NOT NULL to trips.user_id (audit critical #5)

Revision ID: c5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-05-18 17:30:00.000000

`trips.user_id` is the anchor for every user-scoped query in the
codebase — every WHERE clause does `user_id = ?` — but the column
was declared as bare `TEXT` (no NOT NULL). A NULL row silently
disappears from every scoped read (it doesn't match `= ?` for any
value, and there's no FK violation because FK enforcement only
validates referential targets exist, not source nullability). The
data is still in the table; no one can see it, no one owns it.

Verified on the live PA DB 2026-05-18 — zero NULL rows — so the
NOT NULL backfill is a no-op for production. Migration is forward-
safe.

## Why a table rebuild

SQLite doesn't support `ALTER COLUMN ... SET NOT NULL`. The only
path is the same rename-create-copy-drop pattern that the FK
migration (`e1b8d2a3c4f5`) used. Foreign-key enforcement is
toggled OFF for the duration of the migration so cascades don't
fire on the rename — same posture as the FK migration.

The rebuild also re-creates every index that hangs off the trips
table:

  - `idx_trips_share_token` (UNIQUE partial on share_token)
  - `idx_trips_user`         (single-column, just added in c4d5e6f7a8b9)
  - `idx_trips_user_public`  (composite, just added in c4d5e6f7a8b9)

If a future column ships between this migration and a later
rebuild, both the CREATE TABLE block here AND init_db() must be
updated together.

## Schema

All other columns are unchanged from the post-c4d5e6f7a8b9 shape:
- id TEXT PRIMARY KEY
- user_id TEXT NOT NULL                          ← THE CHANGE
- name, country, country_code TEXT
- is_archived, is_public, public_show_expenses INT DEFAULT 0
- place_id TEXT
- lat, lng REAL
- viewport_json, place_types TEXT
- companions_json, marked_places_json, documents_json,
  photos_json, checklist_json, trip_countries_json TEXT
- cover_url TEXT
- actions_hidden INT DEFAULT 0
- share_token, share_views, share_show_cost, share_show_plans
- created_at DATETIME DEFAULT CURRENT_TIMESTAMP
- FOREIGN KEY(user_id) → users(id) ON DELETE CASCADE

## Downgrade

Not supported — reverting NOT NULL re-opens the silent-orphan
gate the migration just closed. Same forward-only posture as
e1b8d2a3c4f5. If a regression requires it, write a new forward
migration after auditing whether any NULL writes have shipped.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'c5e6f7a8b9c0'
down_revision: str | Sequence[str] | None = 'c4d5e6f7a8b9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TRIPS_COLUMNS = [
    "id", "user_id", "name", "country", "country_code",
    "is_archived", "is_public", "public_show_expenses",
    "place_id", "lat", "lng", "viewport_json", "place_types",
    "companions_json", "marked_places_json", "documents_json",
    "photos_json", "checklist_json", "trip_countries_json",
    "cover_url", "actions_hidden", "share_token", "share_views",
    "share_show_cost", "share_show_plans", "created_at",
]


def upgrade() -> None:
    # Pre-flight: refuse to run if any NULL `user_id` rows would
    # break the NOT NULL copy. Verified zero on prod 2026-05-18; this
    # check is a belt-and-braces guard for future restore-from-backup
    # scenarios where the live data shape may not match the snapshot
    # we audited.
    conn = op.get_bind()
    null_count = conn.exec_driver_sql(
        "SELECT COUNT(*) FROM trips WHERE user_id IS NULL"
    ).scalar()
    if null_count:
        raise RuntimeError(
            f"Refusing to migrate: {null_count} trips have NULL user_id. "
            "Resolve those rows (delete or backfill) before running this "
            "migration. They cannot exist with the post-migration NOT NULL "
            "constraint."
        )

    # ── trips rebuild ───────────────────────────────────────────────
    op.execute("ALTER TABLE trips RENAME TO _old_trips")
    op.execute(
        """
        CREATE TABLE trips (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT,
            country TEXT,
            country_code TEXT,
            is_archived INTEGER DEFAULT 0,
            is_public INTEGER DEFAULT 0,
            public_show_expenses INTEGER DEFAULT 0,
            place_id TEXT,
            lat REAL,
            lng REAL,
            viewport_json TEXT,
            place_types TEXT,
            companions_json TEXT,
            marked_places_json TEXT,
            documents_json TEXT,
            photos_json TEXT,
            checklist_json TEXT,
            trip_countries_json TEXT,
            cover_url TEXT,
            actions_hidden INTEGER DEFAULT 0,
            share_token TEXT,
            share_views INTEGER DEFAULT 0,
            share_show_cost INTEGER DEFAULT 0,
            share_show_plans INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cols = ", ".join(_TRIPS_COLUMNS)
    op.execute(
        f"INSERT INTO trips ({cols}) SELECT {cols} FROM _old_trips"
    )
    op.execute("DROP TABLE _old_trips")

    # ── re-create every index that hung off trips ──────────────────
    # Dropping the table dropped its indexes; restore each one.
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share_token "
        "ON trips(share_token) WHERE share_token IS NOT NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_trips_user_public "
        "ON trips(user_id, is_public)"
    )


def downgrade() -> None:
    raise NotImplementedError(
        "Reverting NOT NULL on trips.user_id would re-open the silent-"
        "orphan gate this migration closed. Roll forward instead."
    )
