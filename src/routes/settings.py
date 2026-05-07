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
    """Update user bio, status, and/or home currency. Any field omitted
    in the payload is left unchanged so callers can patch a single
    field."""
    payload = request.json or {}
    user_id = current_user_id()

    fields = []
    values = []
    for key, column in (("bio", "bio"), ("status", "status"), ("homeCurrency", "home_currency")):
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
