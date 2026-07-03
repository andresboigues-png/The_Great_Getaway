"""GG API tests — Achievement unlock/revoke rules and surfacing.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""


import json

from tests.conftest import _create_trip, _make_friends, _seed_member

# ── §4.4 Achievements ────────────────────────────────────────────────
# Each rule lives in src/achievements.py. We exercise the detection
# loop end-to-end through /api/data + spot-check the rule semantics
# directly via check_user_achievements() — the latter is faster for
# rules that need a specific data shape.
#
# 2026-05-18 rule change: every TRIP-BASED badge now requires the
# trip to be currently archived (`is_archived = 1`). Un-archiving a
# trip drops it from the count and revokes any badge it was the only
# thing keeping alive. Tests therefore archive their seeded trips
# before polling /api/data — `_archive_all_trips` is the convenience
# helper.


def _archive_all_trips(user_id):
    """Flip every trip the user has any membership in to archived for
    THEM. Maintains both:
      - `trips.is_archived`        — legacy owner-only mirror, still
                                     read by sync + public-profile
                                     surfaces during the deprecation
                                     window.
      - `trip_members.is_archived` — per-user, post-2026-05-18 source
                                     of truth for the achievement
                                     queries (which now JOIN
                                     trip_members so members earn
                                     badges for joint trips too).
    Also ensures the user has an accepted trip_members row for every
    owned trip — direct-INSERT tests bypass the /api/trips upsert
    path (and therefore the `ensure_owner_member_row` call), so the
    join in the achievement queries would see no member rows
    without this backfill."""
    from database import get_db
    from helpers import ensure_owner_member_row
    with get_db() as conn:
        cursor = conn.cursor()
        # Legacy mirror — keep updating until the column is fully
        # decommissioned in a follow-up migration.
        cursor.execute(
            "UPDATE trips SET is_archived = 1 WHERE user_id = ?",
            (user_id,),
        )
        # Per-user — backfill the owner row for each owned trip,
        # then flip it to archived.
        cursor.execute(
            "SELECT id FROM trips WHERE user_id = ?", (user_id,),
        )
        for row in cursor.fetchall():
            ensure_owner_member_row(cursor, row['id'], user_id)
            cursor.execute(
                "UPDATE trip_members SET is_archived = 1 "
                "WHERE trip_id = ? AND user_id = ?",
                (row['id'], user_id),
            )
        conn.commit()


def test_achievements_first_trip(client, seed_user, auth_headers):
    """Completing (archiving) any trip unlocks the first_trip badge.
    Detection runs piggybacked on /api/data so we just hit that
    endpoint after creating + archiving a trip."""
    _create_trip(client, auth_headers, trip_id="trip-ach-1")
    _archive_all_trips(seed_user)
    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "first_trip" in ids
    # Newly earned diff is also surfaced so the UI can toast.
    newly_ids = [a["badgeId"] for a in data["newlyEarnedAchievements"]]
    assert "first_trip" in newly_ids


def test_achievements_idempotent_across_polls(client, seed_user, auth_headers):
    """Detection running on every /api/data poll must NOT re-award a
    badge already earned. Second poll's newlyEarnedAchievements should
    be empty (or at least not contain first_trip again) while the
    cumulative list still shows it."""
    _create_trip(client, auth_headers, trip_id="trip-ach-idem")
    _archive_all_trips(seed_user)
    first = client.get("/api/data", headers=auth_headers).get_json()
    assert any(a["badgeId"] == "first_trip" for a in first["newlyEarnedAchievements"])

    second = client.get("/api/data", headers=auth_headers).get_json()
    assert any(a["badgeId"] == "first_trip" for a in second["achievements"])
    assert not any(a["badgeId"] == "first_trip" for a in second["newlyEarnedAchievements"])


def test_achievements_archivist_after_archive(client, seed_user, auth_headers):
    """Archiving a trip unlocks `archivist`. Post-2026-05-18 the rule
    counts WHERE trip_members.is_archived = 1 (per-user, not the
    legacy owner-only trips.is_archived column)."""
    _create_trip(client, auth_headers, trip_id="trip-ach-archive")
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "archivist" in ids


def test_achievements_globe_trotter_tiers(client, seed_user, auth_headers):
    """Three trips in different countries → globe_trotter_3. The
    10/25 tiers don't fire until those thresholds — confirm we get
    exactly the right tier."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        for i, (name, code) in enumerate([
            ("Lisbon, Portugal", "PT"),
            ("Tokyo, Japan", "JP"),
            ("Paris, France", "FR"),
        ]):
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-gt-{i}", seed_user, f"Trip {i}", name, code),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" in ids
    assert "globe_trotter_10" not in ids
    assert "globe_trotter_25" not in ids
    # Context should expose the country count for the UI to render
    # "3 countries" if it wants to.
    gt3 = next(a for a in data["achievements"] if a["badgeId"] == "globe_trotter_3")
    assert gt3["context"].get("countryCount") == 3


def test_achievements_globe_trotter_counts_multi_country_legs(client, seed_user, auth_headers):
    """§4.3 follow-up: a SINGLE trip that touches multiple countries
    (via the `trip_countries_json` array) should contribute all its
    legs to the globe_trotter count. Two such trips covering 4 unique
    countries should unlock globe_trotter_3, even though the trip
    COUNT is only 2.

    Pre-§4.3 the badge counted only the primary `country_code` per
    trip, so a Portugal+Spain trip + a Japan+Korea trip would have
    earned only 2-country credit; post-§4.3 the same trips earn 4.
    """
    import json as _json

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        # Trip 1: Iberia (PT + ES)
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code, "
            "trip_countries_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                "trip-multi-iberia", seed_user, "Iberia tour",
                "Portugal", "PT", _json.dumps(["PT", "ES"]),
            ),
        )
        # Trip 2: East Asia (JP + KR)
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code, "
            "trip_countries_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                "trip-multi-asia", seed_user, "East Asia",
                "Japan", "JP", _json.dumps(["JP", "KR"]),
            ),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" in ids, \
        f"4-country count from 2 multi-country trips should unlock globe_trotter_3; badges={ids!r}"
    gt3 = next(a for a in data["achievements"] if a["badgeId"] == "globe_trotter_3")
    assert gt3["context"].get("countryCount") == 4, \
        f"countryCount should reflect every leg; got {gt3['context'].get('countryCount')!r}"


def test_achievements_globe_trotter_dedupes_primary_and_array(client, seed_user, auth_headers):
    """§4.3 follow-up: the server-side upsert writes the primary
    `country_code` into BOTH the scalar column AND position 0 of the
    JSON array (see HeroMap's discovery loop). The badge count must
    dedupe so a single Portugal+Spain trip counts as 2, not 3 (PT
    from scalar + PT from array[0] + ES from array[1]).
    """
    import json as _json

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code, "
            "trip_countries_json) VALUES (?, ?, ?, ?, ?, ?)",
            (
                "trip-dedupe", seed_user, "Iberia tour",
                "Portugal", "PT",
                # Primary deliberately included in the array too —
                # mirrors what the HeroMap loop persists in production.
                _json.dumps(["PT", "ES"]),
            ),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    # Below the 3-threshold, so no globe-trotter badge — but the
    # internal count is what we're testing. Inspect via the badge's
    # context when a higher threshold fires would be cleaner; instead,
    # we just confirm that the badge DIDN'T fire (count=2, below 3).
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" not in ids, \
        f"deduped count of 2 shouldn't unlock the 3-threshold badge; badges={ids!r}"


def test_achievements_repeat_country(client, seed_user, auth_headers):
    """Two trips in the same country (by country_code) unlocks the
    Local Hero badge. Encourages domestic / repeat-destination travel."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        for i in range(2):
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-rc-{i}", seed_user, f"Lisbon trip {i}", "Lisbon, Portugal", "PT"),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "repeat_country" in ids


def test_achievements_social_butterfly(client, seed_user, auth_headers):
    """3+ mutual-follow relationships → social_butterfly. Model B:
    "friend" count = mutuals (people who follow you back). Test seeds
    both directions of each follow so each candidate counts.

    Pre-Model-B this seeded `friends` rows with status='accepted';
    rewired to insert two `follows` rows per pair since `mutuals_of`
    is the new authority for the count."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        for i in range(3):
            other_id = f"sb-friend-{i}"
            c.execute(
                "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
                (other_id, f"sb{i}@example.com", f"Friend {i}"),
            )
            # Mutual = both directions of follow.
            c.execute(
                "INSERT INTO follows (follower_id, followee_id, created_at) "
                "VALUES (?, ?, CURRENT_TIMESTAMP)",
                (seed_user, other_id),
            )
            c.execute(
                "INSERT INTO follows (follower_id, followee_id, created_at) "
                "VALUES (?, ?, CURRENT_TIMESTAMP)",
                (other_id, seed_user),
            )
            # Keep the legacy friends-table insert as a no-op marker for
            # ease of grep when someone audits this file later — the
            # _do-nothing INSERT keeps the column count consistent with
            # any future legacy reads but doesn't influence the gate.
            c.execute(
                "INSERT INTO friends (user_id, friend_id, status, created_at) "
                "VALUES (?, ?, 'accepted', CURRENT_TIMESTAMP)",
                (seed_user, other_id),
            )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "social_butterfly" in ids


def test_achievements_first_settle_up_uses_45_table(
    client, seed_user, seed_other_user, auth_headers,
):
    """The first_settle_up badge reads the new §4.5 settlements table
    — proves the §3.6 + §4.5 + §4.4 layers compose end-to-end."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-ach-settle")
    _seed_member(trip_id, seed_other_user, role="relaxer")
    client.post("/api/settlements", headers=auth_headers, json={
        "tripId": trip_id,
        "fromUserId": seed_other_user,
        "toUserId": seed_user,
        "amount": 10.0,
        "currency": "EUR",
    })

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    assert "first_settle_up" in ids


# ── §4.4 badge-variety expansion ─────────────────────────────────────


def test_achievements_globe_trotter_50_only_at_threshold(client, seed_user, auth_headers):
    """The 50-country tier only fires at ≥50 distinct countries. 49 →
    no globe_trotter_50; 50 → fires + context carries countryCount."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        # Insert 49 distinct-country ARCHIVED trips. globe_trotter_50
        # should NOT appear; globe_trotter_25 should.
        for i in range(49):
            # Synthetic 2-letter country codes (AA..BV) — far past any
            # real-world ISO list but the rule is `COUNT(DISTINCT
            # country_code)` so synthetic codes work.
            code = f"X{i:02d}"
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-gt50-{i}", seed_user, f"Trip {i}", f"Country {i}", code),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_25" in ids, "25-tier should be unlocked at 49 countries"
    assert "globe_trotter_50" not in ids, "50-tier shouldn't fire at 49"

    # One more — crosses the threshold.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code) "
            "VALUES ('trip-gt50-final', ?, 'Trip 50', 'Country 50', 'XFF')",
            (seed_user,),
        )
        conn.commit()
    _archive_all_trips(seed_user)
    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_50" in ids
    gt50 = next(a for a in data["achievements"] if a["badgeId"] == "globe_trotter_50")
    assert gt50["context"].get("countryCount") == 50


def test_achievements_longest_trip_threshold(client, seed_user, auth_headers):
    """longest_trip fires when ANY owned trip has ≥14 trip_days rows.
    Below the threshold: no badge. At threshold: badge + context
    carries (tripId, tripName, days)."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-long-1", name="Long Haul")
    _archive_all_trips(seed_user)

    with get_db() as conn:
        c = conn.cursor()
        # 13 days — below threshold.
        for i in range(13):
            c.execute(
                "INSERT INTO trip_days (id, trip_id, day_number, name) VALUES (?, ?, ?, ?)",
                (f"day-{i}", trip_id, i, f"Day {i}"),
            )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "longest_trip" not in ids, "13 days < 14 threshold"

    # Add the 14th day — crosses the threshold.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, name) VALUES (?, ?, ?, ?)",
            ("day-13", trip_id, 13, "Day 13"),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "longest_trip" in ids
    longest = next(a for a in data["achievements"] if a["badgeId"] == "longest_trip")
    ctx = longest["context"]
    assert ctx.get("tripId") == trip_id
    assert ctx.get("days") == 14
    assert ctx.get("tripName") == "Long Haul"


def test_achievements_priciest_trip_threshold(client, seed_user, auth_headers):
    """priciest_trip fires at total recorded spend ≥ €1000 on any owned
    trip. The threshold uses sum(expenses.euro_value) — cross-currency
    sums survive."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-spend-1", name="Splurge Trip")
    _archive_all_trips(seed_user)

    # €999 across two expenses — just under the threshold.
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO expenses (id, trip_id, who, value, currency, euro_value) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("e1", trip_id, seed_user, 500, "EUR", 500.0),
        )
        c.execute(
            "INSERT INTO expenses (id, trip_id, who, value, currency, euro_value) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("e2", trip_id, seed_user, 499, "EUR", 499.0),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "priciest_trip" not in ids, "€999 < €1000 threshold"

    # Bump to €1000 — exactly the threshold.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO expenses (id, trip_id, who, value, currency, euro_value) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("e3", trip_id, seed_user, 1, "EUR", 1.0),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "priciest_trip" in ids
    pricy = next(a for a in data["achievements"] if a["badgeId"] == "priciest_trip")
    ctx = pricy["context"]
    assert ctx.get("tripId") == trip_id
    assert ctx.get("spendEur") == 1000
    assert ctx.get("tripName") == "Splurge Trip"


def test_achievements_most_companions(client, seed_user, auth_headers):
    """most_companions reads `trips.companions_json` (the per-trip
    roster array). Defensively skips malformed JSON / non-array
    values rather than raising."""
    from database import get_db

    # Trip with 4 companions — under threshold.
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, companions_json) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                "trip-c-4",
                seed_user,
                "Small group",
                "PT",
                json.dumps([{"name": f"Friend {i}"} for i in range(4)]),
            ),
        )
        # A second trip with valid JSON that's NOT an array — older
        # schema iterations stored an object instead of a list. The
        # badge check must skip these gracefully rather than measuring
        # the wrong shape; this also tests the `isinstance(..., list)`
        # branch. (Truly-malformed JSON can't reach this code path in
        # production because all writers go through json.dumps; trip
        # serialization crashes earlier on it.)
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, companions_json) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-c-bad", seed_user, "Non-array JSON trip", "PT", '{"legacy": true}'),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "most_companions" not in ids, "4 companions < 5 threshold"

    # Bump one trip to 5 companions.
    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET companions_json = ? WHERE id = 'trip-c-4'",
            (json.dumps([{"name": f"Friend {i}"} for i in range(5)]),),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "most_companions" in ids
    mc = next(a for a in data["achievements"] if a["badgeId"] == "most_companions")
    ctx = mc["context"]
    assert ctx.get("count") == 5
    assert ctx.get("tripId") == "trip-c-4"


def test_achievements_intra_country_3(client, seed_user, auth_headers):
    """intra_country_3 fires when the user has 3+ trips in the same
    country (by country_code). Strictly stronger than repeat_country
    (≥2)."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        # 2 Portugal trips — below threshold, but repeat_country fires.
        for i in range(2):
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-ic-{i}", seed_user, f"Lisbon {i}", "Portugal", "PT"),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "repeat_country" in ids, "2 PT trips should fire repeat_country"
    assert "intra_country_3" not in ids, "2 PT trips < 3 threshold"

    # Add the 3rd Portugal trip.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code) "
            "VALUES ('trip-ic-final', ?, 'Lisbon 3', 'Portugal', 'PT')",
            (seed_user,),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "intra_country_3" in ids
    ic = next(a for a in data["achievements"] if a["badgeId"] == "intra_country_3")
    assert ic["context"].get("tripCount") == 3
    assert ic["context"].get("countryKey") == "PT"


def test_achievements_back_to_back_consecutive_months(client, seed_user, auth_headers):
    """back_to_back fires when ≥2 trips exist in consecutive calendar
    months. Non-adjacent months → no badge. Year boundary (Dec/Jan)
    handled correctly."""
    from database import get_db

    # Two trips in months that ARE NOT adjacent (Jan + Mar) — no badge.
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-jan", seed_user, "January trip", "X", "2025-01-15 10:00:00"),
        )
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-mar", seed_user, "March trip", "X", "2025-03-15 10:00:00"),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "back_to_back" not in ids, "Jan + Mar are not consecutive"

    # Add a February trip — now Jan/Feb are adjacent.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-feb", seed_user, "February trip", "X", "2025-02-15 10:00:00"),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "back_to_back" in ids
    bb = next(a for a in data["achievements"] if a["badgeId"] == "back_to_back")
    ctx = bb["context"]
    assert ctx.get("firstMonth") == "2025-01"
    assert ctx.get("secondMonth") == "2025-02"


def test_achievements_back_to_back_crosses_year_boundary(client, seed_user, auth_headers):
    """The Dec/Jan transition counts as consecutive. Pinned because
    the obvious "y2 == y1 + 0 AND m2 == m1 + 1" check would miss it
    without the explicit year-rollover branch."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-dec", seed_user, "December trip", "X", "2024-12-15 10:00:00"),
        )
        c.execute(
            "INSERT INTO trips (id, user_id, name, country, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            ("trip-bb-jan-next", seed_user, "January trip", "X", "2025-01-15 10:00:00"),
        )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "back_to_back" in ids
    bb = next(a for a in data["achievements"] if a["badgeId"] == "back_to_back")
    assert bb["context"].get("firstMonth") == "2024-12"
    assert bb["context"].get("secondMonth") == "2025-01"


def test_achievements_notification_on_unlock(client, seed_user, auth_headers):
    """Each newly earned badge drops an `achievement_unlocked` notification
    so the bell badge ticks up. Re-poll after a no-change tick must NOT
    add another notification for the same badge."""
    _create_trip(client, auth_headers, trip_id="trip-ach-notif")
    _archive_all_trips(seed_user)
    client.get("/api/data", headers=auth_headers)  # detection + insert

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT type, related_id FROM notifications WHERE user_id = ?",
            (seed_user,),
        )
        rows = c.fetchall()
    badge_notifs = [r for r in rows if r["type"] == "achievement_unlocked"]
    assert any(r["related_id"] == "first_trip" for r in badge_notifs)

    # Second poll — no new unlocks, no new notifications.
    client.get("/api/data", headers=auth_headers)
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT COUNT(*) AS c FROM notifications "
            "WHERE user_id = ? AND type = 'achievement_unlocked' AND related_id = 'first_trip'",
            (seed_user,),
        )
        assert c.fetchone()["c"] == 1


def test_achievements_on_public_profile(
    client, seed_user, seed_other_user, auth_headers,
):
    """A signed-in viewer fetching their OWN public profile sees
    their earned badges. R3-Round 2 #36 narrowed the public
    achievements surface — anonymous and non-follower viewers
    no longer get the badge list (it reveals fingerprintable
    travel patterns)."""
    _create_trip(client, auth_headers, trip_id="trip-ach-pub")
    _archive_all_trips(seed_user)
    # Trigger detection by polling /api/data for the owner first.
    client.get("/api/data", headers=auth_headers)

    # Self-view — always allowed.
    res = client.get(f"/api/public-profile/{seed_user}", headers=auth_headers)
    assert res.status_code == 200
    payload = res.get_json()
    assert "achievements" in payload
    ids = [a["badgeId"] for a in payload["achievements"]]
    assert "first_trip" in ids


def test_achievements_hidden_from_anonymous_profile_viewer(
    client, seed_user, auth_headers,
):
    """R3-Round 2 #36: anonymous viewers (no auth) get an empty
    achievements array on /api/public-profile/<id> — strangers
    with the URL shouldn't be able to fingerprint a user's
    travel pattern via badges + context_json. Profile shell +
    public trips still render normally."""
    _create_trip(client, auth_headers, trip_id="trip-ach-anon-hidden")
    _archive_all_trips(seed_user)
    client.get("/api/data", headers=auth_headers)
    # Anonymous fetch — no headers.
    res = client.get(f"/api/public-profile/{seed_user}")
    assert res.status_code == 200
    payload = res.get_json()
    assert payload["achievements"] == [], \
        "anonymous viewer should not see the badge list"


def test_achievements_feed_event_for_friends(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """When a friend earns a badge it appears in the caller's feed as
    `achievement_unlocked`. Verifies the §3.6 registry's
    _build_achievement_unlocked builder picks up rows where actor is
    in the caller's friend set."""
    _make_friends(seed_user, seed_other_user)
    _create_trip(client, other_auth_headers, trip_id="trip-ach-feed")
    _archive_all_trips(seed_other_user)
    # Make sure the other user's detection runs (it would on any
    # subsequent /api/data they hit; we force it here so the test is
    # deterministic regardless of polling).
    client.get("/api/data", headers=other_auth_headers)

    events = client.get("/api/feed", headers=auth_headers).get_json()
    achievement_events = [e for e in events if e.get("type") == "achievement_unlocked"]
    assert len(achievement_events) >= 1
    # Actor should be seed_other_user (who earned it).
    actor_ids = {e["actor"]["id"] for e in achievement_events}
    assert seed_other_user in actor_ids


def test_achievements_revoked_when_trip_unarchived(client, seed_user, auth_headers):
    """2026-05-18 rule: trip-based badges count only CURRENTLY archived
    trips. Un-archiving the trip that earned `first_trip` should revoke
    that badge on the next /api/data poll, and re-archiving should
    re-grant it (with a fresh `newlyEarnedAchievements` entry so the UI
    can re-toast).

    Post-2026-05-18 the archive signal lives in `trip_members.is_archived`
    (per-user, the audit-H1+H4 fix), so the unarchive simulation toggles
    that column instead of the legacy `trips.is_archived` mirror."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-revoke-1")
    _archive_all_trips(seed_user)

    # First poll — `archivist` earned. Pre-2026-05-19 this test
    # asserted on `first_trip`, but that badge is now the welcome-
    # aboard "you started planning" milestone (no archive required);
    # `archivist` is the correct archive-state-dependent badge to
    # use as the revoke probe.
    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" in [a["badgeId"] for a in data["achievements"]]
    assert "archivist" in [a["badgeId"] for a in data["newlyEarnedAchievements"]]

    # Un-archive the trip — flip the per-user trip_members.is_archived
    # back to 0. The only archived membership, so archivist's count
    # drops to 0 and the badge should disappear.
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 0 "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_user),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" not in [a["badgeId"] for a in data["achievements"]], \
        "archivist should be revoked once the only archived trip is restored"
    # Revoke is silent — no fresh notification, no entry in newlyEarned.
    assert "archivist" not in [a["badgeId"] for a in data["newlyEarnedAchievements"]]

    # Re-archive — badge comes back, but R5-B3: re-earning a
    # previously-revoked badge is now SILENT. The row stays in place
    # (soft-revoked via revoked_at), and re-earning just clears
    # revoked_at without firing a fresh notification or appearing in
    # newlyEarnedAchievements. Pre-fix this re-fired every cycle —
    # a fidgety user could spam dozens of "you unlocked archivist"
    # rows just by archive-toggling.
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 1 "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_user),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" in [a["badgeId"] for a in data["achievements"]], \
        "re-archiving should re-activate the soft-revoked badge"
    assert "archivist" not in [a["badgeId"] for a in data["newlyEarnedAchievements"]], \
        "R5-B3: re-earn is silent — no fresh newly-earned, no re-toast"


def test_achievements_globe_trotter_revoked_when_country_unarchived(client, seed_user, auth_headers):
    """globe_trotter_3 should revoke when un-archiving one of the trips
    drops the distinct-country count below 3. The other badges (first_trip,
    archivist) survive because at least one archived trip remains."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        for i, code in enumerate(["PT", "JP", "FR"]):
            c.execute(
                "INSERT INTO trips (id, user_id, name, country, country_code) "
                "VALUES (?, ?, ?, ?, ?)",
                (f"trip-rev-gt-{i}", seed_user, f"Trip {i}", code, code),
            )
        conn.commit()
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" in ids

    # Un-archive the FR trip for this user — count drops from 3 to 2.
    # Per-user flag lives on trip_members (post-2026-05-18 H1+H4 fix).
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 0 "
            "WHERE trip_id = 'trip-rev-gt-2' AND user_id = ?",
            (seed_user,),
        )
        conn.commit()

    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" not in ids, "2 archived countries < 3 threshold"
    # first_trip + archivist + repeat_country survive (PT, JP still
    # archived). Not asserting their presence specifically here — the
    # point is the SELECTIVE revoke.
    assert "first_trip" in ids


def test_achievements_joint_trip_counts_for_both_owner_and_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """2026-05-18 audit H4: members earn badges from trips they JOINED
    (not just trips they OWN). Owner creates a trip; other user joins
    as planner via the invite flow; both archive their copy. Both
    users earn `first_trip` independently — the badge counts each
    user's own accepted+archived memberships.

    Pre-fix the achievement queries did `WHERE trips.user_id = ?`
    which is owner-only, so a planner of a 5-country group trip
    would never earn globe_trotter_3 from it."""
    from database import get_db
    trip_id = _create_trip(client, other_auth_headers, trip_id="trip-joint")

    # Seed the other user as an accepted planner via direct
    # trip_members insert — the full invite-flow is exercised
    # elsewhere; here we just want both rows present.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
            (trip_id, seed_user, seed_other_user),
        )
        conn.commit()

    # OWNER archives their copy — earns `archivist` (the archive-
    # state-dependent badge). `first_trip` is no longer a useful
    # probe here because post-2026-05-19 it fires on any accepted
    # membership regardless of archive state.
    _archive_all_trips(seed_other_user)
    owner_data = client.get("/api/data", headers=other_auth_headers).get_json()
    assert "archivist" in [a["badgeId"] for a in owner_data["achievements"]], \
        "owner should earn archivist after archiving their copy"

    # MEMBER (seed_user) has not archived their copy yet → archivist
    # should NOT fire. `first_trip` WILL fire here because just being
    # an accepted member is enough — that's the welcome-aboard badge
    # by design.
    member_data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" not in [a["badgeId"] for a in member_data["achievements"]], \
        "member should NOT earn archivist until they archive their copy"

    # Now the member archives their copy → they earn archivist
    # INDEPENDENTLY of the owner's archive state. This is the joint-
    # trip semantic: both users get credit for the same trip.
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 1 "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_user),
        )
        conn.commit()
    member_data = client.get("/api/data", headers=auth_headers).get_json()
    assert "archivist" in [a["badgeId"] for a in member_data["achievements"]], \
        "member should earn archivist independently after archiving their copy"


def test_achievements_globe_trotter_credits_member_for_joint_multi_country_trip(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """The 2026-05-18 H4 fix shifted globe_trotter_* to count any
    archived membership, not just owned trips. A non-owner planner
    on a multi-country trip should earn globe_trotter_3 from a
    single shared trip that touches three countries.

    Pre-fix the query was owner-scoped via `WHERE trips.user_id = ?`,
    so the planner earned 0 countries from this trip no matter how
    many it visited. The new query JOINs trip_members, so any
    accepted+archived membership contributes the trip's country
    set to the member's count."""
    import json as _json

    from database import get_db

    # Owner creates a 3-country trip (Iberia + East Asia tour with
    # PT, JP, FR in the multi-country array).
    _create_trip(client, other_auth_headers, trip_id="trip-joint-multi")
    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET trip_countries_json = ?, country_code = 'PT' "
            "WHERE id = 'trip-joint-multi'",
            (_json.dumps(["PT", "JP", "FR"]),),
        )
        # Add seed_user as a planner.
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, 'planner', 0, 'accepted', ?)",
            ("trip-joint-multi", seed_user, seed_other_user),
        )
        conn.commit()

    # Member archives their copy → earns globe_trotter_3 from the
    # single shared trip's three countries.
    with get_db() as conn:
        conn.execute(
            "UPDATE trip_members SET is_archived = 1 "
            "WHERE trip_id = ? AND user_id = ?",
            ("trip-joint-multi", seed_user),
        )
        conn.commit()
    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = {a["badgeId"] for a in data["achievements"]}
    assert "globe_trotter_3" in ids, \
        "non-owner member should earn globe_trotter_3 from a joint 3-country trip"
    gt3 = next(a for a in data["achievements"] if a["badgeId"] == "globe_trotter_3")
    assert gt3["context"].get("countryCount") == 3


def test_achievements_revoked_when_trip_deleted(client, seed_user, auth_headers):
    """2026-05-18 audit fix (critical bug #1): DELETE /api/trips/<id>
    used to run `DELETE FROM user_achievements WHERE trip_id = ?`
    against a table that has NO trip_id column — the SQL always
    errored and a `try/except: pass` swallowed it, so badges referencing
    the deleted trip kept showing up with a dead `tripId` in their
    tooltip context. The fix replaced the broken DELETE with a
    `check_user_achievements(cursor, user_id)` call so the post-2026-05-18
    revoke path drops badges whose qualifying trip no longer exists.

    Permanent deletion is the stronger version of unarchive — once
    deleted, the trip can't be restored, so the badge stays revoked."""
    from database import get_db
    trip_id = _create_trip(client, auth_headers, trip_id="trip-del-revoke")
    _archive_all_trips(seed_user)

    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "first_trip" in [a["badgeId"] for a in data["achievements"]], \
        "archived trip should earn first_trip before deletion"

    # Permanent delete via the API (covers the full handler including
    # the post-delete check_user_achievements call).
    res = client.delete(f"/api/trips/{trip_id}", headers=auth_headers)
    assert res.status_code == 200

    # Badge should be gone IMMEDIATELY on the next poll — the revoke
    # ran inside the delete transaction, not waiting for the next
    # /api/data tick to catch up.
    data = client.get("/api/data", headers=auth_headers).get_json()
    assert "first_trip" not in [a["badgeId"] for a in data["achievements"]], \
        "first_trip should be revoked the instant the only earning trip is deleted"

    # Direct DB sanity: the row exists but is soft-revoked
    # (revoked_at IS NOT NULL). R5-B3: changed from hard-DELETE to
    # soft-revoke so a future re-earn of the same badge can be silent
    # — see test_achievements_revoked_when_trip_unarchived.
    with get_db() as conn:
        rows = conn.execute(
            "SELECT badge_id, revoked_at FROM user_achievements "
            "WHERE user_id = ?",
            (seed_user,),
        ).fetchall()
    first_trip_row = next(
        (r for r in rows if r["badge_id"] == "first_trip"), None
    )
    assert first_trip_row is not None, "soft-revoked row should still exist"
    assert first_trip_row["revoked_at"] is not None, \
        "first_trip should be soft-revoked (revoked_at stamped)"


def test_achievements_rule_failure_doesnt_poison_sweep(client, seed_user, auth_headers, monkeypatch):
    """If one badge rule raises, the detection loop logs + skips it
    and the OTHER rules still run. Without this guard a future bad
    rule would block every user's badge earning until shipped fix."""
    import achievements as ach
    from achievements import BADGES, BadgeDef

    def _explode(cursor, user_id):
        raise RuntimeError("simulated bad rule")

    # Splice in a broken rule at the start of the registry. monkeypatch
    # restores the original list after the test.
    bad_badge = BadgeDef(
        id="explosive_test_badge",
        emoji="💥",
        label="Boom",
        description="-",
        check=_explode,
    )
    monkeypatch.setattr(ach, "BADGES", [bad_badge, *BADGES])

    _create_trip(client, auth_headers, trip_id="trip-ach-resilient")
    _archive_all_trips(seed_user)
    data = client.get("/api/data", headers=auth_headers).get_json()
    ids = [a["badgeId"] for a in data["achievements"]]
    # The good rule (first_trip) still ran.
    assert "first_trip" in ids
    # The broken rule didn't earn the user a badge.
    assert "explosive_test_badge" not in ids


def test_first_share_badge_is_sticky_after_unshare(client, seed_user, auth_headers):
    """MK6 P3: the first_share (Storyteller) milestone badge must NOT be soft-
    revoked when the user unshares their only trip — earning a milestone sticks."""
    trip_id = _create_trip(client, auth_headers, trip_id="t-badge", public=True)
    post_id = client.post("/api/feed/share", headers=auth_headers,
                          json={"trip_id": trip_id}).get_json()["post_id"]
    # /api/data runs the achievement sweep → earns first_share.
    ach = [a["badgeId"] for a in client.get("/api/data", headers=auth_headers).get_json()["achievements"]]
    assert "first_share" in ach, "sharing should earn the Storyteller badge"
    # Unshare (delete the only feed_post), then re-run the sweep via /api/data.
    client.delete(f"/api/feed/share/{post_id}", headers=auth_headers)
    ach2 = [a["badgeId"] for a in client.get("/api/data", headers=auth_headers).get_json()["achievements"]]
    assert "first_share" in ach2, "first_share was soft-revoked after unshare (should be sticky)"
