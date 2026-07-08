"""Trip portability — full-trip ZIP export / import.

The home-page Download button offers a PDF (human-readable, unchanged) OR a
ZIP that captures **everything** about a trip so the exact same trip can be
recreated later — on another account, another server, or as a backup. The
New-Trip flow can consume that ZIP to rebuild the trip.

Design goals (in priority order):

  1. Round-trip fidelity — export → import reproduces the same trip:
     itinerary, expenses, budgets, settlements, categories, and all media
     (photos / documents / marked places / checklist + receipt images).

  2. FUTURE-PROOF with near-zero maintenance. The format is
     *schema-introspection-driven*:
       - export does `SELECT *` on each trip-scoped table, so a column added
         by a future feature is captured automatically;
       - import inserts the INTERSECTION of the exported keys with the
         table's CURRENT columns, so a column dropped since the export is
         skipped and a column added since the export is simply left at its
         default.
     Adding a new trip-scoped table is a one-line addition to `_SECTIONS`.
     Media is discovered by a generic `/static/uploads/...` URL scan across
     every string field, so a new media-bearing JSON column needs no plumbing
     change here either.

  3. Respect the trip-media write invariant (see memory
     `media_write_invariant.md`). The four heavy JSON columns
     (photos/documents/marked_places/checklist) have a dedicated write path
     (`POST /api/trips/<id>/media`) precisely so the metadata write paths
     (`/api/data`, `upsert_trip`, `/api/sync`) can never clobber them. This
     module does NOT touch any of those paths. Import writes those columns
     directly, but only as part of a single atomic INSERT of a BRAND-NEW trip
     (no existing media to clobber, no concurrent poll) — the same shape a
     restore-from-backup would take. `get_trip_media` reads exactly these
     columns back, so the imported media surfaces normally on trip-open.

The manifest is versioned (`formatVersion`); import refuses anything newer
than it understands and tolerates older versions via the column-intersection
insert.
"""

import io
import json
import os
import re
import sqlite3
import uuid
import zipfile
from datetime import UTC, datetime

from flask import Blueprint, current_app, jsonify, request, send_file

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import ensure_owner_member_row, trip_member_role

bp = Blueprint("trip_io", __name__)

# Bump when the on-disk format changes in a way an OLDER importer couldn't
# read. The column-intersection insert means most additive changes (new
# column, new table) do NOT require a bump — only structural changes to the
# manifest envelope itself do.
FORMAT_ID = "gg.trip"
FORMAT_VERSION = 1

# Trip-scoped tables, in dependency order (trip row first — everything else
# FKs to it). `live` marks tables that carry a `deleted_at` tombstone column
# we must filter out on export. `user_scoped` marks tables whose ownership
# column must be re-homed to the importer. Adding a future trip-scoped table
# is a one-liner here.
_SECTIONS = [
    {"name": "trips", "trip_col": "id", "live": False},
    {"name": "trip_days", "trip_col": "trip_id", "live": True},
    {"name": "expenses", "trip_col": "trip_id", "live": True},
    {"name": "budgets", "trip_col": "trip_id", "live": False},
    {"name": "settlements", "trip_col": "trip_id", "live": False},
]

# Columns we never carry verbatim across an import — they are either
# server-managed (timestamps, tombstones) or account/sharing state that must
# NOT transfer to a freshly-imported, importer-owned trip. Anything listed
# here is dropped from the INSERT so the column falls back to its DB default.
_RESET_COLUMNS = {
    "created_at",
    "updated_at",
    "deleted_at",
    "is_public",
    "public_show_expenses",
    "is_archived",
    "share_token",
    "public_slug",
}

# Generic upload-URL scanner. Media lives inside JSON-string columns
# (photos_json, documents_json, marked_places_json, checklist_json,
# companions_json) AND plain columns (cover_url, receipt_url). Rather than
# know each shape, we extract every `/static/uploads/<uid>/<file>` substring
# from every string value — shape-agnostic and future-proof. The character
# class stops at the delimiters that bound a URL inside JSON / HTML.
_UPLOAD_URL_RE = re.compile(r"/static/uploads/[^\s\"'\\)<>]+")

# Defensive caps on import (zip-bomb / abuse). A real trip's media is well
# under these.
_MAX_MEDIA_FILES = 5000
_MAX_TOTAL_BYTES = 512 * 1024 * 1024  # 512 MB uncompressed
_MEDIA_EXT_ALLOW = {
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".heic",
    ".heif",
    ".bmp",
    ".pdf",
    ".txt",
    ".csv",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".mp4",
    ".mov",
    ".m4v",
    ".svg",
}


# ── shared helpers ───────────────────────────────────────────────────────


def _table_columns(cursor, table):
    """Current column set for `table` (schema introspection — the engine of
    the future-proofing)."""
    return {r[1] for r in cursor.execute(f"PRAGMA table_info({table})")}


def _rows_as_dicts(cursor, sql, params):
    cursor.execute(sql, params)
    return [dict(r) for r in cursor.fetchall()]


def _collect_upload_urls(row: dict) -> set:
    """Every `/static/uploads/...` URL referenced by any string value in the
    row (plain columns AND substrings inside JSON-string columns)."""
    found = set()
    for v in row.values():
        if isinstance(v, str) and "/static/uploads/" in v:
            found.update(_UPLOAD_URL_RE.findall(v))
    return found


def _disk_path_for_url(upload_root: str, url: str):
    """Resolve a `/static/uploads/<rel>` URL to an absolute file path under
    `upload_root`, refusing anything that escapes the root (path-traversal
    guard, mirroring serve_upload's containment check)."""
    prefix = "/static/uploads/"
    if not url.startswith(prefix):
        return None
    rel = url[len(prefix) :]
    # Strip any query/hash a stored URL might carry.
    rel = rel.split("?", 1)[0].split("#", 1)[0]
    candidate = os.path.normpath(os.path.join(upload_root, rel))
    root_abs = os.path.abspath(upload_root)
    if os.path.commonpath([root_abs, os.path.abspath(candidate)]) != root_abs:
        return None
    return candidate


def _safe_ext(name: str) -> str:
    ext = os.path.splitext(name)[1].lower()
    # Keep only sane, short, all- listed extensions; otherwise drop it (the
    # file is still served via the auth-gated static route, but we don't want
    # a crafted name introducing an odd extension).
    if ext in _MEDIA_EXT_ALLOW and len(ext) <= 6:
        return ext
    return ""


def _slugify(name: str) -> str:
    s = re.sub(r"[^A-Za-z0-9]+", "-", (name or "").strip()).strip("-").lower()
    return (s or "trip")[:60]


# ── EXPORT ───────────────────────────────────────────────────────────────


@bp.route("/api/trips/<trip_id>/export", methods=["GET"])
@limiter.limit("20 per minute")
@require_auth
@retry_on_lock()
def export_trip(trip_id):
    """Bundle a trip into a downloadable ZIP: `manifest.json` (versioned,
    section-based) + a `media/` folder of every referenced upload file.

    Any accepted member may export (if you can see the trip, you can take a
    copy of it). No mutation — read-only."""
    user_id = current_user_id()

    with get_db() as conn:
        cursor = conn.cursor()

        if trip_member_role(cursor, trip_id, user_id) is None:
            return jsonify({"error": "Not found"}), 404

        # Gather each section via SELECT * (so new columns ride along).
        sections: dict[str, list] = {}
        for spec in _SECTIONS:
            table = spec["name"]
            cols = _table_columns(cursor, table)
            where = f"{spec['trip_col']} = ?"
            if spec["live"] and "deleted_at" in cols:
                where += " AND deleted_at IS NULL"
            sections[table] = _rows_as_dicts(
                cursor,
                f"SELECT * FROM {table} WHERE {where}",
                (trip_id,),
            )

        if not sections.get("trips"):
            return jsonify({"error": "Not found"}), 404

        # Categories are user-scoped, not trip-scoped — export exactly the
        # ones this trip's expenses/budgets reference, so import can rebuild
        # the same labels/colours without dragging in the user's whole set.
        cat_ids = {
            r.get("category_id")
            for r in (sections.get("expenses", []) + sections.get("budgets", []))
            if r.get("category_id")
        }
        if cat_ids:
            ph = ",".join(["?"] * len(cat_ids))
            sections["categories"] = _rows_as_dicts(
                cursor,
                f"SELECT * FROM categories WHERE id IN ({ph})",
                list(cat_ids),
            )
        else:
            sections["categories"] = []

        # MK6 P2: strip the columns import never restores (server-managed
        # timestamps/tombstones + account/sharing state) from every exported
        # row BEFORE they reach the manifest. Import already drops these via
        # _insert_remapped, so the round-trip is unchanged — but leaving them
        # in leaked the owner-only `share_token` (plus public_slug / is_public)
        # to any non-owner member who could export the trip, letting them
        # reconstruct the private /share/<token> link and keep access after
        # removal. Symmetric with _RESET_COLUMNS on the import side.
        for rows in sections.values():
            for r in rows:
                for col in _RESET_COLUMNS:
                    r.pop(col, None)

        trip_name = sections["trips"][0].get("name") or "Trip"

    # Discover every referenced upload file across all sections.
    upload_root = current_app.config["UPLOAD_FOLDER"]
    urls = set()
    for rows in sections.values():
        for r in rows:
            urls |= _collect_upload_urls(r)

    # Build the ZIP in memory: media files first (so we know the arc map),
    # then the manifest referencing them.
    buf = io.BytesIO()
    media_map: dict[str, str] = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, url in enumerate(sorted(urls)):
            disk = _disk_path_for_url(upload_root, url)
            if not disk or not os.path.isfile(disk):
                # A missing/dangling reference is skipped (the URL stays in
                # the data; import just won't have a file to re-save for it).
                continue
            arc = f"media/{i:04d}_{os.path.basename(disk)}"
            zf.write(disk, arc)
            media_map[url] = arc

        manifest = {
            "format": FORMAT_ID,
            "formatVersion": FORMAT_VERSION,
            "exportedAt": datetime.now(UTC).isoformat(),
            "tripId": trip_id,  # informational (import re-keys)
            "tripName": trip_name,
            "sections": sections,
            "media": media_map,  # original-URL -> arc path in this zip
        }
        zf.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2, default=str),
        )

    buf.seek(0)
    fname = f"{_slugify(trip_name)}.ggtrip.zip"
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=fname,
    )


# ── IMPORT ───────────────────────────────────────────────────────────────


def _rewrite_urls(value, url_remap: dict):
    """Replace every old upload URL with its new one inside a string (covers
    plain columns and substrings inside JSON-string columns).

    A7-B4: apply the replacements longest-old-URL first. Two exported URLs can
    have a prefix relationship (`.../pic.jpg` and `.../pic.jpg.thumb.jpg`); a
    naive dict-order loop that hit the shorter one first would rewrite it as a
    substring INSIDE the longer URL, corrupting it into a dead 404 reference.
    Handling the longest key first means the longer URL is fully consumed
    before its shorter prefix can match anything left in the string."""
    if not isinstance(value, str) or "/static/uploads/" not in value:
        return value
    for old in sorted(url_remap, key=len, reverse=True):
        if old in value:
            value = value.replace(old, url_remap[old])
    return value


def _strip_companion_links(companions_json):
    """Companions may carry a `linkedUserId` tying them to a real account.
    Those associations are account-specific and can't transfer on import, so
    keep the names and drop the link fields — the imported trip's companions
    become plain names (re-linkable later)."""
    if not isinstance(companions_json, str) or not companions_json.strip():
        return companions_json
    try:
        arr = json.loads(companions_json)
    except (ValueError, TypeError):
        return companions_json
    if not isinstance(arr, list):
        return companions_json
    for c in arr:
        if isinstance(c, dict):
            for k in ("linkedUserId", "linked_user_id", "userId", "user_id"):
                c.pop(k, None)
    return json.dumps(arr, ensure_ascii=False)


# Media JSON columns on the trips row whose items reference a day by `dayId`.
# On import the days get fresh ids, so these refs must be remapped or the
# places/photos/documents point at a dead day id and vanish from every pane.
_DAY_REF_MEDIA_COLS = ("marked_places_json", "documents_json", "photos_json")


def _remap_day_ids_in_media(json_str, day_remap: dict):
    """Rewrite each item's `dayId` (old→new) inside a JSON-array media column.
    An item whose dayId isn't among the imported days gets it cleared to null
    (so it resurfaces as an un-slotted to-do) rather than pinned to a dead id."""
    if not isinstance(json_str, str) or not json_str.strip() or not day_remap:
        return json_str
    try:
        arr = json.loads(json_str)
    except (ValueError, TypeError):
        return json_str
    if not isinstance(arr, list):
        return json_str
    changed = False
    for item in arr:
        if not isinstance(item, dict):
            continue
        for k in ("dayId", "day_id"):
            old = item.get(k)
            if old:
                item[k] = day_remap.get(old)  # None if unknown → cleared
                changed = True
    return json.dumps(arr, ensure_ascii=False) if changed else json_str


def _insert_remapped(cursor, table, row, *, overrides, url_remap):
    """Generic INSERT of one exported row into `table`:
    - keep only keys that still exist as columns (intersection);
    - drop server-managed / sharing columns (so they take DB defaults);
    - rewrite any embedded upload URLs to the importer's re-saved copies;
    - apply forced `overrides` (new ids, re-homed FKs, etc.) last.
    """
    cols_now = _table_columns(cursor, table)
    out = {}
    for k, v in row.items():
        if k not in cols_now or k in _RESET_COLUMNS:
            continue
        out[k] = _rewrite_urls(v, url_remap)
    # Companions link-strip (only the trips row has this column).
    if "companions_json" in out:
        out["companions_json"] = _strip_companion_links(out["companions_json"])
    for k, v in overrides.items():
        if k in cols_now:
            out[k] = v
    keys = list(out.keys())
    placeholders = ",".join(["?"] * len(keys))
    cursor.execute(
        f"INSERT INTO {table} ({','.join(keys)}) VALUES ({placeholders})",
        [out[k] for k in keys],
    )


@bp.route("/api/trips/import", methods=["POST"])
@limiter.limit("10 per minute")
@require_auth
@retry_on_lock()
def import_trip():
    """Recreate a trip from a `.ggtrip.zip` produced by `export_trip`.

    Always creates a NEW, importer-owned trip (fresh ids; sharing/membership/
    public state reset). Returns `{tripId}` so the client can pull `/api/data`
    and open it."""
    user_id = current_user_id()

    file = request.files.get("file")
    if file is None:
        return jsonify({"error": "No file uploaded"}), 400

    raw = file.read()
    if not raw:
        return jsonify({"error": "Empty file"}), 400
    if len(raw) > _MAX_TOTAL_BYTES:
        return jsonify({"error": "File too large"}), 413

    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        return jsonify({"error": "Not a valid ZIP file"}), 400

    with zf:
        # Zip-bomb guard: reject if the declared uncompressed size or file
        # count is unreasonable before we read anything out.
        infos = zf.infolist()
        if len(infos) > _MAX_MEDIA_FILES + 8:
            return jsonify({"error": "Too many files in archive"}), 400
        if sum(i.file_size for i in infos) > _MAX_TOTAL_BYTES:
            return jsonify({"error": "Archive contents too large"}), 413

        try:
            manifest = json.loads(zf.read("manifest.json"))
        except (KeyError, ValueError):
            return jsonify({"error": "Missing or invalid manifest.json"}), 400

        if manifest.get("format") != FORMAT_ID:
            return jsonify({"error": "Unrecognised trip file"}), 400

        # Validate the manifest envelope shape BEFORE we start unpacking it.
        # Everything below assumes formatVersion is int-coercible, sections is a
        # dict, sections['trips'] is a list of dicts, and media is a dict — a
        # malformed/corrupt manifest that violated any of these previously blew
        # up unguarded (ValueError from int(), AttributeError from .get()/.items()
        # or dict()) → a raw 500. Fail cleanly with a 400 instead.
        _bad = jsonify({"error": "Invalid or corrupt trip archive"}), 400
        try:
            format_version = int(manifest.get("formatVersion", 0))
        except (TypeError, ValueError):
            return _bad
        if format_version > FORMAT_VERSION:
            return jsonify(
                {
                    "error": "This trip file was made by a newer version of the "
                    "app. Please update and try again.",
                }
            ), 400

        sections = manifest.get("sections") or {}
        if not isinstance(sections, dict):
            return _bad
        trips_section = sections.get("trips")
        if not trips_section:
            return jsonify({"error": "Trip file contains no trip"}), 400
        if not isinstance(trips_section, list) or not all(
            isinstance(t, dict) for t in trips_section
        ):
            return _bad
        media_manifest = manifest.get("media") or {}
        if not isinstance(media_manifest, dict):
            return _bad

        upload_root = current_app.config["UPLOAD_FOLDER"]
        user_dir = os.path.join(upload_root, user_id)
        os.makedirs(user_dir, exist_ok=True)

        # Re-save every media file under the importer's own upload dir with a
        # fresh name; build old-URL -> new-URL so we can rewrite references.
        # We read by the arc path from the manifest but write to a path WE
        # generate (uuid name), so a crafted arc can't traverse the filesystem.
        # MK6 P3: generate the remap (new uuid names) but DON'T write files yet.
        # Pre-fix, media was written to disk BEFORE the DB transaction; if an
        # insert raised (get_db rolls back, so no trip row is created) the files
        # orphaned under /static/uploads/<user>/ with nothing referencing them —
        # unreclaimable growth from a crafted manifest that passes the envelope
        # checks but fails an insert. Deferring the writes until AFTER commit
        # means a rollback leaves nothing on disk. The names are deterministic,
        # so the DB rows can reference the final URLs before the bytes land.
        url_remap: dict[str, str] = {}
        pending_writes: list[tuple[str, str]] = []  # (arc, disk_path)
        for old_url, arc in media_manifest.items():
            if arc not in zf.namelist():
                continue
            new_name = uuid.uuid4().hex + _safe_ext(arc)
            pending_writes.append((arc, os.path.join(user_dir, new_name)))
            url_remap[old_url] = f"/static/uploads/{user_id}/{new_name}"

        new_trip_id = uuid.uuid4().hex

        with get_db() as conn:
            cursor = conn.cursor()

            # Categories: match the importer's existing categories by name
            # (avoids duplicating "Food" on every re-import of your own trip);
            # otherwise create a fresh category owned by the importer. Build
            # old-category-id -> importer-category-id for the expense/budget
            # FK remap.
            cat_remap: dict[str, str] = {}
            existing_by_name = {}
            for r in cursor.execute(
                "SELECT id, name FROM categories WHERE user_id = ?",
                (user_id,),
            ):
                if r["name"]:
                    existing_by_name[r["name"].strip().lower()] = r["id"]
            for cat in sections.get("categories", []):
                old_id = cat.get("id")
                if not old_id:
                    continue
                key = (cat.get("name") or "").strip().lower()
                if key and key in existing_by_name:
                    cat_remap[old_id] = existing_by_name[key]
                    continue
                new_cat_id = uuid.uuid4().hex
                cursor.execute(
                    "INSERT INTO categories (id, user_id, name, icon, color) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (
                        new_cat_id,
                        user_id,
                        cat.get("name") or "Uncategorised",
                        cat.get("icon") or "",
                        cat.get("color") or "#007aff",
                    ),
                )
                if key:
                    existing_by_name[key] = new_cat_id
                cat_remap[old_id] = new_cat_id

            # Days get fresh ids on import. Build the old→new map FIRST so the
            # trip row's media JSON (marked places / photos / documents, all of
            # which reference a day by dayId) can be remapped before insert —
            # otherwise those refs point at a dead day id and the items vanish
            # from every day pane. Mirrors the cat_remap pattern above.
            day_remap: dict[str, str] = {}
            for d in sections.get("trip_days", []):
                old_day_id = d.get("id")
                if old_day_id:
                    day_remap[old_day_id] = uuid.uuid4().hex

            # 1) The trip row — importer becomes owner; sharing/public/archive
            #    reset via _RESET_COLUMNS; media URLs rewritten in-place; media
            #    dayId refs remapped to the new day ids.
            trip_row = dict(sections["trips"][0])
            for _col in _DAY_REF_MEDIA_COLS:
                if _col in trip_row:
                    trip_row[_col] = _remap_day_ids_in_media(trip_row[_col], day_remap)
            _insert_remapped(
                cursor,
                "trips",
                trip_row,
                overrides={"id": new_trip_id, "user_id": user_id},
                url_remap=url_remap,
            )
            ensure_owner_member_row(cursor, new_trip_id, user_id)

            # 2) Days — re-homed to the new trip, using the pre-built remap so
            #    the ids line up with the media refs rewritten above.
            for d in sections.get("trip_days", []):
                _insert_remapped(
                    cursor,
                    "trip_days",
                    d,
                    overrides={
                        "id": day_remap.get(d.get("id")) or uuid.uuid4().hex,
                        "trip_id": new_trip_id,
                    },
                    url_remap=url_remap,
                )

            # 3) Expenses — fresh id, new trip, remapped category, rewritten
            #    receipt URL.
            for e in sections.get("expenses", []):
                _insert_remapped(
                    cursor,
                    "expenses",
                    e,
                    overrides={
                        "id": uuid.uuid4().hex,
                        "trip_id": new_trip_id,
                        "category_id": cat_remap.get(e.get("category_id")),
                    },
                    url_remap=url_remap,
                )

            # 4) Budgets — fresh id, new trip, importer-owned, remapped cat.
            #    A7-B3: `categories` has no unique-name constraint, so the
            #    source can hold two rows ("Food" and "food") that the
            #    case-insensitive cat_remap collapses to ONE importer category.
            #    Two budgets backed by those categories then share the same
            #    (user_id, trip_id, category_id, owner_name) and collide on the
            #    budgets UNIQUE. Skip the duplicate per-row (SAVEPOINT so the
            #    failed INSERT rolls back only itself) instead of letting the
            #    IntegrityError abort the whole import into a 500.
            for b in sections.get("budgets", []):
                try:
                    cursor.execute("SAVEPOINT budget_ins")
                    _insert_remapped(
                        cursor,
                        "budgets",
                        b,
                        overrides={
                            "id": uuid.uuid4().hex,
                            "trip_id": new_trip_id,
                            "user_id": user_id,
                            "category_id": cat_remap.get(b.get("category_id")),
                        },
                        url_remap=url_remap,
                    )
                except sqlite3.IntegrityError:
                    cursor.execute("ROLLBACK TO SAVEPOINT budget_ins")
                else:
                    cursor.execute("RELEASE SAVEPOINT budget_ins")

            # 5) Settlements — fresh id, new trip. Account references can't
            #    transfer, so null the linked user ids and credit the importer
            #    as recorder; the human-readable from/to names are preserved.
            for s in sections.get("settlements", []):
                _insert_remapped(
                    cursor,
                    "settlements",
                    s,
                    overrides={
                        "id": uuid.uuid4().hex,
                        "trip_id": new_trip_id,
                        "from_user_id": None,
                        "to_user_id": None,
                        "recorded_by": user_id,
                    },
                    url_remap=url_remap,
                )

            conn.commit()

        # MK6 P3: the transaction committed — NOW write the media bytes
        # (deferred from before the txn so a rollback leaves no orphaned files).
        # Still inside `with zf:` so the archive is readable. A write failure
        # here leaves the trip with one 404'ing image — a far better outcome
        # than an on-disk file with no referencing DB row.
        for arc, disk_path in pending_writes:
            try:
                with open(disk_path, "wb") as fh:
                    fh.write(zf.read(arc))
            except Exception:
                current_app.logger.warning(
                    "trip import %s: media write failed for %s",
                    new_trip_id,
                    disk_path,
                    exc_info=True,
                )

    return jsonify({"status": "imported", "tripId": new_trip_id})
