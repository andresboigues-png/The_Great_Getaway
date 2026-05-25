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
    # 2026-05-25 (audit B2): the frontend's "All trips" option carries
    # tripId='all'. Writing 'all' to budgets.trip_id triggers a FK
    # constraint failure (trips.id has no 'all' row) and SQLite raises
    # IntegrityError → 500 on save. Coerce the sentinel + empty values
    # to NULL so the FK accepts the row (ON DELETE SET NULL is already
    # the declared behaviour).
    raw_trip_id = b.get('tripId')
    trip_id = raw_trip_id if (raw_trip_id and raw_trip_id != 'all') else None
    # 2026-05-25 (audit B1): the frontend ships 4 more fields that the
    # schema now persists. Coerce the "all"/"" sentinels for categoryId
    # and user to NULL so we can ORDER and group cleanly on the read
    # side without special-casing the strings.
    raw_cat = b.get('categoryId')
    category_id = raw_cat if (raw_cat and raw_cat != 'all') else None
    raw_owner = b.get('user')
    owner_name = raw_owner if (raw_owner and raw_owner != 'all') else None
    # original_amount / original_currency carry the user-typed value
    # before the frontend's currency conversion. Default to the
    # canonical amount/currency if not explicitly sent — covers older
    # clients that don't know about these fields.
    original_amount = b.get('originalAmount')
    if original_amount is None:
        original_amount = b.get('amount', 0)
    original_currency = b.get('originalCurrency') or b.get('currency', 'EUR')
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO budgets (id, user_id, trip_id, label, amount, currency,
                                 category_id, owner_name, original_amount, original_currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                label=excluded.label,
                amount=excluded.amount,
                currency=excluded.currency,
                trip_id=excluded.trip_id,
                category_id=excluded.category_id,
                owner_name=excluded.owner_name,
                original_amount=excluded.original_amount,
                original_currency=excluded.original_currency
        ''', (b['id'], user_id, trip_id, b.get('label', ''),
              b.get('amount', 0), b.get('currency', 'EUR'),
              category_id, owner_name, original_amount, original_currency))
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
