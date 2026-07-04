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
from collections.abc import Callable
from dataclasses import dataclass

from helpers import insert_notification
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
    check: Callable[..., dict | None]
    # MK6 P3: a "milestone" badge that, once earned, is NEVER soft-revoked even
    # if its check later returns None (the underlying row was deleted). Used for
    # first_share / first_settle_up — "earning sticks", per their docstrings.
    # Threshold badges (N friends, N trips) stay revocable and leave this False.
    sticky: bool = False


# ── Individual rules ─────────────────────────────────────────────────
#
# Each rule is a small SQL count or aggregate. Return None when the
# threshold isn't met, a dict otherwise. The dict becomes context_json
# on the earned row.


# 2026-05-18 audit H1+H4: every trip-based check now reads
# `trip_members.is_archived` instead of `trips.is_archived`. Two
# reasons:
#   1. `trip_members.is_archived` is per-user; `trips.is_archived`
#      is owner-only. A non-owner member archiving their copy never
#      reached the legacy column, so a member of a 5-country group
#      trip was invisible to the owner-scoped query AND couldn't
#      earn badges for joint trips.
#   2. The post-2026-05-18 rule ("only count CURRENTLY archived
#      trips") is genuinely per-user — un-archiving your copy
#      should drop YOUR badge progress even if other members still
#      have their copy archived.
# Joining trip_members + filtering on invitation_status = 'accepted'
# gives the right semantic: a user earns a badge from every trip
# they actively joined (owner or invited) and have currently
# archived for themselves.


def _check_first_trip(cursor, user_id):
    """One trip in your membership (owner or invited, accepted).
    Archive state is NOT required: `first_trip` is the welcome-aboard
    milestone — earned as soon as you've started planning a trip. It's
    deliberately the only trip-based badge that doesn't require a
    completed trip, so a brand-new user sees a green dot the moment
    they create their first plan.

    `archivist` is the post-completion mirror ("you finished one") —
    the two badges line up as a "started → completed" pair on the
    profile strip. Pre-2026-05-19 first_trip was changed to require
    archived too, which made it a trigger-identical duplicate of
    archivist; this restores the distinction."""
    cursor.execute(
        "SELECT COUNT(*) AS c "
        "FROM trip_members tm "
        "WHERE tm.user_id = ? "
        "  AND tm.invitation_status = 'accepted'",
        (user_id,),
    )
    row = cursor.fetchone()
    return {} if (row and row["c"] >= 1) else None


def _check_archivist(cursor, user_id):
    """First archived trip — you finished one. Counts any trip you're
    an accepted member of and have currently archived for yourself
    (post-2026-05-18: members archive their own copy independently
    of the owner)."""
    cursor.execute(
        "SELECT COUNT(*) AS c "
        "FROM trip_members tm "
        "WHERE tm.user_id = ? "
        "  AND tm.invitation_status = 'accepted' "
        "  AND COALESCE(tm.is_archived, 0) = 1",
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
    # H1+H4 (2026-05-18): JOIN via trip_members so members of joint
    # trips also earn the count, and the archive-state filter reads
    # the per-user `trip_members.is_archived` instead of the legacy
    # owner-only `trips.is_archived`. Both UNION branches share the
    # same join.
    cursor.execute(
        """
        WITH all_codes AS (
            -- Primary key per trip: country_code if present, else
            -- LOWER(country). Same shape as the pre-§4.3 query so
            -- legacy trips keep contributing exactly one row.
            SELECT COALESCE(NULLIF(UPPER(t.country_code), ''), LOWER(t.country)) AS code
            FROM trip_members tm
            JOIN trips t ON t.id = tm.trip_id
            WHERE tm.user_id = ?
              AND tm.invitation_status = 'accepted'
              AND COALESCE(tm.is_archived, 0) = 1
              AND COALESCE(t.country, '') != ''

            UNION

            -- Additional codes from the multi-country array. Only
            -- joins rows where trip_countries_json is populated, so
            -- legacy trips contribute zero rows from this branch.
            -- json_each emits a row per array element; `je.value` is
            -- the raw string. Server upserts already upper-cased
            -- these but UPPER() is cheap and idempotent.
            SELECT UPPER(je.value) AS code
            FROM trip_members tm
            JOIN trips t ON t.id = tm.trip_id, json_each(t.trip_countries_json) AS je
            WHERE tm.user_id = ?
              AND tm.invitation_status = 'accepted'
              AND COALESCE(tm.is_archived, 0) = 1
              AND t.trip_countries_json IS NOT NULL
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
    # R5-B3 fix: UPPER both branches so a trip stamped
    # country_code='PT' and another stamped country='Portugal'
    # collapse to the same key. Pre-fix the LOWER branch yielded
    # 'portugal' while the country_code branch yielded 'PT' so the
    # user never crossed the HAVING threshold despite genuinely
    # visiting Portugal twice.
    cursor.execute(
        "SELECT UPPER(TRIM(COALESCE(NULLIF(t.country_code, ''), t.country))) AS key, "
        "       COUNT(*) AS c "
        "FROM trip_members tm "
        "JOIN trips t ON t.id = tm.trip_id "
        "WHERE tm.user_id = ? "
        "  AND tm.invitation_status = 'accepted' "
        "  AND COALESCE(tm.is_archived, 0) = 1 "
        "  AND COALESCE(t.country, '') != '' "
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
        "SELECT 1 FROM settlements WHERE from_user_id = ? OR to_user_id = ? LIMIT 1",
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
        "FROM trip_members tm "
        "JOIN trips t ON t.id = tm.trip_id "
        "LEFT JOIN trip_days td ON td.trip_id = t.id "
        "WHERE tm.user_id = ? "
        "  AND tm.invitation_status = 'accepted' "
        "  AND COALESCE(tm.is_archived, 0) = 1 "
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
    # R3-Round 2 fix: exclude `is_settlement = 1` and tombstoned rows.
    # The R3-Fix #6 sweep moved euro_value to server-derived, but the
    # legacy comment was wrong about post-§4.5 settlements not being
    # in `expenses` — `is_settlement = 1` rows DO live alongside real
    # expenses in this table and inflate the "priciest trip" total
    # by their value. Filter them so the badge math matches the
    # frontend balance / PDF total / Insights aggregates.
    cursor.execute(
        "SELECT t.id, t.name, COALESCE(SUM(e.euro_value), 0) AS spend "
        "FROM trip_members tm "
        "JOIN trips t ON t.id = tm.trip_id "
        "LEFT JOIN expenses e ON e.trip_id = t.id "
        "  AND COALESCE(e.is_settlement, 0) = 0 "
        "  AND e.deleted_at IS NULL "
        "WHERE tm.user_id = ? "
        "  AND tm.invitation_status = 'accepted' "
        "  AND COALESCE(tm.is_archived, 0) = 1 "
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
        "SELECT t.id, t.name, t.companions_json "
        "FROM trip_members tm "
        "JOIN trips t ON t.id = tm.trip_id "
        "WHERE tm.user_id = ? "
        "  AND tm.invitation_status = 'accepted' "
        "  AND COALESCE(tm.is_archived, 0) = 1",
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
    # R5-B3 fix: UPPER both branches so a trip stamped
    # country_code='PT' and another stamped country='Portugal'
    # collapse to the same key. Pre-fix the LOWER branch yielded
    # 'portugal' while the country_code branch yielded 'PT' so the
    # user never crossed the HAVING threshold despite genuinely
    # visiting Portugal twice.
    cursor.execute(
        "SELECT UPPER(TRIM(COALESCE(NULLIF(t.country_code, ''), t.country))) AS key, "
        "       COUNT(*) AS c "
        "FROM trip_members tm "
        "JOIN trips t ON t.id = tm.trip_id "
        "WHERE tm.user_id = ? "
        "  AND tm.invitation_status = 'accepted' "
        "  AND COALESCE(tm.is_archived, 0) = 1 "
        "  AND COALESCE(t.country, '') != '' "
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
    """Trips in 2 consecutive calendar months. Walks the sorted list
    of YYYY-MM looking for an adjacent pair. Crosses year boundaries
    correctly (Dec/Jan).

    R5-B3 fix: uses MIN(trip_days.date) per trip as the trip's travel
    month, NOT trips.created_at. Pre-fix the badge fired for trips
    CREATED in adjacent months even if the actual travel happened a
    year apart — a user could create June + December trip records on
    the same day in January and pop the badge instantly. Now the
    travel-date signal is what matters. Trips with no scaffolded days
    fall back to trips.created_at as a defensive default (rare —
    the home flow always scaffolds days post-create).

    First streak found wins — the badge fires once, even if the user
    has multiple streaks across their history."""
    cursor.execute(
        "SELECT DISTINCT strftime('%Y-%m', "
        "    COALESCE("
        "        (SELECT MIN(date) FROM trip_days td "
        "         WHERE td.trip_id = t.id AND td.deleted_at IS NULL "
        "           AND td.date IS NOT NULL), "
        "        t.created_at"
        "    )"
        ") AS ym "
        "FROM trip_members tm "
        "JOIN trips t ON t.id = tm.trip_id "
        "WHERE tm.user_id = ? "
        "  AND tm.invitation_status = 'accepted' "
        "  AND COALESCE(tm.is_archived, 0) = 1 "
        "  AND t.created_at IS NOT NULL "
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
        adjacent = (y1 == y2 and m1 + 1 == m2) or (y1 + 1 == y2 and m1 == 12 and m2 == 1)
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
        description="Started planning your first trip.",
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
        sticky=True,  # MK6 P3: a first-time milestone — unsharing later must
        # not soft-revoke it ("earning sticks", per the docstring).
    ),
    BadgeDef(
        id="first_settle_up",
        emoji="🤝",
        label="Square Deal",
        description="Closed the loop on a settle-up.",
        check=_check_first_settle_up,
        sticky=True,  # MK6 P3: milestone — deleting the settlement doesn't revoke.
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


# R5-B3 perf P1: per-process per-user throttle for the achievement
# engine. Pre-fix the engine ran on every /api/data poll (every 15s
# per active tab × N users) — the dominant cost of the platform.
# Since badges only flip on user-initiated state changes (archive,
# share, settle, etc.), running the full sweep more than once a
# minute per user is pure overhead. The map is in-memory (no
# cross-worker sync) — a worker restart re-runs the sweep on the
# next poll, which is fine. Bounded growth: an LRU evict keeps the
# dict from growing without limit if many distinct users hit one
# worker. The throttle window is intentionally short (60s) so a
# user who just earned/revoked a badge sees the change reflected on
# their next poll or two — long enough to slash polling cost ~4x,
# short enough that "complete a trip → see badge" feels instant.
_ACHIEVEMENT_CHECK_TTL_SECONDS = 60
_ACHIEVEMENT_CHECK_LRU_MAX = 1024
_last_achievement_check: dict[str, float] = {}


def _should_run_achievement_check(user_id: str) -> bool:
    """True if enough time has elapsed since the last check for this
    user (or never). Updates the in-memory map as a side effect so
    callers can fire-and-forget.

    Test bypass: when GG_DISABLE_ACHIEVEMENT_THROTTLE is set OR when
    pytest is running (PYTEST_CURRENT_TEST in env), the throttle is
    disabled so tests can assert deterministic state changes on
    every poll without 60s sleeps. The throttle is a production
    perf optimization; tests need every poll to re-evaluate.
    """
    import os as _os

    if _os.environ.get("GG_DISABLE_ACHIEVEMENT_THROTTLE") or _os.environ.get("PYTEST_CURRENT_TEST"):
        return True
    import time as _time

    now = _time.time()
    last = _last_achievement_check.get(user_id, 0.0)
    if now - last < _ACHIEVEMENT_CHECK_TTL_SECONDS:
        return False
    if len(_last_achievement_check) >= _ACHIEVEMENT_CHECK_LRU_MAX:
        # Evict the single oldest entry — cheap O(N) on this scale.
        oldest = min(_last_achievement_check, key=_last_achievement_check.get)
        del _last_achievement_check[oldest]
    _last_achievement_check[user_id] = now
    return True


def force_recheck_achievements(user_id: str) -> None:
    """Public hook for mutating routes (archive, unarchive, share, etc.)
    to bust the throttle so the next /api/data poll re-runs the sweep
    even if the 60s window hasn't elapsed."""
    _last_achievement_check.pop(user_id, None)


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
    present get SOFT-revoked (revoked_at stamped).

    R5-B3 fix: revocation is now SOFT — we set `revoked_at = strftime(...)`
    instead of DELETEing the row. A subsequent re-earn finds the row
    still present (UNIQUE → INSERT OR IGNORE no-op) and clears
    revoked_at SILENTLY via the secondary UPDATE — no duplicate
    `achievement_unlocked` notification, no duplicate feed event spam.
    The frontend filter on revoked_at IS NULL hides revoked badges
    from the profile.

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
    # We pull revoked_at too so we can distinguish "active earn" from
    # "previously earned but revoked" — only the latter gets silent
    # re-activation; the former needs the genuine "newly earned" flow.
    cursor.execute(
        "SELECT badge_id, revoked_at FROM user_achievements WHERE user_id = ?",
        (user_id,),
    )
    rows = cursor.fetchall()
    active_earned = {r["badge_id"] for r in rows if r["revoked_at"] is None}
    revoked_earned = {r["badge_id"] for r in rows if r["revoked_at"] is not None}

    newly_earned: list[dict] = []
    to_revoke: list[str] = []
    to_reactivate: list[tuple[str, str | None]] = []  # (badge_id, context_json)
    for badge in BADGES:
        try:
            context = badge.check(cursor, user_id)
        except Exception:
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
            # Rule no longer (or not yet) passes. Queue a soft-revoke
            # if the user had previously earned it AND it's currently
            # active. Already-revoked rows stay revoked (no churn).
            # MK6 P3: milestone badges are STICKY — once earned they never
            # revoke, even if the underlying row (a feed_post / settlement) is
            # later deleted. Without this, unsharing your only trip stripped the
            # Storyteller badge you'd already been notified about + shown off.
            if badge.id in active_earned and not badge.sticky:
                to_revoke.append(badge.id)
            continue
        ctx_json = json.dumps(context) if context else None
        # Rule passes. Branch on prior state:
        #   - active_earned: idempotent — refresh context_json but no
        #     notify (the user already has this badge active).
        #   - revoked_earned: silent re-activation — clear revoked_at
        #     and refresh context. NO notification (already earned
        #     once at the earned_at timestamp; the user lost it then
        #     re-earned it — not a fresh "unlocked" event).
        #   - neither: first-ever earn — INSERT + notify.
        if badge.id in active_earned:
            continue
        if badge.id in revoked_earned:
            to_reactivate.append((badge.id, ctx_json))
            continue
        # First-ever earn. Insert. UNIQUE(user_id, badge_id) makes this
        # idempotent across concurrent /api/data polls; one of them
        # wins, the other no-ops.
        try:
            cursor.execute(
                "INSERT OR IGNORE INTO user_achievements "
                "(user_id, badge_id, context_json) VALUES (?, ?, ?)",
                (user_id, badge.id, ctx_json),
            )
            # If a parallel poll already inserted, rowcount is 0 — we
            # skip the "newly earned" return so we don't double-notify.
            if cursor.rowcount > 0:
                newly_earned.append(
                    {
                        "badgeId": badge.id,
                        "context": context,
                        "label": badge.label,
                        "emoji": badge.emoji,
                        "description": badge.description,
                    }
                )
        except Exception:
            logger.warning(
                "achievement insert failed: %s",
                badge.id,
                exc_info=True,
                extra=log_extra(user_id=user_id, badge_id=badge.id),
            )

    if to_revoke:
        # R5-B3: SOFT-revoke instead of DELETE. The row stays in place
        # with `revoked_at` set so a future re-earn can be silent.
        cursor.executemany(
            "UPDATE user_achievements "
            "SET revoked_at = strftime('%Y-%m-%d %H:%M:%f', 'now') "
            "WHERE user_id = ? AND badge_id = ? AND revoked_at IS NULL",
            [(user_id, bid) for bid in to_revoke],
        )
        logger.info(
            "achievements revoked",
            extra=log_extra(user_id=user_id, badge_ids=to_revoke),
        )

    if to_reactivate:
        # R5-B3: silently un-revoke + refresh context. No notification.
        cursor.executemany(
            "UPDATE user_achievements "
            "SET revoked_at = NULL, context_json = ? "
            "WHERE user_id = ? AND badge_id = ?",
            [(ctx, user_id, bid) for (bid, ctx) in to_reactivate],
        )
        logger.info(
            "achievements re-activated (silent)",
            extra=log_extra(
                user_id=user_id,
                badge_ids=[bid for (bid, _) in to_reactivate],
            ),
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
        insert_notification(
            cursor,
            user_id=user_id,
            kind='achievement_unlocked',
            title='Achievement unlocked',
            related_id=badge["badgeId"],
            message=f"{badge['emoji']} {badge['label']}",
        )


def list_user_achievements(cursor, user_id: str) -> list[dict]:
    """Read-only listing for /api/user-status + /api/public-profile.
    Joins each row against the BADGES_BY_ID registry so missing copy
    (e.g. a badge that was renamed) degrades gracefully — the row still
    returns its id + earned_at, just with empty display fields."""
    # R5-B3: filter revoked_at IS NULL so soft-revoked badges don't
    # render on the profile. The row stays in the DB (for re-earn
    # dedup) but is invisible to readers.
    cursor.execute(
        "SELECT badge_id, earned_at, context_json FROM user_achievements "
        "WHERE user_id = ? AND revoked_at IS NULL "
        "ORDER BY earned_at ASC",
        (user_id,),
    )
    out = []
    for row in cursor.fetchall():
        bdef = BADGES_BY_ID.get(row["badge_id"])
        try:
            context = json.loads(row["context_json"]) if row["context_json"] else {}
        except (json.JSONDecodeError, TypeError):
            context = {}
        out.append(
            {
                "badgeId": row["badge_id"],
                "earnedAt": row["earned_at"],
                "context": context,
                "label": bdef.label if bdef else row["badge_id"],
                "emoji": bdef.emoji if bdef else "🏅",
                "description": bdef.description if bdef else "",
            }
        )
    return out
