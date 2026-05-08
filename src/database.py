import sqlite3
import os

# DB_PATH is read on every call so tests can point at a temp DB by setting
# the env var before init_db() runs. Default keeps existing behavior.
def _db_path():
    return os.getenv("GG_DB_PATH", "travel_planner.db")

def get_db():
    conn = sqlite3.connect(_db_path())
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
                country_code TEXT,
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
            # ISO 3166-1 alpha-2 country code (e.g. "FR", "PT", "US"). Stable
            # across UI languages — Google's `formatted_address` localizes to
            # the user's locale ("Paris, França") so name-based dataset lookup
            # would miss for non-English users; the ISO code never localizes.
            ("country_code", "ALTER TABLE trips ADD COLUMN country_code TEXT"),
            # JSON-encoded list of companion names that participate in this
            # specific trip — a subset of the account-level `companions` table.
            # Read-sites (expense form, settlement balance, upload default-split)
            # scope to this list instead of the full account roster, so each
            # trip computes who-owes-whom against just its real participants.
            ("companions_json", "ALTER TABLE trips ADD COLUMN companions_json TEXT"),
            # JSON-encoded list of places the user has added to the
            # trip's To-do list (the unified surface that replaced the
            # old Shortlist + Mark-for-AI pair). Each entry carries
            # `forManual` (in the to-do list) and `forAI` (ticked for
            # the next AI generation). New entries default to both true.
            # Schema: see migrations/versions/c374584f6044*.
            ("marked_places_json", "ALTER TABLE trips ADD COLUMN marked_places_json TEXT"),
            # JSON-encoded list of trip-level documents (booking
            # confirmations, hotel vouchers, multi-day reservations,
            # passport scans). Each entry: { id, name, url, dayId?,
            # addedAt? }. dayId is optional — when set, the doc is
            # tied to a specific day; when null/absent, it's
            # trip-wide. See the Documents tab on Home.
            ("documents_json", "ALTER TABLE trips ADD COLUMN documents_json TEXT"),
            # JSON-encoded list of trip-level photos. Each entry:
            # { id, src, dayId?, addedAt? }. Same shape rules as
            # documents — dayId optional. See the Photos tab on Home.
            ("photos_json", "ALTER TABLE trips ADD COLUMN photos_json TEXT"),
            # JSON-encoded trip checklist — packing / errands / pre-trip
            # tasks the user wants to tick off. Lives at trip scope
            # (one checklist per trip, surfaced as a Genesis option
            # since Genesis is the trip's central hub). Each item:
            # { id, body, done, created_at }. Distinct from the
            # /todo page (which is the per-trip list of PLACES from
            # the home map) — checklist is free-form tasks.
            ("checklist_json", "ALTER TABLE trips ADD COLUMN checklist_json TEXT"),
            # Per-trip privacy flag for the Actions feed. When 1, the
            # /api/feed Actions queries (joined-trip / added-day /
            # archived-trip) skip events for this trip across ALL
            # viewers — owner included. Toggled from a button on the
            # trip header (where the share-to-feed button used to
            # live before that moved to the public-trip detail
            # page). Default 0 — actions visible.
            #
            # Scope notes: this only silences the Actions tab.
            # Posts (explicit shares + reposts) keep their separate
            # opt-in flow on the public-trip detail page; silencing
            # a trip doesn't unshare it.
            ("actions_hidden", "ALTER TABLE trips ADD COLUMN actions_hidden INTEGER DEFAULT 0"),
            # Custom cover photo URL — when set, the collections list
            # card shows a thumbnail and the archived-trip detail hero
            # uses it instead of the auto-picked first photo. NULL for
            # legacy rows; the user picks one via the Edit Trip modal,
            # which uploads to /api/upload and writes the returned URL
            # back via /api/trips. See FUTURE_FEATURES.md item #2.
            ("cover_url", "ALTER TABLE trips ADD COLUMN cover_url TEXT"),
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
        # Receipt photo URL — second half of the post-Phase-C "small
        # things" release (after cover photos). NULL for legacy rows;
        # the user opts in by tapping 📎 on the expense form, which
        # uploads via /api/upload and stores the returned URL here.
        # See FUTURE_FEATURES.md item #3.
        try:
            cursor.execute("ALTER TABLE expenses ADD COLUMN receipt_url TEXT")
        except Exception:
            pass  # Column already exists
        
        # Friends Table (Many-to-Many)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS friends (
                user_id TEXT,
                friend_id TEXT,
                status TEXT DEFAULT 'pending', -- 'pending', 'accepted'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, friend_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(friend_id) REFERENCES users(id)
            )
        ''')
        # Backfill created_at on legacy databases that pre-date the column.
        # SQLite REJECTS `ALTER TABLE ... ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP`
        # ("Cannot add a column with non-constant default") — so the
        # earlier version of this migration silently failed and the
        # column never got added on existing dbs, breaking /api/feed
        # (the `new_friendship` query references f.created_at). Two-step
        # workaround: (1) ALTER without a DEFAULT — column lands with
        # NULL for existing rows, (2) UPDATE backfill so existing
        # friendships surface as "just established" in the feed window.
        # New INSERTs explicitly stamp created_at (see /api/friends/add
        # and /api/friends/accept) so they don't depend on a default.
        try:
            cursor.execute("ALTER TABLE friends ADD COLUMN created_at DATETIME")
            cursor.execute("UPDATE friends SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
        except Exception:
            pass
        
        # Trip Sharing (Collaboration) — legacy, retained so old DBs don't
        # error on schema upgrade. Phase 3 introduced `trip_members` below
        # which carries role + per-user archive + invitation lifecycle.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trip_collaborators (
                trip_id TEXT,
                user_id TEXT,
                PRIMARY KEY(trip_id, user_id),
                FOREIGN KEY(trip_id) REFERENCES trips(id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # Trip Members — Phase 3. Source of truth for who participates in a
        # trip and what they can do. Row exists for the trip's owner (auto-
        # inserted on /api/trips upsert) and for every invited user; the
        # latter starts at `invitation_status='pending'` and flips to
        # `'accepted'` after they respond. `is_archived` is per-user (each
        # member archives their own copy). `role` is open-ended on purpose:
        # 'planner' / 'relaxer' today, future roles only need updates to
        # the permissions module on the client + the gating helpers here.
        cursor.execute('''
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
        ''')

        # Companions Table — Phase 2 added link columns. A companion can
        # optionally point to a friend's user account. The link is symmetric:
        # when A invites B, A's row gets `linked_user_id=B, link_status='pending'`;
        # on accept B creates their own row pointing back to A and both rows
        # flip to `accepted`. Removing a row symmetrically nulls the
        # corresponding row on the friend's side.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS companions (
                user_id TEXT,
                name TEXT,
                linked_user_id TEXT,
                link_status TEXT,
                PRIMARY KEY(user_id, name),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(linked_user_id) REFERENCES users(id)
            )
        ''')
        for col, ddl in [
            ("linked_user_id", "ALTER TABLE companions ADD COLUMN linked_user_id TEXT"),
            ("link_status", "ALTER TABLE companions ADD COLUMN link_status TEXT"),
        ]:
            try:
                cursor.execute(ddl)
            except Exception:
                pass

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

        # ── Feed (social / sharing layer) ──────────────────────────────
        # feed_posts: explicit, user-initiated shares + reposts. Synthesised
        # events (created/archived/joined) are derived from existing tables
        # at /api/feed read time and don't have rows here. A row with
        # repost_of_post_id IS NULL is an "original share"; a row with it
        # set is a "repost" of the referenced post (Twitter-style retweet
        # semantics). trip_id is denormalised onto the repost row so the
        # feed can render trip details without an extra join chain.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feed_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                trip_id TEXT NOT NULL,
                repost_of_post_id INTEGER,
                caption TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(trip_id) REFERENCES trips(id)
            )
        ''')
        # Add caption column on legacy dbs that pre-date it. NULL allowed
        # so existing rows just stay caption-less; new shares pass it
        # explicitly. Standard plain ALTER (no CURRENT_TIMESTAMP-style
        # default-clause snag).
        try:
            cursor.execute("ALTER TABLE feed_posts ADD COLUMN caption TEXT")
        except Exception:
            pass
        # feed_likes: social like signal per event. event_id is the
        # synthesised event ID from /api/feed (e.g. "trip_created_<trip>",
        # "share_<post>") so likes survive across event categories. Like
        # rows can outlive their event (event ages out of the 30-day window,
        # row stays); harmless because nobody can see the orphan event
        # anyway, and we don't expose a "list everyone's likes" surface.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feed_likes (
                user_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, event_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
        # feed_bookmarks: personal save. Same event_id keying as likes.
        # Strictly per-user; no count exposed on /api/feed.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feed_bookmarks (
                user_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, event_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
        # feed_comments: replies on feed events. event_id keys the same
        # synthesised IDs as likes/bookmarks. body is plain text (no
        # markdown for v1) capped server-side at 500 chars. created_at
        # ascends so the thread reads in chronological order. We expose
        # a `comment_count` per event on /api/feed and a separate
        # /api/feed/comments/<event_id> for the full thread when the user
        # expands it — keeps the feed payload lean even on chatty events.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feed_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_feed_comments_event "
            "ON feed_comments(event_id, created_at)"
        )

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
