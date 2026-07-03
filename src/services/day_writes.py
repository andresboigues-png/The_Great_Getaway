"""Trip-day upsert — the single implementation behind both write paths.

Callers:
  * routes/days.py  POST /api/days          → PER_ROW policy
  * routes/data.py  /api/sync trip_days loop → SYNC policy

Provenance comments are kept from the sites this was unified FROM
(R2 IDOR gate, R3-Fix #18, R3-Round 5 / R8-B4 concurrency, BUG-1
tip/notes split, BUG-31 fractional dayNumber, §2.4 lng=0, SY5
tombstones, DAY-1 collision mapping).

Deliberate unification fixes (MK1 Wave B):
  * dayNumber is now VALIDATED on the sync path too (bad values skip
    per the bulk contract). Pre-fix the loop bound `d.get('dayNumber')`
    verbatim — `dayNumber: 999999` from a legacy/hostile sync payload
    broke the renumber heuristic + "Day N+1" suggestion the per-row
    route has guarded against since 2026-05-26.
  * A UNIQUE(trip_id, day_number) collision on the sync path now SKIPS
    the row (bulk contract) instead of raising an unhandled
    IntegrityError → 500 mid-sync after earlier sections had already
    committed.

Deliberate NON-change: the sync policy does NOT write the accommodation
columns (Wave 2). The first-party client stopped sending trip_days to
/api/sync at R8-B4 — day rows arriving here come from LEGACY bundles
that predate accommodation, so binding their absent keys would NULL
accommodation set via the per-row path on every legacy resync.
"""

from collections.abc import Callable
from dataclasses import dataclass

from helpers import is_trip_archived_for
from services._shared import UpsertResult
from services._shared import fail as _fail


@dataclass(frozen=True)
class DayWritePolicy:
    """How a day write path is ALLOWED to differ from its sibling.

    strict                per-row 400/403/409 vs the bulk silent-skip
                          contract.
    enforce_archived_gate R3-Fix #18: per-row only; sync is the archived
                          catch-up channel.
    concurrency           'gate_409' per-row (R3-Round 5 / R8-B4 atomic
                          WHERE gate + stale-vs-tombstone disambiguation)
                          or 'none' (sync legacy contract).
    include_accommodation Wave 2 columns — per-row only (see module
                          docstring for why sync must not bind them).
    stamp_insert_updated_at
                          Per-row INSERTs stamp millisecond updated_at
                          (R3-Round 4); sync keeps the table default.
    """

    strict: bool
    enforce_archived_gate: bool
    concurrency: str  # 'gate_409' | 'none'
    include_accommodation: bool
    stamp_insert_updated_at: bool


PER_ROW = DayWritePolicy(
    strict=True,
    enforce_archived_gate=True,
    concurrency="gate_409",
    include_accommodation=True,
    stamp_insert_updated_at=True,
)

SYNC = DayWritePolicy(
    strict=False,
    enforce_archived_gate=False,
    concurrency="none",
    include_accommodation=False,
    stamp_insert_updated_at=False,
)


def apply_day_upsert(
    cursor,
    user_id: str,
    d: dict,
    *,
    claimed_trip_id: str,
    can_write: Callable[[str], bool],
    policy: DayWritePolicy,
) -> UpsertResult:
    """Validate + authz-gate + upsert ONE trip-day row.

    `can_write(trip_id)` is the caller's permission predicate (per-row:
    can_edit_trip; sync: editable-set membership with the owner-of-trip
    fallback for trips created earlier in the same batch). The R2 IDOR
    rule — gate against the EXISTING row's trip_id, since the UPSERT
    can't re-home a row anyway (trip_id isn't in the SET clause) —
    lives here, uniformly.
    """
    import sqlite3

    day_id = d.get("id")

    # ── dayNumber bounds (audit 2026-05-26 + BUG-31 fractional) ──
    # Cap 0..999; reject fractions instead of silently truncating
    # (int(2.5) landed on slot 2 and collided with the real Day 2).
    day_number = d.get("dayNumber")
    if day_number is not None:
        try:
            day_number_f = float(day_number)
        except (TypeError, ValueError):
            return _fail(policy.strict, "dayNumber must be an integer", 400)
        if not day_number_f.is_integer():
            return _fail(policy.strict, "dayNumber must be a whole number", 400)
        day_number_int = int(day_number_f)
        if day_number_int < 0:
            return _fail(policy.strict, "dayNumber must be non-negative", 400)
        if day_number_int > 999:
            return _fail(policy.strict, "dayNumber must be 999 or less", 400)
        day_number = day_number_int

    # ── existing-row lookup + IDOR-safe permission gate (R2) ──
    cursor.execute("SELECT trip_id FROM trip_days WHERE id = ?", (day_id,))
    existing = cursor.fetchone()
    gate_trip_id = existing["trip_id"] if existing else claimed_trip_id
    if not gate_trip_id:
        return _fail(policy.strict, "Missing trip id", 400)
    if not can_write(gate_trip_id):
        return _fail(policy.strict, "Forbidden", 403)

    # ── archived-trip write gate (R3-Fix #18, per-row only) ──
    if policy.enforce_archived_gate and is_trip_archived_for(cursor, gate_trip_id, user_id):
        return _fail(policy.strict, "Trip is archived — unarchive to edit", 409)

    client_updated_at = d.get("clientUpdatedAt")

    # ── column layout per policy ──
    cols = "id, trip_id, day_number, date, name, morning, afternoon, evening, tip, notes, lat, lng"
    set_clause = """
            day_number=excluded.day_number,
            date=excluded.date,
            name=excluded.name,
            morning=excluded.morning,
            afternoon=excluded.afternoon,
            evening=excluded.evening,
            tip=excluded.tip,
            notes=excluded.notes,
            lat=excluded.lat,
            lng=excluded.lng,"""
    params: list = [
        day_id,
        claimed_trip_id,
        day_number,
        d.get("date"),
        d.get("name"),
        # Plain text — NOT json.dumps (legacy wrapping round-tripped
        # '"foo"' garbage into the day-plan textareas).
        d.get("morning", d.get("plan", {}).get("morning", "")) or "",
        d.get("afternoon", d.get("plan", {}).get("afternoon", "")) or "",
        d.get("evening", d.get("plan", {}).get("evening", "")) or "",
        # BUG-1: `tip` and `notes` are SEPARATE columns (notes used to be
        # overloaded into tip, silently losing journaling).
        d.get("tip", ""),
        d.get("notes", ""),
        d.get("lat"),
        # §2.4: `or` would drop lng=0 (prime meridian) — explicit None test.
        d["lng"] if d.get("lng") is not None else d.get("lon"),
    ]
    if policy.include_accommodation:
        # Wave 2: day accommodation. Bound directly — the modern client
        # always sends the full day object, so a set value round-trips
        # and an unset one stays NULL.
        cols += ", accommodation, accommodation_place_id, accommodation_address"
        set_clause += """
            accommodation=excluded.accommodation,
            accommodation_place_id=excluded.accommodation_place_id,
            accommodation_address=excluded.accommodation_address,"""
        params += [
            d.get("accommodation"),
            d.get("accommodationPlaceId"),
            d.get("accommodationAddress"),
        ]

    if policy.stamp_insert_updated_at:
        cols += ", updated_at"
        values_sql = ", ".join(["?"] * (len(params))) + ", strftime('%Y-%m-%d %H:%M:%f', 'now')"
    else:
        values_sql = ", ".join(["?"] * len(params))

    # SY5 tombstone guard on every path; R8-B4 atomic staleness gate on
    # the strict path only.
    where_sql = "WHERE trip_days.deleted_at IS NULL"
    if policy.concurrency == "gate_409":
        where_sql += " AND (? IS NULL OR trip_days.updated_at IS NULL OR trip_days.updated_at = ?)"
        params += [client_updated_at, client_updated_at]

    try:
        cursor.execute(
            f'''
            INSERT INTO trip_days ({cols})
            VALUES ({values_sql})
            ON CONFLICT(id) DO UPDATE SET{set_clause}
                updated_at=strftime('%Y-%m-%d %H:%M:%f', 'now')
            {where_sql}
        ''',
            params,
        )
    except sqlite3.IntegrityError as exc:
        # Partial UNIQUE(trip_id, day_number) collision — two clients
        # racing for the same slot. Strict → 409 so the frontend can
        # resync and pick a fresh number (4.8 audit DAY-1: match the
        # COLUMN name SQLite actually puts in the message, keep the
        # index name as belt-and-braces). Bulk → skip the row (pre-Wave-B
        # this was an unhandled 500 mid-sync).
        exc_s = str(exc)
        if "trip_days.day_number" in exc_s or "idx_trip_days_trip_day_number" in exc_s:
            return _fail(
                policy.strict,
                "A day with that day_number already exists on this trip",
                409,
            )
        raise

    # ── strict-path stale/tombstone disambiguation (R8-B4) ──
    if policy.concurrency == "gate_409" and existing and cursor.rowcount == 0:
        cursor.execute("SELECT * FROM trip_days WHERE id = ?", (day_id,))
        live = cursor.fetchone()
        if live and not live["deleted_at"]:
            return UpsertResult(
                ok=False,
                error="Stale edit — another device updated this day",
                status=409,
                extra={"current": dict(live)},
            )
        # Tombstoned — silent no-op success (pre-fix semantic preserved).

    result = UpsertResult(ok=True)
    if policy.strict:
        cursor.execute("SELECT updated_at FROM trip_days WHERE id = ?", (day_id,))
        row = cursor.fetchone()
        result.updated_at = row["updated_at"] if row else None
    return result
