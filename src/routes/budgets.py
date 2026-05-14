"""/api/budgets — personal budget upsert + delete.

Budgets are per-user (not per-trip-membership), so the gate is
"caller owns this budget row" — the audit fix replaced the previous
"delete by id alone" path that let any caller wipe anyone's budget
just by guessing an id.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock


bp = Blueprint("budgets", __name__)


@bp.route("/api/budgets", methods=["POST"])
@require_auth
@retry_on_lock()
def upsert_budget():
    """Create or update a single budget."""
    data = request.json or {}
    user_id = current_user_id()
    b = data.get("budget")
    if not b:
        return jsonify({"error": "Missing data"}), 400
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO budgets (id, user_id, trip_id, label, amount, currency)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                label=excluded.label,
                amount=excluded.amount,
                currency=excluded.currency,
                trip_id=excluded.trip_id
        ''', (b['id'], user_id, b.get('tripId'), b.get('label', ''),
              b.get('amount', 0), b.get('currency', 'EUR')))
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/budgets/<budget_id>", methods=["DELETE"])
@require_auth
@retry_on_lock()
def delete_budget(budget_id):
    """Delete a single budget. Owner-of-budget only."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM budgets WHERE id = ? AND user_id = ?",
            (budget_id, user_id),
        )
        conn.commit()
    return jsonify({"status": "deleted"})
