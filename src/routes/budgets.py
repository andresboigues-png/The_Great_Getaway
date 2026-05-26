"""/api/budgets — personal budget upsert + delete.

Budgets are per-user (not per-trip-membership), so the gate is
"caller owns this budget row" — the audit fix replaced the previous
"delete by id alone" path that let any caller wipe anyone's budget
just by guessing an id.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from validators import (
    ValidationError,
    clean_text,
    validate_currency,
    validate_money,
)


bp = Blueprint("budgets", __name__)


@bp.route("/api/budgets", methods=["POST"])
@require_auth
@retry_on_lock()
def upsert_budget():
    """Create or update a single budget.

    Audit fix (2026-05-26): IDOR via ON CONFLICT(id) DO UPDATE without
    a user_id check. Pre-fix, ANY authenticated user could POST
    `{budget: {id: <victim_budget_id>, label: "$$$", amount: 1, …}}`
    and the UPDATE path would rewrite the victim's budget — the user_id
    column was preserved (not in SET) but every other field was
    attacker-controlled. Now we SELECT the existing row first and 403
    if it doesn't belong to the caller; the INSERT path stamps the
    caller's user_id as before.
    """
    data = request.json or {}
    user_id = current_user_id()
    b = data.get("budget")
    if not b:
        return jsonify({"error": "Missing data"}), 400
    budget_id = b.get("id")
    if not budget_id:
        return jsonify({"error": "Missing budget id"}), 400

    # Audit fix (2026-05-26): server-side validation. amount is the
    # main vector — NaN/Inf/negative all flowed through pre-fix.
    try:
        amount = validate_money(b.get("amount", 0), field_name="amount")
        currency = validate_currency(b.get("currency"))
        label = clean_text(
            b.get("label", ""), max_len=120, allow_newlines=False,
            field_name="label",
        )
    except ValidationError as ve:
        return jsonify({"error": str(ve)}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        existing = cursor.execute(
            "SELECT user_id FROM budgets WHERE id = ?", (budget_id,),
        ).fetchone()
        if existing and existing["user_id"] != user_id:
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute('''
            INSERT INTO budgets (id, user_id, trip_id, label, amount, currency)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                label=excluded.label,
                amount=excluded.amount,
                currency=excluded.currency,
                trip_id=excluded.trip_id
        ''', (budget_id, user_id, b.get('tripId'), label,
              amount, currency))
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
