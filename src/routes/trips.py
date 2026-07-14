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

from flask import Blueprint, jsonify

from achievements import check_user_achievements
from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import (
    can_edit_trip,
    collect_trip_upload_paths,
    delete_upload_files,
    ensure_owner_member_row,
    ensure_user_exists,
    insert_notification,
    is_trip_archived_for,
    is_trip_member,
    is_trip_owner,
    json_body,
    trip_member_role,
    unlink_companion_user_from_trip,
)
from observability import bind_trip_context
from validators import (
    ValidationError,
    clean_companions,
    clean_text,
    is_safe_media_url,
    validate_upload_url,
)

bp = Blueprint("trips", __name__)


def _cleaned_companions(cursor, trip_id, raw):
    """Wrapper that fetches `verified_linked_ids` from trip_members
    and pipes the raw companions array through `clean_companions`.

    R2 audit fix: stops clients from planting `linkedUserId` values
    that don't correspond to an actual accepted/pending member of
    the trip. For a brand-new trip (no members yet) the verified
    set is empty, so any non-null linkedUserId gets coerced to
    None — the name + UI presence survive but the spoofed link
    silently disappears. After the owner-self-stamp + invitations
    flow, legitimate linkedUserIds are in trip_members and pass."""
    if not isinstance(raw, list):
        return []
    verified: set[str] = set()
    if trip_id:
        cursor.execute(
            "SELECT user_id FROM trip_members WHERE trip_id = ?",
            (trip_id,),
        )
        verified = {r["user_id"] for r in cursor.fetchall() if r["user_id"]}
    return clean_companions(raw, verified_linked_ids=verified)


# Arrival/departure travel legs. Mirrors the TransportMode union in the
# frontend types (frontend/static/js/types.d.ts) — do NOT invent new
# modes; an unknown mode falls back to 'mixed' rather than 400-ing the
# whole trip upsert.
_TRAVEL_MODES = frozenset(
    {
        "walk",
        "metro",
        "bus",
        "train",
        "tram",
        "car",
        "taxi",
        "bike",
        "ferry",
        "flight",
        "mixed",
    }
)


def _clean_travel_leg(raw):
    """Coerce one raw leg to {mode, note?} or None. Non-dict / empty →
    None (leg cleared). Unknown mode → 'mixed'. Note is clamped to 200
    chars and control-stripped; junk (non-string) note is dropped.
    Never raises — a bad leg is dropped/coerced, not a 400."""
    if not isinstance(raw, dict):
        return None
    mode = raw.get("mode")
    if not isinstance(mode, str) or mode not in _TRAVEL_MODES:
        mode = "mixed"
    leg = {"mode": mode}
    note = raw.get("note")
    if isinstance(note, str):
        try:
            cleaned = clean_text(note, max_len=200, allow_newlines=False, field_name="note")
        except ValidationError:
            # Over-length note: truncate instead of rejecting the trip.
            cleaned = note.strip()[:200]
        if cleaned:
            leg["note"] = cleaned
    # `from`: the car leg's other-end free text (where driving from/to). Same
    # forgiving handling as note — truncate, never 400 the whole trip.
    frm = raw.get("from")
    if isinstance(frm, str):
        try:
            cleaned_from = clean_text(frm, max_len=160, allow_newlines=False, field_name="from")
        except ValidationError:
            cleaned_from = frm.strip()[:160]
        if cleaned_from:
            leg["from"] = cleaned_from
    return leg


def _clean_travel(raw):
    """Coerce the raw `travel` value to a JSON string for travel_json, or
    None. Contract (mirrors trip_countries / notes COALESCE protection):

      - travel absent (not a dict)   → None  (COALESCE preserves stored)
      - travel = {}                  → '{}'  (clears both legs)
      - travel = {"arrival": null}   → '{"departure": null}'-style clear
      - travel = {"arrival": {...}}  → serialized object (sets the leg)

    A leg present-but-null clears that leg; a leg absent from the object
    is emitted as null too (a full travel object is authoritative when
    sent — the frontend always sends both keys)."""
    if not isinstance(raw, dict):
        return None
    out = {
        "arrival": _clean_travel_leg(raw.get("arrival")),
        "departure": _clean_travel_leg(raw.get("departure")),
    }
    return json.dumps(out)


@bp.route("/api/trips", methods=["POST"])
@limiter.limit("60 per minute")
@require_auth
@retry_on_lock()
def upsert_trip():
    """Create or update a single trip. Auto-creates the owner's
    membership row on insert; rejects edits from non-planners on
    existing trips."""
    # BUG-22 (MK2 audit) / SEC-2: json_body() collapses a non-dict body
    # (array root, or `trip` being a string/list, or a dict with no id) to
    # {} so malformed input is a clean 400 below instead of an uncaught
    # AttributeError/KeyError → 500.
    data = json_body()
    user_id = current_user_id()
    t = data.get("trip")
    if not isinstance(t, dict):
        return jsonify({"error": "Missing data"}), 400
    if not t.get("id"):
        return jsonify({"error": "Missing trip id"}), 400
    # BUG-22: `name` is bound unconditionally into the INSERT (and the ON
    # CONFLICT overwrites with excluded.name). Real callers always send the
    # full trip; require it so a malformed payload is a clean 400 instead of a
    # KeyError → 500 (and so a partial body can't blank a trip's name).
    if not t.get("name"):
        return jsonify({"error": "Missing trip name"}), 400
    # A1-B2: cap the trip name server-side. Every OTHER named entity
    # (companions via clean_companions, expense label/who, budget label,
    # day title) clamps to 200 chars, but the trip name flowed straight
    # into an unbounded `name TEXT` column — a huge pasted name then
    # bloated every /api/data payload (which ships the name on each
    # 15-second poll). Normalize + bound here so a single-line 400 is
    # the ceiling; the value written below reads back from `t['name']`.
    try:
        t["name"] = clean_text(t["name"], max_len=200, allow_newlines=False, field_name="name")
    except ValidationError as ve:
        return jsonify({"error": str(ve)}), 400
    if not t["name"]:
        # clean_text may have stripped a control-only / whitespace name to
        # empty — treat the same as a missing name.
        return jsonify({"error": "Missing trip name"}), 400
    bind_trip_context(t.get("id"))
    with get_db() as conn:
        cursor = conn.cursor()
        # Sync Phase 1: refuse to resurrect a tombstoned trip. A member's
        # offline outbox can replay an upsert for a trip the owner deleted;
        # after the cascade there's no row to gate on, so without this the
        # replay re-creates a childless zombie trip (stamping the replayer
        # as owner). Terminal by id — trips always get a fresh uuid on
        # create, so a legit re-create never reuses a tombstoned id.
        # Idempotent ok so the offline client doesn't error-loop; its next
        # /api/data pull drops the trip locally.
        cursor.execute("SELECT 1 FROM trip_deletes WHERE trip_id = ?", (t["id"],))
        if cursor.fetchone():
            return jsonify({"status": "ok", "updatedAt": None})
        # Existing trip? Gate on planner role (owner counts as planner).
        cursor.execute(
            "SELECT user_id, updated_at, is_public, public_show_expenses FROM trips WHERE id = ?",
            (t["id"],),
        )
        existing = cursor.fetchone()
        if existing and not can_edit_trip(cursor, t["id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        # A1-B3: validate `countryCode` server-side. The client enforces a
        # real ISO alpha-2 country before letting the user save, but the
        # server bound `t.get('countryCode')` RAW into the nullable
        # `country_code` column with no check — so a direct POST with a
        # bogus non-ISO string (e.g. "not-a-country", or a 30-char blob)
        # was persisted verbatim, corrupting every read surface that keys
        # off it (slideshow, chip strip, flag tile — all assume a real
        # alpha-2 code). Mirror the sibling `countries` array normalization
        # (which upper-cases + length-checks its members): when a
        # non-empty countryCode is present it MUST be a 2-letter alpha
        # code, and we normalize to upper-case in place so a lowercase
        # `pt` reads back as `PT`.
        #
        # Scope note: an ABSENT / empty countryCode is intentionally NOT
        # rejected here. Country is mandatory in the create UI, but the
        # server has long accepted countryless creates (the shared test
        # harness + several import/clone paths mint trips before the
        # country resolves), so newly 400-ing them would be a behavioural
        # break, not a bug fix. This closes the "bogus value stored raw"
        # half; the empty-on-create half is a client-side invariant.
        raw_cc = t.get("countryCode")
        if raw_cc not in (None, ""):
            if not isinstance(raw_cc, str):
                return jsonify({"error": "countryCode must be a string"}), 400
            cc = raw_cc.strip().upper()
            if len(cc) != 2 or not cc.isalpha():
                return jsonify({"error": "countryCode must be a 2-letter ISO country code"}), 400
            t["countryCode"] = cc
        # BUG-35 (MK2 audit): is_public / public_show_expenses are an
        # OWNER-only privacy decision. A non-owner planner may edit the
        # trip's name + itinerary, but must NOT publish it (or expose its
        # spend) to the whole internet. Pin both flags to their stored
        # values when a non-owner edits an existing trip, so the upsert
        # below can't change them.
        if existing and existing["user_id"] != user_id:
            t["isPublic"] = bool(existing["is_public"])
            t["publicShowExpenses"] = bool(existing["public_show_expenses"])
        # R11-B5: per-user daily trip-CREATE cap. Edits don't count
        # (an existing row → just upsert). Pre-fix `Limiter` keyed on
        # IP gave a logged-in spammer 60 new trips/min indefinitely
        # — useful for quickly filling the friend feed with garbage.
        # 50/day is generous (~10x normal heavy-user baseline) but
        # caps the spam vector cleanly.
        if not existing:
            from helpers import user_daily_count

            if user_daily_count("trip_create", user_id) >= 50:
                return jsonify(
                    {
                        "error": "Daily new-trip cap reached — try again tomorrow.",
                        "userCapHit": True,
                    }
                ), 429

        # R3-Round 5: optimistic-concurrency gate. Same pattern as the
        # /api/expenses route (see that file for the full rationale).
        # Trips are particularly prone to two-tab clobbers because the
        # edit modal touches many fields at once — Maria opening the
        # same trip in two tabs and editing the name in tab A then the
        # cover image in tab B pre-fix had tab B's whole-trip payload
        # silently overwrite tab A's name change. Now: tab B's
        # `clientUpdatedAt` is stale → 409 with the live row →
        # client re-renders and retries.
        #
        # R8-B4 atomicity: the staleness check is enforced INSIDE the
        # ON CONFLICT DO UPDATE's WHERE clause (see the SQL below),
        # NOT via a Python SELECT-then-compare. Pre-fix two parallel
        # writes could both read stored=T0, both pass the Python
        # check, both commit — second silently overwrites first.
        # SQLite's deferred transaction doesn't write-lock at SELECT;
        # only the UPDATE acquires the lock. The WHERE-based gate is
        # atomic at the SQL layer: the rowcount discriminates.
        client_updated_at = t.get('clientUpdatedAt')

        owner_id = existing["user_id"] if existing else user_id

        # MK1 NOW-3: gate coverUrl to the caller's own upload, closing the
        # asymmetry with /api/sync (data.py _validated_cover_url, MK6
        # P3/security) — pre-fix this per-row path bound t.get('coverUrl')
        # RAW, so a crafted POST could store an arbitrary external URL that
        # every member + public share viewer then fetches (tracking pixel).
        # Per-row policy is STRICT (400), unlike sync's silent-preserve.
        # Only validate when the key is PRESENT: absent → the TRIP-6
        # preserve-CASE below never reads the value; present-but-empty →
        # normalized to None = the legitimate Remove-cover action.
        if 'coverUrl' in t:
            try:
                t['coverUrl'] = validate_upload_url(
                    t.get('coverUrl'),
                    user_id=user_id,
                    field_name="coverUrl",
                    allow_empty=True,
                )
            except ValidationError as ve:
                return jsonify({"error": str(ve)}), 400

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
                c.strip().upper()
                for c in t['countries']
                if isinstance(c, str) and len(c.strip()) == 2
            ]
            # Dedupe while preserving order — first occurrence wins, so
            # the primary country (which the client puts first) stays
            # at position 0. dict.fromkeys preserves insertion order.
            normalized = list(dict.fromkeys(normalized))
            countries_payload = json.dumps(normalized)  # '[]' when empty
        else:
            countries_payload = None

        # Arrival/departure travel legs. Same absent-vs-explicit-empty
        # discipline as countries above so the COALESCE below preserves on
        # a partial metadata payload and clears on an explicit empty:
        #   - travel absent            → None  (COALESCE preserves)
        #   - travel = {}              → '{...null legs...}' (clears legs)
        #   - travel = {"arrival":{…}} → serialized object (sets the leg)
        travel_payload = _clean_travel(t.get('travel'))

        # Audit fix (2026-05-26): COALESCE protection on JSON columns
        # that can be legitimately absent from a partial upsert payload.
        # Pre-fix a frontend that posted a trip edit without sending
        # `countries` or `checklist` (e.g. a single-field edit modal)
        # would NULL the column. COALESCE keeps the existing value
        # when the client passes NULL (= "don't touch") and overwrites
        # only when the client explicitly sends data. Same pattern
        # already applied to /api/sync's trip loop.
        cursor.execute(
            '''
            INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                               public_show_expenses,
                               place_id, lat, lng, viewport_json, place_types, country_code,
                               companions_json, marked_places_json,
                               documents_json, photos_json, checklist_json,
                               trip_countries_json, travel_json, cover_url, notes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
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
                -- Arrival/departure travel legs: COALESCE so a partial
                -- metadata payload that omits `travel` preserves the stored
                -- legs; an explicit object (incl. {} → cleared legs)
                -- overwrites. Same protect-on-absent pattern as
                -- trip_countries_json / notes above.
                travel_json=COALESCE(excluded.travel_json, travel_json),
                -- 4.8 audit TRIP-6: distinguish "coverUrl absent from the
                -- payload" (preserve the stored cover) from "coverUrl
                -- present and null" (the Edit-Trip "Remove cover" action —
                -- must actually clear it). A plain COALESCE would preserve
                -- in BOTH cases and silently break cover removal; the raw
                -- `excluded.cover_url` NULLs the cover on any partial
                -- payload that omits the key. The CASE keeps both: the
                -- trailing `?` is 1 when the key is absent (preserve), 0
                -- when present (write the provided value, including null).
                cover_url=CASE WHEN ? = 1 THEN cover_url ELSE excluded.cover_url END,
                -- Trip Hub notes: COALESCE so a partial metadata payload that
                -- omits `notes` preserves the stored value; an explicit
                -- string (incl. '') overwrites. Same protect-on-absent
                -- pattern as trip_countries_json / companions_json above.
                notes=COALESCE(excluded.notes, notes),
                updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
            -- R8-B4 atomic staleness gate. When client_updated_at
            -- is supplied AND non-null, the UPDATE only fires if
            -- the stored updated_at matches. Two parallel writes
            -- both submitting `WHERE updated_at = T0`: the first
            -- bumps the stamp to T1, the second's WHERE no longer
            -- matches → rowcount=0 → handled below as a 409.
            -- The NULL allowances cover (a) clients that don't
            -- send clientUpdatedAt (bulk /api/sync; legacy clients)
            -- and (b) legacy rows whose stored updated_at is NULL
            -- (pre-R3-R4 migration backfill edge case).
            WHERE ? IS NULL
               OR trips.updated_at IS NULL
               OR trips.updated_at = ?
        ''',
            (
                t['id'],
                owner_id,
                t['name'],
                t.get('country', ''),
                1 if t.get('isArchived') else 0,
                1 if t.get('isPublic') else 0,
                1 if t.get('publicShowExpenses') else 0,
                t.get('placeId'),
                t.get('lat'),
                t.get('lng'),
                json.dumps(t['viewport']) if t.get('viewport') else None,
                json.dumps(t['placeTypes']) if t.get('placeTypes') else None,
                t.get('countryCode'),
                json.dumps(_cleaned_companions(cursor, t.get('id'), t.get('companions')))
                if isinstance(t.get('companions'), list)
                else None,
                # R12-B4: upsert_trip NO LONGER writes the four heavy media
                # columns. They have a dedicated write path now
                # (POST /api/trips/<id>/media). Passing None means
                # COALESCE(NULL, existing) preserves them on UPDATE and they
                # start NULL (= []) on a fresh INSERT. This is the structural
                # guarantee that a trip-metadata edit (rename / cover / dates)
                # can never clobber photos/documents/markedPlaces/checklist —
                # the bug class that bit Phase 1B. Even a legacy/stale client
                # that still sends these keys in a /api/trips payload has them
                # silently ignored here.
                None,  # marked_places_json — see POST /api/trips/<id>/media
                None,  # documents_json
                None,  # photos_json
                None,  # checklist_json
                countries_payload,
                travel_payload,
                t.get('coverUrl'),
                # Trip Hub notes (metadata path). None when the key is absent →
                # the COALESCE in the SET clause preserves the stored value.
                t.get('notes'),
                # 4.8 audit TRIP-6: preserve-flag for the cover_url CASE
                # above — 1 = key absent (keep stored cover), 0 = key present
                # (write the provided value, incl. the Remove-cover null).
                1 if 'coverUrl' not in t else 0,
                client_updated_at,
                client_updated_at,
            ),
        )
        # R8-B4: existing row + UPDATE filtered out = stale edit.
        # INSERT path always returns rowcount=1; an UPDATE with the
        # WHERE filter passing also returns 1. Only the stale case
        # gives 0.
        if existing and cursor.rowcount == 0:
            cursor.execute("SELECT * FROM trips WHERE id = ?", (t["id"],))
            live = cursor.fetchone()
            return jsonify(
                {
                    "error": "Stale edit — another device updated this trip",
                    "current": dict(live) if live else None,
                }
            ), 409
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
            "UPDATE trip_members SET is_archived = ? WHERE trip_id = ? AND user_id = ?",
            (1 if t.get('isArchived') else 0, t['id'], owner_id),
        )
        # R3-Round 5: read back the fresh updated_at so the client
        # can stash it for the next edit's clientUpdatedAt.
        cursor.execute(
            "SELECT updated_at FROM trips WHERE id = ?",
            (t['id'],),
        )
        new_row = cursor.fetchone()
        new_updated_at = new_row['updated_at'] if new_row else None
        conn.commit()
    # R11-B5: bump the per-user trip-create counter AFTER the row
    # lands so a failed insert doesn't consume the day's quota.
    # Only counts ON CREATE; edits (existing row) are unbounded.
    if not existing:
        from helpers import user_daily_increment

        user_daily_increment("trip_create", user_id)
    return jsonify({"status": "ok", "updatedAt": new_updated_at})


def _cascade_delete_trip(cursor, trip_id, user_id):
    """DB-side cascade for deleting ONE owned trip. The caller must have
    already verified ownership, and is responsible for `conn.commit()`
    and file cleanup (pass the returned upload paths to
    `delete_upload_files`). Extracted so the single-trip DELETE and the
    bulk 'delete all my trips' reset share ONE vetted cascade and can't
    drift apart. Deliberately touches ONLY trip-scoped rows — never the
    users row, social graph, auth sessions, categories or profile."""
    # R3-Fix #12: snapshot every /static/uploads/... path the trip
    # and its children reference BEFORE we delete the rows. We can't
    # collect them after — the JSON columns are gone. The os.remove
    # loop runs outside the transaction so a disk hiccup can't roll
    # back the DB delete.
    upload_paths = collect_trip_upload_paths(cursor, trip_id)
    # Cascade in dependency order — child rows first, parent last,
    # so any FK that's missing ON DELETE CASCADE doesn't block.
    cursor.execute("DELETE FROM expenses WHERE trip_id = ?", (trip_id,))
    cursor.execute("DELETE FROM settlements WHERE trip_id = ?", (trip_id,))
    cursor.execute("DELETE FROM trip_days WHERE trip_id = ?", (trip_id,))
    cursor.execute("DELETE FROM budgets WHERE trip_id = ?", (trip_id,))
    cursor.execute("DELETE FROM trip_members WHERE trip_id = ?", (trip_id,))
    # Feed posts associated with this trip + the engagement rows keyed on
    # their event_ids. Also clean feed_likes / feed_comments /
    # feed_bookmarks rows keyed on the synthesized trip-event ids
    # (trip_created_<id>, trip_archived_<id>, trip_joined_<id>_<joiner>)
    # and on the share_<post_id> / repost_<post_id> event ids for every
    # feed_posts row we're about to delete — no FK on event_id, so these
    # would otherwise linger until the 90-day age sweep.
    cursor.execute("SELECT id FROM feed_posts WHERE trip_id = ?", (trip_id,))
    doomed_post_ids = [r["id"] for r in cursor.fetchall()]
    cursor.execute("DELETE FROM feed_posts WHERE trip_id = ?", (trip_id,))
    for table in ("feed_likes", "feed_comments", "feed_bookmarks"):
        cursor.execute(
            f"DELETE FROM {table} WHERE event_id = ? OR event_id = ? OR event_id LIKE ?",
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
    # trip_invite, etc.). related_id is polymorphic; constrain by type so
    # we don't wipe unrelated rows that coincidentally share the trip_id
    # string in their own related_id column.
    cursor.execute(
        "DELETE FROM notifications WHERE related_id = ? AND type IN "
        "('trip_invite', 'trip_invite_accepted', 'trip_invite_declined', "
        " 'trip_member_removed', 'trip_public', 'settled_up', "
        " 'settled_up_reverted')",
        (trip_id,),
    )
    # Engagement notifications (share_liked / commented / reposted) are
    # keyed by `post_id`, NOT related_id — sweep them by post_id.
    if doomed_post_ids:
        placeholders = ",".join(["?"] * len(doomed_post_ids))
        cursor.execute(
            f"DELETE FROM notifications WHERE post_id IN ({placeholders})",
            doomed_post_ids,
        )
    # Audit MK1 F4-B1: null out any profile_quotes that pin this trip as a
    # memory. The fresh schema declares memory_trip_id ... ON DELETE SET NULL,
    # but that only fires when PRAGMA foreign_keys=ON AND the FK actually
    # exists — DBs migrated by an ALTER TABLE that ADDED the column carry NO
    # FK (SQLite can't add one via ALTER), so a trip delete would leave a
    # dangling memory_trip_id there ("Trip" chip pointing at a dead id). Do it
    # explicitly so it's correct on every DB regardless of FK/pragma state.
    cursor.execute(
        "UPDATE profile_quotes SET memory_trip_id = NULL WHERE memory_trip_id = ?",
        (trip_id,),
    )
    # Delete the trip row, then re-evaluate achievements: once the trip
    # is gone the country / spend / day-count checks drop below threshold
    # and check_user_achievements' revoke path cleans up stale badges.
    cursor.execute("DELETE FROM trips WHERE id = ? AND user_id = ?", (trip_id, user_id))
    # Sync Phase 1: tombstone so a member's offline outbox can't resurrect
    # this trip as a childless zombie, and so the ?since= delta propagates
    # the deletion to every former member's other tabs.
    cursor.execute(
        "INSERT INTO trip_deletes (trip_id, deleted_at) "
        "VALUES (?, strftime('%Y-%m-%d %H:%M:%f', 'now')) "
        "ON CONFLICT(trip_id) DO UPDATE SET deleted_at = excluded.deleted_at",
        (trip_id,),
    )
    check_user_achievements(cursor, user_id)
    return upload_paths


@bp.route("/api/trips", methods=["DELETE"])
@limiter.limit("3 per hour")
@require_auth
@retry_on_lock()
def delete_all_trips():
    """Delete ALL of the caller's OWNED trips — the Settings "Delete all
    trips" reset. Loops the SAME vetted per-trip cascade as
    DELETE /api/trips/<id>, so trips, days, expenses, settlements,
    budgets, feed posts, notifications, achievements and upload files are
    all cleaned — but the user's ACCOUNT stays fully intact (users row,
    friends/follows/blocks, auth sessions, categories, profile, uploads
    outside owned trips). This is deliberately NOT the account-nuking
    DELETE /api/user-data: the pre-fix reset card mis-fired that endpoint
    and silently destroyed the whole account (audit MK1 P0 / F2)."""
    user_id = current_user_id()
    all_upload_paths = []
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM trips WHERE user_id = ?", (user_id,))
        owned_trip_ids = [row["id"] for row in cursor.fetchall()]
        for tid in owned_trip_ids:
            all_upload_paths.extend(_cascade_delete_trip(cursor, tid, user_id))
        conn.commit()
    # Outside the transaction so a missing file / FS hiccup can't roll
    # back the DB delete (mirrors delete_trip).
    delete_upload_files(all_upload_paths, user_id)
    return jsonify({"status": "trips_deleted", "count": len(owned_trip_ids)})


@bp.route("/api/trips/<trip_id>", methods=["DELETE"])
@limiter.limit("10 per minute")
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
    counts. The cascade now lives in `_cascade_delete_trip` (shared with
    the bulk delete-all-trips reset), inside a single transaction so a
    mid-delete failure rolls back cleanly. Audit: 2026-05-18."""
    bind_trip_context(trip_id)
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not is_trip_owner(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        upload_paths = _cascade_delete_trip(cursor, trip_id, user_id)
        conn.commit()
    # R3-Fix #12: clean disk files outside the transaction.
    delete_upload_files(upload_paths, user_id)
    return jsonify({"status": "deleted"})


@bp.route("/api/trips/<trip_id>/archive", methods=["POST"])
@limiter.limit("30 per minute")
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
                "UPDATE trips SET is_archived = 1, "
                "updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
                "WHERE id = ? AND user_id = ?",
                (trip_id, user_id),
            )
        conn.commit()
    # R5-B3: archive flips trip-based badges (archivist, longest,
    # repeat_country, etc.) so bust the throttle so the next /api/data
    # poll re-runs the engine.
    from achievements import force_recheck_achievements

    force_recheck_achievements(user_id)
    return jsonify({"status": "archived"})


@bp.route("/api/trips/<trip_id>/silence", methods=["POST"])
@limiter.limit("30 per minute")
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
    payload = json_body()
    hidden = bool(payload.get("hidden", True))
    with get_db() as conn:
        cursor = conn.cursor()
        # USER-BUG-2 (2026-05-28): differentiate trip-missing from caller-not-
        # owner. Pre-fix is_trip_owner returned False for BOTH cases, so the
        # frontend's 403 handler always said "Only the trip owner can silence
        # trip actions" — even when the user just created the trip and the
        # silence call beat the upsert race (the trip row didn't exist on the
        # server yet). Now: SELECT first, return 404 for missing, 403 only for
        # the real not-owner case. Frontend can toast "Trip is still saving,
        # try again in a moment" for the 404 race instead of misleading.
        cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        if row["user_id"] != user_id:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "UPDATE trips SET actions_hidden = ?, "
            "updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
            "WHERE id = ?",
            (1 if hidden else 0, trip_id),
        )
        conn.commit()
    return jsonify({"status": "ok", "hidden": hidden})


@bp.route("/api/trips/<trip_id>/unarchive", methods=["POST"])
@limiter.limit("30 per minute")
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
                "UPDATE trips SET is_archived = 0, "
                "updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
                "WHERE id = ? AND user_id = ?",
                (trip_id, user_id),
            )
        conn.commit()
    # R5-B3: un-archive may revoke trip-based badges (the rule reads
    # tm.is_archived = 1). Bust the throttle to let the engine
    # re-evaluate immediately.
    from achievements import force_recheck_achievements

    force_recheck_achievements(user_id)
    return jsonify({"status": "unarchived"})


@bp.route("/api/trips/<trip_id>/media", methods=["GET"])
@limiter.limit("20 per minute")
@require_auth
def get_trip_media(trip_id):
    """R11-B2-followup Phase 1A: per-trip heavy-JSON fetch.

    Returns the four large per-trip JSON columns — `photos`,
    `documents`, `markedPlaces`, `checklist` — for a single trip
    the caller has access to. Designed to be called once on trip
    open so /api/data can eventually stop shipping these columns
    on every 15-second poll (Phase 1B will do the strip + the
    frontend merge wiring; this phase ships the endpoint + tests
    backward-compatibly so /api/data still includes the fields
    while consumers migrate).

    Auth gate: any accepted member of the trip (planner / budgeteer
    / relaxer). Same posture as the public-trip JSON path — these
    payloads are visible to every member, not just the owner.

    Defensive JSON parsing: `_safe_json` returns the default ([])
    when the column is NULL or contains malformed JSON, so a
    corrupt row doesn't 500 the whole open-trip flow.

    R12-B5: 20/min rate limit (was 60). Trip-open is interactive,
    not polled — even a multi-tab user clicking through trips won't
    exceed ~a few/min. The endpoint reads ALL 4 heavy JSON columns
    per call, so a tighter cap blunts the egress-amplification a
    leaked token could drive against the writer thread.
    """
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Forbidden"}), 403
        # R12-B5: bind the observability context AFTER the auth gate so
        # a 403 probe doesn't tag the request (+ Sentry scope) with an
        # attacker-supplied trip_id. Authorized requests still get the
        # trip bound for the rest of the handler.
        bind_trip_context(trip_id)
        cursor.execute(
            "SELECT photos_json, documents_json, "
            "       marked_places_json, checklist_json, updated_at, "
            "       media_updated_at "
            "FROM trips WHERE id = ?",
            (trip_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404

        # Mirror `_safe_json` from serialize_trip_row (inlined here
        # because that helper is nested-scope-private to keep its
        # call-site cohesive). Each parse falls back to [] on a NULL
        # or malformed cell so a single corrupt row doesn't 500.
        def _safe_arr(raw):
            if not raw:
                return []
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError, ValueError):
                return []

        return jsonify(
            {
                "tripId": trip_id,
                "updatedAt": row["updated_at"],
                # 4.8 audit TRIP-4: the media-only version stamp the client
                # echoes back as `clientMediaUpdatedAt` on the next write so
                # concurrent multi-device media edits 409 instead of silently
                # last-write-wins.
                "mediaUpdatedAt": row["media_updated_at"],
                "photos": _safe_arr(row["photos_json"]),
                "documents": _safe_arr(row["documents_json"]),
                "markedPlaces": _safe_arr(row["marked_places_json"]),
                "checklist": _safe_arr(row["checklist_json"]),
            }
        )


# R12-B4: the heavy per-trip JSON columns now have their OWN write path,
# decoupled from /api/trips (upsert_trip). This is the structural fix for
# the Phase-1B data-loss class: a trip-metadata edit (rename, cover, dates)
# can no longer carry — and therefore can no longer clobber — photos /
# documents / markedPlaces / checklist, because upsert_trip stops writing
# those columns entirely (see below) and they only ever change through
# this endpoint. POST (not PATCH) so it rides the offline outbox, which
# only replays POST/DELETE. Body may carry any subset of the four keys;
# only the keys present are written (a missing key is left untouched).
_MEDIA_KEY_TO_COLUMN = {
    "photos": "photos_json",
    "documents": "documents_json",
    "markedPlaces": "marked_places_json",
    "checklist": "checklist_json",
}
# Per-field JSON size cap. A single trip's photo/doc list is a few KB of
# URLs + metadata in normal use; 512KB is ~50x headroom while blocking a
# client from stuffing megabytes into one column (the JSON1 CHECK keeps
# it valid, this keeps it bounded).
_MEDIA_FIELD_MAX_BYTES = 512 * 1024


@bp.route("/api/trips/<trip_id>/media", methods=["POST"])
@limiter.limit("60 per minute")
@require_auth
@retry_on_lock()
def update_trip_media(trip_id):
    """R12-B4: write the per-trip heavy JSON columns in isolation.

    Planner-only (matches the old upsert_trip gate these writes used to
    flow through — only planners edit trip-level media). Accepts a JSON
    body with any subset of {photos, documents, markedPlaces, checklist};
    each present key must be a list, is bounded to _MEDIA_FIELD_MAX_BYTES
    of serialized JSON, and overwrites ONLY its own column. Keys absent
    from the body are left untouched — so two concurrent media writes
    that touch different fields can't clobber each other.

    Does NOT bump trips.updated_at: media is no longer part of the
    metadata optimistic-concurrency token (that token guards name /
    cover / dates via upsert_trip). Decoupling avoids a photo-add
    spuriously 409-ing a slow rename in another tab.

    The frontend sends the FULL media object (all four current arrays)
    on every write so the offline outbox — which dedupes queued
    mutations by (method, url) — collapses repeated writes to the latest
    complete snapshot without dropping a sibling field on replay.
    """
    user_id = current_user_id()
    body = json_body()
    # Collect + validate the provided fields before opening the txn.
    updates: list[tuple[str, str]] = []  # (column, json_text)
    for key, column in _MEDIA_KEY_TO_COLUMN.items():
        if key not in body:
            continue
        value = body[key]
        if not isinstance(value, list):
            return jsonify({"error": f"{key} must be an array"}), 400
        # BUG-089: photos/documents carry user-supplied URLs (src / url).
        # Drop any item whose URL uses an unsafe scheme (javascript:,
        # data:text/html, …) so a crafted client can't persist a stored-XSS
        # / link-abuse payload into shared trip media that every member
        # renders. http(s), same-origin paths, and data:image/* are kept;
        # markedPlaces / checklist carry no URLs and pass through untouched.
        if key in ("photos", "documents"):
            url_field = "src" if key == "photos" else "url"
            value = [
                it
                for it in value
                if not isinstance(it, dict) or is_safe_media_url(it.get(url_field))
            ]
        payload = json.dumps(value)
        if len(payload.encode("utf-8")) > _MEDIA_FIELD_MAX_BYTES:
            return jsonify({"error": f"{key} payload too large"}), 413
        updates.append((column, payload))
    if not updates:
        # Nothing to write — treat as a no-op success so an empty/odd
        # client payload doesn't 400-spam the logs.
        return jsonify({"status": "ok", "updated": []})

    with get_db() as conn:
        cursor = conn.cursor()
        if trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Forbidden"}), 403
        if not can_edit_trip(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # MK4 audit MED-1: archive write gate, matching every sibling
        # per-trip write route (/api/expenses, /api/days, /api/budgets,
        # /api/settlements). Pre-fix trip-level media (photos / documents
        # / markedPlaces / checklist) was the ONLY member-facing write
        # that succeeded on an archived trip while the day-level media
        # write (days.py) 409'd — so the SAME modal silently saved
        # trip-wide items but rejected day-attached ones. Reject all
        # media writes on a trip the caller has archived so the contract
        # is consistent. GET /media on an archived trip is unaffected
        # (get_trip_media has no gate — the archived detail view must
        # still render). The /api/sync bulk path stays exempt as always
        # (it's the catch-up channel for archived state itself).
        if is_trip_archived_for(cursor, trip_id, user_id):
            return jsonify(
                {
                    "error": "Trip is archived — unarchive to edit",
                }
            ), 409
        bind_trip_context(trip_id)
        # 4.8 audit TRIP-4: optimistic-concurrency on the media path.
        # Media carries its OWN version stamp (media_updated_at), separate
        # from the metadata `updated_at` token (so a photo-add doesn't 409
        # a slow rename in another tab). When the client echoes the version
        # it last saw (`clientMediaUpdatedAt`) and it no longer matches,
        # another device wrote media since — return 409 + the live media so
        # the client union-merges the concurrent edits + retries, instead
        # of silently last-write-wins clobbering the peer's add. A
        # missing/NULL token (the offline outbox strips it on replay;
        # legacy clients) bypasses the gate = the prior force-write
        # behaviour, so offline replay is unchanged (no regression).
        client_media_updated_at = body.get("clientMediaUpdatedAt")
        set_clause = ", ".join(f"{col} = ?" for col, _ in updates)
        params = [payload for _, payload in updates]
        params.append(trip_id)
        params.append(client_media_updated_at)
        params.append(client_media_updated_at)
        cursor.execute(
            f"UPDATE trips SET {set_clause}, "
            f"media_updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
            f"WHERE id = ? "
            f"  AND (? IS NULL OR media_updated_at IS NULL "
            f"       OR media_updated_at = ?)",
            params,
        )
        if cursor.rowcount == 0:
            # Trip exists + caller can edit (both gated above), so a zero
            # rowcount means a STALE media version. Echo the live media +
            # version so the client merges the concurrent edits + retries.
            def _safe_arr(raw):
                if not raw:
                    return []
                try:
                    return json.loads(raw)
                except (json.JSONDecodeError, TypeError, ValueError):
                    return []

            cursor.execute(
                "SELECT photos_json, documents_json, marked_places_json, "
                "checklist_json, media_updated_at FROM trips WHERE id = ?",
                (trip_id,),
            )
            live = cursor.fetchone()
            conn.commit()
            return jsonify(
                {
                    "error": "Stale media — another device updated this trip's media",
                    "current": {
                        "photos": _safe_arr(live["photos_json"]) if live else [],
                        "documents": _safe_arr(live["documents_json"]) if live else [],
                        "markedPlaces": _safe_arr(live["marked_places_json"]) if live else [],
                        "checklist": _safe_arr(live["checklist_json"]) if live else [],
                    },
                    "mediaUpdatedAt": live["media_updated_at"] if live else None,
                }
            ), 409
        cursor.execute(
            "SELECT media_updated_at FROM trips WHERE id = ?",
            (trip_id,),
        )
        new_row = cursor.fetchone()
        new_media_updated_at = new_row["media_updated_at"] if new_row else None
        conn.commit()
    return jsonify(
        {
            "status": "ok",
            "updated": [k for k in body if k in _MEDIA_KEY_TO_COLUMN],
            "mediaUpdatedAt": new_media_updated_at,
        }
    )


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
    data = json_body()
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
        # DSGN-036: roster management (invite + kick) is owner-only. The UI
        # already hides the controls from non-owner planners; align the server
        # gate to match. Pre-fix, can_edit_trip admitted any accepted planner,
        # so a non-owner planner could invite or kick via the API despite the
        # UI telling them 'Roster is managed by the trip owner'.
        if not is_trip_owner(cursor, trip_id, inviter):
            return jsonify({"error": "Forbidden"}), 403

        # 2026-05-26 (audit PE2): block invites to nonexistent users.
        # Before this gate, a typo in `target_user_id` (or a malicious
        # client supplying a junk id) silently created an orphan
        # `trip_members` row + a notification row whose `related_id`
        # pointed at no real user. The notification could never be read
        # (no user to receive it), the trip_members row could never be
        # cleaned up via the normal "decline" flow, and both leaked
        # storage. Validate up front.
        # (Also covers the pre-fix FK-violation 500 from the cherry-picked
        # 51c6346 — same gate, same posture.)
        if not ensure_user_exists(cursor, target):
            return jsonify({"error": "Target user not found"}), 404
        # Audit fix (2026-05-26): block-gate. If the target has
        # blocked the inviter, the invite silently fails — 404 not
        # 403 to avoid broadcasting the block.
        from routes.blocks import is_blocked

        if is_blocked(cursor, target, inviter):
            return jsonify({"error": "Target user not found"}), 404

        # 2026-05-26 (audit PE1): block silent role changes on accepted
        # members. The ON CONFLICT clause used to write
        # `role = excluded.role` unconditionally — so an owner could
        # "re-invite" an already-accepted Relaxer as a Planner, and the
        # role flipped without sending a "you've been promoted"
        # notification. The accepted member wouldn't know their
        # permissions changed until they next opened the app and tried
        # an action that suddenly worked (or didn't). Now: if the
        # target is already an accepted member, only re-fire the invite
        # if the role matches what they already have (idempotent — fine
        # to re-send the invite notification without changing anything).
        # If the role differs, return 409 Conflict telling the caller
        # to use a dedicated change-role endpoint (which we will add
        # in Batch C — for now, the only path forward is remove the
        # member then re-invite with the new role).
        cursor.execute(
            "SELECT role, invitation_status FROM trip_members WHERE trip_id = ? AND user_id = ?",
            (trip_id, target),
        )
        existing = cursor.fetchone()
        if existing and existing["invitation_status"] == "accepted" and existing["role"] != role:
            return jsonify(
                {
                    "error": "Member already accepted with a different role",
                    "current_role": existing["role"],
                }
            ), 409

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
            # Only change role on pending re-invites (the member hasn't
            # accepted yet, so the owner can fix a typo in role). Once
            # accepted, the role is locked here — see the 409 gate
            # above; a separate change-role endpoint will handle that
            # case explicitly with a notification to the affected
            # member.
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
        insert_notification(
            cursor,
            user_id=target,
            kind='trip_invite',
            title='Trip invitation',
            related_id=trip_id,
            message=msg,
        )
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/trips/invite/respond", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
@retry_on_lock()
def respond_trip_invite():
    """Accept or decline a pending trip invite. On accept the member
    row flips to `accepted` and the trip starts appearing in /api/data;
    on decline the row is deleted entirely. Inviter gets a
    notification either way.

    Request body: { trip_id, accept }
    """
    data = json_body()
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
        # R3-Round 2 #18: re-verify the inviter still has authority on
        # the trip. Pre-fix the invite stayed valid even after the
        # inviter was kicked or self-left the trip — the invitee
        # accepted into a trip whose inviter had no role on it
        # anymore. Reject + cancel the stale invite so the invitee
        # gets a clean signal instead of a confusing "you're now
        # a member of a trip you don't recognise" state. Owner is
        # always considered authoritative even if their member row
        # is missing (legacy data).
        cursor.execute(
            "SELECT user_id FROM trips WHERE id = ?",
            (trip_id,),
        )
        trip_owner_row = cursor.fetchone()
        if not trip_owner_row:
            # Trip itself gone — cancel + 404.
            cursor.execute(
                "DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?",
                (trip_id, user_id),
            )
            conn.commit()
            return jsonify({"error": "Trip no longer exists"}), 404
        trip_owner_id = trip_owner_row["user_id"]
        inviter_still_authoritative = (
            inviter_id is None  # invited_by NULL = system / legacy — OK
            or inviter_id == trip_owner_id  # owner is always authoritative
            or can_edit_trip(cursor, trip_id, inviter_id)
        )
        if not inviter_still_authoritative:
            # Stale invite — cancel it; the inviter no longer has
            # the authority to bring this user onto the trip.
            cursor.execute(
                "DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?",
                (trip_id, user_id),
            )
            conn.commit()
            return jsonify(
                {
                    "error": "Invitation is no longer valid",
                }
            ), 410

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

        # Audit MK5 BUG-047: clear the invitee's OWN trip_invite notification now
        # that they've acted on it. Otherwise it stays unread forever (the 30-day
        # cleanup only removes is_read=1 rows), the bell badge sticks, and a
        # re-tap reopens a resolved invite → 404 'No pending invitation'. The
        # frontend deliberately skips markNotificationRead for trip_invite,
        # expecting the server to remove it on accept/decline.
        cursor.execute(
            "DELETE FROM notifications WHERE user_id = ? AND type = 'trip_invite' "
            "AND related_id = ?",
            (user_id, trip_id),
        )

        # R5-B2: skip if the inviter blocked the responder. A blocked
        # user accepting/declining shouldn't ping the blocker's bell.
        from routes.blocks import is_blocked

        if inviter_id and not is_blocked(cursor, inviter_id, user_id):
            insert_notification(
                cursor,
                user_id=inviter_id,
                kind=note_type,
                title='Trip invite update',
                related_id=trip_id,
                message=msg,
            )
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/trips/members/remove", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
@retry_on_lock()
def remove_trip_member():
    """Planner kicks a member from a trip. Hard remove — the kicked
    user's account stops seeing the trip on next /api/data poll.
    Owner can't be removed.

    Request body: { trip_id, target_user_id }
    """
    data = json_body()
    actor = current_user_id()
    trip_id = data.get("trip_id")
    target = data.get("target_user_id")
    if not trip_id or not target:
        return jsonify({"error": "Missing data"}), 400
    bind_trip_context(trip_id)

    with get_db() as conn:
        cursor = conn.cursor()
        # R2 audit fix: allow self-leave on any role. Pre-fix only
        # planners could call this route, leaving Relaxers /
        # Budgeteers no way to leave a trip they accepted — they
        # could only archive their personal copy. Now: if the actor
        # is removing THEMSELVES, skip the planner gate. The owner
        # check below still blocks self-leave for owners (they need
        # to delete the trip via /api/trips/<id> DELETE instead).
        is_self_leave = actor == target
        # DSGN-036: same gate as invite — only the owner can remove OTHER
        # members. Self-leave (is_self_leave) is still open to any role so
        # any invited member can leave the trip without owner intervention.
        if not is_self_leave and not is_trip_owner(cursor, trip_id, actor):
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
        # R3-Round 2 fix: also sweep engagement notifications keyed
        # by post_id for feed_posts on this trip. share_liked /
        # share_commented / share_reposted notifs reference the post,
        # not the trip — they survive the type-list above. Clicking
        # them post-kick routes to a trip the user can no longer
        # access (404 or "Forbidden").
        cursor.execute(
            "DELETE FROM notifications WHERE user_id = ? AND post_id IN ("
            "  SELECT id FROM feed_posts WHERE trip_id = ?"
            ")",
            (target, trip_id),
        )

        # Audit MK5 BUG-048: don't notify on SELF-leave. The leaver IS the actor,
        # so the unconditional insert told them "{their own name} removed you from
        # {trip}" and bumped their own unread badge for an action they took. Only
        # notify when a planner removed someone ELSE.
        if not is_self_leave:
            cursor.execute("SELECT name FROM users WHERE id = ?", (actor,))
            actor_row = cursor.fetchone()
            actor_name = actor_row["name"] if actor_row else "A planner"
            cursor.execute("SELECT name FROM trips WHERE id = ?", (trip_id,))
            trip_row = cursor.fetchone()
            trip_name = trip_row["name"] if trip_row else "a trip"
            msg = f"{actor_name} removed you from {trip_name}."
            insert_notification(
                cursor,
                user_id=target,
                kind='trip_member_removed',
                title='Removed from trip',
                related_id=trip_id,
                message=msg,
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
    payload = json_body()
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
            "UPDATE trips SET share_token = ?, share_show_cost = ?, share_show_plans = ?, "
            "updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
            "WHERE id = ?",
            (token, 1 if show_cost else 0, 1 if show_plans else 0, trip_id),
        )
        # MK6 P2: the owner now manages this link EXPLICITLY, so clear the
        # feed-share "we auto-minted the token" flag for this trip — otherwise a
        # later unshare of an earlier feed-share would null the owner's explicit
        # link. (Safe no-op when there are no feed_posts for the trip.)
        cursor.execute(
            "UPDATE feed_posts SET minted_share_token = 0 WHERE trip_id = ?",
            (trip_id,),
        )
        conn.commit()
    return jsonify(
        {
            "token": token,
            "url": f"/share/{token}",
            "showCost": show_cost,
            "showPlans": show_plans,
        }
    )


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
            "UPDATE trips SET share_token = NULL, share_show_cost = 0, share_show_plans = 0, "
            "updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
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


def _clone_marked_places_json(raw):
    """Strip trip-structure-relative fields (dayId / timeOfDay) from a copied
    marked_places_json. Audit MK5 P2: a clone's wishlist pins kept the SOURCE
    trip's day ids, which don't exist in the clone — so they were invisible
    under every per-day map filter. Drop them so imported pins start unassigned
    (the new owner re-slots them), mirroring the template path's
    _clean_marked_places. Returns the re-serialized JSON, or the input unchanged
    on empty / parse failure / non-list."""
    if not raw:
        return raw
    try:
        places = json.loads(raw)
    except (ValueError, TypeError):
        return raw
    if not isinstance(places, list):
        return raw
    out = []
    for p in places:
        if isinstance(p, dict):
            q = dict(p)
            q.pop("dayId", None)
            q.pop("timeOfDay", None)
            out.append(q)
    return json.dumps(out)


def _clone_trip_attempt(
    cursor, src, new_owner_id, new_trip_id, include_marked_places=True, include_notes=True
):
    """One INSERT attempt for the clone's trip row, factored so the
    caller can retry on the rare PK collision from `_generate_trip_id`.

    `include_marked_places` (Audit MK5 P1): full-access clones (a member
    duplicating a trip they can see) copy the wishlist; share-link clones pass
    False because the share page hides markedPlaces from the recipient.

    `include_notes` (A4-I4): the Trip Hub free-text `notes` field is member-only
    content (public/share read paths strip it — see public.py). A full-access
    clone of a trip the caller can already see keeps the notes (they'd expect
    their own planning text to carry over); a share-link clone passes False so a
    recipient never receives notes the share page hid from them."""
    new_name = f"{src['name'] or 'Trip'} (copy)"
    # Audit MK5 BUG-037/057: do NOT copy an UPLOADED cover verbatim. It lives in
    # the SOURCE owner's /static/uploads/<owner>/ namespace, so the clone's cover
    # 404s the moment the owner deletes/unshares the source — and the cloner
    # can't serve a file outside their own namespace anyway. A personal upload
    # belongs to the original owner (same rule as the photos/documents/checklist
    # this clone already drops), so NULL it → the clone falls back to its
    # country-default cover. A country-default / external cover URL is a stable
    # shared asset and is kept.
    # D3-I6: in practice the `else src_cover` branch is DEAD — the only way a
    # cover_url gets stored is via validate_upload_url (per-row path) /
    # _validated_cover_url (sync path), both of which reject every non-upload
    # URL, so a stored cover is ALWAYS a /static/uploads/ path and this ternary
    # always takes the `None` branch. The `else src_cover` is kept as defensive
    # belt-and-braces (a legacy/backfilled row or a future country-default cover
    # would be a stable shared asset worth keeping) — it is NOT evidence that
    # external cover URLs are live. Do not assume you can store one.
    src_cover = src['cover_url']
    clone_cover = (
        None
        if (isinstance(src_cover, str) and src_cover.startswith('/static/uploads/'))
        else src_cover
    )
    cursor.execute(
        '''
        INSERT INTO trips (
            id, user_id, name, country, country_code,
            is_archived, is_public,
            place_id, lat, lng, viewport_json, place_types,
            companions_json, marked_places_json,
            documents_json, photos_json, checklist_json,
            trip_countries_json, actions_hidden, cover_url, notes
        ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ''',
        (
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
            # markedPlaces — copied ONLY for a full-access clone (the caller is a
            # member who can already see the wishlist). A share-link clone passes
            # include_marked_places=False: the share page + public-trip read strip
            # markedPlaces from non-members, so copying it would leak a wishlist the
            # recipient was never shown (Audit MK5 P1). When it IS copied, strip the
            # source trip's day refs so the pins aren't invisible on the clone's
            # per-day filters (Audit MK5 P2).
            _clone_marked_places_json(src['marked_places_json']) if include_marked_places else None,
            # documents / photos / checklist — NEVER copied (personal
            # files / per-trip tasks belong to the original owner).
            None,
            None,
            None,
            # §4.3 multi-country: copy the discovered country array. The
            # clone visits the same places, so the country set is the
            # same — no reason to force re-discovery on the clone.
            src['trip_countries_json'],
            clone_cover,
            # Trip Hub notes — copied ONLY for a full-access clone (member
            # duplicating a trip they can see). A share-link clone passes
            # include_notes=False: notes are member-only and stripped from the
            # public/share read surfaces, so copying them would resurrect
            # planning text the recipient was never shown (A4-I4).
            src['notes'] if include_notes else None,
        ),
    )


def _clone_trip_record(
    cursor,
    source_trip_id,
    new_owner_id,
    include_plans=True,
    include_marked_places=True,
    include_notes=True,
):
    """Deep-copy a single trip + its trip_days into a new trip owned by
    `new_owner_id`. The caller is responsible for visibility (must verify
    source_trip_id is readable to the user BEFORE calling this — clones
    bypass the per-trip permission gate on the source by design, because the
    WHOLE POINT is to give the user their own copy).

    `include_plans` (Audit MK5 P1): when False, the cloned days copy ONLY
    name + day_number + pin — the day-by-day plan text (morning/afternoon/
    evening/tip) is NULLed. Share-link clones pass the source's
    share_show_plans here so a clone never exposes plan text the share page
    itself hid from the recipient. markedPlaces is never copied (see
    _clone_trip_attempt) for the same privacy reason.

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
        "       marked_places_json, trip_countries_json, cover_url, notes "
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
            _clone_trip_attempt(
                cursor,
                src,
                new_owner_id,
                candidate,
                include_marked_places=include_marked_places,
                include_notes=include_notes,
            )
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
    # 2026-05-26 (audit SY5): clone skips tombstoned days so a
    # soft-deleted day doesn't reincarnate in the destination trip.
    cursor.execute(
        "SELECT day_number, date, name, morning, afternoon, evening, "
        "       tip, plan_blocks_json, transport_json, lat, lng, "
        "       accommodation, accommodation_place_id, accommodation_address "
        "FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL",
        (source_trip_id,),
    )
    for d in cursor.fetchall():
        inserted = False
        for _attempt in range(5):
            candidate_day_id = _generate_trip_id()
            try:
                # 2026-05-26 (audit TR2): clone strips day dates. The
                # source trip's dates are anchored to whenever the
                # original journey happened ("Paris Mar 1-7" archived
                # from 2025). Copying them verbatim into a brand-new
                # clone left the path dated in the past and refused to
                # auto-update when the user changed the trip's dates
                # (the date-shift logic only runs when the trip already
                # has dates AND the user explicitly re-dates). NULLing
                # them on clone lets the frontend's date-assignment
                # logic populate fresh dates based on the new owner's
                # chosen start — which is the user expectation for a
                # cloned template.
                cursor.execute(
                    '''
                    INSERT INTO trip_days (
                        id, trip_id, day_number, date, name,
                        morning, afternoon, evening, tip,
                        plan_blocks_json, transport_json,
                        lat, lng,
                        accommodation, accommodation_place_id,
                        accommodation_address
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                    (
                        candidate_day_id,
                        new_trip_id,
                        d['day_number'],
                        None,
                        d['name'],
                        # Plan text is copied only when the source authorized the
                        # recipient to see it (share_show_plans). Otherwise NULL —
                        # a share-link clone must not resurrect day-by-day plans
                        # the share page hid (Audit MK5 P1).
                        d['morning'] if include_plans else None,
                        d['afternoon'] if include_plans else None,
                        d['evening'] if include_plans else None,
                        d['tip'] if include_plans else None,
                        # plan_blocks_json is the block-editor structure (place
                        # blocks + ordering) backing morning/afternoon/evening —
                        # same plan content, same share gate. Copy it verbatim so
                        # the clone keeps the block layout, but NULL it when plans
                        # are hidden so a share-link clone can't resurrect plan
                        # blocks the share page suppressed (A4-B1 / Audit MK5 P1).
                        d['plan_blocks_json'] if include_plans else None,
                        # Transportation P1: the per-day mode/note is plan-class
                        # content ("how to execute the day") — same share gate.
                        d['transport_json'] if include_plans else None,
                        d['lat'],
                        d['lng'],
                        # Accommodation (where you sleep this day) is member-only
                        # content — the share page + public-trip read strip it from
                        # non-members. Copy it only for a full-access member clone
                        # (include_marked_places), never for a share-link clone,
                        # matching the markedPlaces privacy gate (A4-B2).
                        d['accommodation'] if include_marked_places else None,
                        d['accommodation_place_id'] if include_marked_places else None,
                        d['accommodation_address'] if include_marked_places else None,
                    ),
                )
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
        "SELECT user_id, is_public FROM trips WHERE id = ?",
        (trip_id,),
    )
    row = cursor.fetchone()
    if not row:
        return False
    if row['is_public']:
        return True
    if row['user_id'] == user_id:
        return True
    # MK1 Wave H (T2-4): canonical predicate — see helpers.is_trip_member.
    return is_trip_member(cursor, trip_id, user_id)


@bp.route("/api/trips/clone/<source_id>", methods=["POST"])
@require_auth
@limiter.limit("30 per hour")
@retry_on_lock()
def clone_trip(source_id):
    """Clone a trip the caller can see (public OR a trip they're a
    member of). Returns `{ tripId }` for the new draft owned by the
    caller. Visibility gate matches /api/public-trip — anything else
    would let the caller exfiltrate private trips by id-guessing.

    2026-06: completion state no longer gates cloning — it mirrors the
    share-token clone path (both relaxed when completed trips became
    shareable). Cloning is gated on VISIBILITY (_caller_can_see_trip:
    public or a member), not on whether the owner has completed the trip,
    so the completed-trip dashboard's Clone button works again.
    """
    bind_trip_context(source_id)
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _caller_can_see_trip(cursor, source_id, user_id):
            # Mirror /api/public-trip's 404 (rather than 403) so
            # id-existence isn't leaked via differential codes.
            return jsonify({"error": "Not found"}), 404
        # 2026-06: completion state no longer gates cloning (matches the
        # share-token clone path + the sharing-model reversal). Cloning a
        # completed trip the caller can SEE — their own, a public one, or one
        # they're a member of — is allowed; _caller_can_see_trip above is the
        # access control, not completion state.
        new_trip_id = _clone_trip_record(cursor, source_id, user_id)
        if not new_trip_id:
            # _clone_trip_record can bail mid-clone (id-collision retries
            # exhausted) after INSERTing the trip row + some days. Roll back
            # explicitly so the `with get_db()` block doesn't commit a
            # half-cloned orphan on the way out (A4-B3).
            conn.rollback()
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

    2026-06: completion state no longer gates cloning. A completed trip can be
    public + deliberately shared (the sharing model gates on PRIVACY, not
    completion — see the fetch_share_payload read-path fix), so the old
    archived-410 refusal here broke the "I want this trip" CTA for exactly the
    completed trips the owner chose to share. The share token remains the
    access proof; visibility — not completion — is the gate.
    """
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, share_show_plans FROM trips WHERE share_token = ?",
            (token,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        # Audit MK5 P1: clone only what the share page exposed. When the owner
        # kept day plans private (share_show_plans=0), the cloned days carry no
        # plan text; markedPlaces are never copied (handled in _clone_trip_record).
        new_trip_id = _clone_trip_record(
            cursor,
            row['id'],
            user_id,
            include_plans=bool(row['share_show_plans']),
            include_marked_places=False,
            # Notes are member-only planning text stripped from the share page —
            # never hand them to a share-link recipient (A4-I4).
            include_notes=False,
        )
        if not new_trip_id:
            # Same half-clone hazard as clone_trip: _clone_trip_record may
            # have written the trip row + some days before exhausting its
            # id-collision retries. Roll back so we don't commit an orphan
            # (A4-B3).
            conn.rollback()
            return jsonify({"error": "Not found"}), 404
        conn.commit()
    return jsonify({"tripId": new_trip_id})
