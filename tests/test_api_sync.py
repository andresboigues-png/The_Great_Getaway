"""GG API tests — /api/data + /api/sync write paths, version detection, user-data delete.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""


import sys

from tests.conftest import _create_trip


def test_api_data_omits_heavy_json_fields_phase2(client, seed_user, auth_headers):
    """R12-B4 Phase 2: /api/data must NOT ship the 4 heavy media fields
    (photos / documents / markedPlaces / checklist) — they load via
    GET /api/trips/<id>/media. Pins the contract: the keys are ABSENT
    (not just empty) so the frontend merge's `=== undefined` check can
    reliably detect 'server didn't ship this' and preserve in-memory
    media. Seeds the columns via the dedicated write path, confirms
    /api/data omits them, and confirms /media still returns them.

    This is the Phase-2 perf win, made SAFE by Phase 1's write
    isolation (upsert_trip ignores media) + the frontend's
    _mediaLoadedTrips gate. A previous attempt (reverted d428b3e)
    shipped the strip WITHOUT that isolation and caused a data-loss
    P0; this test + the test_upsert_trip_cannot_touch_media guard
    together lock the safe shape."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-phase2-strip")
    client.post(f"/api/trips/{trip_id}/media", headers=auth_headers, json={
        "photos": [{"id": "p1"}],
        "documents": [{"id": "d1"}],
        "markedPlaces": [{"id": "m1"}],
        "checklist": [{"id": "c1"}],
    })
    data = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in data["trips"] if t["id"] == trip_id)
    assert "photos" not in trip
    assert "documents" not in trip
    assert "markedPlaces" not in trip
    assert "checklist" not in trip
    # Non-heavy fields still ship (the strip is surgical, not a wipe).
    assert "companions" in trip
    assert "coverUrl" in trip
    # The media IS reachable via the dedicated endpoint.
    media = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert media["photos"] == [{"id": "p1"}]
    assert media["checklist"] == [{"id": "c1"}]


def test_sync_cannot_clobber_trip_media(client, seed_user, auth_headers):
    """4.8 audit TRIP-3: /api/sync must NOT write the 4 heavy media
    columns. A legacy/defensive client posting a trip with empty media
    arrays must NOT wipe server media (written via the dedicated path)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-sync-media")
    client.post(f"/api/trips/{trip_id}/media", headers=auth_headers, json={
        "photos": [{"id": "p1"}], "documents": [{"id": "d1"}],
        "markedPlaces": [{"id": "m1"}], "checklist": [{"id": "c1"}],
    })
    # Adversarial sync: the trip payload carries EMPTY media arrays.
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [{
            "id": trip_id, "name": "Synced", "country": "FR",
            "photos": [], "documents": [], "markedPlaces": [], "checklist": [],
        }],
    })
    assert res.status_code == 200
    media = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert media["photos"] == [{"id": "p1"}], "sync must not wipe photos (TRIP-3)"
    assert media["documents"] == [{"id": "d1"}]
    assert media["markedPlaces"] == [{"id": "m1"}]
    assert media["checklist"] == [{"id": "c1"}]


# ── /api/data ────────────────────────────────────────────────────────────────

def test_data_returns_empty_for_new_user(client, seed_user, auth_headers):
    res = client.get("/api/data", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["trips"] == []
    assert body["expenses"] == []


def test_data_returns_populated_payload(client, seed_user, auth_headers):
    """/api/data is the boot-time pull. Pin the response shape — frontend
    pullFromServer reads `trips`, `expenses`, `tripDays`, `categories`,
    `budgets` off this payload + does the trip-row field rename
    (place_id → placeId, etc.) inline."""
    # Seed a trip + day + expense + category + budget so every list comes
    # back non-empty.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-data", "name": "Madrid", "country": "Spain"},
    })
    client.post("/api/days", headers=auth_headers, json={
        "day": {
            "id": "day-data-1", "tripId": "trip-data", "dayNumber": 1,
            "name": "Sol", "date": "2026-05-10",
        },
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-data-1", "tripId": "trip-data", "who": "Me",
            "value": 8.5, "currency": "EUR", "euroValue": 8.5,
            "label": "Coffee", "date": "2026-05-10",
        },
    })
    client.post("/api/categories", headers=auth_headers, json={
        "categories": [{"id": "c-food", "name": "Food", "icon": "🍔", "color": "#ff3b30"}],
    })
    client.post("/api/budgets", headers=auth_headers, json={
        "budget": {"id": "b-1", "tripId": "trip-data", "label": "Food", "amount": 100, "currency": "EUR"},
    })

    res = client.get("/api/data", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert len(body["trips"]) == 1
    assert body["trips"][0]["name"] == "Madrid"
    assert len(body["expenses"]) == 1
    assert len(body["tripDays"]) == 1
    assert len(body["categories"]) == 1
    assert len(body["budgets"]) == 1


def test_data_version_detects_in_place_category_edit(client, seed_user, auth_headers):
    """MK3-10 change-detection regression.

    `categories` has no updated_at/created_at column, and its save path is
    delete-all-then-reinsert. So an in-place edit (rename / recolour / new
    icon) that keeps the row COUNT constant can also leave MAX(rowid)
    constant — meaning _compute_data_version would emit the SAME hash, a
    peer device polling `?knownVersion=OLD` would get {unchanged:true}, and
    it would show the stale category name/colour until some unrelated
    mutation happened to move the version. The fix hashes category CONTENT
    for timestamp-less tables.

    Also pins the basic short-circuit (matching version → unchanged), which
    previously had no coverage at all."""
    client.post("/api/categories", headers=auth_headers, json={
        "categories": [{"id": "c1", "name": "Food", "icon": "🍔", "color": "#ff3b30"}],
    })
    v1 = client.get("/api/data", headers=auth_headers).get_json()["version"]

    # Matching version → unchanged short-circuit.
    same = client.get(
        f"/api/data?knownVersion={v1}", headers=auth_headers
    ).get_json()
    assert same.get("unchanged") is True

    # In-place edit: SAME count (1), new name + icon + colour.
    client.post("/api/categories", headers=auth_headers, json={
        "categories": [{"id": "c1", "name": "Dining", "icon": "🍽️", "color": "#34c759"}],
    })

    # The version MUST move — the edit can't be silently swallowed.
    after = client.get(
        f"/api/data?knownVersion={v1}", headers=auth_headers
    ).get_json()
    assert after.get("unchanged") is not True, (
        "in-place category edit was missed by change-detection (stale-peer bug)"
    )
    assert after["version"] != v1
    cats = {c["id"]: c for c in after["categories"]}
    assert cats["c1"]["name"] == "Dining"
    assert cats["c1"]["color"] == "#34c759"


# ── /api/sync ────────────────────────────────────────────────────────────────
# Bulk "replace everything in one POST" path. Most write traffic goes
# through delta endpoints now (routes/expenses.py, routes/days.py, etc.)
# but /api/sync is preserved for legacy clients + defensive re-syncs.

def test_sync_writes_trips_and_expenses(client, seed_user, auth_headers):
    """Happy path: POST a full STATE payload, then GET /api/data and
    assert the server holds the same trips + expenses."""
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [
            {"id": "trip-sync-1", "name": "Paris", "country": "France"},
        ],
        "expenses": [
            {
                "id": "exp-sync-1", "tripId": "trip-sync-1", "who": "Me",
                "categoryId": "c-food", "country": "France",
                "value": 5, "currency": "EUR", "euroValue": 5,
                "label": "Croissant", "date": "2026-05-12",
            },
        ],
    })
    assert res.status_code == 200

    # Round-trip: pull and confirm.
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert any(t["id"] == "trip-sync-1" for t in body["trips"])
    assert any(e["id"] == "exp-sync-1" for e in body["expenses"])


def test_sync_public_trip_mints_share_token(client, seed_user, auth_headers):
    """Marking a trip public via /api/sync must mint a share_token so the trip
    is viewable AND surfaces in /api/feed/explore (which requires
    share_token IS NOT NULL). Covers BOTH the active-trips and archived-trips
    loops — the completed-trip dashboard's privacy selector syncs through the
    archived path. Pre-fix the privacy toggle set is_public but never minted a
    token, so public trips stayed invisible in Explore."""
    client.post("/api/sync", headers=auth_headers, json={
        "trips": [
            {"id": "pub-active", "name": "Lisbon", "country": "Portugal", "isPublic": True},
        ],
        "archived_trips": [
            {"id": "pub-archived", "name": "Tokyo", "country": "Japan", "isPublic": True},
        ],
    })
    body = client.get("/api/data", headers=auth_headers).get_json()
    by_id = {t["id"]: t for t in body["trips"]}
    # shareToken is owner-gated in /api/data; the owner sees the minted token.
    assert by_id["pub-active"].get("shareToken"), "active public trip should get a token"
    assert by_id["pub-archived"].get("shareToken"), "archived public trip should get a token"


def test_sync_private_trip_gets_no_share_token(client, seed_user, auth_headers):
    """Flip side: a PRIVATE trip synced via /api/sync must NOT be minted a
    token — the mint is gated on isPublic, and a private trip has nothing to
    discover."""
    client.post("/api/sync", headers=auth_headers, json={
        "trips": [{"id": "priv-trip", "name": "Oslo", "country": "Norway", "isPublic": False}],
    })
    body = client.get("/api/data", headers=auth_headers).get_json()
    trip = next(t for t in body["trips"] if t["id"] == "priv-trip")
    assert not trip.get("shareToken"), "private trip must not be minted a token"


def test_sync_trip_days_cannot_inject_into_foreign_trip(
    client, seed_user, auth_headers, seed_other_user, other_auth_headers,
):
    """Audit MK5 P1 (IDOR): the /api/sync trip_days loop must authorize every
    row. A non-member must not be able to inject/overwrite days in another
    user's trip — pre-fix the loop wrote any (id, tripId) verbatim."""
    _create_trip(client, auth_headers, trip_id="victim-trip", name="A's Paris")
    # User B attempts to write a day into A's trip via the bulk sync path.
    res = client.post("/api/sync", headers=other_auth_headers, json={
        "trips": [],
        "trip_days": [
            {"id": "evil-day", "tripId": "victim-trip", "dayNumber": 1, "name": "HACKED"},
        ],
    })
    assert res.status_code == 200  # batch sync silently skips, doesn't 403 the batch
    from database import get_db
    with get_db() as conn:
        n = conn.execute(
            "SELECT COUNT(*) AS n FROM trip_days WHERE id = ?", ("evil-day",),
        ).fetchone()["n"]
        assert n == 0, "cross-tenant day injection via /api/sync"


def test_sync_trip_days_owner_can_write_own_including_same_batch_new_trip(
    client, seed_user, auth_headers,
):
    """The gate must not break the happy path: the owner can write days to
    their own trip via /api/sync, INCLUDING a trip created in the same batch
    (covered by the direct-ownership fallback, since the precomputed editable
    set predates the trips loop)."""
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [{"id": "own-trip", "name": "Mine", "country": "France"}],
        "trip_days": [
            {"id": "own-day", "tripId": "own-trip", "dayNumber": 1, "name": "Day 1"},
        ],
    })
    assert res.status_code == 200
    from database import get_db
    with get_db() as conn:
        row = conn.execute(
            "SELECT trip_id FROM trip_days WHERE id = ?", ("own-day",),
        ).fetchone()
        assert row is not None and row["trip_id"] == "own-trip"


def test_sync_skips_uncomputable_no_rate_currency_expense(client, seed_user, auth_headers):
    """Integration audit MM-2: the bulk /api/sync path mirrors the per-row
    /api/expenses C1 gate. A non-EUR currency with NO live rate AND no positive
    euroValue can't be converted, so the row is DROPPED (silent-skip — the bulk
    path can't 400 the whole batch over one bad row). A VND row WITH an explicit
    positive euroValue still syncs. Pre-fix the no-euroValue row stored
    euro_value=0, which then read inconsistently across surfaces."""
    import fx_rates
    fx_rates._cache = {"EUR": 1.0}  # VND deliberately rate-less
    fx_rates._cache_set_at = __import__('time').time()
    try:
        res = client.post("/api/sync", headers=auth_headers, json={
            "trips": [{"id": "trip-mm2", "name": "Hanoi", "country": "Vietnam"}],
            "expenses": [
                {   # no rate + no euroValue → must be SKIPPED
                    "id": "exp-mm2-skip", "tripId": "trip-mm2", "who": "Me",
                    "value": 270000, "currency": "VND",
                    "label": "Pho", "date": "2026-05-12",
                },
                {   # no rate but explicit positive euroValue → kept verbatim
                    "id": "exp-mm2-keep", "tripId": "trip-mm2", "who": "Me",
                    "value": 270000, "currency": "VND", "euroValue": 9.5,
                    "label": "Pho 2", "date": "2026-05-12",
                },
            ],
        })
        assert res.status_code == 200, res.get_data(as_text=True)
        body = client.get("/api/data", headers=auth_headers).get_json()
        ids = {e["id"] for e in body["expenses"]}
        assert "exp-mm2-skip" not in ids, "no-rate/no-euroValue row should be dropped"
        kept = [e for e in body["expenses"] if e["id"] == "exp-mm2-keep"]
        assert len(kept) == 1, "the row with an explicit euroValue should sync"
        assert kept[0]["euroValue"] == 9.5
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0.0


def test_sync_all_zero_split_falls_back_to_equal_share(client, seed_user, auth_headers):
    """IA-2 (Insights audit MK3): the lenient /api/sync path used to store an
    all-zero split ({A:0,B:0}) verbatim, which the balance reducer then read as
    "credit the payer, debit nobody" → Σ balances = +full amount (the only
    money-integrity break the audit found). The expense is still a real outflow
    so it's KEPT — but its degenerate split is dropped so it falls back to the
    Σ-safe equal-share path. The per-row /api/expenses path already 400s it."""
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [{"id": "trip-ia2", "name": "Lisbon", "country": "Portugal"}],
        "expenses": [
            {
                "id": "exp-ia2-zero", "tripId": "trip-ia2", "who": "Alice",
                "value": 100, "currency": "EUR", "euroValue": 100,
                "label": "Dinner", "date": "2026-01-01",
                "splits": {"Alice": 0, "Bob": 0},
            },
        ],
    })
    assert res.status_code == 200, res.get_data(as_text=True)
    body = client.get("/api/data", headers=auth_headers).get_json()
    kept = [e for e in body["expenses"] if e["id"] == "exp-ia2-zero"]
    assert len(kept) == 1, "a real expense with a degenerate split should be kept"
    # serialize_expense_row ships a dropped/empty split as {} → falsy.
    assert not kept[0].get("splits"), \
        "the all-zero split must be dropped (empty), not stored verbatim"


def test_sync_rejects_trip_in_both_active_and_archived_lists(
    client, seed_user, auth_headers,
):
    """§2.6: pre-fix, a client that sent the same trip in BOTH
    `trips` AND `archived_trips` had its archive flag silently
    flipped to 1 (the archived loop always ran last + hardcoded 1).
    Now we reject the whole sync with 400 BEFORE writing anything,
    so the client can fix its state on the next 15s poll.
    """
    res = client.post(
        "/api/sync",
        headers=auth_headers,
        json={
            "trips": [
                {"id": "trip-dup-26", "name": "Paris", "country": "France"},
            ],
            "archived_trips": [
                {"id": "trip-dup-26", "name": "Paris", "country": "France"},
            ],
        },
    )
    assert res.status_code == 400, \
        f"expected 400 on duplicate trip across lists, got {res.status_code}"
    body = res.get_json()
    assert "trip-dup-26" in body.get("error", ""), \
        f"error message should name the offending trip: {body!r}"

    # Critical: the rejection happens BEFORE any DB write, so the trip
    # row should NOT exist after this failed sync. Pull and confirm.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    assert not any(t["id"] == "trip-dup-26" for t in pull["trips"]), \
        "rejected sync should not have created a trip row"


def test_sync_migrating_trip_from_active_to_archived_still_works(
    client, seed_user, auth_headers,
):
    """§2.6 contract: the rejection is for SAME-SYNC duplicates only.
    A trip cleanly moving from active→archived across TWO separate
    syncs (the normal archive flow) must still work — that's what the
    /api/sync contract is for, and the §2.6 fix shouldn't have broken
    it.
    """
    # Sync 1: trip is active.
    res1 = client.post(
        "/api/sync",
        headers=auth_headers,
        json={"trips": [{"id": "trip-mig-26", "name": "Lisbon", "country": "Portugal"}]},
    )
    assert res1.status_code == 200

    # Sync 2: trip moved to archived list, NOT in active list.
    res2 = client.post(
        "/api/sync",
        headers=auth_headers,
        json={
            "trips": [],
            "archived_trips": [
                {"id": "trip-mig-26", "name": "Lisbon", "country": "Portugal"},
            ],
        },
    )
    assert res2.status_code == 200, \
        f"clean migration sync should succeed, got {res2.status_code}: {res2.get_data(as_text=True)}"


def test_sync_does_not_let_caller_take_over_someone_elses_trip(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """Audit-fix coverage: /api/sync used to let any caller hijack an
    existing trip by re-syncing it (the ON CONFLICT path overwrote
    user_id with whatever the caller passed in). The fix skips trips
    the caller doesn't own; this test pins that the OWNER's row
    survives a hostile sync intact."""
    # Owner creates a trip
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-mine", "name": "Original Name"},
    })
    # Different user fires /api/sync trying to overwrite it
    res = client.post("/api/sync", headers=other_auth_headers, json={
        "trips": [{"id": "trip-mine", "name": "HIJACKED"}],
        "expenses": [],
    })
    # The endpoint returns 200 (partial-sync semantics — friend's
    # legitimate own-rows still get saved) but the original trip
    # is untouched.
    assert res.status_code == 200
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    found = next(t for t in body["trips"] if t["id"] == "trip-mine")
    assert found["name"] == "Original Name"  # NOT "HIJACKED"


def test_sync_archived_expense_loop_blocks_cross_trip_hijack(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R2 audit fix: the archived-trips inner expense loop in /api/sync
    had the same IDOR shape as the single-row /api/expenses POST. The
    active-expense loop in /api/sync was fixed earlier; the archived
    branch was missed until now."""
    # Victim creates trip + expense
    client.post("/api/trips", headers=other_auth_headers, json={
        "trip": {"id": "trip-archived-victim", "name": "Victim"},
    })
    client.post("/api/expenses", headers=other_auth_headers, json={
        "expense": {
            "id": "exp-archived-victim", "tripId": "trip-archived-victim", "who": "Owner",
            "value": 250, "currency": "EUR", "euroValue": 250,
            "label": "Hotel", "date": "2026-05-12",
        },
    })
    # Attacker fires /api/sync with archived_trips smuggling victim's expense id
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "archived_trips": [{
            "id": "trip-attacker-smuggle", "name": "Smuggle", "country": "X",
            "expenses": [{
                "id": "exp-archived-victim", "who": "PWNED",
                "categoryId": "c1", "label": "hijacked",
                "date": "2030-01-01", "country": "X",
                "value": 0, "currency": "EUR", "euroValue": 0,
            }],
        }],
    })
    # Sync returns 200 (partial-write semantics), but the victim's
    # row must be UNTOUCHED
    pull = client.get("/api/data", headers=other_auth_headers)
    found = next(e for e in pull.get_json()["expenses"] if e["id"] == "exp-archived-victim")
    assert found["label"] == "Hotel", \
        f"archived-loop IDOR hijack must not rewrite victim row, got: {found}"
    assert found["value"] == 250


# ── /api/user-data DELETE (factory reset) ────────────────────────────────────

def test_user_data_delete_wipes_trips_and_expenses(client, seed_user, auth_headers):
    """Settings → Reset → Wipe triggers a DELETE /api/user-data which
    nukes every trip + expense the caller owns AND the user row itself
    (the route at routes/data.py:496 ends with DELETE FROM users).

    Post §0.3, the JWT carries a `jti` claim that must match the user's
    `token_jti` column — when the user row is wiped, the lookup fails
    and any subsequent request with that token returns 401. That's the
    correct security behaviour after a factory reset: the prior token
    must NOT continue to work, even when the row it pointed at is gone.
    Pre-§0.3 the token kept working against a nonexistent user_id and
    `/api/data` returned empty arrays — a confusing state."""
    # Seed a trip + expense to wipe
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-doomed", "name": "Going Away"},
    })
    client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-doomed", "tripId": "trip-doomed", "who": "Me",
            "value": 1, "currency": "EUR", "euroValue": 1,
            "label": "Sad", "date": "2026-05-12",
        },
    })

    res = client.delete("/api/user-data", headers=auth_headers)
    assert res.status_code == 200

    # Token is now invalid (its `jti` claim references a `token_jti`
    # that was deleted along with the user row). Any authenticated
    # endpoint returns 401.
    pull = client.get("/api/data", headers=auth_headers)
    assert pull.status_code == 401


def test_sync_bumps_updated_at_so_subsequent_post_sees_advancement(
    client, seed_user, auth_headers,
):
    """R4-B1 regression test: /api/sync UPDATEs must stamp updated_at
    on the rows they rewrite. Pre-fix the sync path silently rewrote
    expense / trip / budget / day fields without bumping the stamp —
    the next single-row POST then saw stored == client (both stale),
    passed the R3-R4/R3-R5 gate, and blind-overwrote whatever the
    sync had just delivered. This test pins the fix by asserting
    that an /api/sync UPDATE moves the stored updated_at forward."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-sync-stamp")
    # First, POST an expense to seed it with a known updatedAt.
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-sync-stamp", "tripId": trip_id, "who": "Me",
            "value": 10, "currency": "EUR", "euroValue": 10,
            "label": "first", "date": "2026-05-12",
        },
    })
    assert res.status_code == 200
    first_updated_at = res.get_json()["updatedAt"]

    # Now bulk-sync the SAME row through /api/sync with a different label.
    # The sync UPDATE should bump updated_at — pre-R4-B1 it would NOT.
    sync_payload = {
        "trips": [], "archived_trips": [], "categories": [],
        "trip_days": [], "budgets": [],
        "expenses": [{
            "id": "exp-sync-stamp", "tripId": trip_id, "who": "Me",
            "value": 22, "currency": "EUR", "euroValue": 22,
            "label": "via-sync", "date": "2026-05-12",
        }],
    }
    sync_res = client.post("/api/sync", headers=auth_headers, json=sync_payload)
    assert sync_res.status_code in (200, 204)

    # Pull and check the stored updated_at advanced past first_updated_at.
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(e for e in pull["expenses"] if e["id"] == "exp-sync-stamp")
    assert found["label"] == "via-sync", "sync UPDATE should have landed"
    assert found.get("updatedAt"), "expense should expose updatedAt"
    assert found["updatedAt"] > first_updated_at, (
        "sync UPDATE must bump updated_at, otherwise the R3-R4 stale-edit "
        "gate can be silently bypassed by a sync poll racing a POST"
    )


def test_sync_optional_client_updated_at_gates_stale_writes(
    client, seed_user, auth_headers,
):
    """R10-B6d T3 regression: the bulk /api/sync active-expenses loop
    now honors an OPTIONAL per-row `clientUpdatedAt`. When supplied,
    a stale value skips the UPDATE (matching the atomic gate the
    per-row /api/expenses endpoint has had since R8-B4). When omitted,
    the row writes through as before (preserves the legacy contract).
    """
    trip_id = _create_trip(client, auth_headers, trip_id="trip-sync-gate")
    # Seed an expense via the per-row endpoint to capture a known
    # updatedAt stamp.
    res = client.post("/api/expenses", headers=auth_headers, json={
        "expense": {
            "id": "exp-sync-gate", "tripId": trip_id, "who": "Me",
            "value": 10, "currency": "EUR", "euroValue": 10,
            "label": "original", "date": "2026-05-12",
        },
    })
    assert res.status_code == 200
    live_updated_at = res.get_json()["updatedAt"]

    # 1) Bulk-sync the SAME row with a STALE clientUpdatedAt. The opt-in
    # gate should make the UPDATE a no-op. The row's label/value stay
    # at "original"/10.
    stale_payload = {
        "expenses": [{
            "id": "exp-sync-gate", "tripId": trip_id, "who": "Me",
            "value": 99, "currency": "EUR", "euroValue": 99,
            "label": "stale-write", "date": "2026-05-12",
            "clientUpdatedAt": "1970-01-01 00:00:00.000",
        }],
    }
    stale_res = client.post("/api/sync", headers=auth_headers, json=stale_payload)
    assert stale_res.status_code in (200, 204)
    pull = client.get("/api/data", headers=auth_headers).get_json()
    found = next(e for e in pull["expenses"] if e["id"] == "exp-sync-gate")
    assert found["label"] == "original", (
        "stale clientUpdatedAt must gate out the UPDATE — pre-R10-B6d "
        "the bulk path silently overwrote the live row"
    )
    assert found["value"] == 10

    # 2) Bulk-sync WITH the live updated_at — should land.
    fresh_payload = {
        "expenses": [{
            "id": "exp-sync-gate", "tripId": trip_id, "who": "Me",
            "value": 22, "currency": "EUR", "euroValue": 22,
            "label": "fresh-write", "date": "2026-05-12",
            "clientUpdatedAt": live_updated_at,
        }],
    }
    fresh_res = client.post("/api/sync", headers=auth_headers, json=fresh_payload)
    assert fresh_res.status_code in (200, 204)
    pull2 = client.get("/api/data", headers=auth_headers).get_json()
    found2 = next(e for e in pull2["expenses"] if e["id"] == "exp-sync-gate")
    assert found2["label"] == "fresh-write", (
        "matching clientUpdatedAt should still allow the UPDATE through"
    )
    assert found2["value"] == 22


def test_user_data_delete_wipes_auth_sessions_and_feed(
    client, seed_user, auth_headers,
):
    """R3-Fix #4: pre-fix, /api/user-data left auth_sessions /
    feed_posts / feed_likes / feed_comments / feed_bookmarks / blocks
    intact. Now they're all wiped alongside the rest."""
    # Seed: a feed_like, a feed_comment, an auth_sessions row (auto-
    # created on issue_token), and a block.
    from database import get_db
    with get_db() as conn:
        conn.execute(
            "INSERT INTO feed_likes (user_id, event_id) VALUES (?, ?)",
            (seed_user, "trip_created_x"),
        )
        conn.execute(
            "INSERT INTO feed_comments (event_id, user_id, body) VALUES (?, ?, ?)",
            ("trip_created_x", seed_user, "hi"),
        )
        # Need a second user for the block target.
        conn.execute(
            "INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)",
            ("u-target", "target@example.com", "Target"),
        )
        conn.execute(
            "INSERT INTO blocks (blocker_id, blocked_id) VALUES (?, ?)",
            (seed_user, "u-target"),
        )
        conn.commit()
        # Verify the seeded rows are there before delete.
        assert conn.execute(
            "SELECT 1 FROM feed_likes WHERE user_id = ?", (seed_user,),
        ).fetchone()
        assert conn.execute(
            "SELECT 1 FROM auth_sessions WHERE user_id = ?", (seed_user,),
        ).fetchone()

    res = client.delete("/api/user-data", headers=auth_headers)
    assert res.status_code == 200

    # All wiped.
    with get_db() as conn:
        assert not conn.execute(
            "SELECT 1 FROM feed_likes WHERE user_id = ?", (seed_user,),
        ).fetchone()
        assert not conn.execute(
            "SELECT 1 FROM feed_comments WHERE user_id = ?", (seed_user,),
        ).fetchone()
        assert not conn.execute(
            "SELECT 1 FROM auth_sessions WHERE user_id = ?", (seed_user,),
        ).fetchone()
        assert not conn.execute(
            "SELECT 1 FROM blocks WHERE blocker_id = ? OR blocked_id = ?",
            (seed_user, seed_user),
        ).fetchone()


def test_delete_user_data_wipes_cross_user_followed_you_notifications(
    client, seed_user, seed_other_user, auth_headers, other_auth_headers,
):
    """R5-B5: when user A deletes their account, B's bell mustn't
    keep a `followed_you` notification whose related_id is now-
    deleted A (the click handler would 404 silently on /profile/A).
    """
    from database import get_db
    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO notifications "
            "(user_id, type, title, message, related_id, is_read) "
            "VALUES (?, 'followed_you', 'New follower', "
            "'A started following you.', ?, 0)",
            (seed_other_user, seed_user),
        )
        conn.commit()

    res = client.delete("/api/user-data", headers=auth_headers)
    assert res.status_code in (200, 204)

    # B's bell shouldn't have the now-dangling notification.
    listed = client.get(
        "/api/notifications/list", headers=other_auth_headers,
    ).get_json()
    dangling = [
        n for n in listed["notifications"]
        if n["type"] == "followed_you" and n["related_id"] == seed_user
    ]
    assert not dangling, (
        "follower-keyed notification pointing at a now-deleted "
        "user must be swept on account delete"
    )


# ── /api/sync — archived_trips + budgets + trip_days + legacy share ──────────
#
# The basic happy path is covered above (test_sync_writes_trips_and_expenses).
# These cover the lower-traffic branches: archived-trip upsert (with
# nested expenses), the budgets replace-mode sync, and the trip_days
# insert block. Each pinning a specific uncovered chunk in
# src/routes/data.py. (The legacy /api/trips/share route was removed
# 2026-05-13; only a "route is gone" pin remains.)

def test_sync_writes_archived_trip_with_expenses(client, seed_user, auth_headers):
    """archived_trips block — separate from the active trips block —
    upserts trips with is_archived=1 and gates per-row on can_edit_trip
    for nested expenses. Pin both the archived-trip insert and the
    nested-expense insert in one round-trip."""
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "archived_trips": [
            {
                "id": "trip-archived-1",
                "name": "Last Year Italy",
                "country": "Italy",
                "expenses": [
                    {
                        "id": "exp-arch-1",
                        "tripId": "trip-archived-1",
                        "who": "Me",
                        "categoryId": "c-food",
                        "country": "Italy",
                        "value": 12,
                        "currency": "EUR",
                        "euroValue": 12,
                        "label": "Gelato",
                        "date": "2025-08-15",
                    },
                ],
            },
        ],
    })
    assert res.status_code == 200

    # Round-trip via /api/data: the archived trip + its expense
    # should both be present. The trip's `isArchived` flag actually
    # surfaces from the per-user trip_members row (per Phase G);
    # ensure_owner_member_row inserts that row with archived=0,
    # so the response shows myArchived=False even though the trip
    # row's is_archived=1. That's a known quirk of the legacy bulk-
    # sync path — the new flow uses /api/trips/<id>/archive which
    # toggles the member-row flag directly. Here we only pin that
    # the trip + its nested expense both round-trip.
    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    archived = next(
        (t for t in body["trips"] if t["id"] == "trip-archived-1"), None,
    )
    assert archived is not None
    assert archived["country"] == "Italy"
    assert any(e["id"] == "exp-arch-1" for e in body["expenses"])


def _seed_budget_via_post(client, headers, bid, **fields):
    """MK4: budgets are now created ONLY via the per-row POST /api/budgets
    (the /api/sync write loop was removed — see BUD-1/2/3). Helper so the
    sync tests below can still set up pre-existing budgets to assert sync's
    new "don't touch budgets" contract against."""
    body = {"id": bid, "label": "x", "amount": 100, "currency": "EUR"}
    body.update(fields)
    return client.post("/api/budgets", headers=headers, json={"budget": body})


def test_sync_writes_categories_and_trip_days(client, seed_user, auth_headers):
    """Cover the surviving sync branches in one payload: categories DELETE
    THEN INSERT, and trip_days insert. Pin the round-trip so a
    field-rename regression surfaces immediately.

    MK4 audit BUD-1/2/3: the `/api/sync` budget write loop was REMOVED (it
    was an un-hardened parallel write path; the per-row POST /api/budgets
    is the sole sanctioned path). A `budgets` key in the payload is now
    accepted-but-ignored — it must not 500 the batch and must not persist.
    This test pins both: categories/trip_days still round-trip, while a
    budget shipped via /api/sync does NOT appear."""
    # Need a trip first for trip_days FK.
    client.post("/api/trips", headers=auth_headers, json={
        "trip": {"id": "trip-multi-sync", "name": "Multi", "country": "France"},
    })

    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "categories": [
            {"id": "c-food-sync", "name": "Food", "icon": "🍔", "color": "#ff0000"},
        ],
        # Accepted-but-ignored now (BUD-1/2/3). Included to prove it
        # doesn't 500 the batch and doesn't persist.
        "budgets": [
            {
                "id": "b-sync-1",
                "tripId": "trip-multi-sync",
                "label": "Hotels",
                "amount": 500,
                "currency": "EUR",
            },
        ],
        "trip_days": [
            {
                "id": "td-sync-1",
                "tripId": "trip-multi-sync",
                "dayNumber": 1,
                "date": "2026-06-01",
                "name": "Arrival",
                "morning": "Land at CDG",
                "afternoon": "Hotel check-in",
                "evening": "Dinner",
                "tip": "Avoid taxi scams at CDG arrivals",
                "lat": 48.85,
                "lng": 2.35,
            },
        ],
    })
    assert res.status_code == 200

    pull = client.get("/api/data", headers=auth_headers)
    body = pull.get_json()
    assert any(c["id"] == "c-food-sync" for c in body["categories"])
    # Budget shipped via /api/sync must NOT persist (the loop is gone).
    assert not any(b["id"] == "b-sync-1" for b in body["budgets"]), \
        "/api/sync must no longer write budgets"
    # /api/data returns trip days under `tripDays` (camelCase).
    assert any(d["id"] == "td-sync-1" for d in body["tripDays"])


def test_sync_does_not_delete_omitted_budget_ids(client, seed_user, auth_headers):
    """MK4 audit BUD-1: the old budgets replace-mode (`DELETE WHERE
    user_id = ? AND id NOT IN (...)`) is GONE. Omitting a budget from an
    /api/sync payload must NOT delete it — that replace-delete was itself a
    latent data-loss vector when a stale/offline outbox replayed a partial
    set. Deletions go through DELETE /api/budgets/<id> only."""
    # Seed two budgets via the sanctioned per-row path (distinct scopes so
    # the per-scope UNIQUE doesn't reject the second).
    assert _seed_budget_via_post(client, auth_headers, "b-keep", label="Keep me").status_code == 200
    assert _seed_budget_via_post(client, auth_headers, "b-drop", label="Drop me",
                                 categoryId="c-x").status_code == 200

    # An /api/sync that lists only b-keep must NOT drop b-drop.
    client.post("/api/sync", headers=auth_headers, json={
        "trips": [],
        "expenses": [],
        "budgets": [
            {"id": "b-keep", "label": "Keep me", "amount": 100, "currency": "EUR"},
        ],
    })

    pull = client.get("/api/data", headers=auth_headers)
    budget_ids = [b["id"] for b in pull.get_json()["budgets"]]
    assert "b-keep" in budget_ids
    assert "b-drop" in budget_ids, "/api/sync must not delete an omitted budget"


def test_sync_empty_list_does_not_clear_budgets(client, seed_user, auth_headers):
    """MK4 audit BUD-1: an explicit `budgets: []` no longer triggers a
    `DELETE WHERE user_id = ?`. The whole budgets write/delete path was
    removed from /api/sync, so even the "explicit clear" gesture is a
    no-op now — clears go through DELETE /api/budgets/<id>. Pre-existing
    budgets survive."""
    assert _seed_budget_via_post(client, auth_headers, "b-wipe-1").status_code == 200
    assert _seed_budget_via_post(client, auth_headers, "b-wipe-2",
                                 categoryId="c-y").status_code == 200

    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [], "expenses": [],
        "budgets": [],
    })
    assert res.status_code == 200

    pull = client.get("/api/data", headers=auth_headers)
    ids = {b["id"] for b in pull.get_json()["budgets"]}
    assert {"b-wipe-1", "b-wipe-2"} <= ids, \
        "/api/sync budgets:[] must no longer wipe budgets"


def test_sync_absent_budgets_preserves(client, seed_user, auth_headers):
    """A sync payload that OMITS the `budgets` key entirely must NOT wipe
    the user's budgets. (Originally an audit fix for the absent-key wipe;
    still holds — and is now the default for every payload since the budget
    write/delete loop was removed in MK4 BUD-1/2/3.)"""
    assert _seed_budget_via_post(client, auth_headers, "b-preserve-1").status_code == 200
    assert _seed_budget_via_post(client, auth_headers, "b-preserve-2",
                                 categoryId="c-z").status_code == 200

    # Sync without a `budgets` key at all — budgets must SURVIVE.
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [], "expenses": [],
    })
    assert res.status_code == 200

    pull = client.get("/api/data", headers=auth_headers)
    budget_ids = {b["id"] for b in pull.get_json()["budgets"]}
    assert "b-preserve-1" in budget_ids
    assert "b-preserve-2" in budget_ids


def test_user_data_delete_rate_limited(temp_db, seed_user, seed_other_user):
    """2026-05-18 audit fix (critical bug #2): /api/user-data DELETE is
    a factory reset — it wipes EVERY trip, expense, settlement,
    notification, etc. owned by the caller (including the `users`
    row itself). Without a rate limit, a logged-in attacker (or
    stolen session token) could script the endpoint in a loop and
    keep wiping the victim's data immediately after they restore
    from backup. Cap is 1/hour.

    flask-limiter defaults to keying on the remote address, so the
    cap protects the FLOW per-source-IP, not per-user-id. Test two
    distinct users from the same test-client (both 127.0.0.1) — the
    second one must 429 even though it's a different user_id, because
    the per-IP bucket is already spent. Using two users instead of
    one re-poll avoids the "JWT valid but user row missing" 401 that
    would otherwise mask the limiter response (first call deletes
    the user row, so the user can't auth a second time)."""
    if "main" in sys.modules:
        from database import init_db
        init_db()
        from main import app, limiter
    else:
        import main
        from database import init_db
        init_db()
        app = main.app
        limiter = main.limiter

    from auth import issue_token
    headers_a = {"Authorization": f"Bearer {issue_token(seed_user)}"}
    headers_b = {"Authorization": f"Bearer {issue_token(seed_other_user)}"}

    app.config["TESTING"] = True
    app.config["RATELIMIT_ENABLED"] = True
    # 2026-05-26: the conftest `client` fixture flips `limiter.enabled`
    # to False for normal tests; explicitly restore it here so the
    # rate-limit assertion below actually fires.
    _prev_enabled = limiter.enabled
    limiter.enabled = True
    limiter.reset()
    try:
        with app.test_client() as c:
            res = c.delete("/api/user-data", headers=headers_a)
            assert res.status_code == 200
            # Second call from the same IP — flask-limiter rejects
            # before the request reaches the handler.
            res = c.delete("/api/user-data", headers=headers_b)
            assert res.status_code == 429, \
                "second factory-reset within the hour must be rejected by the limiter"
    finally:
        app.config["RATELIMIT_ENABLED"] = False
        limiter.enabled = _prev_enabled
        limiter.reset()


# ── MK6 Wave 6: /api/sync integrity + version-hash coverage ──────────────────


def test_data_version_reflects_member_and_like_changes(client, seed_user, auth_headers):
    """MK6 P2: _compute_data_version must move when trip_members or a trip's
    feed-likes change — else the knownVersion short-circuit serves a stale
    {unchanged} and the owner never sees a new member / accepted invite / like."""
    from database import get_db
    from routes.data import _compute_data_version
    _create_trip(client, auth_headers, trip_id="tv")
    with get_db() as conn:
        cur = conn.cursor()
        # Referenced users must exist (FK constraints on trip_members/feed_likes).
        cur.execute("INSERT INTO users (id, email, name) VALUES ('member-xyz', 'm@x.co', 'M')")
        cur.execute("INSERT INTO users (id, email, name) VALUES ('liker', 'l@x.co', 'L')")
        v0 = _compute_data_version(cur, seed_user, ["tv"])
        cur.execute(
            "INSERT INTO trip_members (trip_id, user_id, role, invitation_status) "
            "VALUES ('tv', 'member-xyz', 'planner', 'pending')",
        )
        v1 = _compute_data_version(cur, seed_user, ["tv"])
        assert v1 != v0, "adding a trip member must move the data version"
        cur.execute(
            "UPDATE trip_members SET invitation_status='accepted' "
            "WHERE trip_id='tv' AND user_id='member-xyz'",
        )
        v2 = _compute_data_version(cur, seed_user, ["tv"])
        assert v2 != v1, "accepting an invite must move the data version"
        cur.execute(
            "INSERT INTO feed_posts (id, user_id, trip_id) VALUES (99001, ?, 'tv')",
            (seed_user,),
        )
        cur.execute("INSERT INTO feed_likes (user_id, event_id) VALUES ('liker', 'share_99001')")
        v3 = _compute_data_version(cur, seed_user, ["tv"])
        assert v3 != v2, "a like on the trip's share must move the data version"


def test_sync_without_coverUrl_preserves_stored_cover(client, seed_user, auth_headers):
    """MK6 P3: a partial /api/sync payload that omits coverUrl must NOT NULL the
    stored cover (COALESCE), matching the archived loop + per-row TRIP-6 path."""
    from database import get_db
    _create_trip(client, auth_headers, trip_id="tc")
    with get_db() as conn:
        conn.execute("UPDATE trips SET cover_url = ? WHERE id = 'tc'",
                     (f"/static/uploads/{seed_user}/cover.jpg",))
        conn.commit()
    # Sync the trip with NO coverUrl key (legacy/partial client).
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [{"id": "tc", "name": "Cover Trip", "country": "PT"}],
    })
    assert res.status_code == 200
    trip = next(t for t in client.get("/api/data", headers=auth_headers)
                .get_json()["trips"] if t["id"] == "tc")
    assert trip.get("coverUrl") == f"/static/uploads/{seed_user}/cover.jpg", \
        "partial sync NULL-wiped the cover"


def test_sync_rejects_external_coverUrl(client, seed_user, auth_headers):
    """MK6 P3/security: a coverUrl pointing at an external host is rejected
    (would be a tracking pixel served to members + public viewers). With the
    COALESCE, a rejected URL preserves the stored cover rather than storing it."""
    from database import get_db
    _create_trip(client, auth_headers, trip_id="tc2")
    with get_db() as conn:
        conn.execute("UPDATE trips SET cover_url = ? WHERE id = 'tc2'",
                     (f"/static/uploads/{seed_user}/ok.jpg",))
        conn.commit()
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [{"id": "tc2", "name": "Cover Trip 2", "country": "PT",
                   "coverUrl": "https://attacker.example/pixel.png"}],
    })
    assert res.status_code == 200
    trip = next(t for t in client.get("/api/data", headers=auth_headers)
                .get_json()["trips"] if t["id"] == "tc2")
    assert "attacker.example" not in (trip.get("coverUrl") or ""), \
        "external coverUrl was stored (tracking-pixel / SSRF-ish leak)"
    assert trip.get("coverUrl") == f"/static/uploads/{seed_user}/ok.jpg", \
        "rejected coverUrl should preserve the stored cover"


def test_sync_archived_expense_preserves_frozen_euro_value(client, seed_user, auth_headers):
    """MK6 P3 (MM-1/MM-5): re-syncing an ARCHIVED trip's foreign-currency
    expense with UNCHANGED money must preserve the frozen euro_value, not
    re-stamp it at today's FX — mirroring the active-expense loop + the nominal
    money invariant. Before the fix the archived loop always recomputed."""
    import fx_rates
    import time as _time
    from database import get_db
    # Live USD rate so a recompute would yield 90 (100 x 0.9), != the frozen 50.
    fx_rates._cache = {"EUR": 1.0, "USD": 0.9}
    fx_rates._cache_set_at = _time.time()
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO trips (id, user_id, name, country, is_archived) "
                "VALUES ('ta', ?, 'Tokyo', 'Japan', 1)", (seed_user,))
            conn.execute(
                "INSERT INTO trip_members (trip_id, user_id, role, invitation_status, is_archived) "
                "VALUES ('ta', ?, 'owner', 'accepted', 1)", (seed_user,))
            conn.execute(
                "INSERT INTO expenses (id, trip_id, who, value, currency, euro_value, date) "
                "VALUES ('ea', 'ta', 'Me', 100, 'USD', 50, '2024-01-01')")
            conn.commit()
        res = client.post("/api/sync", headers=auth_headers, json={
            "archived_trips": [{
                "id": "ta", "name": "Tokyo", "country": "Japan",
                "expenses": [{"id": "ea", "who": "Me", "value": 100,
                              "currency": "USD", "euroValue": 90, "date": "2024-01-01"}],
            }],
        })
        assert res.status_code == 200, res.get_data(as_text=True)
        with get_db() as conn:
            row = conn.execute("SELECT euro_value FROM expenses WHERE id='ea'").fetchone()
        assert abs(row["euro_value"] - 50) < 1e-6, \
            f"frozen euro_value drifted to {row['euro_value']} on archived re-sync (should stay 50)"
    finally:
        fx_rates._cache = {}
        fx_rates._cache_set_at = 0


def test_sync_skips_malformed_trip_rows_without_500(client, seed_user, auth_headers):
    """MK6 P3: a malformed trip row (non-dict, or missing name) in /api/sync
    must be silently SKIPPED, not KeyError/TypeError → 500 (which, because the
    handler commits per-section, would leave a half-applied sync). BUG-096
    parity with the expense/day loops."""
    res = client.post("/api/sync", headers=auth_headers, json={
        "trips": [
            {"id": "good", "name": "Good", "country": "PT"},
            {"id": "noname"},          # missing name → must be skipped
            "not-a-dict",              # non-dict → must be skipped
            {"id": "nocountry", "name": "NoCountry"},  # missing country is fine
        ],
    })
    assert res.status_code == 200, res.get_data(as_text=True)
    ids = {t["id"] for t in client.get("/api/data", headers=auth_headers).get_json()["trips"]}
    assert "good" in ids and "nocountry" in ids
    assert "noname" not in ids, "malformed (no-name) trip must be skipped, not created"


def test_factory_reset_deletes_other_members_trip_budgets(
    client, seed_user, seed_other_user, auth_headers,
):
    """MK6 P3: factory-reset must DELETE other members' budgets scoped to the
    owner's trips, not let the trips-delete null their trip_id (FK SET NULL) —
    which silently converts a per-trip budget into a global 'all trips' one."""
    from database import get_db
    _create_trip(client, auth_headers, trip_id="t-fr")  # owned by A (seed_user)
    with get_db() as conn:
        conn.execute("INSERT INTO trip_members (trip_id, user_id, role, invitation_status) "
                     "VALUES ('t-fr', ?, 'planner', 'accepted')", (seed_other_user,))
        conn.execute("INSERT INTO budgets (id, user_id, trip_id, label, amount, currency) "
                     "VALUES ('b-fr', ?, 't-fr', 'Food', 500, 'EUR')", (seed_other_user,))
        conn.commit()
    assert client.delete("/api/user-data", headers=auth_headers).status_code == 200
    with get_db() as conn:
        row = conn.execute("SELECT trip_id FROM budgets WHERE id='b-fr'").fetchone()
    assert row is None, \
        "B's trip-scoped budget survived A's factory reset (trip_id nulled → global budget)"
