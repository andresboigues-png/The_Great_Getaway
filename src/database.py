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

    FIXING_ROADMAP §1.4: SQLite hardening. Two PRAGMAs per
    connection — both have to be re-set on every fresh sqlite3
    connection because SQLite scopes PRAGMA state per-connection,
    not per-database. journal_mode=WAL deliberately NOT set: PA's
    networked-filesystem storage broke under WAL with a 2026-05-13
    "database disk image is malformed" incident. Default rollback
    journal + bounded busy_timeout is the safe combo.
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
                        fn.__name__,
                        attempt,
                        max_attempts,
                        delay,
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
                -- Trip Templates feature: 1 = "Creator" account, allowed to
                -- publish trip templates. Granted by the dev account only
                -- (see src/routes/admin.py). The dev email is always treated
                -- as a creator regardless of this flag. Migration
                -- e2a4c6b8d0f1 adds it to existing DBs.
                is_creator INTEGER DEFAULT 0,
                -- Profile privacy: 1 = public (discoverable in search +
                -- viewable by anyone — the historical always-public default);
                -- 0 = private (findable + viewable only by the owner and their
                -- current followers/friends). Migration c3f7a1b9e2d4 adds it to
                -- existing DBs with DEFAULT 1 so no profile silently disappears.
                is_public INTEGER DEFAULT 1,
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
                -- Arrival/departure travel legs (how the traveller gets
                -- to and from the trip). JSON object:
                -- {"arrival": {"mode": "flight", "note": "BA249"},
                --  "departure": {"mode": "car"}} — either leg optional/null.
                -- `mode` is the existing TransportMode union. Trip METADATA
                -- (rides the /api/trips upsert path, NOT the media path).
                -- Null on legacy rows + trips with no legs set. Migration
                -- b0d4f2e6a8c1 adds it to existing DBs.
                travel_json TEXT
                    CHECK(travel_json IS NULL OR json_valid(travel_json)),
                cover_url TEXT,
                -- Trip Hub free-text notes (member-only; surfaced in the
                -- Trip Hub tab). Written via upsert_trip's metadata path,
                -- stripped from public/share read surfaces. Plain TEXT —
                -- no json_valid CHECK. Migration c7e2a9b4d106 adds it to
                -- existing DBs.
                notes TEXT,
                actions_hidden INTEGER DEFAULT 0,
                share_token TEXT,
                share_views INTEGER DEFAULT 0,
                share_show_cost INTEGER DEFAULT 0,
                share_show_plans INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                -- R3-Round 4: optimistic-concurrency primitive.
                -- Per-row write routes stamp this on every UPDATE;
                -- clients send `clientUpdatedAt` back on subsequent
                -- writes so a stale tab can't blind-overwrite. See
                -- migration 1bd4e5f6a7b8.
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                -- 4.8 audit TRIP-4: media-only optimistic-concurrency
                -- stamp, SEPARATE from updated_at (which guards metadata
                -- — name/cover/dates). Bumped by POST /api/trips/<id>/media
                -- so two warm devices editing photos/checklist/markedPlaces
                -- concurrently detect the conflict (409) instead of
                -- silently last-write-wins. NULL = no media version yet.
                -- Migration d0e1f2a3b4c5 adds it to existing DBs.
                media_updated_at DATETIME,
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

        # Trip Templates Table — a "Creator" account publishes a FROZEN,
        # pre-stripped snapshot of one of their trips under a short,
        # human-typeable code. Any user can turn the code into their own
        # new trip ("create from template"). The snapshot lives in
        # snapshot_json and contains ONLY shareable content (name, place,
        # day structure + optional plans/marked-places/checklist per the
        # include_* toggles) — NEVER expenses / settlements / budgets /
        # companions / photos / documents. That pre-strip is the privacy
        # boundary: the public preview endpoint can't leak what isn't
        # stored. Migration e2a4c6b8d0f1 adds this to existing DBs.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trip_templates (
                id TEXT PRIMARY KEY,
                code TEXT UNIQUE NOT NULL,
                owner_id TEXT NOT NULL,
                name TEXT NOT NULL,
                source_trip_id TEXT,
                include_plans INTEGER DEFAULT 1,
                include_places INTEGER DEFAULT 1,
                include_checklist INTEGER DEFAULT 1,
                snapshot_json TEXT
                    CHECK(snapshot_json IS NULL OR json_valid(snapshot_json)),
                use_count INTEGER DEFAULT 0,
                -- Per-template Discover visibility. 1 = listed on the public
                -- Discover feed (default); 0 = unlisted / code-only. Migration
                -- a3f1c9d27e84 adds this to existing DBs (existing rows → 1).
                is_public INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_templates_owner ON trip_templates(owner_id)"
        )

        # Expenses Table — receipt_url added post-baseline (FUTURE_
        # FEATURES #3) for the 📎 attach-receipt flow on the expense
        # form.
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
                -- 2026-05-25 (audit S1): split map (JSON {name: pct}) +
                -- settlement flag. Pre-this-migration, both fields were
                -- frontend-only — every /api/data refresh wiped them so
                -- expenses with uneven splits collapsed to equal share
                -- and settlement rows double-counted. Now persisted.
                splits TEXT CHECK(splits IS NULL OR json_valid(splits)),
                is_settlement INTEGER NOT NULL DEFAULT 0,
                -- 2026-05-26 (audit SY5): soft-delete tombstone. Replaces
                -- hard DELETE on `delete_expense` + /api/sync upsert so
                -- a queued resurrection from an offline device can't
                -- undo a delete that happened on a peer device. See
                -- migration b7c8d9e0f1a2_add_tombstone_columns.
                deleted_at TEXT,
                -- R3-Round 4: optimistic-concurrency primitive (see
                -- the matching column on `trips` above).
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
            )
        ''')
        # Partial index for the future tombstone-cleanup sweep — only
        # tombstoned rows are indexed so the cost stays proportional
        # to the soft-deleted population, not the table size.
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_expenses_deleted "
            "ON expenses(deleted_at) WHERE deleted_at IS NOT NULL"
        )

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
                invitation_status TEXT DEFAULT 'accepted',
                invited_by TEXT,
                -- 2026-05-26 audit #C-1: per-user completion timestamp.
                -- Source of truth for friend_archived_trip feed events
                -- and the achievement timing window. NULL until the
                -- member archives the trip; cleared on unarchive so
                -- re-archiving stamps a fresh time.
                completed_at TIMESTAMP,
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
        # `updated_at` (epoch-ms) is the per-row version stamp for the per-row
        # delta sync (#3): the server applies an incoming upsert only when its
        # updated_at >= the stored row's, so the newer write wins regardless
        # of request order. Fresh DBs get it here; existing DBs via migration
        # b2d4f6a8c0e1.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT,
                user_id TEXT,
                name TEXT,
                icon TEXT,
                color TEXT,
                updated_at INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(id, user_id),
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

        # Category tombstones — record a category deletion (deleted_at,
        # epoch-ms) so a stale tab that still holds the row can't resurrect it
        # via a later upsert whose updated_at predates the delete (#3).
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS category_deletes (
                user_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                deleted_at INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(user_id, category_id),
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
                -- 2026-05-25 (audit B1): filter columns the frontend
                -- always sent but the schema dropped. Without them a
                -- "Food → Sara → €500" budget reloaded as a generic
                -- "all categories → everyone → €500" and aggregated
                -- ALL expenses on the trip, showing fake overspend.
                category_id TEXT,
                owner_name TEXT,
                original_amount REAL,
                original_currency TEXT,
                -- R3-Round 4: optimistic-concurrency primitive.
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE SET NULL,
                -- 2026-05-26 (audit B6): a user can't have two budgets
                -- with the same scope — the spend-against-target sum
                -- doesn't know to split between them, so the same
                -- expenses double-counted under both. Constraint added
                -- via migration e4f5a6b7c8d9; mirrored here for fresh
                -- installs that skip the migration chain.
                UNIQUE(user_id, trip_id, category_id, owner_name)
            )
        ''')

        # Budget tombstones — record a budget deletion (user_id,
        # budget_id, deleted_at) so an offline peer's queued upsert can't
        # resurrect a deleted budget (budgets hard-delete to free the
        # UNIQUE scope slot; the tombstone is the resurrection guard +
        # the Phase-2 `?since=` deletion channel). Mirrors category_deletes.
        # Migration c3e5a7b9d1f0 adds this for existing DBs.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS budget_deletes (
                user_id TEXT NOT NULL,
                budget_id TEXT NOT NULL,
                deleted_at TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (user_id, budget_id),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

        # Trip tombstones — record a (global) trip deletion so a member's
        # offline upsert can't resurrect a trip the owner hard-deleted (the
        # cascade removes the row + trip_members, so an upsert would
        # otherwise re-create it as a childless zombie). Keyed by trip_id
        # alone — trips are shared, so a deletion is global. Also the
        # Phase-2 `?since=` trip-deletion channel. Migration d4f6b8c0e2a1
        # adds this for existing DBs.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS trip_deletes (
                trip_id TEXT PRIMARY KEY,
                deleted_at TEXT NOT NULL DEFAULT ''
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
                -- 2026-05-26 (audit NF1 + NF3): engagement
                -- notifications (share_liked / commented / reposted)
                -- need to know the feed_post they reference, both for
                -- routing (click → land on the post) and for
                -- cascade-cleanup when the underlying share is
                -- deleted. related_id stores the ACTOR user_id; this
                -- column stores the POST id. NULL for non-engagement
                -- types. Migration f5a6b7c8d9e0 adds it; mirrored
                -- here for fresh installs.
                post_id INTEGER,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')
        # Index supporting the cascade-cleanup query on unshare —
        # `DELETE FROM notifications WHERE post_id = ?`. Without it,
        # an unshare scans the whole notifications table.
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_notifications_post_id ON notifications(post_id)"
        )

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
                -- MK6 P2 (be-social#21): did THIS share mint the trip's
                -- share_token (the trip was private with no link)? Set from the
                -- mint UPDATE's rowcount. unshare nulls the token only when this
                -- is 1, so an owner's EXPLICIT share link is never destroyed.
                minted_share_token INTEGER DEFAULT 0,
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
                -- R3-Round 2 fix: stamped on every PATCH so the renderer
                -- can show "(edited)" next to comments whose body has
                -- changed. NULL = never edited.
                edited_at DATETIME,
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
                -- Ordered block content per time-part (text + place-reference
                -- blocks) as JSON: {"morning":[{type,...}],...}. When set it
                -- supersedes the flat morning/afternoon/evening strings, which
                -- are kept in sync (flattened text) for PDF / legacy readers.
                -- Place DATA still lives in trips.marked_places (media path); a
                -- place block only stores its placeId. Migration d4b9f1e7a2c8.
                plan_blocks_json TEXT,
                notes TEXT,
                photos TEXT,
                documents TEXT,
                tip TEXT,
                lat REAL,
                lng REAL,
                -- Wave 2: where you're staying this day. When set via
                -- Places, lat/lng above mirror the hotel (hotel = day pin).
                -- Migration d8f3b1a06c52 adds these to existing DBs.
                accommodation TEXT,
                accommodation_place_id TEXT,
                accommodation_address TEXT,
                -- Transportation P1: the day's "how to get around"
                -- recommendation as JSON {"mode","note"?,"source"?}. NULL =
                -- none set. Validated in services/day_writes.py; written via
                -- the conditional-bind pattern (a payload omitting the key
                -- never clobbers it). Migration a8d2c4f6b1e3.
                transport_json TEXT,
                -- 2026-05-26 (audit SY5): tombstone column — see
                -- migration b7c8d9e0f1a2_add_tombstone_columns and the
                -- matching comment on `expenses` above.
                deleted_at TEXT,
                -- R3-Round 4: optimistic-concurrency primitive.
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE
            )
        ''')
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_trip_days_deleted "
            "ON trip_days(deleted_at) WHERE deleted_at IS NOT NULL"
        )

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

        # Auth Sessions Table (2026-05-27 audit #A-4 — per-device
        # session revocation). Pre-add, every user had a single
        # `users.token_jti` and logout bumped it — invalidating EVERY
        # device. This table holds one row per active session so
        # logout can revoke ONE device without nuking the others.
        # `jti` is the JWT's session-id claim; we look it up here
        # on every verify. `revoked_at` non-NULL = revoked = reject.
        # Legacy JWTs (minted pre-this-change) still verify against
        # `users.token_jti` via the fallback in auth.py.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS auth_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                jti TEXT NOT NULL UNIQUE,
                device_label TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen_at DATETIME,
                revoked_at DATETIME DEFAULT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        ''')

        # Blocks Table (2026-05-26 audit — minimal safety primitive).
        # Symmetric: once A blocks B, B cannot follow A, invite A to
        # a trip, comment / repost on A's shares, or send A any
        # notification. UNIQUE(blocker_id, blocked_id) makes the
        # block op idempotent via the composite PK. CHECK against
        # self-block keeps the row set clean — a self-block is a
        # nonsense state that would have undefined semantics
        # everywhere downstream.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS blocks (
                blocker_id TEXT NOT NULL,
                blocked_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (blocker_id, blocked_id),
                FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE,
                CHECK (blocker_id != blocked_id)
            )
        ''')

        # Profile quotes: short notes other users leave ON a profile
        # (author_id) about its owner (profile_owner_id). New quotes land
        # hidden (is_visible=0) — the owner curates which become publicly
        # visible, so a visitor can't force copy onto someone's profile.
        # CHECK forbids self-quotes. Owner-scoped index backs the list read.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS profile_quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                profile_owner_id TEXT NOT NULL,
                author_id TEXT NOT NULL,
                content TEXT NOT NULL,
                memory_year INTEGER,
                -- NB: no memory_country column. An early design (migration
                -- b2e5d8c3f4a6) added one, but it was never written or read —
                -- the feature landed as memory_trip_id + trip-derived
                -- country_code instead. Dropped from the fresh schema so a
                -- reader isn't misled that a memory carries its own country.
                -- (Migrated prod DBs keep the harmless dead column; SQLite
                -- can't easily DROP it and nothing touches it.)
                memory_trip_id TEXT,
                is_visible INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profile_owner_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (memory_trip_id) REFERENCES trips(id) ON DELETE SET NULL,
                CHECK (profile_owner_id != author_id)
            )
        ''')
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_profile_quotes_owner "
            "ON profile_quotes(profile_owner_id)"
        )

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
                -- R5-B3 soft-revoke. When the rule for an earned
                -- badge no longer passes (un-archive, deleted trip,
                -- etc.) the engine sets `revoked_at = strftime(...)`
                -- instead of DELETEing the row. A subsequent re-earn
                -- clears revoked_at silently — no duplicate
                -- "achievement unlocked" notification. Migration
                -- 2ce5f7a9b1c3 brings prod DBs onto this shape.
                revoked_at DATETIME,
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
                -- R3-Fix #5: party FKs are SET NULL (not CASCADE).
                -- The from_name / to_name snapshot columns below
                -- preserve the display name forever; balance math
                -- reads by name. If we cascaded, Bruno deleting his
                -- account would erase every "Ana paid Bruno €50" row
                -- on Ana's OWN trip and Ana's balance page would
                -- silently regress to pre-payment state.
                from_user_id TEXT,
                to_user_id TEXT,
                -- 2026-05-26 (audit S1 + S6): snapshot the party
                -- display names at settlement-record time so the
                -- balance math doesn't depend on live companion
                -- state. Pre-fix, unlinking a companion after a
                -- settlement was recorded made the name-resolution
                -- helper return undefined → the settlement was
                -- silently skipped from balance shifts → the debt
                -- persisted in the UI as if the payment never
                -- happened. Snapshotting at insert time keeps the
                -- row self-describing.
                from_name TEXT,
                to_name TEXT,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                euro_value REAL,
                method TEXT,
                note TEXT,
                -- 2026-05-26 audit #D-6: the user who actually clicked
                -- save. Distinct from `from_user_id` because any trip
                -- member can record a settlement "on behalf of" the
                -- two parties ("Andre handled it for the four of us").
                -- Pre-add there was no audit trail; a malicious
                -- planner could fabricate "Bob paid Alice €1000"
                -- without either party knowing. The notification body
                -- now mentions the recorder when they're neither
                -- party. ON DELETE SET NULL so recorder deletion
                -- doesn't blow up the row.
                recorded_by TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(trip_id) REFERENCES trips(id) ON DELETE CASCADE,
                FOREIGN KEY(from_user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY(to_user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY(recorded_by) REFERENCES users(id) ON DELETE SET NULL
            )
        ''')

        # R12-B3: settlement-deletion audit trail. Append-only,
        # NO foreign keys — audit rows are immutable historical
        # facts that must survive even if the referenced trip /
        # user / settlement is later deleted (an FK CASCADE would
        # erase the very record we keep). The delete route snapshots
        # the full settlement row + actor (deleted_by) + timestamp
        # here BEFORE the hard DELETE. Mirrored in Alembic migration
        # a1b2c3d4e5f6 (same dual-write idempotency pattern as the
        # indexes — CREATE IF NOT EXISTS so fresh DBs + migrated
        # prod DBs converge).
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS settlements_audit (
                audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                settlement_id TEXT NOT NULL,
                trip_id TEXT,
                from_user_id TEXT,
                to_user_id TEXT,
                from_name TEXT,
                to_name TEXT,
                amount REAL,
                currency TEXT,
                euro_value REAL,
                recorded_by TEXT,
                action TEXT NOT NULL DEFAULT 'deleted',
                actor_id TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # visits: privacy-respecting first-party landing log (see
        # services/visits.py). ANONYMOUS — never linked to an account. Raw
        # IPs are never stored (only a salted hash); we keep the referrer
        # HOST only. Powers the developer dashboard's traffic panel (unique
        # visitors, LinkedIn referrals). Migration b9e3d5c7a1f4.
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS visits (
                id TEXT PRIMARY KEY,
                visitor_id TEXT,
                ip_hash TEXT,
                referrer_host TEXT,
                region TEXT,
                device TEXT,
                browser TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
            "CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at)",
            "CREATE INDEX IF NOT EXISTS idx_visits_visitor ON visits(visitor_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_likes_event ON feed_likes(event_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_bookmarks_event ON feed_bookmarks(event_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_posts_user ON feed_posts(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_posts_trip ON feed_posts(trip_id)",
            "CREATE INDEX IF NOT EXISTS idx_friends_user_status ON friends(user_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_notifications_user_created "
            "ON notifications(user_id, created_at)",
            # MK1 Wave E (T2-5): leading-user_id index — the trip_user
            # composite above leads on trip_id, so by-user queries (the
            # /api/data poll's batched ACL sets, achievements sweep)
            # scanned. Partial indexes for serve_upload's exact-match ACL
            # fallbacks (receipts + covers) — tiny, most rows are NULL.
            # Mirrored in migration e7b2c4d9f1a3.
            "CREATE INDEX IF NOT EXISTS idx_trip_members_user ON trip_members(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_expenses_receipt_url "
            "ON expenses(receipt_url) WHERE receipt_url IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS idx_trips_cover_url "
            "ON trips(cover_url) WHERE cover_url IS NOT NULL",
            "CREATE INDEX IF NOT EXISTS idx_trip_members_trip_user "
            "ON trip_members(trip_id, user_id)",
            "CREATE INDEX IF NOT EXISTS idx_expenses_trip ON expenses(trip_id)",
            "CREATE INDEX IF NOT EXISTS idx_trip_days_trip ON trip_days(trip_id)",
            "CREATE INDEX IF NOT EXISTS idx_settlements_trip ON settlements(trip_id)",
            # R12-B3: audit-trail lookups — deletion history per
            # settlement + "what did this actor delete".
            "CREATE INDEX IF NOT EXISTS idx_settlements_audit_settlement "
            "ON settlements_audit(settlement_id)",
            "CREATE INDEX IF NOT EXISTS idx_settlements_audit_actor ON settlements_audit(actor_id)",
            "CREATE INDEX IF NOT EXISTS idx_user_achievements_user "
            "ON user_achievements(user_id, badge_id)",
            "CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id)",
            "CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)",
            # 2026-05-18 audit fix (critical bug #4): every user-scoped
            # trips query was full-scanning the table. The composite
            # `(user_id, is_public)` index doubles as a leading-column
            # cover for plain `WHERE user_id = ?` lookups, but we keep
            # the bare `idx_trips_user` too — half the size, and the
            # planner picks it for the simple case.
            "CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_trips_user_public ON trips(user_id, is_public)",
            # 2026-05-18 audit H5: partial UNIQUE on original
            # (non-repost) shares so two concurrent /api/feed/share
            # calls for the same trip can't both INSERT. Reposts are
            # intentionally allowed to multiply — they're filtered
            # out of the constraint via the WHERE clause.
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_posts_unique_original_share "
            "ON feed_posts(user_id, trip_id) WHERE repost_of_post_id IS NULL",
            # 2026-05-26 audit safety primitive: the block-check is hit
            # by every follow / invite / comment / notification path
            # with `WHERE blocker_id = ? AND blocked_id = ?` or the
            # reverse. The composite PK already covers the forward
            # lookup; this extra index covers `WHERE blocked_id = ?`
            # (used by `is_blocked_by` to ask "did THIS user block
            # me?" — direction-reversed).
            "CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)",
            # 2026-05-27 audit #A-4: per-user session listing for
            # /api/auth/sessions. UNIQUE on jti is enforced by the
            # column constraint; this index covers
            # `WHERE user_id = ? AND revoked_at IS NULL` lookups.
            "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user "
            "ON auth_sessions(user_id, revoked_at)",
            # 2026-05-26 audit: per-user lookup indexes that were
            # missing. Each is hit by /api/data on every poll AND by
            # the per-user upsert/delete paths. Without these the
            # tables full-scan even at modest user counts.
            "CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id)",
            # R9-B2 H2: partial UNIQUE index for the all-NULL filter
            # shape (trip-wide, all-categories, all-people). SQLite
            # treats NULL != NULL for UNIQUE constraints, so the
            # existing UNIQUE(user_id, trip_id, category_id,
            # owner_name) constraint at the CREATE TABLE level
            # cannot dedupe this most-common case. Migration
            # 3df6a8b0c2d4 brings prod onto this shape.
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "idx_budgets_user_trip_generic "
            "ON budgets(user_id, trip_id) "
            "WHERE category_id IS NULL AND owner_name IS NULL",
            # MK4 audit BUD-7: the base UNIQUE(user_id, trip_id,
            # category_id, owner_name) only bites when ALL four columns
            # are non-NULL (SQLite treats NULL as DISTINCT), and the
            # all-NULL partial index above only covers the both-NULL
            # shape. The two HALF-scoped shapes — (category set, owner
            # NULL) and (owner set, category NULL) — had NO DB-level
            # dedupe at all, so they relied entirely on the per-row POST's
            # app-level `IS` pre-check. Add a partial UNIQUE index for
            # each so the DB enforces one-budget-per-scope on every write
            # path. Migration a1f4c7e2b9d3 brings existing DBs onto these.
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "idx_budgets_user_trip_cat "
            "ON budgets(user_id, trip_id, category_id) "
            "WHERE category_id IS NOT NULL AND owner_name IS NULL",
            "CREATE UNIQUE INDEX IF NOT EXISTS "
            "idx_budgets_user_trip_owner "
            "ON budgets(user_id, trip_id, owner_name) "
            "WHERE owner_name IS NOT NULL AND category_id IS NULL",
            # R9-B2 M1: secondary index so /api/data's join on
            # trip_collaborators.user_id can use an index. The
            # table's PK is (trip_id, user_id) — leading col is
            # trip_id, so SQLite can't use the PK for a
            # user-side predicate. Migration 3df6a8b0c2d4 same.
            "CREATE INDEX IF NOT EXISTS idx_trip_collaborators_user ON trip_collaborators(user_id)",
            # notifications.related_id is hit by the daily trip_public
            # dedupe and the delete_trip cleanup. Existing
            # `(user_id, created_at)` index doesn't cover it.
            "CREATE INDEX IF NOT EXISTS idx_notifications_related ON notifications(related_id)",
            # Indexes that were added in Alembic only — mirror here
            # so fresh DBs (tests, new dev installs) get them too.
            "CREATE INDEX IF NOT EXISTS idx_feed_posts_repost ON feed_posts(repost_of_post_id)",
            "CREATE INDEX IF NOT EXISTS idx_feed_comments_user ON feed_comments(user_id)",
            # 2026-05-26 audit: prevent duplicate (trip_id, day_number)
            # rows. Frontend has a band-aid dedupe but the underlying
            # race (two browser tabs adding the same day) wasn't
            # prevented at the DB level. Partial UNIQUE so NULL
            # day_numbers (shouldn't happen, but if they do) don't
            # collide. Migration b1d2e3f4c5a7 cleans pre-existing
            # duplicates on prod DBs before adding the index.
            #
            # 4.8 audit TRIP-2 fix: the index now also excludes
            # tombstoned rows (`deleted_at IS NULL`). Pre-fix a
            # soft-deleted day kept occupying its (trip_id, day_number)
            # slot, so the client's renumber-after-delete collided with
            # the tombstone and 500'd (see DAY-1). Excluding tombstones
            # frees the slot the moment a day is deleted. Migration
            # c9d0e1f2a3b4 rebuilds the index on prod DBs.
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_days_trip_day_number "
            "ON trip_days(trip_id, day_number) "
            "WHERE trip_id IS NOT NULL AND day_number IS NOT NULL "
            "  AND deleted_at IS NULL",
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
            # R11-B3: route through the structured logger so Sentry's
            # LoggingIntegration captures the exception. Pre-fix this
            # printed to stdout, which on PA goes nowhere durable + is
            # invisible to Sentry. `exc_info=True` attaches the full
            # traceback for offline triage.
            logger.warning(
                "init_db: friends→follows migration failed: %s",
                e,
                exc_info=True,
            )

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
        # R11-B3: warn if `alembic_version` is missing on a DB that has
        # real data. Catches the deploy footgun where someone forgets
        # `alembic upgrade head` on a fresh PA pull — init_db's
        # CREATE TABLE IF NOT EXISTS keeps the schema usable, but the
        # next migration thinks the DB is at no version and may apply
        # an already-present DDL → crash. A WARN doesn't refuse to
        # start (would block legitimate fresh-install boot) but pings
        # the operator clearly in the error log.
        _check_alembic_head(cursor)


# Columns we expect on each table — sanity-check target. Update this
# every time a new column is added; the catchup Alembic revision
# brings prod up to spec. Tables that ONLY have their baseline
# columns (categories, budgets, trip_members, trip_collaborators,
# trip_days) are listed for completeness so a regression that
# DROPS a column gets caught too.
_EXPECTED_COLUMNS = {
    # Anonymous first-party visit log (migration b9e3d5c7a1f4). Read by the
    # admin traffic panel; written best-effort on GET "/" (services/visits.py).
    "visits": [
        "id",
        "visitor_id",
        "ip_hash",
        "referrer_host",
        "region",
        "device",
        "browser",
        "created_at",
    ],
    "users": [
        "id",
        "email",
        "name",
        "picture",
        "bio",
        "status",
        "home_currency",
        "home_country",
        "language",
        "token_jti",
        "created_at",
        # MK6 P2: is_creator was missing here, so a stale DB (pre-migration
        # e2a4c6b8d0f1) booted clean, passed _assert_schema_current, then 500'd
        # EVERY login — auth.py SELECTs it on the golden path (user-status /
        # login). The tripwire exists precisely to fail LOUDLY at boot instead.
        "is_creator",
        # Profile privacy flag (migration c3f7a1b9e2d4). SELECTed on the login /
        # user-status golden path (auth.py), so a stale DB missing it would 500
        # every login — same failure mode as is_creator above.
        "is_public",
    ],
    "trips": [
        "id",
        "user_id",
        "name",
        "country",
        "country_code",
        "is_archived",
        "is_public",
        "public_show_expenses",
        "place_id",
        "lat",
        "lng",
        "viewport_json",
        "place_types",
        "companions_json",
        "marked_places_json",
        "documents_json",
        "photos_json",
        "checklist_json",
        "trip_countries_json",
        # Arrival/departure travel legs (metadata path; migration
        # b0d4f2e6a8c1). JSON object of TravelLeg entries.
        "travel_json",
        "cover_url",
        "notes",
        "actions_hidden",
        "share_token",
        "share_views",
        "share_show_cost",
        "share_show_plans",
        "created_at",
        # R3-Round 4: optimistic-concurrency primitive.
        "updated_at",
        # 4.8 audit TRIP-4: media-only optimistic-concurrency stamp.
        "media_updated_at",
    ],
    "expenses": [
        "id",
        "trip_id",
        "who",
        "category_id",
        "label",
        "date",
        "country",
        "value",
        "currency",
        "euro_value",
        "receipt_url",
        # 2026-05-25: split map + settlement flag persisted (audit S1).
        "splits",
        "is_settlement",
        # 2026-05-26: soft-delete tombstone (audit SY5).
        "deleted_at",
        # R3-Round 4: optimistic-concurrency primitive.
        "updated_at",
    ],
    "friends": ["user_id", "friend_id", "status", "created_at"],
    "companions": ["user_id", "name", "linked_user_id", "link_status"],
    "feed_posts": [
        "id",
        "user_id",
        "trip_id",
        "repost_of_post_id",
        "caption",
        "created_at",
        "trip_was_public",
        # MK6 P2: tracks whether the feed-share minted the trip's share_token.
        "minted_share_token",
    ],
    "feed_likes": ["user_id", "event_id", "created_at"],
    "feed_bookmarks": ["user_id", "event_id", "created_at"],
    "feed_comments": ["id", "event_id", "user_id", "body", "created_at", "edited_at"],
    "follows": ["id", "follower_id", "followee_id", "created_at"],
    "user_achievements": [
        "id",
        "user_id",
        "badge_id",
        "earned_at",
        "context_json",
        "revoked_at",
    ],
    "settlements": [
        "id",
        "trip_id",
        "from_user_id",
        "to_user_id",
        # 2026-05-26: name snapshots so balance math survives an
        # unlinked companion (audit S1+S6).
        "from_name",
        "to_name",
        "amount",
        "currency",
        "euro_value",
        "method",
        "note",
        # 2026-05-26 audit #D-6: who clicked save (may differ from
        # from_user_id when planner records on behalf of others).
        "recorded_by",
        "created_at",
    ],
    "trip_members": [
        "trip_id",
        "user_id",
        "role",
        "is_archived",
        "invitation_status",
        "invited_by",
        # 2026-05-26 audit #C-1: per-user completion timestamp.
        "completed_at",
    ],
    "trip_collaborators": ["trip_id", "user_id"],
    "trip_days": [
        "id",
        "trip_id",
        "day_number",
        "date",
        "name",
        "morning",
        "afternoon",
        "evening",
        # Day-plan block content (migration d4b9f1e7a2c8). Was missing from
        # this tripwire since it shipped — a stale DB without it would boot
        # clean then fail on every day read/write. Pinned alongside the
        # transport column (Transportation P1 map flagged the omission).
        "plan_blocks_json",
        "notes",
        "photos",
        "documents",
        "tip",
        "lat",
        "lng",
        # Wave 2: day accommodation.
        "accommodation",
        "accommodation_place_id",
        "accommodation_address",
        # Transportation P1 (migration a8d2c4f6b1e3).
        "transport_json",
        # 2026-05-26: tombstone (audit SY5).
        "deleted_at",
        # R3-Round 4: optimistic-concurrency primitive.
        "updated_at",
    ],
    # MK6 P2: updated_at (migration b2d4f6a8c0e1) drives the per-row category
    # delta sync; omitting it from the tripwire let a stale DB boot then break
    # the delta path.
    "categories": ["id", "user_id", "name", "icon", "color", "updated_at"],
    "budgets": [
        "id",
        "user_id",
        "trip_id",
        "label",
        "amount",
        "currency",
        # 2026-05-25 audit B1: filter columns that fresh DBs always had
        # but the schema-check didn't enforce — regressions slipped through.
        "category_id",
        "owner_name",
        "original_amount",
        "original_currency",
        # R3-Round 4: optimistic-concurrency primitive.
        "updated_at",
    ],
    "notifications": [
        "id",
        "user_id",
        "type",
        "title",
        "related_id",
        "message",
        "is_read",
        "created_at",
        # 2026-05-26 (audit NF1 + NF3): post_id for engagement notifs.
        "post_id",
    ],
    "auth_sessions": [
        "id",
        "user_id",
        "jti",
        "device_label",
        "created_at",
        "last_seen_at",
        "revoked_at",
    ],
    "blocks": ["blocker_id", "blocked_id", "created_at"],
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
        present = (
            {r["name"] for r in rows} if rows and hasattr(rows[0], "keys") else {r[1] for r in rows}
        )
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


def _check_alembic_head(cursor) -> None:
    """R11-B3: WARN-log when `alembic_version` is absent on a DB that
    looks populated. Doesn't raise — a fresh install (no users yet) is
    valid and we shouldn't refuse to start in that case.

    Heuristic: if the `users` table has at least one row, this is a
    real deployment and alembic_version SHOULD exist. If it's missing,
    the operator very likely forgot `alembic upgrade head` on the
    deploy chain → the next schema migration will misbehave.

    Idempotent + safe — every branch swallows its own exceptions so a
    broken check never blocks boot."""
    try:
        cursor.execute("SELECT COUNT(*) AS c FROM users")
        user_count = cursor.fetchone()["c"]
    except Exception:
        # No users table → genuinely fresh DB → skip.
        return
    if user_count == 0:
        # Fresh install — alembic_version is fine to be missing.
        return
    try:
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version'"
        )
        row = cursor.fetchone()
    except Exception:
        return
    if row is not None:
        return  # alembic_version exists, all good.
    logger.warning(
        "init_db: alembic_version table is MISSING on a non-fresh DB "
        "(users=%d). The next alembic migration will likely misbehave. "
        "Run `alembic stamp head` to mark this DB as current, then "
        "future migrations run from there.",
        user_count,
    )


if __name__ == "__main__":
    init_db()
    # R12-B5: logger, not print() — keeps the module consistent with
    # observability.py's "no print for diagnostics" rule even on the
    # __main__ path (a dev running `python database.py` directly).
    logger.info("Database initialized")
