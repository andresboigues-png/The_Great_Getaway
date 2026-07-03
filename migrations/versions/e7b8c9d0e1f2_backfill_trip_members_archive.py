"""backfill trip_members.is_archived from trips.is_archived (audit H1+H4)

Revision ID: e7b8c9d0e1f2
Revises: d6a7b8c9d0e1
Create Date: 2026-05-18 18:30:00.000000

Achievements, feed events, public profile, and admin stats now read
archive state from `trip_members.is_archived` (per-user) instead of
the legacy owner-only `trips.is_archived` mirror. Existing prod
data was written under the old model: every owner-archived trip
has `trips.is_archived = 1` but the matching `trip_members` row may
still carry `is_archived = 0` if the archive endpoint pre-dated the
mirror-also-to-trip_members behaviour.

Without a backfill, the deploy flips silently:
  - Owner who had `archivist` + `globe_trotter_3` from archived trips
    would see those badges REVOKED on the next /api/data poll (the
    new query reads tm.is_archived = 0 for legacy owner-archived
    trips).
  - Feed's `friend_archived_trip` events disappear for friends whose
    archived trips pre-date the mirror.

This migration:

1. Backfills any missing owner rows in `trip_members` for trips that
   have `trips.user_id` set but no matching member row (defensive —
   should be a no-op after the e1b8d2a3c4f5 FK migration's audit).

2. Copies `trips.is_archived` → `trip_members.is_archived` for the
   OWNER's row of every trip. Idempotent: re-running is harmless
   because it's a deterministic UPDATE.

Non-owner member rows are left alone — they already carry the
per-user archive state set by /api/trips/<id>/archive when the
member archived their own copy.

Downgrade is a no-op: there's no signal to use to "un-backfill" a
trip_members row (the source we backfilled from is still there in
trips.is_archived; reverting would just leave the per-user flag in
its (correctly-set) post-backfill state, which is fine).
"""
from collections.abc import Sequence

from alembic import op

revision: str = 'e7b8c9d0e1f2'
down_revision: str | Sequence[str] | None = 'd6a7b8c9d0e1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── (1) backfill missing owner member rows ──────────────────
    # Should be a no-op after e1b8d2a3c4f5's FK enforcement audit
    # (which ran fk_audit.py against the live DB and reported zero
    # orphans), but cheap insurance: insert OR IGNORE so existing
    # rows are preserved untouched.
    # invited_by is NULL for owner self-rows — nobody invited the owner;
    # they created the trip. Pre-fix this stamped t.user_id (owner →
    # owner), which made "X invited Y" copy round-trip nonsense for the
    # owner's own row. Cleaned up in the follow-up migration
    # `null_owner_self_invited_by`.
    op.execute(
        """
        INSERT OR IGNORE INTO trip_members
            (trip_id, user_id, role, is_archived, invitation_status, invited_by)
        SELECT t.id, t.user_id, 'planner',
               COALESCE(t.is_archived, 0),
               'accepted', NULL
        FROM trips t
        WHERE t.user_id IS NOT NULL
        """
    )

    # ── (2) sync trips.is_archived → trip_members.is_archived for
    # the OWNER's row. The non-owner member rows are NOT touched
    # (they carry the per-user state from /api/trips/<id>/archive
    # which already lived on trip_members pre-migration).
    op.execute(
        """
        UPDATE trip_members
        SET is_archived = (
            SELECT COALESCE(t.is_archived, 0)
            FROM trips t
            WHERE t.id = trip_members.trip_id
              AND t.user_id = trip_members.user_id
        )
        WHERE EXISTS (
            SELECT 1 FROM trips t
            WHERE t.id = trip_members.trip_id
              AND t.user_id = trip_members.user_id
        )
        """
    )


def downgrade() -> None:
    # The backfilled state IS the correct state for the per-user
    # model — there's no way to "undo" the sync because the source
    # column (trips.is_archived) is still where it was. Leaving the
    # trip_members rows as-is.
    pass
