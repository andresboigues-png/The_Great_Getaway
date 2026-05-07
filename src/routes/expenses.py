"""/api/expenses — single-row upsert + delete.

Permission gate: Planner OR Budgeteer can write (Relaxers blocked).
The Budgeteer role exists so one trip member can handle the trip's
money without also being able to rename the trip or change the
itinerary.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db
from helpers import can_edit_expenses


bp = Blueprint("expenses", __name__)


@bp.route("/api/expenses", methods=["POST"])
@require_auth
def upsert_expense():
    """Create or update a single expense."""
    data = request.json or {}
    user_id = current_user_id()
    e = data.get("expense")
    if not e:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        if not can_edit_expenses(cursor, e["tripId"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute('''
            INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                who=excluded.who,
                category_id=excluded.category_id,
                label=excluded.label,
                date=excluded.date,
                country=excluded.country,
                value=excluded.value,
                currency=excluded.currency,
                euro_value=excluded.euro_value
        ''', (e['id'], e['tripId'], e['who'], e.get('categoryId', ''),
              e.get('label', ''), e.get('date', ''), e.get('country', ''),
              e.get('value', 0), e.get('currency', 'EUR'), e.get('euroValue', 0)))
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/expenses/<expense_id>", methods=["DELETE"])
@require_auth
def delete_expense(expense_id):
    """Delete a single expense by ID. Caller from JWT, not body."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id FROM expenses WHERE id = ?", (expense_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "deleted"})  # idempotent
        if not can_edit_expenses(cursor, row["trip_id"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
    return jsonify({"status": "deleted"})
