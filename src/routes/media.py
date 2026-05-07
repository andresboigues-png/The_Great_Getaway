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
# Magic-number prefixes for the formats we accept. Spoofing the
# extension without spoofing these bytes is much harder, so we sniff
# the first few bytes as a second-line defense against `bomb.exe`
# renamed `bomb.jpg`.
ALLOWED_UPLOAD_SIGNATURES = (
    b'\xff\xd8\xff',                 # JPEG
    b'\x89PNG\r\n\x1a\n',            # PNG
    b'GIF87a', b'GIF89a',            # GIF
    b'RIFF',                         # WebP (RIFF...WEBP)
    b'%PDF-',                        # PDF
    b'\x00\x00\x00',                 # HEIC/HEIF (ftyp box header — coarse but sufficient)
)


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
    # .save() writes the full file from offset 0.
    head = file.stream.read(16)
    file.stream.seek(0)
    if not any(head.startswith(sig) for sig in ALLOWED_UPLOAD_SIGNATURES):
        return jsonify({"error": "File contents don't match expected format"}), 400

    filename = secure_filename(file.filename)
    # Add timestamp to avoid collisions
    filename = f"{int(time.time())}_{filename}"
    file.save(os.path.join(current_app.config['UPLOAD_FOLDER'], filename))

    return jsonify({
        "url": f"/static/uploads/{filename}",
        "name": file.filename,
    })
