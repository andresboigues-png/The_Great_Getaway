import sqlite3
import os

# DB_PATH is read on every call so tests can point at a temp DB by setting
# the env var before init_db() runs. Default keeps existing behavior.
def _db_path():
    return os.getenv("GG_DB_PATH", "travel_planner.db")

def get_db():
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    # FIXING_ROADMAP §1.4: SQLite hardening.
    #
    # `busy_timeout=5000` gives any contended op 5 seconds of
    # exponential-backoff retry before returning the lock error.
    # Without this, the default 0ms wait raises `database is locked`
    # the moment two writers meet — common under our 15s polling
    # interval where sync + notification-fetch can fire while a user
    # action is also writing.
    #
    # NOT enabled here:
    #
    # - `journal_mode=WAL` — was originally part of this fix, but
    #   removed 2026-05-13 after a "database disk image is malformed"
    #   incident on PythonAnywhere. PA's free-tier user storage is on
    #   a NETWORKED FILESYSTEM, and SQLite explicitly documents that
    #   WAL mode is unsafe on networked filesystems
    #   (https://www.sqlite.org/wal.html — "WAL does not work over a
    #   network filesystem"). The symptom was a WAL file that grew
    #   far larger than the main DB (~770KB vs ~135KB) and didn't
    #   auto-checkpoint, then individual reads from Flask workers
    #   started failing with the malformed-image error mid-query
    #   while the sqlite3 CLI could still parse the same file.
    #   Default rollback journal mode is safer on PA at the cost of
    #   readers waiting on writers — busy_timeout above is what
    #   keeps that wait bounded.
    #
    # - `foreign_keys=ON` — flipping FK enforcement on a live
    #   database that may already contain orphan rows (expenses
    #   pointing at deleted trips, etc.) would cause any update
    #   touching such rows to throw. Tracked as a follow-up in the
    #   roadmap — needs an orphan-row audit + cleanup migration first.
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

def _safe_alter(cursor, ddl):
    """Run a schema-add ALTER, swallowing only the "this column/table
    already exists" outcomes. Any other failure (disk full, permission
    denied, type drift, syntax error in the DDL) re-raises so init_db
    blows up loudly instead of silently leaving the schema in an
    indeterminate state.

    FIXING_ROADMAP §1.5: the previous `except Exception: pass` pattern
    around every ALTER hid real problems. Narrowing to OperationalError
    + the well-known idempotency strings is the minimum-loud fix; the
    full §1.6 migration cleanup (Alembic-as-source-of-truth) is the
    real fix and supersedes init_db's ALTER chain entirely."""
    try:
        cursor.execute(ddl)
    except sqlite3.OperationalError as e:
        msg = str(e).lower()
        # SQLite returns "duplicate column name: X" for ALTER ADD;
        # "table X already exists" for CREATE TABLE (we use IF NOT
        # EXISTS so it shouldn't fire, but kept for completeness).
        if "duplicate column" in msg or "already exists" in msg:
            return
        raise


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
        _safe_alter(cursor, "ALTER TABLE users ADD COLUMN bio TEXT")
        _safe_alter(cursor, "ALTER TABLE users ADD COLUMN status TEXT")
        # home_currency stays NULL for legacy users — the frontend interprets
        # NULL as "not set yet" and defaults from browser locale on first load.
        _safe_alter(cursor, "ALTER TABLE users ADD COLUMN home_currency TEXT")
        # i18n session 3 — language follows the user across devices.
        # Stored as the 2-letter Locale code ('en' | 'pt' | 'es' | 'fr')
        # or NULL for legacy users (frontend then derives from browser
        # locale via detectBrowserLocale, same convention as
        # home_currency above). Allowlist validation lives in
        # routes/settings.py to keep arbitrary strings out of the DB.
        _safe_alter(cursor, "ALTER TABLE users ADD COLUMN language TEXT")
        # FIXING_ROADMAP §0.3 — JWT revocation. Each user has a
        # `token_jti` value that gets embedded in every JWT we issue
        # them. /api/auth/logout bumps the jti, which invalidates
        # every token issued before the bump (single-jti-per-user
        # model). NULL means "not initialised yet" — auth.issue_token
        # lazily fills it on first call so the rollout doesn't need
        # a data backfill.
        _safe_alter(cursor, "ALTER TABLE users ADD COLUMN token_jti TEXT")
        
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
        _safe_alter(cursor, "ALTER TABLE trips ADD COLUMN is_public INTEGER DEFAULT 0")

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
            # FIXING_ROADMAP §4.1 — public share-via-link. share_token
            # is NULL until the owner clicks Share; set to a random
            # hex string the visitor uses in /share/<token>. Unique
            # index further below stops two trips from colliding on
            # the same URL. share_views counts unique visitors in a
            # 24h window. share_show_cost is the privacy toggle — off
            # by default so a casual Share doesn't accidentally expose
            # spending; the owner opts in via the share modal.
            ("share_token", "ALTER TABLE trips ADD COLUMN share_token TEXT"),
            ("share_views", "ALTER TABLE trips ADD COLUMN share_views INTEGER DEFAULT 0"),
            ("share_show_cost", "ALTER TABLE trips ADD COLUMN share_show_cost INTEGER DEFAULT 0"),
            # Second share-page privacy toggle (companion to
            # share_show_cost). Off by default — itinerary text can
            # be the most private part of a trip ("apartment key
            # under the mat" etc.); a casual share should never
            # accidentally expose it.
            ("share_show_plans", "ALTER TABLE trips ADD COLUMN share_show_plans INTEGER DEFAULT 0"),
            # JSON-encoded list of trip-level photos. Each entry:
            # { id, src, dayId?, addedAt? }. Same shape rules as
            # documents — dayId optional. See the Photos tab on Home.
            ("photos_json", "ALTER TABLE trips ADD COLUMN photos_json TEXT"),
            # JSON-encoded trip checklist — packing / errands / pre-trip
            # tasks the user wants to tick off. Lives at trip scope
            # (one checklist per trip, surfaced as a Anchor option
            # since Anchor is the trip's central hub). Each item:
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
            _safe_alter(cursor, ddl)

        # FIXING_ROADMAP §4.1 — partial UNIQUE index on share_token so
        # two trips can't collide on the same public URL. NULL values
        # are not deduplicated (SQLite's UNIQUE-without-WHERE would
        # block the first row; the partial index lets unshared trips
        # all sit at NULL).
        _safe_alter(
            cursor,
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share_token "
            "ON trips(share_token) WHERE share_token IS NOT NULL",
        )

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
        _safe_alter(cursor, "ALTER TABLE expenses ADD COLUMN receipt_url TEXT")
        
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
        # Inline narrowing (not _safe_alter) because we want to keep
        # the UPDATE backfill if the column was missing AND let any
        # non-duplicate-column error propagate.
        try:
            cursor.execute("ALTER TABLE friends ADD COLUMN created_at DATETIME")
            cursor.execute("UPDATE friends SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
        except sqlite3.OperationalError as e:
            if "duplicate column" not in str(e).lower():
                raise
        
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
            _safe_alter(cursor, ddl)

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
        _safe_alter(cursor, "ALTER TABLE notifications ADD COLUMN title TEXT")

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
        _safe_alter(cursor, "ALTER TABLE feed_posts ADD COLUMN caption TEXT")
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

        # Achievements Table (FIXING_ROADMAP §4.4).
        # Per-user record of which badges have been earned. Each badge
        # is a string id from src/achievements.py's BADGES registry —
        # we store the id (not a label) so badge copy can be retuned
        # without touching the data. UNIQUE(user_id, badge_id) makes
        # the detection loop trivially idempotent: re-running the rules
        # is safe, an already-earned badge just hits the constraint.
        #
        # `context_json` is free-form per-badge metadata at earn time
        # (e.g. {"tripId": "abc", "countryCode": "PT"} for the trip-
        # related badges). The profile renderer can show "Globe Trotter
        # — 5 countries" with the actual list of countries when present;
        # absent context degrades gracefully to the badge's static copy.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                badge_id TEXT NOT NULL,
                earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                context_json TEXT,
                UNIQUE(user_id, badge_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')

        # Settlements Table (FIXING_ROADMAP §4.5).
        # Records "X paid Y €N for trip T" rows so the balance page can
        # subtract them from the raw expense-derived debts.
        #
        # Currency model mirrors `expenses`: store the user-typed amount
        # in `amount` + `currency`, plus a derived `euro_value` for
        # cross-currency balance math. The pivot through EUR keeps the
        # balance-simplification logic single-currency without losing
        # the original receipt-currency information.
        #
        # `method` is a free-form short label ('cash' / 'revolut' /
        # 'bank_transfer' / 'custom') — small enough that we don't bother
        # with an enum table, large enough that "Custom" lets users type
        # whatever they actually used.
        #
        # No DELETE-cascade FK to users: a user account deletion goes
        # through /api/user-data which scopes its DELETEs by user_id +
        # owned trip_id (see data.py:delete_user_data). We rely on that
        # path rather than ON DELETE CASCADE because SQLite's FK
        # cascades require PRAGMA foreign_keys = ON which isn't
        # universally on across our environments yet.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settlements (
                id TEXT PRIMARY KEY,
                trip_id TEXT NOT NULL,
                from_user_id TEXT NOT NULL,
                to_user_id TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                euro_value REAL,
                method TEXT,
                note TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(trip_id) REFERENCES trips(id),
                FOREIGN KEY(from_user_id) REFERENCES users(id),
                FOREIGN KEY(to_user_id) REFERENCES users(id)
            )
        ''')

        # FIXING_ROADMAP §2.1 — indexes on hot tables. Must come AFTER
        # all CREATE TABLE statements above (the table needs to exist
        # before the index can reference it). The caller-can-see-event
        # check in feed.py runs against feed_likes / feed_bookmarks on
        # every like/bookmark toggle — without these indexes those
        # become full-table scans once the tables grow past a few
        # thousand rows. trip_members has the same hot path on
        # /api/data (§1.7 batched the per-trip lookup but still pays
        # for index lookup if the table grows). notifications +
        # friends are read on every page load. Index naming
        # convention: idx_<table>_<col(s)>.
        for ddl in (
            "CREATE INDEX IF NOT EXISTS idx_feed_likes_event ON feed_likes(event_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_bookmarks_event ON feed_bookmarks(event_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_posts_user ON feed_posts(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_posts_trip ON feed_posts(trip_id)",
            "CREATE INDEX IF NOT EXISTS idx_friends_user_status ON friends(user_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_notifications_user_created "
            "ON notifications(user_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_trip_members_trip_user "
            "ON trip_members(trip_id, user_id)",
            "CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id)",
            "CREATE INDEX IF NOT EXISTS idx_trip_days_trip ON trip_days(trip_id)",
            # §4.5: settlements read path is per-trip (balance page +
            # /api/data fan-out). One index keyed on trip_id covers
            # both, and the from/to user joins use the small per-trip
            # row set without a separate index.
            "CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id)",
            # §4.4: achievements read path is per-user (profile +
            # detection loop). One composite index covers both.
            "CREATE INDEX IF NOT EXISTS idx_user_achievements_user "
            "ON user_achievements(user_id, badge_id)",
        ):
            _safe_alter(cursor, ddl)

        conn.commit()

if __name__ == "__main__":
    init_db()
    print("Database initialized!")
