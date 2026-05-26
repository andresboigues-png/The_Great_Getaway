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

from achievements import check_user_achievements
from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import (
    can_edit_trip,
    ensure_owner_member_row,
    ensure_user_exists,
    is_trip_owner,
    trip_member_role,
    unlink_companion_user_from_trip,
)
from observability import bind_trip_context


bp = Blueprint("trips", __name__)


@bp.route("/api/trips", methods=["POST"])
@require_auth
@retry_on_lock()
def upsert_trip():
    """Create or update a single trip. Auto-creates the owner's
    membership row on insert; rejects edits from non-planners on
    existing trips."""
    data = request.json or {}
    user_id = current_user_id()
    t = data.get("trip")
    if not t:
        return jsonify({"error": "Missing data"}), 400
    bind_trip_context(t.get("id"))
    with get_db() as conn:
        cursor = conn.cursor()
        # Existing trip? Gate on planner role (owner counts as planner).
        cursor.execute("SELECT user_id FROM trips WHERE id = ?", (t["id"],))
        existing = cursor.fetchone()
        if existing and not can_edit_trip(cursor, t["id"], user_id):
            return jsonify({"error": "Forbidden"}), 403

        owner_id = existing["user_id"] if existing else user_id

        # §4.3 multi-country: normalize the incoming `countries` array to
        # upper-case 2-letter ISO codes before persisting. The frontend
        # sends them already-uppercased post-discovery, but be defensive
        # in case any non-browser caller (E2E harness, future mobile
        # shell) sends lowercase.
        #
        # Audit fix (2026-05-26): distinguish "absent" from "explicit
        # empty array" so COALESCE on UPDATE can preserve the column
        # when absent + clear it when explicitly empty. Pre-fix both
        # paths produced `None` and the read path treated them
        # identically; with COALESCE protection enabled below, that
        # would make `countries: []` a no-op (preserve) rather than
        # the documented clear.
        #   - countries absent           → payload = None  (COALESCE preserves)
        #   - countries = []             → payload = '[]'  (COALESCE overwrites to [])
        #   - countries = ['PT', 'ES']   → payload = '["PT","ES"]'
        if isinstance(t.get('countries'), list):
            normalized = [
                c.strip().upper() for c in t['countries']
                if isinstance(c, str) and len(c.strip()) == 2
            ]
            # Dedupe while preserving order — first occurrence wins, so
            # the primary country (which the client puts first) stays
            # at position 0. dict.fromkeys preserves insertion order.
            normalized = list(dict.fromkeys(normalized))
            countries_payload = json.dumps(normalized)  # '[]' when empty
        else:
            countries_payload = None

        # Audit fix (2026-05-26): COALESCE protection on JSON columns
        # that can be legitimately absent from a partial upsert payload.
        # Pre-fix a frontend that posted a trip edit without sending
        # `countries` or `checklist` (e.g. a single-field edit modal)
        # would NULL the column. COALESCE keeps the existing value
        # when the client passes NULL (= "don't touch") and overwrites
        # only when the client explicitly sends data. Same pattern
        # already applied to /api/sync's trip loop.
        cursor.execute('''
            INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                               public_show_expenses,
                               place_id, lat, lng, viewport_json, place_types, country_code,
                               companions_json, marked_places_json,
                               documents_json, photos_json, checklist_json,
                               trip_countries_json, cover_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                country=excluded.country,
                is_archived=excluded.is_archived,
                is_public=excluded.is_public,
                public_show_expenses=excluded.public_show_expenses,
                place_id=excluded.place_id,
                lat=excluded.lat,
                lng=excluded.lng,
                viewport_json=COALESCE(excluded.viewport_json, viewport_json),
                place_types=COALESCE(excluded.place_types, place_types),
                country_code=excluded.country_code,
                companions_json=COALESCE(excluded.companions_json, companions_json),
                marked_places_json=COALESCE(excluded.marked_places_json, marked_places_json),
                documents_json=COALESCE(excluded.documents_json, documents_json),
                photos_json=COALESCE(excluded.photos_json, photos_json),
                checklist_json=COALESCE(excluded.checklist_json, checklist_json),
                trip_countries_json=COALESCE(excluded.trip_countries_json, trip_countries_json),
                cover_url=excluded.cover_url
        ''', (t['id'], owner_id, t['name'], t.get('country', ''),
              1 if t.get('isArchived') else 0,
              1 if t.get('isPublic') else 0,
              1 if t.get('publicShowExpenses') else 0,
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
              countries_payload,
              t.get('coverUrl')))
        ensure_owner_member_row(cursor, t['id'], owner_id)
        # 2026-05-18 audit H1: mirror the client-supplied archive flag
        # to the OWNER's trip_members row so the per-user archive
        # signal (now the source of truth for the achievement queries +
        # feed events + admin stats) stays in sync with the trip's
        # `isArchived` payload field. `ensure_owner_member_row` above
        # is INSERT OR IGNORE, so it doesn't touch a pre-existing
        # row's is_archived — without this UPDATE, importing a
        # completed trip would leave the owner's per-user flag at 0.
        cursor.execute(
            "UPDATE trip_members SET is_archived = ? "
            "WHERE trip_id = ? AND user_id = ?",
            (1 if t.get('isArchived') else 0, t['id'], owner_id),
        )
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/trips/<trip_id>", methods=["DELETE"])
@require_auth
@retry_on_lock()
def delete_trip(trip_id):
    """Delete a trip and all its expenses. Owner-only; non-owners can
    only leave the trip via the members/remove flow (they don't get
    to nuke everyone's data).

    Pre-2026-05-18 this deleted only expenses + trip_members + trips.
    Audit found it left orphans across 7 tables — settlements,
    trip_days, feed_posts (incl. feed_likes/comments/bookmarks chains
    keyed on event_id), share_token cookies, budgets, notifications
    keyed on `trip_<id>` event ids, and user_achievements. Some of
    those re-surfaced on /api/feed/explore + skewed achievements
    counts. Now we cascade the same set as `delete_user_data` does
    for an owner's trips, inside a single transaction so a mid-delete
    failure rolls back cleanly. Audit: 2026-05-18."""
    bind_trip_context(trip_id)
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # Cascade in dependency order — child rows first, parent last,
        # so any FK that's missing ON DELETE CASCADE doesn't block.
        cursor.execute("DELETE FROM expenses WHERE trip_id = ?", (trip_id,))
        cursor.execute("DELETE FROM settlements WHERE trip_id = ?", (trip_id,))
        cursor.execute("DELETE FROM trip_days WHERE trip_id = ?", (trip_id,))
        cursor.execute("DELETE FROM budgets WHERE trip_id = ?", (trip_id,))
        cursor.execute("DELETE FROM trip_members WHERE trip_id = ?", (trip_id,))
        # Feed posts associated with this trip + the engagement rows
        # keyed on their event_ids. Audit fix (2026-05-26): also
        # clean feed_likes / feed_comments / feed_bookmarks rows
        # keyed on the synthesized trip-event ids (trip_created_<id>,
        # trip_archived_<id>, trip_joined_<id>_<joiner>) and on the
        # share_<post_id> / repost_<post_id> event ids for every
        # feed_posts row we're about to delete. Pre-fix these
        # engagement rows survived trip deletion (no FK on event_id)
        # and lingered until the 90-day age sweep — invisible to
        # users (the events were gone) but a slow DB-bloat path.
        #
        # Bare except dropped: feed_posts.trip_id has been a column
        # since the table existed in the audit window; if the DELETE
        # raises, surface it so we know.
        cursor.execute(
            "SELECT id FROM feed_posts WHERE trip_id = ?", (trip_id,),
        )
        doomed_post_ids = [r["id"] for r in cursor.fetchall()]
        cursor.execute("DELETE FROM feed_posts WHERE trip_id = ?", (trip_id,))

        # Build the set of synthesized event_ids that referenced this
        # trip. We delete engagement rows pattern-matching these so
        # nothing keyed on a now-dead event survives.
        # Patterns:
        #   trip_created_<trip_id>           (single row)
        #   trip_archived_<trip_id>          (single row)
        #   trip_joined_<trip_id>_<user_id>  (LIKE prefix)
        #   share_<post_id> / repost_<post_id> (one per doomed post)
        for table in ("feed_likes", "feed_comments", "feed_bookmarks"):
            cursor.execute(
                f"DELETE FROM {table} WHERE event_id = ? OR event_id = ? "
                f"OR event_id LIKE ?",
                (
                    f"trip_created_{trip_id}",
                    f"trip_archived_{trip_id}",
                    f"trip_joined_{trip_id}_%",
                ),
            )
            for pid in doomed_post_ids:
                cursor.execute(
                    f"DELETE FROM {table} WHERE event_id IN (?, ?)",
                    (f"share_{pid}", f"repost_{pid}"),
                )
        # Notifications keyed on the trip id (trip_public broadcast,
        # trip_invite, etc.). related_id is polymorphic; constrain
        # by type so we don't accidentally wipe unrelated rows that
        # happen to coincidentally share the trip_id string in their
        # own polymorphic related_id column.
        cursor.execute(
            "DELETE FROM notifications WHERE related_id = ? AND type IN "
            "('trip_invite', 'trip_invite_accepted', 'trip_invite_declined', "
            " 'trip_member_removed', 'trip_public', 'settled_up', "
            " 'settled_up_reverted')",
            (trip_id,),
        )
        # Delete the trip row first, THEN re-evaluate the user's
        # achievements. Two reasons:
        #   1. user_achievements has no trip_id column — the previous
        #      `DELETE WHERE trip_id = ?` ALWAYS raised, the try/except
        #      swallowed it, and stale badges with dead-trip refs in
        #      context_json piled up. (Audit 2026-05-18.)
        #   2. The post-2026-05-18 revoke logic in
        #      `check_user_achievements` deletes any badge whose rule
        #      no longer passes — once the trip row is gone, the
        #      country / spend / day-count checks drop below threshold
        #      and the revoke path cleans up. This single source of
        #      truth replaces the per-endpoint cleanup that drifted
        #      out of sync with the schema.
        cursor.execute("DELETE FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
        check_user_achievements(cursor, user_id)
        conn.commit()
    return jsonify({"status": "deleted"})


@bp.route("/api/trips/<trip_id>/archive", methods=["POST"])
@require_auth
@retry_on_lock()
def archive_trip(trip_id):
    """Per-user archive toggle — flips THIS caller's
    `trip_members.is_archived` only. Other members keep their own
    state. Any role (incl. relaxer) can archive their own copy.

    Audit fix (2026-05-26): stamp `completed_at = NOW` on the per-
    user row. The friend_archived_trip feed event + achievement
    timing now key off this column so completing a trip created
    long ago surfaces correctly in the 30-day window (pre-fix the
    window was checked against trips.created_at, so 31+ day old
    trips silently vanished from the feed the moment they were
    completed).
    """
    bind_trip_context(trip_id)
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trip_members SET is_archived = 1, "
            "completed_at = CURRENT_TIMESTAMP "
            "WHERE trip_id = ? AND user_id = ?",
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
@retry_on_lock()
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
    bind_trip_context(trip_id)
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
@retry_on_lock()
def unarchive_trip(trip_id):
    """Inverse of /archive — flips THIS caller's
    `trip_members.is_archived` back to 0 so the trip returns to their
    active list on next /api/data pull. Mirrors `trips.is_archived`
    when the actor is the owner.

    Audit fix (2026-05-26): clear `completed_at` so re-archiving
    later stamps a fresh timestamp (matching the new completion
    semantic from `archive_trip`). Without this, re-completing a
    previously-completed-then-restored trip would keep the OLD
    timestamp and the feed event would surface in the wrong
    window.
    """
    bind_trip_context(trip_id)
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trip_members SET is_archived = 0, completed_at = NULL "
            "WHERE trip_id = ? AND user_id = ?",
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
@retry_on_lock()
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
    bind_trip_context(trip_id)
    if inviter == target:
        return jsonify({"error": "Cannot invite yourself"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not can_edit_trip(cursor, trip_id, inviter):
            return jsonify({"error": "Forbidden"}), 403

        # Audit fix (2026-05-26): verify the target user exists BEFORE
        # the INSERT. Pre-fix, a bad target_user_id raised
        # sqlite3.IntegrityError (FK violation on trip_members.user_id
        # → users.id) → unhandled → 500 to the caller. Now we 404
        # cleanly with the same posture as /api/follows/<id> on an
        # unknown id.
        if not ensure_user_exists(cursor, target):
            return jsonify({"error": "Target user not found"}), 404
        # Audit fix (2026-05-26): block-gate. If the target has
        # blocked the inviter, the invite silently fails — 404 not
        # 403 to avoid broadcasting the block.
        from routes.blocks import is_blocked
        if is_blocked(cursor, target, inviter):
            return jsonify({"error": "Target user not found"}), 404

        # Model B: trip invites are an explicit access grant, decoupled
        # from the social graph. Anyone can be invited — the rate
        # limiter at the route level + the per-trip "must be planner"
        # gate above handle spam defense. Friend / mutual-follow checks
        # got dropped here because the old friend-gate didn't actually
        # protect the invitee (they still received a notification
        # either way) and it blocked the legitimate "invite my cousin
        # who just signed up" path.
        # Audit fix (2026-05-27): preserve role + invited_by on rows
        # whose invitation_status is already 'accepted'. Pre-fix the
        # ON CONFLICT clause set `role = excluded.role` UNCONDITIONALLY
        # — so a planner A re-inviting a fellow planner B "as relaxer"
        # silently demoted B with no notification. The pre-existing
        # case-expression on invitation_status was the right shape but
        # didn't extend to role / invited_by. Now: on an already-
        # accepted row, keep the existing role + invited_by; on a
        # pending row, the new invite overrides both (so the
        # re-invite-with-different-role-while-pending case still
        # works as expected).
        cursor.execute(
            "INSERT INTO trip_members (trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, ?, 0, 'pending', ?) "
            "ON CONFLICT(trip_id, user_id) DO UPDATE SET "
            "  role = CASE WHEN trip_members.invitation_status = 'accepted' "
            "              THEN trip_members.role ELSE excluded.role END, "
            "  invitation_status = CASE WHEN trip_members.invitation_status = 'accepted' "
            "                           THEN 'accepted' ELSE 'pending' END, "
            "  invited_by = CASE WHEN trip_members.invitation_status = 'accepted' "
            "                    THEN trip_members.invited_by ELSE excluded.invited_by END",
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
@retry_on_lock()
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
    bind_trip_context(trip_id)

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
            # Audit fix (2026-05-26): strip the companion's linkedUserId
            # so the owner's picker doesn't render the declined invitee
            # as ⏳ Pending forever. The companion's name entry stays
            # — the owner may still want a ghost companion under that
            # name and re-inviting via a fresh link is the cleaner UX.
            unlink_companion_user_from_trip(cursor, trip_id, user_id)
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
@retry_on_lock()
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
    bind_trip_context(trip_id)

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
        # Audit fix (2026-05-26): same companion-cleanup as the decline
        # path — without this the kicked user keeps showing on the
        # owner's picker as ⏳ Pending. Companion name stays as a
        # ghost so any historical expense attribution still resolves.
        unlink_companion_user_from_trip(cursor, trip_id, target)

        # Audit fix (2026-05-26): clean the kicked user's notifications
        # for this trip. Pre-fix, after being kicked the user kept
        # seeing trip-related notifications (trip_invite_accepted that
        # ended their own join, trip_public broadcasts they no longer
        # had any business with, settled_up from a trip they couldn't
        # see). Narrow by type so we don't accidentally wipe
        # unrelated rows whose polymorphic related_id happens to
        # match this trip_id.
        cursor.execute(
            "DELETE FROM notifications WHERE user_id = ? AND related_id = ? "
            "AND type IN ('trip_invite', 'trip_invite_accepted', "
            " 'trip_invite_declined', 'trip_public', 'settled_up', "
            " 'settled_up_reverted')",
            (target, trip_id),
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
@retry_on_lock()
def create_share_link(trip_id):
    """Owner-only: generate or replace the share token for a trip.

    Returns `{ token, url, showCost, showPlans }` so the frontend can
    drop the URL straight into clipboard / Web Share API and reflect
    the current privacy toggle state. The same endpoint handles
    "rotate the link" — if a token already exists, it's overwritten
    so the previous URL stops working immediately. The `showCost` /
    `showPlans` flags are plumbed in via request body so the owner
    can toggle the two privacy switches at share time without a
    second round-trip.

    Privacy default: both toggles OFF unless explicitly requested.
    Visitors only ever see the trip's name, cover, day-by-day path,
    and:
      - (showCost=true) an aggregate cost summary (no line items)
      - (showPlans=true) the day plan text (morning/afternoon/evening
        + tip)
    Photos, documents, expense line items, and member identities
    are never exposed regardless of toggle state.
    """
    bind_trip_context(trip_id)
    user_id = current_user_id()
    payload = request.json or {}
    show_cost = bool(payload.get("showCost", False))
    show_plans = bool(payload.get("showPlans", False))

    with get_db() as conn:
        cursor = conn.cursor()
        if not is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # 22 URL-safe chars ≈ 132 bits of entropy — collision-free
        # well past any realistic share volume; partial UNIQUE index
        # on share_token catches the lottery-ticket case anyway.
        token = secrets.token_urlsafe(16)
        cursor.execute(
            "UPDATE trips SET share_token = ?, share_show_cost = ?, share_show_plans = ? "
            "WHERE id = ?",
            (token, 1 if show_cost else 0, 1 if show_plans else 0, trip_id),
        )
        conn.commit()
    return jsonify({
        "token": token,
        "url": f"/share/{token}",
        "showCost": show_cost,
        "showPlans": show_plans,
    })


@bp.route("/api/trips/<trip_id>/share", methods=["DELETE"])
@require_auth
@limiter.limit("30 per hour")
@retry_on_lock()
def revoke_share_link(trip_id):
    """Owner-only: clear the share token so the public URL stops
    working. View count is preserved — re-sharing later starts a new
    token but keeps the historical visitor count visible to the owner.
    """
    bind_trip_context(trip_id)
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trips SET share_token = NULL, share_show_cost = 0, share_show_plans = 0 "
            "WHERE id = ?",
            (trip_id,),
        )
        conn.commit()
    return jsonify({"status": "revoked"})


# ── Trip cloning (FIXING_ROADMAP §4.6) ───────────────────────────────
# Closes the share-link viral loop: someone visits a shared trip,
# wants the SAME trip as their own draft, clicks "I want this trip,"
# the server deep-copies the source into a fresh trip owned by them.
# Pairs with §4.1's share-link feature — without cloning, sharing is
# a one-way broadcast; with cloning, every shared trip becomes a
# template for the recipient.
#
# What's copied vs. dropped (the heart of the privacy contract here):
#   COPIED — the IDEAS:
#     * trip metadata (name, country, lat/lng, viewport, etc.)
#     * day-by-day Path (name, date, plan text, tip, pin)
#     * marked places (the user's "want to visit" list)
#     * cover photo (the visual hook of the trip)
#   DROPPED — the ORIGINAL OWNER'S personal data:
#     * expenses (they paid for THEIR trip; the copy is a draft)
#     * photos / documents (their personal files)
#     * companions (their friends, not yours)
#     * is_archived / is_public / share_token (fresh draft, not
#       shared, not completed)
#     * actions_hidden (default visible — caller's choice)
#
# Naming: cloned trip's name gets a " (copy)" suffix so the user can
# tell their two trips apart in Collections without renaming.


def _generate_trip_id() -> str:
    """Match the 9-char lowercase-alphanumeric shape the frontend's
    generateId() produces (now crypto.randomUUID-backed). Server-side
    we use secrets.token_hex(5)[:9] which is 9 hex chars = a-z subset
    of the alphanumeric space and ≈ 36 bits of entropy. Partial UNIQUE
    index on the trips PK catches the astronomically-rare collision —
    but the audit (2026-05-26) flagged that 36 bits implies a
    birthday-style ~3% collision rate at 1 M trips. Callers SHOULD
    use `_insert_with_retry_on_id_collision` rather than letting the
    INSERT 500 on collision."""
    return secrets.token_hex(5)[:9]


def _clone_trip_attempt(cursor, src, new_owner_id, new_trip_id):
    """One INSERT attempt for the clone's trip row, factored so the
    caller can retry on the rare PK collision from `_generate_trip_id`."""
    new_name = f"{src['name'] or 'Trip'} (copy)"
    cursor.execute('''
        INSERT INTO trips (
            id, user_id, name, country, country_code,
            is_archived, is_public,
            place_id, lat, lng, viewport_json, place_types,
            companions_json, marked_places_json,
            documents_json, photos_json, checklist_json,
            trip_countries_json, actions_hidden, cover_url
        ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    ''', (
        new_trip_id,
        new_owner_id,
        new_name,
        src['country'],
        src['country_code'],
        src['place_id'],
        src['lat'],
        src['lng'],
        src['viewport_json'],
        src['place_types'],
        # Companions — explicitly NOT copied. Always start clean.
        None,
        # markedPlaces — copied verbatim (the user's wishlist of
        # places is half the value of cloning).
        src['marked_places_json'],
        # documents / photos / checklist — NEVER copied (personal
        # files / per-trip tasks belong to the original owner).
        None,
        None,
        None,
        # §4.3 multi-country: copy the discovered country array. The
        # clone visits the same places, so the country set is the
        # same — no reason to force re-discovery on the clone.
        src['trip_countries_json'],
        src['cover_url'],
    ))


def _clone_trip_record(cursor, source_trip_id, new_owner_id):
    """Deep-copy a single trip + its trip_days + markedPlaces into a
    new trip owned by `new_owner_id`. The caller is responsible for
    visibility (must verify source_trip_id is readable to the user
    BEFORE calling this — clones bypass the per-trip permission gate
    on the source by design, because the WHOLE POINT is to give the
    user their own copy).

    Returns the new trip_id on success, or None if source not found.

    Audit fix (2026-05-26): retry on `_generate_trip_id` collision.
    The generator returns 9 hex chars (36 bits) so birthday-style
    collisions are non-negligible at scale; pre-fix a collision
    propagated as IntegrityError → 500. Now we retry up to 5 times
    with a freshly generated id; after that the operator has bigger
    problems (PRNG broken, or DB has accumulated enough trips that
    the entropy budget is exhausted — at which point we should
    widen `_generate_trip_id` and stop truncating).
    """
    import sqlite3
    cursor.execute(
        "SELECT id, name, country, country_code, place_id, lat, lng, "
        "       viewport_json, place_types, "
        "       marked_places_json, trip_countries_json, cover_url "
        "FROM trips WHERE id = ?",
        (source_trip_id,),
    )
    src = cursor.fetchone()
    if not src:
        return None

    # New IDs everywhere. We never re-use the source's trip_id or
    # day ids; doing so would risk collisions with the source's
    # owner's existing records.
    new_trip_id = None
    for _attempt in range(5):
        candidate = _generate_trip_id()
        try:
            _clone_trip_attempt(cursor, src, new_owner_id, candidate)
            new_trip_id = candidate
            break
        except sqlite3.IntegrityError:
            # PK collision on the trips table — extremely unlikely
            # at 36 bits but possible. Try again with a fresh id.
            continue
    if new_trip_id is None:
        # 5 collisions in a row is so improbable it indicates a real
        # bug; bail with None and let the caller surface a 500.
        return None

    # Owner membership row so the clone shows up in /api/data's
    # member-list UNION on next pull.
    ensure_owner_member_row(cursor, new_trip_id, new_owner_id)

    # Days. Each day gets a fresh id (generated server-side via the
    # same _generate_trip_id helper, since day ids share the
    # 9-char shape). Plan text + tip + pin are copied as-is —
    # they're the "what to do" content. Same collision-retry pattern
    # as the trip row above.
    cursor.execute(
        "SELECT day_number, date, name, morning, afternoon, evening, "
        "       tip, lat, lng "
        "FROM trip_days WHERE trip_id = ?",
        (source_trip_id,),
    )
    for d in cursor.fetchall():
        inserted = False
        for _attempt in range(5):
            candidate_day_id = _generate_trip_id()
            try:
                cursor.execute('''
                    INSERT INTO trip_days (
                        id, trip_id, day_number, date, name,
                        morning, afternoon, evening, tip,
                        lat, lng
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    candidate_day_id,
                    new_trip_id,
                    d['day_number'],
                    d['date'],
                    d['name'],
                    d['morning'],
                    d['afternoon'],
                    d['evening'],
                    d['tip'],
                    d['lat'],
                    d['lng'],
                ))
                inserted = True
                break
            except sqlite3.IntegrityError:
                # day_id collision (same 36-bit space as trip_id),
                # OR the new UNIQUE(trip_id, day_number) firing if
                # the source trip had a duplicate of its own (which
                # the b1d2e3f4c5a7 migration should have cleaned —
                # but be defensive on prod data we haven't migrated
                # yet). Retry with a fresh day_id; if the failure
                # is actually day_number-based, the retry won't help
                # but at most we'll burn 5 attempts before giving up.
                continue
        if not inserted:
            # 5 collisions per day is incredibly unlikely; bail to
            # let the caller surface a clean error rather than a
            # half-copied trip.
            return None

    return new_trip_id


def _caller_can_see_trip(cursor, trip_id, user_id):
    """True if the trip is public OR the caller is a member. Used to
    gate /api/trips/clone/<source_id> — you can only clone a trip
    you'd be able to view via /api/public-trip or your own
    Collections."""
    cursor.execute(
        "SELECT user_id, is_public FROM trips WHERE id = ?", (trip_id,),
    )
    row = cursor.fetchone()
    if not row:
        return False
    if row['is_public']:
        return True
    if row['user_id'] == user_id:
        return True
    cursor.execute(
        "SELECT 1 FROM trip_members "
        "WHERE trip_id = ? AND user_id = ? AND invitation_status = 'accepted' "
        "LIMIT 1",
        (trip_id, user_id),
    )
    return cursor.fetchone() is not None


@bp.route("/api/trips/clone/<source_id>", methods=["POST"])
@require_auth
@limiter.limit("30 per hour")
@retry_on_lock()
def clone_trip(source_id):
    """Clone a trip the caller can see (public OR a trip they're a
    member of). Returns `{ tripId }` for the new draft owned by the
    caller. Visibility gate matches /api/public-trip — anything else
    would let the caller exfiltrate private trips by id-guessing.
    """
    bind_trip_context(source_id)
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _caller_can_see_trip(cursor, source_id, user_id):
            # Mirror /api/public-trip's 404 (rather than 403) so
            # id-existence isn't leaked via differential codes.
            return jsonify({"error": "Not found"}), 404
        new_trip_id = _clone_trip_record(cursor, source_id, user_id)
        if not new_trip_id:
            return jsonify({"error": "Not found"}), 404
        conn.commit()
    return jsonify({"tripId": new_trip_id})


@bp.route("/api/share/<token>/clone", methods=["POST"])
@require_auth
@limiter.limit("30 per hour")
@retry_on_lock()
def clone_trip_from_share_token(token):
    """Clone via a share-link token. The recipient of a /share/<token>
    URL clicks "I want this trip"; the SPA boots, the user logs in if
    needed, then we hit this endpoint to do the deep-copy.

    Doesn't require the caller to be a member of the source trip —
    having the share token IS the proof of intent to share. We do
    require auth here though (the clone needs an owner).
    """
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id FROM trips WHERE share_token = ?", (token,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        new_trip_id = _clone_trip_record(cursor, row['id'], user_id)
        if not new_trip_id:
            return jsonify({"error": "Not found"}), 404
        conn.commit()
    return jsonify({"tripId": new_trip_id})
