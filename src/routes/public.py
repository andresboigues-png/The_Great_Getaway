"""Public-surface routes — anonymous-readable trip + profile data.

Both routes are READ-ONLY and intentionally public (no @require_auth).
The frontend hits these from the feed-post trip-card click-through and
from the profile-modal trip footprint, which need to render for any
caller who has the link / username.

Privacy gate (public-trip): a private trip returns 404 to a non-member
so probing clients can't enumerate which trip IDs exist. Members of
the trip see their own trip's full payload regardless of `is_public`.
"""

import json

from flask import Blueprint, jsonify

from auth import current_user_id
from database import get_db
from achievements import list_user_achievements
from observability import bind_trip_context
from helpers import (
    serialize_expense_row,
    serialize_trip_row,
    unwrap_legacy_plan_text,
)
from routes.follows import follower_counts, is_following


bp = Blueprint("public", __name__)


@bp.route("/api/public-trip/<trip_id>", methods=["GET"])
def get_public_trip(trip_id):
    """Fetch full trip data for read-only display when the caller doesn't
    own the trip. Powers the feed-post trip-card click-through and any
    other surface where a non-member needs to view a friend's trip.

    Gating: returns 404 if the trip doesn't exist OR isn't public AND
    the caller isn't a member. We intentionally hide private trips
    behind a 404 (vs 403) so a probing client can't enumerate which
    trip IDs exist.

    Shape mirrors the archived-trip object the frontend's
    renderArchivedTripDetail expects: trip metadata + tripDays
    (with plan/photos/documents inlined) + expenses + owner user info.
    Companions / markedPlaces / per-trip photos / documents / checklist
    are all included so the read-only renderer renders the same body
    a local archive view would."""
    bind_trip_context(trip_id)
    caller_id = current_user_id()  # may be None if not authed
    with get_db() as conn:
        cursor = conn.cursor()
        # FIXING_ROADMAP §2.18 — enumerate columns explicitly. The
        # previous `SELECT *` shipped every trip column to the public
        # endpoint, including future-added columns that might not be
        # public-safe (e.g. share_token after §4.1 lands). Listing
        # makes new private columns opt-in rather than opt-out.
        # 2026-05-18 audit H1: pull is_archived from the OWNER's
        # trip_members row (the post-deprecation source of truth) via
        # LEFT JOIN so a trip with no member row defaults to 0
        # (not archived). Public viewer sees the owner's state — same
        # semantic as the legacy trips.is_archived mirror, decoupled
        # from the column.
        cursor.execute(
            "SELECT t.id, t.user_id, t.name, t.country, t.country_code, "
            "       COALESCE(tm.is_archived, 0) AS is_archived, "
            "       t.is_public, t.public_show_expenses, "
            "       t.place_id, t.lat, t.lng, "
            "       t.viewport_json, t.place_types, "
            "       t.companions_json, t.marked_places_json, "
            "       t.documents_json, t.photos_json, t.checklist_json, "
            "       t.trip_countries_json, "
            "       t.cover_url, t.actions_hidden "
            "FROM trips t "
            "LEFT JOIN trip_members tm "
            "  ON tm.trip_id = t.id AND tm.user_id = t.user_id "
            "WHERE t.id = ?",
            (trip_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        trip = dict(row)
        is_public = bool(trip.get('is_public'))
        owner_id = trip.get('user_id')

        # Visibility gate. Public → anyone. Private → caller must be a
        # member (owner row or accepted trip_members row). We hide
        # non-visible trips behind 404 to avoid leaking trip-id existence.
        is_visible = is_public
        is_member = False  # ← captured for the expense-gating below
        if not is_visible and caller_id:
            if owner_id == caller_id:
                is_visible = True
                is_member = True
            else:
                cursor.execute(
                    "SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ? "
                    "AND invitation_status = 'accepted' LIMIT 1",
                    (trip_id, caller_id),
                )
                if cursor.fetchone():
                    is_visible = True
                    is_member = True
        elif is_public and caller_id:
            # Trip is publicly visible AND the caller is signed in —
            # if they're also a member they get the full payload
            # (their own private bits). Resolve membership so the
            # expense-gating below grants access.
            if owner_id == caller_id:
                is_member = True
            else:
                cursor.execute(
                    "SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ? "
                    "AND invitation_status = 'accepted' LIMIT 1",
                    (trip_id, caller_id),
                )
                is_member = cursor.fetchone() is not None
        if not is_visible:
            return jsonify({"error": "Not found"}), 404

        # Public-trip granularity (next-quarter ship). When a trip is
        # public-on-profile-map, the owner can choose between:
        #   - public_show_expenses=0: viewers see destination, dates,
        #     days, plan text, photos. Expense rows STRIPPED.
        #   - public_show_expenses=1: viewers see everything.
        # Members always see expenses regardless of this flag (they're
        # the trip's editors / participants).
        public_show_expenses = bool(trip.get('public_show_expenses', 0))
        viewer_sees_expenses = is_member or public_show_expenses

        # Frontend-shape the trip row. Common camelCase fields come
        # from `serialize_trip_row` (shared with routes/data.py — §3.5).
        # Public surface notes:
        #   - isArchived is per-trip here (not per-user-member) because
        #     the public viewer has no membership context.
        #   - actions_hidden is owner-only metadata — strip it so it
        #     never reaches a non-member viewer.
        #   - user_id is preserved by the helper for caller-side role
        #     logic; the public endpoint already encoded ownerId, so
        #     drop the raw column to avoid double-exposure.
        trip = serialize_trip_row(trip)
        trip['isArchived'] = bool(trip.pop('is_archived', False))
        trip.pop('actions_hidden', None)
        trip.pop('user_id', None)

        # Owner display info (name + picture) so the read-only page can
        # show "by [Owner]". Kept tiny — just what the renderer needs.
        cursor.execute("SELECT id, name, picture FROM users WHERE id = ?", (owner_id,))
        owner_row = cursor.fetchone()
        owner = dict(owner_row) if owner_row else None

        # Days, expenses, and the day-level photos/documents that the
        # archived renderer consumes. Mirrors the /api/data shaping so
        # the same renderer can read this payload without branching.
        #
        # 2026-05-26 (audit SY5): tombstoned days/expenses are filtered
        # out of public reads the same way they are out of /api/data,
        # so a soft-deleted day never appears on a shared-trip URL.
        cursor.execute(
            "SELECT * FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL",
            (trip_id,),
        )
        trip_days = []
        for d_row in cursor.fetchall():
            day = dict(d_row)
            day['tripId'] = day.pop('trip_id')
            day['dayNumber'] = day.pop('day_number')
            day['lon'] = day.pop('lng')
            day['plan'] = {
                'morning': unwrap_legacy_plan_text(day.pop('morning', '')),
                'afternoon': unwrap_legacy_plan_text(day.pop('afternoon', '')),
                'evening': unwrap_legacy_plan_text(day.pop('evening', '')),
            }
            # §2.15: narrow to JSONDecodeError + TypeError (the only
            # things json.loads raises on malformed input). A bare
            # `except` here swallowed unrelated bugs in the rest of
            # the loop.
            try:
                day['photos'] = json.loads(day.get('photos') or '[]')
            except (json.JSONDecodeError, TypeError):
                day['photos'] = []
            try:
                day['documents'] = json.loads(day.get('documents') or '[]')
            except (json.JSONDecodeError, TypeError):
                day['documents'] = []
            trip_days.append(day)

        # Expense exposure is the granularity gate. Members always
        # see expenses (they own / edit the trip); non-member viewers
        # see them only when `public_show_expenses=1`. Skip the SQL
        # entirely when not exposing — saves a query AND prevents
        # accidental leakage via a future code change that forgets
        # the filter (defence-in-depth: the data never enters the
        # response object at all).
        expenses = []
        if viewer_sees_expenses:
            cursor.execute(
                "SELECT * FROM expenses WHERE trip_id = ? AND deleted_at IS NULL",
                (trip_id,),
            )
            expenses = [dict(r) for r in cursor.fetchall()]
            # Translate snake_case → camelCase for the public detail
            # surface. Same shape as routes/data.py — both reads need to
            # match because the frontend filters by `e.tripId`.
            for e in expenses:
                e['tripId'] = e.pop('trip_id', None)
                e['categoryId'] = e.pop('category_id', None)
                e['euroValue'] = e.pop('euro_value', None)
                e['receiptUrl'] = e.pop('receipt_url', None)

        # Inline tripDays + expenses + members on the trip object. The
        # archived-trip frontend reads these from `trip.tripDays` and
        # `trip.expenses` (snapshots stored on archive), not from
        # global STATE — so embedding them here means the same
        # renderer works for fetched trips with no extra plumbing.
        trip['tripDays'] = trip_days
        trip['expenses'] = expenses
        # Signal to the renderer: was the expense list intentionally
        # blank because of the granularity flag, vs blank because the
        # trip just genuinely has no expenses? Lets the UI show a
        # "Owner has chosen to keep expenses private" hint instead of
        # an empty-state for the case where expenses exist server-side
        # but aren't being shared with this viewer.
        trip['expensesRedacted'] = (not viewer_sees_expenses)

        cursor.execute('''
            SELECT m.user_id, m.role, u.name AS user_name, u.picture AS user_picture
            FROM trip_members m
            LEFT JOIN users u ON u.id = m.user_id
            WHERE m.trip_id = ? AND m.invitation_status = 'accepted'
        ''', (trip_id,))
        trip['members'] = [
            {
                'userId': mr['user_id'],
                'role': mr['role'],
                'name': mr['user_name'],
                'picture': mr['user_picture'],
            }
            for mr in cursor.fetchall()
        ]

        return jsonify({"trip": trip, "owner": owner})


@bp.route("/api/public-profile/<user_id>", methods=["GET"])
def get_public_profile(user_id):
    """Fetch public profile data for a user (Name, Bio, Public Trips, etc)."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Get user info
        cursor.execute("SELECT name, email, picture, bio, status FROM users WHERE id = ?", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            return jsonify({"error": "User not found"}), 404

        # Get only public trips. FIXING_ROADMAP §1.13: pre-fix this
        # WHERE clause was `is_public = 1 OR is_archived = 1`, which
        # leaked every archived (private) trip's metadata — country,
        # name, coordinates — to any unauthenticated viewer of the
        # user's public profile. Archived means "done with this trip"
        # not "make this trip public"; the two flags are independent
        # and the public-profile surface must respect is_public only.
        # `isArchived` is still returned in the row shape so the
        # frontend's footprint render can render the public *trip's*
        # archive state, but no row leaks unless is_public=1.
        #
        # 2026-05-18 audit H1: read the OWNER's per-user archive flag
        # from trip_members (the post-deprecation source of truth) via
        # a LEFT JOIN so a trip with no member row still renders
        # (isArchived → False). The legacy `trips.is_archived` column
        # stays untouched until the column-drop migration in a future
        # slice.
        cursor.execute(
            "SELECT t.id, t.name, t.country, t.is_public, "
            "       COALESCE(tm.is_archived, 0) AS is_archived, "
            "       t.place_id, t.lat, t.lng, t.viewport_json, "
            "       t.place_types, t.country_code "
            "FROM trips t "
            "LEFT JOIN trip_members tm "
            "  ON tm.trip_id = t.id AND tm.user_id = t.user_id "
            "WHERE t.user_id = ? AND t.is_public = 1",
            (user_id,),
        )
        trips = []
        for row in cursor.fetchall():
            t = dict(row)
            t['isPublic'] = bool(t.pop('is_public'))
            t['isArchived'] = bool(t.pop('is_archived'))
            t['placeId'] = t.pop('place_id', None)
            viewport_raw = t.pop('viewport_json', None)
            t['viewport'] = json.loads(viewport_raw) if viewport_raw else None
            types_raw = t.pop('place_types', None)
            t['placeTypes'] = json.loads(types_raw) if types_raw else None
            t['countryCode'] = t.pop('country_code', None)
            trips.append(t)

        # §4.4 — public profile gets the user's badges so viewers can
        # see their travel CV. Same `list_user_achievements` shape the
        # owner's /api/data returns, so the renderer is identical
        # whether you're viewing yourself or a friend.
        achievements = list_user_achievements(cursor, user_id)

        # §4.7 — follower / following counts + the caller's
        # `isFollowing` flag (false when anonymous / self / not signed
        # in). Bundling these into the profile read so the profile
        # page renders in one round-trip rather than fanning out to
        # /api/follows/<user_id> after the first paint.
        counts = follower_counts(cursor, user_id)
        caller_id = current_user_id()
        isFollowing = is_following(cursor, caller_id, user_id) if caller_id else False

        return jsonify({
            "user": dict(user_row),
            "trips": trips,
            "achievements": achievements,
            "followers": counts["followers"],
            "following": counts["following"],
            "isFollowing": isFollowing,
        })


# ── Share-via-link public read (FIXING_ROADMAP §4.1) ─────────────────


def fetch_share_payload(token):
    """Look up the trip by share_token and shape the public payload.
    Shared with the /share/<token> HTML route in main.py (no point in
    duplicating the SELECT + currency aggregation across two callers).
    Returns `None` for unknown tokens — the caller decides whether to
    404, render an empty state, etc.

    Payload is INTENTIONALLY STRIPPED:
      - trip: id, name, country, cover_url, dates derived from days
      - days: dayNumber, date, name, lat, lng
              (plus morning/afternoon/evening/tip when share_show_plans=1)
      - owner: first name + picture only (no email, no full name)
      - views: share_views count for the chip on the page
      - cost: included only when share_show_cost = 1; shape is an
        aggregate (total + per-country) — never line items.

    Photos, documents, expense line items, and member identities are
    NEVER exposed regardless of toggle state.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, user_id, name, country, country_code, cover_url, "
            "lat, lng, viewport_json, share_views, share_show_cost, share_show_plans "
            "FROM trips WHERE share_token = ?",
            (token,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        bind_trip_context(row["id"])
        trip = {
            "id": row["id"],
            "name": row["name"] or "Untitled trip",
            "country": row["country"] or "",
            "countryCode": row["country_code"] or "",
            "coverUrl": row["cover_url"],
            "lat": row["lat"],
            "lng": row["lng"],
            "viewport": (
                json.loads(row["viewport_json"]) if row["viewport_json"] else None
            ),
            "views": int(row["share_views"] or 0),
        }
        show_cost = bool(row["share_show_cost"])
        show_plans = bool(row["share_show_plans"])

        # SELECT plan fields conditionally to avoid sending them over the
        # wire (and into Jinja's context) when they aren't going to be
        # rendered. Defense-in-depth: even if the template were patched
        # to render them unconditionally, an unauthorized share wouldn't
        # have the data available.
        # 2026-05-26 (audit SY5): tombstoned days are filtered out of
        # the public /share/<token> view — same gate as /api/data.
        if show_plans:
            cursor.execute(
                "SELECT day_number, date, name, lat, lng, "
                "       morning, afternoon, evening, tip "
                "FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL "
                "ORDER BY COALESCE(day_number, 0), date",
                (row["id"],),
            )
        else:
            cursor.execute(
                "SELECT day_number, date, name, lat, lng "
                "FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL "
                "ORDER BY COALESCE(day_number, 0), date",
                (row["id"],),
            )
        days = []
        for d in cursor.fetchall():
            day = {
                "dayNumber": d["day_number"],
                "date": d["date"],
                "name": d["name"] or "",
                "lat": d["lat"],
                "lng": d["lng"],
            }
            if show_plans:
                day["plan"] = {
                    "morning": unwrap_legacy_plan_text(d["morning"] or ""),
                    "afternoon": unwrap_legacy_plan_text(d["afternoon"] or ""),
                    "evening": unwrap_legacy_plan_text(d["evening"] or ""),
                }
                day["tip"] = d["tip"] or ""
            days.append(day)

        # Owner display — first name only. Sharing exposes WHO shared
        # the trip but not their email or full identity.
        cursor.execute(
            "SELECT name, picture FROM users WHERE id = ?",
            (row["user_id"],),
        )
        u = cursor.fetchone()
        owner = None
        if u:
            full_name = u["name"] or "Someone"
            owner = {
                "firstName": full_name.split(" ")[0],
                "picture": u["picture"],
            }

        cost_summary = None
        if show_cost:
            # Aggregate-only, never line items. Per-country breakdown
            # mirrors the Insights page's grouping. Returns euro_value
            # so the front-page can render in the viewer's currency
            # later if we add a "convert to my currency" toggle.
            # 2026-05-26 (audit SY5): tombstoned expenses excluded
            # from public per-country totals — same shape as the SY5
            # filter on the /api/data path.
            cursor.execute(
                "SELECT COALESCE(country, '?') AS country, "
                "       SUM(COALESCE(euro_value, 0)) AS total "
                "FROM expenses WHERE trip_id = ? AND deleted_at IS NULL "
                "GROUP BY country",
                (row["id"],),
            )
            per_country = [
                {"country": r["country"], "total": float(r["total"] or 0)}
                for r in cursor.fetchall()
            ]
            total = sum(c["total"] for c in per_country)
            cost_summary = {
                "total": round(total, 2),
                "perCountry": per_country,
                "dayCount": len(days),
            }

        return {
            "trip": trip,
            "days": days,
            "owner": owner,
            "cost": cost_summary,
        }


@bp.route("/api/share/<token>", methods=["GET"])
def get_shared_trip(token):
    """Public read endpoint — anyone with the share token can fetch
    the stripped trip payload. Bypasses @require_auth deliberately;
    the route is the "no account required" surface.

    Token format isn't validated server-side beyond "matches the
    stored value" — `secrets.token_urlsafe(16)` produces only
    URL-safe chars and 22-char length so there's no real attack via
    weird input.
    """
    payload = fetch_share_payload(token)
    if not payload:
        return jsonify({"error": "Not found"}), 404
    return jsonify(payload)
