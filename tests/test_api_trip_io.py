"""Trip ZIP export / import round-trip — routes/trip_io.py.

Covers the user-facing contract: a trip exported to a `.ggtrip.zip` and then
imported recreates the *same* trip (itinerary, expenses, budgets, settlements,
categories, media) as a fresh, importer-owned trip. Exercises the schema-
introspection export, the column-intersection import, category match/create,
media-file re-homing + URL rewrite, and the access/validation guards.
"""

import io
import json
import os
import zipfile

from database import get_db
from tests.conftest import _create_trip


def _seed_media_file(app, user_id, name, content=b"\xff\xd8\xff-fake-bytes"):
    """Write a real file under <UPLOAD_FOLDER>/<user_id>/<name> and return the
    `/static/uploads/...` URL that references it (mirrors a real upload)."""
    d = os.path.join(app.config["UPLOAD_FOLDER"], user_id)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, name), "wb") as fh:
        fh.write(content)
    return f"/static/uploads/{user_id}/{name}"


def _populate_trip(client, app, headers, user_id, trip_id):
    """Build a fully-loaded trip and return (receipt_url, photo_url)."""
    _create_trip(client, headers, trip_id=trip_id, name="Round Trip")
    # A category so the import's match/create + FK-remap path is exercised.
    client.post(
        "/api/sync",
        headers=headers,
        json={
            "categories": [{"id": "cat-food", "name": "Food", "icon": "🍔", "color": "#ff0000"}],
        },
    )
    client.post(
        "/api/days",
        headers=headers,
        json={
            "day": {
                "id": "day-1",
                "tripId": trip_id,
                "dayNumber": 1,
                "name": "Day One",
                "date": "2026-02-01",
            }
        },
    )
    receipt = _seed_media_file(app, user_id, "receipt.jpg")
    client.post(
        "/api/expenses",
        headers=headers,
        json={
            "expense": {
                "id": "exp-1",
                "tripId": trip_id,
                "who": "Me",
                "value": 50,
                "currency": "EUR",
                "euroValue": 50,
                "label": "Lunch",
                "date": "2026-02-01",
                "categoryId": "cat-food",
                "receiptUrl": receipt,
            }
        },
    )
    client.post(
        "/api/budgets",
        headers=headers,
        json={
            "budget": {
                "id": "bud-1",
                "tripId": trip_id,
                "label": "Food",
                "categoryId": "cat-food",
                "amount": 200,
                "currency": "EUR",
            }
        },
    )
    # Insert the settlement directly: the endpoint requires both parties to be
    # accepted trip members (anti-fabrication gate), which a single-user test
    # trip can't satisfy — and we're exercising export/import, not settlement
    # creation. Names + amount are what must survive the round-trip.
    with get_db() as conn:
        conn.execute(
            "INSERT INTO settlements (id, trip_id, from_user_id, to_user_id, "
            " from_name, to_name, amount, currency, euro_value, recorded_by) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ("set-1", trip_id, user_id, user_id, "Ana", "Bruno", 25, "EUR", 25, user_id),
        )
        conn.commit()
    photo = _seed_media_file(app, user_id, "photo.jpg")
    client.post(
        f"/api/trips/{trip_id}/media",
        headers=headers,
        json={
            # dayId on the media items exercises the import's day-id remap:
            # days get fresh ids, so these refs must be rewritten or the items
            # point at a dead day and vanish from every pane.
            "photos": [{"id": "p1", "src": photo, "caption": "Beach", "dayId": "day-1"}],
            "documents": [{"id": "doc1", "name": "Passport", "url": photo, "dayId": "day-1"}],
            "markedPlaces": [
                {
                    "placeId": "mp1",
                    "name": "Cafe",
                    "lat": 48.85,
                    "lng": 2.35,
                    "forManual": True,
                    "dayId": "day-1",
                    "timeOfDay": "morning",
                }
            ],
            "checklist": [{"id": "c1", "body": "Pack", "done": False}],
        },
    )
    return receipt, photo


def _export_zip(client, headers, trip_id):
    res = client.get(f"/api/trips/{trip_id}/export", headers=headers)
    assert res.status_code == 200, res.data
    assert res.mimetype == "application/zip"
    return res.data


def test_export_manifest_shape(client, seed_user, auth_headers, tmp_path, monkeypatch):
    monkeypatch.setitem(client.application.config, "UPLOAD_FOLDER", str(tmp_path))
    app = client.application
    _populate_trip(client, app, auth_headers, seed_user, "trip-rt")

    zf = zipfile.ZipFile(io.BytesIO(_export_zip(client, auth_headers, "trip-rt")))
    manifest = json.loads(zf.read("manifest.json"))

    assert manifest["format"] == "gg.trip"
    assert manifest["formatVersion"] == 1
    s = manifest["sections"]
    assert s["trips"][0]["name"] == "Round Trip"
    assert len(s["trip_days"]) == 1
    assert len(s["expenses"]) == 1
    assert len(s["budgets"]) == 1
    assert len(s["settlements"]) == 1
    assert len(s["categories"]) == 1 and s["categories"][0]["name"] == "Food"
    # Two distinct upload URLs (receipt.jpg + photo.jpg) → two media files.
    assert len(manifest["media"]) == 2
    assert len([n for n in zf.namelist() if n.startswith("media/")]) == 2


def test_export_strips_share_token_and_reset_columns(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    """MK6 P2: the exported trips row must NOT carry the owner-only
    share_token (nor public_slug / is_public / server timestamps). A non-owner
    member can export a trip, and a leaked share_token lets them reconstruct
    the private /share/<token> link. Import discards these columns anyway, so
    stripping them on export is round-trip-safe."""
    monkeypatch.setitem(client.application.config, "UPLOAD_FOLDER", str(tmp_path))
    app = client.application
    _populate_trip(client, app, auth_headers, seed_user, "trip-rt")
    # Give the trip a real share_token (as an explicit share link would).
    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET share_token = ?, is_public = 1 WHERE id = ?",
            ("secret-tok-123", "trip-rt"),
        )
        conn.commit()

    zf = zipfile.ZipFile(io.BytesIO(_export_zip(client, auth_headers, "trip-rt")))
    manifest = json.loads(zf.read("manifest.json"))
    trip_row = manifest["sections"]["trips"][0]

    # share_token (real column) must be stripped; public_slug is in
    # _RESET_COLUMNS defensively but isn't a real trips column, so it's never
    # present either way — assert both to lock the contract.
    for leaked in ("share_token", "public_slug"):
        assert leaked not in trip_row, f"{leaked} leaked into the export manifest"
    # Full manifest text must not contain the secret anywhere.
    assert "secret-tok-123" not in zf.read("manifest.json").decode()
    # Sharing/account state + server timestamps are reset on export too.
    for col in ("is_public", "is_archived", "created_at", "updated_at", "deleted_at"):
        assert col not in trip_row, f"{col} should be stripped from the export"
    # Sanity: real trip data still rides along.
    assert trip_row["name"] == "Round Trip"


def test_roundtrip_same_account_reuses_category(
    client, seed_user, auth_headers, tmp_path, monkeypatch
):
    monkeypatch.setitem(client.application.config, "UPLOAD_FOLDER", str(tmp_path))
    app = client.application
    receipt, photo = _populate_trip(client, app, auth_headers, seed_user, "trip-rt")
    data = _export_zip(client, auth_headers, "trip-rt")

    res = client.post(
        "/api/trips/import",
        headers=auth_headers,
        data={"file": (io.BytesIO(data), "trip.ggtrip.zip")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200, res.data
    new_id = res.get_json()["tripId"]
    assert new_id != "trip-rt"

    # Trip is visible to the user through the normal data feed.
    feed = client.get("/api/data", headers=auth_headers).get_json()
    assert new_id in {t["id"] for t in feed["trips"]}

    with get_db() as conn:
        c = conn.cursor()
        assert (
            c.execute("SELECT user_id FROM trips WHERE id=?", (new_id,)).fetchone()[0] == seed_user
        )
        for table in ("trip_days", "expenses", "budgets", "settlements"):
            n = c.execute(f"SELECT COUNT(*) FROM {table} WHERE trip_id=?", (new_id,)).fetchone()[0]
            assert n == 1, f"{table} count={n}"
        # Same account already owns "Food" → category REUSED (not duplicated).
        assert (
            c.execute("SELECT COUNT(*) FROM categories WHERE user_id=?", (seed_user,)).fetchone()[0]
            == 1
        )
        exp = c.execute(
            "SELECT id, category_id, receipt_url FROM expenses WHERE trip_id=?", (new_id,)
        ).fetchone()
        assert exp["id"] != "exp-1"  # fresh id
        assert exp["category_id"] == "cat-food"  # reused category
        # Receipt URL rewritten to a re-saved copy that exists on disk.
        assert exp["receipt_url"].startswith(f"/static/uploads/{seed_user}/")
        assert exp["receipt_url"] != receipt
        rel = exp["receipt_url"].replace("/static/uploads/", "")
        assert os.path.isfile(os.path.join(str(tmp_path), rel))
        # Settlement names preserved; linked account ids cleared.
        st = c.execute(
            "SELECT from_user_id, to_user_id, from_name, to_name FROM settlements WHERE trip_id=?",
            (new_id,),
        ).fetchone()
        assert st["from_user_id"] is None and st["to_user_id"] is None
        assert st["from_name"] == "Ana" and st["to_name"] == "Bruno"

    # The imported day's fresh id — every day-tagged media item must now
    # point at THIS, not the dead "day-1".
    with get_db() as conn:
        new_day_id = conn.execute("SELECT id FROM trip_days WHERE trip_id=?", (new_id,)).fetchone()[
            0
        ]
    assert new_day_id != "day-1"  # fresh id

    # Media surfaces through the dedicated media endpoint, URLs rewritten.
    media = client.get(f"/api/trips/{new_id}/media", headers=auth_headers).get_json()
    assert len(media["photos"]) == 1
    assert media["photos"][0]["src"].startswith(f"/static/uploads/{seed_user}/")
    assert media["photos"][0]["src"] != photo
    assert media["markedPlaces"][0]["name"] == "Cafe"
    assert media["checklist"][0]["body"] == "Pack"

    # ── The regression this test now guards: day-id remap. A marked place /
    # photo / document tagged to day-1 must come back tagged to the NEW day id
    # (with its slot intact), NOT a dead reference that hides it everywhere.
    mp = media["markedPlaces"][0]
    assert mp["dayId"] == new_day_id, "marked place dayId must be remapped, not left dead"
    assert mp["timeOfDay"] == "morning", "slot assignment must survive import"
    assert media["photos"][0]["dayId"] == new_day_id, "photo dayId must be remapped"
    assert media["documents"][0]["dayId"] == new_day_id, "document dayId must be remapped"


def test_import_cross_account_creates_owned_copy(
    client,
    seed_user,
    auth_headers,
    seed_other_user,
    other_auth_headers,
    tmp_path,
    monkeypatch,
):
    """User 2 imports User 1's exported trip: a brand-new trip owned by user 2,
    a fresh category owned by user 2, media re-homed under user 2's dir."""
    monkeypatch.setitem(client.application.config, "UPLOAD_FOLDER", str(tmp_path))
    app = client.application
    _populate_trip(client, app, auth_headers, seed_user, "trip-rt")
    data = _export_zip(client, auth_headers, "trip-rt")

    res = client.post(
        "/api/trips/import",
        headers=other_auth_headers,
        data={"file": (io.BytesIO(data), "trip.ggtrip.zip")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 200, res.data
    new_id = res.get_json()["tripId"]

    with get_db() as conn:
        c = conn.cursor()
        assert (
            c.execute("SELECT user_id FROM trips WHERE id=?", (new_id,)).fetchone()[0]
            == seed_other_user
        )
        # A NEW "Food" category was created for user 2 (id differs from user 1's).
        cat = c.execute(
            "SELECT id, name FROM categories WHERE user_id=?", (seed_other_user,)
        ).fetchone()
        assert cat["name"] == "Food" and cat["id"] != "cat-food"
        exp = c.execute(
            "SELECT category_id, receipt_url FROM expenses WHERE trip_id=?", (new_id,)
        ).fetchone()
        assert exp["category_id"] == cat["id"]
        assert exp["receipt_url"].startswith(f"/static/uploads/{seed_other_user}/")
        rel = exp["receipt_url"].replace("/static/uploads/", "")
        assert os.path.isfile(os.path.join(str(tmp_path), rel))


def test_export_requires_membership(
    client, seed_user, auth_headers, seed_other_user, other_auth_headers, tmp_path, monkeypatch
):
    monkeypatch.setitem(client.application.config, "UPLOAD_FOLDER", str(tmp_path))
    _create_trip(client, auth_headers, trip_id="trip-priv", name="Private")
    # Non-member can't export — same 404 the trip would 404-as-not-found.
    res = client.get("/api/trips/trip-priv/export", headers=other_auth_headers)
    assert res.status_code == 404


def test_import_rejects_non_zip(client, seed_user, auth_headers):
    res = client.post(
        "/api/trips/import",
        headers=auth_headers,
        data={"file": (io.BytesIO(b"not a zip"), "x.zip")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400


def test_import_rejects_newer_format_version(client, seed_user, auth_headers):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr(
            "manifest.json",
            json.dumps(
                {
                    "format": "gg.trip",
                    "formatVersion": 999,
                    "sections": {"trips": [{"id": "x", "name": "Future"}]},
                    "media": {},
                }
            ),
        )
    buf.seek(0)
    res = client.post(
        "/api/trips/import",
        headers=auth_headers,
        data={"file": (buf, "future.ggtrip.zip")},
        content_type="multipart/form-data",
    )
    assert res.status_code == 400
    assert "newer version" in res.get_json()["error"]


def _import_manifest(client, headers, manifest):
    """POST a one-file .ggtrip.zip carrying `manifest` (any JSON value) and
    return the response — for exercising the import's manifest-shape guards."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
    buf.seek(0)
    return client.post(
        "/api/trips/import",
        headers=headers,
        data={"file": (buf, "trip.ggtrip.zip")},
        content_type="multipart/form-data",
    )


def test_import_rejects_malformed_manifest_shape(client, seed_user, auth_headers):
    """A7-B1: a manifest with the right `format` but a malformed envelope must
    return a clean 400 ('Invalid or corrupt trip archive'), never blow up into
    a 500. Pre-fix, int(formatVersion) / sections.get / media.items() / dict()
    ran unguarded, so each of these shapes raised and 500'd the request."""
    bad_manifests = [
        # non-int formatVersion (int() raises ValueError)
        {
            "format": "gg.trip",
            "formatVersion": "not-a-number",
            "sections": {"trips": [{"id": "x", "name": "T"}]},
            "media": {},
        },
        # formatVersion is a list (int() raises TypeError)
        {
            "format": "gg.trip",
            "formatVersion": [1],
            "sections": {"trips": [{"id": "x", "name": "T"}]},
            "media": {},
        },
        # sections is a list, not a dict (.get('trips') → AttributeError)
        {"format": "gg.trip", "formatVersion": 1, "sections": [{"trips": []}], "media": {}},
        # sections['trips'] is not a list of dicts (dict(trips[0]) → error)
        {
            "format": "gg.trip",
            "formatVersion": 1,
            "sections": {"trips": ["not-a-dict"]},
            "media": {},
        },
        # media is a list, not a dict (.items() → AttributeError)
        {
            "format": "gg.trip",
            "formatVersion": 1,
            "sections": {"trips": [{"id": "x", "name": "T"}]},
            "media": ["oops"],
        },
    ]
    for m in bad_manifests:
        res = _import_manifest(client, auth_headers, m)
        assert res.status_code == 400, (m, res.get_data(as_text=True))
        assert res.get_json()["error"] == "Invalid or corrupt trip archive", m


def test_import_body_over_10mb_not_rejected_by_global_cap(client, seed_user, auth_headers):
    """MK6 P2: /api/trips/import must accept bodies over the 10 MB global cap
    (up to 64 MB) so a media-bearing export round-trips. An 11 MB non-ZIP body
    should REACH the handler (→ 400 bad zip), not be 413'd at the global cap."""
    big = io.BytesIO(b"x" * (11 * 1024 * 1024))  # 11 MB > old 10 MB cap
    res = client.post(
        "/api/trips/import",
        headers=auth_headers,
        data={"file": (big, "trip.ggtrip.zip")},
        content_type="multipart/form-data",
    )
    assert res.status_code != 413, "11 MB import was 413'd by the 10 MB global cap"
    assert res.status_code == 400, res.get_data(as_text=True)  # reached handler; bad zip
