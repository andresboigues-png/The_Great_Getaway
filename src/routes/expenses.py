"""/api/expenses — single-row upsert + delete.

Permission gate: Planner OR Budgeteer can write (Relaxers blocked).
The Budgeteer role exists so one trip member can handle the trip's
money without also being able to rename the trip or change the
itinerary.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from fx_rates import compute_euro_value
from helpers import can_edit_expenses, is_trip_archived_for
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
@limiter.limit("120/minute")
@require_auth
@retry_on_lock()
def upsert_expense():
    """Create or update a single expense."""
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
        # R3-Round 2 fix: reject zero-value expenses. The validator
        # default `allow_zero=True` accepts them globally (kept for
        # legacy paths) but a zero expense renders as a ghost row in
        # History, shows up in feed events, and confuses balance math
        # users. Server enforces the same `> 0` invariant the
        # ManualTab form already had client-side.
        value = validate_money(e.get("value", 0), field_name="value", allow_zero=False)
        currency = validate_currency(e.get("currency"))
        # R3-Fix #6: derive euro_value server-side from the live FX
        # cache. Pre-fix the client euroValue was stored verbatim —
        # a buggy or malicious client posting
        # `{value:1, currency:"JPY", euroValue:1000000}` had that
        # number flow into balance math, achievements, PDF totals,
        # Insights aggregates forever. `compute_euro_value` overrides
        # the client value when a live rate exists; falls back to
        # the client's hint only on the cold path (no rate available,
        # Frankfurter down + uncommon code).
        client_euro_value = validate_money(
            e.get("euroValue", 0), field_name="euroValue",
        )
        euro_value = compute_euro_value(
            value, currency, client_euro_value=client_euro_value,
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

    # Audit fix: validate the splits map shape before hitting the DB.
    # Must be a dict of `str → number in [0, 100]`. Non-dict values
    # (lists, strings), out-of-range percentages, and NaN/Inf are all
    # rejected with 400 rather than silently coerced. `None` and
    # missing keep the legacy equal-share fallback.
    splits_raw = e.get('splits')
    if splits_raw is not None and splits_raw != "":
        if not isinstance(splits_raw, dict):
            return jsonify({"error": "splits must be an object"}), 400
        for k, v in splits_raw.items():
            if not isinstance(k, str) or not k.strip():
                return jsonify({"error": "split keys must be non-empty strings"}), 400
            try:
                pct = float(v)
            except (TypeError, ValueError):
                return jsonify({"error": "split values must be numeric"}), 400
            if pct != pct or pct in (float("inf"), float("-inf")):
                return jsonify({"error": "split values must be finite"}), 400
            if pct < 0 or pct > 100:
                return jsonify({"error": "split values must be in [0, 100]"}), 400

    with get_db() as conn:
        cursor = conn.cursor()
        # R2 audit fix: IDOR via claimed-tripId. /api/sync's active expense
        # loop (data.py) was hardened to look up the EXISTING row's
        # trip_id and gate the permission check on THAT — but the
        # single-row /api/expenses POST kept gating on the client-claimed
        # tripId. Planner-on-trip-A could POST {id: <expense-in-trip-B>,
        # tripId: <A>} and the ON CONFLICT UPDATE would rewrite trip-B's
        # expense fields (the SET clause doesn't touch trip_id, but
        # who/value/currency/euro_value/etc. all overwrite). Mirror the
        # sync pattern: SELECT the existing trip_id first, prefer that
        # for the permission check on UPDATEs; INSERTs (no existing row)
        # gate on the claimed trip as before.
        cursor.execute(
            "SELECT trip_id FROM expenses WHERE id = ?", (expense_id,),
        )
        existing = cursor.fetchone()
        gate_trip_id = existing["trip_id"] if existing else claimed_trip_id
        if not can_edit_expenses(cursor, gate_trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # R3-Fix #18: refuse writes to a trip the caller has archived
        # for themselves. The /api/sync bulk path is exempt (it's the
        # catch-up channel for archived state from a freshly-installed
        # device); only the per-row /api/expenses POST consults this.
        if is_trip_archived_for(cursor, gate_trip_id, user_id):
            return jsonify({
                "error": "Trip is archived — unarchive to edit",
            }), 409
        # 2026-05-25 (audit S1): splits + isSettlement are now persisted.
        # `splits` may arrive as a dict (the frontend's shape) — serialise
        # to JSON for storage. None / missing = legacy equal-share fallback.
        if isinstance(splits_raw, dict) and splits_raw:
            import json as _json
            splits_json = _json.dumps(splits_raw)
        else:
            splits_json = None
        is_settlement = 1 if e.get('isSettlement') else 0
        # 2026-05-26 (audit SY5): the ON CONFLICT UPDATE clause now gates
        # on `expenses.deleted_at IS NULL` so a queued resurrection from
        # an offline device can't undo a tombstone. For a tombstoned row
        # the clause becomes a no-op — the existing soft-deleted row
        # stays exactly as it was, no stale data leaks back in. New
        # inserts (no conflict) are unaffected: they create a fresh row
        # with deleted_at = NULL.
        cursor.execute('''
            INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url, splits, is_settlement)
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
                splits=excluded.splits,
                is_settlement=excluded.is_settlement
            WHERE expenses.deleted_at IS NULL
        ''', (expense_id, claimed_trip_id, who, category_id,
              label, date, country,
              value, currency, euro_value,
              receipt_url, splits_json, is_settlement))
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
        # 2026-05-26 (audit SY5): we now look up `deleted_at` alongside
        # `trip_id` so a re-delete of an already-tombstoned row stays a
        # no-op (no UPDATE fires, the existing tombstone timestamp
        # stands). Filter tombstoned rows out of "exists?" branch so
        # the absent-vs-permissionless oracle equality is preserved.
        cursor.execute(
            "SELECT trip_id, deleted_at FROM expenses WHERE id = ?",
            (expense_id,),
        )
        row = cursor.fetchone()
        if not row or row["deleted_at"] is not None:
            return jsonify({"status": "deleted"})  # idempotent (absent or already tombstoned)
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
        # 2026-05-26 (audit SY5): soft-delete via tombstone. A hard
        # DELETE used to be reversible from any peer device whose
        # offline queue still had the row — the next /api/sync POST
        # would re-INSERT it. Now we stamp deleted_at; the ON CONFLICT
        # UPDATE clause on the upsert paths skips tombstoned rows so
        # the resurrection is silently dropped. The /api/data response
        # filters out tombstoned rows so the row stays gone everywhere.
        cursor.execute(
            "UPDATE expenses SET deleted_at = CURRENT_TIMESTAMP "
            "WHERE id = ? AND deleted_at IS NULL",
            (expense_id,),
        )
        conn.commit()
    return jsonify({"status": "deleted"})
