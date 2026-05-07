"""Shared route helpers.

Phase B4 lifts cross-route helpers out of `main.py` so blueprints can
import them without dragging the entire `main.py` import graph
(circular). Each helper here is small + pure (no app/db dependencies
beyond the get_db context manager).

Permission helpers take an open `cursor` so the caller controls the
transaction — keeps these helpers free of their own connection
acquisition and lets a multi-step caller stay inside one BEGIN/COMMIT.
"""

import json


def ensure_owner_member_row(cursor, trip_id, owner_id):
    """Idempotent: makes sure the trip's owner has a planner-role member
    row. Called from /api/trips upsert and from /api/sync's trip loop."""
    cursor.execute(
        "INSERT OR IGNORE INTO trip_members "
        "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
        "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
        (trip_id, owner_id, owner_id),
    )


def trip_member_role(cursor, trip_id, user_id):
    """Returns the user's role on the trip ('planner' / 'relaxer' /
    future extensions) or None if they aren't an accepted member.
    Owners always return 'planner' even if their member row hasn't been
    backfilled yet (defensive — a missing owner row is a bug, not a
    permission boundary)."""
    cursor.execute(
        "SELECT role, invitation_status FROM trip_members WHERE trip_id = ? AND user_id = ?",
        (trip_id, user_id),
    )
    row = cursor.fetchone()
    if row and row["invitation_status"] == "accepted":
        return row["role"]
    # Owner fallback — a write to a freshly-created trip might land
    # before the owner-row backfill; treat owners as planners regardless.
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    trip_row = cursor.fetchone()
    if trip_row and trip_row["user_id"] == user_id:
        return "planner"
    return None


def can_edit_trip(cursor, trip_id, user_id):
    """Planner-only gate for trip-level writes (rename, days, metadata).
    Budgeteers are NOT allowed here — they only edit expenses (see
    `can_edit_expenses`)."""
    role = trip_member_role(cursor, trip_id, user_id)
    return role == "planner"


def can_edit_expenses(cursor, trip_id, user_id):
    """Planners + Budgeteers can write expenses; Relaxers cannot.
    The Budgeteer role exists for trips where one person handles money
    but the rest of the planning is locked down."""
    role = trip_member_role(cursor, trip_id, user_id)
    return role in ("planner", "budgeteer")


def is_trip_owner(cursor, trip_id, user_id):
    cursor.execute("SELECT user_id FROM trips WHERE id = ?", (trip_id,))
    row = cursor.fetchone()
    return bool(row and row["user_id"] == user_id)


def ensure_user_exists(cursor, user_id):
    """Audit gate — used by friend-add / invite flows so callers can't
    create rows referencing nonexistent user_ids."""
    cursor.execute("SELECT 1 FROM users WHERE id = ?", (user_id,))
    return cursor.fetchone() is not None


def unwrap_legacy_plan_text(s):
    """Some legacy trip_days rows have morning/afternoon/evening stored
    as JSON-encoded strings (`'""'` for empty, `'"foo"'` for non-empty)
    because the old write path wrapped plain text with json.dumps.
    This detects that pattern and unwraps so the frontend sees clean
    text. Idempotent — passes through plain strings unchanged."""
    if not isinstance(s, str):
        return s or ''
    # Cheap shape check before json.loads — only attempt parse when
    # the string looks like a JSON-quoted scalar (starts AND ends
    # with double-quote). Avoids paying for the parse on the common
    # already-clean path.
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        try:
            parsed = json.loads(s)
            if isinstance(parsed, str):
                return parsed
        except Exception:
            pass
    return s
