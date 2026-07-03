"""GG API tests — Trip-media read/write path, uploads, profile-picture validation.

Split out of the former tests/test_api.py monolith (pure reorg — no
test logic changed). Shared fixtures (client, auth_headers, seed_user,
...) come from tests/conftest.py.
"""

import io

from tests.conftest import _befriend, _create_trip, _seed_member


def test_update_profile_picture_local_upload_url(client, seed_user, auth_headers):
    """Round 5 audit fix: profile picture is now writable. The frontend
    uploads to /api/upload first, then POSTs the returned URL here.
    URLs from our own upload folder pass validation."""
    res = client.post(
        "/api/profile/update",
        headers=auth_headers,
        json={
            "picture": "/static/uploads/abc123.jpg",
        },
    )
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_picture_google_oauth_url(client, seed_user, auth_headers):
    """Google's OAuth profile-picture URLs (lh3.googleusercontent.com)
    pass validation when they MATCH the canonical value the OAuth flow
    set on first login.

    R2 audit fix: previously ANY lh3.googleusercontent.com URL was
    accepted, which let an attacker host a phishing image on Google
    Photos and set it as their TGG picture. Now only the exact URL
    Google issued during OAuth (stored in users.picture) is accepted
    on the BYO-google-url path. Other shapes (own upload, empty) are
    unchanged.
    """
    canonical = "https://lh3.googleusercontent.com/a/ACg8ocIabcdef=s96-c"
    # Simulate the OAuth flow having stamped this canonical value
    # onto the user's row.
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE users SET picture = ? WHERE id = ?",
            (canonical, seed_user),
        )
        conn.commit()
    res = client.post(
        "/api/profile/update",
        headers=auth_headers,
        json={
            "picture": canonical,
        },
    )
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_picture_rejects_arbitrary_google_cdn_url(
    client,
    seed_user,
    auth_headers,
):
    """R2 audit fix regression: an lh3.googleusercontent.com URL that
    DOESN'T match the user's canonical OAuth-issued picture must be
    rejected. Pre-fix the validator accepted any URL on that CDN —
    attacker could host arbitrary content via Google Photos and set
    it as their TGG picture."""
    res = client.post(
        "/api/profile/update",
        headers=auth_headers,
        json={
            # Not the user's canonical OAuth picture — should 403.
            "picture": "https://lh3.googleusercontent.com/a/attacker-controlled-asset=s96-c",
        },
    )
    assert res.status_code == 403


def test_update_profile_picture_empty_clears(client, seed_user, auth_headers):
    """Empty string is the explicit "clear my photo" signal — passes
    validation."""
    res = client.post(
        "/api/profile/update",
        headers=auth_headers,
        json={
            "picture": "",
        },
    )
    assert res.status_code == 200
    assert res.get_json() == {"status": "updated"}


def test_update_profile_picture_rejects_arbitrary_url(client, seed_user, auth_headers):
    """Defence-in-depth: an attacker-supplied arbitrary URL (e.g. an
    SSRF probe, a remote tracking pixel) gets rejected. The users table
    must only ever hold our-uploads URLs or Google OAuth URLs — anything
    else and other clients hot-linking the picture would request the
    attacker's domain on every page load.

    Post §2.7 the error code changed from 400 → 403 because the
    rejection is "you can't reference that URL," not "the input
    was malformed."
    """
    res = client.post(
        "/api/profile/update",
        headers=auth_headers,
        json={
            "picture": "https://attacker.example.com/probe.gif",
        },
    )
    assert res.status_code == 403
    assert "picture URL" in res.get_json()["error"]


def test_update_profile_picture_rejects_non_string(client, seed_user, auth_headers):
    """Non-string picture (number, object, null literal as JSON) is
    a 400 — the SQL UPDATE would otherwise silently store odd
    representations."""
    res = client.post(
        "/api/profile/update",
        headers=auth_headers,
        json={
            "picture": {"url": "https://example.com/x.jpg"},
        },
    )
    assert res.status_code == 400
    assert res.get_json()["error"] == "picture must be a string"


# ── /api/upload ──────────────────────────────────────────────────────────────


def test_upload_rejects_anonymous(client):
    """Wide-open upload was the audit's biggest find. Pin that anonymous
    requests get 401."""
    res = client.post(
        "/api/upload",
        data={
            "file": (io.BytesIO(b"hello"), "x.txt"),
        },
    )
    assert res.status_code == 401


def test_upload_rejects_disallowed_extension(client, seed_user, auth_headers):
    """Hardening: .exe / .txt / etc. fail the extension allowlist before
    even being read. Pin so a regression doesn't reopen the wide-open file
    write."""
    res = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            "file": (io.BytesIO(b"MZ\x90"), "bomb.exe"),
        },
    )
    assert res.status_code == 400


def test_upload_rejects_extension_spoofing(client, seed_user, auth_headers):
    """Hardening: an .exe renamed to .jpg still fails the magic-number
    sniff. Without this check, secure_filename would accept it as long
    as the extension was on the allowlist."""
    res = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            # 'MZ' is the .exe magic number — not a JPEG.
            "file": (io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00"), "fake.jpg"),
        },
    )
    assert res.status_code == 400


def test_upload_accepts_valid_jpeg(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    """Happy path: a real JPEG (with the FFD8FF magic prefix) saves."""
    # Redirect uploads to tmp_path so the test doesn't write into the
    # real frontend/static/uploads directory.
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    res = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            "file": (io.BytesIO(b"\xff\xd8\xff\xe0minimal-jpeg-header"), "real.jpg"),
        },
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["name"] == "real.jpg"
    assert body["url"].startswith("/static/uploads/")
    # NOTE: BUG-042 (HEIC→JPEG: convert non-RGB modes before the JPEG encode +
    # refuse-rather-than-write-raw-bytes on encode failure) has no unit test —
    # exercising it needs pillow-heif + a real HEIC fixture (the /api/upload
    # magic-byte + HEIC-support gates reject PNG-under-.heic/.jpg before the
    # conversion path). Fix verified by code review in src/routes/media.py.


def test_upload_rejects_decompression_bomb_warning_band(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    """MK6 P1 regression: an image whose pixel count sits in the 25–50M-px
    band raises PIL's DecompressionBomb*Warning* (not *Error*). Before the fix
    the handler caught only the Error, so warning-band images (e.g. a normal
    48MP phone JPEG) fell through to the bytes-verbatim save and kept their GPS
    EXIF. The handler must now reject them with 413 and write nothing.

    We shrink MAX_IMAGE_PIXELS so a tiny image lands in the warning band
    (MAX < pixels <= 2*MAX) without generating a real 30M-px file. media.py
    installs the warning-as-error filter at import, but pytest resets warnings
    filters per test, so we reinstate it (inside catch_warnings so it doesn't
    leak) to reproduce the production environment."""
    import warnings

    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))

    from PIL import Image

    # 12×12 = 144 px lands in (100, 200] → warning band (Error is > 2*MAX).
    monkeypatch.setattr(Image, 'MAX_IMAGE_PIXELS', 100)

    buf = io.BytesIO()
    Image.new('RGB', (12, 12), (10, 20, 30)).save(buf, format='JPEG')
    buf.seek(0)

    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        res = client.post(
            "/api/upload",
            headers=auth_headers,
            data={
                "file": (buf, "phonephoto.jpg"),
            },
        )
    assert res.status_code == 413, res.get_data(as_text=True)
    # Nothing should have been persisted to the upload dir.
    written = list(tmp_path.rglob("*"))
    written = [p for p in written if p.is_file()]
    assert written == [], f"bomb image must not persist; found {written}"


def test_uploads_anonymous_fetch_404s_for_private_files(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    """R2 audit fix: /static/uploads/ was being served by Flask's
    default static handler with zero auth. Now the route requires
    either a signed-in caller OR the file is referenced by a trip
    with is_public=1. Verify the anonymous-private path returns 404
    so an attacker holding a leaked URL gets nothing."""
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    # Upload while signed in.
    up = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            "file": (io.BytesIO(b"\xff\xd8\xff\xe0private-photo"), "private.jpg"),
        },
    )
    assert up.status_code == 200
    url = up.get_json()["url"]  # /static/uploads/<user>/<token>_private.jpg
    # Clear the session cookie so the next fetch is anonymous.
    client.delete_cookie("gg_session", domain="localhost")
    res = client.get(url)
    # File exists on disk, but no public-trip references it → 404.
    assert res.status_code == 404, (
        "anonymous fetch of a private upload must 404, "
        "not leak the bytes via Flask's default static handler"
    )


def test_uploads_anonymous_fetch_allowed_for_public_trip_cover(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    """A trip that is_public=1 with cover_url pointing at the upload
    MUST be readable anonymously — public /share/<token> viewers and
    /api/public-trip clients render the cover via <img> with no auth."""
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    up = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            "file": (io.BytesIO(b"\xff\xd8\xff\xe0cover"), "cover.jpg"),
        },
    )
    url = up.get_json()["url"]
    # Create a public trip that uses this cover.
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {
                "id": "trip-public-cover",
                "name": "Lisbon",
                "isPublic": True,
                "coverUrl": url,
            },
        },
    )
    client.delete_cookie("gg_session", domain="localhost")
    res = client.get(url)
    assert res.status_code == 200, (
        f"anonymous fetch of a cover from a public trip must succeed; "
        f"got {res.status_code} — public sharing renders covers via <img> with no auth"
    )


def test_uploads_owner_reads_but_authed_nonmember_404s(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
    tmp_path,
    monkeypatch,
):
    """4.8 audit PLAT-3 (core fix): the owner reads their own upload, but
    a signed-in user who is NOT the owner and NOT a member of any trip
    referencing the file gets 404. Pre-fix ANY authenticated user could
    read ANY upload (incl. expense receipts) just by holding the URL."""
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    up = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            "file": (io.BytesIO(b"\xff\xd8\xff\xe0secret"), "secret.jpg"),
        },
    )
    url = up.get_json()["url"]
    assert client.get(url, headers=auth_headers).status_code == 200, "owner must read own upload"
    res = client.get(url, headers=other_auth_headers)
    assert res.status_code == 404, "authed non-member must not read a private upload (PLAT-3)"


def test_uploads_authed_member_can_read_trip_cover(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
    tmp_path,
    monkeypatch,
):
    """PLAT-3 must not over-restrict: an accepted member of a trip that
    references the file CAN read it."""
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    up = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            "file": (io.BytesIO(b"\xff\xd8\xff\xe0cover"), "cover.jpg"),
        },
    )
    url = up.get_json()["url"]
    trip_id = "trip-plat3-member"
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": trip_id, "name": "T", "coverUrl": url},
        },
    )
    _seed_member(trip_id, seed_other_user, role="relaxer")
    res = client.get(url, headers=other_auth_headers)
    assert res.status_code == 200, "accepted member must read the trip's cover (PLAT-3)"


def test_uploads_authed_nonmember_can_read_public_trip_cover(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
    tmp_path,
    monkeypatch,
):
    """PLAT-3 must not break public covers: an authenticated NON-member
    still reads a PUBLIC trip's cover (falls through to the public check,
    same surface an anonymous viewer gets)."""
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    up = client.post(
        "/api/upload",
        headers=auth_headers,
        data={
            "file": (io.BytesIO(b"\xff\xd8\xff\xe0pubcover"), "pub.jpg"),
        },
    )
    url = up.get_json()["url"]
    client.post(
        "/api/trips",
        headers=auth_headers,
        json={
            "trip": {"id": "trip-plat3-public", "name": "Pub", "isPublic": True, "coverUrl": url},
        },
    )
    res = client.get(url, headers=other_auth_headers)
    assert res.status_code == 200, (
        "authed non-member must read a public trip's cover (PLAT-3 no regression)"
    )


# ── /api/trips/<id>/media (R11-B2-followup Phase 1A) ─────────────────────────


def test_trip_media_returns_empty_arrays_on_fresh_trip(
    client,
    seed_user,
    auth_headers,
):
    """Fresh trip — no photos/docs/marked/checklist yet → endpoint
    returns the 4 expected keys all as empty arrays. The shape is the
    contract Phase 1B will rely on; pinning it now prevents drift."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-empty")
    res = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["tripId"] == trip_id
    assert body["photos"] == []
    assert body["documents"] == []
    assert body["markedPlaces"] == []
    assert body["checklist"] == []
    # updatedAt comes from the trips row — should be a non-empty
    # ISO-ish string (the schema stores datetime strings).
    assert isinstance(body["updatedAt"], str) and body["updatedAt"]


def test_trip_media_returns_persisted_arrays(
    client,
    seed_user,
    auth_headers,
    temp_db,
):
    """Seed the 4 JSON columns directly on the trips row, then verify
    the endpoint deserializes + ships them through. Catches any future
    refactor that drops a column from the SELECT or mis-spells a key."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-full")
    # Inline-seed the heavy columns. Going through the upsertTrip
    # route would also work but adds noise — direct UPDATE is the
    # minimum repro of "column has data, fetch should return it".
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET photos_json = ?, documents_json = ?, "
            "marked_places_json = ?, checklist_json = ? WHERE id = ?",
            (
                '[{"id":"p1","url":"https://example.com/a.jpg"}]',
                '[{"id":"d1","name":"Passport","url":"https://example.com/p.pdf"}]',
                '[{"id":"m1","name":"Eiffel Tower","lat":48.85,"lng":2.29}]',
                '[{"id":"c1","body":"Charge power bank","done":false}]',
                trip_id,
            ),
        )
        conn.commit()
    res = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert len(body["photos"]) == 1 and body["photos"][0]["id"] == "p1"
    assert len(body["documents"]) == 1 and body["documents"][0]["name"] == "Passport"
    assert len(body["markedPlaces"]) == 1 and body["markedPlaces"][0]["lat"] == 48.85
    assert len(body["checklist"]) == 1 and body["checklist"][0]["body"] == "Charge power bank"


def test_trip_media_404_on_unknown_trip(client, seed_user, auth_headers):
    """Unknown trip id → 403 (no member row) before we even reach the
    SELECT — keeps the same posture as other per-trip endpoints (don't
    leak existence to non-members via 404 vs 403 distinction)."""
    res = client.get("/api/trips/does-not-exist/media", headers=auth_headers)
    assert res.status_code == 403


def test_trip_media_rejects_non_member(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """Stranger to the trip → 403. The auth gate is `trip_member_role
    is not None` — anyone without an accepted member row is rejected
    regardless of trip privacy state (same posture as the other
    per-trip routes in trips.py)."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-403")
    res = client.get(f"/api/trips/{trip_id}/media", headers=other_auth_headers)
    assert res.status_code == 403


def test_trip_media_null_cells_return_empty_arrays(
    client,
    seed_user,
    auth_headers,
    temp_db,
):
    """The schema enforces `json_valid()` CHECK constraints so a
    truly-corrupt cell can't reach disk via a normal path — but NULL
    is permitted and is the common state for a fresh trip. The
    endpoint's `_safe_arr` falls back to [] on NULL; if a future
    schema change drops the constraint, the same fallback also covers
    a corrupt cell. Pinning the NULL→[] case keeps the contract."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-null")
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET photos_json = NULL, documents_json = NULL, "
            "marked_places_json = NULL, checklist_json = NULL WHERE id = ?",
            (trip_id,),
        )
        conn.commit()
    res = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["photos"] == []
    assert body["documents"] == []
    assert body["markedPlaces"] == []
    assert body["checklist"] == []


# ── POST /api/trips/<id>/media (R12-B4 write path) ───────────────────────────


def test_trip_media_post_writes_each_field(client, seed_user, auth_headers):
    """R12-B4: POST /media writes the four heavy fields; GET reads them
    back. The round-trip is the core of the dedicated write path that
    replaces routing media through upsert_trip."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-write")
    res = client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "photos": [{"id": "p1", "url": "https://example.com/a.jpg"}],
            "documents": [{"id": "d1", "name": "Passport"}],
            "markedPlaces": [{"id": "m1", "name": "Eiffel"}],
            "checklist": [{"id": "c1", "body": "Pack", "done": False}],
        },
    )
    assert res.status_code == 200
    got = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert got["photos"][0]["id"] == "p1"
    assert got["documents"][0]["name"] == "Passport"
    assert got["markedPlaces"][0]["name"] == "Eiffel"
    assert got["checklist"][0]["body"] == "Pack"


def test_trip_media_post_partial_leaves_other_fields_untouched(
    client,
    seed_user,
    auth_headers,
):
    """R12-B4: a POST carrying only `photos` must NOT zero the other
    three columns. This is the per-field-isolation guarantee that makes
    the design wipe-proof — a write to one media field can't clobber a
    sibling."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-partial")
    # Seed all four.
    client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "photos": [{"id": "p1"}],
            "documents": [{"id": "d1"}],
            "markedPlaces": [{"id": "m1"}],
            "checklist": [{"id": "c1"}],
        },
    )
    # Now POST only photos (a new value).
    client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "photos": [{"id": "p1"}, {"id": "p2"}],
        },
    )
    got = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert len(got["photos"]) == 2, "photos updated"
    # The other three are untouched (NOT zeroed).
    assert got["documents"] == [{"id": "d1"}]
    assert got["markedPlaces"] == [{"id": "m1"}]
    assert got["checklist"] == [{"id": "c1"}]


def test_trip_media_post_rejects_non_array(client, seed_user, auth_headers):
    """R12-B4: a non-array media field is a 400 — the column stores a
    JSON array and the JSON1 CHECK would otherwise reject malformed
    writes at the DB layer with a 500."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-badtype")
    res = client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "photos": "not-an-array",
        },
    )
    assert res.status_code == 400


def test_trip_media_post_rejects_non_member(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R12-B4: planner-gated write. A stranger to the trip → 403."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-write-403")
    res = client.post(
        f"/api/trips/{trip_id}/media",
        headers=other_auth_headers,
        json={
            "photos": [{"id": "x"}],
        },
    )
    assert res.status_code == 403


def test_trip_media_version_token_concurrency(client, seed_user, auth_headers):
    """4.8 audit TRIP-4: /media is version-gated (media_updated_at), so two
    warm devices editing the same trip's media detect the conflict instead
    of silently last-write-wins. GET returns mediaUpdatedAt; a write with a
    STALE clientMediaUpdatedAt 409s with the live media + version (and does
    NOT apply); a write with the CURRENT version — or no token at all (the
    offline-replay / legacy force path) — succeeds."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-mediaver")
    # First write (no token) establishes a version + returns it.
    r1 = client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "checklist": [{"id": "a"}],
        },
    )
    assert r1.status_code == 200
    v1 = r1.get_json()["mediaUpdatedAt"]
    assert v1, "media write must return a version stamp"
    # GET echoes the same version.
    g = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert g["mediaUpdatedAt"] == v1
    # A write with a clearly-STALE token → 409 with live media + version,
    # and the stale write's content is NOT applied.
    r_stale = client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "checklist": [{"id": "STALE"}],
            "clientMediaUpdatedAt": "1999-01-01 00:00:00.000",
        },
    )
    assert r_stale.status_code == 409, r_stale.get_data(as_text=True)
    conflict = r_stale.get_json()
    assert conflict["mediaUpdatedAt"] == v1
    assert {i["id"] for i in conflict["current"]["checklist"]} == {"a"}, (
        "409 must echo the live (un-clobbered) media"
    )
    # A write with the CURRENT version succeeds.
    r_ok = client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "checklist": [{"id": "a"}, {"id": "b"}],
            "clientMediaUpdatedAt": v1,
        },
    )
    assert r_ok.status_code == 200
    # A write with NO token (offline replay / legacy force path) still
    # succeeds regardless of the current version.
    r_force = client.post(
        f"/api/trips/{trip_id}/media",
        headers=auth_headers,
        json={
            "checklist": [{"id": "z"}],
        },
    )
    assert r_force.status_code == 200
    final = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers).get_json()
    assert {i["id"] for i in final["checklist"]} == {"z"}


def test_trip_media_works_for_archived_trip(
    client,
    seed_user,
    auth_headers,
):
    """R12-B2: /api/trips/<id>/media must still serve an ARCHIVED trip
    — the auth gate is trip_member_role (which doesn't care about
    archive state), but no test covered the archived path. Archive the
    trip, then confirm the media endpoint still returns its persisted
    arrays."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-archived")
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET photos_json = ? WHERE id = ?",
            ('[{"id":"p1","url":"https://example.com/a.jpg"}]', trip_id),
        )
        conn.commit()
    client.post(f"/api/trips/{trip_id}/archive", headers=auth_headers)
    res = client.get(f"/api/trips/{trip_id}/media", headers=auth_headers)
    assert res.status_code == 200
    assert res.get_json()["photos"][0]["id"] == "p1"


def test_trip_media_works_for_budgeteer_role(
    client,
    seed_user,
    seed_other_user,
    auth_headers,
    other_auth_headers,
):
    """R12-B2: the /media auth gate accepts ANY accepted member role,
    not just planner. Pin the BUDGETEER role explicitly — seed_user
    invites seed_other as a budgeteer, who accepts, then reads /media.
    Previously only non-member (403) + owner (transitively planner)
    were covered."""
    _befriend(client, auth_headers, other_auth_headers, seed_user, seed_other_user)
    trip_id = _create_trip(client, auth_headers, trip_id="trip-media-budgeteer")
    client.post(
        "/api/trips/invite",
        headers=auth_headers,
        json={
            "trip_id": trip_id,
            "target_user_id": seed_other_user,
            "role": "budgeteer",
        },
    )
    client.post(
        "/api/trips/invite/respond",
        headers=other_auth_headers,
        json={
            "trip_id": trip_id,
            "accept": True,
        },
    )
    # Budgeteer reads media — must succeed (200), not 403.
    res = client.get(f"/api/trips/{trip_id}/media", headers=other_auth_headers)
    assert res.status_code == 200
    body = res.get_json()
    assert body["tripId"] == trip_id
    assert body["photos"] == []


def test_upload_preserves_animated_webp(client, seed_user, auth_headers, tmp_path, monkeypatch):
    """MK6 P3: an animated WebP must keep all its frames — the single-frame PIL
    re-encode was flattening it to frame 0 (frozen for every viewer)."""
    import main as main_module

    monkeypatch.setitem(main_module.app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setattr(main_module, 'UPLOAD_FOLDER', str(tmp_path))
    from PIL import Image

    frames = [Image.new("RGB", (16, 16), c) for c in ((255, 0, 0), (0, 255, 0), (0, 0, 255))]
    buf = io.BytesIO()
    frames[0].save(
        buf, format="WEBP", save_all=True, append_images=frames[1:], duration=100, loop=0
    )
    buf.seek(0)
    res = client.post("/api/upload", headers=auth_headers, data={"file": (buf, "anim.webp")})
    assert res.status_code == 200, res.get_data(as_text=True)
    saved_files = list(tmp_path.rglob("*.webp"))
    assert saved_files, "no .webp file was written"
    saved = Image.open(saved_files[0])
    assert getattr(saved, "is_animated", False), "animated WebP was flattened to a single frame"
    assert saved.n_frames == 3
