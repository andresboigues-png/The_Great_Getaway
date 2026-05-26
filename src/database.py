import functools
import logging
import os
import random
import sqlite3
import time
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# DB_PATH is read on every call so tests can point at a temp DB by setting
# the env var before init_db() runs. Default keeps existing behavior.
def _db_path():
    return os.getenv("GG_DB_PATH", "travel_planner.db")


# busy_timeout — milliseconds SQLite will spin waiting for a contended
# lock before raising `database is locked`. Bumped from 5s → 30s on
# 2026-05-14 after a wave of 500s on /api/sync + /api/friends/add: a
# fully-loaded sync_data() transaction on PA's networked filesystem can
# easily take >5s, blocking any concurrent writer (friend add, follow,
# expense upsert) past the previous 5s ceiling. 30s comfortably covers
# the upper bound of a worst-case sync write while still bounding the
# worst-case user-facing latency. Companion change: `sync_data` now
# commits per-table so the writer lock is released between sections,
# making the 30s headroom rarely needed in practice.
BUSY_TIMEOUT_MS = 30_000


@contextmanager
def get_db():
    """Yield a sqlite3 connection with the right PRAGMAs set; release
    the FD on context exit.

    Audit fix (2026-05-26): the previous shape returned the connection
    and relied on `with get_db() as conn:` invoking sqlite3's own
    context manager — which commits/rolls back the transaction but
    DOES NOT close the connection. Every request handler therefore
    leaked a file descriptor; admin.py had been individually patched
    with `closing(get_db())` but the other ~50 call sites hadn't.

    Now `get_db` IS the context manager, so the same `with get_db()
    as conn:` callers automatically get:
      - PRAGMAs applied on entry
      - transaction commit/rollback on exit (delegated to sqlite3's
        own `with conn:` semantics)
      - FD released in the outer `finally`

    Behavior preserved for callers: an explicit `conn.commit()`
    inside the block still commits immediately; the outer sqlite3
    ctx manager then sees no open transaction and no-ops; the outer
    finally then closes the connection. Read-only callers that never
    write also work — sqlite3's ctx manager is a no-op when no
    transaction is open.

    FIXING_ROADMAP §1.4: SQLite hardening. Two PRAGMAs per
    connection — both have to be re-set on every fresh sqlite3
    connection because SQLite scopes PRAGMA state per-connection,
    not per-database.

    `busy_timeout` gives any contended op N milliseconds of
    exponential-backoff retry before returning the lock error.
    Without this, the default 0ms wait raises `database is locked`
    the moment two writers meet — common under our 15s polling
    interval where sync + notification-fetch can fire while a user
    action is also writing.

    `foreign_keys=ON` makes the FK constraints declared in CREATE
    TABLE actually enforced. Until 2026-05-16 this was OFF (SQLite
    default) because a live DB might contain pre-existing orphan
    rows that would crash any update touching them. Phase 4 of
    §1.4 shipped after Phase 1 (scripts/fk_audit.py) confirmed
    zero orphans across all 28 FK relationships on the live PA DB,
    AND Phase 4's migration (declare_foreign_keys) re-declared each
    FK with explicit ON DELETE behaviour. With both prerequisites
    in place, this PRAGMA can flip safely.

    NOT enabled here:

    - `journal_mode=WAL` — was originally part of §1.4, but removed
      2026-05-13 after a "database disk image is malformed" incident
      on PythonAnywhere. PA's free-tier user storage is on a NETWORKED
      FILESYSTEM, and SQLite explicitly documents that WAL mode is
      unsafe on networked filesystems
      (https://www.sqlite.org/wal.html — "WAL does not work over a
      network filesystem"). The symptom was a WAL file that grew far
      larger than the main DB (~770KB vs ~135KB) and didn't auto-
      checkpoint, then individual reads from Flask workers started
      failing with the malformed-image error mid-query while the
      sqlite3 CLI could still parse the same file. Default rollback
      journal mode is safer on PA at the cost of readers waiting on
      writers — busy_timeout above is what keeps that wait bounded.
    """
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _is_locked_error(exc: BaseException) -> bool:
    """True for the specific OperationalError flavour SQLite raises when
    a write can't acquire the lock within busy_timeout. We narrow to
    this string so other OperationalErrors (disk full, schema drift,
    etc.) propagate immediately instead of retrying pointlessly."""
    if not isinstance(exc, sqlite3.OperationalError):
        return False
    msg = str(exc).lower()
    return "database is locked" in msg or "database is busy" in msg


def retry_on_lock(max_attempts: int = 4, base_delay: float = 0.05, max_delay: float = 1.5):
    """Decorator: retry the wrapped function when SQLite raises
    `database is locked`. Other OperationalErrors propagate
    immediately.

    Rationale (2026-05-14 incident): even with `busy_timeout=30s`,
    PA's networked filesystem can serialise a long sync_data() past
    that ceiling, causing concurrent writers to 500. Retrying the
    failed handler at the route boundary catches the residual.

    Default budget — 4 attempts × exponential backoff (0.05s, 0.1s,
    0.2s, 0.4s, capped at 1.5s) + jitter — gives ~0.75s of total
    sleep time worst-case, on top of busy_timeout's wait. Total
    wall-clock cap per request ~30s + ~0.75s = ~31s, still inside
    PA's default 60s WSGI timeout.

    Apply BENEATH @require_auth (auth shouldn't be re-checked) and
    BENEATH @limiter.limit (rate-limit shouldn't double-count
    retries). Recommended decorator stack:

        @bp.route(...)
        @limiter.limit(...)
        @require_auth
        @retry_on_lock()
        def handler(...): ...

    The wrapped function should be idempotent — almost all of our
    write paths already are (INSERT OR IGNORE, ON CONFLICT UPDATE,
    notification-deduplication guards, etc.). Non-idempotent side
    effects outside the DB transaction (sending emails, hitting
    paid APIs) would be doubled on retry; none of our current
    routes do that.

    Args:
        max_attempts: total attempts including the first. 4 means
            1 initial + up to 3 retries.
        base_delay: seconds slept before the first retry. Each
            subsequent retry doubles, capped at max_delay.
        max_delay: cap on per-attempt sleep so a long backoff
            doesn't blow past PA's WSGI timeout.
    """
    def deco(fn):
        @functools.wraps(fn)
        def wrapped(*args, **kwargs):
            attempt = 0
            while True:
                try:
                    return fn(*args, **kwargs)
                except sqlite3.OperationalError as exc:
                    attempt += 1
                    if not _is_locked_error(exc) or attempt >= max_attempts:
                        raise
                    delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
                    # Small jitter to spread out a thundering herd of
                    # retrying requests that all hit the same lock.
                    delay += random.uniform(0, delay * 0.25)
                    logger.warning(
                        "db locked on %s (attempt %d/%d), retrying in %.3fs",
                        fn.__name__, attempt, max_attempts, delay,
                    )
                    time.sleep(delay)
        return wrapped
    return deco

# `_safe_alter` removed in the FIXING_ROADMAP §1.5/§1.6 cutover. Every
# schema-mutation it used to handle is now owned by Alembic; init_db
# only does CREATE TABLE IF NOT EXISTS (for fresh DBs) + CREATE INDEX
# IF NOT EXISTS (also idempotent). If you reach for ALTER TABLE here
# again — STOP and write an Alembic revision instead.


def init_db():
    """Create the full current schema on a fresh DB.

    FIXING_ROADMAP §1.5 / §1.6 cutover: CREATE TABLE statements below
    carry every column that exists in production today — no separate
    `_safe_alter` ALTER chain. The chain was the source of the "two
    parallel migration paths" footgun: every column was added in TWO
    places (init_db AND an Alembic revision), which silently drifted.

    Schema changes from this point on are Alembic-only:
        1. `alembic revision -m "add foo column"` to scaffold the file
        2. Edit it; write `op.execute(...)`
        3. Update the CREATE TABLE here so fresh DBs / tests skip the
           ALTER round-trip
        4. Deploy: `alembic upgrade head && touch wsgi`

    init_db is now idempotent on every supported state:
      - Fresh DB: every CREATE TABLE creates with full columns
      - Prod DB (was kept current by the old _safe_alter chain): every
        CREATE TABLE IF NOT EXISTS is a no-op; the schema is already
        complete; the sanity check at the bottom passes
      - Alembic-managed DB (post-cutover, where `alembic upgrade head`
        produces the schema): same as prod path; init_db's CREATE
        TABLEs are no-ops, sanity check passes
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # Users Table — full schema includes every column added in
        # post-baseline Alembic revisions + the catchup revision.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                name TEXT,
                picture TEXT,
                bio TEXT,
                status TEXT,
                home_currency TEXT,
                home_country TEXT,
                language TEXT,
                token_jti TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Trips Table — full schema. Column-level docs migrated to
        # the catchup Alembic revision (migrations/versions/
        # f9a3b7e1c842*) since that's now the canonical place for
        # schema deltas. Brief recap of post-baseline columns:
        #   - Google Places: place_id, lat, lng, viewport_json,
        #     place_types, country_code
        #   - JSON blobs: companions_json, marked_places_json,
        #     documents_json, photos_json, checklist_json
        #   - Share-via-link: share_token, share_views,
        #     share_show_cost, share_show_plans
        #   - Privacy granularity: public_show_expenses
        #   - Misc: actions_hidden, cover_url
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trips (
                id TEXT PRIMARY KEY,
                -- 2026-05-18 audit fix (critical bug #5): NOT NULL on
                -- user_id. Every WHERE clause filters on this column;
                -- a NULL row silently vanishes from every scoped read
                -- (it doesn't match `= ?` for any value, no FK error,
                -- no observable owner). Migration c5e6f7a8b9c0 rebuilds
                -- prod DBs that pre-date this change.
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
                -- 2026-05-18 audit M1: every JSON column carries a
                -- json_valid() CHECK so invalid writes fail at the DB
                -- level rather than silently corrupt rows. NULL is
                -- still allowed (the constraint short-circuits on
                -- NULL per SQL semantics). Migration a8b9c0d1e2f3
                -- rebuilds prod DBs that pre-date this change.
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
                -- §4.3: JSON array of ISO 3166-1 alpha-2 codes the trip
                -- touches (e.g. '["PT", "ES"]'). Primary country first,
                -- additional codes from client-side reverse-geocode in
                -- discovery order. Null on legacy rows + on trips with
                -- only a single country (frontend falls back to
                -- country_code in that case).
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
        ''')
        # Partial UNIQUE on share_token so two trips can't collide on
        # the same public URL. Index is idempotent + lives here (not
        # only in Alembic) because dropping it in production would be
        # disastrous — keep CREATE IF NOT EXISTS as belt-and-braces.
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share_token "
            "ON trips(share_token) WHERE share_token IS NOT NULL"
        )

        # Expenses Table — receipt_url added post-baseline (FUTURE_
        # FEATURES #3) for the 📎 attach-receipt flow on the expense
        # form. 2026-05-26: splits_json + is_settlement added so
        # the frontend's load-bearing split-percentage map (which
        # drives ALL balance math) survives sign-in on a new device.
        # Pre-add, splits lived only in localStorage and were silently
        # wiped by every /api/data poll that rebuilt STATE.expenses
        # from the server, producing wildly wrong balance numbers
        # across devices. is_settlement carries the PATH B settle-up
        # flag so settled debts stop resurrecting on every sign-in.
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
                receipt_url TEXT,
                splits_json TEXT
                    CHECK(splits_json IS NULL OR json_valid(splits_json)),
                is_settlement INTEGER DEFAULT 0,
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
            )
        ''')

        # Friends Table — created_at is part of the CREATE TABLE
        # now (handled in the catchup revision for prod DBs).
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS friends (
                user_id TEXT,
                friend_id TEXT,
                status TEXT DEFAULT 'pending', -- 'pending', 'accepted'
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(user_id, friend_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(friend_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')
        
        # Trip Sharing (Collaboration) — legacy, retained so old DBs don't
        # error on schema upgrade. Phase 3 introduced `trip_members` below
        # which carries role + per-user archive + invitation lifecycle.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trip_collaborators (
                trip_id TEXT,
                user_id TEXT,
                PRIMARY KEY(trip_id, user_id),
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
                -- 2026-05-26 audit #C-26: the moment THIS member
                -- archived their copy. Distinct from `is_archived`
                -- (which is just a boolean) so the feed event +
                -- achievement timing can use the actual completion
                -- moment instead of trips.created_at (which fired
                -- the 30-day window check on a stale date). NULL
                -- when the row was never archived OR was archived
                -- before this column existed.
                completed_at DATETIME DEFAULT NULL,
                invitation_status TEXT DEFAULT 'accepted',
                invited_by TEXT,
                PRIMARY KEY(trip_id, user_id),
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(invited_by) REFERENCES users(id) ON DELETE SET NULL
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
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(linked_user_id) REFERENCES users(id) ON DELETE SET NULL
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
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL
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
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

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
                -- 2026-05-26 audit #C-6: snapshot the trip's is_public
                -- value at share-creation time. Used by the unshare
                -- path to restore the trip's privacy when the LAST
                -- share that flipped it gets removed. NULL = nothing
                -- to restore (legacy row or trip was already public).
                trip_was_public INTEGER DEFAULT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                -- 2026-05-18 audit M3: CASCADE (was SET NULL). Pre-fix,
                -- deleting the original share left the repost rows with
                -- repost_of_post_id = NULL — and the feed query for
                -- original shares filters on `WHERE repost_of_post_id
                -- IS NULL`, so orphaned reposts started appearing as
                -- if they were new original shares (with the repost's
                -- caption, pointing at the same trip as the deleted
                -- original). CASCADE makes the repost share the
                -- original's lifecycle — when the original is gone,
                -- the reposts go too. Migration f3c4d5e6a7b8 applies
                -- the same change to prod DBs.
                FOREIGN KEY(repost_of_post_id) REFERENCES feed_posts(id) ON DELETE CASCADE
            )
        ''')
        # NOTE: caption was added post-feed_posts launch — handled in
        # the catchup Alembic revision for any prod DB that pre-dates
        # the column. Fresh DBs get it via the CREATE TABLE above.
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
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
            )
        ''')

        # Follows Table (FIXING_ROADMAP §4.7).
        # One-way social graph that sits ALONGSIDE the symmetric
        # `friends` table. Friends are mutual + bidirectional + can
        # see each other's private trips. Follows are unilateral +
        # silent + only surface public activity. The two coexist so
        # a creator can have a large unidirectional audience without
        # diluting "friend" semantics on the rest of the app.
        #
        # UNIQUE(follower_id, followee_id) makes the follow op
        # naturally idempotent via INSERT OR IGNORE. There's no
        # status column — follows are immediately effective on insert,
        # immediately gone on delete. Matches Twitter/Instagram, not
        # the friend-request dance.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS follows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                follower_id TEXT NOT NULL,
                followee_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(follower_id, followee_id),
                FOREIGN KEY(follower_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(followee_id) REFERENCES users(id) ON DELETE CASCADE
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
                -- 2026-05-18 audit M1: json_valid CHECK (see trips
                -- comment above). Migration a8b9c0d1e2f3 brings prod
                -- DBs onto this shape.
                context_json TEXT
                    CHECK(context_json IS NULL OR json_valid(context_json)),
                UNIQUE(user_id, badge_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
        # ON DELETE CASCADE on all three FKs as of FIXING_ROADMAP §1.4
        # Phase 4: user account deletion (via /api/user-data → delete_
        # user_data) now propagates through the FK cascade for any
        # settlements the user participated in, including ones on
        # trips they don't own. The explicit DELETE in delete_user_data
        # remains for trip-owned settlements (so the route's per-section
        # commit boundary stays meaningful) — the cascade just covers
        # the long tail. If product policy later treats settlements as
        # audit-trail records that must outlive account deletion, swap
        # these specific FKs to ON DELETE SET NULL in a follow-up
        # migration. See declare_foreign_keys migration docstring for
        # the design discussion.
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
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

        # FIXING_ROADMAP §2.1 — indexes on hot tables. Must come AFTER
        # all CREATE TABLE statements above (the table needs to exist
        # before the index can reference it). All CREATE INDEX IF NOT
        # EXISTS so this block is idempotent on every DB shape.
        # Indexes live BOTH here AND in the catchup Alembic revision
        # — same idempotency story, dual-write is a tiny price for the
        # belt-and-braces of "indexes can't disappear on fresh DBs".
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
            "CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_achievements_user "
            "ON user_achievements(user_id, badge_id)",
            "CREATE INDEX IF NOT EXISTS idx_follows_followee "
            "ON follows(followee_id)",
            "CREATE INDEX IF NOT EXISTS idx_follows_follower "
            "ON follows(follower_id)",
            # 2026-05-18 audit fix (critical bug #4): every user-scoped
            # trips query was full-scanning the table. The composite
            # `(user_id, is_public)` index doubles as a leading-column
            # cover for plain `WHERE user_id = ?` lookups, but we keep
            # the bare `idx_trips_user` too — half the size, and the
            # planner picks it for the simple case.
            "CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_trips_user_public "
            "ON trips(user_id, is_public)",
            # 2026-05-18 audit H5: partial UNIQUE on original
            # (non-repost) shares so two concurrent /api/feed/share
            # calls for the same trip can't both INSERT. Reposts are
            # intentionally allowed to multiply — they're filtered
            # out of the constraint via the WHERE clause.
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_posts_unique_original_share "
            "ON feed_posts(user_id, trip_id) WHERE repost_of_post_id IS NULL",
            # 2026-05-26 audit: per-user lookup indexes that were
            # missing. Each is hit by /api/data on every poll AND by
            # the per-user upsert/delete paths. Without these the
            # tables full-scan even at modest user counts.
            "CREATE INDEX IF NOT EXISTS idx_categories_user "
            "ON categories(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_budgets_user "
            "ON budgets(user_id)",
            # notifications.related_id is hit by the daily trip_public
            # dedupe and the delete_trip cleanup. Existing
            # `(user_id, created_at)` index doesn't cover it.
            "CREATE INDEX IF NOT EXISTS idx_notifications_related "
            "ON notifications(related_id)",
            # Indexes that were added in Alembic only — mirror here
            # so fresh DBs (tests, new dev installs) get them too.
            "CREATE INDEX IF NOT EXISTS idx_feed_posts_repost "
            "ON feed_posts(repost_of_post_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_comments_user "
            "ON feed_comments(user_id)",
            # 2026-05-26 audit: prevent duplicate (trip_id, day_number)
            # rows. Frontend has a band-aid dedupe but the underlying
            # race (two browser tabs adding the same day) wasn't
            # prevented at the DB level. Partial UNIQUE so NULL
            # day_numbers (shouldn't happen, but if they do) don't
            # collide. Migration b1d2e3f4c5a7 cleans pre-existing
            # duplicates on prod DBs before adding the index.
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_days_trip_day_number "
            "ON trip_days(trip_id, day_number) "
            "WHERE trip_id IS NOT NULL AND day_number IS NOT NULL",
        ):
            cursor.execute(ddl)

        # FIXING_ROADMAP Model B — one-shot friends→follows data
        # migration. Idempotent (uses INSERT OR IGNORE against the
        # UNIQUE constraint on follows). Stays in init_db rather than
        # Alembic because it's a one-time-ish data backfill, not a
        # schema change.
        try:
            from social import migrate_friends_to_follows
            migrate_friends_to_follows(cursor)
        except Exception as e:
            # Logged + swallowed — a botched migration shouldn't
            # block the rest of init_db.
            print(f"[init_db] friends→follows migration failed: {e}")

        conn.commit()

        # ── Sanity check (FIXING_ROADMAP §1.5/§1.6) ──────────────
        # After everything above runs, every column the app expects
        # MUST be present. If one is missing, the DB is older than
        # the deployed code — caller needs to run
        # `alembic upgrade head` to apply the catchup revision.
        # Raising here (rather than silently degrading) fails LOUDLY
        # at boot, which is the desired behaviour: better to refuse
        # to start than to throw `no such column` errors on every
        # request once the user logs in.
        _assert_schema_current(cursor)


# Columns we expect on each table — sanity-check target. Update this
# every time a new column is added; the catchup Alembic revision
# brings prod up to spec. Tables that ONLY have their baseline
# columns (categories, budgets, trip_members, trip_collaborators,
# trip_days) are listed for completeness so a regression that
# DROPS a column gets caught too.
_EXPECTED_COLUMNS = {
    "users": [
        "id", "email", "name", "picture", "bio", "status",
        "home_currency", "home_country", "language", "token_jti",
        "created_at",
    ],
    "trips": [
        "id", "user_id", "name", "country", "country_code",
        "is_archived", "is_public", "public_show_expenses",
        "place_id", "lat", "lng", "viewport_json", "place_types",
        "companions_json", "marked_places_json", "documents_json",
        "photos_json", "checklist_json", "trip_countries_json",
        "cover_url", "actions_hidden", "share_token", "share_views",
        "share_show_cost", "share_show_plans", "created_at",
    ],
    "expenses": [
        "id", "trip_id", "who", "category_id", "label", "date",
        "country", "value", "currency", "euro_value", "receipt_url",
        "splits_json", "is_settlement",
    ],
    "friends": ["user_id", "friend_id", "status", "created_at"],
    "companions": ["user_id", "name", "linked_user_id", "link_status"],
    "feed_posts": [
        "id", "user_id", "trip_id", "repost_of_post_id", "caption",
        "created_at", "trip_was_public",
    ],
    "follows": ["id", "follower_id", "followee_id", "created_at"],
    "user_achievements": [
        "id", "user_id", "badge_id", "earned_at", "context_json",
    ],
    "settlements": [
        "id", "trip_id", "from_user_id", "to_user_id", "amount",
        "currency", "euro_value", "method", "note", "created_at",
    ],
}


def _assert_schema_current(cursor) -> None:
    """Raise if the live schema is missing any column the app
    expects. Triggered at the end of init_db; the message points the
    operator at the Alembic catchup revision. We don't try to repair —
    that's Alembic's job."""
    missing: list[str] = []
    for table, expected_cols in _EXPECTED_COLUMNS.items():
        try:
            rows = cursor.execute(f"PRAGMA table_info({table})").fetchall()
        except sqlite3.OperationalError as e:
            # `no such table` — table missing entirely.
            if "no such table" in str(e).lower():
                missing.append(f"{table}.<entire table>")
                continue
            raise
        present = {r["name"] for r in rows} if rows and hasattr(rows[0], "keys") else {r[1] for r in rows}
        for col in expected_cols:
            if col not in present:
                missing.append(f"{table}.{col}")
    if missing:
        joined = ", ".join(missing)
        raise RuntimeError(
            "Database schema is stale — missing: "
            f"{joined}. Run `alembic upgrade head` to apply "
            "pending migrations before starting the app."
        )


if __name__ == "__main__":
    init_db()
    print("Database initialized!")
