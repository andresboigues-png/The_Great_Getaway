"""Per-user settings — categories and profile fields.

Both routes are simple: replace-or-patch the user's own row(s) in a
single table. They share the `settings` blueprint because they live
on the same /personalization page in the frontend (`pages/settings.ts`)
and the user reads them as one cluster.

Endpoints:
  POST /api/categories      — per-row category delta sync (or legacy
                              full-list replace; see sync_categories)
  POST /api/profile/update  — patch user bio / status / home currency
"""

import time

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from validators import (
    ValidationError,
    clean_text,
    validate_currency,
)


bp = Blueprint("settings", __name__)


_CATEGORY_COLOR_RE = __import__("re").compile(r"^#[0-9a-fA-F]{6}$")


def _coerce_ts(value) -> int:
    """Coerce a client-supplied epoch-ms timestamp to a positive int.
    Falls back to the server's current time for missing/garbage values so a
    malformed payload still reconciles as 'just now' rather than as epoch 0
    (which would never win LWW)."""
    try:
        n = int(value)
        # reject NaN-ish / non-positive; int(float('nan')) raises, so the
        # try/except already covers NaN, but guard <= 0 explicitly.
        return n if n > 0 else int(time.time() * 1000)
    except (TypeError, ValueError):
        return int(time.time() * 1000)


def _apply_category_deltas(user_id: str, data: dict):
    """Per-row category reconciliation (#3).

    Body: { upserts: [{id,name,icon,color,updatedAt}], deletes: [{id,deletedAt}] }.

    Reconciliation rules (epoch-ms timestamps; latest wins, deterministic
    regardless of request arrival order):
      - UPSERT applies only if its updatedAt >= the stored row's updated_at
        (a stale re-send of an older edit can't overwrite a newer one), AND
        only if no tombstone with a strictly-later deleted_at exists (a more
        recent delete is not resurrected). A winning upsert clears any
        now-stale tombstone so the row is live again.
      - DELETE writes/raises a tombstone (keeps the max deleted_at) and removes
        the row only when its updated_at <= the delete (an edit made AFTER the
        delete survives). Deleted categories have their dangling category_id
        references on the caller's expenses/budgets nulled, matching the bulk
        path (orphaned refs silently break scoped budgets).
    Deletes are applied before upserts so a same-batch re-add (newer ts) wins.
    Returns the reconciled current list so the client can sync to truth.
    """
    upserts_in = data.get("upserts", []) or []
    deletes_in = data.get("deletes", []) or []
    if not isinstance(upserts_in, list) or not isinstance(deletes_in, list):
        return jsonify({"error": "upserts and deletes must be lists"}), 400
    if len(upserts_in) > 200 or len(deletes_in) > 200:
        return jsonify({"error": "too many category changes (max 200)"}), 400

    cleaned_upserts: list[tuple[str, str, str, str, int]] = []
    cleaned_deletes: list[tuple[str, int]] = []
    try:
        for cat in upserts_in:
            if not isinstance(cat, dict):
                return jsonify({"error": "upsert entry must be an object"}), 400
            cat_id = clean_text(cat.get("id"), max_len=64, allow_newlines=False,
                                field_name="category id")
            if not cat_id:
                return jsonify({"error": "category id is required"}), 400
            name = clean_text(cat.get("name"), max_len=64, allow_newlines=False,
                              field_name="category name")
            if not name:
                return jsonify({"error": "category name is required"}), 400
            icon = clean_text(cat.get("icon", ""), max_len=8, allow_newlines=False,
                              field_name="category icon")
            color = cat.get("color", "#007aff")
            if not isinstance(color, str) or not _CATEGORY_COLOR_RE.match(color):
                color = "#007aff"
            cleaned_upserts.append((cat_id, name, icon, color, _coerce_ts(cat.get("updatedAt"))))
        for d in deletes_in:
            if not isinstance(d, dict):
                return jsonify({"error": "delete entry must be an object"}), 400
            cat_id = clean_text(d.get("id"), max_len=64, allow_newlines=False,
                                field_name="category id")
            if not cat_id:
                return jsonify({"error": "delete id is required"}), 400
            cleaned_deletes.append((cat_id, _coerce_ts(d.get("deletedAt"))))
    except ValidationError as ve:
        return jsonify({"error": str(ve)}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        doomed: list[str] = []
        for cat_id, deleted_at in cleaned_deletes:
            cursor.execute(
                """
                INSERT INTO category_deletes (user_id, category_id, deleted_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, category_id) DO UPDATE SET
                    deleted_at = MAX(category_deletes.deleted_at, excluded.deleted_at)
                """,
                (user_id, cat_id, deleted_at),
            )
            cursor.execute(
                "DELETE FROM categories WHERE user_id = ? AND id = ? AND updated_at <= ?",
                (user_id, cat_id, deleted_at),
            )
            doomed.append(cat_id)
        if doomed:
            ph = ",".join(["?"] * len(doomed))
            cursor.execute(
                f"UPDATE expenses SET category_id = NULL "
                f"WHERE category_id IN ({ph}) "
                f"  AND trip_id IN (SELECT id FROM trips WHERE user_id = ?)",
                doomed + [user_id],
            )
            cursor.execute(
                f"UPDATE budgets SET category_id = NULL "
                f"WHERE category_id IN ({ph}) AND user_id = ?",
                doomed + [user_id],
            )
        for cat_id, name, icon, color, updated_at in cleaned_upserts:
            tomb = cursor.execute(
                "SELECT deleted_at FROM category_deletes WHERE user_id = ? AND category_id = ?",
                (user_id, cat_id),
            ).fetchone()
            if tomb and tomb["deleted_at"] > updated_at:
                continue  # deleted more recently than this edit — don't resurrect
            cursor.execute(
                """
                INSERT INTO categories (id, user_id, name, icon, color, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id, user_id) DO UPDATE SET
                    name = excluded.name, icon = excluded.icon,
                    color = excluded.color, updated_at = excluded.updated_at
                WHERE excluded.updated_at >= categories.updated_at
                """,
                (cat_id, user_id, name, icon, color, updated_at),
            )
            cursor.execute(
                "DELETE FROM category_deletes WHERE user_id = ? AND category_id = ? AND deleted_at <= ?",
                (user_id, cat_id, updated_at),
            )
        conn.commit()
        rows = cursor.execute(
            "SELECT id, name, icon, color, updated_at FROM categories WHERE user_id = ? ORDER BY name",
            (user_id,),
        ).fetchall()
    return jsonify({
        "status": "ok",
        "categories": [
            {"id": r["id"], "name": r["name"], "icon": r["icon"],
             "color": r["color"], "updatedAt": r["updated_at"]}
            for r in rows
        ],
    })


@bp.route("/api/categories", methods=["POST"])
@require_auth
@retry_on_lock()
def sync_categories():
    """Replace the category list for a user.

    Audit fix (2026-05-27): validate every category before the
    DELETE+INSERT. Pre-fix the route used `cat['id']` and
    `cat['name']` with `[]` access (KeyError → 500 on missing
    fields), accepted unbounded name/icon/color strings, and let
    `color` be any string including malicious payloads. Now we
    validate shape + length first; a single bad entry rejects the
    whole batch with 400, preserving the existing categories.
    """
    data = request.json or {}
    user_id = current_user_id()

    # #3 per-row delta sync: if the client sent `upserts`/`deletes` (each
    # timestamped), reconcile per-row by last-write-wins + tombstones so two
    # tabs editing categories concurrently can't wholesale-clobber each other.
    # Older clients (and a defensive fallback) still send the full `categories`
    # list, handled by the legacy replace path below.
    if "upserts" in data or "deletes" in data:
        return _apply_category_deltas(user_id, data)

    categories = data.get("categories", [])
    if not isinstance(categories, list):
        return jsonify({"error": "categories must be a list"}), 400
    if len(categories) > 200:
        return jsonify({"error": "too many categories (max 200)"}), 400
    # Pre-validate every row so a bad entry doesn't strand the user
    # with a half-applied delete (the whole INSERT loop happens
    # inside the same `with get_db()` context, so a raise mid-loop
    # rolls back to the pre-DELETE state — but we'd rather catch
    # the bad input BEFORE the transaction starts).
    cleaned: list[tuple[str, str, str, str]] = []
    seen_ids: set[str] = set()
    try:
        for cat in categories:
            if not isinstance(cat, dict):
                return jsonify({"error": "category entry must be an object"}), 400
            cat_id = clean_text(
                cat.get("id"), max_len=64, allow_newlines=False,
                field_name="category id",
            )
            if not cat_id:
                return jsonify({"error": "category id is required"}), 400
            if cat_id in seen_ids:
                return jsonify({"error": f"duplicate category id: {cat_id}"}), 400
            seen_ids.add(cat_id)
            name = clean_text(
                cat.get("name"), max_len=64, allow_newlines=False,
                field_name="category name",
            )
            if not name:
                return jsonify({"error": "category name is required"}), 400
            icon = clean_text(
                cat.get("icon", ""), max_len=8, allow_newlines=False,
                field_name="category icon",
            )
            color = cat.get("color", "#007aff")
            if not isinstance(color, str) or not _CATEGORY_COLOR_RE.match(color):
                color = "#007aff"
            cleaned.append((cat_id, name, icon, color))
    except ValidationError as ve:
        return jsonify({"error": str(ve)}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM categories WHERE user_id = ?", (user_id,))
        for cat_id, name, icon, color in cleaned:
            cursor.execute(
                """
                INSERT INTO categories (id, user_id, name, icon, color)
                VALUES (?, ?, ?, ?, ?)
                """,
                (cat_id, user_id, name, icon, color),
            )
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/profile/update", methods=["POST"])
@require_auth
@retry_on_lock()
def update_profile():
    """Update user bio, status, home currency, and/or profile picture.
    Any field omitted in the payload is left unchanged so callers can
    patch a single field.

    Round 5 audit fix — `picture` is now a writable field. Previously
    the column was populated from Google OAuth on sign-in and never
    touched again, which meant the frontend's "Change profile photo"
    picker silently no-op'd on the server (the local DOM updated but
    the photo never persisted). The frontend now uploads the file
    to /api/upload first, then POSTs the returned URL here so the
    photo lands on every device + every other user's view.

    Picture validation: must be a string URL pointing at our /api/upload
    output (uploads/* path) OR a Google profile-pic URL (lh3.googleusercontent
    .com — the OAuth fallback) OR empty string (clear). Any other value
    is rejected to prevent storing arbitrary attacker-supplied URLs in
    the users table that other clients would then hot-link from."""
    payload = request.json or {}
    user_id = current_user_id()

    # Validate `bio` — server-side cap + control-char strip so an
    # attacker can't store an unbounded HTML payload or invisible
    # zero-width chars in the users table. The frontend escapes user
    # content at render time (esc() in profile.ts), so this is
    # defense-in-depth: short, sanitized strings reduce both the
    # blast radius of any future render-side oversight AND the size
    # of the bio column for the bulk-read /api/data path.
    if "bio" in payload:
        raw_bio = payload.get("bio")
        if raw_bio is None:
            payload["bio"] = ""
        else:
            if not isinstance(raw_bio, str):
                return jsonify({"error": "bio must be a string"}), 400
            # Strip C0 control chars (0x00-0x1F) except newline (\n=0x0A)
            # and tab (\t=0x09). Bios are short user copy — they don't
            # need vertical tabs or bell characters.
            cleaned = "".join(c for c in raw_bio if c == "\n" or c == "\t" or ord(c) >= 0x20)
            if len(cleaned) > 500:
                return jsonify({"error": "bio must be 500 characters or less"}), 400
            payload["bio"] = cleaned

    # Validate `status` — the frontend offers a fixed dropdown
    # (profile.ts has 5 options). Anything outside that allowlist
    # is rejected so a crafted client can't smuggle in arbitrary
    # status copy (which renders on other users' profiles).
    # Empty string is allowed and acts as "clear status."
    _ALLOWED_STATUS = {
        "",
        "Deliberating next trip",
        "Preparing a trip right now",
        "Exploring the world",
        "Resting at home base",
        "Hunting for flight deals",
    }
    if "status" in payload:
        raw_status = payload.get("status")
        if raw_status is None:
            payload["status"] = ""
        else:
            if not isinstance(raw_status, str) or raw_status not in _ALLOWED_STATUS:
                return jsonify({
                    "error": "status must be one of the allowed values or empty",
                }), 400

    # Validate the picture value before letting it touch the DB.
    if "picture" in payload:
        pic = payload.get("picture") or ""
        if not isinstance(pic, str):
            return jsonify({"error": "picture must be a string"}), 400
        # R2 audit fix: pre-fix any lh3.googleusercontent.com URL was
        # accepted as a "Google picture". That CDN serves arbitrary
        # user-uploaded content (Google Photos shares, Workspace
        # assets). An attacker could host a phishing-image, get a
        # lh3.googleusercontent.com/... URL, set it as their TGG
        # picture, and the image surfaces in every chat / feed /
        # member list across the app. Now: only accept the EXACT
        # google URL the user's CURRENT users.picture field holds
        # (the canonical value Google set at OAuth time). Re-OAuth
        # updates it on every login (routes/auth.py line ~188).
        is_google_owned = False
        if pic.startswith("https://lh3.googleusercontent.com/"):
            with get_db() as _conn:
                _c = _conn.cursor()
                _c.execute(
                    "SELECT picture FROM users WHERE id = ?", (user_id,),
                )
                _row = _c.fetchone()
                if _row and _row["picture"] == pic:
                    is_google_owned = True
        is_google = is_google_owned  # only true when matches DB-canonical
        is_empty = pic == ""
        # FIXING_ROADMAP §2.7 — local uploads are now stored in a
        # per-user subdirectory (`/static/uploads/<user_id>/...`).
        # The validator accepts a URL only if its subdir matches the
        # caller. Legacy flat paths (`/static/uploads/<filename>` with
        # no subdir) are still accepted for backwards compatibility —
        # they were the only shape pre-§2.7, so existing profile pics
        # don't break. New abuse vectors are blocked because any NEW
        # upload lands in the caller's own subdir.
        from werkzeug.utils import secure_filename
        safe_user_dir = secure_filename(user_id) or "anon"
        owned_prefix = f"/static/uploads/{safe_user_dir}/"
        legacy_prefix = "/static/uploads/"
        is_owned_local = pic.startswith(owned_prefix)
        is_legacy_local = (
            pic.startswith(legacy_prefix)
            # No further subdir = legacy flat layout. If there's a
            # subdir component, require it to match the caller (above).
            and "/" not in pic[len(legacy_prefix):]
        )
        if not (is_owned_local or is_legacy_local or is_google or is_empty):
            return jsonify({
                "error": "picture URL must be your own upload (or empty)",
            }), 403

    # i18n session 3 — language follows the user across devices.
    # Allowlist matches the Locale union in i18n.ts; anything else
    # gets rejected so we never end up with junk in the DB that the
    # frontend's KNOWN_LOCALES gate would then silently fall back from.
    if "language" in payload:
        lang = payload.get("language")
        if lang is not None and lang not in ("en", "pt", "es", "fr"):
            return jsonify({
                "error": "language must be one of en, pt, es, fr (or null)",
            }), 400

    # Home country — accept either a string matching one of the
    # COUNTRIES list values (validated client-side via the dropdown),
    # an empty string (= clear), or null. We don't allowlist
    # server-side against the 195-country list because:
    #   1. The dropdown is the only entry path — invalid values
    #      can't be picked.
    #   2. The list might drift between frontend revisions; we don't
    #      want a server-side check to start rejecting Cape Verde
    #      because we renamed it to Cabo Verde in constants.ts.
    # We DO cap length + scrub control chars (same pattern as bio
    # / destination on the AI route) to keep nasties out of the DB.
    if "homeCountry" in payload:
        v = payload.get("homeCountry")
        if v is not None:
            if not isinstance(v, str):
                return jsonify({"error": "homeCountry must be a string or null"}), 400
            scrubbed = "".join(c for c in v if ord(c) >= 0x20 and c not in "\r\n\t")
            payload["homeCountry"] = scrubbed.strip()[:120] or None

    # Audit fix (2026-05-27): validate homeCurrency against the same
    # ISO-4217 allowlist that drives the expense / settlement
    # validation. Pre-fix this field was forwarded into the UPDATE
    # without any check — a malicious client could store any string
    # ("javascript:alert(1)", a 10KB payload, etc.) and the value
    # then powered every downstream Intl.NumberFormat call. None or
    # empty string clears the field (frontend then defaults from
    # browser locale on next read).
    if "homeCurrency" in payload:
        raw_currency = payload.get("homeCurrency")
        if raw_currency in (None, ""):
            payload["homeCurrency"] = None
        else:
            try:
                payload["homeCurrency"] = validate_currency(raw_currency)
            except ValidationError as ve:
                return jsonify({"error": str(ve)}), 400

    fields = []
    values = []
    for key, column in (
        ("bio", "bio"),
        ("status", "status"),
        ("homeCurrency", "home_currency"),
        ("homeCountry", "home_country"),
        ("picture", "picture"),
        ("language", "language"),
    ):
        if key in payload:
            fields.append(f"{column} = ?")
            values.append(payload[key])
    if not fields:
        return jsonify({"status": "noop"})

    values.append(user_id)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
    return jsonify({"status": "updated"})
