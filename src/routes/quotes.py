"""Profile quotes — short notes other users leave on a profile; the
owner curates which are publicly visible.

  POST   /api/quotes/<owner_id>                  leave a quote (author != owner)
  GET    /api/quotes/<owner_id>                  list (owner: all; others: visible)
  POST   /api/quotes/item/<int:quote_id>/visibility   owner toggles show/hide
  DELETE /api/quotes/item/<int:quote_id>         owner or author removes

Quotes render on the owner's public profile, but ONLY through React text
interpolation (auto-escaped) — so the server sanitizes size / control
chars rather than markup. New quotes start hidden so a visitor can't push
copy onto someone's profile without the owner opting it in.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import ensure_user_exists, user_daily_count, user_daily_increment

bp = Blueprint("quotes", __name__)

_MAX_LEN = 280
# Per-account daily cap on NEW quotes. The shared per-IP limiter throttles
# bursts but doesn't bound one account's fan-out onto other people's
# profiles (mirrors follows.py BUG-079). Each quote is unsolicited content
# pushed at another user, so cap it.
_QUOTE_DAILY_CAP = 50


def _clean(raw: str) -> str:
    """Strip C0 control chars (keep newline), collapse to a trimmed string."""
    return "".join(c for c in raw if c == "\n" or ord(c) >= 0x20).strip()


def _serialize(row) -> dict:
    trip = None
    if row["memory_trip_id"] is not None:
        trip = {
            "id": row["memory_trip_id"],
            "name": row["trip_name"],
            "countryCode": row["trip_country_code"],
        }
    return {
        "id": row["id"],
        "text": row["content"],
        "year": row["memory_year"],
        "trip": trip,
        "isVisible": bool(row["is_visible"]),
        "createdAt": row["created_at"],
        "author": {
            "id": row["author_id"],
            "name": row["author_name"],
            "picture": row["author_picture"],
        },
    }


_SELECT = (
    "SELECT pq.id, pq.content, pq.memory_year, "
    "pq.memory_trip_id, tr.name AS trip_name, tr.country_code AS trip_country_code, "
    "pq.is_visible, pq.created_at, "
    "u.id AS author_id, u.name AS author_name, u.picture AS author_picture "
    "FROM profile_quotes pq JOIN users u ON u.id = pq.author_id "
    "LEFT JOIN trips tr ON tr.id = pq.memory_trip_id "
    "WHERE pq.profile_owner_id = ? "
)


def _common_trip_rows(cursor, owner_id, author_id, trip_id=None):
    """Trips BOTH owner_id and author_id are accepted members of.

    A user is "on" a trip when they have a trip_members row with
    invitation_status = 'accepted'. Two accepted joins (one per user)
    intersect to the shared set. Newest first, capped. Pass trip_id to
    narrow to a single candidate (used to validate a memory's link).
    """
    sql = (
        "SELECT t.id, t.name, t.country_code "
        "FROM trips t "
        "JOIN trip_members m_owner "
        "  ON m_owner.trip_id = t.id AND m_owner.user_id = ? "
        "  AND m_owner.invitation_status = 'accepted' "
        "JOIN trip_members m_author "
        "  ON m_author.trip_id = t.id AND m_author.user_id = ? "
        "  AND m_author.invitation_status = 'accepted' "
    )
    params: list = [owner_id, author_id]
    if trip_id is not None:
        sql += "WHERE t.id = ? "
        params.append(trip_id)
    sql += "ORDER BY t.created_at DESC LIMIT 100"
    cursor.execute(sql, params)
    return cursor.fetchall()


@bp.route("/api/quotes/<owner_id>", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def leave_quote(owner_id):
    author_id = current_user_id()
    if author_id == owner_id:
        return jsonify({"error": "You can't leave a quote on your own profile"}), 400
    data = request.get_json(silent=True) or {}
    raw = data.get("text")
    if not isinstance(raw, str):
        return jsonify({"error": "text must be a string"}), 400
    text = _clean(raw)
    if not text:
        return jsonify({"error": "text must not be empty"}), 400
    if len(text) > _MAX_LEN:
        return jsonify({"error": f"text must be {_MAX_LEN} characters or less"}), 400
    # Optional year: absent/None stores NULL; a bool is NOT a valid year.
    year = data.get("year")
    if year is not None:
        if isinstance(year, bool) or not isinstance(year, int):
            return jsonify({"error": "year must be an integer"}), 400
        if not 1900 <= year <= 2100:
            return jsonify({"error": "year must be between 1900 and 2100"}), 400
    # Optional tripId: absent/None/empty stores NULL; a non-empty string must
    # name a trip BOTH the author and the owner are accepted members of
    # (validated below, once we have a cursor).
    trip_id = data.get("tripId")
    if trip_id is not None and not isinstance(trip_id, str):
        return jsonify({"error": "tripId must be a trip you both share"}), 400
    if isinstance(trip_id, str) and not trip_id:
        trip_id = None
    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, owner_id):
            return jsonify({"error": "Not found"}), 404
        # Block-gate: a block in EITHER direction hides the profile, so a
        # quote can't be left across a block (mirrors follows.py).
        from routes.blocks import is_blocked

        if is_blocked(cursor, owner_id, author_id) or is_blocked(cursor, author_id, owner_id):
            return jsonify({"error": "Not found"}), 404
        # Per-account daily cap — a single account can't flood a target's
        # curation queue past this (in-memory bucket; mirrors follows.py).
        if user_daily_count("quote", author_id) >= _QUOTE_DAILY_CAP:
            return jsonify(
                {
                    "error": "You've hit today's quote limit. Try again tomorrow.",
                    "quoteCapHit": True,
                }
            ), 429
        # A linked trip must be one BOTH users are accepted members of, so a
        # memory can't point at a trip the author (or owner) isn't on.
        if trip_id is not None:
            if len(_common_trip_rows(cursor, owner_id, author_id, trip_id=trip_id)) != 1:
                return jsonify({"error": "tripId must be a trip you both share"}), 400
        cursor.execute(
            "INSERT INTO profile_quotes "
            "(profile_owner_id, author_id, content, memory_year, memory_trip_id, is_visible) "
            "VALUES (?, ?, ?, ?, ?, 0)",
            (owner_id, author_id, text, year, trip_id),
        )
        # Meter AFTER a successful insert so a failed write can't burn quota.
        user_daily_increment("quote", author_id)
        conn.commit()
    return jsonify({"status": "created"}), 201


@bp.route("/api/quotes/<owner_id>", methods=["GET"])
@require_auth
@limiter.limit("120/minute")
def list_quotes(owner_id):
    caller_id = current_user_id()
    is_owner = caller_id == owner_id
    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, owner_id):
            return jsonify({"error": "Not found"}), 404
        if not is_owner:
            from routes.blocks import is_blocked

            if is_blocked(cursor, owner_id, caller_id) or is_blocked(cursor, caller_id, owner_id):
                return jsonify({"error": "Not found"}), 404
        # Owner sees every quote (to curate); everyone else only the visible
        # ones. Newest first, capped so a flooded profile can't return an
        # unbounded set. Quotes whose AUTHOR is blocked by / has blocked the
        # caller are hidden in BOTH directions — a clean break, applied to the
        # owner's curation view too (mirrors feed.py comment listing).
        sql = _SELECT
        params: list = [owner_id]
        if not is_owner:
            sql += "AND pq.is_visible = 1 "
        sql += (
            "AND pq.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ?) "
            "AND pq.author_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?) "
            "ORDER BY pq.created_at DESC, pq.id DESC LIMIT 200"
        )
        params += [caller_id, caller_id]
        cursor.execute(sql, params)
        quotes = [_serialize(r) for r in cursor.fetchall()]
    return jsonify({"quotes": quotes, "isOwner": is_owner})


@bp.route("/api/quotes/<owner_id>/common-trips", methods=["GET"])
@require_auth
@limiter.limit("120/minute")
def list_common_trips(owner_id):
    """Trips the caller shares with the profile owner — the pick-list the
    UI offers when the caller links a memory to a trip they were both on.
    You don't leave memories on your own profile, so self → empty."""
    caller_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not ensure_user_exists(cursor, owner_id):
            return jsonify({"error": "Not found"}), 404
        # Block-gate in BOTH directions, mirroring list_quotes: a block
        # hides the profile, so it hides the shared-trip pick-list too.
        from routes.blocks import is_blocked

        if is_blocked(cursor, owner_id, caller_id) or is_blocked(cursor, caller_id, owner_id):
            return jsonify({"error": "Not found"}), 404
        if caller_id == owner_id:
            return jsonify({"trips": []})
        rows = _common_trip_rows(cursor, owner_id, caller_id)
        trips = [{"id": r["id"], "name": r["name"], "countryCode": r["country_code"]} for r in rows]
    return jsonify({"trips": trips})


@bp.route("/api/quotes/item/<int:quote_id>/visibility", methods=["POST"])
@require_auth
@limiter.limit("60/minute")
@retry_on_lock()
def set_quote_visibility(quote_id):
    caller_id = current_user_id()
    data = request.get_json(silent=True) or {}
    visible = data.get("visible")
    if not isinstance(visible, bool):
        return jsonify({"error": "visible must be a boolean"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT profile_owner_id FROM profile_quotes WHERE id = ?", (quote_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        # Only the profile OWNER decides what's shown on their profile.
        if row["profile_owner_id"] != caller_id:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE profile_quotes SET is_visible = ? WHERE id = ?",
            (1 if visible else 0, quote_id),
        )
        conn.commit()
    return jsonify({"status": "updated"})


@bp.route("/api/quotes/item/<int:quote_id>", methods=["DELETE"])
@require_auth
@limiter.limit("60/minute")
@retry_on_lock()
def delete_quote(quote_id):
    caller_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT profile_owner_id, author_id FROM profile_quotes WHERE id = ?",
            (quote_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        # The owner (curating their profile) OR the author (retracting their
        # own words) may delete.
        if caller_id not in (row["profile_owner_id"], row["author_id"]):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute("DELETE FROM profile_quotes WHERE id = ?", (quote_id,))
        conn.commit()
    return jsonify({"status": "deleted"})
