"""/api/expenses — single-row upsert + delete.

Permission gate: Planner OR Budgeteer can write (Relaxers blocked).
The Budgeteer role exists so one trip member can handle the trip's
money without also being able to rename the trip or change the
itinerary.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from helpers import can_edit_expenses
from observability import bind_trip_context


bp = Blueprint("expenses", __name__)


@bp.route("/api/expenses", methods=["POST"])
@require_auth
@retry_on_lock()
def upsert_expense():
    """Create or update a single expense."""
    data = request.json or {}
    user_id = current_user_id()
    e = data.get("expense")
    if not e:
        return jsonify({"error": "Missing data"}), 400
    bind_trip_context(e.get("tripId"))
    with get_db() as conn:
        cursor = conn.cursor()
        if not can_edit_expenses(cursor, e["tripId"], user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute('''
            INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                who=excluded.who,
                category_id=excluded.category_id,
                label=excluded.label,
                date=excluded.date,
                country=excluded.country,
                value=excluded.value,
                currency=excluded.currency,
                euro_value=excluded.euro_value,
                receipt_url=excluded.receipt_url
        ''', (e['id'], e['tripId'], e['who'], e.get('categoryId', ''),
              e.get('label', ''), e.get('date', ''), e.get('country', ''),
              e.get('value', 0), e.get('currency', 'EUR'), e.get('euroValue', 0),
              e.get('receiptUrl')))
        conn.commit()
    return jsonify({"status": "ok"})


@bp.route("/api/expenses/<expense_id>", methods=["DELETE"])
@require_auth
@retry_on_lock()
def delete_expense(expense_id):
    """Delete a single expense by ID. Caller from JWT, not body.

    Idempotent: always returns 200 `{"status": "deleted"}` whether the
    row was present, absent, or visible-but-not-yours. Pre-2026-05-18
    the route returned 200 for absent and 403 for "exists but you
    can't touch it" — an attacker could probe whether a guessed
    expense_id existed by status-code differential. Now both shapes
    collapse to the same idempotent 200 so the route stops being an
    enumeration oracle. Permission still enforced server-side; we
    just don't leak the existence to the caller."""
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT trip_id FROM expenses WHERE id = ?", (expense_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"status": "deleted"})  # idempotent (truly absent)
        bind_trip_context(row["trip_id"])
        if not can_edit_expenses(cursor, row["trip_id"], user_id):
            # Caller doesn't have edit rights — return the same shape as
            # the truly-absent case so an attacker can't tell the two
            # apart from the response. Log internally so legitimate
            # permission failures still surface in observability.
            try:
                import logging
                logging.getLogger(__name__).info(
                    "delete_expense denied (no edit rights)",
                    extra={
                        "user_id": user_id,
                        "expense_id": expense_id,
                        "trip_id": row["trip_id"],
                    },
                )
            except Exception:
                pass
            return jsonify({"status": "deleted"})
        cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
    return jsonify({"status": "deleted"})
