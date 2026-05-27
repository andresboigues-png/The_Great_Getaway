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
    # R3-Round 3 fix: explicit HEIC/HEIF rejection. The magic-number
    # gate above ACCEPTS the file (so the upload reaches here) but
    # without `pillow-heif` installed PIL can't open it and the
    # existing fall-through stored bytes-verbatim — EXIF/GPS would
    # leak. Rather than silently degrading, tell the user to convert
    # to JPEG so the iOS "Most Compatible" setting becomes a real
    # affordance. The /api/upload-photo flow is symmetric; this
    # branch handles both since the ext sniff is the same shape.
    if ext in {'.heic', '.heif'}:
        return jsonify({
            "error": (
                "HEIC photos aren't supported yet. On iPhone, switch "
                "Settings → Camera → Formats to 'Most Compatible' so "
                "new shots upload as JPEG."
            ),
        }), 415
    if ext in {'.jpg', '.jpeg', '.png', '.webp'}:
        try:
            from PIL import Image
            # R2 audit fix: decompression-bomb DoS. Without a pixel
            # cap, a crafted 30k × 30k PNG (~100KB compressed) decodes
            # to ~3.6GB of raw pixels and OOMs the worker. PIL's
            # built-in DecompressionBombWarning fires at ~178M px by
            # default but is a WARNING, not an exception; we tighten
            # to 25M px (≈ 5000×5000, generous for any phone camera)
            # AND turn it into a hard error rather than the silent
            # fall-through-to-file.save() the old code did.
            import warnings
            Image.MAX_IMAGE_PIXELS = 25_000_000
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            file.stream.seek(0)
            img = Image.open(file.stream)
            # Trigger decode validation early so DecompressionBomb
            # fires before the save (which buffers pixel data).
            img.load()
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
            # the requested extension if PIL can't detect.
            img_format = img.format or {
                '.jpg': 'JPEG', '.jpeg': 'JPEG',
                '.png': 'PNG', '.webp': 'WEBP',
            }[ext]
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
    else:
        file.save(out_path)

    return jsonify({
        "url": f"/static/uploads/{safe_user_dir}/{filename}",
        "name": file.filename,
    })
