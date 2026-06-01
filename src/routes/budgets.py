"""/api/budgets — personal budget upsert + delete.

Budgets are per-user (not per-trip-membership), so the gate is
"caller owns this budget row" — the audit fix replaced the previous
"delete by id alone" path that let any caller wipe anyone's budget
just by guessing an id.
"""

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from helpers import can_edit_expenses, is_trip_archived_for
from validators import (
    ValidationError,
    clean_text,
    validate_currency,
    validate_money,
)


bp = Blueprint("budgets", __name__)


@bp.route("/api/budgets", methods=["POST"])
@limiter.limit("60 per minute")
@require_auth
@retry_on_lock()
def upsert_budget():
    """Create or update a single budget."""
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
    #
    # R2 audit fix: validate them too. Pre-fix they flowed through
    # unvalidated → "NaN USD" / arbitrary strings could land in the
    # column and render in the "was X" badge.
    raw_original = b.get('originalAmount')
    if raw_original is None:
        original_amount = amount
    else:
        try:
            original_amount = validate_money(raw_original, field_name="originalAmount")
        except ValidationError as ve:
            return jsonify({"error": str(ve)}), 400
    raw_original_curr = b.get('originalCurrency')
    if raw_original_curr:
        try:
            original_currency = validate_currency(raw_original_curr)
        except ValidationError as ve:
            return jsonify({"error": str(ve)}), 400
    else:
        original_currency = currency

    with get_db() as conn:
        cursor = conn.cursor()
        # R3-Fix #2: pre-fix this was a bare `ON CONFLICT(id) DO UPDATE`
        # with no user_id ownership gate, and the SET clause didn't
        # include user_id either — so a malicious caller posting
        # `{budget:{id:"<victim_budget_id>", amount:0, ...}}` would
        # overwrite the victim's budget row in place. The row stayed
        # under the victim's user_id but every other field got
        # rewritten. Same anti-pattern R1 Fix #2 caught in 4 endpoints —
        # this one was missed because budgets.py was added later.
        #
        # Fix: SELECT existing row first; if present and belongs to
        # someone else, refuse. The "new row" path is unaffected (no
        # existing owner to clash with).
        cursor.execute(
            "SELECT user_id, updated_at FROM budgets WHERE id = ?",
            (budget_id,),
        )
        existing = cursor.fetchone()
        if existing and existing["user_id"] != user_id:
            # Don't reveal whether the id exists for a different user
            # vs not at all — 403 collapsed to 404 keeps the anti-
            # enumeration posture consistent with /api/expenses etc.
            return jsonify({"error": "Not found"}), 404
        # BUG-34 + BUG-36 (MK2 audit): a TRIP-SCOPED budget requires the
        # caller to be a member of that trip with money-edit rights
        # (planner or budgeteer). Pre-fix the only gate was
        # "don't overwrite someone else's row", so (BUG-34) a RELAXER
        # could create/edit budgets their role shouldn't touch, and
        # (BUG-36) a NON-MEMBER could attach a budget to any trip_id they
        # could guess. can_edit_expenses returns False for both (a
        # non-member's role is None; a relaxer is excluded). Global
        # ("all trips") budgets carry trip_id=None and stay ungated —
        # they're the caller's own personal budget, not tied to a trip.
        if trip_id and not can_edit_expenses(cursor, trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # R3-Fix #18: archive write gate. Only enforced when the
        # budget is trip-scoped — global ("all trips") budgets aren't
        # tied to a single trip lifecycle.
        if trip_id and is_trip_archived_for(cursor, trip_id, user_id):
            return jsonify({
                "error": "Trip is archived — unarchive to edit",
            }), 409
        # 4.8 audit MONEY-1: enforce one budget per
        # (user_id, trip_id, category_id, owner_name) scope, regardless
        # of NULLs. SQLite's UNIQUE treats NULL as DISTINCT, so the table
        # constraint + the all-NULL partial index miss the half-scoped
        # shapes — `(category set, owner NULL)` and `(owner set, category
        # NULL)` could be duplicated with a fresh id, and `spentForBudget`
        # then counted the same expenses under each card (fake overspend).
        # A NULL-safe `IS` comparison covers every NULL pattern uniformly
        # (including trip_id NULL, which can't use a sentinel — it's an FK
        # column). Editing a row (same id) is excluded so legitimate edits
        # don't false-positive. This also turns the fully-scoped duplicate
        # case (MONEY-2) into a clean 409 instead of a 500.
        cursor.execute(
            "SELECT id FROM budgets WHERE user_id = ? "
            "AND trip_id IS ? AND category_id IS ? AND owner_name IS ? "
            "AND id != ?",
            (user_id, trip_id, category_id, owner_name, budget_id),
        )
        scope_dup = cursor.fetchone()
        if scope_dup:
            return jsonify({
                "error": "A budget with this scope already exists",
                "existingId": scope_dup["id"],
            }), 409
        # R3-Round 5: optimistic-concurrency gate. R8-B4 atomicity:
        # the staleness check now lives INSIDE the ON CONFLICT
        # UPDATE's WHERE clause below. See trips.py / expenses.py
        # for the full TOCTOU rationale.
        client_updated_at = b.get('clientUpdatedAt')
        import sqlite3 as _sqlite3
        try:
            cursor.execute('''
            INSERT INTO budgets (id, user_id, trip_id, label, amount, currency,
                                 category_id, owner_name, original_amount, original_currency, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
            ON CONFLICT(id) DO UPDATE SET
                label=excluded.label,
                amount=excluded.amount,
                currency=excluded.currency,
                trip_id=excluded.trip_id,
                category_id=excluded.category_id,
                owner_name=excluded.owner_name,
                original_amount=excluded.original_amount,
                original_currency=excluded.original_currency,
                updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
            WHERE budgets.user_id = ?
              -- R8-B4 atomic staleness gate. See trips.py for the
              -- full rationale; same pattern.
              AND (? IS NULL
                   OR budgets.updated_at IS NULL
                   OR budgets.updated_at = ?)
        ''', (budget_id, user_id, trip_id, label,
              amount, currency,
              category_id, owner_name, original_amount, original_currency,
              user_id, client_updated_at, client_updated_at))
        except _sqlite3.IntegrityError:
            # 4.8 audit MONEY-2: a fully-scoped duplicate that slips past
            # the pre-check under a rare concurrent race hits the base
            # UNIQUE(user_id, trip_id, category_id, owner_name). Return a
            # clean 409 instead of the unhandled 500 (retry_on_lock only
            # catches OperationalError, not IntegrityError).
            return jsonify({"error": "A budget with this scope already exists"}), 409
        # R8-B4: existing + rowcount==0 = stale or IDOR (user_id
        # mismatch). The IDOR case was already pre-blocked by the
        # SELECT above (we return 403 before reaching here when
        # existing.user_id != user_id), so rowcount==0 here can
        # only be staleness.
        if existing and cursor.rowcount == 0:
            cursor.execute(
                "SELECT * FROM budgets WHERE id = ?", (budget_id,),
            )
            live = cursor.fetchone()
            return jsonify({
                "error": "Stale edit — another device updated this budget",
                "current": dict(live) if live else None,
            }), 409
        cursor.execute(
            "SELECT updated_at FROM budgets WHERE id = ?", (budget_id,),
        )
        new_row = cursor.fetchone()
        new_updated_at = new_row['updated_at'] if new_row else None
        conn.commit()
    return jsonify({"status": "ok", "updatedAt": new_updated_at})


@bp.route("/api/budgets/<budget_id>", methods=["DELETE"])
@limiter.limit("30 per minute")
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
