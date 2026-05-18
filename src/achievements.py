"""Achievements / Badges — FIXING_ROADMAP §4.4.

Pure-Python registry of badge definitions + a single
`check_user_achievements(cursor, user_id)` entry point that returns the
list of NEWLY earned badges. Idempotent — re-running the rules is safe
because UNIQUE(user_id, badge_id) on `user_achievements` short-circuits
duplicate inserts.

Architecture rationale (matches the §3.6 feed-registry pattern):
  - Each badge is a `BadgeDef` with id, label/emoji/description copy,
    and a `check(cursor, user_id) -> dict | None` rule.
  - The `check` returns either None (not earned) or a small dict that
    becomes the row's `context_json` (e.g. `{"countryCount": 5}` for
    the globe-trotter tiers, so the renderer can show the count).
  - `BADGES` is a list; `check_user_achievements` walks it and inserts
    every newly earned row in a single transaction.
  - Adding a new badge = append one `BadgeDef`. No surgery in the
    detection loop.

Detection runs on /api/data (cheap polling cadence, naturally covers
the "after trips changed" moment) and on the few write endpoints that
can plausibly unlock something (trip create, friend accept, feed share,
settlement create). Each check is a single SQL count — even running
them all on every /api/data is well under a millisecond.

A `notify_on_unlock(cursor, user_id, badges)` helper drops a
notification row for each newly earned badge so the user sees the
unlock in their bell dropdown on the next poll.

Locale note: copy is English-only for the v1 ship. The frontend
renderer can re-key off `badge_id` once i18n catches up.
"""

import json
from dataclasses import dataclass
from typing import Callable, Optional

from observability import get_logger, log_extra


logger = get_logger(__name__)


@dataclass
class BadgeDef:
    """One badge: stable id + display copy + a check function.

    `check(cursor, user_id)` returns either:
      - None: not earned (or already earned — the caller short-circuits
        before invoking check, but the rule can also return None
        defensively)
      - dict: a small context payload stored as `context_json` on the
        earned row. Keys vary per badge — the renderer reads the badge's
        documented fields. Empty dict is fine for context-less badges.
    """
    id: str
    emoji: str
    label: str
    description: str
    check: Callable[..., Optional[dict]]


# ── Individual rules ─────────────────────────────────────────────────
#
# Each rule is a small SQL count or aggregate. Return None when the
# threshold isn't met, a dict otherwise. The dict becomes context_json
# on the earned row.


def _check_first_trip(cursor, user_id):
    """One COMPLETED trip you own. Per the 2026-05-18 rule change,
    every trip-based badge counts only currently-archived trips so an
    un-archive reverts progress until the trip is completed again.
    `first_trip` therefore overlaps with `archivist` at the trigger
    level but stays in the registry as the "headline" milestone for
    the badges UI."""
    cursor.execute(
        "SELECT COUNT(*) AS c FROM trips "
        "WHERE user_id = ? AND COALESCE(is_archived, 0) = 1",
        (user_id,),
    )
    row = cursor.fetchone()
    return {} if (row and row["c"] >= 1) else None


def _check_archivist(cursor, user_id):
    """First archived trip — you finished one."""
    cursor.execute(
        "SELECT COUNT(*) AS c FROM trips WHERE user_id = ? AND COALESCE(is_archived, 0) = 1",
        (user_id,),
    )
    row = cursor.fetchone()
    return {} if (row and row["c"] >= 1) else None


def _country_count(cursor, user_id) -> int:
    """Distinct countries across the user's trips. A trip's full
    country set comes from EITHER the scalar `country_code` (primary
    pick) OR the per-leg entries in `trip_countries_json` (§4.3 multi-
    country: Portugal+Spain trip yields both 'PT' and 'ES'). Falls
    back to LOWER(country) for trips without a code (pre-Places
    migration legacy rows).

    Implemented as a UNION over two sub-queries so SQLite's `json_each`
    on the multi-country array stays an additive layer rather than
    forcing a per-row Python expansion. The DISTINCT in the outer
    SELECT dedupes a code that appears in BOTH a trip's primary and
    its array (the upsert writes the primary into position 0 of the
    array, so this is the common case for §4.3-aware trips).
    """
    cursor.execute(
        """
        WITH all_codes AS (
            -- Primary key per trip: country_code if present, else
            -- LOWER(country). Same shape as the pre-§4.3 query so
            -- legacy trips keep contributing exactly one row.
            -- `is_archived = 1` filter scopes the count to CURRENTLY
            -- completed trips (2026-05-18 rule change — restoring an
            -- archived trip should drop it from the achievement count).
            SELECT COALESCE(NULLIF(UPPER(country_code), ''), LOWER(country)) AS code
            FROM trips
            WHERE user_id = ?
              AND COALESCE(country, '') != ''
              AND COALESCE(is_archived, 0) = 1

            UNION

            -- Additional codes from the multi-country array. Only
            -- joins rows where trip_countries_json is populated, so
            -- legacy trips contribute zero rows from this branch.
            -- json_each emits a row per array element; `je.value` is
            -- the raw string. Server upserts already upper-cased
            -- these but UPPER() is cheap and idempotent.
            SELECT UPPER(je.value) AS code
            FROM trips, json_each(trips.trip_countries_json) AS je
            WHERE trips.user_id = ?
              AND trips.trip_countries_json IS NOT NULL
              AND COALESCE(trips.is_archived, 0) = 1
        )
        SELECT COUNT(DISTINCT code) AS c FROM all_codes WHERE code != ''
        """,
        (user_id, user_id),
    )
    row = cursor.fetchone()
    return row["c"] if row else 0


def _make_globe_trotter_check(threshold: int):
    """Factory — different thresholds share one body."""
    def _check(cursor, user_id):
        n = _country_count(cursor, user_id)
        return {"countryCount": n} if n >= threshold else None
    return _check


def _check_repeat_country(cursor, user_id):
    """Visited the same country (by country_code or country name) on
    2+ trips. Encourages domestic / repeat-destination travel (the
    "internal tourism" call-out from FIXING_ROADMAP)."""
    cursor.execute(
        "SELECT COALESCE(NULLIF(country_code, ''), LOWER(country)) AS key, COUNT(*) AS c "
        "FROM trips "
        "WHERE user_id = ? "
        "  AND COALESCE(country, '') != '' "
        "  AND COALESCE(is_archived, 0) = 1 "
        "GROUP BY key "
        "HAVING c >= 2 "
        "ORDER BY c DESC LIMIT 1",
        (user_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {"countryKey": row["key"], "tripCount": row["c"]}


def _check_social_butterfly(cursor, user_id):
    """3+ mutual-follow relationships — the Model B equivalent of the
    pre-fix "3+ accepted friends" threshold. Pre-Model-B this read
    the legacy `friends` table; now it counts mutuals (the natural
    "friend"-equivalent under the follows-only graph)."""
    from social import mutuals_of
    count = len(mutuals_of(cursor, user_id))
    return {"friendCount": count} if count >= 3 else None


def _check_first_share(cursor, user_id):
    """First time the user shared a trip on the feed (feed_posts row
    they authored, regardless of whether it's been since-deleted —
    earning a badge sticks)."""
    cursor.execute(
        "SELECT 1 FROM feed_posts WHERE user_id = ? LIMIT 1",
        (user_id,),
    )
    return {} if cursor.fetchone() else None


def _check_first_settle_up(cursor, user_id):
    """First settle-up where the user is either party — uses the §4.5
    `settlements` table that just landed. Demonstrates the §3.6 registry
    + §4.5 schema both ship value in concert."""
    cursor.execute(
        "SELECT 1 FROM settlements "
        "WHERE from_user_id = ? OR to_user_id = ? LIMIT 1",
        (user_id, user_id),
    )
    return {} if cursor.fetchone() else None


# ── §4.4 badge-variety expansion (2026-05-17) ─────────────────────────
#
# Adds 6 badge types per the roadmap call-out:
#   - globe_trotter_50: countries tier extension (matches 3/10/25)
#   - longest_trip / priciest_trip / most_companions: single-trip
#     achievements with conservative thresholds (14 days / €1000 /
#     5 companions). Each picks the user's max-by-metric trip so the
#     context_json carries the winning trip identity.
#   - intra_country_3: extends repeat_country (≥2 → ≥3) for users
#     who really commit to a destination.
#   - back_to_back: 2 consecutive calendar months with a trip —
#     entry-level streak award. Future tiers can add 3/6/12-month
#     streaks following the same pattern.
#
# Thresholds are calibrated for "achievable but not trivial":
# entry-stage users (1-2 trips) don't earn these immediately; users
# with 10+ trips earn a meaningful subset.


# Spend threshold for the priciest-trip badge, in EUR. Reasonable
# real-world floor — a weekend city break easily clears it; a day
# trip doesn't.
_PRICIEST_TRIP_EUR = 1000.0

# Day count for the longest-trip badge. A 2-week trip stands out
# against the typical 3-5 day pattern.
_LONGEST_TRIP_DAYS = 14

# Companion count for the most-companions badge. Owner-not-counted
# (companions array is "other people", roster shape).
_MOST_COMPANIONS = 5


def _check_longest_trip(cursor, user_id):
    """Owned a trip with ≥14 days. Counts trip_days rows per trip;
    picks the user's longest. The day count includes Day 0 (anchor)
    since that's how the planner presents the trip length to the
    user — "12 days of adventure" includes the anchor."""
    cursor.execute(
        "SELECT t.id, t.name, COUNT(td.id) AS days "
        "FROM trips t "
        "LEFT JOIN trip_days td ON td.trip_id = t.id "
        "WHERE t.user_id = ? AND COALESCE(t.is_archived, 0) = 1 "
        "GROUP BY t.id "
        "HAVING days >= ? "
        "ORDER BY days DESC LIMIT 1",
        (user_id, _LONGEST_TRIP_DAYS),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {
        "tripId": row["id"],
        "tripName": row["name"] or "",
        "days": row["days"],
    }


def _check_priciest_trip(cursor, user_id):
    """Owned a trip with total recorded spend ≥ €1000. Sums
    expenses.euro_value (cross-currency normalised) per trip. Note:
    settlement rows that pre-date the §4.5 dual-write retirement
    can still appear in `expenses` with a "Settlement:" label and
    would inflate the sum slightly; the threshold is high enough
    that this isn't worth filtering for. New settlements (post-§4.5)
    live in the settlements table and naturally don't double-count
    here."""
    cursor.execute(
        "SELECT t.id, t.name, COALESCE(SUM(e.euro_value), 0) AS spend "
        "FROM trips t "
        "LEFT JOIN expenses e ON e.trip_id = t.id "
        "WHERE t.user_id = ? AND COALESCE(t.is_archived, 0) = 1 "
        "GROUP BY t.id "
        "HAVING spend >= ? "
        "ORDER BY spend DESC LIMIT 1",
        (user_id, _PRICIEST_TRIP_EUR),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {
        "tripId": row["id"],
        "tripName": row["name"] or "",
        # Round to whole euros for display — the badge tooltip doesn't
        # need 1234.5678 precision.
        "spendEur": round(row["spend"]),
    }


def _check_most_companions(cursor, user_id):
    """Owned a trip with ≥5 companions in its roster (companions_json).
    Counts the JSON array length defensively — malformed / null rows
    are skipped rather than raising. Uses Python parsing (vs SQLite's
    json_array_length) because some older trip rows have non-array
    values from earlier schema iterations."""
    cursor.execute(
        "SELECT id, name, companions_json FROM trips "
        "WHERE user_id = ? AND COALESCE(is_archived, 0) = 1",
        (user_id,),
    )
    best = None
    for row in cursor.fetchall():
        raw = row["companions_json"]
        if not raw:
            continue
        try:
            companions = json.loads(raw)
        except (json.JSONDecodeError, TypeError, ValueError):
            continue
        if not isinstance(companions, list):
            continue
        n = len(companions)
        if n < _MOST_COMPANIONS:
            continue
        if best is None or n > best["count"]:
            best = {
                "tripId": row["id"],
                "tripName": row["name"] or "",
                "count": n,
            }
    return best


def _check_intra_country_3(cursor, user_id):
    """Visited the same country on 3+ trips. Extends repeat_country
    (≥2). Promotes deep-dive travel patterns (regulars, locals,
    domestic). Same key-normalisation as repeat_country."""
    cursor.execute(
        "SELECT COALESCE(NULLIF(country_code, ''), LOWER(country)) AS key, COUNT(*) AS c "
        "FROM trips "
        "WHERE user_id = ? "
        "  AND COALESCE(country, '') != '' "
        "  AND COALESCE(is_archived, 0) = 1 "
        "GROUP BY key "
        "HAVING c >= 3 "
        "ORDER BY c DESC LIMIT 1",
        (user_id,),
    )
    row = cursor.fetchone()
    if not row:
        return None
    return {"countryKey": row["key"], "tripCount": row["c"]}


def _check_back_to_back(cursor, user_id):
    """Trips in 2 consecutive calendar months. Uses trips.created_at
    grouped by YYYY-MM and walks the sorted list looking for an
    adjacent pair. Crosses year boundaries correctly (Dec/Jan).

    First streak found wins — the badge fires once, even if the user
    has multiple streaks across their history. Future tiers (3-month,
    year-long) can extend this with longer-streak rules using the
    same DISTINCT-month scaffold."""
    cursor.execute(
        "SELECT DISTINCT strftime('%Y-%m', created_at) AS ym "
        "FROM trips "
        "WHERE user_id = ? "
        "  AND created_at IS NOT NULL "
        "  AND COALESCE(is_archived, 0) = 1 "
        "ORDER BY ym",
        (user_id,),
    )
    months = [r["ym"] for r in cursor.fetchall() if r["ym"]]
    for i in range(len(months) - 1):
        try:
            y1, m1 = (int(p) for p in months[i].split("-"))
            y2, m2 = (int(p) for p in months[i + 1].split("-"))
        except (ValueError, AttributeError):
            # Malformed YYYY-MM from a corrupted created_at — skip
            # the pair rather than raise.
            continue
        adjacent = (y1 == y2 and m1 + 1 == m2) or (
            y1 + 1 == y2 and m1 == 12 and m2 == 1
        )
        if adjacent:
            return {"firstMonth": months[i], "secondMonth": months[i + 1]}
    return None


# ── Registry ─────────────────────────────────────────────────────────
#
# Order is the display order on the profile badge strip. Newer badges
# at the bottom so a profile re-render doesn't reshuffle the strip
# visually when we extend the list.


BADGES: list[BadgeDef] = [
    BadgeDef(
        id="first_trip",
        emoji="🧳",
        label="First Trip",
        description="Completed your first trip.",
        check=_check_first_trip,
    ),
    BadgeDef(
        id="archivist",
        emoji="📚",
        label="Archivist",
        description="Marked a trip complete.",
        check=_check_archivist,
    ),
    BadgeDef(
        id="globe_trotter_3",
        emoji="🌍",
        label="Globe Trotter — 3 countries",
        description="Completed trips to 3 distinct countries.",
        check=_make_globe_trotter_check(3),
    ),
    BadgeDef(
        id="globe_trotter_10",
        emoji="🌏",
        label="Globe Trotter — 10 countries",
        description="Completed trips to 10 distinct countries.",
        check=_make_globe_trotter_check(10),
    ),
    BadgeDef(
        id="globe_trotter_25",
        emoji="🌐",
        label="Globe Trotter — 25 countries",
        description="Completed trips to 25 distinct countries.",
        check=_make_globe_trotter_check(25),
    ),
    BadgeDef(
        id="repeat_country",
        emoji="📍",
        label="Local Hero",
        description="Completed two trips to the same country — repeat-destination respect.",
        check=_check_repeat_country,
    ),
    BadgeDef(
        id="social_butterfly",
        emoji="🦋",
        label="Social Butterfly",
        description="Connected with 3 friends.",
        check=_check_social_butterfly,
    ),
    BadgeDef(
        id="first_share",
        emoji="📣",
        label="Storyteller",
        description="Shared your first trip on the feed.",
        check=_check_first_share,
    ),
    BadgeDef(
        id="first_settle_up",
        emoji="🤝",
        label="Square Deal",
        description="Closed the loop on a settle-up.",
        check=_check_first_settle_up,
    ),
    # ── §4.4 badge-variety expansion (2026-05-17) ─────────────────
    # Appended to the registry tail so profile badge strips re-render
    # without reshuffling existing rows — earned badges keep their
    # display position.
    BadgeDef(
        id="globe_trotter_50",
        emoji="🪐",
        label="Globe Trotter — 50 countries",
        description="Completed trips to 50 distinct countries.",
        check=_make_globe_trotter_check(50),
    ),
    BadgeDef(
        id="intra_country_3",
        emoji="🏡",
        label="Homebody Explorer",
        description="Completed 3+ trips to the same country — you really know the place.",
        check=_check_intra_country_3,
    ),
    BadgeDef(
        id="longest_trip",
        emoji="🛤️",
        label="Long Hauler",
        description=f"Completed a trip ≥{_LONGEST_TRIP_DAYS} days long.",
        check=_check_longest_trip,
    ),
    BadgeDef(
        id="priciest_trip",
        emoji="💎",
        label="Big Spender",
        description=f"Completed a trip with €{int(_PRICIEST_TRIP_EUR):,}+ recorded spend.",
        check=_check_priciest_trip,
    ),
    BadgeDef(
        id="most_companions",
        emoji="👥",
        label="Squad Leader",
        description=f"Completed a trip with {_MOST_COMPANIONS}+ companions on the roster.",
        check=_check_most_companions,
    ),
    BadgeDef(
        id="back_to_back",
        emoji="🔁",
        label="Back to Back",
        description="Completed trips in two consecutive calendar months.",
        check=_check_back_to_back,
    ),
]


# Lookup table for the feed / notification copy. Keyed by badge_id
# so callers (feed builder, frontend) can pull copy without re-traversing
# the BADGES list.
BADGES_BY_ID: dict[str, BadgeDef] = {b.id: b for b in BADGES}


# ── Detection ────────────────────────────────────────────────────────


def check_user_achievements(cursor, user_id: str) -> list[dict]:
    """Re-evaluate every BADGE rule for the user. Returns the list of
    NEWLY earned badges (those that weren't already in
    `user_achievements`). Caller is responsible for the conn.commit() —
    we only stage inserts + deletes.

    Pre-2026-05-18 the loop SKIPPED already-earned badges and never
    revoked anything; achievements were therefore "sticky" — once
    earned, always present. That broke the 2026-05-18 rule change
    that all trip-based badges should only count CURRENTLY archived
    trips. Now every rule re-runs every poll: passing rules insert
    (idempotent via UNIQUE), failing rules whose badge IS already
    present get DELETED. Cost is a handful of single-row SQL counts
    per poll — well under a millisecond even for the busy badge set.

    Revocations are SILENT (no notification dropped) — losing a badge
    is a passive side-effect of mutating trip state, not an event the
    user "earned". The frontend will simply stop rendering the badge
    on the next /api/data refresh. Re-earning a previously revoked
    badge generates a fresh `achievement_unlocked` notification the
    same way as a first-time unlock.

    The return shape is a list of dicts:
        [{"badgeId": "...", "context": {...}, "label": "...",
          "emoji": "...", "description": "..."}]
    so the caller can both notify on each new unlock AND surface the
    new earnings in the /api/data response without a second pass.
    """
    if not user_id:
        return []

    # Cheap pre-fetch: which badges does this user already have? One
    # query is cheaper than per-badge "do they have this?" round-trips.
    cursor.execute(
        "SELECT badge_id FROM user_achievements WHERE user_id = ?",
        (user_id,),
    )
    already_earned = {r["badge_id"] for r in cursor.fetchall()}

    newly_earned: list[dict] = []
    to_revoke: list[str] = []
    for badge in BADGES:
        try:
            context = badge.check(cursor, user_id)
        except Exception as e:
            # Don't let a bad rule poison the whole detection sweep —
            # log the badge id + skip. The other rules still run, and
            # this badge is re-evaluated on the next /api/data call.
            # Deliberately do NOT revoke on rule failure — a transient
            # SQL error shouldn't strip an earned badge.
            logger.warning(
                "achievement rule failed: %s",
                badge.id,
                exc_info=True,
                extra=log_extra(user_id=user_id, badge_id=badge.id),
            )
            continue
        if context is None:
            # Rule no longer (or not yet) passes. Queue a revoke if
            # the user had previously earned it — un-archiving a trip
            # is the canonical trigger for this branch.
            if badge.id in already_earned:
                to_revoke.append(badge.id)
            continue
        # Rule passes. Skip insert if already earned (saves a write).
        if badge.id in already_earned:
            continue
        # Insert. UNIQUE(user_id, badge_id) makes this idempotent across
        # concurrent /api/data polls; one of them wins, the other no-ops.
        try:
            cursor.execute(
                "INSERT OR IGNORE INTO user_achievements "
                "(user_id, badge_id, context_json) VALUES (?, ?, ?)",
                (user_id, badge.id, json.dumps(context) if context else None),
            )
            # If a parallel poll already inserted, rowcount is 0 — we
            # skip the "newly earned" return so we don't double-notify.
            if cursor.rowcount > 0:
                newly_earned.append({
                    "badgeId": badge.id,
                    "context": context,
                    "label": badge.label,
                    "emoji": badge.emoji,
                    "description": badge.description,
                })
        except Exception as e:
            logger.warning(
                "achievement insert failed: %s",
                badge.id,
                exc_info=True,
                extra=log_extra(user_id=user_id, badge_id=badge.id),
            )

    if to_revoke:
        # One DELETE per badge — keeps the SQL trivial and the count is
        # almost always 0 or 1 in practice. Notifications are NOT
        # cleared; the original unlock notif stays in the bell history
        # (it accurately records that the badge was earned at that
        # moment in time).
        cursor.executemany(
            "DELETE FROM user_achievements WHERE user_id = ? AND badge_id = ?",
            [(user_id, bid) for bid in to_revoke],
        )
        logger.info(
            "achievements revoked",
            extra=log_extra(user_id=user_id, badge_ids=to_revoke),
        )

    if newly_earned:
        logger.info(
            "achievements unlocked",
            extra=log_extra(
                user_id=user_id,
                badge_ids=[b["badgeId"] for b in newly_earned],
            ),
        )
    return newly_earned


def notify_achievements(cursor, user_id: str, newly_earned: list[dict]) -> None:
    """Drop one notification row per newly earned badge. Called by
    /api/data after check_user_achievements returns the list of new
    unlocks. Skips when the list is empty.

    Title format: "Achievement unlocked" — keeps the bell dropdown's
    title row stable so the user learns the pattern. Message carries
    the badge-specific copy."""
    if not newly_earned:
        return
    for badge in newly_earned:
        cursor.execute(
            "INSERT INTO notifications "
            "(user_id, type, title, related_id, message, is_read) "
            "VALUES (?, 'achievement_unlocked', 'Achievement unlocked', ?, ?, 0)",
            (user_id, badge["badgeId"], f"{badge['emoji']} {badge['label']}"),
        )


def list_user_achievements(cursor, user_id: str) -> list[dict]:
    """Read-only listing for /api/user-status + /api/public-profile.
    Joins each row against the BADGES_BY_ID registry so missing copy
    (e.g. a badge that was renamed) degrades gracefully — the row still
    returns its id + earned_at, just with empty display fields."""
    cursor.execute(
        "SELECT badge_id, earned_at, context_json FROM user_achievements "
        "WHERE user_id = ? ORDER BY earned_at ASC",
        (user_id,),
    )
    out = []
    for row in cursor.fetchall():
        bdef = BADGES_BY_ID.get(row["badge_id"])
        try:
            context = json.loads(row["context_json"]) if row["context_json"] else {}
        except (json.JSONDecodeError, TypeError):
            context = {}
        out.append({
            "badgeId": row["badge_id"],
            "earnedAt": row["earned_at"],
            "context": context,
            "label": bdef.label if bdef else row["badge_id"],
            "emoji": bdef.emoji if bdef else "🏅",
            "description": bdef.description if bdef else "",
        })
    return out
