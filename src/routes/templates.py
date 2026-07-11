"""Trip Templates — Creator accounts publish a reusable, code-addressable
snapshot of a trip; any user turns the code into their own new trip.

Design (see plan dreamy-watching-nebula.md):

- A template is a FROZEN SNAPSHOT of one of the creator's trips, taken at
  save time and stored pre-stripped in `trip_templates.snapshot_json`. The
  snapshot holds ONLY shareable content — name, place, day structure +
  plan text, marked places, checklist — gated by per-template include
  toggles. It NEVER contains expenses, settlements, budgets, companions,
  photos, or documents. That pre-strip is the privacy boundary: the public
  preview-by-code endpoint cannot leak what was never stored.

- Editing a template re-snapshots from a chosen trip but KEEPS the code, so
  shared codes keep working.

- Instantiation ("create from code") builds a brand-new trip OWNED by the
  caller, mirroring src/routes/trips.py::_clone_trip_record — it writes the
  media columns (marked_places_json / checklist_json) DIRECTLY in the fresh
  INSERT, which is the media-write-invariant-safe path (upsert_trip never
  touches them; this is a server-side INSERT, not an upsert).

Creator gate: the dev account (admin.ADMIN_EMAILS) is always a creator;
everyone else needs users.is_creator = 1 (granted via POST /api/admin/creator).
"""

import json
import secrets

from flask import Blueprint, current_app, jsonify, render_template, url_for

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import ensure_owner_member_row, is_trip_owner, json_body
from routes.admin import ADMIN_EMAILS

bp = Blueprint("templates", __name__)


# ── Code generation ──────────────────────────────────────────────────
# Short, human-typeable codes the creator reads out / texts to a friend.
# Crockford-ish alphabet: no 0/O/1/I/L (ambiguous when typed). 8 chars of
# 31-symbol alphabet ≈ 39.6 bits ≈ 8.5e11 space — paired with the public
# preview rate-limit, enumeration is infeasible. Stored WITHOUT separators;
# the UI may show a dash (XR4K-9PQ2) for readability.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_LEN = 8
# Snapshot size ceiling (mirrors the per-trip media 512KB cap) so a giant
# 60-day itinerary can't bloat a single row / public-preview response.
_SNAPSHOT_MAX_BYTES = 400_000


def _generate_code() -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(_CODE_LEN))


def _normalize_code(raw: str) -> str:
    """Uppercase + strip anything outside the alphabet (dashes, spaces,
    lowercase) so a user can paste 'xr4k-9pq2' or 'XR4K 9PQ2' and still
    match the stored 'XR4K9PQ2'."""
    if not raw:
        return ""
    up = str(raw).upper()
    return "".join(c for c in up if c in _CODE_ALPHABET)


def _new_id() -> str:
    """New trip / day id in the canonical 9-hex-char shape (matches
    src/routes/trips.py::_generate_trip_id and the frontend generateId)."""
    return secrets.token_hex(5)[:9]


def _loads(raw):
    """Parse a JSON column to a Python value, or None on empty/garbage."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


def _clean_marked_places(places):
    """Strip trip-structure-relative fields from marked ("to-do") places.

    A marked place (the app's "To-do list") may be pinned to a specific day
    (`dayId`) and time slot (`timeOfDay`) of the SOURCE trip. A trip created
    from a template has brand-new day ids and blanked dates, so those
    references are dangling — an imported to-do would point at a day that
    doesn't exist (and the home-map day filter would hide it under a specific
    day). Drop them so imported to-dos start UNASSIGNED; the new owner re-slots
    them onto their own days. Same spirit as blanking day dates on clone.

    Everything else (name, place identity, ratings, why/fact, icon/color) is
    shareable template content and kept verbatim. Non-dict junk is filtered
    out for safety. Applied both at snapshot build (so the stored snapshot +
    public preview are clean going forward) AND at instantiation (so templates
    snapshotted before this fix still import clean)."""
    out = []
    for p in places or []:
        if not isinstance(p, dict):
            continue
        q = dict(p)
        q.pop("dayId", None)
        q.pop("timeOfDay", None)
        # Normalize provenance to 'manual'. Creators build templates with the
        # AI planner, so their places carry source='ai'. If that survived into
        # the new owner's trip, the new owner's FIRST Accept Plan would run
        # dropAITaggedPlaces() and silently DELETE every imported to-do (it
        # drops source==='ai'). Imported places are the new owner's curated
        # starting set — same rationale as blanking dates / stripping dayId —
        # so they must read as 'manual' to survive. Applied at both snapshot
        # build and instantiation, so already-stored templates are healed on
        # import too.
        q["source"] = "manual"
        out.append(q)
    return out


# ── Creator gate ─────────────────────────────────────────────────────
def _is_creator(cursor, user_id) -> bool:
    """True if the user is the dev account (always a creator) or has the
    granted users.is_creator flag."""
    if not user_id:
        return False
    cursor.execute("SELECT email, is_creator FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row:
        return False
    if (row["email"] or "").strip().lower() in ADMIN_EMAILS:
        return True
    return bool(row["is_creator"])


# ── Snapshot builder (pre-stripped) ──────────────────────────────────
def _build_template_snapshot(cursor, trip_id, include_plans, include_places, include_checklist):
    """Read the live trip + its days/places/checklist and return the frozen
    snapshot dict. Stores ONLY shareable content per the toggles; never any
    expenses / settlements / budgets / companions / photos / documents.
    Returns None if the trip doesn't exist."""
    cursor.execute(
        "SELECT name, country, country_code, place_id, lat, lng, "
        "       viewport_json, place_types, trip_countries_json, "
        "       marked_places_json, checklist_json "
        "FROM trips WHERE id = ?",
        (trip_id,),
    )
    t = cursor.fetchone()
    if not t:
        return None

    snap = {
        "name": t["name"] or "Trip",
        "country": t["country"],
        "countryCode": t["country_code"],
        "placeId": t["place_id"],
        "lat": t["lat"],
        "lng": t["lng"],
        "viewport": _loads(t["viewport_json"]),
        "placeTypes": _loads(t["place_types"]),
        "countries": _loads(t["trip_countries_json"]),
        "days": [],
        "markedPlaces": [],
        "checklist": [],
    }

    if include_plans:
        cursor.execute(
            "SELECT day_number, name, morning, afternoon, evening, tip, lat, lng, "
            "       plan_blocks_json, transport_json "
            "FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL "
            "ORDER BY day_number",
            (trip_id,),
        )
        for d in cursor.fetchall():
            day_snap = {
                "dayNumber": d["day_number"],
                "name": d["name"],
                "plan": {
                    "morning": d["morning"],
                    "afternoon": d["afternoon"],
                    "evening": d["evening"],
                },
                "tip": d["tip"],
                "lat": d["lat"],
                "lng": d["lng"],
            }
            # Ordered block content ({slot: [text|place refs]}) supersedes the
            # flat plan text; a place block carries only a placeId reference (no
            # place data), which is shareable template content like the plan
            # text. Carry it so a block-editor template keeps its place blocks —
            # the flat columns above drop them (_flatten_block_text). Kept as the
            # snapshot-native parsed value; null/absent for pre-blocks days.
            blocks = _loads(d["plan_blocks_json"])
            if blocks:
                day_snap["planBlocks"] = blocks
            # Transportation P1: the day's mode/note recommendation is
            # shareable content (same class as the plan text).
            transport = _loads(d["transport_json"])
            if transport:
                day_snap["transport"] = transport
            snap["days"].append(day_snap)

    if include_places:
        places = _loads(t["marked_places_json"]) or []
        if isinstance(places, list):
            snap["markedPlaces"] = _clean_marked_places(places)

    if include_checklist:
        items = _loads(t["checklist_json"]) or []
        if isinstance(items, list):
            # Reset completion — the new owner starts fresh.
            snap["checklist"] = [
                {"id": _new_id(), "body": (it or {}).get("body", ""), "done": False}
                for it in items
                if isinstance(it, dict) and (it.get("body") or "").strip()
            ]

    return snap


def _snapshot_too_big(snap) -> bool:
    try:
        return len(json.dumps(snap).encode("utf-8")) > _SNAPSHOT_MAX_BYTES
    except (TypeError, ValueError):
        return True


# ── Instantiation (snapshot → new owned trip) ────────────────────────
def _instantiate_template(cursor, snap, includes, new_owner_id, start_date=None):
    """Build a brand-new trip owned by new_owner_id from a frozen snapshot.
    Mirrors _clone_trip_record: new ids everywhere, owner member row. Writes
    marked_places_json / checklist_json directly in the INSERT (media-write-
    invariant-safe — this is a server INSERT, not an upsert_trip).

    `start_date` (YYYY-MM-DD) auto-dates the numbered days: day N gets
    start_date + (N-1) days. A template carries a fixed day RANGE, so the
    caller only supplies the first day and the rest follow. Absent / invalid
    → blank dates (the legacy behaviour). Returns the new trip id, or None on
    repeated id collision."""
    import sqlite3
    from datetime import date as _date
    from datetime import timedelta as _timedelta

    include_places = includes.get("places", True)
    include_checklist = includes.get("checklist", True)

    # Parse the start date once; numbered days derive their date from it.
    base_date = None
    if start_date:
        try:
            base_date = _date.fromisoformat(str(start_date)[:10])
        except (TypeError, ValueError):
            base_date = None

    marked = _clean_marked_places(snap.get("markedPlaces")) if include_places else None
    checklist = snap.get("checklist") if include_checklist else None

    new_trip_id = None
    for _attempt in range(5):
        candidate = _new_id()
        try:
            cursor.execute(
                """
                INSERT INTO trips (
                    id, user_id, name, country, country_code,
                    is_archived, is_public,
                    place_id, lat, lng, viewport_json, place_types,
                    companions_json, marked_places_json,
                    documents_json, photos_json, checklist_json,
                    trip_countries_json, actions_hidden, cover_url
                ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                """,
                (
                    candidate,
                    new_owner_id,
                    snap.get("name") or "Trip",
                    snap.get("country"),
                    snap.get("countryCode"),
                    snap.get("placeId"),
                    snap.get("lat"),
                    snap.get("lng"),
                    json.dumps(snap["viewport"]) if snap.get("viewport") else None,
                    json.dumps(snap["placeTypes"]) if snap.get("placeTypes") else None,
                    # companions — never copied.
                    None,
                    json.dumps(marked) if marked else None,
                    # documents / photos — never copied.
                    None,
                    None,
                    json.dumps(checklist) if checklist else None,
                    json.dumps(snap["countries"]) if snap.get("countries") else None,
                    # cover — excluded (may be a personal upload); the new
                    # trip falls back to its country-based default cover.
                    None,
                ),
            )
            new_trip_id = candidate
            break
        except sqlite3.IntegrityError:
            continue
    if new_trip_id is None:
        return None

    ensure_owner_member_row(cursor, new_trip_id, new_owner_id)

    # Days — only present when the template included plans. Numbered days are
    # auto-dated from start_date (day N → start + N-1); the anchor (day 0) and
    # the no-start-date case stay blank.
    for d in snap.get("days") or []:
        if not isinstance(d, dict):
            continue
        plan = d.get("plan") or {}
        day_num = d.get("dayNumber")
        day_date = None
        if base_date is not None and isinstance(day_num, int) and day_num > 0:
            # A far-future start date (e.g. 9999-12-31) pushes later days past
            # date.max and raises OverflowError; the start-date input has no
            # max, so this is reachable. Fall back to a blank date for the
            # overflowing day rather than 500 — same posture as an invalid
            # start date blanking all dates.
            try:
                day_date = (base_date + _timedelta(days=day_num - 1)).isoformat()
            except (OverflowError, ValueError):
                day_date = None
        # Ordered block content ({slot: [text|place refs]}) written alongside the
        # flat text so a block-editor template keeps its place blocks (the flat
        # columns drop them). Serialized only when present; pre-blocks templates
        # leave the column NULL and the client renders from the flat plan text.
        blocks = d.get("planBlocks")
        blocks_json = json.dumps(blocks) if blocks else None
        # Transportation P1: carry the snapshot's per-day recommendation into
        # the created trip (shareable content, like the plan text). Re-validate
        # through the same cleaner the write path uses — snapshots normally
        # hold already-validated values, but a source trip built from a
        # hand-edited ZIP import (which inserts by column-intersection,
        # unvalidated by sanctioned posture) could otherwise freeze junk into
        # a public template and propagate it into other users' trips.
        from services.day_writes import _clean_transport

        transport = _clean_transport(d.get("transport"))
        transport_json = json.dumps(transport) if transport else None
        for _attempt in range(5):
            day_id = _new_id()
            try:
                cursor.execute(
                    """
                    INSERT INTO trip_days (
                        id, trip_id, day_number, date, name,
                        morning, afternoon, evening, tip, lat, lng,
                        plan_blocks_json, transport_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        day_id,
                        new_trip_id,
                        day_num,
                        day_date,
                        d.get("name"),
                        plan.get("morning"),
                        plan.get("afternoon"),
                        plan.get("evening"),
                        d.get("tip"),
                        d.get("lat"),
                        d.get("lng"),
                        blocks_json,
                        transport_json,
                    ),
                )
                break
            except sqlite3.IntegrityError:
                continue

    return new_trip_id


def _template_summary(row) -> dict:
    """Metadata-only view of a template row for the creator's list (no
    snapshot blob)."""
    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "sourceTripId": row["source_trip_id"],
        "includePlans": bool(row["include_plans"]),
        "includePlaces": bool(row["include_places"]),
        "includeChecklist": bool(row["include_checklist"]),
        "isPublic": bool(row["is_public"]),
        "useCount": row["use_count"] or 0,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


# ── Creator CRUD ─────────────────────────────────────────────────────
@bp.route("/api/templates", methods=["GET"])
@require_auth
@limiter.limit("60/minute")
def list_templates():
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _is_creator(cursor, user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "SELECT id, code, name, source_trip_id, include_plans, "
            "       include_places, include_checklist, is_public, use_count, "
            "       created_at, updated_at "
            "FROM trip_templates WHERE owner_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        rows = cursor.fetchall()
    return jsonify({"templates": [_template_summary(r) for r in rows]})


@bp.route("/api/templates/public", methods=["GET"])
@require_auth
@limiter.limit("60/minute")
def list_public_templates():
    """The Discover feed: every creator's template, browsable by any
    signed-in user. Creators are a gated set and a template is a
    deliberately-shareable artifact, so there is no per-template public
    flag — all of them are listed. Returns ONLY safe, card-level metadata
    (name, destination, day count, creator identity, popularity) — never
    the snapshot internals. The destination fields come from the snapshot
    (which stores the source trip's country/countryCode) and drive the
    page's continent grouping + card flag."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT t.id, t.code, t.name, t.use_count, t.created_at, "
            "       t.snapshot_json, "
            "       u.id AS creator_id, u.name AS creator_name, "
            "       u.picture AS creator_picture "
            "FROM trip_templates t "
            "JOIN users u ON u.id = t.owner_id "
            "WHERE t.is_public = 1 "
            "ORDER BY t.created_at DESC"
        )
        rows = cursor.fetchall()
    out = []
    for r in rows:
        snap = _loads(r["snapshot_json"]) or {}
        days = snap.get("days") if isinstance(snap, dict) else None
        out.append(
            {
                "id": r["id"],
                "code": r["code"],
                "name": r["name"],
                "useCount": r["use_count"] or 0,
                "createdAt": r["created_at"],
                "country": snap.get("country") if isinstance(snap, dict) else None,
                "countryCode": snap.get("countryCode") if isinstance(snap, dict) else None,
                "dayCount": len(days) if isinstance(days, list) else 0,
                "creator": {
                    "id": r["creator_id"],
                    "name": r["creator_name"] or "",
                    "picture": r["creator_picture"],
                },
            }
        )
    return jsonify({"templates": out})


@bp.route("/api/templates", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def create_template():
    user_id = current_user_id()
    body = json_body()
    name = (body.get("name") or "").strip()
    source_trip_id = (body.get("sourceTripId") or "").strip()
    include_plans = 1 if body.get("includePlans", True) else 0
    include_places = 1 if body.get("includePlaces", True) else 0
    include_checklist = 1 if body.get("includeChecklist", True) else 0
    is_public = 1 if body.get("isPublic", True) else 0

    if not name:
        return jsonify({"error": "Name required"}), 400
    if not source_trip_id:
        return jsonify({"error": "Source trip required"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        if not _is_creator(cursor, user_id):
            return jsonify({"error": "Forbidden"}), 403
        if not is_trip_owner(cursor, source_trip_id, user_id):
            # 404 (not 403) so a non-owner can't probe trip existence.
            return jsonify({"error": "Not found"}), 404

        snap = _build_template_snapshot(
            cursor, source_trip_id, include_plans, include_places, include_checklist
        )
        if snap is None:
            return jsonify({"error": "Not found"}), 404
        if _snapshot_too_big(snap):
            return jsonify({"error": "Template too large"}), 413

        snapshot_json = json.dumps(snap)
        tmpl_id = _new_id()
        # Generate a unique code with collision retry.
        new_code = None
        for _attempt in range(6):
            candidate = _generate_code()
            cursor.execute("SELECT 1 FROM trip_templates WHERE code = ?", (candidate,))
            if cursor.fetchone() is None:
                new_code = candidate
                break
        if new_code is None:
            return jsonify({"error": "Could not allocate code"}), 500

        cursor.execute(
            "INSERT INTO trip_templates "
            "(id, code, owner_id, name, source_trip_id, include_plans, "
            " include_places, include_checklist, is_public, snapshot_json, use_count) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
            (
                tmpl_id,
                new_code,
                user_id,
                name,
                source_trip_id,
                include_plans,
                include_places,
                include_checklist,
                is_public,
                snapshot_json,
            ),
        )
        conn.commit()
        cursor.execute(
            "SELECT id, code, name, source_trip_id, include_plans, "
            "include_places, include_checklist, is_public, use_count, created_at, updated_at "
            "FROM trip_templates WHERE id = ?",
            (tmpl_id,),
        )
        created = cursor.fetchone()
    return jsonify({"template": _template_summary(created)})


@bp.route("/api/templates/<template_id>", methods=["PUT"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def update_template(template_id):
    """Rename and/or re-point to a new source trip + re-toggle → re-snapshot,
    keeping the same code."""
    user_id = current_user_id()
    body = json_body()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _is_creator(cursor, user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute(
            "SELECT id, owner_id, source_trip_id, include_plans, "
            "include_places, include_checklist, is_public, name "
            "FROM trip_templates WHERE id = ?",
            (template_id,),
        )
        existing = cursor.fetchone()
        if not existing or existing["owner_id"] != user_id:
            return jsonify({"error": "Not found"}), 404

        name = (body.get("name") or existing["name"] or "").strip() or existing["name"]
        source_trip_id = (body.get("sourceTripId") or existing["source_trip_id"] or "").strip()
        include_plans = 1 if body.get("includePlans", bool(existing["include_plans"])) else 0
        include_places = 1 if body.get("includePlaces", bool(existing["include_places"])) else 0
        include_checklist = (
            1 if body.get("includeChecklist", bool(existing["include_checklist"])) else 0
        )
        is_public = 1 if body.get("isPublic", bool(existing["is_public"])) else 0

        if not source_trip_id:
            return jsonify({"error": "Source trip required"}), 400
        if not is_trip_owner(cursor, source_trip_id, user_id):
            return jsonify({"error": "Not found"}), 404

        snap = _build_template_snapshot(
            cursor, source_trip_id, include_plans, include_places, include_checklist
        )
        if snap is None:
            return jsonify({"error": "Not found"}), 404
        if _snapshot_too_big(snap):
            return jsonify({"error": "Template too large"}), 413

        cursor.execute(
            "UPDATE trip_templates SET name = ?, source_trip_id = ?, "
            "include_plans = ?, include_places = ?, include_checklist = ?, "
            "is_public = ?, "
            "snapshot_json = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
            "WHERE id = ? AND owner_id = ?",
            (
                name,
                source_trip_id,
                include_plans,
                include_places,
                include_checklist,
                is_public,
                json.dumps(snap),
                template_id,
                user_id,
            ),
        )
        conn.commit()
        cursor.execute(
            "SELECT id, code, name, source_trip_id, include_plans, "
            "include_places, include_checklist, is_public, use_count, created_at, updated_at "
            "FROM trip_templates WHERE id = ?",
            (template_id,),
        )
        updated = cursor.fetchone()
    return jsonify({"template": _template_summary(updated)})


@bp.route("/api/templates/<template_id>", methods=["DELETE"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def delete_template(template_id):
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        # Audit MK5 BUG-055: deleting your OWN template requires OWNERSHIP, not
        # the (separately revocable) can-CREATE privilege. The old _is_creator
        # gate here locked a revoked creator out of managing their still-live
        # templates forever (and there's no admin UI to remove them either). The
        # ownership-scoped DELETE below (owner_id = user_id) + 404-on-rowcount-0
        # is the correct authorization. Create/update keep the creator gate.
        cursor.execute(
            "DELETE FROM trip_templates WHERE id = ? AND owner_id = ?",
            (template_id, user_id),
        )
        if cursor.rowcount == 0:
            return jsonify({"error": "Not found"}), 404
        conn.commit()
    return jsonify({"status": "deleted"})


# ── Public preview (no auth) ─────────────────────────────────────────
def fetch_template_preview(code):
    """Build the public, read-only preview payload for a template code, or
    None for a bad/dead code. Contains ONLY pre-stripped snapshot content
    (no sensitive data by construction). Shared by the JSON API endpoint
    and the server-rendered /t/<code> HTML page in main.py."""
    norm = _normalize_code(code)
    if not norm:
        return None
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name, snapshot_json, include_plans, include_places, "
            "include_checklist, use_count "
            "FROM trip_templates WHERE code = ?",
            (norm,),
        )
        row = cursor.fetchone()
    if not row:
        return None
    snap = _loads(row["snapshot_json"]) or {}
    days = snap.get("days") or []
    places = snap.get("markedPlaces") or []
    checklist = snap.get("checklist") or []
    return {
        "code": norm,
        "name": row["name"],
        "country": snap.get("country"),
        "countryCode": snap.get("countryCode"),
        "dayCount": len(days),
        "placeCount": len(places),
        "checklistCount": len(checklist),
        "useCount": row["use_count"] or 0,
        # Light read-only itinerary preview (safe — plan text is the
        # creator's deliberately-published template content).
        "days": [
            {"dayNumber": d.get("dayNumber"), "name": d.get("name"), "plan": d.get("plan")}
            for d in days
            if isinstance(d, dict)
        ],
        "places": [
            {"name": (p or {}).get("name"), "icon": (p or {}).get("icon")}
            for p in places
            if isinstance(p, dict)
        ],
    }


@bp.route("/api/templates/preview/<code>", methods=["GET"])
@limiter.limit("60 per minute")
def preview_template(code):
    """Public, read-only preview of a template by code. 404 on bad/dead
    code — no existence leak."""
    preview = fetch_template_preview(code)
    if not preview:
        return jsonify({"error": "Not found"}), 404
    return jsonify(preview)


# ── Instantiate (auth) ───────────────────────────────────────────────
@bp.route("/api/templates/<code>/create", methods=["POST"])
@require_auth
@limiter.limit("30 per hour")
@retry_on_lock()
def create_from_template(code):
    """Build a new trip owned by the caller from a template code. Returns
    { tripId }. Anyone signed in with a valid code can do this — the code
    is the access grant (same model as /api/share/<token>/clone)."""
    user_id = current_user_id()
    norm = _normalize_code(code)
    if not norm:
        return jsonify({"error": "Not found"}), 404
    # Optional start date — the frontend prompts for it (templates carry a
    # fixed day range, so the first day is all that's needed). Validated +
    # applied in _instantiate_template; an absent/bad value just blanks dates.
    start_date = (json_body() or {}).get("startDate")
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, snapshot_json, include_places, include_checklist "
            "FROM trip_templates WHERE code = ?",
            (norm,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        snap = _loads(row["snapshot_json"])
        if not snap:
            return jsonify({"error": "Not found"}), 404
        includes = {
            "places": bool(row["include_places"]),
            "checklist": bool(row["include_checklist"]),
        }
        new_trip_id = _instantiate_template(cursor, snap, includes, user_id, start_date)
        if not new_trip_id:
            return jsonify({"error": "Could not create trip"}), 500
        cursor.execute(
            "UPDATE trip_templates SET use_count = use_count + 1 WHERE id = ?",
            (row["id"],),
        )
        conn.commit()
    return jsonify({"tripId": new_trip_id})


# ── MK1 Wave G (T2-1): the public /t/<code> template preview moved here
# from main.py, next to fetch_template_preview. Verbatim.
@bp.route("/t/<code>")
@limiter.limit("60/minute")
def template_preview_page(code):
    """Public, server-rendered preview of a Trip Template by code, with a
    "Use this template" CTA that deep-links into the SPA
    (/?fromTemplate=<code>). The SPA's template-intent.ts captures the code
    and instantiates it into a new owned trip after sign-in. Read-only; the
    preview payload is pre-stripped of all sensitive data by construction, so
    nothing private can leak here."""
    preview = fetch_template_preview(code)
    canonical = url_for(".template_preview_page", code=code, _external=True)
    og_image = url_for("static", filename="favicon.svg", _external=True)
    status = 200 if preview else 404
    response = current_app.make_response(
        (
            render_template(
                "template.html",
                preview=preview,
                canonical_url=canonical,
                og_image_url=og_image,
            ),
            status,
        )
    )
    # Same privacy posture as the share page — don't let intermediaries
    # cache a per-code response.
    response.headers["Cache-Control"] = "private, no-store"
    return response
