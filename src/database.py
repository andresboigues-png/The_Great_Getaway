import sqlite3
import os

DB_PATH = "travel_planner.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Users Table
        cursor.execute('''
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
        ''')
        # Add bio/status/home_currency if they don't exist
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN bio TEXT")
        except Exception: pass
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN status TEXT")
        except Exception: pass
        # home_currency stays NULL for legacy users — the frontend interprets
        # NULL as "not set yet" and defaults from browser locale on first load.
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN home_currency TEXT")
        except Exception: pass
        
        # Trips Table (Linked to an owner)
        cursor.execute('''
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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
        # Add is_public column if it doesn't exist (for existing databases)
        try:
            cursor.execute("ALTER TABLE trips ADD COLUMN is_public INTEGER DEFAULT 0")
        except Exception:
            pass  # Column already exists

        # Google Places fields. Existing rows keep `country` populated as the
        # human-readable name; new rows additionally carry place_id + lat/lng +
        # the viewport (stored as a JSON {south, west, north, east}) and the
        # place's `types` array. The map render uses lat/lng/viewport directly
        # when present and falls back to geocoding `country` for legacy trips.
        for col, ddl in [
            ("place_id", "ALTER TABLE trips ADD COLUMN place_id TEXT"),
            ("lat", "ALTER TABLE trips ADD COLUMN lat REAL"),
            ("lng", "ALTER TABLE trips ADD COLUMN lng REAL"),
            ("viewport_json", "ALTER TABLE trips ADD COLUMN viewport_json TEXT"),
            ("place_types", "ALTER TABLE trips ADD COLUMN place_types TEXT"),
        ]:
            try:
                cursor.execute(ddl)
            except Exception:
                pass  # Column already exists
        
        # Expenses Table (Linked to a trip)
        cursor.execute('''
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
        ''')
        
        # Friends Table (Many-to-Many)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS friends (
                user_id TEXT,
                friend_id TEXT,
                status TEXT DEFAULT 'pending', -- 'pending', 'accepted'
                PRIMARY KEY(user_id, friend_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(friend_id) REFERENCES users(id)
            )
        ''')
        
        # Trip Sharing (Collaboration)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trip_collaborators (
                trip_id TEXT,
                user_id TEXT,
                PRIMARY KEY(trip_id, user_id),
                FOREIGN KEY(trip_id) REFERENCES trips(id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # Companions Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS companions (
                user_id TEXT,
                name TEXT,
                PRIMARY KEY(user_id, name),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # Categories Table (user-scoped custom categories)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT,
                user_id TEXT,
                name TEXT,
                icon TEXT,
                color TEXT,
                PRIMARY KEY(id, user_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # Budgets Table (user-scoped, optionally linked to a trip)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS budgets (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                trip_id TEXT,
                label TEXT,
                amount REAL,
                currency TEXT DEFAULT 'EUR',
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # Notifications Table
        cursor.execute('''
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
        ''')
        # Add title column if it doesn't exist
        try:
            cursor.execute("ALTER TABLE notifications ADD COLUMN title TEXT")
        except Exception: pass

        # Trip Days Table
        cursor.execute('''
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
        ''')
        
        conn.commit()

if __name__ == "__main__":
    init_db()
    print("Database initialized!")
