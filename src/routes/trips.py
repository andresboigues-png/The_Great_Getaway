"""Trip CRUD + per-trip ops (silence / archive / unarchive / invite /
respond / member-remove). All routes go through one of the
trip-permission helpers (can_edit_trip / is_trip_owner /
trip_member_role) — see helpers.py for the role-tier matrix.

The per-user archive flag lives on `trip_members.is_archived` (each
member archives their own copy); the legacy `trips.is_archived`
column is mirrored only when the actor is the owner so the existing
public-trip / collections rendering keeps working without a parallel
sweep.
"""

import json
import secrets

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db
from extensions import limiter
from helpers import (
    can_edit_trip,
    ensure_owner_member_row,
    is_trip_owner,
    trip_member_role,
)


bp = Blueprint("trips", __name__)


@bp.route("/api/trips", methods=["POST"])
@require_auth
def upsert_trip():
    """Create or update a single trip. Auto-creates the owner's
    membership row on insert; rejects edits from non-planners on
    existing trips."""
    data = request.json or {}
    user_id = current_user_id()
    t = data.get("trip")
    if not t:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        # Existing trip? Gate on planner role (owner counts as planner).
        cursor.execute("SELECT user_id FROM trips WHERE id = ?", (t["id"],))
        existing = cursor.fetchone()
        if existing and not can_edit_trip(cursor, t["id"], user_id):
            return jsonify({"error": "Forbidden"}), 403

        owner_id = existing["user_id"] if existing else user_id

        cursor.execute('''
            INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                               place_id, lat, lng, viewport_json, place_types, country_code,
                               companions_json, marked_places_json,
                               documents_json, photos_json, checklist_json, cover_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                country=excluded.country,
                is_archived=excluded.is_archived,
                is_public=excluded.is_public,
                place_id=excluded.place_id,
                lat=excluded.lat,
                lng=excluded.lng,
                viewport_json=excluded.viewport_json,
                place_types=excluded.place_types,
                country_code=excluded.country_code,
                companions_json=excluded.companions_json,
                marked_places_json=excluded.marked_places_json,
                documents_json=excluded.documents_json,
                photos_json=excluded.photos_json,
                checklist_json=excluded.checklist_json,
                cover_url=excluded.cover_url
        ''', (t['id'], owner_id, t['name'], t.get('country', ''),
              1 if t.get('isArchived') else 0,
              1 if t.get('isPublic') else 0,
              t.get('placeId'),
              t.get('lat'),
              t.get('lng'),
              json.dumps(t['viewport']) if t.get('viewport') else None,
              json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
              t.get('countryCode'),
              json.dumps(t['companions']) if isinstance(t.get('companions'), list) else None,
              json.dumps(t['markedPlaces']) if isinstance(t.get('markedPlaces'), list) else None,
              json.dumps(t['documents']) if isinstance(t.get('documents'), list) else None,
              json.dumps(t['photos']) if isinstance(t.get('photos'), list) else None,
              json.dumps(t['checklist']) if isinstance(t.get('checklist'), list) else None,
              t.get('coverUrl')))
        ensure_owner_member_row(cursor, t['id'], owner_id)
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/trips/<trip_id>", methods=["DELETE"])
@require_auth
def delete_trip(trip_id):
    """Delete a trip and all its expenses. Owner-only; non-owners can
    only leave the trip via the members/remove flow (they don't get
    to nuke everyone's data)."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute("DELETE FROM expenses WHERE trip_id = ?", (trip_id,))
        cursor.execute("DELETE FROM trip_members WHERE trip_id = ?", (trip_id,))
        cursor.execute("DELETE FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        conn.commit()
    return jsonify({"status": "deleted"})


@bp.route("/api/trips/<trip_id>/archive", methods=["POST"])
@require_auth
def archive_trip(trip_id):
    """Per-user archive toggle — flips THIS caller's
    `trip_members.is_archived` only. Other members keep their own
    state. Any role (incl. relaxer) can archive their own copy."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trip_members SET is_archived = 1 WHERE trip_id = ? AND user_id = ?",
            (trip_id, user_id),
        )
        # Mirror to legacy `trips.is_archived` only when the actor is the
        # owner — keeps the existing public-trip / collections rendering
        # working without a parallel sweep.
        if is_trip_owner(cursor, trip_id, user_id):
            cursor.execute(
                "UPDATE trips SET is_archived = 1 WHERE id = ? AND user_id = ?",
                (trip_id, user_id),
            )
        conn.commit()
    return jsonify({"status": "archived"})


@bp.route("/api/trips/<trip_id>/silence", methods=["POST"])
@require_auth
def silence_trip_actions(trip_id):
    """Toggle per-trip Actions-feed silencing. When `hidden=True`,
    /api/feed's Actions queries (joined-trip / added-day /
    archived-trip) skip events for this trip across all viewers —
    owner included. Privacy escape hatch.

    Owner-only: only the trip's creator can flip this. Doesn't touch
    Posts (explicit shares stay shared).

    Request: { hidden: bool }  (omitted = treated as True for safety)
    Response: { status: 'ok', hidden: bool }
    """
    user_id = current_user_id()
    payload = request.json or {}
    hidden = bool(payload.get("hidden", True))
    with get_db() as conn:
        cursor = conn.cursor()
        if not is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trips SET actions_hidden = ? WHERE id = ?",
            (1 if hidden else 0, trip_id),
        )
        conn.commit()
    return jsonify({"status": "ok", "hidden": hidden})


@bp.route("/api/trips/<trip_id>/unarchive", methods=["POST"])
@require_auth
def unarchive_trip(trip_id):
    """Inverse of /archive — flips THIS caller's
    `trip_members.is_archived` back to 0 so the trip returns to their
    active list on next /api/data pull. Mirrors `trips.is_archived`
    when the actor is the owner."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trip_members SET is_archived = 0 WHERE trip_id = ? AND user_id = ?",
            (trip_id, user_id),
        )
        if is_trip_owner(cursor, trip_id, user_id):
            cursor.execute(
                "UPDATE trips SET is_archived = 0 WHERE id = ? AND user_id = ?",
                (trip_id, user_id),
            )
        conn.commit()
    return jsonify({"status": "unarchived"})


@bp.route("/api/trips/invite", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def invite_trip_member():
    """Planner invites a friend to a trip with a role. Creates a
    `pending` member row + fires a `trip_invite` notification at the
    friend. Only planners (incl. owner) of the trip can invite.

    Audit gate: target must be an accepted friend. The companion-link
    layer is gone — friends are now the only account-level connection.

    Request body: { trip_id, target_user_id, role }
    """
    data = request.json or {}
    inviter = current_user_id()
    trip_id = data.get("trip_id")
    target = data.get("target_user_id")
    role = (data.get("role") or "relaxer").strip()
    if role not in ("planner", "budgeteer", "relaxer"):
        return jsonify({"error": "Unknown role"}), 400
    if not trip_id or not target:
        return jsonify({"error": "Missing data"}), 400
    if inviter == target:
        return jsonify({"error": "Cannot invite yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not can_edit_trip(cursor, trip_id, inviter):
            return jsonify({"error": "Forbidden"}), 403

        cursor.execute(
            "SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ? AND status = 'accepted'",
            (inviter, target),
        )
        if not cursor.fetchone():
            return jsonify({"error": "Target must be an accepted friend"}), 403

        cursor.execute(
            "INSERT INTO trip_members (trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, ?, 0, 'pending', ?) "
            "ON CONFLICT(trip_id, user_id) DO UPDATE SET "
            "  role = excluded.role, "
            "  invitation_status = CASE WHEN trip_members.invitation_status = 'accepted' "
            "                           THEN 'accepted' ELSE 'pending' END, "
            "  invited_by = excluded.invited_by",
            (trip_id, target, role, inviter),
        )

        cursor.execute("SELECT name FROM users WHERE id = ?", (inviter,))
        inviter_row = cursor.fetchone()
        inviter_name = inviter_row["name"] if inviter_row else "Someone"
        cursor.execute("SELECT name FROM trips WHERE id = ?", (trip_id,))
        trip_row = cursor.fetchone()
        trip_name = trip_row["name"] if trip_row else "their trip"

        msg = f"{inviter_name} invited you to {trip_name} as a {role.title()}."
        cursor.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
            "VALUES (?, 'trip_invite', 'Trip invitation', ?, ?, 0)",
            (target, trip_id, msg),
        )
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/trips/invite/respond", methods=["POST"])
@require_auth
def respond_trip_invite():
    """Accept or decline a pending trip invite. On accept the member
    row flips to `accepted` and the trip starts appearing in /api/data;
    on decline the row is deleted entirely. Inviter gets a
    notification either way.

    Request body: { trip_id, accept }
    """
    data = request.json or {}
    user_id = current_user_id()
    trip_id = data.get("trip_id")
    accept = bool(data.get("accept"))
    if not trip_id:
        return jsonify({"error": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT invited_by FROM trip_members WHERE trip_id = ? AND user_id = ? AND invitation_status = 'pending'",
            (trip_id, user_id),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "No pending invitation"}), 404
        inviter_id = row["invited_by"]

        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        responder_row = cursor.fetchone()
        responder_name = responder_row["name"] if responder_row else "Someone"
        cursor.execute("SELECT name FROM trips WHERE id = ?", (trip_id,))
        trip_row = cursor.fetchone()
        trip_name = trip_row["name"] if trip_row else "the trip"

        if accept:
            cursor.execute(
                "UPDATE trip_members SET invitation_status = 'accepted' WHERE trip_id = ? AND user_id = ?",
                (trip_id, user_id),
            )
            msg = f"{responder_name} joined {trip_name}."
            note_type = "trip_invite_accepted"
        else:
            cursor.execute(
                "DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?",
                (trip_id, user_id),
            )
            msg = f"{responder_name} declined the invite to {trip_name}."
            note_type = "trip_invite_declined"

        if inviter_id:
            cursor.execute(
                "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
                "VALUES (?, ?, 'Trip invite update', ?, ?, 0)",
                (inviter_id, note_type, trip_id, msg),
            )
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/trips/members/remove", methods=["POST"])
@require_auth
def remove_trip_member():
    """Planner kicks a member from a trip. Hard remove — the kicked
    user's account stops seeing the trip on next /api/data poll.
    Owner can't be removed.

    Request body: { trip_id, target_user_id }
    """
    data = request.json or {}
    actor = current_user_id()
    trip_id = data.get("trip_id")
    target = data.get("target_user_id")
    if not trip_id or not target:
        return jsonify({"error": "Missing data"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not can_edit_trip(cursor, trip_id, actor):
            return jsonify({"error": "Forbidden"}), 403
        if is_trip_owner(cursor, trip_id, target):
            return jsonify({"error": "Cannot remove the trip owner"}), 400
        cursor.execute(
            "DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?",
            (trip_id, target),
        )

        cursor.execute("SELECT name FROM users WHERE id = ?", (actor,))
        actor_row = cursor.fetchone()
        actor_name = actor_row["name"] if actor_row else "A planner"
        cursor.execute("SELECT name FROM trips WHERE id = ?", (trip_id,))
        trip_row = cursor.fetchone()
        trip_name = trip_row["name"] if trip_row else "a trip"
        msg = f"{actor_name} removed you from {trip_name}."
        cursor.execute(
            "INSERT INTO notifications (user_id, type, title, related_id, message, is_read) "
            "VALUES (?, 'trip_member_removed', 'Removed from trip', ?, ?, 0)",
            (target, trip_id, msg),
        )
        conn.commit()
    return jsonify({"status": "ok"})


# ── Share-via-link (FIXING_ROADMAP §4.1) ─────────────────────────────
# The two owner-only halves of the share flow. The unauthenticated
# read side (and the HTML page itself) live in routes/public.py +
# the /share/<token> route in main.py respectively.


@bp.route("/api/trips/<trip_id>/share", methods=["POST"])
@require_auth
@limiter.limit("30 per hour")
def create_share_link(trip_id):
    """Owner-only: generate or replace the share token for a trip.

    Returns `{ token, url, showCost }` so the frontend can drop the
    URL straight into clipboard / Web Share API. The same endpoint
    handles "rotate the link" — if a token already exists, it's
    overwritten so the previous URL stops working immediately. The
    `showCost` flag is plumbed in via request body so the owner can
    toggle "show cost summary on the public page" at share time
    without a second round-trip.

    Privacy default: showCost is OFF unless explicitly requested.
    Visitors only ever see the trip's name, cover, day-by-day path,
    and (if showCost is on) an aggregate cost banner — never line
    items, photos, journals, or member identities.
    """
    user_id = current_user_id()
    payload = request.json or {}
    show_cost = bool(payload.get("showCost", False))

    with get_db() as conn:
        cursor = conn.cursor()
        if not is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # 22 URL-safe chars ≈ 132 bits of entropy — collision-free
        # well past any realistic share volume; partial UNIQUE index
        # on share_token catches the lottery-ticket case anyway.
        token = secrets.token_urlsafe(16)
        cursor.execute(
            "UPDATE trips SET share_token = ?, share_show_cost = ? WHERE id = ?",
            (token, 1 if show_cost else 0, trip_id),
        )
        conn.commit()
    return jsonify({
        "token": token,
        "url": f"/share/{token}",
        "showCost": show_cost,
    })


@bp.route("/api/trips/<trip_id>/share", methods=["DELETE"])
@require_auth
@limiter.limit("30 per hour")
def revoke_share_link(trip_id):
    """Owner-only: clear the share token so the public URL stops
    working. View count is preserved — re-sharing later starts a new
    token but keeps the historical visitor count visible to the owner.
    """
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trips SET share_token = NULL, share_show_cost = 0 WHERE id = ?",
            (trip_id,),
        )
        conn.commit()
    return jsonify({"status": "revoked"})
