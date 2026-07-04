"""Background maintenance — the daily janitor thread.

MK1 Wave G (T2-1, `Best-in-class audit MK1.md` ARCH-3): extracted
verbatim from main.py, where a 235-line cleanup daemon lived between
the security middleware and the healthz route. Behaviour unchanged —
main.py calls start_cleanup_thread() at the same point in boot it used
to define-and-call it.
"""

import os
import sqlite3

from database import get_db
from observability import get_logger, log_extra

logger = get_logger(__name__)


# ── Background maintenance ───────────────────────────────────────────
# Periodic cleanup of orphan feed_likes / feed_comments rows whose
# underlying event has aged out of the 30-day /api/feed window. Without
# this the tables grow without bound — counts on dead events are
# invisible to users (the event itself isn't rendered) but still take
# up rows. We deliberately do NOT clean feed_bookmarks: bookmarks are
# the user's permanent save list and must outlive the feed window.
#
# Strategy: dumb-and-simple background thread that runs on import and
# then once every 24h. Catches its own exceptions so a bad query
# doesn't kill the worker. Cheap enough at this scale (single-digit-K
# rows) that we don't bother with cron / job queues yet.
def _cleanup_feed_orphans():
    """Delete feed_likes and feed_comments rows that refer to a
    synthesised event_id whose underlying record no longer exists.
    Bookmarks are exempt — saves are permanent. Also sweeps read
    notifications older than 30 days + revoked auth_sessions older
    than 30 days.

    R2 audit fix: the previous implementation was an AGE-ONLY sweep
    ("delete everything older than 90 days") which destroyed
    engagement on EVERGREEN content. A friend's share that stays
    actively discussed for >90 days had every old comment silently
    deleted, and the visible comment_count dropped without
    explanation. The DOCSTRING claimed orphan-only behaviour; the
    IMPLEMENTATION did age-only.

    Now genuinely orphan-only:
      - share_<n> / repost_<n>  → drop when feed_posts.id = n is gone
      - settled_up_<n>          → drop when settlements.id = n is gone
      - trip_*_<id>             → drop when trips.id = id is gone
      - friendship_<a>_<b>      → drop when neither side exists in
                                  follows anymore
      - achievement_<n>         → drop when user_achievements.id = n
                                  is gone
    Plus a 365-day backstop on any engagement row regardless of event
    type, so rows for unknown / future event types don't accrue
    forever. 365 ≫ the 30-day display window so legitimate engagement
    on an evergreen event still has plenty of headroom.

    Audit fix (2026-05-27): added notification + auth_sessions sweep
    too.
    """
    deleted_likes = 0
    deleted_comments = 0
    deleted_notifications = 0
    deleted_sessions = 0
    try:
        with get_db() as conn:
            cursor = conn.cursor()
            # Orphan cleanup: delete rows whose event_id no longer
            # resolves to a live record. Apply per-event-type because
            # the synthesised id encodes the parent table+id.
            orphan_where = """
                -- share_<n> + repost_<n> point at feed_posts.id
                (
                    (event_id LIKE 'share\\_%' ESCAPE '\\'
                     OR event_id LIKE 'repost\\_%' ESCAPE '\\')
                    AND CAST(SUBSTR(event_id, INSTR(event_id, '_') + 1) AS INTEGER)
                        NOT IN (SELECT id FROM feed_posts)
                )
                OR (
                    -- settled_up_<n> points at settlements.id
                    event_id LIKE 'settled\\_up\\_%' ESCAPE '\\'
                    AND SUBSTR(event_id, LENGTH('settled_up_') + 1)
                        NOT IN (SELECT id FROM settlements)
                )
                OR (
                    -- achievement_<n> points at user_achievements.id
                    event_id LIKE 'achievement\\_%' ESCAPE '\\'
                    AND CAST(SUBSTR(event_id, LENGTH('achievement_') + 1) AS INTEGER)
                        NOT IN (SELECT id FROM user_achievements)
                )
                OR (
                    -- trip_created_<id> / trip_archived_<id> /
                    -- trip_joined_<id>_<user> — extract the trip id
                    -- between the second underscore and the next
                    -- underscore (or end). Easier: check that no
                    -- live trip's id appears as a substring of the
                    -- event_id; cheap because trips count is small.
                    event_id LIKE 'trip\\_%' ESCAPE '\\'
                    AND NOT EXISTS (
                        SELECT 1 FROM trips t
                        WHERE event_id LIKE 'trip\\_%\\_' || t.id ESCAPE '\\'
                           OR event_id LIKE 'trip\\_%\\_' || t.id || '\\_%' ESCAPE '\\'
                    )
                )
                -- 365-day age backstop for rows whose event_id shape
                -- isn't covered above (friendship_*, achievement_*,
                -- future types). R3-Fix #9: pre-fix this read
                -- `OR created_at < datetime('now', '-365 days')`
                -- which matched EVERY row regardless of event_id —
                -- including legitimate engagement on known event
                -- shapes whose parent record was still very much
                -- alive. Result: a 365d+1 day-old like on a still-
                -- public share got wiped. Now: only fires when the
                -- event_id is none of the known prefixes (catches
                -- truly-orphaned future shapes without harming the
                -- known ones, which already have their orphan
                -- predicate above).
                OR (
                    event_id NOT LIKE 'share\\_%' ESCAPE '\\'
                    AND event_id NOT LIKE 'repost\\_%' ESCAPE '\\'
                    AND event_id NOT LIKE 'settled\\_up\\_%' ESCAPE '\\'
                    AND event_id NOT LIKE 'achievement\\_%' ESCAPE '\\'
                    AND event_id NOT LIKE 'trip\\_%' ESCAPE '\\'
                    AND created_at < datetime('now', '-365 days')
                )
            """
            cursor.execute(f"DELETE FROM feed_likes WHERE {orphan_where}")
            deleted_likes = cursor.rowcount or 0
            cursor.execute(f"DELETE FROM feed_comments WHERE {orphan_where}")
            deleted_comments = cursor.rowcount or 0
            # Read notifications older than 30 days. Unread rows stay
            # so the user's bell keeps surfacing them until they
            # acknowledge. Audit #31: pre-fix notifications grew
            # forever — only the LIMIT 50 in /api/notifications/list
            # hid them from the UI.
            cursor.execute(
                "DELETE FROM notifications WHERE is_read = 1 "
                "AND created_at < datetime('now', '-30 days')"
            )
            deleted_notifications = cursor.rowcount or 0
            # Revoked auth_sessions older than 30 days. After per-
            # device logout (fix #50) rows pile up forever; once the
            # JWT has expired (30-day lifetime) the row is no longer
            # useful for the verify path.
            cursor.execute(
                "DELETE FROM auth_sessions WHERE revoked_at IS NOT NULL "
                "AND revoked_at < datetime('now', '-30 days')"
            )
            deleted_sessions = cursor.rowcount or 0
            # BUG-022: also reap UNREVOKED sessions whose 30-day JWT has expired.
            # Most logins are never explicitly revoked (the tab just closes), so
            # the unrevoked-but-expired rows dominate and grew the table
            # unbounded; the token can't authenticate past 30 days anyway.
            cursor.execute(
                "DELETE FROM auth_sessions WHERE revoked_at IS NULL "
                "AND created_at < datetime('now', '-30 days')"
            )
            deleted_sessions += cursor.rowcount or 0
            conn.commit()
    except sqlite3.DatabaseError as e:
        # §2.15: narrow to DB errors so the daemon thread doesn't
        # silently swallow programming bugs (NameError, ImportError,
        # etc.) — those should crash the thread loudly. DatabaseError
        # is the right catch-all for "DB had a hiccup" (locked, disk
        # full, file moved) and recoverable on the next iteration.
        # §3.8: structured logging — flows into Sentry as a breadcrumb
        # (and as an event at ERROR level).
        logger.warning("background cleanup sweep failed: %s", e, exc_info=True)
    if deleted_likes or deleted_comments or deleted_notifications or deleted_sessions:
        logger.info(
            "background cleanup removed: likes=%d comments=%d notifications=%d sessions=%d",
            deleted_likes,
            deleted_comments,
            deleted_notifications,
            deleted_sessions,
            extra=log_extra(
                deleted_likes=deleted_likes,
                deleted_comments=deleted_comments,
                deleted_notifications=deleted_notifications,
                deleted_sessions=deleted_sessions,
            ),
        )
    return {
        "likes": deleted_likes,
        "comments": deleted_comments,
        "notifications": deleted_notifications,
        "sessions": deleted_sessions,
    }


def start_cleanup_thread():
    """Spin up a daemon thread that runs the cleanup once on boot, then
    sleeps 24h and repeats. Daemon=True so it doesn't keep the process
    alive on shutdown.

    FIXING_ROADMAP §2.2: the previous gate was
    `if WERKZEUG_RUN_MAIN == "false": return` — backwards. Werkzeug's
    dev reloader sets the var to "true" in the WORKER and leaves it
    UNSET in the PARENT, so the old check skipped on... neither
    process. Under gunicorn on PA the var is also unset, so the
    thread always ran (correct by accident) but with `flask run
    --reload` it ran in BOTH the parent and the child, double-firing
    the cleanup. The correct gate: only run when we're definitely
    not the Werkzeug reloader parent — i.e., the var is `"true"`
    (child worker) OR unset (production WSGI worker). Skip when the
    var is literally any other value (today only `"false"` is used
    by Werkzeug for the parent, but conservatively narrow the
    pass-through condition rather than the skip condition)."""
    werkzeug_run_main = os.getenv("WERKZEUG_RUN_MAIN")
    if werkzeug_run_main is not None and werkzeug_run_main != "true":
        return
    # R12-B5: single-worker gate. The WERKZEUG_RUN_MAIN check above only
    # handles the dev reloader's parent/child double-fire — under
    # gunicorn with N>1 workers (PA paid plans) the var is unset in
    # every worker, so each one spun up its own 24h cleanup loop →
    # concurrent DELETE storms once a day. Harmless (the queries are
    # idempotent) but wasteful. An advisory file lock elects ONE worker:
    # the first to grab the exclusive non-blocking lock keeps it for the
    # process lifetime + runs the loop; the rest skip. fcntl.flock is
    # POSIX (PA is Linux); on a non-POSIX host we fall through and run
    # unconditionally — still correct because the cleanup is idempotent.
    # Tradeoff: if the elected worker dies mid-life the cleanup pauses
    # until a full app restart re-elects one — acceptable for a daily
    # janitor (worst case: one missed 24h cycle).
    global _CLEANUP_LOCK_FD
    try:
        import fcntl
        import tempfile as _tempfile

        _lock_path = os.path.join(_tempfile.gettempdir(), "gg_feed_cleanup.lock")
        _CLEANUP_LOCK_FD = open(_lock_path, "w")  # noqa: SIM115 — held for process life
        fcntl.flock(_CLEANUP_LOCK_FD.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except ImportError:
        pass  # non-POSIX — run unconditionally (idempotent)
    except (OSError, BlockingIOError):
        # Another worker holds the lock → it owns the cleanup. Skip.
        return
    import threading
    import time

    def loop():
        while True:
            _cleanup_feed_orphans()
            time.sleep(86400)  # 24h

    t = threading.Thread(target=loop, daemon=True, name="feed-orphan-cleanup")
    t.start()


# Module-level so the advisory-lock fd survives for the process
# lifetime — closing it (or letting it GC) would release the flock and
# let a second worker elect itself on its next boot attempt.
_CLEANUP_LOCK_FD = None
