"""/api/expenses — single-row upsert + delete.

Permission gate: Planner OR Budgeteer can write (Relaxers blocked).
The Budgeteer role exists so one trip member can handle the trip's
money without also being able to rename the trip or change the
itinerary.
"""

import json

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from helpers import can_edit_expenses
from observability import bind_trip_context
from validators import (
    ValidationError,
    clean_text,
    validate_currency,
    validate_money,
    validate_upload_url,
)


bp = Blueprint("expenses", __name__)


@bp.route("/api/expenses", methods=["POST"])
@require_auth
@retry_on_lock()
def upsert_expense():
    """Create or update a single expense.

    Audit fix (2026-05-26): IDOR via ON CONFLICT(id) DO UPDATE. The
    permission gate must check the EXISTING row's trip_id on UPDATE,
    not the request-supplied one — otherwise an attacker who is a
    planner of trip A could POST `{id: <victim_expense_in_trip_B>,
    tripId: <trip_A>, …}` and the UPDATE would rewrite the victim's
    expense (who/label/value/etc.) because the gate only sees the
    claimed tripId. Same shape as the /api/sync §0.5 fix in data.py:
    SELECT the existing trip_id first; on UPDATE check against that;
    on INSERT (no existing row) check against the claimed tripId.
    """
    data = request.json or {}
    user_id = current_user_id()
    e = data.get("expense")
    if not e:
        return jsonify({"error": "Missing data"}), 400
    expense_id = e.get("id")
    if not expense_id:
        return jsonify({"error": "Missing expense id"}), 400
    claimed_trip_id = e.get("tripId")
    if not claimed_trip_id:
        return jsonify({"error": "Missing trip id"}), 400
    bind_trip_context(claimed_trip_id)

    # Audit fix (2026-05-26): server-side validation of money + free-text
    # fields. Pre-fix the route forwarded `value`, `currency`, `who`,
    # `label`, `receiptUrl` etc. verbatim — accepting NaN/Infinity,
    # unknown currencies, 10 MB labels, and `receiptUrl` pointing at
    # other users' uploads. Now every field is cleaned/range-checked,
    # and failures collapse to 400.
    try:
        value = validate_money(e.get("value", 0), field_name="value")
        currency = validate_currency(e.get("currency"))
        euro_value = validate_money(
            e.get("euroValue", 0), field_name="euroValue",
        )
        label = clean_text(
            e.get("label", ""), max_len=200, allow_newlines=False,
            field_name="label",
        )
        who = clean_text(
            e.get("who", ""), max_len=200, allow_newlines=False,
            field_name="who",
        )
        country = clean_text(
            e.get("country", ""), max_len=120, allow_newlines=False,
            field_name="country",
        )
        category_id = clean_text(
            e.get("categoryId", ""), max_len=120, allow_newlines=False,
            field_name="categoryId",
        )
        date = clean_text(
            e.get("date", ""), max_len=32, allow_newlines=False,
            field_name="date",
        )
        receipt_url = validate_upload_url(
            e.get("receiptUrl"), user_id=user_id,
            field_name="receiptUrl", allow_empty=True,
        )
    except ValidationError as ve:
        return jsonify({"error": str(ve)}), 400

    # Audit fix (2026-05-26): persist `splits` + `isSettlement`.
    # `splits` is a {payerName: percentage} dict the frontend uses
    # to drive ALL balance math. Validate shape (dict of str→number
    # in [0, 100]); reject anything that wouldn't round-trip cleanly.
    splits_raw = e.get("splits")
    splits_payload = None
    if splits_raw is not None:
        if not isinstance(splits_raw, dict):
            return jsonify({"error": "splits must be an object"}), 400
        validated_splits = {}
        for key, val in splits_raw.items():
            if not isinstance(key, str) or not key.strip():
                continue  # Skip malformed keys (matches frontend tolerance).
            try:
                pct = float(val)
            except (TypeError, ValueError):
                return jsonify({"error": f"splits[{key}] must be a number"}), 400
            # Allow a small tolerance (-0.001 / 100.001) so floating
            # point round-trips don't trip the bounds.
            if pct < -0.001 or pct > 100.001:
                return jsonify({"error": f"splits[{key}] must be between 0 and 100"}), 400
            validated_splits[key.strip()] = pct
        splits_payload = json.dumps(validated_splits) if validated_splits else None
    is_settlement = 1 if e.get("isSettlement") else 0

    with get_db() as conn:
        cursor = conn.cursor()
        existing = cursor.execute(
            "SELECT trip_id FROM expenses WHERE id = ?", (expense_id,),
        ).fetchone()
        gate_trip_id = existing["trip_id"] if existing else claimed_trip_id
        if not can_edit_expenses(cursor, gate_trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        cursor.execute('''
            INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url, splits_json, is_settlement)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                who=excluded.who,
                category_id=excluded.category_id,
                label=excluded.label,
                date=excluded.date,
                country=excluded.country,
                value=excluded.value,
                currency=excluded.currency,
                euro_value=excluded.euro_value,
                receipt_url=excluded.receipt_url,
                splits_json=COALESCE(excluded.splits_json, splits_json),
                is_settlement=excluded.is_settlement
        ''', (expense_id, claimed_trip_id, who, category_id,
              label, date, country,
              value, currency, euro_value,
              receipt_url, splits_payload, is_settlement))
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
            # Caller doesn't have edit rights — return the same shape
            # as the truly-absent case so an attacker can't tell the
            # two apart from the response.
            #
            # 2026-05-18 audit M7: the prior implementation also ran a
            # logger.info on this branch — the absent branch above did
            # not. That asymmetric work was a (small) timing oracle:
            # an attacker measuring response latency could distinguish
            # "expense exists but not yours" from "expense doesn't
            # exist", confirming the existence of an enumerated id.
            # Dropping the log evens out the work; legitimate
            # permission-failure visibility comes from the generic
            # request logger (every request logs status + path) so
            # we haven't lost observability — just specificity.
            return jsonify({"status": "deleted"})
        cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
        conn.commit()
    return jsonify({"status": "deleted"})
