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

from flask import Blueprint, current_app, jsonify, request
from werkzeug.utils import secure_filename

from auth import current_user_id, require_auth
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
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
    # documents (trip tickets, bookings)
    '.pdf',
}

# HEIF/HEIC ftyp box brands we accept. The full list per ISO/IEC 23008-12
# and ISO/IEC 14496-12. Anything else (e.g. avif via av01) is rejected
# until we explicitly opt in — keeps the surface area small.
_HEIF_BRANDS = (
    b'heic', b'heix', b'hevc', b'hevx',
    b'heim', b'heis', b'hevm', b'hevs',
    b'mif1', b'msf1',
)

# Simple-prefix magic numbers for the formats whose first bytes are
# uniquely diagnostic. JPEG / PNG / GIF / PDF all live here. WebP and
# HEIC/HEIF are NOT simple prefixes — see _looks_like_upload below
# for the structural checks they need.
_SIMPLE_PREFIX_SIGNATURES = (
    b'\xff\xd8\xff',                 # JPEG
    b'\x89PNG\r\n\x1a\n',            # PNG
    b'GIF87a', b'GIF89a',            # GIF
    b'%PDF-',                        # PDF
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
    if (
        len(head) >= 12
        and head.startswith(b'RIFF')
        and head[8:12] == b'WEBP'
    ):
        return True
    # HEIF/HEIC — ftyp box at offset 4 + recognised brand at offset 8.
    if (
        len(head) >= 12
        and head[4:8] == b'ftyp'
        and head[8:12] in _HEIF_BRANDS
    ):
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
            return jsonify({
                "error": (
                    "HEIC photos aren't supported yet. On iPhone, switch "
                    "Settings → Camera → Formats to 'Most Compatible' so "
                    "new shots upload as JPEG."
                ),
            }), 415
        # Re-route through the PIL branch below with `.jpg` so the
        # bytes land as JPEG on disk. The on-disk filename keeps the
        # `.heic` extension (callers reference it via the returned
        # URL), but the bytes are a re-encoded JPEG — Pillow handles
        # the format conversion automatically. Cleaner long-term:
        # rewrite the extension too, but that breaks anyone whose
        # client tracks the URL by extension match.
        pass
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
                '.jpg': 'JPEG', '.jpeg': 'JPEG',
                '.png': 'PNG', '.webp': 'WEBP',
                '.heic': 'JPEG', '.heif': 'JPEG',
            }
            img_format = ext_to_format.get(ext) or img.format or 'JPEG'
            # If we're converting HEIC → JPEG we MUST pass the EXIF
            # strip kwarg (HEIC carries different metadata containers,
            # the empty `exif=b""` below kills both EXIF + XMP for the
            # JPEG output).
            if ext in ('.heic', '.heif') and img_format == 'JPEG':
                save_kwargs['exif'] = b""
            img.save(out_path, format=img_format, **save_kwargs)
        except Image.DecompressionBombError:
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
                user_id, getattr(file, 'filename', '?'), ext,
            )
            return jsonify({
                "error": "Image dimensions too large to process",
            }), 413
        except Exception:
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
        except Image.DecompressionBombError:
            from observability import get_logger
            get_logger(__name__).warning(
                "upload rejected: decompression bomb from user=%s file=%r ext=%s",
                user_id, getattr(file, 'filename', '?'), ext,
            )
            return jsonify({
                "error": "Image dimensions too large to process",
            }), 413
        except Exception:
            # PIL couldn't open it (corrupted GIF, unsupported
            # variant). Fall back to bytes-verbatim — same shape as
            # the JPEG/PNG fallback above. The magic-number sniff
            # at line 162 already vetted the file structurally.
            file.stream.seek(0)
            file.save(out_path)
    else:
        file.save(out_path)

    return jsonify({
        "url": f"/static/uploads/{safe_user_dir}/{filename}",
        "name": file.filename,
    })
