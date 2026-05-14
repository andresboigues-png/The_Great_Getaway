"""Per-user settings — categories and profile fields.

Both routes are simple: replace-or-patch the user's own row(s) in a
single table. They share the `settings` blueprint because they live
on the same /personalization page in the frontend (`pages/settings.ts`)
and the user reads them as one cluster.

Endpoints:
  POST /api/categories      — replace the user's category list
  POST /api/profile/update  — patch user bio / status / home currency
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock


bp = Blueprint("settings", __name__)


@bp.route("/api/categories", methods=["POST"])
@require_auth
@retry_on_lock()
def sync_categories():
    """Replace the category list for a user."""
    data = request.json or {}
    user_id = current_user_id()
    categories = data.get("categories", [])
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM categories WHERE user_id = ?", (user_id,))
        for cat in categories:
            cursor.execute(
                """
                INSERT INTO categories (id, user_id, name, icon, color)
                VALUES (?, ?, ?, ?, ?)
                """,
                (cat['id'], user_id, cat['name'], cat.get('icon', ''), cat.get('color', '#007aff')),
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
        is_google = pic.startswith("https://lh3.googleusercontent.com/")
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

    fields = []
    values = []
    for key, column in (
        ("bio", "bio"),
        ("status", "status"),
        ("homeCurrency", "home_currency"),
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
