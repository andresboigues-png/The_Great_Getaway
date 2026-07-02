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

from flask import Blueprint, jsonify, make_response, request

from auth import current_user_id
from database import get_db
from achievements import list_user_achievements
from extensions import limiter
from observability import bind_trip_context
from helpers import (
    serialize_expense_row,
    serialize_trip_row,
    unwrap_legacy_plan_text,
)
from routes.follows import follower_counts, is_following


bp = Blueprint("public", __name__)


# Audit fix (2026-05-26): rate-limit every anonymous-readable
# endpoint so a scripted scraper can't iterate trip IDs / user IDs /
# share tokens at full speed to harvest metadata. 60/minute is
# generous for legitimate viewers (a real human clicks-through at
# most ~10x in a minute) but kills any meaningful enumeration.
# Pre-fix these routes had no limiter, so a single attacker could
# scan the entire public surface within minutes.
_PUBLIC_READ_LIMIT = "60 per minute"


@bp.route("/api/public-trip/<trip_id>", methods=["GET"])
@limiter.limit(_PUBLIC_READ_LIMIT)
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

        # R10-B6c S1: block-aware response when the caller is signed
        # in. If either side blocks the other we return 404, matching
        # the get_public_profile gate at line 322-331 + the
        # /api/follows/<id> response shape (never leak the block
        # state via differential codes). Anonymous callers fall
        # through to the normal public-trip path (blocking is between
        # two known identities). Owner viewing their own trip
        # bypasses the check — you can't block yourself.
        if caller_id and owner_id and caller_id != owner_id:
            cursor.execute(
                "SELECT 1 FROM blocks WHERE "
                "(blocker_id = ? AND blocked_id = ?) OR "
                "(blocker_id = ? AND blocked_id = ?) LIMIT 1",
                (caller_id, owner_id, owner_id, caller_id),
            )
            if cursor.fetchone():
                return jsonify({"error": "Not found"}), 404

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

        # 2026-06: completed/archived PUBLIC trips ARE viewable now (the
        # click-through from a shared feed post / Explore must resolve). Access
        # is gated on PRIVACY (is_visible = is_public, above) + membership +
        # blocks — not on completion state. The old archived-non-member 404
        # (MK4 SOC-2) is removed; private trips are still 404'd by the
        # is_visible gate.

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
        # Trip Hub notes are member-only internal planning text — they
        # travel ONLY over the authenticated /api/data path. Strip here
        # so the pass-through in serialize_trip_row never leaks them to a
        # public viewer (the /share/<token> path never selects the column).
        trip.pop('notes', None)

        # Audit fix (2026-05-26): non-member viewers must NOT see the
        # owner's private metadata. fetch_share_payload (the /share/
        # endpoint) already strips these; this public-trip path had
        # been leaking them since the helper grew the fields. Strip
        # the same set so the two read paths converge on the same
        # privacy contract.
        if not is_member:
            # Personal files + private wishlist.
            trip['photos'] = []
            trip['documents'] = []
            trip['checklist'] = []
            trip['markedPlaces'] = []
            # linkedUserId on companions leaks the friend graph
            # (anyone can map "Famous Person" to a real user_id and
            # then probe /api/public-profile/<id>). Strip to bare
            # names; non-members don't need the link.
            trip['companions'] = [
                {'name': c.get('name', '')}
                for c in (trip.get('companions') or [])
                if isinstance(c, dict)
            ]

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
            # Wave 2: accommodation reveals where the traveller sleeps —
            # strip it from the public read surface (members get it via the
            # authenticated /api/data path instead).
            day.pop('accommodation', None)
            day.pop('accommodation_place_id', None)
            day.pop('accommodation_address', None)
            # Per-day personal `notes` (journaling) + the free-text `tip` are
            # the planner's own jottings — strip them for NON-members, the
            # same privacy contract as photos/documents below. The plan text
            # (morning/afternoon/evening) stays: that's the shareable
            # itinerary this page exists to show. Members read notes/tip via
            # the authenticated /api/data path.
            if not is_member:
                day.pop('notes', None)
                day.pop('tip', None)
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
            # MK6 P2: per-day photos/documents are the planner's uploaded
            # files — the SAME privacy contract as trip-level media (stripped
            # at ~197) and per-day notes/tip (~246). They were leaking to
            # anonymous / non-member viewers of a public trip; only
            # authenticated members get day media, via /api/data.
            if not is_member:
                day['photos'] = []
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
            # R9-B1 C1: exclude settlement rows from the public expense
            # list. Pre-§4.5 settle-up rows live in `expenses` with
            # `is_settlement=1`. Without this filter the share viewer
            # saw "Sara paid Andres €45" interpersonal-debt rows mixed
            # in with real spend — interpersonal debts the publicShow
            # ExpensesCost toggle was NEVER meant to expose. Same
            # filter as the PDF route (pdf.py ~2263) + balance math.
            cursor.execute(
                "SELECT * FROM expenses WHERE trip_id = ? "
                "AND deleted_at IS NULL "
                "AND COALESCE(is_settlement, 0) = 0",
                (trip_id,),
            )
            # BUG-12 (MK2 audit): project public expenses down to spend-only
            # fields. Pre-fix `dict(r)` shipped the RAW row to anonymous
            # viewers — `who`, the named `splits` map ({"Alex":50,"Sara":50}),
            # the `receiptUrl`, plus is_settlement/deleted_at/updated_at/user_id
            # — i.e. the interpersonal accounting the publicShowExpenses toggle
            # was never meant to expose. A stranger should see WHAT was spent,
            # not who paid or how the bill was split. Keep only the safe fields.
            for r in cursor.fetchall():
                row = dict(r)
                expenses.append({
                    'id': row.get('id'),
                    'tripId': row.get('trip_id'),
                    'label': row.get('label'),
                    'value': row.get('value'),
                    'currency': row.get('currency'),
                    'euroValue': row.get('euro_value'),
                    'categoryId': row.get('category_id'),
                    'date': row.get('date'),
                    'country': row.get('country'),
                })

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
        # Audit fix (2026-05-26): non-members get a NAME-ONLY roster.
        # Pre-fix this exposed every member's userId + picture to any
        # anonymous viewer of a public trip — a trivial social-graph
        # scrape pipeline (list trip ids → list members → call
        # /api/public-profile/<id> for each). Members still see the
        # full roster (they're the editors).
        if is_member:
            trip['members'] = [
                {
                    'userId': mr['user_id'],
                    'role': mr['role'],
                    'name': mr['user_name'],
                    'picture': mr['user_picture'],
                }
                for mr in cursor.fetchall()
            ]
        else:
            trip['members'] = [
                {'name': mr['user_name']}
                for mr in cursor.fetchall()
            ]

        return jsonify({"trip": trip, "owner": owner})


@bp.route("/api/public-profile/<user_id>", methods=["GET"])
@limiter.limit(_PUBLIC_READ_LIMIT)
def get_public_profile(user_id):
    """Fetch public profile data for a user (Name, Bio, Public Trips, etc).

    Audit fix (2026-05-26): pre-fix this endpoint SELECTed email and
    returned it via `dict(user_row)` to ANY anonymous caller. The route
    has no @require_auth (intentional — anonymous profile views are a
    product feature) so combined with email-prefix search this was a
    trivial harvest pipeline. Drop email from the SELECT and from the
    response payload; profile only ships name + picture + bio + status.
    """
    with get_db() as conn:
        cursor = conn.cursor()

        # R2 audit fix: block-aware response when the caller is
        # signed in. If either side blocks the other we return 404
        # (matches the /api/follows/<id> response shape — never
        # leak the block state via differential codes). Anonymous
        # callers fall through to the normal public-profile path,
        # since blocking is between two known identities.
        caller_id = current_user_id()
        if caller_id and caller_id != user_id:
            cursor.execute(
                "SELECT 1 FROM blocks WHERE "
                "(blocker_id = ? AND blocked_id = ?) OR "
                "(blocker_id = ? AND blocked_id = ?) LIMIT 1",
                (caller_id, user_id, user_id, caller_id),
            )
            if cursor.fetchone():
                return jsonify({"error": "User not found"}), 404

        # Get user info — no email exposed publicly.
        cursor.execute("SELECT name, picture, bio, status FROM users WHERE id = ?", (user_id,))
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
            "WHERE t.user_id = ? AND t.is_public = 1 "
            # R3-Round 3 fix: hard cap at 100. Pre-fix Diego's 80+
            # public trips all shipped on every public-profile read
            # (with viewport_json + place_types JSON parsed for each)
            # — multiple kB per row, totaling several hundred kB
            # before the trip-card renderer downsamples to thumbnails.
            # 100 is well above the realistic ceiling; a deeper
            # browse needs its own paginated surface.
            "ORDER BY t.created_at DESC "
            "LIMIT 100",
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
        #
        # R3-Round 2 #36: achievements + their `context_json` (which
        # can include country names, trip ids, spend totals) reveal a
        # fingerprintable travel pattern to anyone with the URL.
        # Restrict the badge list to: self + followers + signed-in
        # mutual-friends. Anonymous viewers get an empty list — they
        # see the profile shell + public trips but not the CV.
        counts = follower_counts(cursor, user_id)
        caller_id = current_user_id()
        isFollowing = is_following(cursor, caller_id, user_id) if caller_id else False
        can_see_achievements = bool(
            caller_id
            and (caller_id == user_id or isFollowing)
        )
        achievements = (
            list_user_achievements(cursor, user_id) if can_see_achievements else []
        )

        return jsonify({
            "user": dict(user_row),
            "trips": trips,
            "achievements": achievements,
            "followers": counts["followers"],
            "following": counts["following"],
            "isFollowing": isFollowing,
        })


# ── Share-via-link public read (FIXING_ROADMAP §4.1) ─────────────────


# R3-Round 3 fix: bucket the share-views count for the anon-recipient
# surface. Returns an integer that the template can render directly;
# small values stay exact, larger ones round down to a privacy-
# preserving bucket. Buckets chosen so the user still gets a sense
# of momentum without exposing the precise viral curve.
_VIEW_BUCKETS = (10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000)


def _bucket_share_views(n: int) -> int:
    if n <= 0:
        return 0
    if n < _VIEW_BUCKETS[0]:
        return n  # exact value for the first 9 views
    chosen = _VIEW_BUCKETS[0]
    for b in _VIEW_BUCKETS:
        if n >= b:
            chosen = b
        else:
            break
    return chosen


def fetch_share_payload(token, caller_id=None):
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

    R10-B6c S1: when `caller_id` is supplied (signed-in viewer hits
    a share link) we now ALSO 404 on a mutual block — matches
    get_public_profile + get_public_trip. Anonymous callers (no
    caller_id) are unaffected; share URLs are designed to work for
    logged-out recipients by definition.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        # R5-B1 fix: include is_archived so we can refuse to serve an
        # archived trip's share page. The clone-from-share path already
        # refuses archived trips (clone_trip_from_share_token in
        # routes/trips.py with the "owner archived for a reason" 410),
        # but the READ path was happily serving the full payload after
        # the owner had completed/archived — an inconsistent privacy
        # contract. Anon viewers can't supply their own viewer-side
        # tm.is_archived, so trips.is_archived is the only signal we
        # can use (and it's set whenever the owner archives their own
        # copy — see trips.py:378).
        cursor.execute(
            "SELECT id, user_id, name, country, country_code, cover_url, "
            "lat, lng, viewport_json, share_views, share_show_cost, share_show_plans, "
            "is_archived "
            "FROM trips WHERE share_token = ?",
            (token,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        # 2026-06: a completed/archived trip's share link KEEPS working now.
        # The secret share token IS the access control here (a deliberate
        # per-trip grant), so completion state no longer gates the read — this
        # replaces the old R5-B1 archived refusal that broke completed trips'
        # share links. (Public discovery — Explore / public-trip — still
        # requires is_public; a private link share is intentional and allowed.)
        # R10-B6c S1: block-aware response. A signed-in caller who's
        # mutually blocked with the trip owner sees the same "not
        # available" branch as a wrong/revoked token (the main.py
        # share_page template handles None-payload as a friendly
        # empty page). Anonymous viewers fall through (no caller_id).
        # Owner viewing their own share token bypasses (self-block
        # is impossible by the blocks-table constraint).
        owner_id = row["user_id"]
        if caller_id and owner_id and caller_id != owner_id:
            cursor.execute(
                "SELECT 1 FROM blocks WHERE "
                "(blocker_id = ? AND blocked_id = ?) OR "
                "(blocker_id = ? AND blocked_id = ?) LIMIT 1",
                (caller_id, owner_id, owner_id, caller_id),
            )
            if cursor.fetchone():
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
            # R3-Round 3 fix: coarse-bucket the views count to anon
            # share recipients. Pre-fix the precise number leaked a
            # fingerprintable engagement curve to anyone with the URL
            # (competitor / stalker / employer could tell whether a
            # share was viral). Buckets preserve the "is this popular?"
            # signal without revealing the exact count. The owner
            # still sees the exact value via /api/data's shareViews
            # (gated to owner in R3-Fix #3).
            "views": _bucket_share_views(int(row["share_views"] or 0)),
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
            # R9-B1 C1: same is_settlement filter as the detail SELECT
            # above. Pre-fix per-country totals were INFLATED by every
            # settlement amount (a €45 settle-up showed up as €45 of
            # "spend in PT" on the public cost banner).
            cursor.execute(
                "SELECT COALESCE(country, '?') AS country, "
                "       SUM(COALESCE(euro_value, 0)) AS total "
                "FROM expenses WHERE trip_id = ? "
                "AND deleted_at IS NULL "
                "AND COALESCE(is_settlement, 0) = 0 "
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
@limiter.limit(_PUBLIC_READ_LIMIT)
def get_shared_trip(token):
    """Public read endpoint — anyone with the share token can fetch
    the stripped trip payload. Bypasses @require_auth deliberately;
    the route is the "no account required" surface.

    Token format isn't validated server-side beyond "matches the
    stored value" — `secrets.token_urlsafe(16)` produces only
    URL-safe chars and 22-char length so there's no real attack via
    weird input.

    Audit fix (2026-05-26): increment `share_views` on first visit
    (deduped by cookie), mirroring the HTML route at
    `/share/<token>` in main.py. Pre-fix the JSON endpoint read the
    counter but never incremented it, so the owner's share-views
    chip stayed at zero for visitors who only hit the API.
    """
    # R10-B6c S1: thread caller_id into fetch_share_payload so a
    # mutual block between signed-in viewer + trip owner yields the
    # same not-found shape as a wrong/revoked token. Anonymous hits
    # (no caller_id) bypass the check by design.
    payload = fetch_share_payload(token, caller_id=current_user_id())
    if not payload:
        return jsonify({"error": "Not found"}), 404

    # Dedup by anonymous cookie. Cookie value is just "1"; we only
    # care whether THIS browser has seen THIS token in the last 24h.
    # Same cookie-name shape as the HTML route so visiting one then
    # the other doesn't double-count.
    # R3-Round 3 fix: hash the token before using it as a cookie name
    # suffix — pre-fix 16 chars of the share_token leaked in plain
    # text via `Set-Cookie`. Same change as the HTML route in main.py.
    import hashlib
    cookie_name = f"gg_viewed_{hashlib.sha256(token.encode()).hexdigest()[:16]}"
    has_seen = request.cookies.get(cookie_name) is not None
    incremented = False
    if not has_seen:
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE trips SET share_views = COALESCE(share_views, 0) + 1 "
                "WHERE share_token = ?",
                (token,),
            )
            # R5-B6: gate the in-payload bump + Set-Cookie on rowcount.
            # If the owner revoked between fetch_share_payload (which
            # SELECTed by share_token + got a hit) and this UPDATE,
            # rowcount is 0 — we shouldn't fake-increment the view
            # counter in the response OR set the dedup cookie (the
            # cookie would block a re-share later if the owner
            # re-issues the same trip's token, which is rare but
            # possible). Mirrors the HTML route's gate in main.py.
            incremented = cursor.rowcount == 1
            conn.commit()
        if incremented:
            payload["trip"]["views"] = payload["trip"].get("views", 0) + 1

    response = make_response(jsonify(payload))
    # R10-B6e MA3: stamp Cache-Control: private so shared HTTP caches
    # (corporate proxies, ISP transparent caches) don't store a copy
    # of the shareable payload and serve it to other users behind the
    # same proxy. The HTML route at /share/<token> in main.py already
    # has this; the JSON sibling was the missed mirror. The payload
    # is intentionally narrow (no auth-gated data, but per-visitor
    # share-views + the trip-name + cover-url) so private caching is
    # the right semantic — same as the cookie's Secure+httponly
    # treatment a few lines down.
    response.headers["Cache-Control"] = "private, max-age=0, no-store"
    if incremented:
        response.set_cookie(
            cookie_name, "1",
            max_age=24 * 60 * 60,
            httponly=True, samesite="Lax",
            # R5-B6: Secure flag prevents the token-hash from leaking
            # in clear over an http downgrade (captive portals,
            # injected http img tags). HSTS protects most users but
            # first-contact on a fresh host can still be plain http.
            secure=request.is_secure,
        )
    return response
