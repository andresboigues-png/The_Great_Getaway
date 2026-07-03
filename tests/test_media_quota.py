"""MK6 Wave 18 — per-user upload storage quota + orphan reclaim (media.py).

Contracts pinned here:
  * /api/upload returns 507 once a user's on-disk uploads would exceed the
    per-user byte cap (`_UPLOAD_QUOTA_BYTES`), and the JSON reports the cap +
    current usage.
  * When over quota, the handler first reclaims GENUINELY-orphaned files
    (older than the grace window AND referenced by no DB row) before giving
    up — a referenced file is NEVER deleted, an in-grace file is NEVER
    deleted, and if the reclaim frees enough the upload succeeds.
  * `_url_is_referenced` recognises EVERY column that can hold an upload URL.
    The last test locks that surface so a newly-added upload column trips a
    loud failure instead of silently letting the sweep delete live files.
"""

import io
import json
import os
import time

import routes.media as media
from tests.conftest import _create_trip


def _jpeg(nbytes: int) -> io.BytesIO:
    """A byte blob that passes the magic-number sniff (JPEG prefix) but is
    not a decodable image, so the handler saves it verbatim — making the
    on-disk size exactly `nbytes` (predictable for quota arithmetic)."""
    assert nbytes >= 4
    return io.BytesIO(b"\xff\xd8\xff\xe0" + b"A" * (nbytes - 4))


def _use_tmp_uploads(monkeypatch, tmp_path):
    import main as main_module

    monkeypatch.setitem(main_module.app.config, "UPLOAD_FOLDER", str(tmp_path))
    monkeypatch.setattr(main_module, "UPLOAD_FOLDER", str(tmp_path))


def _upload(client, headers, name, nbytes):
    return client.post(
        "/api/upload",
        headers=headers,
        data={
            "file": (_jpeg(nbytes), name),
        },
    )


def _disk_path(tmp_path, url):
    # /static/uploads/<owner>/<file> → <tmp_path>/<owner>/<file>
    return tmp_path / url.split("/static/uploads/", 1)[1]


# ── quota enforcement ────────────────────────────────────────────────────
def test_upload_over_quota_returns_507(client, seed_user, auth_headers, tmp_path, monkeypatch):
    _use_tmp_uploads(monkeypatch, tmp_path)
    monkeypatch.setattr(media, "_UPLOAD_QUOTA_BYTES", 100)

    # Two 40-byte files fit (80 ≤ 100); the third would push to 120 > 100.
    # All three are fresh, so the reclaim finds nothing and we 507.
    assert _upload(client, auth_headers, "a.jpg", 40).status_code == 200
    assert _upload(client, auth_headers, "b.jpg", 40).status_code == 200
    over = _upload(client, auth_headers, "c.jpg", 40)
    assert over.status_code == 507, over.get_data(as_text=True)
    body = over.get_json()
    assert body["quotaBytes"] == 100
    assert body["usedBytes"] == 80
    # The rejected file must NOT have been written.
    assert not (tmp_path / "test-user-1" / "c.jpg").exists()


def test_upload_under_quota_succeeds(client, seed_user, auth_headers, tmp_path, monkeypatch):
    _use_tmp_uploads(monkeypatch, tmp_path)
    monkeypatch.setattr(media, "_UPLOAD_QUOTA_BYTES", 10_000)
    r = _upload(client, auth_headers, "ok.jpg", 40)
    assert r.status_code == 200, r.get_data(as_text=True)


# ── orphan reclaim ───────────────────────────────────────────────────────
def _age(path, seconds_ago):
    old = time.time() - seconds_ago
    os.utime(path, (old, old))


def test_orphan_reclaim_frees_space_but_spares_referenced(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    _use_tmp_uploads(monkeypatch, tmp_path)

    trip_id = _create_trip(client, auth_headers, trip_id="trip-quota")

    # Upload a file we'll REFERENCE and one we'll leave orphaned.
    url_keep = _upload(client, auth_headers, "keep.jpg", 40).get_json()["url"]
    url_orphan = _upload(client, auth_headers, "orphan.jpg", 40).get_json()["url"]

    # Reference keep.jpg from the trip's photos_json.
    from database import get_db

    with get_db() as conn:
        conn.execute(
            "UPDATE trips SET photos_json = ? WHERE id = ?",
            (json.dumps([{"id": "p1", "src": url_keep, "dayId": None}]), trip_id),
        )
        conn.commit()

    # Age BOTH past the 24h grace so they're reclaim-eligible by age.
    keep_disk = _disk_path(tmp_path, url_keep)
    orphan_disk = _disk_path(tmp_path, url_orphan)
    _age(keep_disk, 25 * 3600)
    _age(orphan_disk, 25 * 3600)

    # Cap so a 3rd upload (80 used + 40 incoming = 120) trips reclaim; after
    # freeing the 40-byte orphan (→ 40 used) the 40-byte probe fits (≤ 110).
    monkeypatch.setattr(media, "_UPLOAD_QUOTA_BYTES", 110)
    probe = _upload(client, auth_headers, "probe.jpg", 40)
    assert probe.status_code == 200, probe.get_data(as_text=True)

    assert keep_disk.is_file(), "referenced file must survive the reclaim"
    assert not orphan_disk.exists(), "aged, unreferenced file must be reclaimed"
    assert _disk_path(tmp_path, probe.get_json()["url"]).is_file()


def test_reclaim_spares_in_grace_orphans(
    client,
    seed_user,
    auth_headers,
    tmp_path,
    monkeypatch,
):
    """A brand-new unreferenced upload (inside the grace window) must NOT be
    swept — the client is about to persist its URL into a trip."""
    _use_tmp_uploads(monkeypatch, tmp_path)
    url_fresh = _upload(client, auth_headers, "fresh.jpg", 40).get_json()["url"]
    fresh_disk = _disk_path(tmp_path, url_fresh)

    # Force a reclaim pass by going over quota; fresh.jpg is unreferenced but
    # young, so it survives and the new upload is refused.
    monkeypatch.setattr(media, "_UPLOAD_QUOTA_BYTES", 50)
    blocked = _upload(client, auth_headers, "next.jpg", 40)
    assert blocked.status_code == 507
    assert fresh_disk.is_file(), "in-grace orphan must not be reclaimed"


# ── reference-surface guard ──────────────────────────────────────────────
def test_url_is_referenced_covers_every_upload_column(
    client,
    seed_user,
    auth_headers,
    tmp_path,
):
    """Lock the full set of columns that can hold an upload URL. If a new
    upload-bearing column is added and NOT wired into `_url_is_referenced`,
    the matching assertion here fails — catching the data-loss regression
    (orphan sweep deleting a live file) before it ships."""
    trip_id = _create_trip(client, auth_headers, trip_id="trip-ref")
    from database import get_db

    def esc(url):
        e = url.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return "%" + e + "%"

    base = "/static/uploads/test-user-1/"
    cases = {
        "users.picture": ("UPDATE users SET picture = ? WHERE id = ?", "test-user-1"),
        "trips.cover_url": ("UPDATE trips SET cover_url = ? WHERE id = ?", trip_id),
        "trips.photos_json": ("UPDATE trips SET photos_json = ? WHERE id = ?", trip_id),
        "trips.documents_json": ("UPDATE trips SET documents_json = ? WHERE id = ?", trip_id),
        "trips.marked_places_json": (
            "UPDATE trips SET marked_places_json = ? WHERE id = ?",
            trip_id,
        ),
        "trips.companions_json": ("UPDATE trips SET companions_json = ? WHERE id = ?", trip_id),
        "trips.checklist_json": ("UPDATE trips SET checklist_json = ? WHERE id = ?", trip_id),
    }

    with get_db() as conn:
        cur = conn.cursor()
        for col, (sql, key) in cases.items():
            url = base + col.replace(".", "_") + ".jpg"
            # cover_url / picture hold the bare URL; the *_json columns embed
            # it in a JSON blob.
            stored = (
                url if col in ("users.picture", "trips.cover_url") else json.dumps([{"src": url}])
            )
            cur.execute(sql, (stored, key))
            conn.commit()
            assert media._url_is_referenced(cur, url, esc(url)), f"{col} not recognised"

        # trip_days.photos + trip_days.documents (per-day media).
        for i, col in enumerate(("photos", "documents")):
            url = base + f"trip_days_{col}.jpg"
            cur.execute(
                f"INSERT INTO trip_days (id, trip_id, {col}) VALUES (?, ?, ?)",
                (f"d-{i}", trip_id, json.dumps([{"src": url}])),
            )
            conn.commit()
            assert media._url_is_referenced(cur, url, esc(url)), f"trip_days.{col} not recognised"

        # expenses.receipt_url.
        url = base + "receipt.jpg"
        cur.execute(
            "INSERT INTO expenses (id, trip_id, receipt_url) VALUES (?, ?, ?)",
            ("e-1", trip_id, url),
        )
        conn.commit()
        assert media._url_is_referenced(cur, url, esc(url)), "expenses.receipt_url not recognised"

        # A URL referenced nowhere must read as unreferenced.
        ghost = base + "nobody-references-this.jpg"
        assert not media._url_is_referenced(cur, ghost, esc(ghost))
