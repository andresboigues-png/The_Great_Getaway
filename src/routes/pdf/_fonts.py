"""PDF export — Unicode font registration.

Behaviour-preserving extract of the font-candidate table, the lazy
``_try_register_unicode_font`` registration, and the ``_font`` style
picker. Kept as its own module so the (PA-specific) font-path logic is
isolated. Star-imported into ``routes.pdf``.
"""

from __future__ import annotations

import os

from observability import get_logger

logger = get_logger(__name__)

# R3-Round 4 fix: register a Unicode-capable font for non-Latin
# content. Reportlab's built-in Helvetica covers Latin-Extended-A
# only — Arabic ("أحمد"), CJK ("陈太太"), Cyrillic ("Дмитрий") etc.
# render as missing-glyph squares OR get silently stripped by
# _strip_emoji below, surfacing as "Untitled companion" in the
# PDF. We try a list of common system paths for a Unicode TTF;
# on PA the standard DejaVu Sans path resolves. If nothing is
# found, we fall back to Helvetica (Latin-only — same pre-fix
# behaviour, no regression).
#
# `_UNICODE_FONT` / `_UNICODE_FONT_BOLD` / `_UNICODE_FONT_OBLIQUE`
# carry the registered font names if registration succeeded; the
# call sites below use `_font(bold=True)` etc. to pick the right
# name without scattering try/except blocks across 16 call sites.
_UNICODE_FONT: str | None = None
_UNICODE_FONT_BOLD: str | None = None
_UNICODE_FONT_OBLIQUE: str | None = None

_FONT_CANDIDATES = [
    # macOS dev (Arial Unicode covers nearly all Unicode planes incl.
    # CJK + Arabic; no separate bold/italic so we re-use the regular).
    # Listed FIRST so dev renders the widest script coverage; on Linux
    # this path doesn't exist so it falls through to the candidates
    # below.
    (
        "/Library/Fonts/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "ArialUnicode",
    ),
    # MK4 PA-FONT fix: DejaVu Sans has NO CJK and NO Arabic coverage,
    # so on PA (which only ships DejaVu by default) a Chinese / Arabic
    # companion name or trip title was murdered to the empty string by
    # _strip_emoji's fallback path → "Untitled companion" / blank
    # footer. Prefer a full-coverage Noto face when the box has one
    # installed (PA must `apt-get install fonts-noto-cjk fonts-noto-core`
    # or equivalent — see the route's return note). Noto Sans CJK
    # covers Chinese/Japanese/Korean + Latin/Cyrillic/Greek; Noto Naskh
    # covers Arabic. We register the CJK face as the PRIMARY Unicode
    # font (it also has Latin), so most non-Latin names render; Arabic
    # still needs Naskh which we try as a separate fallback candidate.
    (
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "NotoSansCJK",
    ),
    (
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "NotoSansCJK",
    ),
    (
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf",
        "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
        "NotoNaskhArabic",
    ),
    # Linux (PA + most distros) — DejaVu is the near-universal fallback
    # but covers Latin/Cyrillic/Greek only (no CJK/Arabic). Kept LAST so
    # a Noto face wins when present; DejaVu still beats Helvetica's
    # Latin-1-only coverage when Noto isn't installed.
    (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
        "DejaVuSans",
    ),
]


def _try_register_unicode_font() -> None:
    global _UNICODE_FONT, _UNICODE_FONT_BOLD, _UNICODE_FONT_OBLIQUE
    if _UNICODE_FONT is not None:
        return  # already registered
    import os
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except Exception:
        return  # reportlab missing — caller will fall back to Helvetica
    for reg_path, bold_path, oblique_path, name in _FONT_CANDIDATES:
        if not os.path.isfile(reg_path):
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, reg_path))
            if os.path.isfile(bold_path):
                pdfmetrics.registerFont(TTFont(f"{name}-Bold", bold_path))
            if os.path.isfile(oblique_path):
                pdfmetrics.registerFont(TTFont(f"{name}-Oblique", oblique_path))
            _UNICODE_FONT = name
            _UNICODE_FONT_BOLD = f"{name}-Bold" if os.path.isfile(bold_path) else name
            _UNICODE_FONT_OBLIQUE = f"{name}-Oblique" if os.path.isfile(oblique_path) else name
            logger.info("PDF unicode font registered: %s", name)
            return
        except Exception as e:
            logger.warning("PDF unicode font registration failed for %s: %s", name, e)
            continue


def _font(*, bold: bool = False, oblique: bool = False) -> str:
    """Return the name of the active font for the requested style.
    Unicode-capable when the registration succeeded, Helvetica
    otherwise."""
    _try_register_unicode_font()
    if bold and oblique:
        # No combined glyph in our DejaVu / Arial Unicode set —
        # prefer bold over oblique.
        return _UNICODE_FONT_BOLD or "Helvetica-BoldOblique"
    if bold:
        return _UNICODE_FONT_BOLD or "Helvetica-Bold"
    if oblique:
        return _UNICODE_FONT_OBLIQUE or "Helvetica-Oblique"
    return _UNICODE_FONT or "Helvetica"


def _strip_emoji(text: str) -> str:
    """Drop emoji + wide-Unicode glyphs the active font can't render.
    R3-Round 4 fix: when a Unicode-capable font (DejaVu / Arial
    Unicode) registered successfully, we ONLY strip true emoji
    codepoints (≥ U+1F000) and keep all letter/symbol Unicode —
    so Arabic / CJK / Cyrillic / Greek / Hebrew companion names
    and trip titles render correctly instead of getting murdered
    to the empty string + falling back to "Untitled companion."
    When no Unicode font registered (rare on PA — DejaVu is
    pre-installed), we fall back to the old conservative strip
    so squares don't appear in the output.

    Lives alongside the font registration (not in _render) because the
    strip decision keys on the live ``_UNICODE_FONT`` global that
    ``_try_register_unicode_font`` mutates — keeping both in one module
    preserves that shared-state read exactly as the pre-split code did."""
    if not text:
        return ""
    _try_register_unicode_font()
    if _UNICODE_FONT:
        # Unicode font present — strip ONLY actual emoji + private-use
        # planes. Letters / symbols / punctuation across every script
        # are kept. Emoji range: U+1F000-U+1FFFF covers the bulk
        # (musical, mahjong, dingbats, faces, food, transport, flags).
        # U+2600-U+27BF covers older miscellaneous symbols and
        # dingbats that may be partial-coverage in DejaVu.
        def _is_emoji(cp: int) -> bool:
            return (
                0x1F000 <= cp <= 0x1FFFF
                or 0xE000 <= cp <= 0xF8FF  # Private Use Area
            )
        return "".join(ch for ch in text if not _is_emoji(ord(ch))).strip()
    # Fallback (no Unicode font): keep ASCII + Latin-1 + Latin-
    # Extended-A plus a curated set of typography glyphs.
    keep_extra = {
        0x2013, 0x2014,  # – —
        0x2018, 0x2019, 0x201C, 0x201D,  # smart quotes
        0x2022, 0x2026,  # • …
        0x2192, 0x2190, 0x2191, 0x2193,  # arrows → ← ↑ ↓
        0x00B7,  # middle dot ·
        0x20AC, 0x00A3, 0x00A5,  # € £ ¥
    }
    return "".join(
        ch for ch in text
        if ord(ch) <= 0x024F or ord(ch) in keep_extra
    ).strip()
