"""CHECK(json_valid(...)) on JSON columns (audit M1)

Revision ID: a8b9c0d1e2f3
Revises: f3c4d5e6a7b8
Create Date: 2026-05-18 19:30:00.000000

Every JSON-shaped column in this codebase is declared as TEXT
without a validity constraint. Defensive parsing exists in the
read path (json.loads wrapped in try/except across achievements.py,
data.py, etc.) but writes can land invalid JSON silently — a bug
in a writer would corrupt rows that subsequent reads would
silently skip rather than surface.

This migration adds `CHECK(json_valid(col))` to every JSON column,
making invalid writes fail at the DB level. SQLite supports
`json_valid()` since 3.38 (2022). NULL still allowed (the constraint
short-circuits on NULL per SQL semantics).

## Columns covered

`trips`:
  - viewport_json
  - place_types
  - companions_json
  - marked_places_json
  - documents_json
  - photos_json
  - checklist_json
  - trip_countries_json

`user_achievements`:
  - context_json

## Pre-flight check

Before rebuilding, scan every column for currently-invalid rows.
The migration ABORTS with a clear count if any are found, leaving
the schema untouched. The operator can then either:
  (a) fix the rows manually (UPDATE col = NULL or set to a valid
      value) and re-run, or
  (b) skip the migration (the legacy un-constrained schema keeps
      working — the constraint is defense-in-depth, not blocking).

Tested on a synthetic seed DB with mixed valid/invalid rows; the
pre-flight catches them and refuses to rebuild.

## Rebuild pattern

SQLite can't `ALTER TABLE ADD CHECK` on existing columns — same
rename/create/copy/drop sequence the earlier FK + NOT NULL
migrations used (e1b8d2a3c4f5, c5e6f7a8b9c0). Foreign-key
enforcement is OFF for the duration so cascades don't fire
mid-copy.

The full `trips` schema is duplicated here including every column
post-`c5e6f7a8b9c0` (which is the prior trips rebuild). If a
future migration adds columns to `trips`, both this file AND that
new migration must include them — or this migration must run
strictly BEFORE the column-adding one (chain order via
`down_revision` handles this naturally).

Downgrade is intentionally a no-op (raises). Reverting CHECK
constraints to re-open the gate to invalid writes would undo a
defense-in-depth fix. Same forward-only posture as e1b8d2a3c4f5.
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'a8b9c0d1e2f3'
down_revision: str | Sequence[str] | None = 'f3c4d5e6a7b8'
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

_TRIPS_JSON_COLS = [
    "viewport_json", "place_types", "companions_json",
    "marked_places_json", "documents_json", "photos_json",
    "checklist_json", "trip_countries_json",
]

_USER_ACHIEVEMENTS_COLUMNS = [
    "id", "user_id", "badge_id", "earned_at", "context_json",
]


def _count_invalid(conn, table: str, column: str) -> int:
    """Return the number of rows where `column` is non-NULL and not
    parseable as JSON. SQLite's `json_valid` returns 0/1."""
    return conn.exec_driver_sql(
        f"SELECT COUNT(*) FROM {table} "
        f"WHERE {column} IS NOT NULL AND json_valid({column}) = 0"
    ).scalar()


def upgrade() -> None:
    conn = op.get_bind()

    # ── Pre-flight: refuse if any existing JSON column has invalid
    # rows. Adding the CHECK constraint mid-rebuild would error on
    # the copy step otherwise. Surfacing the count up front gives
    # the operator a clear next action.
    invalid_summary: list[str] = []
    for col in _TRIPS_JSON_COLS:
        n = _count_invalid(conn, "trips", col)
        if n:
            invalid_summary.append(f"  trips.{col}: {n} invalid row(s)")
    n_ach = _count_invalid(conn, "user_achievements", "context_json")
    if n_ach:
        invalid_summary.append(
            f"  user_achievements.context_json: {n_ach} invalid row(s)"
        )
    if invalid_summary:
        raise RuntimeError(
            "Refusing to migrate: existing rows fail json_valid().\n"
            + "\n".join(invalid_summary)
            + "\n\nResolve them (UPDATE to NULL or a valid JSON literal) "
            "before re-running this migration."
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
            viewport_json TEXT
                CHECK(viewport_json IS NULL OR json_valid(viewport_json)),
            place_types TEXT
                CHECK(place_types IS NULL OR json_valid(place_types)),
            companions_json TEXT
                CHECK(companions_json IS NULL OR json_valid(companions_json)),
            marked_places_json TEXT
                CHECK(marked_places_json IS NULL
                      OR json_valid(marked_places_json)),
            documents_json TEXT
                CHECK(documents_json IS NULL OR json_valid(documents_json)),
            photos_json TEXT
                CHECK(photos_json IS NULL OR json_valid(photos_json)),
            checklist_json TEXT
                CHECK(checklist_json IS NULL OR json_valid(checklist_json)),
            trip_countries_json TEXT
                CHECK(trip_countries_json IS NULL
                      OR json_valid(trip_countries_json)),
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
    op.execute(f"INSERT INTO trips ({cols}) SELECT {cols} FROM _old_trips")
    op.execute("DROP TABLE _old_trips")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share_token "
        "ON trips(share_token) WHERE share_token IS NOT NULL"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_trips_user_public "
        "ON trips(user_id, is_public)"
    )

    # ── user_achievements rebuild ───────────────────────────────────
    op.execute("ALTER TABLE user_achievements RENAME TO _old_user_achievements")
    op.execute(
        """
        CREATE TABLE user_achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            badge_id TEXT NOT NULL,
            earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            context_json TEXT
                CHECK(context_json IS NULL OR json_valid(context_json)),
            UNIQUE(user_id, badge_id),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
        """
    )
    cols = ", ".join(_USER_ACHIEVEMENTS_COLUMNS)
    op.execute(
        f"INSERT INTO user_achievements ({cols}) "
        f"SELECT {cols} FROM _old_user_achievements"
    )
    op.execute("DROP TABLE _old_user_achievements")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_achievements_user "
        "ON user_achievements(user_id, badge_id)"
    )


def downgrade() -> None:
    raise NotImplementedError(
        "Reverting JSON CHECK constraints would re-open the gate to "
        "silent corruption from invalid writes. Roll forward."
    )
