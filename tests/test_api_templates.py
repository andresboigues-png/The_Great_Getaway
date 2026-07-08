"""Trip Templates — creator gate, snapshot pre-strip, instantiation,
public preview, dev-only creator grant.

Shared fixtures (client, auth_headers, seed_user, other_auth_headers,
seed_other_user) come from tests/conftest.py.
"""

import json

from tests.conftest import _create_trip


# ── helpers ──────────────────────────────────────────────────────────
def _make_creator(user_id):
    from database import get_db

    with get_db() as conn:
        conn.execute("UPDATE users SET is_creator = 1 WHERE id = ?", (user_id,))
        conn.commit()


def _seed_dev_user():
    """A user whose email is the hardcoded dev/admin address — always a
    creator + the only account that may grant creator status."""
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, name) VALUES (?, ?, ?)",
            ("dev-user", "andres.boigues@gmail.com", "Dev"),
        )
        conn.commit()
    from auth import issue_token

    return "dev-user", {"Authorization": f"Bearer {issue_token('dev-user')}"}


def _seed_rich_source_trip(client, headers, owner_id, trip_id="src-trip"):
    """A trip carrying BOTH shareable content (days, marked places,
    checklist) AND sensitive data (expenses, companions, photos,
    documents) — so we can assert the snapshot copies the former and
    strips the latter. Distinct sentinel strings make the strip
    assertions unambiguous."""
    _create_trip(client, headers, trip_id=trip_id, name="Paris")
    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        c.execute(
            "UPDATE trips SET country_code = 'FR', "
            "marked_places_json = ?, checklist_json = ?, "
            "photos_json = ?, documents_json = ?, companions_json = ? "
            "WHERE id = ?",
            (
                json.dumps([{"id": "p1", "name": "Louvre", "icon": "🏛️", "forManual": True}]),
                json.dumps([{"id": "c1", "body": "Pack passport", "done": True}]),
                json.dumps([{"id": "ph1", "src": "/static/uploads/SECRETPHOTO.jpg"}]),
                json.dumps([{"id": "d1", "name": "SECRETDOC", "url": "x"}]),
                json.dumps([{"name": "SECRETCOMPANION"}]),
                trip_id,
            ),
        )
        c.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, date, name, "
            "morning, afternoon, evening, tip) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "d-day1",
                trip_id,
                1,
                "2025-06-01",
                "Day 1",
                "Visit Louvre",
                "Lunch at cafe",
                "Eiffel Tower",
                "Bring water",
            ),
        )
        c.execute(
            "INSERT INTO expenses (id, trip_id, who, label, value, currency, euro_value) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            ("e1", trip_id, "SECRETCOMPANION", "SECRETEXPENSE", 100.0, "EUR", 100.0),
        )
        conn.commit()
    return trip_id


def _read_snapshot(code):
    from database import get_db

    with get_db() as conn:
        row = conn.execute(
            "SELECT snapshot_json FROM trip_templates WHERE code = ?", (code,)
        ).fetchone()
    return json.loads(row["snapshot_json"]) if row else None


# ── creator gate ─────────────────────────────────────────────────────
def test_create_template_requires_creator(client, seed_user, auth_headers):
    """A non-creator (the default seed user) is 403'd on create + list."""
    _create_trip(client, auth_headers, trip_id="t1", name="Trip")
    res = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "T",
            "sourceTripId": "t1",
        },
    )
    assert res.status_code == 403
    assert client.get("/api/templates", headers=auth_headers).status_code == 403


# ── snapshot pre-strip + toggles ─────────────────────────────────────
def test_snapshot_copies_shareable_strips_sensitive(client, seed_user, auth_headers):
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src1")
    res = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Paris Template",
            "sourceTripId": "src1",
            "includePlans": True,
            "includePlaces": True,
            "includeChecklist": True,
        },
    )
    assert res.status_code == 200
    code = res.get_json()["template"]["code"]

    snap = _read_snapshot(code)
    # Shareable content copied.
    assert len(snap["days"]) == 1
    assert snap["days"][0]["plan"]["morning"] == "Visit Louvre"
    assert len(snap["markedPlaces"]) == 1
    assert snap["markedPlaces"][0]["name"] == "Louvre"
    assert len(snap["checklist"]) == 1
    # Checklist completion reset for the new owner.
    assert snap["checklist"][0]["done"] is False

    # Sensitive data NEVER present — neither as keys nor as values.
    blob = json.dumps(snap)
    for sentinel in ("SECRETEXPENSE", "SECRETCOMPANION", "SECRETPHOTO", "SECRETDOC"):
        assert sentinel not in blob, f"snapshot leaked {sentinel}"
    for key in ("expenses", "settlements", "budgets", "companions", "photos", "documents"):
        assert key not in snap


def test_snapshot_excludes_accommodation(client, seed_user, auth_headers):
    """Wave 2: a day's accommodation (hotel name / placeId / address) is
    time-sensitive and personal — it must NEVER ride into a template
    snapshot. The day's lat/lng (its location) IS carried, like any pin,
    because a template shares the route, not where the creator slept."""
    _make_creator(seed_user)
    _create_trip(client, auth_headers, trip_id="acc-src", name="Lyon")
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, name, lat, lng, "
            "accommodation, accommodation_place_id, accommodation_address) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "acc-d1",
                "acc-src",
                1,
                "Day 1",
                45.76,
                4.83,
                "HOTELSENTINEL",
                "PLACEIDSENTINEL",
                "ADDRSENTINEL",
            ),
        )
        conn.commit()
    res = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Lyon Template",
            "sourceTripId": "acc-src",
            "includePlans": True,
        },
    )
    assert res.status_code == 200
    snap = _read_snapshot(res.get_json()["template"]["code"])
    blob = json.dumps(snap)
    for sentinel in ("HOTELSENTINEL", "PLACEIDSENTINEL", "ADDRSENTINEL"):
        assert sentinel not in blob, f"snapshot leaked accommodation: {sentinel}"
    # The day's location IS carried (templates share the route).
    assert snap["days"][0]["lat"] == 45.76


# ── public Discover feed ──────────────────────────────────────────────
def test_public_templates_requires_auth(client):
    """Anonymous callers can't browse the Discover feed."""
    assert client.get("/api/templates/public").status_code == 401


def test_public_templates_browsable_by_any_user(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """The Discover feed is open to ANY signed-in user (not just creators).
    Each entry carries its creator's identity + destination for the page's
    grouping — but never the snapshot internals."""
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="pub-src")
    res = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Paris Getaway",
            "sourceTripId": "pub-src",
            "includePlans": True,
        },
    )
    assert res.status_code == 200
    # A NON-creator browses the feed (creator gate must NOT apply here).
    res2 = client.get("/api/templates/public", headers=other_auth_headers)
    assert res2.status_code == 200
    templates = res2.get_json()["templates"]
    assert len(templates) == 1
    tpl = templates[0]
    assert tpl["name"] == "Paris Getaway"
    assert tpl["countryCode"] == "FR"
    assert tpl["dayCount"] == 1
    assert tpl["creator"]["id"] == seed_user
    # No snapshot internals leak through.
    assert "snapshot_json" not in tpl
    assert "snapshotJson" not in tpl
    blob = json.dumps(tpl)
    for sentinel in ("SECRETEXPENSE", "SECRETCOMPANION", "SECRETPHOTO", "SECRETDOC"):
        assert sentinel not in blob


def test_template_defaults_public(client, seed_user, auth_headers):
    """A template created without an explicit isPublic defaults to public —
    preserves the pre-toggle 'everything is listed on Discover' behaviour."""
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src-def")
    tpl = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Default",
            "sourceTripId": "src-def",
        },
    ).get_json()["template"]
    assert tpl["isPublic"] is True


def test_public_feed_excludes_unlisted_templates(client, seed_user, auth_headers):
    """An unlisted (isPublic=false) template is still reachable by code but
    does NOT appear on the Discover feed; a public sibling does."""
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src-pub")
    _create_trip(client, auth_headers, trip_id="src-unl", name="Hidden")
    pub = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Listed",
            "sourceTripId": "src-pub",
            "isPublic": True,
        },
    ).get_json()["template"]
    unl = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "HiddenTpl",
            "sourceTripId": "src-unl",
            "isPublic": False,
        },
    ).get_json()["template"]
    assert pub["isPublic"] is True
    assert unl["isPublic"] is False
    feed = client.get("/api/templates/public", headers=auth_headers).get_json()["templates"]
    names = {x["name"] for x in feed}
    assert "Listed" in names
    assert "HiddenTpl" not in names


def test_template_update_can_unlist(client, seed_user, auth_headers):
    """Toggling isPublic=false on update drops the template from the feed."""
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src-tog")
    tpl = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Toggler",
            "sourceTripId": "src-tog",
        },
    ).get_json()["template"]
    assert tpl["isPublic"] is True
    upd = client.put(
        f"/api/templates/{tpl['id']}",
        headers=auth_headers,
        json={
            "sourceTripId": "src-tog",
            "isPublic": False,
        },
    ).get_json()["template"]
    assert upd["isPublic"] is False
    feed = client.get("/api/templates/public", headers=auth_headers).get_json()["templates"]
    assert "Toggler" not in {x["name"] for x in feed}


def test_create_from_template_dates_days_from_start(client, seed_user, auth_headers):
    """A template carries a fixed day range, so create-from-template takes
    just a startDate and auto-dates the numbered days: day N → start + N-1."""
    _make_creator(seed_user)
    _create_trip(client, auth_headers, trip_id="dated-src", name="Trip")
    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        for n in (1, 2, 3):
            c.execute(
                "INSERT INTO trip_days (id, trip_id, day_number, name) VALUES (?, ?, ?, ?)",
                (f"dd{n}", "dated-src", n, f"Day {n}"),
            )
        conn.commit()
    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Dated",
            "sourceTripId": "dated-src",
            "includePlans": True,
        },
    ).get_json()["template"]["code"]
    res = client.post(
        f"/api/templates/{code}/create",
        headers=auth_headers,
        json={
            "startDate": "2026-07-10",
        },
    )
    assert res.status_code == 200
    new_trip_id = res.get_json()["tripId"]
    data = client.get("/api/data", headers=auth_headers).get_json()
    days = sorted(
        (d for d in data["tripDays"] if d["tripId"] == new_trip_id),
        key=lambda d: d["dayNumber"],
    )
    assert [d["date"] for d in days] == ["2026-07-10", "2026-07-11", "2026-07-12"]


def test_create_from_template_without_start_leaves_dates_blank(client, seed_user, auth_headers):
    """No startDate (legacy / bodyless) → days stay undated, as before."""
    _make_creator(seed_user)
    _create_trip(client, auth_headers, trip_id="undated-src", name="Trip")
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, name) VALUES (?, ?, ?, ?)",
            ("ud1", "undated-src", 1, "Day 1"),
        )
        conn.commit()
    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Undated",
            "sourceTripId": "undated-src",
            "includePlans": True,
        },
    ).get_json()["template"]["code"]
    res = client.post(f"/api/templates/{code}/create", headers=auth_headers)
    assert res.status_code == 200
    new_trip_id = res.get_json()["tripId"]
    data = client.get("/api/data", headers=auth_headers).get_json()
    day = next(d for d in data["tripDays"] if d["tripId"] == new_trip_id)
    assert not day["date"]


def test_create_from_template_far_future_start_does_not_500(client, seed_user, auth_headers):
    """A5-B2: the startDate input has no max, so a far-future date like
    9999-12-31 pushes day 2+ past date.max and OverflowError used to escape as
    a 500. It must instead succeed, dating what fits and blanking the day that
    overflows."""
    _make_creator(seed_user)
    _create_trip(client, auth_headers, trip_id="ff-src", name="Trip")
    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        for n in (1, 2, 3):
            c.execute(
                "INSERT INTO trip_days (id, trip_id, day_number, name) VALUES (?, ?, ?, ?)",
                (f"ff{n}", "ff-src", n, f"Day {n}"),
            )
        conn.commit()
    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "FarFuture",
            "sourceTripId": "ff-src",
            "includePlans": True,
        },
    ).get_json()["template"]["code"]
    res = client.post(
        f"/api/templates/{code}/create",
        headers=auth_headers,
        json={"startDate": "9999-12-31"},
    )
    assert res.status_code == 200
    new_trip_id = res.get_json()["tripId"]
    data = client.get("/api/data", headers=auth_headers).get_json()
    days = sorted(
        (d for d in data["tripDays"] if d["tripId"] == new_trip_id),
        key=lambda d: d["dayNumber"],
    )
    # Day 1 fits exactly at date.max; days 2+ overflow and blank out.
    assert days[0]["date"] == "9999-12-31"
    assert not days[1]["date"]
    assert not days[2]["date"]


def test_snapshot_and_instantiate_carry_plan_blocks(
    client,
    seed_user,
    auth_headers,
    seed_other_user,
    other_auth_headers,
):
    """A5-B1: a day's block-editor content (plan_blocks_json) includes PLACE
    blocks that the flat morning/afternoon/evening columns drop
    (_flatten_block_text keeps only text). The template snapshot must capture
    plan_blocks_json and instantiation must write it back, or a template loses
    every place block. Round-trip: source day place block → snapshot.planBlocks
    → new trip's day.planBlocks (read via /api/data)."""
    _make_creator(seed_user)
    _create_trip(client, auth_headers, trip_id="blk-src", name="Rome")
    blocks = {
        "morning": [
            {"type": "text", "text": "Wander the Forum"},
            {"type": "place", "placeId": "PLACE_COLOSSEUM"},
        ]
    }
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_days (id, trip_id, day_number, name, morning, plan_blocks_json) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            ("blk-d1", "blk-src", 1, "Day 1", "Wander the Forum", json.dumps(blocks)),
        )
        conn.commit()

    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Rome",
            "sourceTripId": "blk-src",
            "includePlans": True,
        },
    ).get_json()["template"]["code"]

    # Snapshot carries the ordered blocks (incl. the place ref the flat text drops).
    snap = _read_snapshot(code)
    assert len(snap["days"]) == 1
    assert snap["days"][0]["planBlocks"] == blocks
    # Flat text still present for back-compat readers.
    assert snap["days"][0]["plan"]["morning"] == "Wander the Forum"

    # Instantiation writes the blocks back onto the new owner's day.
    new_id = client.post(
        f"/api/templates/{code}/create",
        headers=other_auth_headers,
    ).get_json()["tripId"]
    data = client.get("/api/data", headers=other_auth_headers).get_json()
    new_day = next(d for d in data["tripDays"] if d["tripId"] == new_id)
    assert new_day["planBlocks"] == blocks


def test_snapshot_toggles_off_omit_sections(client, seed_user, auth_headers):
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src2")
    res = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Bare",
            "sourceTripId": "src2",
            "includePlans": False,
            "includePlaces": False,
            "includeChecklist": False,
        },
    )
    assert res.status_code == 200
    snap = _read_snapshot(res.get_json()["template"]["code"])
    assert snap["days"] == []
    assert snap["markedPlaces"] == []
    assert snap["checklist"] == []


# ── instantiation ────────────────────────────────────────────────────
def test_create_from_template_makes_owned_trip_without_expenses(
    client,
    seed_user,
    auth_headers,
    seed_other_user,
    other_auth_headers,
):
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src3")
    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Paris",
            "sourceTripId": "src3",
            "includePlans": True,
            "includePlaces": True,
            "includeChecklist": True,
        },
    ).get_json()["template"]["code"]

    # A DIFFERENT user instantiates.
    res = client.post(f"/api/templates/{code}/create", headers=other_auth_headers)
    assert res.status_code == 200
    new_id = res.get_json()["tripId"]
    assert new_id

    from database import get_db

    with get_db() as conn:
        c = conn.cursor()
        # Owned by the instantiator.
        owner = c.execute("SELECT user_id FROM trips WHERE id = ?", (new_id,)).fetchone()["user_id"]
        assert owner == seed_other_user
        # No expenses copied.
        ec = c.execute("SELECT COUNT(*) n FROM expenses WHERE trip_id = ?", (new_id,)).fetchone()[
            "n"
        ]
        assert ec == 0
        # Days copied with dates blanked, plan text intact.
        days = c.execute(
            "SELECT date, morning FROM trip_days WHERE trip_id = ? AND deleted_at IS NULL",
            (new_id,),
        ).fetchall()
        assert len(days) == 1
        assert days[0]["date"] is None
        assert days[0]["morning"] == "Visit Louvre"
        # use_count incremented.
        uc = c.execute("SELECT use_count FROM trip_templates WHERE code = ?", (code,)).fetchone()[
            "use_count"
        ]
        assert uc == 1

    # Media (markedPlaces + checklist) present via the media read path —
    # confirms the media-write-invariant-safe server INSERT populated them.
    media = client.get(f"/api/trips/{new_id}/media", headers=other_auth_headers)
    assert media.status_code == 200
    mbody = media.get_json()
    assert len(mbody.get("markedPlaces") or []) == 1
    assert len(mbody.get("checklist") or []) == 1
    assert len(mbody.get("photos") or []) == 0
    assert len(mbody.get("documents") or []) == 0


# ── update keeps the code + re-snapshots ─────────────────────────────
def test_update_template_keeps_code_and_resnapshots(client, seed_user, auth_headers):
    """Editing a template re-snapshots from the source trip but KEEPS the
    same code — shared codes must keep working after the creator adds content.
    Also covers the frozen-snapshot refresh: to-dos / checklist added to the
    source trip AFTER the template was first created show up on re-snapshot,
    and a to-do place's stale source-trip day binding is neutralized."""
    _make_creator(seed_user)
    _create_trip(client, auth_headers, trip_id="upd-src", name="Lisbon")

    created = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Lisbon",
            "sourceTripId": "upd-src",
            "includePlans": True,
            "includePlaces": True,
            "includeChecklist": True,
        },
    ).get_json()["template"]
    tmpl_id = created["id"]
    code = created["code"]

    # Freshly created from a bare trip → no to-dos yet.
    snap = _read_snapshot(code)
    assert snap["markedPlaces"] == []
    assert snap["checklist"] == []

    # The creator NOW adds a to-do place (pinned to a specific day + slot)
    # and a checklist item to the SOURCE trip.
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET marked_places_json = ?, checklist_json = ? WHERE id = ?",
            (
                json.dumps(
                    [
                        {
                            "id": "p9",
                            "name": "Belém Tower",
                            "forManual": True,
                            "dayId": "old-day-7",
                            "timeOfDay": "morning",
                        }
                    ]
                ),
                json.dumps([{"id": "k9", "body": "Buy Lisboa card", "done": True}]),
                "upd-src",
            ),
        )
        conn.commit()

    # Edit the template (same toggles) → re-snapshot.
    res = client.put(
        f"/api/templates/{tmpl_id}",
        headers=auth_headers,
        json={
            "name": "Lisbon",
            "sourceTripId": "upd-src",
            "includePlans": True,
            "includePlaces": True,
            "includeChecklist": True,
        },
    )
    assert res.status_code == 200
    # THE GUARANTEE: code is unchanged so a friend's shared code keeps working.
    assert res.get_json()["template"]["code"] == code

    # Re-snapshot picked up the newly-added to-dos + checklist.
    snap2 = _read_snapshot(code)
    assert len(snap2["markedPlaces"]) == 1
    assert snap2["markedPlaces"][0]["name"] == "Belém Tower"
    # Stale source-trip day binding neutralized — the imported to-do starts
    # unassigned (the new trip has different day ids / blanked dates).
    assert "dayId" not in snap2["markedPlaces"][0]
    assert "timeOfDay" not in snap2["markedPlaces"][0]
    assert len(snap2["checklist"]) == 1
    assert snap2["checklist"][0]["body"] == "Buy Lisboa card"
    # Completion reset for the new owner.
    assert snap2["checklist"][0]["done"] is False


# ── public preview ───────────────────────────────────────────────────
def test_revoked_creator_can_delete_own_template(client, seed_user, auth_headers):
    """Audit MK5 BUG-055: deleting your OWN template needs OWNERSHIP, not the
    (revocable) can-create privilege. After an admin revokes creator status the
    user's templates intentionally stay live — but they must still be able to
    remove them. The old _is_creator gate on DELETE locked them out forever."""
    from database import get_db

    _make_creator(seed_user)
    _create_trip(client, auth_headers, trip_id="del-src", name="Porto")
    tmpl_id = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Porto",
            "sourceTripId": "del-src",
            "includePlans": True,
            "includePlaces": True,
            "includeChecklist": True,
        },
    ).get_json()["template"]["id"]
    # Admin revokes the user's creator status (templates intentionally stay live).
    with get_db() as conn:
        conn.execute("UPDATE users SET is_creator = 0 WHERE id = ?", (seed_user,))
        conn.commit()
    # The owner can STILL delete their own template.
    res = client.delete(f"/api/templates/{tmpl_id}", headers=auth_headers)
    assert res.status_code == 200, res.get_data(as_text=True)
    with get_db() as conn:
        row = conn.execute(
            "SELECT id FROM trip_templates WHERE id = ?",
            (tmpl_id,),
        ).fetchone()
    assert row is None, "template should be removed from the DB"


def test_preview_public_no_auth_safe_and_404(client, seed_user, auth_headers):
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src4")
    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Paris",
            "sourceTripId": "src4",
            "includePlans": True,
            "includePlaces": True,
            "includeChecklist": True,
        },
    ).get_json()["template"]["code"]

    # No auth header → still works (public).
    res = client.get(f"/api/templates/preview/{code}")
    assert res.status_code == 200
    body = res.get_json()
    assert body["dayCount"] == 1
    assert body["placeCount"] == 1
    assert body["checklistCount"] == 1
    # No sensitive data in the public payload.
    blob = json.dumps(body)
    for sentinel in ("SECRETEXPENSE", "SECRETCOMPANION", "SECRETPHOTO", "SECRETDOC"):
        assert sentinel not in blob

    # Bad code → 404 (no existence leak).
    assert client.get("/api/templates/preview/ZZZZ9999").status_code == 404


def test_preview_normalizes_code(client, seed_user, auth_headers):
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src5")
    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Paris",
            "sourceTripId": "src5",
        },
    ).get_json()["template"]["code"]
    # Lowercase + dash separator (how a UI might display / a user might type).
    dashed_lower = (code[:4] + "-" + code[4:]).lower()
    assert client.get(f"/api/templates/preview/{dashed_lower}").status_code == 200


# ── dev-only creator grant ───────────────────────────────────────────
def test_grant_creator_dev_only(client, seed_user, auth_headers):
    # Non-dev caller forbidden.
    res = client.post(
        "/api/admin/creator",
        headers=auth_headers,
        json={
            "userId": "test-user-1",
            "isCreator": True,
        },
    )
    assert res.status_code == 403

    # Dev caller can grant; user-status then reflects isCreator.
    _dev_id, dev_headers = _seed_dev_user()
    res = client.post(
        "/api/admin/creator",
        headers=dev_headers,
        json={
            "userId": "test-user-1",
            "isCreator": True,
        },
    )
    assert res.status_code == 200
    assert res.get_json()["isCreator"] is True

    us = client.get("/api/user-status", headers=auth_headers).get_json()
    assert us["user"]["isCreator"] is True

    # Granted user can now create templates.
    _create_trip(client, auth_headers, trip_id="t-after-grant", name="Trip")
    res = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "T",
            "sourceTripId": "t-after-grant",
        },
    )
    assert res.status_code == 200


def test_dev_user_is_always_creator(client):
    """The dev account is a creator even with is_creator unset (0)."""
    _dev_id, dev_headers = _seed_dev_user()
    us = client.get("/api/user-status", headers=dev_headers).get_json()
    assert us["user"]["isCreator"] is True


def test_public_preview_page_renders(client, seed_user, auth_headers):
    """The server-rendered /t/<code> page returns 200 with the CTA for a
    valid code, and 404 for a bad one — no auth needed."""
    _make_creator(seed_user)
    _seed_rich_source_trip(client, auth_headers, seed_user, trip_id="src6")
    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Paris",
            "sourceTripId": "src6",
        },
    ).get_json()["template"]["code"]

    res = client.get(f"/t/{code}")
    assert res.status_code == 200
    html = res.get_data(as_text=True)
    assert "Use this template" in html
    assert f"/?fromTemplate={code}" in html
    # No sensitive data in the public HTML.
    for sentinel in ("SECRETEXPENSE", "SECRETCOMPANION", "SECRETPHOTO"):
        assert sentinel not in html

    assert client.get("/t/ZZZZ9999").status_code == 404


def test_create_template_rejects_non_owned_trip(
    client,
    seed_user,
    auth_headers,
    seed_other_user,
    other_auth_headers,
):
    """A creator can only template their OWN trip — someone else's trip id
    returns 404 (no existence leak)."""
    _make_creator(seed_user)
    # Trip owned by user-2.
    _create_trip(client, other_auth_headers, trip_id="others-trip", name="Theirs")
    res = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Steal",
            "sourceTripId": "others-trip",
        },
    )
    assert res.status_code == 404


def test_instantiated_marked_places_normalized_to_manual(
    client,
    seed_user,
    auth_headers,
    seed_other_user,
    other_auth_headers,
):
    """A creator's AI-sourced marked places must NOT keep source='ai' in a
    template — otherwise the new owner's first Accept Plan (dropAITaggedPlaces)
    would silently DELETE every imported to-do. _clean_marked_places normalizes
    source to 'manual' at BOTH snapshot build and instantiation."""
    _make_creator(seed_user)
    _create_trip(client, auth_headers, trip_id="srcAI", name="Lisbon")
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET marked_places_json = ? WHERE id = ?",
            (
                json.dumps(
                    [
                        {
                            "id": "a1",
                            "name": "Belém Tower",
                            "forManual": True,
                            "source": "ai",
                            "dayId": "old-d1",
                            "timeOfDay": "morning",
                        },
                        {
                            "id": "a2",
                            "name": "Time Out Market",
                            "forManual": True,
                            "source": "manual",
                        },
                    ]
                ),
                "srcAI",
            ),
        )
        conn.commit()
    code = client.post(
        "/api/templates",
        headers=auth_headers,
        json={
            "name": "Lisbon",
            "sourceTripId": "srcAI",
            "includePlans": True,
            "includePlaces": True,
            "includeChecklist": True,
        },
    ).get_json()["template"]["code"]

    # The frozen snapshot is already normalized (and dayId/timeOfDay stripped).
    snap = _read_snapshot(code)
    assert len(snap["markedPlaces"]) == 2
    assert all(p.get("source") == "manual" for p in snap["markedPlaces"])
    assert all("dayId" not in p and "timeOfDay" not in p for p in snap["markedPlaces"])

    # The instantiated trip's media reads source='manual' too → survives the
    # new owner's first Accept Plan.
    new_id = client.post(
        f"/api/templates/{code}/create",
        headers=other_auth_headers,
    ).get_json()["tripId"]
    media = client.get(f"/api/trips/{new_id}/media", headers=other_auth_headers).get_json()
    assert len(media.get("markedPlaces") or []) == 2
    assert all(p.get("source") == "manual" for p in media["markedPlaces"])


def test_login_response_includes_isCreator(client, monkeypatch):
    """Audit MK5 P2: the /api/auth/google LOGIN response must carry isCreator
    (it was only in /api/user-status), so a granted Creator sees the Creator tab
    on first login instead of after a full page reload."""
    monkeypatch.setenv("GG_ALLOW_TEST_LOGIN", "1")
    # Test-login requires a `test-` user_id (security guard in google_auth).
    # First login creates the user; is_creator defaults 0.
    res = client.post("/api/auth/google", json={"token": "test:test-creator-login"})
    assert res.status_code == 200
    assert res.get_json()["user"]["isCreator"] is False
    # Grant creator, log in again → the LOGIN response reflects it immediately.
    from database import get_db

    with get_db() as conn:
        conn.execute("UPDATE users SET is_creator = 1 WHERE id = ?", ("test-creator-login",))
        conn.commit()
    res2 = client.post("/api/auth/google", json={"token": "test:test-creator-login"})
    assert res2.status_code == 200
    assert res2.get_json()["user"]["isCreator"] is True
