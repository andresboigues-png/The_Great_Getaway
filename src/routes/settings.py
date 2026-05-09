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
from database import get_db


bp = Blueprint("settings", __name__)


@bp.route("/api/categories", methods=["POST"])
@require_auth
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

    # Validate the picture value before letting it touch the DB.
    if "picture" in payload:
        pic = payload.get("picture") or ""
        if not isinstance(pic, str):
            return jsonify({"error": "picture must be a string"}), 400
        is_local = pic.startswith("/static/uploads/") or pic.startswith("/uploads/")
        is_google = pic.startswith("https://lh3.googleusercontent.com/")
        is_empty = pic == ""
        if not (is_local or is_google or is_empty):
            return jsonify({
                "error": "picture URL must be from /api/upload or empty",
            }), 400

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
