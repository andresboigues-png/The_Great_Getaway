"""Generate the test fixtures used by tests/e2e/.

Today: one JPEG with embedded EXIF DateTimeOriginal, for the §4.9
auto-day-assign Playwright test. Re-running this is idempotent — the
output is byte-identical given the same Pillow version (we set EXIF
fields explicitly so JPEG compression is the only variability).

Why a Python script (rather than a pre-baked binary or a JS helper):
  - Reproducibility — the fixture is small + deterministic. If the
    file ever drifts from the test's expectations (different EXIF
    date, different size), re-running this regenerates a known-good
    copy. No hunting for "what's actually in this binary."
  - No third-party deps — Pillow is already on most Python installs
    (we use it in scripts/generate_icons.py too). No `piexif` or
    other EXIF-specific library needed.
  - Tiny output — an 8×8 JPEG with two date tags is ~750 bytes, well
    under the size where you'd want to LFS it.

Run with:

    python3 scripts/generate_test_fixtures.py

Outputs land in `tests/e2e/fixtures/`. The names encode the EXIF date
so it's obvious at glance which test expects which date.
"""

from pathlib import Path

from PIL import ExifTags, Image


# Target dates we want fixtures for. Add new entries here when a new
# test needs a new fixture. The filename embeds the date so a test
# expecting 2026-06-02 always reaches for `photo-2026-06-02.jpg`.
FIXTURES = [
    "2026-06-02",
]


def _build_jpeg(date_str_yyyy_mm_dd: str) -> bytes:
    """Build a tiny solid-color JPEG with EXIF DateTime + DateTimeOriginal
    both set to the given LOCAL date at 14:30:00. exifr (the frontend
    parser) reads DateTimeOriginal first, falling back to DateTime —
    we set BOTH so a parser preference shift won't quietly break the
    fixture."""
    img = Image.new("RGB", (8, 8), color=(20, 64, 128))
    exif_str = f"{date_str_yyyy_mm_dd.replace('-', ':')} 14:30:00"

    exif = img.getexif()
    # DateTime (0x0132) lives in IFD0 — readable by every EXIF parser.
    exif[0x0132] = exif_str
    # DateTimeOriginal (0x9003) lives in the Exif sub-IFD — the canonical
    # capture-time tag, what exifr reads first.
    exif_sub = exif.get_ifd(ExifTags.IFD.Exif)
    exif_sub[0x9003] = exif_str

    # Save to bytes via BytesIO so the caller decides whether to write
    # the file. `optimize=True` shaves a few bytes but yields identical
    # output across re-runs.
    from io import BytesIO
    buf = BytesIO()
    img.save(buf, format="JPEG", exif=exif, optimize=True)
    return buf.getvalue()


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "tests" / "e2e" / "fixtures"
    out_dir.mkdir(parents=True, exist_ok=True)

    for date_str in FIXTURES:
        data = _build_jpeg(date_str)
        path = out_dir / f"photo-{date_str}.jpg"
        path.write_bytes(data)
        print(f"  wrote {path.relative_to(out_dir.parent.parent.parent)} ({len(data)} bytes)")


if __name__ == "__main__":
    main()
