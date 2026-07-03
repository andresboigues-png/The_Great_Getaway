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
from fx_rates import compute_euro_value, get_rate_eur
from helpers import can_edit_expenses, is_trip_archived_for
from observability import bind_trip_context
from validators import (
    ValidationError,
    clean_text,
    validate_currency,
    validate_date,
    validate_money,
    validate_splits,
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
        # BUG-8: strict YYYY-MM-DD (or empty) — a garbage date silently
        # corrupts Insights (avg-daily, timeline, historical-FX URL).
        date = validate_date(e.get("date", ""))
        receipt_url = validate_upload_url(
            e.get("receiptUrl"), user_id=user_id,
            field_name="receiptUrl", allow_empty=True,
        )
        # R10-B6a F2: shape-check splits via the shared helper. Pre-fix
        # the validation lived inline here AND was missing entirely
        # from /api/sync's bulk loops (data.py). The helper lives in
        # validators.py now so both write paths enforce the same
        # `{str → number in [0,100]}` contract.
        #
        # BUG-37 (MK2 audit): require_full enforces that the percentages
        # add up to ~100 on this single-write path — rejecting all-zero
        # splits (which made the expense vanish from per-person balances)
        # and other malformed sums at the source with a clean 400. The
        # bulk /api/sync path stays lenient (no require_full) to avoid
        # dropping odd-but-nonzero legacy splits on its delete+reinsert.
        splits_clean = validate_splits(e.get('splits'), require_full=True)
    except ValidationError as ve:
        return jsonify({"error": str(ve)}), 400

    # Integration audit C1: the "euroValue required for a non-EUR currency we
    # can't convert" gate lives BELOW now (after the existing-row SELECT), so a
    # metadata-only edit that reuses the frozen euro_value is exempt (MK6
    # quality: it was a false 400 for the API / CSV-import / legacy paths).
    # `splits_raw` retained below as the source-of-truth dict to
    # serialise (helper returns it normalised; identical keys/values
    # for the legitimate path, just with garbage rejected upstream).
    splits_raw = splits_clean

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
            "SELECT trip_id, value, currency, euro_value FROM expenses WHERE id = ?",
            (expense_id,),
        )
        existing = cursor.fetchone()
        gate_trip_id = existing["trip_id"] if existing else claimed_trip_id
        if not can_edit_expenses(cursor, gate_trip_id, user_id):
            return jsonify({"error": "Forbidden"}), 403
        # Integration audit MM-1/MM-5: preserve the FROZEN euro_value on an edit
        # that doesn't change the money (value + currency unchanged). On a NEW
        # write (or a changed amount/currency) compute_euro_value stamps at
        # TODAY's rate and IGNORES the client euroValue — that's the R3-Fix-#6
        # anti-tamper rule, and it's correct there. But re-stamping an unchanged
        # months-old foreign expense on a label-only edit silently drifts every
        # balance / budget / Insight as FX moves. Reuse the row's OWN stored
        # euro_value (server-trusted, so no tamper window), regardless of
        # currency — which also stops a no-rate row's euroValue being mutated
        # by an edit that leaves value+currency alone (MM-5).
        money_unchanged = bool(
            existing
            and abs((existing["value"] or 0) - value) < 1e-9
            and (existing["currency"] or "").upper() == currency.upper()
        )
        if money_unchanged:
            euro_value = existing["euro_value"]
        # Integration audit C1 (moved here for MK6 quality): refuse to store a
        # bogus euro_value for a non-EUR currency we can't convert — a currency
        # with no live Frankfurter rate (VND, EGP, ARS…) would otherwise freeze
        # euro_value to 0 / the raw foreign amount, read three inconsistent ways
        # downstream. Require a live rate OR an explicit positive client
        # euroValue. But SKIP the gate when money is unchanged: that path reuses
        # the stored (already-real) euro_value above, so demanding a client
        # conversion the server discards was a false 400 on a label-only edit.
        elif (
            currency != "EUR"
            and get_rate_eur(currency) is None
            and not (client_euro_value and client_euro_value > 0)
        ):
            return jsonify({
                "error": (
                    "euroValue is required for this currency — no live exchange "
                    "rate is available to convert it."
                ),
                "currency": currency,
            }), 400
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
        # R3-Round 4 fix: optimistic-concurrency gate. The client
        # ships `clientUpdatedAt` (the timestamp it last saw for this
        # row); if it doesn't match the stored `updated_at`, another
        # device wrote in the interim and we 409 with the fresh row
        # attached so the client can re-render and let the user
        # retry. Pre-fix two tabs editing the same expense
        # last-write-wins — silent overwrite. The check only fires on
        # UPDATE (existing row); INSERTs (new id) bypass it. Client
        # can opt out by omitting `clientUpdatedAt` — that's the
        # legacy path + the /api/sync bulk channel.
        #
        # R8-B4 atomicity: the staleness check now lives INSIDE the
        # ON CONFLICT DO UPDATE's WHERE clause below — Python
        # SELECT-then-compare was TOCTOU-racy under parallel writes.
        # Tombstone disambiguation is handled by the existing
        # `expenses.deleted_at IS NULL` filter (same WHERE clause);
        # the rowcount==0 path below differentiates "stale" from
        # "tombstoned" by re-reading the live row's deleted_at.
        client_updated_at = e.get('clientUpdatedAt')
        # 2026-05-26 (audit SY5): the ON CONFLICT UPDATE clause now gates
        # on `expenses.deleted_at IS NULL` so a queued resurrection from
        # an offline device can't undo a tombstone. For a tombstoned row
        # the clause becomes a no-op — the existing soft-deleted row
        # stays exactly as it was, no stale data leaks back in. New
        # inserts (no conflict) are unaffected: they create a fresh row
        # with deleted_at = NULL.
        # R3-Round 4: stamp updated_at at MILLISECOND resolution
        # via strftime so two rapid writes in the same wall-clock
        # second produce distinct values. Plain CURRENT_TIMESTAMP
        # is 1-second precision in SQLite — two test writes ran
        # back-to-back collapse to the same string, breaking the
        # stale-detection 409. Real-world human edits are spaced
        # by far more than a millisecond, but the test exposes
        # the gap.
        cursor.execute('''
            INSERT INTO expenses (id, trip_id, who, category_id, label, date, country, value, currency, euro_value, receipt_url, splits, is_settlement, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
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
                is_settlement=excluded.is_settlement,
                updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
            WHERE expenses.deleted_at IS NULL
              -- R8-B4 atomic staleness gate. See trips.py upsert
              -- for the full rationale. Two parallel writes both
              -- carrying clientUpdatedAt=T0: the first stamps T1,
              -- the second's WHERE no longer matches → rowcount=0
              -- → 409 below.
              AND (? IS NULL
                   OR expenses.updated_at IS NULL
                   OR expenses.updated_at = ?)
        ''', (expense_id, claimed_trip_id, who, category_id,
              label, date, country,
              value, currency, euro_value,
              receipt_url, splits_json, is_settlement,
              client_updated_at, client_updated_at))
        # R8-B4: existing + rowcount==0 means EITHER the row was
        # tombstoned (deleted_at != NULL) OR the staleness gate
        # filtered the UPDATE. INSERTs always return rowcount=1.
        if existing and cursor.rowcount == 0:
            cursor.execute(
                "SELECT * FROM expenses WHERE id = ?", (expense_id,),
            )
            live = cursor.fetchone()
            if live and not live['deleted_at']:
                # Live row exists and isn't tombstoned → staleness
                # gate fired. Return 409 with the live row.
                return jsonify({
                    "error": "Stale edit — another device updated this expense",
                    "current": dict(live),
                }), 409
            # Else: row is tombstoned. Pre-R8-B4 the deleted_at gate
            # was a silent no-op for the legitimate case (a queued
            # resurrection from an offline device for a row another
            # device deleted). Preserve that semantic — fall through
            # to the success response with the row's now-tombstoned
            # stamp (which is unchanged from the SELECT above).
        # Read back the freshly-stamped updated_at so the client can
        # store it for the next edit (closes the read-modify-write
        # cycle).
        cursor.execute(
            "SELECT updated_at FROM expenses WHERE id = ?", (expense_id,),
        )
        new_row = cursor.fetchone()
        new_updated_at = new_row['updated_at'] if new_row else None
        conn.commit()
    # Integration audit C2: echo the server-FROZEN euro_value back. Pre-fix
    # the response carried only {status, updatedAt}, so after saving a
    # foreign-currency expense the client kept showing its own (static-table)
    # estimate until the next /api/data poll overwrote it. Returning the
    # canonical value lets the caller reconcile immediately.
    return jsonify({
        "status": "ok",
        "updatedAt": new_updated_at,
        "euroValue": euro_value,
    })


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
            return jsonify({
                "error": "Trip is archived — unarchive to edit",
            }), 409
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
