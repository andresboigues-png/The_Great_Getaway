"""GG API tests — Trip CRUD, cover/countries, archive/silence, invite/members, clone, share-link, public-trip.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""


import json

import pytest

from tests.conftest import _befriend, _create_trip, _seed_member


# ── /api/trips ───────────────────────────────────────────────────────────────

def test_upsert_trip_happy_path(client, seed_user, auth_headers):
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany", "country": "Italy"},
    })
    assert res.status_code == 200
    body = res.get_json()
    assert body["status"] == "ok"
    # R3-Round 5: response now also carries `updatedAt` for the
    # client's optimistic-concurrency cycle. Format is a millisecond-
    # precision SQL timestamp.
    assert "updatedAt" in body
    assert body["updatedAt"], "updatedAt should be non-empty"


def test_upsert_trip_rejects_non_planner_edit(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Once trip-1 is owned by seed_user, seed_other_user can't overwrite
    it via their own JWT."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-1", "name": "Tuscany", "country": "Italy"},
    })
    res = client.post("/api/trips", headers=other_auth_headers, json={
        "trip": {"id": "trip-1", "name": "Hijacked", "country": "Mars"},
    })
    assert res.status_code == 403


def test_trip_isPublic_is_owner_only(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """BUG-35 (MK2 audit): is_public is an OWNER-only privacy decision. A
    non-owner PLANNER may edit the trip's name, but their isPublic value
    is pinned to the stored one — they can't publish someone else's trip.
    The owner still can."""
    from database import get_db
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-pub", "name": "Tuscany"},
    })  # private by default
    _seed_member("trip-pub", seed_other_user, role="planner")
    # Non-owner planner edits the name AND tries to publish.
    res = client.post("/api/trips", headers=other_auth_headers, json={
        "trip": {"id": "trip-pub", "name": "Renamed", "isPublic": True},
    })
    assert res.status_code in (200, 409), res.get_data(as_text=True)
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?", ("trip-pub",),
        ).fetchone()
    assert row["is_public"] == 0, \
        "a non-owner planner must NOT be able to publish the trip (BUG-35)"
    # Owner CAN publish.
    pub = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-pub", "name": "Tuscany", "isPublic": True},
    })
    assert pub.status_code == 200, pub.get_data(as_text=True)
    with get_db() as conn:
        row = conn.execute(
            "SELECT is_public FROM trips WHERE id = ?", ("trip-pub",),
        ).fetchone()
    assert row["is_public"] == 1, "the owner must be able to publish their own trip"


def test_upsert_trip_missing_data(client, auth_headers):
    res = client.post("/api/trips", headers=auth_headers, json={})
    assert res.status_code == 400


def test_trip_cover_url_round_trips(client, seed_user, auth_headers):
    """Cover photo URL persists across upsert + read (post-Phase-C
    feature). The frontend writes `coverUrl` (camelCase) and reads it
    back the same way; the column on disk is `cover_url`. Also confirms
    setting it to None removes the cover (overwrite semantics)."""
    cover = "/static/uploads/1234_test.jpg"
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-cover", "name": "Lisbon", "country": "Portugal",
            "coverUrl": cover,
        },
    })
    assert res.status_code == 200

    # Read back via /api/data — the round-trip surfaces the value as
    # `coverUrl` (the read mapping translates from cover_url).
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == "trip-cover")
    assert trip["coverUrl"] == cover

    # Overwrite with None — should clear the column. Test confirms the
    # ON CONFLICT clause writes `excluded.cover_url` (which is the new
    # NULL) rather than COALESCE-keeping the old value.
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-cover", "name": "Lisbon", "country": "Portugal",
            "coverUrl": None,
        },
    })
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == "trip-cover")
    assert trip["coverUrl"] is None


def test_trip_cover_url_optional(client, seed_user, auth_headers):
    """Legacy trips (no `coverUrl` in payload) still upsert cleanly,
    and the read returns None for that field. Backwards compat."""
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-legacy", "name": "Old Trip", "country": "Spain"},
    })
    assert res.status_code == 200
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == "trip-legacy")
    assert trip["coverUrl"] is None


def test_upsert_trip_preserves_cover_when_payload_omits_it(client, seed_user, auth_headers):
    """4.8 audit TRIP-6: a partial trip edit that OMITS coverUrl must
    preserve the stored cover, not NULL it."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-cov", "name": "T", "country": "FR",
                 "coverUrl": "/static/uploads/u/c.jpg"},
    })
    # Edit WITHOUT the coverUrl key.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-cov", "name": "Renamed", "country": "FR"},
    })
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == "trip-cov")
    assert trip["coverUrl"] == "/static/uploads/u/c.jpg", "omitted coverUrl must preserve (TRIP-6)"


def test_upsert_trip_clears_cover_on_explicit_null(client, seed_user, auth_headers):
    """TRIP-6 must not over-preserve: the Edit-Trip 'Remove cover' action
    sends coverUrl:null and MUST clear the stored cover."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-cov2", "name": "T", "country": "FR",
                 "coverUrl": "/static/uploads/u/c.jpg"},
    })
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-cov2", "name": "T", "country": "FR", "coverUrl": None},
    })
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == "trip-cov2")
    assert trip["coverUrl"] is None, "explicit null coverUrl must clear the cover (TRIP-6)"


# ── /api/profile/update ──────────────────────────────────────────────────────
# Patch endpoint: any of (bio, status, homeCurrency) may be present.
# Missing fields stay untouched so callers can update one field at a
# time. Empty payload is a no-op rather than an error.

def test_update_profile_single_field(client, seed_user, auth_headers):
    """Patching one field returns 200/{updated}."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "bio": "Travel writer, occasional photographer.",
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_multiple_fields(client, seed_user, auth_headers):
    """Patching multiple fields in one call works — each field gets
    spliced into the SET clause separately. Status must be one of the
    server-side allowlisted values (FIXING_ROADMAP §0.1)."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "bio": "Travelling.",
        "status": "Exploring the world",
        "homeCurrency": "GBP",
    })
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_status_rejects_off_allowlist(client, seed_user, auth_headers):
    """FIXING_ROADMAP §0.1: arbitrary status copy is rejected so a
    crafted client can't smuggle in a status string that renders on
    other users' profiles. The frontend dropdown only offers 5 fixed
    values; anything else is a 400."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "status": "I am evil <img onerror=alert(1)>",
    })
    assert res.status_code == 400
    assert "status" in (res.get_json() or {}).get("error", "")


def test_update_profile_bio_capped_at_500_chars(client, seed_user, auth_headers):
    """FIXING_ROADMAP §0.1: bios over 500 chars are rejected so the
    column can't be used as an unbounded payload store."""
    res = client.post("/api/profile/update", headers=auth_headers, json={
        "bio": "x" * 501,
    })
    assert res.status_code == 400
    assert "bio" in (res.get_json() or {}).get("error", "")


def test_update_profile_empty_is_noop(client, seed_user, auth_headers):
    """Empty payload — no field to patch — returns {status:noop}
    rather than triggering a UPDATE with no SET clause."""
    res = client.post("/api/profile/update", headers=auth_headers, json={})
    assert res.status_code == 200
    assert res.get_json() == {"status": "noop"}


# ── /api/profile/update — language (i18n session 3) ──────────────────────────
# Locale follows the user across devices: setLocale on the frontend
# POSTs the chosen value here, and /api/user-status returns it on
# next boot so the picker survives device switches. The allowlist
# matches the Locale union in i18n.ts; any other value gets a 400 so
# we never end up with junk in the DB.

def test_update_profile_language_accepts_en(client, seed_user, auth_headers):
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "en"})
    assert res.status_code == 200
    assert res.get_json()["status"] == "updated"


def test_update_profile_language_accepts_pt(client, seed_user, auth_headers):
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "pt"})
    assert res.status_code == 200


def test_update_profile_language_accepts_es(client, seed_user, auth_headers):
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "es"})
    assert res.status_code == 200


def test_update_profile_language_accepts_fr(client, seed_user, auth_headers):
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "fr"})
    assert res.status_code == 200


def test_update_profile_language_accepts_null_clears(client, seed_user, auth_headers):
    """Explicit null is the "reset to browser default" semantic — the
    frontend's detectBrowserLocale takes over until the user picks again."""
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": None})
    assert res.status_code == 200


def test_update_profile_language_rejects_unknown(client, seed_user, auth_headers):
    """Any string outside the en/pt/es/fr allowlist is a 400. Prevents
    a manipulated client from writing junk that the frontend's
    KNOWN_LOCALES gate would then silently fall back from."""
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": "xx"})
    assert res.status_code == 400
    assert "en, pt, es, fr" in res.get_json()["error"]


def test_update_profile_language_rejects_non_string(client, seed_user, auth_headers):
    """Numeric/object payloads also get 400 (anything not in the allowlist)."""
    res = client.post("/api/profile/update", headers=auth_headers, json={"language": 42})
    assert res.status_code == 400


def test_trip_stale_clientUpdatedAt_returns_409(
    client, seed_user, auth_headers,
):
    """R3-Round 5 B1 mirror of the expense test above. POST /api/trips
    with a stale `clientUpdatedAt` returns 409 + `current` so the
    losing client can re-render against fresh state and retry."""
    # First write — no clientUpdatedAt (new row).
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-stale", "name": "Florence", "country": "Italy"},
    })
    assert res.status_code == 200
    first_updated_at = res.get_json().get("updatedAt")
    assert first_updated_at, "first write should return updatedAt"

    # Second write WITHOUT clientUpdatedAt — legacy path, accepted.
    res2 = client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-stale", "name": "Florence 2", "country": "Italy"},
    })
    assert res2.status_code == 200
    second_updated_at = res2.get_json().get("updatedAt")
    assert second_updated_at and second_updated_at != first_updated_at, \
        "updatedAt should advance on each write"

    # Third write WITH the now-stale first_updated_at → 409.
    res3 = client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-stale", "name": "Florence 99", "country": "Italy",
            "clientUpdatedAt": first_updated_at,
        },
    })
    assert res3.status_code == 409
    body = res3.get_json()
    assert "current" in body, "409 should include the live row"
    # And the row is unchanged from the second write.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(t for t in pull["trips"] if t["id"] == "trip-stale")
    assert found["name"] == "Florence 2", \
        "stale write should not have overwritten the second write"


# ── /api/public-trip + /api/public-profile ───────────────────────────────────

def test_public_trip_404_for_nonexistent(client):
    """Public trip endpoint is unauthenticated (anyone with the link
    can view), but returns 404 for unknown ids — pin so a regression
    doesn't accidentally leak private trip rows under the wrong id."""
    res = client.get("/api/public-trip/does-not-exist")
    assert res.status_code in (200, 404)
    if res.status_code == 200:
        body = res.get_json()
        assert body.get("error") or body.get("trip") is None


def test_public_trip_returns_full_payload_when_public(client, seed_user, auth_headers):
    """Happy path: a public trip with `publicShowExpenses=True` returns
    the full archived-trip-shape payload (trip metadata + tripDays +
    expenses + members + owner) the frontend's renderArchivedTripDetail
    consumes. With `publicShowExpenses=False` (the default) the expense
    rows are stripped — see test_public_trip_redacts_expenses_by_default
    below for that path."""
    # Owner creates a trip + a day + an expense, flags it public AND
    # opts into the new expense-sharing toggle.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-public",
            "name": "Lisbon",
            "isPublic": True,
            "publicShowExpenses": True,
        },
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-pub-1", "tripId": "trip-public", "dayNumber": 1,
            "name": "Alfama", "date": "2026-04-15",
        },
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-pub-1", "tripId": "trip-public", "who": "Me",
            "value": 12.5, "currency": "EUR", "euroValue": 12.5,
            "label": "Pastel de nata", "date": "2026-04-15",
        },
    })
    # Anonymous (no auth headers) — public trip is unauthenticated.
    res = client.get("/api/public-trip/trip-public")
    assert res.status_code == 200
    body = res.get_json()
    trip = body["trip"]
    assert trip["name"] == "Lisbon"
    assert trip["isPublic"] is True
    assert trip["publicShowExpenses"] is True
    assert trip["ownerId"] == seed_user
    # tripDays + expenses are inlined on the trip object — that's what
    # the frontend's archived-trip renderer reads from.
    assert len(trip["tripDays"]) == 1
    assert trip["tripDays"][0]["name"] == "Alfama"
    assert len(trip["expenses"]) == 1
    assert trip["expenses"][0]["label"] == "Pastel de nata"
    # Granularity flag: not redacted when publicShowExpenses=True.
    assert trip["expensesRedacted"] is False
    # Owner block is the minimum the renderer needs.
    assert body["owner"]["name"] == "Test User"


def test_public_trip_redacts_expenses_by_default(client, seed_user, auth_headers):
    """New default for §public-granularity: a trip marked public but
    WITHOUT `publicShowExpenses=True` exposes everything EXCEPT
    expense rows. Pre-fix, `isPublic=1` was an all-or-nothing switch
    that silently leaked financial details to anyone with the trip id.
    """
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-pub-plan-only",
            "name": "Tokyo",
            "isPublic": True,
            # publicShowExpenses NOT set — defaults to false.
        },
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-tk-1", "tripId": "trip-pub-plan-only",
            "dayNumber": 1, "name": "Shinjuku", "date": "2026-05-01",
        },
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-tk-1", "tripId": "trip-pub-plan-only",
            "who": "Me", "value": 80.0, "currency": "EUR",
            "euroValue": 80.0, "label": "Sushi dinner",
            "date": "2026-05-01",
        },
    })
    res = client.get("/api/public-trip/trip-pub-plan-only")
    assert res.status_code == 200
    trip = res.get_json()["trip"]
    # Plan-side data still surfaces.
    assert trip["isPublic"] is True
    assert trip["publicShowExpenses"] is False
    assert len(trip["tripDays"]) == 1
    assert trip["tripDays"][0]["name"] == "Shinjuku"
    # Expenses are stripped — and the flag tells the renderer WHY
    # so it can show a "owner kept expenses private" hint instead of
    # an empty state.
    assert trip["expenses"] == []
    assert trip["expensesRedacted"] is True


def test_public_trip_members_always_see_expenses(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Trip members ALWAYS see expenses regardless of the
    publicShowExpenses flag — they own / edit the trip. Pre-fix this
    was implicit (the gate didn't check membership); explicit now."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": "trip-members-see",
            "name": "Bali",
            "isPublic": True,
            # publicShowExpenses NOT set → public viewers redacted.
        },
    })
    # Seed `seed_other_user` as an accepted member of the trip.
    _seed_member("trip-members-see", seed_other_user, role="relaxer")
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-bali-1", "tripId": "trip-members-see",
            "who": "Me", "value": 20.0, "currency": "EUR",
            "euroValue": 20.0, "label": "Spa", "date": "2026-04-01",
        },
    })
    # Member-as-caller — sees the expense even though the trip is
    # public+redacted to strangers.
    res = client.get("/api/public-trip/trip-members-see", headers=other_auth_headers)
    assert res.status_code == 200
    trip = res.get_json()["trip"]
    assert trip["expensesRedacted"] is False
    assert len(trip["expenses"]) == 1
    assert trip["expenses"][0]["label"] == "Spa"


def test_public_trip_404_when_private_to_anonymous(client, seed_user, auth_headers):
    """Privacy gate: a private trip returns 404 (NOT 403) to a non-member
    so a probing client can't enumerate which trip IDs exist."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-private", "name": "Secret"},  # isPublic defaults to false
    })
    # Anonymous request — no auth header.
    res = client.get("/api/public-trip/trip-private")
    assert res.status_code == 404


def test_public_trip_visible_to_owner_when_private(client, seed_user, auth_headers):
    """Owner sees their own private trip even though it isn't public —
    the gate falls through when caller is the trip's user_id."""
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-mine", "name": "My private trip"},
    })
    res = client.get("/api/public-trip/trip-mine", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["trip"]["name"] == "My private trip"


# ── /api/trips/<id>/silence | archive | unarchive ────────────────────────────

def test_trip_silence_toggle(client, seed_user, auth_headers):
    """Owner toggles the actions-feed-silencing flag. Returns the new
    state so the UI can reconcile."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-silence")
    res = client.post(
        f"/api/trips/{trip_id}/silence",
        headers=auth_headers,
        json={"hidden": True},
    )
    assert res.status_code == 200


def test_trip_archive_then_unarchive(client, seed_user, auth_headers):
    """Per-user archive flag flips on, then off. Each member's archive
    state is independent (other tests can pin that boundary)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-arch")
    res = client.post(f"/api/trips/{trip_id}/archive", headers=auth_headers)
    assert res.status_code == 200
    res = client.post(f"/api/trips/{trip_id}/unarchive", headers=auth_headers)
    assert res.status_code == 200


def test_trip_silence_rejects_non_owner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Silencing is owner-only — non-owner gets 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-silence-403")
    res = client.post(
        f"/api/trips/{trip_id}/silence",
        headers=other_auth_headers,
        json={"hidden": True},
    )
    assert res.status_code in (403, 404)


def test_upsert_trip_cannot_touch_media(client, seed_user, auth_headers):
    """R12-B4 — the headline guarantee. A trip-metadata upsert via
    /api/trips that carries media keys (as a legacy/stale client would)
    must NOT write them. This is what makes the Phase-1B data-loss class
    impossible: a rename can't clobber photos. Seed media via the
    dedicated endpoint, then upsert the trip with DIFFERENT media in the
    body + a name change — the name changes, the media does not."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-upsert-nomedia")
    client.post(f"/api/trips/{trip_id}/media", headers=auth_headers, json={
        "photos": [{"id": "keep-me"}],
        "checklist": [{"id": "keep-task"}],
    })
    # Upsert the trip with a new name AND adversarial empty media arrays
    # in the body (mimicking the cold-start []-placeholder that caused
    # the original P0).
    res = client.post("/api/trips", headers=auth_headers, json={
        "trip": {
            "id": trip_id, "name": "Renamed Trip", "country": "Test",
            "photos": [], "documents": [], "markedPlaces": [], "checklist": [],
        },
    })
    assert res.status_code == 200
    # Name changed via metadata path...
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == trip_id)
    assert trip["name"] == "Renamed Trip"
    # ...but media is UNTOUCHED — the []s in the upsert body were ignored.
    media = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert media["photos"] == [{"id": "keep-me"}], "upsert must not wipe photos"
    assert media["checklist"] == [{"id": "keep-task"}], "upsert must not wipe checklist"


def test_trip_invite_creates_pending(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Owner invites a friend — server upserts a pending trip_members row
    + fires a notification. Gates on accepted-friendship (audit fix), so
    we have to befriend first."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert res.status_code == 200


def test_trip_invite_works_for_non_friend_under_model_b(
    client, seed_user, seed_other_user, auth_headers,
):
    """Model B: the trip-invite friend-gate is dropped. Trip invites
    are an explicit access grant decoupled from the social graph;
    anyone can be invited (with the existing 30/min rate-limit as
    spam defense + the trip-planner-only gate for who's allowed to
    invite). Pre-Model-B this asserted 403 (must-be-friend); now it
    asserts the invite goes through to a stranger."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite-stranger")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    assert res.status_code == 200


def test_trip_invite_respond_accept(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """seed_user invites seed_other_user; seed_other_user accepts. Body
    is just { trip_id, accept } — the responder is identified via the
    JWT, the row is matched by (trip_id, responder_user_id)."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite-accept")
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    res = client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id,
        "accept": True,
    })
    assert res.status_code == 200


def test_trip_members_remove_owner_only(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Only the trip owner can remove members. Non-owner caller → 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-rm")
    res = client.post("/api/trips/members/remove", headers=other_auth_headers, json={
        "trip_id": trip_id,
        "user_id": seed_other_user,
    })
    assert res.status_code in (403, 400, 404)


def test_trip_invite_rejects_unknown_role(client, seed_user, auth_headers):
    """Role must be one of planner | budgeteer | relaxer. Anything
    else returns 400 before any DB write — pin the allowlist so a
    typo / new role can't silently slip through."""
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": "trip-x", "target_user_id": "u-x", "role": "admin",
    })
    assert res.status_code == 400


def test_trip_invite_rejects_self_invite(client, seed_user, auth_headers):
    """You can't invite yourself to your own trip — that's already an
    auto-membership. 400, not 200/no-op, so a buggy frontend is loud
    rather than silent."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-self")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id, "target_user_id": seed_user, "role": "relaxer",
    })
    assert res.status_code == 400


def test_trip_invite_rejects_missing_target(client, seed_user, auth_headers):
    """Missing target_user_id (or trip_id) → 400."""
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": "trip-x", "role": "relaxer",
    })
    assert res.status_code == 400


def test_trip_invite_respond_decline_removes_member_row(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Responding decline removes the pending row entirely (vs accept
    which just flips invitation_status). Tested by confirming a
    follow-up accept-respond fails because there's no row to act on."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-decline")
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id, "target_user_id": seed_other_user, "role": "relaxer",
    })
    decline = client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": False,
    })
    assert decline.status_code == 200
    # Re-respond should now have no row to act on (decline-cleanup
    # removed it). Still returns 200 — the endpoint is idempotent —
    # but a subsequent accept attempt has no membership row to flip.
    re_accept = client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })
    # Accepting a non-existent invite is treated as not-found; both
    # 404 and a quietly-OK 200 are acceptable shapes — just pin that
    # it doesn't 500.
    assert re_accept.status_code in (200, 404)


def test_delete_trip_owner_only(client, seed_user, auth_headers):
    """Owner can delete their own trip — the cascade kills expenses +
    members + the trip row in one transaction."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-doomed")
    # Seed an expense + member to confirm the cascade actually runs.
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-d", "tripId": trip_id, "who": "Me", "value": 1,
            "currency": "EUR", "euroValue": 1, "label": "x", "date": "2026-01-01",
        },
    })
    res = client.delete(f"/api/trips/{trip_id}", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json() == {"status": "deleted"}
    # Confirm the cascade: trip is gone from /api/data + the expense
    # is also gone (cascade deleted it).
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert all(t["id"] != trip_id for t in body["trips"])
    assert all(e["id"] != "exp-d" for e in body["expenses"])


def test_delete_trip_rejects_non_owner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Non-owners can only LEAVE a trip via members/remove — they can't
    delete the trip out from under everyone else. Pinned at 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-survives")
    res = client.delete(f"/api/trips/{trip_id}", headers=other_auth_headers)
    assert res.status_code == 403
    # Owner's trip survives the hostile DELETE.
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert any(t["id"] == trip_id for t in body["trips"])


def test_archive_rejects_non_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Per-user archive flag is only valid for members of the trip.
    A non-member trying to archive (the bizarre case of someone with
    a guessed trip_id) → 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-arch-403")
    res = client.post(f"/api/trips/{trip_id}/archive", headers=other_auth_headers)
    assert res.status_code == 403


def test_unarchive_rejects_non_member(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Mirror of the archive 403 — non-members can't unarchive a trip
    they're not on."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-unarch-403")
    res = client.post(f"/api/trips/{trip_id}/unarchive", headers=other_auth_headers)
    assert res.status_code == 403


def test_invite_trip_member_does_not_demote_accepted_planner(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit fix (2026-05-27): re-inviting an already-accepted member
    with a DIFFERENT role must NOT silently demote them. Pre-fix the
    ON CONFLICT clause set role=excluded.role unconditionally — a
    planner re-inviting another planner "as relaxer" silently
    stripped their planner rights with no notification.
    """
    trip_id = _create_trip(client, auth_headers, trip_id="trip-no-demote")
    # Invite as planner, have them accept.
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "planner",
    })
    client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })
    # Re-invite the now-accepted member as relaxer — should be a no-op
    # on the role.
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    # Verify the planner role survived.
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT role, invitation_status FROM trip_members "
            "WHERE trip_id = ? AND user_id = ?",
            (trip_id, seed_other_user),
        ).fetchone()
        assert row["role"] == "planner", \
            f"accepted planner was demoted to {row['role']!r}"
        assert row["invitation_status"] == "accepted"


def test_share_token_hidden_from_non_owner_members(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R3-Fix #3: pre-fix, every accepted trip member saw the owner's
    share_token (+ shareViews/shareShowCost/shareShowPlans) in their
    /api/data response. A non-owner planner could re-share the public
    URL the owner intentionally kept private. Now: non-owners see
    None/0/False for all four share_* fields; only the owner sees the
    real values."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-leak")
    # Owner generates a share token.
    res = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": True, "showPlans": True},
    )
    assert res.status_code == 200
    owner_token = res.get_json()["token"]
    assert owner_token  # sanity

    # Invite + accept the other user as planner (so they're an accepted
    # trip member — the exact case where the leak fired pre-fix).
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "planner",
    })
    client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })

    # Owner sees the real share state.
    owner_data = client.get("/api/data", headers=auth_headers).get_json()
    owner_trip = next(t for t in owner_data["trips"] if t["id"] == trip_id)
    assert owner_trip["shareToken"] == owner_token
    assert owner_trip["shareShowCost"] is True
    assert owner_trip["shareShowPlans"] is True

    # Accepted-member non-owner gets None / False for everything.
    member_data = client.get("/api/data", headers=other_auth_headers).get_json()
    member_trip = next(t for t in member_data["trips"] if t["id"] == trip_id)
    assert member_trip["shareToken"] is None, \
        f"share_token leaked to non-owner member: {member_trip['shareToken']!r}"
    assert member_trip["shareViews"] == 0
    assert member_trip["shareShowCost"] is False
    assert member_trip["shareShowPlans"] is False


def test_invite_trip_member_404_on_unknown_target(
    client, seed_user, auth_headers,
):
    """Audit fix (2026-05-26): pre-fix, inviting a nonexistent user_id
    raised sqlite3.IntegrityError on the FK → unhandled → 500. Now
    we 404 cleanly via ensure_user_exists."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite-ghost")
    res = client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": "user-does-not-exist",
        "role": "relaxer",
    })
    assert res.status_code == 404


def test_legacy_trips_share_route_is_gone(client, seed_user, auth_headers):
    """`/api/trips/share` was removed 2026-05-13 (FIXING_ROADMAP §0.2)
    — the route had no ownership / friendship checks and let any
    authenticated user grant themselves read access to ANY trip.
    Pin that it's gone so a future refactor doesn't re-introduce it
    by accident. Flask returns 405 (not 404) because the URL pattern
    `/api/trips/share` overlaps with the DELETE `/api/trips/<trip_id>`
    route — POSTing matches the path but the method isn't allowed,
    which is the correct "this is not a POST endpoint" signal."""
    res = client.post("/api/trips/share", headers=auth_headers, json={
        "trip_id": "anything",
        "friend_id": "anyone",
    })
    assert res.status_code in (404, 405)


# ── Share-via-link (FIXING_ROADMAP §4.1) ────────────────────────────────────

def test_share_create_returns_token_and_url(client, seed_user, auth_headers):
    """Owner generates a share token; route returns the token + the
    public URL the frontend pastes into clipboard."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-1")
    res = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={"showCost": False},
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body.get("token") and len(body["token"]) >= 16
    assert body.get("url") == f"/share/{body['token']}"
    assert body.get("showCost") is False


def test_share_create_owner_only(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Non-owner can't generate a share link — only the trip's creator
    decides if it goes public."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-owner")
    res = client.post(
        f"/api/trips/{trip_id}/share", headers=other_auth_headers, json={},
    )
    assert res.status_code == 403


def test_share_revoke_clears_token(client, seed_user, auth_headers):
    """DELETE clears the share token. A subsequent GET on the public
    endpoint with the old token returns 404 — the link stops working
    immediately."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-revoke")
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    token = create["token"]
    # Public GET works before revoke.
    pre = client.get(f"/api/share/{token}")
    assert pre.status_code == 200

    rev = client.delete(f"/api/trips/{trip_id}/share", headers=auth_headers)
    assert rev.status_code == 200

    # Public GET 404s after revoke.
    post = client.get(f"/api/share/{token}")
    assert post.status_code == 404


def test_share_create_rotates_token(client, seed_user, auth_headers):
    """Generating a share link on a trip that already has one rotates
    the token — the old URL stops working, the new one starts. Lets
    the owner kill a leaked link without an unshare/reshare dance."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-rotate")
    first = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    second = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    assert first["token"] != second["token"]

    # Old token is now dead.
    assert client.get(f"/api/share/{first['token']}").status_code == 404
    assert client.get(f"/api/share/{second['token']}").status_code == 200


def test_share_public_get_is_unauthenticated(client, seed_user, auth_headers):
    """The public read endpoint must work WITHOUT an Authorization
    header — that's the whole point of a share link."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-anon")
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    # No auth_headers passed — anonymous request.
    res = client.get(f"/api/share/{create['token']}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["trip"]["name"]


def test_share_public_payload_excludes_expenses_by_default(
    client, seed_user, auth_headers,
):
    """Privacy posture: a share with showCost=False (default) MUST NOT
    return any expense data — not totals, not line items. Cost is null."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-noexp")
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-private", "tripId": trip_id, "who": "Me",
            "value": 99, "currency": "EUR", "euroValue": 99,
            "label": "Secret hotel", "date": "2026-05-10",
        },
    })
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": False},
    ).get_json()
    res = client.get(f"/api/share/{create['token']}")
    body = res.get_json()
    assert body.get("cost") is None
    assert "expenses" not in body
    # And the line-item label must not leak into the JSON anywhere.
    assert "Secret hotel" not in res.get_data(as_text=True)


def test_share_public_payload_includes_aggregate_cost_when_opted_in(
    client, seed_user, auth_headers,
):
    """Opt-in: showCost=True surfaces total + per-country aggregate but
    NEVER individual labels. The killer move from VISION.md (cost-as-
    content) ships with a privacy floor."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-cost")
    for ex in [
        {"id": "e1", "tripId": trip_id, "who": "Me", "value": 50,
         "currency": "EUR", "euroValue": 50, "label": "Lunch in Lisbon",
         "country": "Portugal", "date": "2026-05-10"},
        {"id": "e2", "tripId": trip_id, "who": "Me", "value": 30,
         "currency": "EUR", "euroValue": 30, "label": "Coffee",
         "country": "Spain", "date": "2026-05-11"},
    ]:
        client.post("/api/expenses", headers=auth_headers, json={"expense": ex})
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": True},
    ).get_json()
    res = client.get(f"/api/share/{create['token']}")
    body = res.get_json()
    assert body["cost"]["total"] == 80.0
    countries = {c["country"]: c["total"] for c in body["cost"]["perCountry"]}
    assert countries["Portugal"] == 50.0
    assert countries["Spain"] == 30.0
    # Labels still NEVER leak.
    assert "Lunch in Lisbon" not in res.get_data(as_text=True)
    assert "Coffee" not in res.get_data(as_text=True)


def test_share_public_payload_excludes_plans_by_default(
    client, seed_user, auth_headers,
):
    """Privacy posture #2: a share with showPlans=False (default)
    MUST NOT return any day plan text — morning/afternoon/evening
    notes or tip strings. The day rows return only metadata
    (dayNumber, date, name, lat, lng)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-noplans")
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "d1", "tripId": trip_id, "dayNumber": 1, "date": "2026-06-01",
            "name": "Lisbon", "plan": {
                "morning": "Secret cafe address at Rua X",
                "afternoon": "Castle visit",
                "evening": "",
            },
            "tip": "Apartment key under the mat",
        },
    })
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showPlans": False},
    ).get_json()
    res = client.get(f"/api/share/{create['token']}")
    body = res.get_json()
    # Plan / tip keys not present in the day shape.
    assert all("plan" not in d for d in body["days"])
    assert all("tip" not in d for d in body["days"])
    # The raw plan / tip text must not leak into the JSON anywhere.
    raw = res.get_data(as_text=True)
    assert "Secret cafe address" not in raw
    assert "Apartment key under the mat" not in raw


def test_share_public_payload_includes_plans_when_opted_in(
    client, seed_user, auth_headers,
):
    """Opt-in: showPlans=True surfaces morning/afternoon/evening text
    + the tip per day. Photos and documents are still NOT included
    (separate, not-yet-implemented toggle)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-plans")
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "d2", "tripId": trip_id, "dayNumber": 1, "date": "2026-06-02",
            "name": "Lisbon",
            "plan": {
                "morning": "Pasteis de Belem queue",
                "afternoon": "Tram 28 ride",
                "evening": "Bairro Alto dinner",
            },
            "tip": "Buy a Viva Viagem card at any metro",
        },
    })
    create = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showPlans": True},
    ).get_json()
    assert create["showPlans"] is True
    res = client.get(f"/api/share/{create['token']}")
    body = res.get_json()
    day = next((d for d in body["days"] if d["dayNumber"] == 1), None)
    assert day is not None
    assert day["plan"]["morning"] == "Pasteis de Belem queue"
    assert day["plan"]["afternoon"] == "Tram 28 ride"
    assert day["plan"]["evening"] == "Bairro Alto dinner"
    assert day["tip"] == "Buy a Viva Viagem card at any metro"


def _seed_share_source(trip_id):
    """Give a trip a private wishlist + a day with plan text, directly in DB."""
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "UPDATE trips SET marked_places_json = ? WHERE id = ?",
            (json.dumps([{"id": "w1", "name": "Secret Spot", "forManual": True}]), trip_id),
        )
        c.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, name, morning) "
            "VALUES (?, ?, ?, ?, ?)",
            (f"{trip_id}-d1", trip_id, 1, "Day 1", "Secret plan text"),
        )
        conn.commit()


def test_share_clone_respects_plan_and_wishlist_privacy(
    client, seed_user, auth_headers, seed_other_user, other_auth_headers,
):
    """Audit MK5 P1: a share-link clone must NOT resurrect day-plan text the
    owner kept private (share_show_plans=0), nor copy the markedPlaces wishlist
    (the share + public-trip reads strip it from non-members)."""
    _create_trip(client, auth_headers, trip_id="share-src", name="Lisbon")
    _seed_share_source("share-src")
    token = client.post(
        "/api/trips/share-src/share", headers=auth_headers,
        json={"showCost": False, "showPlans": False},
    ).get_json()["token"]

    new_id = client.post(
        f"/api/share/{token}/clone", headers=other_auth_headers,
    ).get_json()["tripId"]

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        day = c.execute(
            "SELECT morning FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL",
            (new_id,),
        ).fetchone()
        assert day is not None
        assert (day["morning"] or "") == "", "clone leaked hidden day-plan text"
        mp = c.execute(
            "SELECT marked_places_json FROM trips WHERE id = ?", (new_id,),
        ).fetchone()["marked_places_json"]
        assert not mp or json.loads(mp) == [], "clone leaked the owner's private wishlist"


def test_share_clone_copies_plans_when_shared(
    client, seed_user, auth_headers, seed_other_user, other_auth_headers,
):
    """share_show_plans=1 → the clone copies plan text (it was visible), but the
    private wishlist still never copies on a share clone."""
    _create_trip(client, auth_headers, trip_id="share-src2", name="Rome")
    _seed_share_source("share-src2")
    token = client.post(
        "/api/trips/share-src2/share", headers=auth_headers,
        json={"showCost": False, "showPlans": True},
    ).get_json()["token"]

    new_id = client.post(
        f"/api/share/{token}/clone", headers=other_auth_headers,
    ).get_json()["tripId"]

    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        day = c.execute(
            "SELECT morning FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL",
            (new_id,),
        ).fetchone()
        assert (day["morning"] or "") == "Secret plan text", "shared plan text should copy"
        mp = c.execute(
            "SELECT marked_places_json FROM trips WHERE id = ?", (new_id,),
        ).fetchone()["marked_places_json"]
        assert not mp or json.loads(mp) == [], "wishlist must never copy on a share clone"


def test_member_clone_strips_marked_place_day_refs(client, seed_user, auth_headers):
    """Audit MK5 P2: a member clone copies the wishlist, but must STRIP each
    pin's source-trip dayId/timeOfDay — those day ids don't exist in the clone,
    so the pins would be invisible under every per-day map filter."""
    _create_trip(client, auth_headers, trip_id="clone-src", name="Lisbon")
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET marked_places_json = ? WHERE id = ?",
            (json.dumps([{
                "id": "p1", "name": "Belém", "forManual": True,
                "dayId": "src-day-1", "timeOfDay": "morning",
            }]), "clone-src"),
        )
        conn.commit()

    new_id = client.post(
        "/api/trips/clone/clone-src", headers=auth_headers,
    ).get_json()["tripId"]

    from database import get_db as _db
    with _db() as conn:
        mp = conn.execute(
            "SELECT marked_places_json FROM trips WHERE id = ?", (new_id,),
        ).fetchone()["marked_places_json"]
        places = json.loads(mp)
        assert len(places) == 1
        assert places[0]["name"] == "Belém"  # wishlist copied for a member clone
        assert "dayId" not in places[0] and "timeOfDay" not in places[0]  # but day refs stripped


def test_share_revoke_resets_plans_toggle(client, seed_user, auth_headers):
    """DELETE share clears BOTH the token AND the toggles, so a
    re-share starts privacy-clean. Prevents "I unshared, then someone
    re-shared, and the cost banner I'd toggled on last time is still
    on" surprise."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-reset")
    client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": True, "showPlans": True},
    )
    client.delete(f"/api/trips/{trip_id}/share", headers=auth_headers)
    # Fresh re-share — defaults should be off again.
    after = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()
    assert after["showCost"] is False
    assert after["showPlans"] is False


# ── Trip cloning (FIXING_ROADMAP §4.6) ────────────────────────────────

def test_clone_trip_deep_copies_days_and_metadata(
    client, seed_user, auth_headers,
):
    """Clone returns a new trip_id; the source's metadata + days are
    copied into a fresh draft owned by the caller, with `(copy)`
    suffix on the name."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-source", name="My Trip")
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "d-src-1", "tripId": trip_id, "dayNumber": 1,
            "date": "2026-06-01", "name": "Lisbon",
            "plan": {"morning": "Cafe", "afternoon": "Castle", "evening": ""},
            "tip": "Bring sunscreen", "lat": 38.7, "lng": -9.1,
        },
    })

    res = client.post(f"/api/trips/clone/{trip_id}", headers=auth_headers)
    assert res.status_code == 200
    new_trip_id = res.get_json()["tripId"]
    assert new_trip_id and new_trip_id != trip_id

    # Pull canonical state and confirm the new trip is in the active
    # list with copied content.
    data = client.get("/api/data", headers=auth_headers).get_json()
    cloned = next((t for t in data["trips"] if t["id"] == new_trip_id), None)
    assert cloned is not None
    assert cloned["name"] == "My Trip (copy)"
    assert cloned["isArchived"] is False
    assert cloned["isPublic"] is False

    cloned_days = [d for d in data["tripDays"] if d["tripId"] == new_trip_id]
    assert len(cloned_days) == 1
    assert cloned_days[0]["name"] == "Lisbon"
    assert cloned_days[0]["plan"]["morning"] == "Cafe"
    assert cloned_days[0]["plan"]["afternoon"] == "Castle"
    # Day id MUST be different from the source's day.
    assert cloned_days[0]["id"] != "d-src-1"


def test_clone_drops_uploaded_cover_keeps_shared(client, seed_user, auth_headers):
    """Audit MK5 BUG-037/057: a clone must not point at the SOURCE owner's
    uploaded cover file — it 404s when the owner deletes/unshares, and the cloner
    can't serve a file outside their own namespace. An uploaded cover is DROPPED
    (the clone falls back to its country default); a country-default / external
    cover URL is a stable shared asset and is KEPT."""
    from database import get_db

    def _clone_with_cover(src_id, cover):
        _create_trip(client, auth_headers, trip_id=src_id, name="Cover Trip")
        with get_db() as conn:
            conn.execute("UPDATE trips SET cover_url = ? WHERE id = ?", (cover, src_id))
            conn.commit()
        res = client.post(f"/api/trips/clone/{src_id}", headers=auth_headers)
        assert res.status_code == 200, res.get_data(as_text=True)
        new_id = res.get_json()["tripId"]
        with get_db() as conn:
            return conn.execute(
                "SELECT cover_url FROM trips WHERE id = ?", (new_id,),
            ).fetchone()["cover_url"]

    # An uploaded cover (source owner's namespace) is DROPPED → country default.
    assert _clone_with_cover(
        "cover-upl-src", f"/static/uploads/{seed_user}/personal.jpg",
    ) is None
    # A country-default / external cover URL is KEPT.
    kept = "/static/country-defaults/norway.jpg"
    assert _clone_with_cover("cover-def-src", kept) == kept


def test_clone_trip_drops_expenses_and_share_state(
    client, seed_user, auth_headers,
):
    """The clone is a fresh DRAFT — the source's expenses + share
    state stay with the original, not the copy."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-with-expenses")
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-source", "tripId": trip_id, "who": "Me",
            "value": 99, "currency": "EUR", "euroValue": 99,
            "label": "Original spend", "date": "2026-06-01",
        },
    })
    # Set up the source as shared with the cost toggle on.
    client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers,
        json={"showCost": True, "showPlans": True},
    )

    new_trip_id = client.post(
        f"/api/trips/clone/{trip_id}", headers=auth_headers,
    ).get_json()["tripId"]

    data = client.get("/api/data", headers=auth_headers).get_json()
    # The clone has NO expenses.
    cloned_expenses = [e for e in data["expenses"] if e.get("tripId") == new_trip_id]
    assert cloned_expenses == []
    # The clone is NOT shared (fresh draft, share state reset).
    cloned = next((t for t in data["trips"] if t["id"] == new_trip_id), None)
    assert cloned["shareToken"] is None
    assert cloned["shareViews"] == 0
    assert cloned["shareShowCost"] is False
    assert cloned["shareShowPlans"] is False


def test_clone_trip_private_to_stranger_returns_404(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """A non-public trip owned by user A returns 404 (not 403) for
    user B's clone attempt — same anti-enumeration posture as the
    rest of /api/public-trip etc."""
    trip_id = _create_trip(
        client, auth_headers, trip_id="trip-private-source", name="Private",
    )
    # Stranger tries to clone — should be 404.
    res = client.post(f"/api/trips/clone/{trip_id}", headers=other_auth_headers)
    assert res.status_code == 404


def test_clone_trip_public_to_stranger_succeeds(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """A public trip can be cloned by any authenticated user. The
    clone is owned by the cloner, not the original owner."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-public-source")
    # Mark the trip public via the existing public-toggle flow.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": trip_id, "name": "Public Trip", "isPublic": True},
    })

    new_trip_id = client.post(
        f"/api/trips/clone/{trip_id}", headers=other_auth_headers,
    ).get_json()["tripId"]

    # other_user's /api/data now includes the cloned trip as their own.
    data = client.get("/api/data", headers=other_auth_headers).get_json()
    cloned = next((t for t in data["trips"] if t["id"] == new_trip_id), None)
    assert cloned is not None
    assert cloned["ownerId"] == seed_other_user


def test_clone_via_share_token_works_without_membership(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Anyone with a share token can clone — possession of the token
    IS the proof of intent to share. Membership in the source trip
    isn't required."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-shared-via-link")
    token = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()["token"]

    # other_user is not a member of trip_id, but they have the token.
    res = client.post(f"/api/share/{token}/clone", headers=other_auth_headers)
    assert res.status_code == 200
    new_trip_id = res.get_json()["tripId"]
    assert new_trip_id

    # other_user's data contains the clone, owned by them.
    data = client.get("/api/data", headers=other_auth_headers).get_json()
    cloned = next((t for t in data["trips"] if t["id"] == new_trip_id), None)
    assert cloned["ownerId"] == seed_other_user


def test_clone_via_unknown_share_token_returns_404(client, seed_user, auth_headers):
    """Unknown / expired tokens get 404."""
    res = client.post("/api/share/fake-token-doesnt-exist/clone", headers=auth_headers)
    assert res.status_code == 404


def test_clone_trip_requires_auth(client, seed_user, auth_headers):
    """Both clone endpoints are auth-gated — anonymous traffic 401s.
    The clone needs an owner, so anonymous calls have no destination."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-needs-auth")
    res = client.post(f"/api/trips/clone/{trip_id}")
    assert res.status_code == 401


def test_clone_trip_id_path_refuses_archived_source(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: /api/share/<token>/clone correctly refused
    archived sources (Trip #39); /api/trips/clone/<id> didn't. A
    member who knew the source trip id could clone it after the
    owner had archived. Now both paths return 410 on archived."""
    # Owner creates a public trip, invites other as member, then archives.
    trip_id = _create_trip(client, auth_headers, trip_id="trip-clone-arch", public=True)
    client.post("/api/trips/invite", headers=auth_headers, json={
        "trip_id": trip_id,
        "target_user_id": seed_other_user,
        "role": "relaxer",
    })
    client.post("/api/trips/invite/respond", headers=other_auth_headers, json={
        "trip_id": trip_id, "accept": True,
    })
    client.post(f"/api/trips/{trip_id}/archive", headers=auth_headers)
    # Member tries to clone via the id path — must 410.
    res = client.post(f"/api/trips/clone/{trip_id}", headers=other_auth_headers)
    assert res.status_code == 410, (
        f"clone of archived trip via /api/trips/clone/<id> must 410, got {res.status_code}"
    )


def test_share_view_count_increments_and_dedupes_in_24h(
    client, seed_user, auth_headers,
):
    """First hit to /share/<token> increments the view counter; same
    browser within 24h doesn't. A different browser (no cookie) does."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-share-views")
    token = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()["token"]

    # First visitor.
    r1 = client.get(f"/share/{token}")
    assert r1.status_code == 200
    # Cookie is set; second hit from the SAME test client carries it,
    # so the counter shouldn't bump.
    r2 = client.get(f"/share/{token}")
    assert r2.status_code == 200

    # Confirm view count is 1 (not 2). The API exposes views via the
    # public JSON endpoint.
    payload = client.get(f"/api/share/{token}").get_json()
    assert payload["trip"]["views"] == 1

    # A fresh client (no cookies) counts as a new visitor.
    fresh = client.application.test_client()
    fresh.get(f"/share/{token}")
    payload2 = client.get(f"/api/share/{token}").get_json()
    assert payload2["trip"]["views"] == 2


def test_share_html_page_renders_og_meta(client, seed_user, auth_headers):
    """The /share/<token> HTML page must include OG meta tags in the
    initial response so WhatsApp / iMessage / LinkedIn previews
    render with the cover photo + headline."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-og")
    token = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()["token"]
    res = client.get(f"/share/{token}")
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert 'property="og:title"' in html
    assert 'property="og:description"' in html
    assert 'property="og:image"' in html
    assert 'name="twitter:card"' in html


def test_share_page_hub_day_not_labelled_day_one(client, seed_user, auth_headers):
    """BUG-27 (MK2 audit): the Trip Hub is day_number=0 and sorts first.
    The template's `d.dayNumber or loop.index` hit Jinja's falsy trap
    (`0 or 1` → 1), so the Hub AND the real Day 1 both rendered "Day 1".
    The Hub must render as the Hub ("Trip Hub"), leaving exactly one
    "Day 1" on the public share page."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-hub-share")
    # Hub (day_number=0) + a real Day 1, both name-less so the template
    # falls back to its computed labels.
    client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-hub", "tripId": trip_id, "dayNumber": 0},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {"id": "day-one", "tripId": trip_id, "dayNumber": 1},
    })
    token = client.post(
        f"/api/trips/{trip_id}/share", headers=auth_headers, json={},
    ).get_json()["token"]
    res = client.get(f"/share/{token}")
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert html.count("Day 1") == 1, \
        f"expected exactly one 'Day 1', got {html.count('Day 1')} (Hub collision?)"
    assert "Trip Hub" in html, "the day_number=0 row should render as the Trip Hub"


def test_share_html_page_unknown_token_returns_404_friendly(client):
    """An expired or wrong token still renders an HTML page (not a JSON
    error) so a chat preview unfurler doesn't crash, and the user gets
    a friendly "this isn't available" message. We DELIBERATELY don't
    differentiate "never existed" from "revoked" — both 404 with the
    same body so a probing client can't enumerate which tokens are
    legitimate."""
    res = client.get("/share/totally-fake-token-1234")
    assert res.status_code == 404
    html = res.get_data(as_text=True)
    # Jinja autoescapes the apostrophe to &#39; — compare against the
    # encoded form so this stays robust to template engine choices.
    assert ("isn&#39;t available" in html) or ("isn't available" in html)


def test_upsert_trip_persists_countries_array(client, seed_user, auth_headers):
    """§4.3: /api/trips upsert accepts a `countries` array of 2-letter
    ISO codes and persists it as trip_countries_json. /api/data should
    then echo `countries: ["PT", "ES"]` back on the next read.
    """
    payload = {
        "trip": {
            "id": "trip-multi-country-1",
            "name": "Iberia tour",
            "country": "Portugal",
            "countryCode": "PT",
            "countries": ["PT", "ES"],
        },
    }
    res = client.post("/api/trips", json=payload, headers=auth_headers)
    assert res.status_code == 200

    # Read back via /api/data and confirm the field round-trips.
    data = client.get("/api/data", headers=auth_headers)
    assert data.status_code == 200
    body = data.get_json()
    trip = next((t for t in body["trips"] if t["id"] == "trip-multi-country-1"), None)
    assert trip is not None, "trip not in /api/data response"
    assert trip["countries"] == ["PT", "ES"], \
        f"countries did not round-trip: {trip.get('countries')!r}"


def test_upsert_trip_normalizes_and_dedupes_country_codes(client, seed_user, auth_headers):
    """§4.3: server normalizes the incoming codes — upper-cases, strips,
    drops anything that isn't a 2-letter string, AND dedupes while
    preserving order so the primary country stays at position 0. The
    normalization runs server-side so a careless caller (E2E harness,
    future mobile shell) can't corrupt the stored array.
    """
    payload = {
        "trip": {
            "id": "trip-normalize-1",
            "name": "Cleanup",
            "country": "Portugal",
            "countryCode": "pt",  # lowercase — server should upper-case
            "countries": [
                "pt",          # lowercase
                "  ES  ",     # whitespace
                "FR",
                "fr",          # duplicate of FR after upper
                "INVALID",    # not 2 chars → dropped
                "",            # empty → dropped
                123,            # non-string → dropped
                "PT",          # duplicate of primary → dropped (dedupe)
            ],
        },
    }
    res = client.post("/api/trips", json=payload, headers=auth_headers)
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers)
    trip = next(t for t in data.get_json()["trips"] if t["id"] == "trip-normalize-1")
    # Expected: ["PT", "ES", "FR"] — upper-cased, deduped, order preserved.
    assert trip["countries"] == ["PT", "ES", "FR"], \
        f"normalization wrong: {trip.get('countries')!r}"


def test_upsert_trip_no_countries_field_yields_empty_array(client, seed_user, auth_headers):
    """§4.3 legacy compat: trips upserted without a `countries` field
    (the pre-§4.3 client, or any older serializer) should read back
    with `countries: []`. The frontend then falls back to the primary
    `countryCode` for slideshow / chip-strip purposes. Pin the empty-
    array contract — a `null` here would surface as undefined in TS
    and force every consumer to add a defensive `|| []`.
    """
    payload = {
        "trip": {
            "id": "trip-no-countries-1",
            "name": "Legacy",
            "country": "France",
            "countryCode": "FR",
        },
    }
    res = client.post("/api/trips", json=payload, headers=auth_headers)
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers)
    trip = next(t for t in data.get_json()["trips"] if t["id"] == "trip-no-countries-1")
    assert trip["countries"] == [], \
        f"missing countries should serialize to []; got {trip.get('countries')!r}"


def test_upsert_trip_empty_countries_array_clears_column(client, seed_user, auth_headers):
    """§4.3: passing `countries: []` explicitly should NULL the column
    (the read path treats null and empty array identically). Pin so a
    future change to the upsert doesn't accidentally persist `'[]'` as
    a string — wasted bytes + a confusing read-back shape.
    """
    # First write some codes.
    client.post("/api/trips", json={
        "trip": {
            "id": "trip-clear-1", "name": "Pre", "country": "PT",
            "countryCode": "PT", "countries": ["PT", "ES"],
        },
    }, headers=auth_headers)
    # Now clear them.
    res = client.post("/api/trips", json={
        "trip": {
            "id": "trip-clear-1", "name": "Pre", "country": "PT",
            "countryCode": "PT", "countries": [],
        },
    }, headers=auth_headers)
    assert res.status_code == 200

    data = client.get("/api/data", headers=auth_headers)
    trip = next(t for t in data.get_json()["trips"] if t["id"] == "trip-clear-1")
    assert trip["countries"] == []


def test_trip_countries_json_check_rejects_malformed_writes(client, seed_user, auth_headers, temp_db):
    """§4.3 defence, post-2026-05-18 audit M1 hardening: malformed
    `trip_countries_json` values can't reach the DB anymore — the
    json_valid() CHECK constraint (migration a8b9c0d1e2f3) makes
    invalid writes fail at the SQLite layer.

    Previously this test wrote a deliberately-bad value via raw SQL
    to exercise the read-path's defensive json.loads. With the CHECK
    in place, that INSERT now fails with IntegrityError before the
    read even runs. The read-path defense is still in source (an
    untrusted SELECT result could in theory ship NULL bytes or a
    type-confused value), but the meaningful regression net is now
    the constraint itself."""
    import sqlite3
    conn = sqlite3.connect(temp_db)
    conn.row_factory = sqlite3.Row
    with pytest.raises(sqlite3.IntegrityError) as exc_info:
        conn.execute(
            "INSERT INTO trips (id, user_id, name, country, country_code, "
            "is_archived, is_public, trip_countries_json) "
            "VALUES (?, ?, ?, ?, ?, 0, 0, ?)",
            ("trip-malformed-1", seed_user, "Bad", "PT", "PT", "not-valid-json{"),
        )
    conn.close()
    # Useful message + names the column so the operator sees what
    # tripped the constraint at write time.
    msg = str(exc_info.value)
    assert "CHECK" in msg.upper() and "trip_countries_json" in msg, \
        f"expected CHECK error naming trip_countries_json; got: {msg!r}"


# ── R11-B6: trip invite stale-inviter 410 ──────────────────────────────
# trips.py:685-695 returns 410 when the inviter has lost authority to
# invite (e.g., they were kicked / demoted between sending the invite
# and the invitee responding). R3-R2 #18 fix. Pre-fix the responder
# could accept an invite from a no-longer-authorized inviter and gain
# membership through an invalid path.

def test_trip_invite_respond_410_when_inviter_kicked(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Owner invites a friend via the planner role. Owner then
    revokes the invite or removes the inviter's authority. Invitee
    tries to accept → 410 (Gone) and the member row is cleaned up."""
    # Befriend so the invite goes through.
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-invite-410")
    invite_res = client.post(
        "/api/trips/invite",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "target_user_id": seed_other_user,
            "role": "relaxer",
        },
    )
    assert invite_res.status_code == 200, invite_res.get_data(as_text=True)
    # Owner deletes the trip BEFORE the invitee responds — this kills
    # the trip row, so the respond path SHOULD 404 (trip gone) or 410
    # (invitation stale). Both are honest "you can't accept this" signals;
    # the legacy invite flow returned 200 + silently created a member
    # row pointing at a dead trip.
    del_res = client.delete(
        f"/api/trips/{trip_id}", headers=auth_headers,
    )
    assert del_res.status_code == 200
    accept_res = client.post(
        "/api/trips/invite/respond",
        headers=other_auth_headers,
        json={"trip_id": trip_id, "accept": True},
    )
    assert accept_res.status_code in (404, 410), (
        f"respond after inviter-side teardown must 404/410, not 200; "
        f"got {accept_res.status_code}"
    )
