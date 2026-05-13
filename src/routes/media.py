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
    # current_user_id is read for its side-effect of requiring auth;
    # the upload itself doesn't write user_id into the saved row
    # (uploads are flat files in static/uploads, not DB rows).
    current_user_id()

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
    # Add timestamp to avoid collisions
    filename = f"{int(time.time())}_{filename}"
    file.save(os.path.join(current_app.config['UPLOAD_FOLDER'], filename))

    return jsonify({
        "url": f"/static/uploads/{filename}",
        "name": file.filename,
    })
