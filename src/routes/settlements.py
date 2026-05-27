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
  - Any accepted member of the trip can RECORD a settlement (planners,
    budgeteers AND relaxers — a relaxer paying their planner needs to
    be able to log it themselves).
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

from flask import Blueprint, jsonify, request

from auth import current_user_id, require_auth
from database import get_db, retry_on_lock
from extensions import limiter
from fx_rates import compute_euro_value, get_rate_eur
from helpers import is_trip_archived_for, trip_member_role
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

    Note: the caller does NOT have to be one of the two parties.
    Trip planners often log settlements on behalf of others (e.g.
    "the four of us settled at dinner; Andre handled it"). Auditing
    is preserved via `created_at` + the (yet-to-add) `recorded_by`
    column — for v1 we keep the shape lean and rely on the trip
    members chat to catch impersonation. Future: add `recorded_by`
    if it becomes a real concern."""
    user_id = current_user_id()
    body = request.json or {}

    trip_id = body.get("tripId")
    from_user_id = body.get("fromUserId")
    to_user_id = body.get("toUserId")
    amount = body.get("amount")
    currency = body.get("currency") or "EUR"
    euro_value = body.get("euroValue")
    method = (body.get("method") or "custom").lower()
    note = (body.get("note") or "").strip() or None

    # ── Validation ────────────────────────────────────────────────
    if not trip_id or not from_user_id or not to_user_id:
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
        note = clean_text(
            note, max_len=500, allow_newlines=True, field_name="note",
        ) if note is not None else None
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
            if not math.isfinite(euro_value) or euro_value < 0 or euro_value > 1e9:
                euro_value = None
    # R3-Fix #6: derive euro_value server-side from live FX. Pre-fix
    # the route trusted the client euroValue verbatim (with only a
    # range check). Now: if currency == EUR or we have a live rate,
    # OVERRIDE the client number with the server-derived value. The
    # cold path (no live rate, uncommon currency) still uses the
    # client hint as a fallback — same posture as compute_euro_value.
    server_euro_value = compute_euro_value(
        amount_f, currency,
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
            return jsonify({
                "error": "euroValue is required for non-EUR settlements",
                "currency": currency,
            }), 400
    euro_value = server_euro_value

    with get_db() as conn:
        cursor = conn.cursor()
        if not _is_accepted_member(cursor, trip_id, user_id):
            return jsonify({"error": "Not a member of this trip"}), 403
        if not _is_accepted_member(cursor, trip_id, from_user_id):
            return jsonify({"error": "fromUserId is not a member of this trip"}), 400
        if not _is_accepted_member(cursor, trip_id, to_user_id):
            return jsonify({"error": "toUserId is not a member of this trip"}), 400
        # R3-Fix #18: archive write gate. Recording a new settlement
        # on an archived trip would re-trigger balance math + the
        # settled_up feed event; the user already considered the
        # trip "closed."
        if is_trip_archived_for(cursor, trip_id, user_id):
            return jsonify({
                "error": "Trip is archived — unarchive to record new settlements",
            }), 409

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
        # IntegrityError. `_settlement_id` has only ~54 bits of
        # entropy after the [:9] truncation, so PK collisions are
        # rare but real at scale — pre-fix the route 500'd on
        # collision; now we re-generate and retry. Same pattern as
        # `_clone_trip_record` in trips.py.
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
            return jsonify({
                "error": "Could not allocate a settlement id, please retry",
            }), 503

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
            cursor.execute(
                "SELECT name FROM users WHERE id = ?", (from_user_id,)
            )
            from_row = cursor.fetchone()
            from_name = (from_row["name"] if from_row else "Someone") or "Someone"
            cursor.execute(
                "SELECT name FROM trips WHERE id = ?", (trip_id,)
            )
            trip_row = cursor.fetchone()
            trip_name = (trip_row["name"] if trip_row else "the trip") or "the trip"
            if user_id != from_user_id:
                # Recorder is a third party — surface their name so
                # the recipient knows to confirm with the actual payer.
                cursor.execute(
                    "SELECT name FROM users WHERE id = ?", (user_id,)
                )
                recorder_row = cursor.fetchone()
                recorder_name = (
                    (recorder_row["name"] if recorder_row else "Someone")
                    or "Someone"
                )
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
        cursor.execute(
            "SELECT * FROM settlements WHERE id = ?", (settlement_id,)
        )
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
            "SELECT * FROM settlements WHERE trip_id = ? "
            "ORDER BY created_at DESC",
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
        cursor.execute(
            "SELECT * FROM settlements WHERE id = ?", (settlement_id,)
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        bind_trip_context(row["trip_id"])

        owner_id = _trip_owner_id(cursor, row["trip_id"])
        if user_id != owner_id and user_id != row["from_user_id"]:
            return jsonify({"error": "Forbidden"}), 403

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
            cursor.execute(
                "SELECT name FROM users WHERE id = ?", (row["from_user_id"],)
            )
            payer_row = cursor.fetchone()
            payer_name = (payer_row["name"] if payer_row else "Someone") or "Someone"
            cursor.execute(
                "SELECT name FROM trips WHERE id = ?", (row["trip_id"],)
            )
            trip_row = cursor.fetchone()
            trip_name = (trip_row["name"] if trip_row else "the trip") or "the trip"
            amount = row["amount"]
            currency = row["currency"] or ""
            message = (
                f"{payer_name} reverted a settlement of "
                f"{amount:g} {currency} on {trip_name}."
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
