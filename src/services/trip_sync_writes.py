"""Sync-path trip upsert — ONE implementation for /api/sync's twin loops.

MK1 Wave B (T1-1) scope decision: trips had THREE write sites — the
per-row POST /api/trips plus /api/sync's active and archived loops. The
two SYNC loops are near-identical twins (they differ only in how the
is_archived flag is computed and mirrored), so they unify cleanly here
with a single `archived: bool` parameter. The PER-ROW path is left as
the one strict implementation in routes/trips.py — folding it in too
would have needed ~9 policy axes (TRIP-6 cover CASE vs COALESCE, notes,
R8-B4 concurrency, R11-B5 daily cap, strict vs loose countries
normalization, owner-id semantics…), i.e. a config-driven interpreter
harder to audit than two explicit sites.

SUNSET PLAN (ARCH-2, `Best-in-class audit MK1.md`): the first-party
client has sent ONLY `categories` to /api/sync since R8-B4 — these trip
loops serve legacy bundles. Once Wave C's cache-busting guarantees
clients update (and the PA deprecation logs show a quiet period), flip
the sync trips/archived_trips keys to accepted-but-ignored like budgets
(data.py) and DELETE this module.

The archived loop historically omitted the checklist_json column while
the active loop bound it None — under COALESCE both preserve the stored
value, so the unified INSERT binds None for both (4.8 audit TRIP-3: the
media columns are write-isolated to POST /api/trips/<id>/media; passing
None makes that isolation structural here — media_write_invariant).
"""

import json
import secrets

from helpers import ensure_owner_member_row
from validators import (
    ValidationError,
    validate_upload_url,
)
from validators import (
    clean_companions as _clean_companions_raw,
)


def _validated_cover_url(value, user_id):
    """Gate a synced coverUrl to the caller's own upload (or empty) before
    it lands in trips.cover_url. Returns None on a bad/foreign/external URL
    so — paired with COALESCE(excluded.cover_url, cover_url) — the stored
    cover is preserved rather than overwritten by an attacker-supplied
    tracking URL. (MK6 P3/security)"""
    try:
        return validate_upload_url(
            value,
            user_id=user_id,
            field_name="coverUrl",
            allow_empty=True,
        )
    except ValidationError:
        return None


def _cleaned_companions_for_sync(cursor, trip_id, raw):
    """Same shape as routes/trips.py::_cleaned_companions — linked-user
    claims are only kept when the linked user really is a member."""
    if not isinstance(raw, list):
        return []
    verified: set[str] = set()
    if trip_id:
        cursor.execute(
            "SELECT user_id FROM trip_members WHERE trip_id = ?",
            (trip_id,),
        )
        verified = {r["user_id"] for r in cursor.fetchall() if r["user_id"]}
    return _clean_companions_raw(raw, verified_linked_ids=verified)


def apply_sync_trip_upsert(
    cursor,
    user_id: str,
    t: dict,
    *,
    archived: bool,
    editable_trip_ids: set,
    expense_writable_trip_ids: set,
) -> bool:
    """Upsert one trip row from a sync payload. Returns False on a
    silent skip (bulk contract), True when the row landed.

    Caller keeps the malformed-row (BUG-096 parity) and hard-delete
    tombstone (MK6 P2) skips — they're batch-level concerns.
    """
    cursor.execute(
        "SELECT user_id, is_public, public_show_expenses, is_archived FROM trips WHERE id = ?",
        (t["id"],),
    )
    existing = cursor.fetchone()
    # R5-B4: set lookup instead of can_edit_trip's 2-query call. Trip
    # exists and the caller isn't a planner → skip silently rather than
    # 403 the whole batch (§1.10: the editor SET, not raw ownership, so
    # invited planners' legitimate edits aren't dropped).
    if existing and t["id"] not in editable_trip_ids:
        return False
    # BUG-35 (MK2 audit): publicness is owner-only. A non-owner planner
    # may sync name/itinerary but must not flip is_public /
    # public_show_expenses — pin both to the stored values.
    if existing and existing["user_id"] != user_id:
        t["isPublic"] = bool(existing["is_public"])
        t["publicShowExpenses"] = bool(existing["public_show_expenses"])

    # §4.3 trip_countries_json — the client sends `countries` (home-map
    # reverse-geocode array) or legacy `tripCountries`. None (absent)
    # pairs with COALESCE below to preserve; the bulk path used to omit
    # the column and wiped the list every 15s (fix 2026-05-18).
    countries_raw = t.get("countries")
    if not isinstance(countries_raw, list):
        countries_raw = t.get("tripCountries")
    countries_json = (
        json.dumps([c for c in countries_raw if isinstance(c, str)])
        if isinstance(countries_raw, list)
        else None
    )

    # BUG-098: trips.is_archived is the share/clone gate's source of
    # truth and OWNER-ONLY. Active loop: the payload is the authority
    # for the owner. Archived loop: membership in archived_trips itself
    # means 1 for the owner. Non-owners never move the shared column;
    # their own archive view flows to their trip_members row below.
    owner_row = existing is None or existing["user_id"] == user_id
    if owner_row:
        is_archived = 1 if (archived or t.get("is_archived")) else 0
    else:
        is_archived = 1 if existing["is_archived"] else 0

    cursor.execute(
        '''
        INSERT INTO trips (id, user_id, name, country, is_archived, is_public,
                           public_show_expenses,
                           place_id, lat, lng, viewport_json, place_types, country_code,
                           trip_countries_json,
                           companions_json, marked_places_json,
                           documents_json, photos_json, checklist_json, cover_url)
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
            viewport_json=excluded.viewport_json,
            place_types=excluded.place_types,
            country_code=excluded.country_code,
            -- 2026-05-18 audit H3: COALESCE so a payload that omits the
            -- field (older clients, partial syncs) preserves the stored
            -- value — raw excluded.x would NULL-overwrite every poll.
            trip_countries_json=COALESCE(excluded.trip_countries_json, trip_countries_json),
            -- R2 audit fix (+ R3-Fix #11 backport to the archived twin):
            -- COALESCE protection on every JSON media field. The
            -- reproducible pre-fix failure was companions/photos
            -- wipe-on-partial-sync — 50 photos lost on a 15s poll.
            companions_json=COALESCE(excluded.companions_json, companions_json),
            marked_places_json=COALESCE(excluded.marked_places_json, marked_places_json),
            documents_json=COALESCE(excluded.documents_json, documents_json),
            photos_json=COALESCE(excluded.photos_json, photos_json),
            checklist_json=COALESCE(excluded.checklist_json, checklist_json),
            -- MK6 P3: COALESCE — cover REMOVAL flows only via the
            -- per-row TRIP-6 path, never bulk sync.
            cover_url=COALESCE(excluded.cover_url, cover_url),
            -- R4-B1: bump updated_at so the R3-R5 stale-edit gate in
            -- /api/trips can detect that a sync poll moved the row.
            updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
    ''',
        (
            t["id"],
            user_id,
            t["name"],
            t.get("country"),
            is_archived,
            1 if t.get("isPublic") else 0,
            1 if t.get("publicShowExpenses") else 0,
            t.get("placeId"),
            t.get("lat"),
            t.get("lng"),
            json.dumps(t["viewport"]) if t.get("viewport") else None,
            json.dumps(t["placeTypes"]) if t.get("placeTypes") else None,
            t.get("countryCode"),
            countries_json,
            json.dumps(_cleaned_companions_for_sync(cursor, t.get("id"), t.get("companions")))
            if isinstance(t.get("companions"), list)
            else None,
            # 4.8 audit TRIP-3 / media_write_invariant: the four heavy
            # media columns are write-isolated to POST /api/trips/<id>/
            # media. None + COALESCE preserves on UPDATE, NULL on INSERT
            # — structural isolation even if a legacy client ships keys.
            None,  # marked_places_json
            None,  # documents_json
            None,  # photos_json
            None,  # checklist_json
            # MK6 P3/security: caller's own upload or preserved.
            _validated_cover_url(t.get("coverUrl"), user_id),
        ),
    )
    ensure_owner_member_row(cursor, t["id"], user_id)
    # A public trip needs a share_token to be viewable AND to surface in
    # Explore (/api/feed/explore requires share_token IS NOT NULL). The
    # privacy toggles set is_public via sync but never minted one — mint
    # lazily, owner-only, idempotent (the NULL guard preserves any
    # existing feed-share token). Applies to both loops (the completed-
    # trip dashboard's selector runs through the archived path).
    if owner_row and t.get("isPublic"):
        cursor.execute(
            "UPDATE trips SET share_token = ? WHERE id = ? AND share_token IS NULL",
            (secrets.token_urlsafe(16), t["id"]),
        )
    # R5-B4: ACL-set top-up so a brand-new trip + its expenses in ONE
    # payload gates correctly in the expense loops later in the batch.
    editable_trip_ids.add(t["id"])
    expense_writable_trip_ids.add(t["id"])
    # 2026-05-18 audit H1: mirror the caller's own archive view onto
    # THEIR trip_members row (the post-deprecation source of truth).
    # Active loop: the payload is the authority; archived loop:
    # membership in archived_trips means 1, unconditionally.
    member_archived = 1 if (archived or t.get("is_archived")) else 0
    cursor.execute(
        "UPDATE trip_members SET is_archived = ? WHERE trip_id = ? AND user_id = ?",
        (member_archived, t["id"], user_id),
    )
    return True
