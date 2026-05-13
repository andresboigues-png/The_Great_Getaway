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
    """One trip you own — created, archived, anything."""
    cursor.execute("SELECT COUNT(*) AS c FROM trips WHERE user_id = ?", (user_id,))
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
    """Distinct country_codes across the user's trips. Falls back to
    counting distinct `country` strings when country_code is missing
    (legacy trips). Uses LOWER() on country names to dedup case-only
    variants ("Portugal" vs "portugal" both count once)."""
    cursor.execute(
        "SELECT COUNT(DISTINCT COALESCE(NULLIF(country_code, ''), LOWER(country))) AS c "
        "FROM trips "
        "WHERE user_id = ? AND COALESCE(country, '') != ''",
        (user_id,),
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
        "WHERE user_id = ? AND COALESCE(country, '') != '' "
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
        description="Created your first trip.",
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
        description="Visited 3 distinct countries.",
        check=_make_globe_trotter_check(3),
    ),
    BadgeDef(
        id="globe_trotter_10",
        emoji="🌏",
        label="Globe Trotter — 10 countries",
        description="Visited 10 distinct countries.",
        check=_make_globe_trotter_check(10),
    ),
    BadgeDef(
        id="globe_trotter_25",
        emoji="🌐",
        label="Globe Trotter — 25 countries",
        description="Visited 25 distinct countries.",
        check=_make_globe_trotter_check(25),
    ),
    BadgeDef(
        id="repeat_country",
        emoji="📍",
        label="Local Hero",
        description="Visited the same country twice — repeat-destination respect.",
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
]


# Lookup table for the feed / notification copy. Keyed by badge_id
# so callers (feed builder, frontend) can pull copy without re-traversing
# the BADGES list.
BADGES_BY_ID: dict[str, BadgeDef] = {b.id: b for b in BADGES}


# ── Detection ────────────────────────────────────────────────────────


def check_user_achievements(cursor, user_id: str) -> list[dict]:
    """Run every BADGE rule for the user. Returns the list of NEWLY
    earned badges (those that weren't already in user_achievements).
    Caller is responsible for the conn.commit() — we only stage inserts.

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
    for badge in BADGES:
        if badge.id in already_earned:
            continue
        try:
            context = badge.check(cursor, user_id)
        except Exception as e:
            # Don't let a bad rule poison the whole detection sweep —
            # log the badge id + skip. The other rules still run, and
            # this badge is re-evaluated on the next /api/data call.
            logger.warning(
                "achievement rule failed: %s",
                badge.id,
                exc_info=True,
                extra=log_extra(user_id=user_id, badge_id=badge.id),
            )
            continue
        if context is None:
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
