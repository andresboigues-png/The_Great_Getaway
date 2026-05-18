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
    cost is negligible even on every admin request."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT email FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        return False
    return (row["email"] or "").strip().lower() in ADMIN_EMAILS


@bp.route("/api/admin/stats", methods=["GET"])
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
        return jsonify({"error": "Forbidden"}), 403

    conn = get_db()
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
            (SELECT COUNT(*) FROM trips t WHERE t.user_id = u.id) AS trip_count,
            (SELECT COUNT(*)
                FROM expenses e
                JOIN trips t ON e.trip_id = t.id
                WHERE t.user_id = u.id) AS expense_count
        FROM users u
        ORDER BY u.created_at DESC
        """
    )
    user_rows = cursor.fetchall()

    users = []
    for row in user_rows:
        email = (row["email"] or "").strip().lower()
        users.append({
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "picture": row["picture"],
            "createdAt": row["created_at"],
            "tripCount": row["trip_count"],
            "expenseCount": row["expense_count"],
            "isAdmin": email in ADMIN_EMAILS,
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


def _gemini_pool_snapshot() -> dict:
    """Pool-state snapshot from integrations.py without circular
    imports. Returns {} if integrations isn't loaded yet (boot
    order)."""
    try:
        from routes.integrations import _pool_status
        return _pool_status()
    except Exception:
        return {}
