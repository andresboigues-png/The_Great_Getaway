"""Generate the PWA icon set from the brand mark.

Reads the design defined inline (matches `frontend/static/favicon.svg`):
  - White rounded-square background, rx ~22% of side
  - Three concentric rings — blue (#0071e3) outer, orange (#ff9500)
    middle, green (#34c759) inner

Emits PNG variants at every size the manifest + iOS Home Screen + the
Android maskable spec expects. Run with:

    python3 scripts/generate_icons.py

Outputs land in `frontend/static/icons/`. Re-running is idempotent — it
overwrites whatever was there.

Why hand-render rather than rsvg-convert / cairosvg / sharp?
The mark is geometrically trivial (3 circles + a rounded rect), so a
Pillow renderer is 40 lines of code with zero external deps beyond
Pillow itself (which is already on most Python installs). Avoids
dragging cairo/svg libraries into the build chain just for an icon
that changes maybe once a year.
"""

from pathlib import Path

from PIL import Image, ImageDraw


# ── Brand mark in unit coords (relative to a 64x64 viewBox, matching
#    favicon.svg). All sizes scale uniformly to whatever target.
# Stroke widths are in unit coords too; PIL's `width` parameter is
# pixels in the destination, so we scale at render time.
UNIT_SIZE = 64
RING_OUTER = {"r": 22, "width": 6, "color": "#0071e3"}
RING_MIDDLE = {"r": 15, "width": 4, "color": "#ff9500"}
RING_INNER = {"r": 10, "width": 4, "color": "#34c759"}
CORNER_RADIUS_RATIO = 14 / 64  # 22% — iOS-style app icon corners
BG_COLOR = "#ffffff"


def render(size: int, *, padding_ratio: float = 0.0) -> Image.Image:
    """Render the brand mark at the given size.

    `padding_ratio` reserves space around the mark for the
    Android "maskable" spec — the icon is shown inside a circular
    or squircle mask, so the visual content needs ~10% padding on
    each side to avoid being clipped by the mask. Pass 0 for the
    "any" purpose (icon shown as-is) and ~0.10 for maskable.
    """
    # Maskable variants need an edge-to-edge solid fill (Android's mask
    # carves the shape). The "any" variant draws a rounded-square so
    # the white pixels follow iOS's app-icon corners — saves the OS
    # from masking again on top of an already-rounded raster.
    #
    # NB: PIL's `Image.new("RGBA", ..., "#ffffff")` parses the hex as
    # RGB and leaves alpha=0, producing a fully-transparent image.
    # Pass the tuple form (255, 255, 255, 255) explicitly so the fill
    # is opaque.
    bg_rgba = (255, 255, 255, 255)
    if padding_ratio > 0:
        # Edge-to-edge solid for maskable.
        img = Image.new("RGBA", (size, size), bg_rgba)
    else:
        # Rounded-square for the standard "any" purpose.
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        radius = int(size * CORNER_RADIUS_RATIO)
        ImageDraw.Draw(img).rounded_rectangle(
            [(0, 0), (size - 1, size - 1)],
            radius=radius,
            fill=bg_rgba,
        )
    draw = ImageDraw.Draw(img)

    # Mark scaling — UNIT_SIZE coordinate space gets squeezed into
    # `inner_size`, centered. For maskable, `inner_size` is smaller
    # so the mark sits inside the safe zone.
    inner_size = size * (1 - 2 * padding_ratio)
    scale = inner_size / UNIT_SIZE
    cx = size / 2
    cy = size / 2

    for ring in (RING_OUTER, RING_MIDDLE, RING_INNER):
        r = ring["r"] * scale
        # PIL's `width` is pixels; round up so thin rings stay visible
        # at small sizes (16/32 favicons).
        w = max(1, round(ring["width"] * scale))
        bbox = [cx - r, cy - r, cx + r, cy + r]
        draw.ellipse(bbox, outline=ring["color"], width=w)

    return img


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "frontend" / "static" / "icons"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Standard manifest sizes + iOS Home Screen + browser-tab favicons.
    # 180 is the canonical apple-touch-icon size; 192 + 512 are the
    # Android PWA install minimums; 16/32 cover browser tabs at @1x/@2x
    # for the rare browser that prefers PNG favicons over the SVG one.
    standard_sizes = [16, 32, 180, 192, 512]
    for s in standard_sizes:
        img = render(s, padding_ratio=0.0)
        path = out_dir / f"icon-{s}.png"
        img.save(path, "PNG", optimize=True)
        print(f"  wrote {path.relative_to(out_dir.parent.parent.parent)} ({s}x{s})")

    # Maskable variants (Android adaptive icons). The OS mask carves
    # a shape (circle / squircle / etc) out of the icon, so we
    # reserve ~12% padding on each side to keep the rings safely
    # inside the visible mask zone.
    for s in (192, 512):
        img = render(s, padding_ratio=0.12)
        path = out_dir / f"icon-{s}-maskable.png"
        img.save(path, "PNG", optimize=True)
        print(f"  wrote {path.relative_to(out_dir.parent.parent.parent)} ({s}x{s} maskable)")


if __name__ == "__main__":
    main()
