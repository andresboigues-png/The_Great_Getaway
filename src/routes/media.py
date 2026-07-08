"""/api/upload — file uploads (photos + documents).

Hardened in three layers:
  1. Auth (@require_auth) — JWT-gated; anonymous traffic gets 401.
  2. Extension allowlist — only image / PDF extensions are saved.
     `secure_filename` strips path traversal but does NOT validate the
     extension, so `bomb.exe` would be accepted before this gate.
  3. MIME sniff — the file's first 16 bytes are checked against known
     magic numbers, so renaming `bomb.exe` to `bomb.jpg` still fails.

Size is bounded by `app.config['MAX_CONTENT_LENGTH']` (10 MB). Flask
refuses bigger uploads with 413 before this handler runs.

Constants live at module level here (no longer in main.py) so the
blueprint is self-contained — adding a new accepted format is a
one-file edit.
"""

import os
import secrets
import time

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from auth import current_user_id, require_auth
from database import get_db
from extensions import limiter

# R3-Round 4 fix: register pillow-heif at import time so PIL.Image
# can open HEIC/HEIF files (iPhone "Most Compatible" off default).
# Without this, HEIC bytes-verbatim saved AND retained EXIF/GPS.
# Module-level so the registration happens once per worker boot
# (registering on every request is a wasted no-op + small CPU hit).
# Optional: if the dep isn't installed (older deploy or build
# environment without libheif), HEIC uploads continue to fall
# through to the explicit-reject branch from R3-Round 3 B1 with
# the "switch to JPEG" message.
try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    _HEIF_AVAILABLE = True
except Exception:
    _HEIF_AVAILABLE = False

# R4-B3: hoist the decompression-bomb defenses out of the request
# handler. `Image.MAX_IMAGE_PIXELS` and `warnings.simplefilter` BOTH
# mutate process-wide state — running them inside the handler meant
# they leaked into every other Pillow caller across the worker (PDF
# builder, test helpers, any background script). Doing it once at
# module import time gives the same protection without the leak.
try:
    import warnings as _warnings

    from PIL import Image as _PILImageBootstrap

    # 25M px ≈ 5000×5000 — generous for any phone camera, tight enough
    # to refuse a 30k×30k bomb (~3.6GB raw pixels). The default ~178M
    # px PIL ships with is too loose for a public upload surface.
    _PILImageBootstrap.MAX_IMAGE_PIXELS = 25_000_000
    # Convert the WARNING into an exception so the upload handler can
    # actually catch + reject the bomb instead of silently logging.
    _warnings.simplefilter('error', _PILImageBootstrap.DecompressionBombWarning)
except Exception:
    # Pillow missing at boot is a fatal config error in prod, but
    # don't crash test imports that mock it out.
    pass


bp = Blueprint("media", __name__)

ALLOWED_UPLOAD_EXTENSIONS = {
    # images
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.heic',
    '.heif',
    # documents (trip tickets, bookings)
    '.pdf',
}

# HEIF/HEIC ftyp box brands we accept. The full list per ISO/IEC 23008-12
# and ISO/IEC 14496-12. Anything else (e.g. avif via av01) is rejected
# until we explicitly opt in — keeps the surface area small.
_HEIF_BRANDS = (
    b'heic',
    b'heix',
    b'hevc',
    b'hevx',
    b'heim',
    b'heis',
    b'hevm',
    b'hevs',
    b'mif1',
    b'msf1',
)

# Simple-prefix magic numbers for the formats whose first bytes are
# uniquely diagnostic. JPEG / PNG / GIF / PDF all live here. WebP and
# HEIC/HEIF are NOT simple prefixes — see _looks_like_upload below
# for the structural checks they need.
_SIMPLE_PREFIX_SIGNATURES = (
    b'\xff\xd8\xff',  # JPEG
    b'\x89PNG\r\n\x1a\n',  # PNG
    b'GIF87a',
    b'GIF89a',  # GIF
    b'%PDF-',  # PDF
)


def _looks_like_upload(head: bytes) -> bool:
    """FIXING_ROADMAP §1.11: tighten HEIC + WebP magic-number checks.

    Pre-fix, the HEIC check was the 3-byte prefix `\\x00\\x00\\x00`,
    which matches literally any file whose first three bytes are NUL
    (ELF binaries, Mach-O headers, crafted polyglots). Combined with
    same-origin static serving at `/static/uploads/<file>`, a polyglot
    `HEIC + HTML` file could have been loaded as XSS by hitting its
    URL directly. WebP had the same issue: the previous `RIFF` prefix
    matches WAV and AVI containers too.

    The correct shape:
      - WebP: `RIFF` + 4-byte length + `WEBP` (at offset 8-12).
      - HEIF/HEIC: bytes 4-8 = `ftyp`, bytes 8-12 = an allowed brand
        (heic / heix / hevc / mif1 / etc.).
    """
    if any(head.startswith(sig) for sig in _SIMPLE_PREFIX_SIGNATURES):
        return True
    # WebP — RIFF header + WEBP marker at offset 8.
    if len(head) >= 12 and head.startswith(b'RIFF') and head[8:12] == b'WEBP':
        return True
    # HEIF/HEIC — ftyp box at offset 4 + recognised brand at offset 8.
    if len(head) >= 12 and head[4:8] == b'ftyp' and head[8:12] in _HEIF_BRANDS:
        return True
    return False


# ── MK6 upload storage quota ────────────────────────────────────────────
# Per-user byte cap on the uploads directory. Pre-fix there was no ceiling:
# a single account could fill PA's disk (shared, single small volume) with
# unbounded 10 MB uploads and take the whole app down for everyone. 500 MB
# is ~50 max-size files — generous for a real trip's photos/receipts, tight
# enough to bound the blast radius. Env-overridable so PA / tests can tune
# it (tests set a tiny cap to exercise the 507 path).
_UPLOAD_QUOTA_BYTES = int(os.getenv("GG_UPLOAD_QUOTA_BYTES", str(500 * 1024 * 1024)))

# ── MK1 Wave C (T1-5): server-side image variants ──────────────────────
# Every static-image upload gets two downscaled siblings so the app stops
# shipping 10 MB originals to galleries and cards. Variants live in a
# `_variants/` SUBDIR of the user's upload dir:
#     /static/uploads/<user>/_variants/<original-name>.<label><ext>
# That placement is deliberate:
#   * the Wave-18 quota (`_user_dir_bytes`) scandirs FILES only — variants
#     don't count against the user's byte quota (they're our optimization,
#     not their content);
#   * the orphan sweep iterates files only, so a variant is never swept as
#     its own orphan — it's removed WITH its original (see
#     `_remove_variants`, called from the sweep + helpers.delete_upload_files);
#   * serve_upload's ACL runs on the ORIGINAL path; `?size=` resolves the
#     variant AFTER the gate, so variants inherit exactly the original's
#     access control.
# Animated images (GIF / animated WebP) get NO variants — a static
# thumbnail of frame 0 would silently kill the animation; they serve the
# original at every size. PDFs are skipped entirely.
_VARIANT_DIR = "_variants"
_VARIANT_SIZES = {"thumb": 320, "display": 1600}
_VARIANT_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}


def _variant_rel(name: str, label: str) -> str:
    """Variant filename for an original basename: <name>.<label><ext>."""
    ext = os.path.splitext(name)[1].lower()
    return f"{name}.{label}{ext}"


def _generate_variants(out_path: str, user_folder: str) -> None:
    """Best-effort derivation of the thumb/display variants from the
    file that landed on disk. The saved original is already EXIF-stripped
    and orientation-baked on the PIL path; on the rare bytes-verbatim
    fallback path, the re-encode here drops EXIF by default, so a variant
    never carries GPS the original path was trying to strip."""
    name = os.path.basename(out_path)
    ext = os.path.splitext(name)[1].lower()
    if ext not in _VARIANT_EXTENSIONS:
        return
    try:
        from PIL import Image

        with Image.open(out_path) as img:
            if getattr(img, "is_animated", False):
                return
            img.load()
            fmt = img.format
            icc = img.info.get("icc_profile") if hasattr(img, "info") else None
            vdir = os.path.join(user_folder, _VARIANT_DIR)
            os.makedirs(vdir, exist_ok=True)
            for label, edge in _VARIANT_SIZES.items():
                if max(img.size) <= edge:
                    # Original is already at/below this size — serving it
                    # directly is both correct and cheaper than a re-encode.
                    continue
                copy = img.copy()
                copy.thumbnail((edge, edge), Image.LANCZOS)
                save_kwargs = {}
                if fmt in ("JPEG", "WEBP"):
                    save_kwargs["quality"] = 82
                if icc:
                    save_kwargs["icc_profile"] = icc
                if fmt == "JPEG" and copy.mode not in ("RGB", "L"):
                    copy = copy.convert("RGB")
                copy.save(os.path.join(vdir, _variant_rel(name, label)), format=fmt, **save_kwargs)
    except Exception:
        # Never fail an upload over an optimization.
        pass


def _remove_variants(user_folder: str, name: str) -> None:
    """Delete the variants belonging to original `name` (used when the
    original is deleted or swept as an orphan)."""
    vdir = os.path.join(user_folder, _VARIANT_DIR)
    for label in _VARIANT_SIZES:
        try:
            os.remove(os.path.join(vdir, _variant_rel(name, label)))
        except OSError:
            pass


# Only reclaim files OLDER than this. A file uploaded seconds ago has a
# valid URL the client is about to persist into a trip (photos_json /
# receipt / avatar) via a follow-up /api/sync — sweeping it in that window
# would break the pending reference. A day-old file with no DB reference is
# a genuinely abandoned upload (the save happened long ago, or never came).
_ORPHAN_GRACE_SECONDS = 24 * 3600


def _user_dir_bytes(user_folder: str) -> int:
    """Total bytes of regular files directly under the user's upload dir.
    Uploads are flat per-user (no nesting), so a single listdir suffices."""
    total = 0
    try:
        with os.scandir(user_folder) as it:
            for entry in it:
                try:
                    if entry.is_file(follow_symlinks=False):
                        total += entry.stat(follow_symlinks=False).st_size
                except OSError:
                    continue  # racing delete / vanished file — ignore
    except FileNotFoundError:
        return 0
    return total


def _incoming_size(file_storage) -> int:
    """Byte length of the pending upload, read from the stream (browsers
    routinely omit a per-part Content-Length, so `file.content_length` is
    unreliable). Rewinds to 0 afterwards so the save path reads from the
    start."""
    stream = file_storage.stream
    try:
        stream.seek(0, os.SEEK_END)
        size = stream.tell()
    except (OSError, ValueError):
        size = 0
    finally:
        try:
            stream.seek(0)
        except (OSError, ValueError):
            pass
    return size


def _reclaim_orphan_bytes(safe_user_dir: str, user_folder: str) -> int:
    """Best-effort disk reclaim for a user who is over quota: delete files
    older than the grace period that NO DB row references, and return the
    bytes freed.

    Correctness hinges on covering EVERY column that can hold an upload URL
    — miss one and we delete a live photo/receipt/avatar (silent data
    loss). The full surface as of MK6:
      users.picture (avatar); trips.cover_url + photos_json + documents_json
      + marked_places_json + companions_json + checklist_json;
      trip_days.photos + trip_days.documents; expenses.receipt_url.
    (companions / feed_posts / trip_templates hold no upload URLs — the
    former have none, templates pre-strip media at creation.) test_media_
    quota.py locks each of these so a newly-added upload column trips a
    loud test failure instead of quiet deletion. The needle is the FULL
    per-file URL, whose 132-bit random salt makes a substring match
    definitive; underscores are ESCAPEd so a filename char can't act as a
    LIKE wildcard.
    """
    cutoff = time.time() - _ORPHAN_GRACE_SECONDS
    reclaimed = 0
    try:
        names = [e.name for e in os.scandir(user_folder) if e.is_file(follow_symlinks=False)]
    except FileNotFoundError:
        return 0

    with get_db() as conn:
        cur = conn.cursor()
        for name in names:
            path = os.path.join(user_folder, name)
            try:
                st = os.stat(path)
            except OSError:
                continue
            if st.st_mtime > cutoff:
                continue  # inside the grace window — never touch
            url = f"/static/uploads/{safe_user_dir}/{name}"
            like = "%" + url.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            if _url_is_referenced(cur, url, like):
                continue
            try:
                os.remove(path)
                reclaimed += st.st_size
            except OSError:
                continue
            # Wave C: an orphaned original takes its variants with it
            # (they're excluded from the sweep's own file listing).
            _remove_variants(user_folder, name)
    return reclaimed


def _url_is_referenced(cur, url: str, like: str) -> bool:
    """True if `url` appears in any upload-bearing column. Exact-match the
    single-URL columns; LIKE (ESCAPE '\\') the JSON blobs that embed it."""
    checks = (
        ("SELECT 1 FROM users WHERE picture = ? LIMIT 1", (url,)),
        (
            "SELECT 1 FROM trips WHERE cover_url = ? "
            "OR photos_json LIKE ? ESCAPE '\\' "
            "OR documents_json LIKE ? ESCAPE '\\' "
            "OR marked_places_json LIKE ? ESCAPE '\\' "
            "OR companions_json LIKE ? ESCAPE '\\' "
            "OR checklist_json LIKE ? ESCAPE '\\' LIMIT 1",
            (url, like, like, like, like, like),
        ),
        (
            "SELECT 1 FROM trip_days WHERE photos LIKE ? ESCAPE '\\' "
            "OR documents LIKE ? ESCAPE '\\' LIMIT 1",
            (like, like),
        ),
        ("SELECT 1 FROM expenses WHERE receipt_url = ? LIMIT 1", (url,)),
    )
    for sql, params in checks:
        cur.execute(sql, params)
        if cur.fetchone():
            return True
    return False


@bp.route("/api/upload", methods=["POST"])
@limiter.limit("30 per minute")
@require_auth
def upload_file():
    # FIXING_ROADMAP §2.7 — uploads now land in a per-user
    # subdirectory so ownership is encoded in the path. The profile-
    # update validator in routes/settings.py rejects picture URLs
    # whose subdir doesn't match the caller's user_id, blocking the
    # "use another user's upload as my profile pic" abuse vector.
    user_id = current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    # Extension allowlist
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        return jsonify({"error": f"Unsupported file type: {ext}"}), 400

    # Magic-number sniff. Read the first 16 bytes, then rewind so
    # .save() writes the full file from offset 0. The structural
    # checks (HEIC ftyp brand, WebP marker) live in _looks_like_upload.
    head = file.stream.read(16)
    file.stream.seek(0)
    if not _looks_like_upload(head):
        return jsonify({"error": "File contents don't match expected format"}), 400

    filename = secure_filename(file.filename)
    # Audit fix (2026-05-26): the previous scheme produced
    # ENUMERABLE filenames — `{int(time.time())}_{secure_filename}`.
    # Two uploads in the same second with identical names collided
    # (overwriting the first), AND the timestamp prefix is
    # predictable (a ~10-bit search space per second). Anyone who
    # learned the URL kept access forever even after their account
    # was removed from the trip — and an enumeration scan could
    # discover private photos by walking timestamps. Prepend
    # `secrets.token_urlsafe(16)` (~132 bits of entropy) so URLs
    # become effectively unguessable and collisions vanish.
    #
    # We keep the time prefix for chronological sortability when
    # the operator is poking at the FS directly, but the token
    # is what stops the enumeration attack.
    salt = secrets.token_urlsafe(16)
    filename = f"{int(time.time())}_{salt}_{filename}"
    # Per-user subdir — also run user_id through secure_filename so
    # a malicious token claim can't smuggle path separators (it's
    # JWT-signed, so practically can't, but defense in depth).
    safe_user_dir = secure_filename(user_id) or "anon"
    user_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], safe_user_dir)
    os.makedirs(user_folder, exist_ok=True)
    out_path = os.path.join(user_folder, filename)

    # MK6 upload quota: refuse the write if it would push the user over
    # their per-user byte cap. Try reclaiming genuinely-orphaned files
    # first (abandoned uploads a client never persisted into a trip); only
    # 507 if still over after that. Runs BEFORE any bytes hit disk. The
    # re-encode branch below can grow OR shrink the file, but the input
    # size is a safe upper bound on what we're about to store, and the
    # 10 MB MAX_CONTENT_LENGTH already caps a single upload.
    incoming = _incoming_size(file)
    used = _user_dir_bytes(user_folder)
    if used + incoming > _UPLOAD_QUOTA_BYTES:
        used -= _reclaim_orphan_bytes(safe_user_dir, user_folder)
        if used + incoming > _UPLOAD_QUOTA_BYTES:
            return jsonify(
                {
                    "error": (
                        "Storage limit reached — delete some photos or documents "
                        "to free space, then try again."
                    ),
                    "quotaBytes": _UPLOAD_QUOTA_BYTES,
                    "usedBytes": max(used, 0),
                }
            ), 507

    # Audit fix (2026-05-26): strip EXIF GPS from JPEG/PNG/WebP
    # uploads before persisting. Pre-fix the file was saved bytes-
    # verbatim — iPhone JPEG/HEIC carry GPSLatitude/Longitude tags,
    # and anyone with the URL (public-trip viewers, share-link
    # recipients) could exfiltrate the user's home GPS from any
    # uploaded photo via exiftool. PIL/Pillow handles JPEG/PNG/WebP;
    # HEIC/HEIF and PDF aren't touched (HEIC support would need
    # pillow-heif, PDFs don't have GPS EXIF). Best-effort: if the
    # re-encode fails for any reason (corrupted image, unsupported
    # mode), fall back to the bytes-verbatim save so the upload
    # still completes — the EXIF strip is defense-in-depth, not
    # the security boundary.
    # R3-Round 4 fix: HEIC/HEIF now flow through the PIL re-encode
    # path when pillow-heif is registered (see module top). The
    # registered opener teaches PIL.Image.open() the HEIF container;
    # the existing EXIF-strip + decompression-bomb cap apply
    # identically. We re-save as JPEG so downstream renderers (which
    # may not know HEIC) get a universally-supported file. Without
    # pillow-heif we still reject with the R3-Round 3 friendly
    # message so the user has actionable feedback.
    if ext in {'.heic', '.heif'}:
        if not _HEIF_AVAILABLE:
            return jsonify(
                {
                    "error": (
                        "HEIC photos aren't supported yet. On iPhone, switch "
                        "Settings → Camera → Formats to 'Most Compatible' so "
                        "new shots upload as JPEG."
                    ),
                }
            ), 415
        # MK4 audit MED-5: rewrite the on-disk filename + returned URL
        # extension to `.jpg`. The bytes saved below are a re-encoded
        # JPEG (img_format='JPEG' for .heic/.heif), so a `.heic` suffix
        # left a JPEG-bytes file named `*.heic` — and `serve_upload`'s
        # `send_from_directory` infers Content-Type from the EXTENSION,
        # so it served `image/heic` for JPEG bytes. Browsers that can't
        # decode HEIC then refused to render a perfectly-good JPEG (the
        # very compatibility the conversion was meant to provide). The
        # URL is freshly minted here and stored in the trip JSON verbatim
        # — there are NO pre-existing references to break — so rewriting
        # it at mint time is safe. Strip whatever extension secure_filename
        # produced (splitext, not a len(ext) slice, in case it differs)
        # and re-derive out_path from the `.jpg` name.
        filename = os.path.splitext(filename)[0] + ".jpg"
        out_path = os.path.join(user_folder, filename)
    if ext in {'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'}:
        try:
            from PIL import Image, ImageOps

            # R4-B3: the MAX_IMAGE_PIXELS cap + DecompressionBombWarning
            # → Error conversion now live at module top (see lines ~45-58)
            # so they don't leak process-wide state on every request.
            file.stream.seek(0)
            img = Image.open(file.stream)
            # Trigger decode validation early so DecompressionBomb
            # fires before the save (which buffers pixel data).
            img.load()
            # MK6 P3: capture animated-WebP status NOW, before exif_transpose
            # below replaces `img` with a single-frame copy (which would report
            # is_animated=False). Used at the save step to preserve animation.
            _animated_webp = ext == '.webp' and getattr(img, 'is_animated', False)
            # R10-B6a MA1: bake EXIF Orientation into the pixel data
            # BEFORE we strip the EXIF dict on save. iPhone photos
            # taken in portrait carry the rotation as an EXIF
            # Orientation tag (1=normal, 3=180°, 6=CW90, 8=CCW90);
            # browsers + the PDF builder honour the tag, so the pre-
            # strip render looked correct. Once we drop EXIF on save
            # the tag is gone — every portrait photo then displayed
            # sideways. `exif_transpose` rotates/flips the pixel
            # buffer to match the tag, after which the saved file
            # has no orientation ambiguity left to lose.
            img = ImageOps.exif_transpose(img)
            # Re-save WITHOUT the EXIF dict. PIL's save() drops EXIF
            # by default unless explicitly passed; the `exif=b""`
            # argument makes the strip explicit + future-proof if
            # PIL's defaults change.
            save_kwargs = {"exif": b""}
            # PNG doesn't support the `exif` kwarg in all Pillow
            # versions — strip via the `info` dict instead. R3-Round
            # 3 fix: preserve the ICC color profile so iPhone photos
            # captured in Display P3 wide-gamut don't visibly color-
            # shift to sRGB on re-encode. Pillow's `save()` on PNG
            # drops the icc_profile chunk by default — passing it
            # back through restores correct on-screen colour.
            if img.format == "PNG":
                save_kwargs = {}
                icc_profile = img.info.get("icc_profile") if hasattr(img, 'info') else None
                if icc_profile:
                    save_kwargs["icc_profile"] = icc_profile
            elif img.format == "WEBP":
                # Same ICC preservation for WebP; the exif strip stays.
                icc_profile = img.info.get("icc_profile") if hasattr(img, 'info') else None
                if icc_profile:
                    save_kwargs["icc_profile"] = icc_profile
            # Preserve format from the decoded image; falls back to
            # the requested extension if PIL can't detect. HEIC/HEIF
            # are forced to JPEG because most downstream renderers
            # (browsers, lightbox, PDF builder) don't know HEIC; the
            # extension-to-format map below collapses both to JPEG.
            ext_to_format = {
                '.jpg': 'JPEG',
                '.jpeg': 'JPEG',
                '.png': 'PNG',
                '.webp': 'WEBP',
                '.heic': 'JPEG',
                '.heif': 'JPEG',
            }
            img_format = ext_to_format.get(ext) or img.format or 'JPEG'
            # If we're converting HEIC → JPEG we MUST pass the EXIF
            # strip kwarg (HEIC carries different metadata containers,
            # the empty `exif=b""` below kills both EXIF + XMP for the
            # JPEG output).
            if ext in ('.heic', '.heif') and img_format == 'JPEG':
                save_kwargs['exif'] = b""
            # BUG-042: JPEG can't encode RGBA / P / LA modes — convert to RGB
            # first, else img.save(..., 'JPEG') raises OSError and the broad
            # except below would persist the ORIGINAL (HEIC) bytes under the .jpg
            # name out_path was already rewritten to.
            if img_format == 'JPEG' and img.mode not in ('RGB', 'L'):
                img = img.convert('RGB')
            # MK6 P3: an ANIMATED WebP must not go through the single-frame
            # re-encode — img.save() without save_all writes only frame 0, so
            # every viewer sees a frozen first frame. The decompression-bomb
            # check already ran (img.load() above), so write the ORIGINAL bytes
            # verbatim, mirroring the GIF branch (same EXIF trade-off) to keep
            # the animation. (`_animated_webp` was captured before the transpose
            # above flattened `img` to one frame.)
            if _animated_webp:
                file.stream.seek(0)
                file.save(out_path)
            else:
                img.save(out_path, format=img_format, **save_kwargs)
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            # MK6 P1: catch the WARNING too, not just the Error. The module
            # bootstrap promotes DecompressionBombWarning to a raised exception
            # (simplefilter 'error'), but it is NOT a subclass of
            # DecompressionBombError — so images in the 25–50M-px band (a normal
            # 48MP phone photo) used to skip this branch, land in the broad
            # `except Exception:` below, and get saved bytes-verbatim with EXIF
            # (incl. GPS) intact. Reject both here.
            # R2 audit fix: REFUSE the upload on a decompression
            # bomb — don't fall back to file.save() (the old code
            # did, which defeated the cap). 413 = "Payload Too Large"
            # mirrors Flask's MAX_CONTENT_LENGTH 413 for the file-
            # size cap; same user message shape.
            # R3-Round 3 fix: log the rejection with the caller's
            # user_id and the upload's claimed filename so a
            # repeated DoS attempt is attributable in incident review.
            from observability import get_logger

            get_logger(__name__).warning(
                "upload rejected: decompression bomb from user=%s file=%r ext=%s",
                user_id,
                getattr(file, 'filename', '?'),
                ext,
            )
            return jsonify(
                {
                    "error": "Image dimensions too large to process",
                }
            ), 413
        except Exception:
            # BUG-042: for HEIC/HEIF, out_path was rewritten to .jpg BEFORE the
            # encode (above), so saving the original bytes here would persist HEIC
            # bytes under a .jpg name — serve_upload then infers image/jpeg and
            # browsers / lightbox / the PDF builder show a broken image. Refuse
            # instead; the user can re-upload a JPEG/PNG. Other formats keep the
            # lenient save-the-original fallback (their extension matches).
            if ext in ('.heic', '.heif'):
                from observability import get_logger

                get_logger(__name__).warning(
                    "HEIC->JPEG encode failed for user=%s file=%r; refusing",
                    user_id,
                    getattr(file, 'filename', '?'),
                )
                return jsonify(
                    {
                        "error": "Couldn't convert this HEIC photo — please upload a JPEG or PNG.",
                    }
                ), 415
            file.stream.seek(0)
            file.save(out_path)
    elif ext == '.gif':
        # R10-B6e MA5: GIF decompression-bomb gate. Pre-fix GIFs
        # skipped the PIL decode branch above (we don't want to
        # re-encode them; that drops animation frames) and fell
        # through to the bytes-verbatim `file.save()` below, so
        # the MAX_IMAGE_PIXELS / DecompressionBombWarning cap that
        # module-load applies to PIL never ran. A crafted
        # 50000×50000 GIF (single tiny stored block, billions of
        # logical pixels) would land on disk and OOM any downstream
        # consumer (PDF builder, thumbnail decoder) that tries to
        # decode it.
        #
        # Fix: open with PIL to trigger the bomb check, then save
        # the ORIGINAL bytes — not the re-encoded ones — so we
        # preserve animation. PIL's GIF decoder honors the same
        # MAX_IMAGE_PIXELS cap (set at module top) so the bomb is
        # caught before the bytes touch disk.
        try:
            from PIL import Image

            file.stream.seek(0)
            img = Image.open(file.stream)
            img.load()  # triggers DecompressionBombError if bomb
            # Decode passed — write the original bytes verbatim so
            # animation + transparency survive.
            file.stream.seek(0)
            file.save(out_path)
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            # MK6 P1: catch the promoted Warning too (see the JPEG/PNG branch) —
            # a 25–50M-px crafted GIF raises DecompressionBombWarning, not Error,
            # and would otherwise fall to the bytes-verbatim save below.
            from observability import get_logger

            get_logger(__name__).warning(
                "upload rejected: decompression bomb from user=%s file=%r ext=%s",
                user_id,
                getattr(file, 'filename', '?'),
                ext,
            )
            return jsonify(
                {
                    "error": "Image dimensions too large to process",
                }
            ), 413
        except Exception:
            # PIL couldn't open it (corrupted GIF, unsupported
            # variant). Fall back to bytes-verbatim — same shape as
            # the JPEG/PNG fallback above. The magic-number sniff
            # at line 162 already vetted the file structurally.
            file.stream.seek(0)
            file.save(out_path)
    else:
        file.save(out_path)

    # D1-B3: the pre-write gate above is a cheap fast-path but NOT a hard
    # bound — it compares against `_incoming_size` (the ORIGINAL byte length)
    # while the file we actually persisted is the PIL re-encode, which can
    # land LARGER than the input (e.g. a highly-compressed source expanded to
    # a quality-82 JPEG). It's also a TOCTOU: two concurrent uploads both read
    # the same pre-write `used` and both pass. Re-measure the directory now
    # that OUR bytes are on disk (a concurrent upload that finished first is
    # counted too). If we're over, roll back OUR file (+ its variants aren't
    # generated yet) and 507. Bounded by the 10 MB body cap so the overshoot
    # was never catastrophic, but this makes the cap a real ceiling.
    used_after = _user_dir_bytes(user_folder)
    if used_after > _UPLOAD_QUOTA_BYTES:
        used_after -= _reclaim_orphan_bytes(safe_user_dir, user_folder)
        if used_after > _UPLOAD_QUOTA_BYTES:
            try:
                os.remove(out_path)
            except OSError:
                pass
            _remove_variants(user_folder, filename)
            return jsonify(
                {
                    "error": (
                        "Storage limit reached — delete some photos or documents "
                        "to free space, then try again."
                    ),
                    "quotaBytes": _UPLOAD_QUOTA_BYTES,
                    "usedBytes": max(_user_dir_bytes(user_folder), 0),
                }
            ), 507

    # MK1 Wave C (T1-5): derive downscaled variants from the file that
    # actually landed on disk. Best-effort — a variant failure must
    # never fail the upload.
    _generate_variants(out_path, user_folder)

    return jsonify(
        {
            "url": f"/static/uploads/{safe_user_dir}/{filename}",
            "name": file.filename,
        }
    )


# ── MK1 Wave G (T2-1): the auth-gated upload SERVER moved here from
# main.py so the read ACL lives beside the write path (upload_file +
# quota + variants above) and gets reviewed with it. Verbatim except:
# the module-global UPLOAD_FOLDER became _upload_root() (config lookup —
# same value; tests monkeypatch app.config['UPLOAD_FOLDER'] too).


def _upload_root() -> str:
    return current_app.config["UPLOAD_FOLDER"]


# --- Auth-gated user uploads ---------------------------------------------
#
# R2 audit fix: the previous "auth-gate on /static/uploads/" task was
# scoped only at the upload-write side (unguessable 132-bit filename via
# `secrets.token_urlsafe(16)`). The READ side still served via Flask's
# default static handler with zero auth — anyone holding (or guessing,
# or harvesting from an OG-preview, browser history, server log) a URL
# could pull the bytes.
#
# Stronger gate: catch /static/uploads/<user_dir>/<filename> BEFORE the
# default static handler. Tier the access by caller identity:
#
#   1. Caller is signed in           → allow (trusting the unguessable
#                                       filename + the auth wall as
#                                       defense-in-depth; users routinely
#                                       see receipts shared by other
#                                       trip members and we don't want
#                                       to query trip membership on
#                                       every photo render).
#   2. Caller is anonymous           → allow IFF the file is referenced
#                                       by at least one trip with
#                                       is_public=1. Public shares need
#                                       to render their cover + photos
#                                       to anonymous /share/<token>
#                                       viewers; nothing else should
#                                       reach anonymous callers.
#
# The /static/uploads route is registered explicitly so it wins over
# Flask's default /static/<path:filename> rule. The shared base dir is
# UPLOAD_FOLDER (which can be remapped via GG_UPLOAD_ROOT for PA), so
# we serve from there directly rather than via the static_folder
# subdirectory (which may not be the same path on prod).
def _send_upload(relpath: str):
    """MK1 Wave C (T1-5): honour `?size=thumb|display` by serving the
    downscaled variant when one exists, falling back to the original
    (PDFs, animated images, pre-variant uploads, or an original already
    smaller than the requested edge). Called ONLY after serve_upload's
    ACL has passed on the ORIGINAL path — variants inherit exactly the
    original's access control. Unknown size values are ignored."""
    size = request.args.get("size")
    if size in ("thumb", "display"):
        head, name = os.path.split(relpath)
        ext = os.path.splitext(name)[1].lower()
        variant_rel = os.path.join(head, "_variants", f"{name}.{size}{ext}")
        if os.path.isfile(os.path.join(_upload_root(), variant_rel)):
            return send_from_directory(_upload_root(), variant_rel)
    return send_from_directory(_upload_root(), relpath)


@bp.route("/static/uploads/<path:relpath>")
def serve_upload(relpath: str):
    from auth import current_user_id

    # R3-Fix #1: pre-fix this called `_extract_token(request)` but the
    # helper takes ZERO arguments, raising TypeError. The bare
    # `except Exception` swallowed it, so every authenticated request
    # silently fell into the anonymous branch and 404'd for the file's
    # own owner. `current_user_id()` does cookie+bearer extraction +
    # verify_token + auth_sessions revocation check internally, returns
    # the user_id string (NOT a dict — `payload.get("sub")` would have
    # AttributeError'd too).
    caller_id = current_user_id()
    needle_exact = f"/static/uploads/{relpath}"

    if caller_id:
        # 4.8 audit PLAT-3: gate authenticated reads by ownership +
        # membership. Pre-fix ANY signed-in user could read ANY upload —
        # including expense RECEIPTS — just by holding the URL (harvested
        # from an /api/data or /api/public-trip payload, browser history,
        # or a log), and a removed/declined trip member kept that access
        # FOREVER (files are only deleted when the whole trip/day is).
        # Now:
        #   1. Owner fast-path — the first path segment is the uploader's
        #      secure_filename(user_id); no DB hit for your own files.
        #   2. Else allow only if the caller is an ACCEPTED member of a
        #      trip referencing the file (cover / photos / documents) or
        #      an expense receipt on such a trip.
        #   3. Else fall through to the public-cover check below, so an
        #      authenticated non-member can still render a PUBLIC trip's
        #      cover (same surface an anonymous viewer gets).
        owner_dir = relpath.split('/', 1)[0]
        if owner_dir == secure_filename(caller_id):
            return _send_upload(relpath)
        # Anchored JSON-string match, same shape as the anon cover check.
        _like = f'%"{needle_exact}"%'
        with get_db() as conn:
            c = conn.cursor()
            # MK4 audit MED-4: the original gate ran a `LIKE '%"url"%'`
            # substring scan across EVERY accepted trip's photos_json +
            # documents_json (each up to ~512KB, un-indexable) on every
            # foreign-image render — a per-image scale cliff on a shared
            # gallery. Uploads encode the owner in the path
            # (/static/uploads/<owner_dir>/...), and owner_dir is
            # secure_filename(owner_user_id) — which is the identity for
            # every real user id (Google `sub` = digits; test ids =
            # alnum/hyphen). So resolve the owner via a PRIMARY-KEY lookup
            # and add an indexed trip_members self-join keyed on the owner:
            # only trips where BOTH the caller AND the owner are accepted
            # members can reference the file, which shrinks the candidate
            # set (via idx_trip_members_trip_user) BEFORE the JSON LIKE
            # runs — so the LIKE touches a handful of shared-trip rows
            # instead of all of the caller's trips.
            #
            # Removed-member-loses-access is PRESERVED: the file's trip is
            # only matched when the caller is still an `accepted` member of
            # it (the secondary JSON tightening is kept, not dropped), so a
            # member removed from the file's trip fails the join even if
            # they share an UNRELATED trip with the owner — verified by
            # test_serve_upload_removed_member_denied in test_media_mk4.py.
            #
            # The narrowed query is used only when owner_dir resolves to a
            # real user id (the ~100% case). If it doesn't (a legacy
            # secure_filename-altered id), we fall back to the original
            # caller-only query so no legitimate render regresses.
            c.execute("SELECT id FROM users WHERE id = ?", (owner_dir,))
            owner_row = c.fetchone()
            owner_id = owner_row["id"] if owner_row else None
            if owner_id is not None:
                c.execute(
                    "SELECT 1 FROM trips t "
                    "JOIN trip_members tm_caller "
                    "  ON tm_caller.trip_id = t.id "
                    " AND tm_caller.user_id = ? "
                    " AND tm_caller.invitation_status = 'accepted' "
                    "JOIN trip_members tm_owner "
                    "  ON tm_owner.trip_id = t.id "
                    " AND tm_owner.user_id = ? "
                    " AND tm_owner.invitation_status = 'accepted' "
                    "WHERE (t.cover_url = ? OR t.photos_json LIKE ? "
                    "       OR t.documents_json LIKE ?) "
                    "LIMIT 1",
                    (caller_id, owner_id, needle_exact, _like, _like),
                )
                if c.fetchone():
                    return _send_upload(relpath)
                # Receipts, same owner-narrowed shape.
                c.execute(
                    "SELECT 1 FROM expenses e "
                    "JOIN trip_members tm_caller "
                    "  ON tm_caller.trip_id = e.trip_id "
                    " AND tm_caller.user_id = ? "
                    " AND tm_caller.invitation_status = 'accepted' "
                    "JOIN trip_members tm_owner "
                    "  ON tm_owner.trip_id = e.trip_id "
                    " AND tm_owner.user_id = ? "
                    " AND tm_owner.invitation_status = 'accepted' "
                    "WHERE e.receipt_url = ? LIMIT 1",
                    (caller_id, owner_id, needle_exact),
                )
                if c.fetchone():
                    return _send_upload(relpath)
            else:
                # Fallback: owner_dir didn't map to a real user id (rare
                # legacy secure_filename-altered path). Use the original
                # caller-only gate so a legitimate member still renders it.
                c.execute(
                    "SELECT 1 FROM trips t "
                    "JOIN trip_members tm ON tm.trip_id = t.id "
                    "WHERE tm.user_id = ? AND tm.invitation_status = 'accepted' "
                    "  AND (t.cover_url = ? OR t.photos_json LIKE ? OR t.documents_json LIKE ?) "
                    "LIMIT 1",
                    (caller_id, needle_exact, _like, _like),
                )
                if c.fetchone():
                    return _send_upload(relpath)
                c.execute(
                    "SELECT 1 FROM expenses e "
                    "JOIN trip_members tm ON tm.trip_id = e.trip_id "
                    "WHERE tm.user_id = ? AND tm.invitation_status = 'accepted' "
                    "  AND e.receipt_url = ? LIMIT 1",
                    (caller_id, needle_exact),
                )
                if c.fetchone():
                    return _send_upload(relpath)
        # Not owner, not a member of any referencing trip → fall through
        # to the public-cover check (a public trip's cover is readable by
        # anyone, authenticated or not). Don't 404 yet.

    # Anonymous (or authenticated-non-member) branch — allow when at
    # least one trip with PUBLIC reach references the file as its cover.
    # "Public reach" = is_public=1 (Explore feed) OR share_token IS NOT
    # NULL (share-link surface).
    #
    # R3-Fix #13: pre-fix this only checked is_public=1. Share-only
    # trips (share_token set but is_public=0) rendered as broken images
    # to every recipient because the cover_url all 404'd through the SW.
    #
    # R3-Fix #22: cover_url is matched by exact-equality so a malicious
    # owner who plants a scheme-prefixed pollution string can't match.
    with get_db() as conn:
        cursor = conn.cursor()
        # R5-B1: anonymous viewers can ONLY fetch a trip's cover_url
        # (the share + explore templates only render the cover; photos
        # and documents are members-only by contract). Pre-fix the
        # photos_json / documents_json LIKE clauses widened the anon
        # surface to every photo/document on any public-or-shared trip
        # — fine when nothing links to them, but a defense-in-depth
        # liability if a future template tweak, OG-crawler log, or
        # browser-history leak ever exposes a deep URL. Anon stays
        # cover-only; authenticated members get the rest via the
        # session_user_id branch above (which already gates by membership
        # and includes the photos/documents matches).
        cursor.execute(
            "SELECT 1 FROM trips "
            "WHERE (is_public = 1 OR share_token IS NOT NULL) "
            "  AND cover_url = ? "
            "LIMIT 1",
            (needle_exact,),
        )
        if cursor.fetchone():
            return _send_upload(relpath)
    # Anonymous + no public-trip reference → 404 (don't differentiate
    # from "file doesn't exist" to avoid leaking the existence of
    # private uploads via status-code differential).
    from flask import abort

    abort(404)


# --- Authentication ---
