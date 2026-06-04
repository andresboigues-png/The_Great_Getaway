"""Admin / developer dashboard endpoints.

Single-tenant admin surface — gated to one specific email address
(see ADMIN_EMAILS below). Returns app-wide stats + a user roster so
the operator can see who's actually using the app without having to
SSH into PA and run sqlite queries.

Security contract:
- Every endpoint requires `@require_auth`.
- Inside each handler we explicitly check the caller's email against
  ADMIN_EMAILS. Non-admins get 403 with no leaked information about
  whether the endpoint exists.
- The user-visible Settings menu hides the Developer card unless the
  signed-in user's email matches, but that's a UX nicety — the real
  gate is here on the server. Anyone who finds the URL and isn't on
  the allow-list gets 403.

Add new admin emails by editing ADMIN_EMAILS below (intentionally a
constant, not env-driven — admin access is meaningful enough to want
the audit trail of a code change). Future: move to a `is_admin` flag
on the users table if the allowlist grows past 2-3 names.
"""

import logging
import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify

from auth import require_auth, current_user_id
from database import get_db
from extensions import limiter
from helpers import json_body


logger = logging.getLogger(__name__)
bp = Blueprint("admin", __name__)


# Hardcoded admin allowlist. One email today; add more on a needs-
# basis. The user table's email is the source of truth — JWT carries
# the user_id only, so we look up the email per request rather than
# embedding it in the token.
ADMIN_EMAILS = {
    "andres.boigues@gmail.com",
}


def _is_admin(user_id: str) -> bool:
    """True iff `user_id` belongs to one of the admin emails. Cheap
    one-row SELECT; cached implicitly by SQLite's page cache so the
    cost is negligible even on every admin request.

    2026-05-26: `get_db()` is now a contextmanager that closes the
    connection on exit, so the `closing(...)` wrapper this function
    used to need is no longer required."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT email FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        if not row:
            return False
        return (row["email"] or "").strip().lower() in ADMIN_EMAILS


@bp.route("/api/admin/stats", methods=["GET"])
@limiter.limit("60/minute")
@require_auth
def admin_stats():
    """App-wide stats + user roster for the developer dashboard.

    Returns JSON:
        {
            "totalUsers": int,
            "totalTrips": int,
            "totalArchivedTrips": int,
            "totalExpenses": int,
            "totalSettlements": int,
            "totalFeedPosts": int,
            "signupsLast7d": int,
            "signupsLast30d": int,
            "users": [{
                "id": str,
                "email": str,
                "name": str,
                "picture": str | null,
                "createdAt": str,        # ISO timestamp
                "lastSeenAt": str | null,  # from sessions; null if never
                "tripCount": int,
                "expenseCount": int,
                "isAdmin": bool,
            }, ...]
        }

    403 for non-admin callers.
    """
    user_id = current_user_id()
    if not _is_admin(user_id):
        # Audit fix (2026-05-27): record denied attempts so prod
        # can spot someone probing the admin surface.
        logger.warning(
            "admin_stats forbidden",
            extra={"user_id": user_id, "endpoint": "admin_stats"},
        )
        return jsonify({"error": "Forbidden"}), 403

    # Audit fix (2026-05-27): structured INFO log on every admin
    # call so prod logs record who hit what + when. Pre-fix there
    # was no audit trail for admin operations — if an admin's
    # session was ever compromised, there'd be no way to enumerate
    # which user records had been viewed. The roster contains
    # every user's email + counters, so this read IS sensitive.
    logger.info(
        "admin_stats accessed",
        extra={"user_id": user_id, "endpoint": "admin_stats"},
    )

    # 2026-05-26: `get_db()` is now itself a contextmanager that
    # releases the FD on exit, so the `closing(...)` wrapper is no
    # longer needed.
    with get_db() as conn:
        cursor = conn.cursor()

        # ── Aggregate counters ────────────────────────────────────
        # All cheap COUNT(*) queries; even with 10k users + 100k
        # expenses this lands in a few ms on SQLite's page cache.
        cursor.execute("SELECT COUNT(*) AS n FROM users")
        total_users = cursor.fetchone()["n"]

        # 2026-05-18 audit H1: archive state lives on trip_members
        # (per-user). For the global "active vs archived" admin counter,
        # we read from the owner's row (the row where trip_members.user_id
        # equals trips.user_id) — semantically the same as the legacy
        # trips.is_archived column the archive endpoint used to mirror,
        # but read from the post-deprecation source of truth.
        cursor.execute(
            "SELECT COUNT(*) AS n FROM trips t "
            "JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = t.user_id "
            "WHERE COALESCE(tm.is_archived, 0) = 0"
        )
        total_trips = cursor.fetchone()["n"]

        cursor.execute(
            "SELECT COUNT(*) AS n FROM trips t "
            "JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = t.user_id "
            "WHERE COALESCE(tm.is_archived, 0) = 1"
        )
        total_archived_trips = cursor.fetchone()["n"]

        cursor.execute("SELECT COUNT(*) AS n FROM expenses")
        total_expenses = cursor.fetchone()["n"]

        cursor.execute("SELECT COUNT(*) AS n FROM settlements")
        total_settlements = cursor.fetchone()["n"]

        # feed_posts may not exist on older schemas — guard the query.
        try:
            cursor.execute("SELECT COUNT(*) AS n FROM feed_posts")
            total_feed_posts = cursor.fetchone()["n"]
        except Exception:
            total_feed_posts = 0

        # Recent-signup activity. Two windows: 7d and 30d.
        # SQLite's `datetime(now, '-7 days')` returns a comparable string.
        cursor.execute(
            """
            SELECT COUNT(*) AS n FROM users
            WHERE created_at >= datetime('now', '-7 days')
            """
        )
        signups_last_7d = cursor.fetchone()["n"]
        cursor.execute(
            """
            SELECT COUNT(*) AS n FROM users
            WHERE created_at >= datetime('now', '-30 days')
            """
        )
        signups_last_30d = cursor.fetchone()["n"]

        # ── User roster ───────────────────────────────────────────
        # One row per user. Trip and expense counts come from
        # subqueries so we get them in a single result set without N+1.
        # No last-seen yet — the users table doesn't carry a session/
        # last-login timestamp. The token_jti column is bumped on
        # logout but its value isn't a timestamp, so we can't derive
        # last-seen from it. Future: add a `last_seen_at` column +
        # touch it on every successful require_auth lookup.
        # Note: the expenses table keys off trip_id (not user_id); the
        # user is implicit through the parent trip. JOIN through trips
        # so we count expenses belonging to trips owned by each user.
        # Same pattern would apply if we ever want a per-user settlement
        # count later.
        cursor.execute(
            """
            SELECT
                u.id,
                u.email,
                u.name,
                u.picture,
                u.created_at,
                u.is_creator,
                (SELECT COUNT(*) FROM trips t WHERE t.user_id = u.id) AS trip_count,
                -- 2026-05-26 (audit SY5): per-user expense count
                -- excludes tombstoned rows so the admin dashboard
                -- matches what the user sees in /api/data. Global
                -- expense count above still includes tombstones for
                -- storage-capacity tracking.
                (SELECT COUNT(*)
                    FROM expenses e
                    JOIN trips t ON e.trip_id = t.id
                    WHERE t.user_id = u.id AND e.deleted_at IS NULL) AS expense_count
            FROM users u
            ORDER BY u.created_at DESC
            """
        )
        user_rows = cursor.fetchall()

        users = []
        for row in user_rows:
            email = (row["email"] or "").strip().lower()
            is_admin = email in ADMIN_EMAILS
            users.append({
                "id": row["id"],
                "email": row["email"],
                "name": row["name"],
                "picture": row["picture"],
                "createdAt": row["created_at"],
                "tripCount": row["trip_count"],
                "expenseCount": row["expense_count"],
                "isAdmin": is_admin,
                # Trip Templates: the dev is always a creator; others need
                # the granted flag. UI shows the toggle off the effective value.
                "isCreator": bool(row["is_creator"]) or is_admin,
            })

    # ── Process metadata (for fun + diagnostics) ──────────────
    process_info = {
        "serverTime": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "dbPath": os.getenv("GG_DB_PATH", "travel_planner.db"),
        # Gemini host-key pool snapshot — useful to spot when the
        # shared pool is partially or fully drained.
        "geminiHostKeys": _gemini_pool_snapshot(),
    }

    return jsonify({
        "totalUsers": total_users,
        "totalTrips": total_trips,
        "totalArchivedTrips": total_archived_trips,
        "totalExpenses": total_expenses,
        "totalSettlements": total_settlements,
        "totalFeedPosts": total_feed_posts,
        "signupsLast7d": signups_last_7d,
        "signupsLast30d": signups_last_30d,
        "users": users,
        "process": process_info,
    })


@bp.route("/api/admin/creator", methods=["POST"])
@limiter.limit("30/minute")
@require_auth
def set_creator():
    """Dev-only: grant or revoke a user's "Creator" status (Trip
    Templates feature). Body: { userId? , email?, isCreator: bool } —
    one of userId/email identifies the target. The dev account itself is
    always a creator regardless of the flag (ADMIN_EMAILS override in
    user_status / templates gate), so toggling it is a harmless no-op.

    403 for non-dev callers (same gate + audit-log shape as admin_stats).
    Revoking a creator leaves their existing templates live by design —
    this only flips the can-create-new-templates bit."""
    caller = current_user_id()
    if not _is_admin(caller):
        logger.warning(
            "set_creator forbidden",
            extra={"user_id": caller, "endpoint": "set_creator"},
        )
        return jsonify({"error": "Forbidden"}), 403

    body = json_body()
    target_id = (body.get("userId") or "").strip()
    target_email = (body.get("email") or "").strip().lower()
    new_flag = 1 if body.get("isCreator") else 0
    if not target_id and not target_email:
        return jsonify({"error": "userId or email required"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if target_id:
            cursor.execute(
                "UPDATE users SET is_creator = ? WHERE id = ?",
                (new_flag, target_id),
            )
        else:
            cursor.execute(
                "UPDATE users SET is_creator = ? WHERE lower(email) = ?",
                (new_flag, target_email),
            )
        if cursor.rowcount == 0:
            return jsonify({"error": "User not found"}), 404
        conn.commit()

    logger.info(
        "set_creator",
        extra={
            "by": caller,
            "target": target_id or target_email,
            "isCreator": bool(new_flag),
        },
    )
    return jsonify({"status": "ok", "isCreator": bool(new_flag)})


def _gemini_pool_snapshot() -> dict:
    """Pool-state snapshot from integrations.py without circular
    imports. Returns {} if integrations isn't loaded yet (boot
    order)."""
    try:
        from routes.integrations import _pool_status
        return _pool_status()
    except Exception:
        return {}


@bp.route("/api/admin/backup-snapshot", methods=["POST"])
@limiter.limit("4/hour")
@require_auth
def backup_snapshot():
    """R11-B3: create a timestamped SQLite snapshot of the live DB so
    the operator has a manual restore point. Admin-only — the SQLite
    file IS the entire app state, so allowing a non-admin to dump it
    would be a wholesale data leak.

    Mechanism: `sqlite3.Connection.backup()` from the LIVE connection
    to a fresh file. The API is online-safe (works while the source
    has open transactions; SQLite handles the consistent snapshot
    internally) so this can run while users are active.

    Output path: `<GG_DB_PATH dir>/backups/db_YYYYMMDD_HHMMSSZ.sqlite`.
    Defaults to the same dir as the live DB; the operator can later
    rsync these somewhere off-PA. We DON'T expose the file content
    over HTTP — the response just confirms the snapshot ran + reports
    bytes. SSH/SFTP is the right channel for actually moving the file.

    Rate limit (4/hour) keeps a runaway script from filling the
    filesystem. Operator typically takes ~1 snapshot per day; 4/hour
    is generous for ad-hoc usage."""
    import sqlite3
    from datetime import datetime, timezone

    caller = current_user_id()
    if not _is_admin(caller):
        return jsonify({"error": "Forbidden"}), 403

    db_path = os.getenv("GG_DB_PATH", "travel_planner.db")
    backups_dir = os.path.join(os.path.dirname(db_path) or ".", "backups")
    try:
        os.makedirs(backups_dir, exist_ok=True)
    except OSError as e:
        logger.exception("backup_snapshot: failed to create backups dir")
        return jsonify({
            "error": f"Couldn't create backups dir: {e}",
        }), 500

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    out_path = os.path.join(backups_dir, f"db_{stamp}.sqlite")

    try:
        # Open the source via the standard get_db pool so we honor
        # WAL/busy_timeout etc; backup() to a fresh dest connection.
        with get_db() as src_conn:
            dest_conn = sqlite3.connect(out_path)
            try:
                src_conn.backup(dest_conn)
            finally:
                dest_conn.close()
    except sqlite3.Error as e:
        logger.exception("backup_snapshot: sqlite backup failed")
        return jsonify({"error": f"Snapshot failed: {e}"}), 500

    try:
        size = os.path.getsize(out_path)
    except OSError:
        size = 0

    logger.info(
        "admin backup snapshot created",
        extra={"path": out_path, "bytes": size, "by": caller},
    )
    return jsonify({
        "status": "ok",
        "path": out_path,
        "bytes": size,
        "stampUTC": stamp,
    })
