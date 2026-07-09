"""MK1 Wave C (T1-5) — server-side image variants (thumb/display).

Contracts pinned here:
  * a static-image upload derives `_variants/<name>.thumb<ext>` +
    `.display<ext>` (skipped when the original is already smaller than
    the target edge);
  * GET /static/uploads/...?size=thumb serves the (smaller) variant,
    ?size on a file with no variant (PDF, small original, unknown size
    value) falls back to the original — same ACL either way;
  * animated images get NO variants (a frame-0 thumb would kill the
    animation);
  * deleting the original (helpers.delete_upload_files) removes its
    variants; the orphan sweep does the same;
  * variants do NOT count against the Wave-18 storage quota.
"""

import io
import os

from PIL import Image

import routes.media as media


def _use_tmp_uploads(monkeypatch, tmp_path):
    import main as main_module

    monkeypatch.setitem(main_module.app.config, "UPLOAD_FOLDER", str(tmp_path))
    monkeypatch.setattr(main_module, "UPLOAD_FOLDER", str(tmp_path))


def _real_jpeg(width, height, color=(200, 60, 40)) -> io.BytesIO:
    im = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    im.save(buf, format="JPEG")
    buf.seek(0)
    return buf


def _upload(client, headers, name, blob):
    res = client.post("/api/upload", headers=headers, data={"file": (blob, name)})
    assert res.status_code == 200, res.get_data(as_text=True)
    return res.get_json()["url"]


def test_large_upload_gets_both_variants_and_size_param_serves_them(
    client, seed_user, auth_headers, tmp_path, monkeypatch
):
    _use_tmp_uploads(monkeypatch, tmp_path)
    url = _upload(client, auth_headers, "big.jpg", _real_jpeg(2400, 1800))
    name = url.rsplit("/", 1)[-1]
    vdir = tmp_path / "test-user-1" / "_variants"
    assert (vdir / f"{name}.thumb.jpg").is_file()
    assert (vdir / f"{name}.display.jpg").is_file()

    original = client.get(url, headers=auth_headers)
    thumb = client.get(url + "?size=thumb", headers=auth_headers)
    display = client.get(url + "?size=display", headers=auth_headers)
    assert original.status_code == thumb.status_code == display.status_code == 200
    assert len(thumb.data) < len(display.data) < len(original.data)
    with Image.open(io.BytesIO(thumb.data)) as im:
        assert max(im.size) <= 320
    with Image.open(io.BytesIO(display.data)) as im:
        assert max(im.size) <= 1600


def test_small_upload_skips_variants_and_size_falls_back(
    client, seed_user, auth_headers, tmp_path, monkeypatch
):
    _use_tmp_uploads(monkeypatch, tmp_path)
    url = _upload(client, auth_headers, "small.jpg", _real_jpeg(200, 150))
    name = url.rsplit("/", 1)[-1]
    assert not (tmp_path / "test-user-1" / "_variants" / f"{name}.thumb.jpg").exists()
    res = client.get(url + "?size=thumb", headers=auth_headers)
    assert res.status_code == 200
    assert res.data == client.get(url, headers=auth_headers).data, (
        "?size on a variant-less file serves the original"
    )
    # Unknown size values are ignored, not 400s (defensive contract).
    assert client.get(url + "?size=huge", headers=auth_headers).status_code == 200


def test_animated_gif_gets_static_thumb_but_no_display(
    client, seed_user, auth_headers, tmp_path, monkeypatch
):
    """D1-I4: an animated GIF/WebP gets a STATIC frame-0 `thumb` (so the
    grid stops downloading the whole animation to paint a tile) but NO
    `display` variant — the lightbox requests ?size=display, which falls
    back to the original animated file, so the animation still plays."""
    _use_tmp_uploads(monkeypatch, tmp_path)
    frames = [Image.new("RGB", (900, 900), c) for c in ((255, 0, 0), (0, 0, 255))]
    buf = io.BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=200)
    buf.seek(0)
    url = _upload(client, auth_headers, "anim.gif", buf)
    name = url.rsplit("/", 1)[-1]
    vdir = tmp_path / "test-user-1" / "_variants"
    # A static, downscaled thumb exists...
    assert (vdir / f"{name}.thumb.gif").is_file()
    with Image.open(vdir / f"{name}.thumb.gif") as im:
        assert max(im.size) <= 320
        assert not getattr(im, "is_animated", False), "thumb must be a single static frame"
    # ...but the display variant is deliberately absent so the lightbox
    # keeps the animation (it falls back to the original animated file).
    assert not (vdir / f"{name}.display.gif").exists()
    display = client.get(url + "?size=display", headers=auth_headers)
    original = client.get(url, headers=auth_headers)
    assert display.data == original.data, "?size=display on an animated image serves the original"
    with Image.open(io.BytesIO(display.data)) as im:
        assert getattr(im, "is_animated", False), "lightbox still gets the animation"


def test_delete_upload_files_removes_variants(
    client, seed_user, auth_headers, tmp_path, monkeypatch
):
    _use_tmp_uploads(monkeypatch, tmp_path)
    url = _upload(client, auth_headers, "gone.jpg", _real_jpeg(2400, 1800))
    name = url.rsplit("/", 1)[-1]
    vdir = tmp_path / "test-user-1" / "_variants"
    assert (vdir / f"{name}.thumb.jpg").is_file()

    import main as main_module
    from helpers import delete_upload_files

    with main_module.app.app_context():
        removed = delete_upload_files([url], "test-user-1")
    assert removed == 1
    assert not (vdir / f"{name}.thumb.jpg").exists()
    assert not (vdir / f"{name}.display.jpg").exists()


def test_variants_do_not_count_against_quota(
    client, seed_user, auth_headers, tmp_path, monkeypatch
):
    _use_tmp_uploads(monkeypatch, tmp_path)
    _upload(client, auth_headers, "counted.jpg", _real_jpeg(2400, 1800))
    user_dir = str(tmp_path / "test-user-1")
    counted = media._user_dir_bytes(user_dir)
    on_disk_originals = sum(
        e.stat().st_size for e in os.scandir(user_dir) if e.is_file(follow_symlinks=False)
    )
    assert counted == on_disk_originals, "quota counts only top-level files, not _variants/"
    vdir = os.path.join(user_dir, "_variants")
    assert os.path.isdir(vdir) and os.listdir(vdir), "variants exist but are quota-exempt"
