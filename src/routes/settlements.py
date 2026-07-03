"""Settle Up — FIXING_ROADMAP §4.5.

Closes the expense loop: once the balance page shows "Sara owes Andrés
€45", either party can record the payment with `POST /api/settlements`
and the row gets subtracted from the displayed balances. Without this,
users had to leave TGG (or just pretend the debt was paid) and the app
forgot.

Surface:
  POST   /api/settlements              — record a payment
  GET    /api/settlements/<trip_id>    — list payments for a trip
  DELETE /api/settlements/<id>         — undo (creator or trip owner)

Permission model:
  - A PARTY to the settlement (the payer or recipient) of ANY role can
    RECORD it — incl. a relaxer logging a payment they made or received.
    A NON-party may record only if they are a trip planner/owner (logging
    on others' behalf). Audit MK5 BUG-054: this replaced the old "any
    accepted member incl. relaxer" gate, which let a non-party relaxer
    fabricate a settlement between two OTHER members and shift everyone's
    shared balance graph.
  - The recorded `from_user_id` and `to_user_id` must both be accepted
    members of the trip (no logging payments to/from strangers).
  - Only the creator or the trip OWNER can delete a settlement. The
    recipient cannot — that would let someone silently "un-receive"
    money the payer thinks they sent.

Cross-cutting bits:
  - Drops a `settled_up` feed event (consumed by the feed registry
    in routes/feed.py — visible only to the two parties, not their
    friends; settlement amounts stay private).
  - Fires a notification to the recipient ("Sara paid you €45 for
    Lisbon trip") so the payee sees the row appear on their next
    /api/notifications poll.
"""

import math
import secrets

from flask import Blueprint, jsonify

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from fx_rates import compute_euro_value, get_rate_eur
from helpers import is_trip_archived_for, json_body, trip_member_role
from observability import bind_trip_context, get_logger, log_extra
from validators import (
    ValidationError,
    clean_text,
    validate_currency,
)

bp = Blueprint("settlements", __name__)
logger = get_logger(__name__)


# Allowed methods. Free-form `note` covers the long tail; this list
# just powers the modal's quick-picks. Stored verbatim, so 'custom'
# is fine when the note carries the actual method ("Cash via Andre
# at the airport").
_ALLOWED_METHODS = {"cash", "revolut", "bank_transfer", "wise", "paypal", "custom"}

# Integration audit B3: a settlement on a trip with NO recorded expenses
# can't be grounded against any debt, so we still allow it (off-app cash
# debts logged after the fact). But it must stay below this generous
# absolute ceiling — far above any plausible single trip debt, far below a
# fat-finger that would poison the cross-trip Global tab + Insights.
_ZERO_SPEND_SETTLEMENT_SANITY_EUR = 1_000_000


def _settlement_id() -> str:
    """11-char crypto-grade id. R3-Round 3 fix: stopped truncating
    `token_urlsafe(8)[:9]` (~54 bits) — the deliberate slice threw
    away free entropy with no benefit. Full token_urlsafe(8) is 11
    chars / ~64 bits, still visually short enough to interleave with
    expense rows (which use 9-char ids from the frontend's
    generateId) without being mistaken for a different shape."""
    return secrets.token_urlsafe(8)


def _is_accepted_member(cursor, trip_id, user_id):
    """Wraps trip_member_role with the "is the caller seen by the trip"
    binary check. Owners always count via the helper's owner-fallback."""
    return trip_member_role(cursor, trip_id, user_id) is not None


def _trip_owner_id(cursor, trip_id):
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    row = cursor.fetchone()
    return row["user_id"] if row else None


def serialize_settlement_row(row) -> dict:
    """Shape a `settlements` row into the camelCase JSON the frontend
    reads. Kept tiny — settlements are not as field-rich as trips so
    we don't need a helpers.py move yet.

    2026-05-26 (audit S1 + S6): emit `fromName` / `toName` snapshot
    fields alongside the ids. Legacy rows from before the snapshot
    migration backfilled to the users.name at upgrade time; rows
    created after the migration carry the live snapshot from insert.
    The frontend balance math now reads these first before falling
    back to companion-roster resolution by linkedUserId.

    Audit fix (2026-05-26): `recordedBy` surfaces so the frontend
    can show "recorded by X" when it differs from the payer. Older
    rows have NULL recorded_by (pre-fix data) and the UI just
    omits the chip."""
    # Defensive `.keys()` check — older rows pre-migration won't
    # carry the columns until alembic upgrade runs.
    keys = row.keys() if hasattr(row, 'keys') else []
    # Reading a missing column on a sqlite3.Row raises IndexError;
    # the try/except keeps the read path graceful for pre-migration rows.
    try:
        recorded_by = row["recorded_by"]
    except (IndexError, KeyError):
        recorded_by = None
    return {
        "id": row["id"],
        "tripId": row["trip_id"],
        "fromUserId": row["from_user_id"],
        "toUserId": row["to_user_id"],
        "fromName": row["from_name"] if "from_name" in keys else None,
        "toName": row["to_name"] if "to_name" in keys else None,
        "amount": row["amount"],
        "currency": row["currency"],
        "euroValue": row["euro_value"],
        "method": row["method"],
        "note": row["note"],
        "recordedBy": recorded_by,
        "createdAt": row["created_at"],
    }


@bp.route("/api/settlements", methods=["POST"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def create_settlement():
    """Record `from_user_id` paid `to_user_id` `amount currency` for
    `trip_id`. Caller must be an accepted member of the trip; the two
    party ids must ALSO both be accepted members (no logging payments
    involving strangers — that's how spam would get into the
    notifications stream).

    A non-party caller may record on others' behalf ONLY as a trip
    planner/owner ("the four of us settled at dinner; Andre handled it").
    Audit MK5 BUG-054 tightened this — a non-party relaxer can no longer
    fabricate a settlement between two other members. A party (payer or
    recipient) of any role may always record their own. Auditing is
    preserved via `created_at` + the `recorded_by` column (migration
    f5a6b7c8d9e1; populated below at the INSERT site)."""
    user_id = current_user_id()
    body = json_body()

    trip_id = body.get("tripId")
    from_user_id = body.get("fromUserId")
    to_user_id = body.get("toUserId")
    amount = body.get("amount")
    currency = body.get("currency") or "EUR"
    euro_value = body.get("euroValue")
    method = (body.get("method") or "custom").lower()
    note = (body.get("note") or "").strip() or None

    # ── Validation ────────────────────────────────────────────────
    # MK6 P3: require STRINGS, not just truthiness — json_body() permits nested
    # non-scalars, so a dict/list id would pass `not x` and then crash sqlite
    # parameter binding (ProgrammingError → 500) when bound into the
    # trip_member_role query below.
    if not all(isinstance(x, str) and x for x in (trip_id, from_user_id, to_user_id)):
        return jsonify({"error": "tripId, fromUserId, toUserId are required"}), 400
    bind_trip_context(trip_id)
    if from_user_id == to_user_id:
        return jsonify({"error": "fromUserId and toUserId must differ"}), 400
    try:
        amount_f = float(amount)
    except (TypeError, ValueError):
        return jsonify({"error": "amount must be a number"}), 400
    # Audit fix (2026-05-26): the previous `amount_f <= 0` check was
    # False for NaN (NaN comparisons always return False), letting a
    # crafted `{"amount": "NaN"}` or `{"amount": "Infinity"}` slip
    # through and corrupt every downstream sum. Now both isfinite
    # and >0.
    if not math.isfinite(amount_f) or amount_f <= 0:
        return jsonify({"error": "amount must be a positive finite number"}), 400
    if amount_f < 0.01:
        return jsonify({"error": "amount must be at least 0.01"}), 400
    if amount_f > 1e9:
        return jsonify({"error": "amount exceeds the maximum allowed"}), 400
    try:
        currency = validate_currency(currency)
        note = (
            clean_text(
                note,
                max_len=500,
                allow_newlines=True,
                field_name="note",
            )
            if note is not None
            else None
        )
    except ValidationError as ve:
        return jsonify({"error": str(ve)}), 400
    if not note:
        note = None  # Empty string → NULL for column hygiene
    if method not in _ALLOWED_METHODS:
        method = "custom"
    if euro_value is not None:
        try:
            euro_value = float(euro_value)
        except (TypeError, ValueError):
            euro_value = None
        else:
            # MK6 P2: null a ZERO euro_value too, not just negatives. amount is
            # already validated >= 0.01, so a 0 EUR-equivalent is never a real
            # settlement — and if left as 0.0 it is NOT None, so it slips past
            # the S2 "euroValue is required" gate below (which tests `is None`)
            # and stores a settlement invisible to balance math, letting the
            # same debt be re-recorded. Mirrors the expense gate's `> 0` rule.
            if not math.isfinite(euro_value) or euro_value <= 0 or euro_value > 1e9:
                euro_value = None
    # R3-Fix #6: derive euro_value server-side from live FX. Pre-fix
    # the route trusted the client euroValue verbatim (with only a
    # range check). Now: if currency == EUR or we have a live rate,
    # OVERRIDE the client number with the server-derived value. The
    # cold path (no live rate, uncommon currency) still uses the
    # client hint as a fallback — same posture as compute_euro_value.
    server_euro_value = compute_euro_value(
        amount_f,
        currency,
        client_euro_value=euro_value,
    )
    # 2026-05-26 (audit S2): for non-EUR settlements, also require
    # that we ACTUALLY converted via a live rate (or that the
    # client supplied an explicit euroValue). A raw amount-to-EUR
    # fallback would silently apply the foreign amount as if it
    # were EUR. compute_euro_value's cold path returns the value
    # 1:1 when there's no rate AND no client hint — we still
    # reject in that case for non-EUR currencies.
    if currency != "EUR":
        rate = get_rate_eur(currency)
        if rate is None and euro_value is None:
            return jsonify(
                {
                    "error": "euroValue is required for non-EUR settlements",
                    "currency": currency,
                }
            ), 400
    euro_value = server_euro_value

    with get_db() as conn:
        cursor = conn.cursor()
        # Audit MK5 BUG-054 (security): only a PARTY to the settlement (the payer
        # or recipient) or a trip planner/owner may RECORD it. Previously ANY
        # accepted member — including a Relaxer who is neither party — could
        # fabricate a settlement between two OTHER members, and since /api/data
        # ships every settlement to every member (MONEY-3), the bogus row shifted
        # everyone's shared balance graph. A party of any role still records their
        # own payment (the legit "relaxer paid the planner" case); trip_member_role
        # returns 'planner' for owners, so this also admits owners + planners
        # recording on behalf of others.
        caller_role = trip_member_role(cursor, trip_id, user_id)
        if caller_role is None:
            return jsonify({"error": "Not a member of this trip"}), 403
        is_party = user_id == from_user_id or user_id == to_user_id
        if not is_party and caller_role != "planner":
            return jsonify(
                {
                    "error": "Only the payer, recipient, or a trip planner can record this settlement",
                }
            ), 403
        if not _is_accepted_member(cursor, trip_id, from_user_id):
            return jsonify({"error": "fromUserId is not a member of this trip"}), 400
        if not _is_accepted_member(cursor, trip_id, to_user_id):
            return jsonify({"error": "toUserId is not a member of this trip"}), 400
        # R3-Fix #18: archive write gate. Recording a new settlement
        # on an archived trip would re-trigger balance math + the
        # settled_up feed event; the user already considered the
        # trip "closed."
        if is_trip_archived_for(cursor, trip_id, user_id):
            return jsonify(
                {
                    "error": "Trip is archived — unarchive to record new settlements",
                }
            ), 409

        # BUG-24 (MK2 persona audit) + integration audit B2/B3: reject
        # grossly-oversized settlements server-side. Logging €10,000 against
        # a €45 debt INVERTS the ledger (the payer ends up owed money).
        #
        # We still don't replicate the client's full split engine here
        # (custom splits, multi-currency, name↔user reconciliation) — doing
        # so risks subtle divergence that would FALSE-REJECT legitimate
        # settlements, which is worse than the bug. We use a provably-safe
        # upper bound: a from→to debt can never exceed the trip's total
        # spend (the most anyone can owe is their share of everything).
        #
        # Integration audit fixes to the original BUG-24 cap:
        #   • B2 — subtract what `from` has ALREADY paid `to` on this trip.
        #     The pre-fix cap was a flat `total_spend` and ignored prior
        #     settlements, so a partial-payment SEQUENCE (€50, then €60, on
        #     a €100 debt) sailed under the cap each time and inverted the
        #     ledger. Bounding (alreadyPaidFromTo + this) by total_spend
        #     closes that — and stays provably safe: a legitimate split of a
        #     real debt D ≤ total_spend can never make the running F→to total
        #     exceed total_spend.
        #   • B3 — a trip with NO recorded spend still can't be grounded, so
        #     we keep allowing it (the documented "off-app cash debt the user
        #     logs after the fact" flow — and the manual settle modal is the
        #     only way to reach it). But the pre-fix code SKIPPED the cap
        #     entirely there, so a fat-finger €100,000,000 got a 201 and
        #     poisoned the cross-trip Global tab + Insights for every trip.
        #     Now the zero-spend path is bounded by a generous absolute sanity
        #     ceiling (_ZERO_SPEND_SETTLEMENT_SANITY_EUR): far above any real
        #     trip debt, far below an absurd one.
        # The residual (a SINGLE overpay below total_spend but above the true
        # pairwise debt) stays guarded on the client, where the split engine
        # lives (`_pairwiseOwed` in legacyRender.ts pops an overpay confirm).
        # MK4 SETL-1: filter `deleted_at IS NULL` so SOFT-DELETED
        # (tombstoned) expenses don't count toward the cap. Expense
        # delete is a soft delete (expenses.py stamps deleted_at), so
        # without this a since-deleted €1000 expense still inflated
        # total_spend → the cap over-permitted a phantom overpay
        # (and, with a prior partial settlement subtracted from a
        # tombstone-inflated total, under-permitted a legit follow-up).
        # Matches the sibling sum in pdf.py:2327. COALESCE(is_settlement,0)=0
        # also guards any legacy rows where is_settlement is NULL.
        cursor.execute(
            "SELECT COALESCE(SUM(euro_value), 0) AS total FROM expenses "
            "WHERE trip_id = ? AND deleted_at IS NULL "
            "AND COALESCE(is_settlement, 0) = 0",
            (trip_id,),
        )
        total_spend = cursor.fetchone()["total"] or 0
        cursor.execute(
            "SELECT COALESCE(SUM(euro_value), 0) AS paid FROM settlements "
            "WHERE trip_id = ? AND from_user_id = ? AND to_user_id = ?",
            (trip_id, from_user_id, to_user_id),
        )
        already_paid_from_to = cursor.fetchone()["paid"] or 0
        if euro_value is not None:
            if total_spend > 0:
                # B2: spend-grounded cap, with prior F→to settlements subtracted.
                settlement_cap = total_spend * 1.01 + 0.5 - already_paid_from_to
                if euro_value > settlement_cap:
                    return jsonify(
                        {
                            "error": (
                                "This settlement is larger than what's still "
                                "outstanding for this trip — log the expenses "
                                "first, or double-check the amount."
                            ),
                            "maxEur": round(max(settlement_cap, 0), 2),
                        }
                    ), 400
            elif euro_value > _ZERO_SPEND_SETTLEMENT_SANITY_EUR:
                # B3: zero-spend trip — allow off-app debt logging, but never
                # a clearly-absurd amount that would skew aggregate views.
                return jsonify(
                    {
                        "error": (
                            "This settlement looks too large to be real — "
                            "double-check the amount, or log the trip's "
                            "expenses so the balance can be calculated."
                        ),
                        "maxEur": float(_ZERO_SPEND_SETTLEMENT_SANITY_EUR),
                    }
                ), 400

        # 2026-05-26 (audit S1 + S6): snapshot party display names at
        # insert time. Pre-fix, the balance math resolved names from
        # the trip's live companion roster — so if either party was
        # unlinked from the trip after the settlement was recorded,
        # the row was silently skipped from balance shifts and the
        # debt persisted. Snapshotting decouples the row from later
        # roster mutations.
        cursor.execute(
            "SELECT id, name FROM users WHERE id IN (?, ?)",
            (from_user_id, to_user_id),
        )
        _name_by_id = {r["id"]: r["name"] for r in cursor.fetchall()}
        from_name = _name_by_id.get(from_user_id)
        to_name = _name_by_id.get(to_user_id)

        # Audit fix (2026-05-26): stamp `recorded_by` so the audit
        # trail captures who clicked save. Different from
        # `from_user_id` when a planner records a settlement on
        # behalf of others.
        #
        # Audit fix (2026-05-27): retry the INSERT up to 5 times on
        # IntegrityError. R9-B1 L1: `_settlement_id` now returns the
        # full `token_urlsafe(8)` (~64 bits / 11 chars) — the old
        # `[:9]` truncation was removed but the retry loop is still
        # worth keeping as a defensive backstop against transient
        # INSERT failures (concurrent writers, FK glitches). Same
        # pattern as `_clone_trip_record` in trips.py.
        import sqlite3

        settlement_id = None
        for _attempt in range(5):
            candidate = _settlement_id()
            try:
                cursor.execute(
                    "INSERT INTO settlements "
                    "(id, trip_id, from_user_id, to_user_id, from_name, to_name, "
                    " amount, currency, euro_value, method, note, recorded_by) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        candidate,
                        trip_id,
                        from_user_id,
                        to_user_id,
                        from_name,
                        to_name,
                        amount_f,
                        currency,
                        euro_value,
                        method,
                        note,
                        user_id,
                    ),
                )
                settlement_id = candidate
                break
            except sqlite3.IntegrityError:
                continue
        if settlement_id is None:
            # Five collisions in a row is astronomically unlikely;
            # surface a clean error instead of letting the next
            # IntegrityError bubble up as a 500.
            return jsonify(
                {
                    "error": "Could not allocate a settlement id, please retry",
                }
            ), 503

        # Notification to the recipient (skip self-pay where caller IS
        # the recipient — they don't need to be told something they
        # just typed). Audit fix: include the recorder's name when
        # they're neither party so the recipient can confirm with
        # the actual payer ("Charlie recorded that Bob paid you...").
        # R5-B2: also skip if the recipient blocked the recorder OR
        # the payer — a blocked user shouldn't reach the blocker's
        # bell, even indirectly through a third-party recorder.
        from routes.blocks import is_blocked

        notify_recipient = (
            user_id != to_user_id
            and not is_blocked(cursor, to_user_id, user_id)
            and not is_blocked(cursor, to_user_id, from_user_id)
        )
        if notify_recipient:
            cursor.execute("SELECT name FROM users WHERE id = ?", (from_user_id,))
            from_row = cursor.fetchone()
            from_name = (from_row["name"] if from_row else "Someone") or "Someone"
            cursor.execute("SELECT name FROM trips WHERE id = ?", (trip_id,))
            trip_row = cursor.fetchone()
            trip_name = (trip_row["name"] if trip_row else "the trip") or "the trip"
            if user_id != from_user_id:
                # Recorder is a third party — surface their name so
                # the recipient knows to confirm with the actual payer.
                cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
                recorder_row = cursor.fetchone()
                recorder_name = (recorder_row["name"] if recorder_row else "Someone") or "Someone"
                message = (
                    f"{recorder_name} recorded that {from_name} paid you "
                    f"{amount_f:g} {currency} for {trip_name} — confirm with them."
                )
            else:
                message = f"{from_name} settled {amount_f:g} {currency} with you for {trip_name}."
            cursor.execute(
                "INSERT INTO notifications "
                "(user_id, type, title, related_id, message, is_read) "
                "VALUES (?, 'settled_up', 'Settled up', ?, ?, 0)",
                (to_user_id, trip_id, message),
            )

        conn.commit()

        # Re-read for the response so created_at + row defaults are
        # reflected.
        cursor.execute("SELECT * FROM settlements WHERE id = ?", (settlement_id,))
        row = cursor.fetchone()

    logger.info(
        "settlement created",
        extra=log_extra(
            settlement_id=settlement_id,
            trip_id=trip_id,
            from_user_id=from_user_id,
            to_user_id=to_user_id,
            amount=amount_f,
            currency=currency,
            recorded_by=user_id,
        ),
    )
    return jsonify({"settlement": serialize_settlement_row(row)}), 201


@bp.route("/api/settlements/<trip_id>", methods=["GET"])
@require_auth
def list_settlements_for_trip(trip_id):
    """Return all settlements for the trip. Members only (matches
    /api/data's trip visibility rule)."""
    bind_trip_context(trip_id)
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        if not _is_accepted_member(cursor, trip_id, user_id):
            # 404 (not 403) so a probing client can't enumerate which
            # trips exist — mirrors the public-trip endpoint's policy.
            return jsonify({"error": "Not found"}), 404
        cursor.execute(
            "SELECT * FROM settlements WHERE trip_id = ? ORDER BY created_at DESC",
            (trip_id,),
        )
        rows = [serialize_settlement_row(r) for r in cursor.fetchall()]
    return jsonify({"settlements": rows})


@bp.route("/api/settlements/<settlement_id>", methods=["DELETE"])
@require_auth
@limiter.limit("30/minute")
@retry_on_lock()
def delete_settlement(settlement_id):
    """Undo a settlement. Allowed for:
      - the trip owner (full control on their own trip)
      - the row's payer (`from_user_id`) — they typed it, they can
        retract it
      - the recorder (`recorded_by`) — e.g. a planner who logged the
        settlement on the parties' behalf (Audit MK5 BUG-054) — so a
        mistaken/abusive entry is self-cleanable, not stranded on the payer
    The recipient (`to_user_id`) intentionally CANNOT delete because
    a recipient quietly un-receiving money would leave the payer
    thinking the debt is settled when it isn't.

    Audit fix (2026-05-26): notify the recipient when a settlement
    they received gets deleted. Pre-fix the recipient saw the
    "Sara paid you €45" notification on creation, then the
    settlement silently vanished from their balance — they'd see
    the debt resurface without knowing why. Now we drop a
    `settled_up_reverted` notification so the recipient learns the
    payer (or trip owner) took it back. The deleter is excluded
    from their own notification (no point telling them what they
    just did).
    """
    user_id = current_user_id()
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM settlements WHERE id = ?", (settlement_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        bind_trip_context(row["trip_id"])

        owner_id = _trip_owner_id(cursor, row["trip_id"])
        # Audit MK5 BUG-054: also allow the RECORDER (recorded_by) to delete the
        # row they created. Pre-fix rows have NULL recorded_by → no match, so
        # they keep the old owner/payer-only rule.
        if user_id != owner_id and user_id != row["from_user_id"] and user_id != row["recorded_by"]:
            return jsonify({"error": "Forbidden"}), 403
        # R10-B6e F5: archive write gate. Deleting a settlement on an
        # archived trip would resurface the original debt + fire a
        # settled_up_reverted notification, both of which "reopen" a
        # trip the caller already considered done. Mirrors the create
        # path at line 236 (and the expense + day write gates) — if
        # the caller wants to delete a settlement on an archived
        # trip, they must unarchive first. Owner-side per-user
        # archive applies (not the legacy column), same as the create
        # gate, so two members on different archive states resolve
        # independently.
        if is_trip_archived_for(cursor, row["trip_id"], user_id):
            return jsonify(
                {
                    "error": "Trip is archived — unarchive to delete settlements",
                }
            ), 409

        # R12-B3: snapshot the full row into the append-only audit
        # trail BEFORE the hard delete. Closes the repudiation gap —
        # `recorded_by` captured WHO created the settlement, but a
        # deletion left only an ephemeral stdout log. Now the audit
        # row permanently records WHO deleted it (actor_id), WHEN
        # (created_at default), and the full original payload, so the
        # parties can reconstruct a reverted settlement even months
        # later. Uses sqlite3.Row's .get-free indexing — every column
        # is selected by `SELECT *` above so all keys exist.
        cursor.execute(
            "INSERT INTO settlements_audit "
            "(settlement_id, trip_id, from_user_id, to_user_id, "
            " from_name, to_name, amount, currency, euro_value, "
            " recorded_by, action, actor_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'deleted', ?)",
            (
                settlement_id,
                row["trip_id"],
                row["from_user_id"],
                row["to_user_id"],
                row["from_name"],
                row["to_name"],
                row["amount"],
                row["currency"],
                row["euro_value"],
                row["recorded_by"],
                user_id,
            ),
        )

        cursor.execute("DELETE FROM settlements WHERE id = ?", (settlement_id,))

        # Notify the recipient (skip if they're the one deleting,
        # which can happen when the recipient is the trip owner and
        # the row was logged on their behalf). Resolve display names
        # for the message body, same shape as the create path.
        # R5-B2: also skip if the recipient blocked the deleter or
        # the original payer — same block-respect rule as create.
        from routes.blocks import is_blocked

        recipient_id = row["to_user_id"]
        if (
            recipient_id
            and recipient_id != user_id
            and not is_blocked(cursor, recipient_id, user_id)
            and not is_blocked(cursor, recipient_id, row["from_user_id"])
        ):
            cursor.execute("SELECT name FROM users WHERE id = ?", (row["from_user_id"],))
            payer_row = cursor.fetchone()
            payer_name = (payer_row["name"] if payer_row else "Someone") or "Someone"
            cursor.execute("SELECT name FROM trips WHERE id = ?", (row["trip_id"],))
            trip_row = cursor.fetchone()
            trip_name = (trip_row["name"] if trip_row else "the trip") or "the trip"
            amount = row["amount"]
            currency = row["currency"] or ""
            if user_id != row["from_user_id"]:
                # MK6 P3: a THIRD party (trip owner / recorder) reverted it, not
                # the payer — name the actual deleter so the recipient doesn't
                # think the payer "un-paid" them. Mirrors the create path's
                # third-party-recorder message.
                cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
                deleter_row = cursor.fetchone()
                deleter_name = (deleter_row["name"] if deleter_row else "Someone") or "Someone"
                message = (
                    f"{deleter_name} reverted the settlement {payer_name} paid you "
                    f"({amount:g} {currency}) on {trip_name}."
                )
            else:
                message = (
                    f"{payer_name} reverted a settlement of {amount:g} {currency} on {trip_name}."
                )
            cursor.execute(
                "INSERT INTO notifications "
                "(user_id, type, title, related_id, message, is_read) "
                "VALUES (?, 'settled_up_reverted', 'Settlement reverted', ?, ?, 0)",
                (recipient_id, row["trip_id"], message),
            )

        conn.commit()

    logger.info(
        "settlement deleted",
        extra=log_extra(
            settlement_id=settlement_id,
            trip_id=row["trip_id"],
            deleted_by=user_id,
        ),
    )
    return jsonify({"status": "deleted"})
