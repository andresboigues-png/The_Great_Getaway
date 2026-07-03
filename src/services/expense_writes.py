"""Expense upsert — the single implementation behind all three write paths.

Callers:
  * routes/expenses.py  POST /api/expenses         → PER_ROW policy
  * routes/data.py      /api/sync active loop      → SYNC_ACTIVE policy
  * routes/data.py      /api/sync archived loop    → SYNC_ARCHIVED policy

Every rule in here carries its provenance comment from the site it was
unified FROM — the audit trail (R2/R3/R8/R10/MM/C1/BUG-37/SY5) is the
reason this module exists, so it stays readable next to the logic.

Deliberate unification fix (MK1 Wave B): the sync loops used to run the
C1 "no live rate + no client euroValue" drop INSIDE their pre-validation
(_validate_sync_expense), BEFORE the existing-row lookup — so a metadata
-only resync of a no-rate-currency expense was silently discarded even
though its frozen euro_value made the client hint unnecessary. That is
the exact ordering bug Wave 17 (caffed64) fixed on the per-row path.
Unified order everywhere now: existing-row lookup → money_unchanged
freeze → C1 gate only when the money actually changed.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from fx_rates import compute_euro_value, get_rate_eur
from helpers import is_trip_archived_for
from services._shared import UpsertResult
from services._shared import fail as _shared_fail
from validators import (
    ValidationError,
    clean_text,
    validate_currency,
    validate_date,
    validate_money,
    validate_splits,
    validate_upload_url,
)


@dataclass(frozen=True)
class ExpenseWritePolicy:
    """How a write path is ALLOWED to differ from its siblings.

    strict            True → validation/authz failures become error results
                      the route turns into 400/403/409. False → the bulk
                      "best-effort batch" contract: bad rows skip silently
                      (a batch can't 400 over one row).
    require_full_splits
                      BUG-37: the per-row path rejects splits that don't
                      sum to ~100 (all-zero splits vanished from balance
                      math). Sync stays lenient so its delete+reinsert
                      doesn't drop odd-but-nonzero legacy splits.
    lenient_date      BUG-8 on the bulk path: a garbage date is coerced
                      to '' (undated) so the legit expense still syncs;
                      per-row rejects with 400.
    enforce_archived_gate
                      R3-Fix #18: per-row refuses writes to a trip the
                      caller archived (409). Sync is exempt — it IS the
                      catch-up channel for archived state.
    concurrency       'gate_409'    per-row R8-B4: atomic updated_at WHERE
                                    gate; stale → 409 with the live row.
                      'opt_in_skip' sync active loop R10-B6d T3: gate only
                                    when the row carries clientUpdatedAt;
                                    stale writes skip silently. (NOTE: this
                                    clause deliberately lacks gate_409's
                                    `updated_at IS NULL` allowance — kept
                                    exactly as shipped.)
                      'none'        sync archived loop: no gate (legacy
                                    contract).
    stamp_insert_updated_at
                      Per-row INSERTs stamp millisecond updated_at in the
                      VALUES (R3-Round 4: 1-second CURRENT_TIMESTAMP
                      collapsed rapid writes); sync INSERTs keep the table
                      default, exactly as shipped.
    """

    strict: bool
    require_full_splits: bool
    lenient_date: bool
    enforce_archived_gate: bool
    concurrency: str  # 'gate_409' | 'opt_in_skip' | 'none'
    stamp_insert_updated_at: bool


PER_ROW = ExpenseWritePolicy(
    strict=True,
    require_full_splits=True,
    lenient_date=False,
    enforce_archived_gate=True,
    concurrency='gate_409',
    stamp_insert_updated_at=True,
)

SYNC_ACTIVE = ExpenseWritePolicy(
    strict=False,
    require_full_splits=False,
    lenient_date=True,
    enforce_archived_gate=False,
    concurrency='opt_in_skip',
    stamp_insert_updated_at=False,
)

SYNC_ARCHIVED = ExpenseWritePolicy(
    strict=False,
    require_full_splits=False,
    lenient_date=True,
    enforce_archived_gate=False,
    concurrency='none',
    stamp_insert_updated_at=False,
)


def apply_expense_upsert(
    cursor,
    user_id: str,
    e: dict,
    *,
    claimed_trip_id: str,
    can_write: Callable[[str], bool],
    policy: ExpenseWritePolicy,
) -> UpsertResult:
    """Validate + authz-gate + upsert ONE expense row.

    `can_write(trip_id)` is the caller's permission predicate — the
    per-row route wraps can_edit_expenses(cursor, …); the sync loops pass
    membership-set lookups (R5-B4). The IDOR-critical rule that the gate
    runs against the EXISTING row's trip_id (R2 audit / §0.5) lives HERE,
    uniformly, not in the callers.
    """
    expense_id = e.get("id")

    # ── field validation (R2 hardening + R3-Fix #11 + R10-B6a F1/F2) ──
    try:
        # R3-Round 2 / R10-B2 P1-8: allow_zero=False on every path — a €0
        # expense is a ghost row in History/feed/balances.
        value = validate_money(e.get("value", 0), field_name="value", allow_zero=False)
        currency = validate_currency(e.get("currency"))
        # R3-Fix #6: euro_value derives server-side from the live FX cache;
        # the client hint only survives on the cold path (no live rate).
        client_euro_value = validate_money(e.get("euroValue", 0), field_name="euroValue")
        euro_value = compute_euro_value(value, currency, client_euro_value=client_euro_value)
        label = clean_text(
            e.get("label", ""), max_len=200, allow_newlines=False, field_name="label"
        )
        who = clean_text(e.get("who", ""), max_len=200, allow_newlines=False, field_name="who")
        # The bulk paths historically coerced None → '' before clean_text;
        # the per-row path passed the raw value through (non-string → 400).
        raw_country = e.get("country", "")
        raw_category = e.get("categoryId", "")
        if policy.lenient_date:  # proxy for "bulk path" — same paths coerce
            raw_country = raw_country or ""
            raw_category = raw_category or ""
        country = clean_text(raw_country, max_len=120, allow_newlines=False, field_name="country")
        category_id = clean_text(
            raw_category, max_len=120, allow_newlines=False, field_name="categoryId"
        )
        # BUG-8: strict YYYY-MM-DD or empty. Bulk coerces garbage → ''
        # (drop the date, keep the expense); per-row 400s.
        if policy.lenient_date:
            try:
                date = validate_date(e.get("date", ""))
            except ValidationError:
                date = ""
        else:
            date = validate_date(e.get("date", ""))
        # R10-B6a F1: receiptUrl must point at the caller's own upload.
        receipt_url = validate_upload_url(
            e.get("receiptUrl"), user_id=user_id, field_name="receiptUrl", allow_empty=True
        )
        # R10-B6a F2 (+ BUG-37 on the strict path): shared splits shape gate.
        splits_clean = validate_splits(e.get("splits"), require_full=policy.require_full_splits)
    except ValidationError as ve:
        return _shared_fail(policy.strict, str(ve), 400)

    # ── existing-row lookup + IDOR-safe permission gate (R2 / §0.5) ──
    cursor.execute(
        "SELECT trip_id, value, currency, euro_value FROM expenses WHERE id = ?",
        (expense_id,),
    )
    existing = cursor.fetchone()
    gate_trip_id = existing["trip_id"] if existing else claimed_trip_id
    if not can_write(gate_trip_id):
        return _shared_fail(policy.strict, "Forbidden", 403)

    # ── euro_value freeze (MM-1/MM-5) then the C1 no-rate gate ──
    # Order matters (Wave 17 / caffed64): a metadata-only edit reuses the
    # row's own server-trusted euro_value, so the C1 demand for a client
    # conversion would be a false rejection there.
    money_unchanged = bool(
        existing
        and abs((existing["value"] or 0) - value) < 1e-9
        and (existing["currency"] or "").upper() == currency.upper()
    )
    if money_unchanged:
        euro_value = existing["euro_value"]
    elif (
        currency != "EUR"
        and get_rate_eur(currency) is None
        and not (client_euro_value and client_euro_value > 0)
    ):
        # C1: refuse to freeze a bogus euro_value for an unconvertible
        # currency (it reads three inconsistent ways downstream).
        return _shared_fail(
            policy.strict,
            "euroValue is required for this currency — no live exchange "
            "rate is available to convert it.",
            400,
            currency=currency,
        )

    # ── archived-trip write gate (R3-Fix #18, per-row only) ──
    if policy.enforce_archived_gate and is_trip_archived_for(cursor, gate_trip_id, user_id):
        return _shared_fail(policy.strict, "Trip is archived — unarchive to edit", 409)

    # ── serialise splits + settlement flag (audit S1) ──
    if isinstance(splits_clean, dict) and splits_clean:
        import json as _json

        splits_json = _json.dumps(splits_clean)
    else:
        splits_json = None
    is_settlement = 1 if e.get("isSettlement") else 0
    client_updated_at = e.get("clientUpdatedAt")

    # ── the upsert (SY5 tombstone guard + per-policy concurrency) ──
    # trip_id binds gate_trip_id: identical to the claimed id on INSERT
    # (no existing row) and inert on UPDATE (trip_id isn't in the SET
    # clause) — matches both shipped variants.
    if policy.stamp_insert_updated_at:
        insert_cols = (
            "id, trip_id, who, category_id, label, date, country, value, "
            "currency, euro_value, receipt_url, splits, is_settlement, updated_at"
        )
        values_sql = "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now')"
    else:
        insert_cols = (
            "id, trip_id, who, category_id, label, date, country, value, "
            "currency, euro_value, receipt_url, splits, is_settlement"
        )
        values_sql = "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?"

    where_sql = "WHERE expenses.deleted_at IS NULL"
    params: list[Any] = [
        expense_id,
        gate_trip_id,
        who,
        category_id,
        label,
        date,
        country,
        value,
        currency,
        euro_value,
        receipt_url,
        splits_json,
        is_settlement,
    ]
    if policy.concurrency == "gate_409":
        # R8-B4: atomic staleness gate inside the conflict WHERE.
        where_sql += " AND (? IS NULL OR expenses.updated_at IS NULL OR expenses.updated_at = ?)"
        params += [client_updated_at, client_updated_at]
    elif policy.concurrency == "opt_in_skip":
        # R10-B6d T3: opt-in gate, stale rows skip silently.
        where_sql += " AND (? IS NULL OR expenses.updated_at = ?)"
        params += [client_updated_at, client_updated_at]

    cursor.execute(
        f'''
        INSERT INTO expenses ({insert_cols})
        VALUES ({values_sql})
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
        {where_sql}
        ''',
        params,
    )

    # ── strict-path stale/tombstone disambiguation (R8-B4) ──
    if policy.concurrency == "gate_409" and existing and cursor.rowcount == 0:
        cursor.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,))
        live = cursor.fetchone()
        if live and not live["deleted_at"]:
            return UpsertResult(
                ok=False,
                error="Stale edit — another device updated this expense",
                status=409,
                extra={"current": dict(live)},
            )
        # Tombstoned: legitimate queued resurrection no-op — fall through
        # as success (SY5 contract).

    result = UpsertResult(ok=True, euro_value=euro_value)
    if policy.strict:
        # Read back the freshly-stamped updated_at so the client can close
        # the read-modify-write cycle.
        cursor.execute("SELECT updated_at FROM expenses WHERE id = ?", (expense_id,))
        row = cursor.fetchone()
        result.updated_at = row["updated_at"] if row else None
    return result
