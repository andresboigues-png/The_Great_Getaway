"""baseline — captures the schema produced by database.init_db().

For existing dev/prod DBs (which already have these tables from init_db
running at every Flask startup) the operator should run:
    alembic stamp head
to mark them as up-to-date without re-running the CREATEs. For fresh
DBs (new dev setups, CI), `alembic upgrade head` will create everything.

Future schema changes go through new migration files; init_db() will be
retired once Phase G's auth refactor settles and there's a single owner
for schema management.

Revision ID: 0c7a67724fda
Revises:
Create Date: 2026-05-05 16:45:34.324281
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0c7a67724fda'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the full schema as it stands at the start of Phase G.

    Mirrors database.init_db(): same table defs, same columns. We use
    raw SQL via op.execute (rather than op.create_table with SQLAlchemy
    Column objects) because the existing codebase doesn't define ORM
    models — adding them just for migrations would be busywork."""
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
            name TEXT,
            picture TEXT,
            bio TEXT,
            status TEXT,
            home_currency TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS trips (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            name TEXT,
            country TEXT,
            is_archived INTEGER DEFAULT 0,
            is_public INTEGER DEFAULT 0,
            place_id TEXT,
            lat REAL,
            lng REAL,
            viewport_json TEXT,
            place_types TEXT,
            country_code TEXT,
            companions_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            trip_id TEXT,
            who TEXT,
            category_id TEXT,
            label TEXT,
            date TEXT,
            country TEXT,
            value REAL,
            currency TEXT,
            euro_value REAL,
            FOREIGN KEY(trip_id) REFERENCES trips(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS friends (
            user_id TEXT,
            friend_id TEXT,
            status TEXT DEFAULT 'pending',
            PRIMARY KEY(user_id, friend_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(friend_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS trip_collaborators (
            trip_id TEXT,
            user_id TEXT,
            PRIMARY KEY(trip_id, user_id),
            FOREIGN KEY(trip_id) REFERENCES trips(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS trip_members (
            trip_id TEXT,
            user_id TEXT,
            role TEXT DEFAULT 'planner',
            is_archived INTEGER DEFAULT 0,
            invitation_status TEXT DEFAULT 'accepted',
            invited_by TEXT,
            PRIMARY KEY(trip_id, user_id),
            FOREIGN KEY(trip_id) REFERENCES trips(id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS companions (
            user_id TEXT,
            name TEXT,
            linked_user_id TEXT,
            link_status TEXT,
            PRIMARY KEY(user_id, name),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(linked_user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT,
            user_id TEXT,
            name TEXT,
            icon TEXT,
            color TEXT,
            PRIMARY KEY(id, user_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            trip_id TEXT,
            label TEXT,
            amount REAL,
            currency TEXT DEFAULT 'EUR',
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT,
            type TEXT,
            title TEXT,
            related_id TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS trip_days (
            id TEXT PRIMARY KEY,
            trip_id TEXT,
            day_number INTEGER,
            date TEXT,
            name TEXT,
            morning TEXT,
            afternoon TEXT,
            evening TEXT,
            notes TEXT,
            photos TEXT,
            documents TEXT,
            tip TEXT,
            lat REAL,
            lng REAL,
            FOREIGN KEY(trip_id) REFERENCES trips(id)
        )
    """)


def downgrade() -> None:
    """Drop everything. Order matters because of FK constraints, but
    SQLite doesn't enforce FKs by default so the order is mostly a
    sanity exercise."""
    for table in [
        "trip_days", "notifications", "budgets", "categories",
        "companions", "trip_members", "trip_collaborators",
        "friends", "expenses", "trips", "users",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {table}")
