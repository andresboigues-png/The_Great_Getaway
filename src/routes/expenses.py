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
from helpers import can_edit_expenses, is_trip_archived_for
from observability import bind_trip_context
from services.expense_writes import PER_ROW, apply_expense_upsert

bp = Blueprint("expenses", __name__)


@bp.route("/api/expenses", methods=["POST"])
@limiter.limit("120/minute")
@require_auth
@retry_on_lock()
def upsert_expense():
    """Create or update a single expense."""
    data = request.json or {}
    # BUG-22 (MK2 audit): guard non-dict bodies (a JSON array root, or
    # `expense` being a string/list) so malformed input is a clean 400 instead
    # of an uncaught AttributeError → 500 that pollutes error monitoring.
    if not isinstance(data, dict):
        return jsonify({"error": "Malformed payload"}), 400
    user_id = current_user_id()
    e = data.get("expense")
    if not isinstance(e, dict):
        return jsonify({"error": "Missing data"}), 400
    expense_id = e.get("id")
    if not expense_id:
        return jsonify({"error": "Missing expense id"}), 400
    claimed_trip_id = e.get("tripId")
    if not claimed_trip_id:
        return jsonify({"error": "Missing trip id"}), 400
    bind_trip_context(claimed_trip_id)

    # MK1 Wave B (T1-1): validation, IDOR-safe gating, euro_value freeze,
    # C1 no-rate gate, archived-trip 409, tombstone guard, and the R8-B4
    # atomic concurrency gate ALL live in services/expense_writes.py now —
    # ONE implementation shared with /api/sync's two bulk loops. This
    # route keeps only payload shape guards + HTTP mapping. Full audit
    # provenance for every rule is in the service module.
    with get_db() as conn:
        cursor = conn.cursor()
        result = apply_expense_upsert(
            cursor,
            user_id,
            e,
            claimed_trip_id=claimed_trip_id,
            can_write=lambda trip_id: can_edit_expenses(cursor, trip_id, user_id),
            policy=PER_ROW,
        )
        if not result.ok:
            payload = {"error": result.error}
            if result.extra:
                payload.update(result.extra)
            return jsonify(payload), result.status
        conn.commit()
    # Integration audit C2: echo the server-FROZEN euro_value back so the
    # client reconciles immediately instead of waiting for the next poll;
    # updatedAt closes the read-modify-write concurrency cycle.
    return jsonify(
        {
            "status": "ok",
            "updatedAt": result.updated_at,
            "euroValue": result.euro_value,
        }
    )


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
        # MK6 P2: refuse deletes on a trip the caller has archived, mirroring
        # the create path (line ~192) and the settlement DELETE gate. Without
        # this, deleting an expense from an already-settled, archived trip
        # silently shifts total_spend + everyone's settled balances after the
        # fact. Safe to 409 here (not leak-y): the caller already passed
        # can_edit_expenses, so they know the trip exists and is theirs.
        if is_trip_archived_for(cursor, row["trip_id"], user_id):
            return jsonify(
                {
                    "error": "Trip is archived — unarchive to edit",
                }
            ), 409
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
