"""MK4 audit — MEDIA / UPLOADS fixes (MED-1, MED-2, MED-4).

These pin the three behavioural fixes from scratch/audit_mk4/findings/media.md
that have a server-observable contract:

  MED-1  update_trip_media gains an archived-write 409 gate (consistent
         with /api/days, /api/expenses, /api/budgets, /api/settlements);
         GET /media on an archived trip MUST still work.
  MED-2  delete_day cascades to the CANONICAL trip-level day-attached
         media (trips.photos_json / documents_json items tagged
         dayId == <deleted day>): their on-disk files are freed and the
         JSON entries dropped, while markedPlaces tagged to the day are
         converted to trip-wide (dayId nulled). Unrelated media untouched.
  MED-4  serve_upload's owner-narrowed fast gate must NOT broaden access:
         a member removed from the file's trip still gets 404, even if
         they share an unrelated trip with the owner.

MED-3 (frontend retry loop) + MED-5 (HEIC .jpg rename) are covered by the
existing media tests / typecheck — MED-5's rename is exercised below as a
cheap bonus where pillow-heif is available.
"""

import io

import pytest


def _create_trip(client, headers, trip_id, name="Test Trip"):
    res = client.post(
        "/api/trips",
        headers=headers,
        json={
            "trip": {"id": trip_id, "name": name, "country": "Test"},
        },
    )
    assert res.status_code == 200, res.get_data(as_text=True)
    return trip_id


def _seed_member(trip_id, user_id, role="planner", status="accepted"):
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "INSERT INTO trip_members "
            "(trip_id, user_id, role, is_archived, invitation_status, invited_by) "
            "VALUES (?, ?, ?, 0, ?, ?)",
            (trip_id, user_id, role, status, user_id),
        )
        conn.commit()


# ── MED-1: archived-write gate on update_trip_media ──────────────────────────


def test_med1_media_write_on_archived_trip_rejected(client, seed_user, auth_headers):
    """A trip-level media write on a trip the caller has archived → 409,
    matching every sibling per-trip write route. Pre-fix it 200'd while
    the day-level media write 409'd — an inconsistent in-modal contract."""
    trip_id = _create_trip(client, auth_headers, "trip-med1-archived")
    # Seed some real media first (while un-archived).
    assert (
        client.post(
            f"/api/trips/{trip_id}/media",
            headers=auth_headers,
            json={"checklist": [{"id": "c1"}]},
        ).status_code
        == 200
    )
    # Archive the trip for this user.
    assert (
        client.post(
            f"/api/trips/{trip_id}/archive",
            headers=auth_headers,
        ).status_code
        == 200
    )
    # Now a media write must be rejected with the same 409 contract.
    res = client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={"checklist": [{"id": "c1"}, {"id": "c2"}]},
    )
    assert res.status_code == 409, res.get_data(as_text=True)
    assert "archived" in (res.get_json() or {}).get("error", "").lower()
    # And the write did NOT apply — checklist is still the pre-archive value.
    got = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert got["checklist"] == [{"id": "c1"}], "archived write must be a no-op"


def test_med1_media_get_on_archived_trip_still_works(client, seed_user, auth_headers):
    """GET /media on an archived trip MUST still serve (the archived
    detail view renders it) — only the WRITE path is gated."""
    trip_id = _create_trip(client, auth_headers, "trip-med1-get")
    client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={"photos": [{"id": "p1"}]},
    )
    client.post(f"/api/trips/{trip_id}/archive", headers=auth_headers)
    res = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json()["photos"] == [{"id": "p1"}]


def test_med1_media_write_after_unarchive_succeeds(client, seed_user, auth_headers):
    """Sanity: the gate is purely about archived state — unarchiving
    restores write access."""
    trip_id = _create_trip(client, auth_headers, "trip-med1-unarchive")
    client.post(f"/api/trips/{trip_id}/archive", headers=auth_headers)
    assert (
        client.post(
            f"/api/trips/{trip_id}/media",
            headers=auth_headers,
            json={"checklist": [{"id": "x"}]},
        ).status_code
        == 409
    )
    client.post(f"/api/trips/{trip_id}/unarchive", headers=auth_headers)
    assert (
        client.post(
            f"/api/trips/{trip_id}/media",
            headers=auth_headers,
            json={"checklist": [{"id": "x"}]},
        ).status_code
        == 200
    )


# ── MED-2: delete_day frees day-attached trip-level files ────────────────────


def _set_trip_media_json(trip_id, *, photos=None, documents=None, marked=None):
    """Write the trip-level media JSON columns directly (bypasses the
    archived/version gates — we're setting up state, not testing the
    write path here)."""
    import json

    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET photos_json = ?, documents_json = ?, "
            "marked_places_json = ? WHERE id = ?",
            (
                json.dumps(photos if photos is not None else []),
                json.dumps(documents if documents is not None else []),
                json.dumps(marked if marked is not None else []),
                trip_id,
            ),
        )
        conn.commit()


def test_med2_day_delete_frees_day_attached_trip_level_files(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    """delete_day must collect upload paths for trip-level photos/documents
    tagged dayId == <deleted day>, rm those files from disk, and drop the
    items from the trip-level JSON — while leaving trip-wide + other-day
    items (and their files) untouched."""
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))

    trip_id = _create_trip(client, auth_headers, "trip-med2")

    # Upload three real files: one to delete (day-attached), one to keep
    # (trip-wide), one to keep (different day).
    def _upload(name):
        up = client.post(
            "/api/upload",
            headers=auth_headers,
            data={
                "file": (io.BytesIO(b"\xff\xd8\xff\xe0bytes"), name),
            },
        )
        assert up.status_code == 200, up.get_data(as_text=True)
        return up.get_json()["url"]

    url_doomed = _upload("doomed.jpg")
    url_tripwide = _upload("tripwide.jpg")
    url_otherday = _upload("otherday.jpg")

    def _disk(url):
        # /static/uploads/<owner>/<file> → <tmp_path>/<owner>/<file>
        return tmp_path / url.split("/static/uploads/", 1)[1]

    assert _disk(url_doomed).is_file()
    assert _disk(url_tripwide).is_file()
    assert _disk(url_otherday).is_file()

    day_id = "day-med2-target"
    other_day = "day-med2-other"
    # Create the day we'll delete (day_number > 0 so it's deletable).
    assert (
        client.post(
            "/api/days",
            headers=auth_headers,
            json={
                "day": {"id": day_id, "tripId": trip_id, "dayNumber": 1, "name": "Doomed"},
            },
        ).status_code
        == 200
    )

    # Tag the trip-level media: a photo on the doomed day, a trip-wide
    # photo, a photo on a different day, a document on the doomed day,
    # and a marked place on the doomed day.
    _set_trip_media_json(
        trip_id,
        photos=[
            {"id": "ph-doomed", "src": url_doomed, "dayId": day_id},
            {"id": "ph-tripwide", "src": url_tripwide, "dayId": None},
            {"id": "ph-other", "src": url_otherday, "dayId": other_day},
        ],
        documents=[
            {"id": "doc-doomed", "url": url_doomed, "name": "x", "dayId": day_id},
        ],
        marked=[
            {"id": "mp-doomed", "name": "Spot", "dayId": day_id},
        ],
    )

    # Delete the day.
    res = client.delete(f"/api/days/{day_id}", headers=auth_headers)
    assert res.status_code == 200, res.get_data(as_text=True)

    # The day-attached file is gone; the trip-wide + other-day files remain.
    assert not _disk(url_doomed).is_file(), "day-attached upload must be removed"
    assert _disk(url_tripwide).is_file(), "trip-wide upload must survive"
    assert _disk(url_otherday).is_file(), "other-day upload must survive"

    # The trip-level JSON dropped the doomed photo + document, kept the
    # others, and converted the marked place to trip-wide (dayId nulled).
    got = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    photo_ids = {p["id"] for p in got["photos"]}
    assert photo_ids == {"ph-tripwide", "ph-other"}, photo_ids
    assert got["documents"] == [], "day-attached document dropped"
    assert len(got["markedPlaces"]) == 1, "marked place kept (idea survives)"
    assert got["markedPlaces"][0]["dayId"] is None, "place converted to trip-wide"


def test_med2_day_delete_with_no_trip_level_media_is_noop(
    client,
    seed_user,
    auth_headers,
):
    """Regression guard: a day delete on a trip with no trip-level media
    must not error and must leave the (empty) media columns valid."""
    trip_id = _create_trip(client, auth_headers, "trip-med2-empty")
    day_id = "day-med2-empty"
    client.post(
        "/api/days",
        headers=auth_headers,
        json={
            "day": {"id": day_id, "tripId": trip_id, "dayNumber": 1, "name": "D"},
        },
    )
    assert (
        client.delete(
            f"/api/days/{day_id}",
            headers=auth_headers,
        ).status_code
        == 200
    )
    got = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert got["photos"] == [] and got["documents"] == []


# ── MED-4: owner-narrowed serve_upload gate preserves access semantics ────────


def _upload_owned(client, headers, name="f.jpg"):
    up = client.post(
        "/api/upload",
        headers=headers,
        data={
            "file": (io.BytesIO(b"\xff\xd8\xff\xe0owned"), name),
        },
    )
    assert up.status_code == 200, up.get_data(as_text=True)
    return up.get_json()["url"]


def test_med4_removed_member_still_denied(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
    tmp_path,
    monkeypatch,
):
    """THE invariant: a member removed from the file's trip loses access,
    even though the owner-narrowed fast gate keys on the owner. We give
    the removed member an UNRELATED shared trip with the owner to prove
    the gate doesn't broaden to 'shares any trip with owner'."""
    import json

    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))

    # Owner (seed_user) uploads a photo + puts it on trip A.
    url = _upload_owned(client, auth_headers, "ownerphoto.jpg")
    trip_a = _create_trip(client, auth_headers, "trip-med4-A")
    with __import__("database").get_db() as conn:
        conn.execute(
            "UPDATE trips SET photos_json = ? WHERE id = ?",
            (json.dumps([{"id": "p", "src": url}]), trip_a),
        )
        conn.commit()

    # seed_other is an accepted member of trip A → can read the photo.
    _seed_member(trip_a, seed_other_user, role="relaxer")
    assert client.get(url, headers=other_auth_headers).status_code == 200, (
        "accepted member of the file's trip reads it"
    )

    # Give them an UNRELATED shared trip B (both accepted members) so that
    # 'shares a trip with owner' is TRUE independent of trip A.
    trip_b = _create_trip(client, auth_headers, "trip-med4-B")
    _seed_member(trip_b, seed_other_user, role="relaxer")

    # Now REMOVE seed_other from trip A (the file's trip) only.
    with __import__("database").get_db() as conn:
        conn.execute(
            "DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?",
            (trip_a, seed_other_user),
        )
        conn.commit()

    # They still share trip B with the owner, but they're no longer a
    # member of the file's trip A → MUST be denied (404). This is the
    # removed-member-loses-access property the fast gate must preserve.
    res = client.get(url, headers=other_auth_headers)
    assert res.status_code == 404, (
        "removed member must lose access even when sharing an unrelated "
        f"trip with the owner (got {res.status_code})"
    )


def test_med4_owner_and_member_reads_still_work(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
    tmp_path,
    monkeypatch,
):
    """The fast gate must not over-restrict: the owner reads their own
    file, and an accepted member of the referencing trip reads it too."""
    import json

    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))

    url = _upload_owned(client, auth_headers, "shared.jpg")
    # Owner reads own file (fast-path, no DB).
    assert client.get(url, headers=auth_headers).status_code == 200

    trip_id = _create_trip(client, auth_headers, "trip-med4-ok")
    with __import__("database").get_db() as conn:
        conn.execute(
            "UPDATE trips SET documents_json = ? WHERE id = ?",
            (json.dumps([{"id": "d", "url": url, "name": "n"}]), trip_id),
        )
        conn.commit()
    _seed_member(trip_id, seed_other_user, role="budgeteer")
    assert client.get(url, headers=other_auth_headers).status_code == 200, (
        "accepted member of the referencing trip reads the file"
    )


def test_med4_receipt_access_member_vs_nonmember(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
    tmp_path,
    monkeypatch,
):
    """Receipts go through the same owner-narrowed gate: an accepted member
    of the expense's trip reads the receipt; a stranger does not."""
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))

    url = _upload_owned(client, auth_headers, "receipt.jpg")
    trip_id = _create_trip(client, auth_headers, "trip-med4-receipt")
    # Attach the receipt to an expense on the trip.
    assert client.post(
        "/api/expenses",
        headers=auth_headers,
        json={
            "expense": {
                "id": "exp-med4",
                "tripId": trip_id,
                "label": "x",
                "who": "Me",
                "value": 10,
                "currency": "EUR",
                "receiptUrl": url,
            },
        },
    ).status_code in (200, 201), "expense create"

    # Non-member stranger → 404.
    assert client.get(url, headers=other_auth_headers).status_code == 404

    # Accepted member → 200.
    _seed_member(trip_id, seed_other_user, role="relaxer")
    assert client.get(url, headers=other_auth_headers).status_code == 200


# ── MED-5 (bonus): HEIC→JPEG rewrites the returned URL extension ─────────────


def test_med5_heic_upload_returns_jpg_url(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    """When pillow-heif is available, a .heic upload is re-encoded to JPEG
    and the returned URL + on-disk filename end in .jpg (so content-type
    sniffing serves image/jpeg). Skipped if libheif isn't installed."""
    from routes import media as media_module

    if not getattr(media_module, "_HEIF_AVAILABLE", False):
        pytest.skip("pillow-heif/libheif not available in this environment")

    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))

    # Build a tiny real HEIC via pillow-heif so the magic-number sniff +
    # PIL decode both pass.
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (10, 20, 30)).save(buf, format="HEIF")
    buf.seek(0)

    up = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            "file": (buf, "IMG_0001.heic"),
        },
    )
    assert up.status_code == 200, up.get_data(as_text=True)
    url = up.get_json()["url"]
    assert url.endswith(".jpg"), f"HEIC upload URL must be rewritten to .jpg: {url}"
    on_disk = tmp_path / url.split("/static/uploads/", 1)[1]
    assert on_disk.is_file(), "the .jpg file must exist on disk"
    # And the bytes are actually JPEG.
    with open(on_disk, "rb") as fh:
        assert fh.read(3) == b"\xff\xd8\xff", "saved bytes must be JPEG"
