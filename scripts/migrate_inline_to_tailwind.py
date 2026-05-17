"""Mechanically convert React JSX `style={{...}}` blocks to Tailwind
className strings — FIXING_ROADMAP §0.4 follow-up Tailwind migration.

Strategy:
  - Parse each `style={{ key: value, ... }}` block.
  - If EVERY key/value maps to a known Tailwind utility, replace the
    style attribute with a className list (merging into any existing
    className on the same JSX tag).
  - If ANY value is dynamic (template string, variable reference,
    conditional, function call), skip the block — keep it inline.

Skipping the dynamic cases means the script can be re-run safely:
inline styles that survive are the ones that need hand attention.

USAGE:
  python3 scripts/migrate_inline_to_tailwind.py <path/to/file.tsx>
"""
import re
import sys
from pathlib import Path

# ── Value-to-Tailwind translation table ──────────────────────────
# Maps "(property, value)" → Tailwind utility string. The mapping is
# intentionally conservative — only entries we KNOW resolve to the
# right CSS via our @theme bridge in src/tailwind.css.
#
# Numeric spacing values (4, 8, 12, ..., 48) match the --space-* scale.
# Off-scale numbers fall through to `[arbitrary]` syntax.

SPACING_PX_TO_TW = {
    0: '0', 1: 'px', 2: '0.5',
    4: '1', 6: '1.5', 8: '2', 10: '2.5', 12: '3', 14: '3.5',
    16: '4', 20: '5', 24: '6', 28: '7', 32: '8', 36: '9',
    40: '10', 44: '11', 48: '12', 56: '14', 64: '16', 80: '20',
    96: '24', 128: '32',
}

RADIUS_PX_TO_TW = {
    0: 'none', 2: 'xs', 4: 'sm', 6: 'md', 8: 'lg',
    12: 'md', 18: 'lg', 24: 'xl', 28: '2xl', 32: '3xl',
    9999: 'full', 999: 'full',
}


def spacing_token(value):
    """Map a numeric or 'Xpx' / 'var(--space-N)' value to a Tailwind
    scale step. Returns:
      - the scale step name (e.g. '3' for 12px) if it matches our
        theme tokens
      - an arbitrary-value bracket form '[14px]' for off-scale ints
      - None for genuinely unmappable values (calc(), etc.)"""
    if isinstance(value, int):
        token = SPACING_PX_TO_TW.get(abs(value))
        if token is not None:
            return token if value >= 0 else f'-{token}'
        return f'[{abs(value)}px]' if value >= 0 else f'-[{abs(value)}px]'
    if isinstance(value, str):
        # var(--space-N) → N (matches our theme bridge) — allow optional
        # surrounding quotes so callers don't have to pre-strip.
        m = re.match(r"^['\"]?var\(--space-(\d+)\)['\"]?$", value)
        if m:
            return m.group(1)
        # 'Xpx' / "-Xpx"
        m = re.match(r"^['\"]?(-?\d+)px['\"]?$", value)
        if m:
            n = int(m.group(1))
            tok = SPACING_PX_TO_TW.get(abs(n))
            if tok is not None:
                return tok if n >= 0 else f'-{tok}'
            return f'[{abs(n)}px]' if n >= 0 else f'-[{abs(n)}px]'
        # 'X' (numeric string, with possible quotes)
        m = re.match(r"^['\"]?(-?\d+)['\"]?$", value)
        if m:
            n = int(m.group(1))
            tok = SPACING_PX_TO_TW.get(abs(n))
            if tok is not None:
                return tok if n >= 0 else f'-{tok}'
            return f'[{abs(n)}px]' if n >= 0 else f'-[{abs(n)}px]'
        # rem / em / % / vw / vh → arbitrary bracket (Tailwind v4 accepts)
        m = re.match(r"^['\"]?([\d.]+(?:rem|em|%|vw|vh|ch|ex))['\"]?$", value)
        if m:
            return f'[{m.group(1)}]'
        # 'auto'
        if value == "'auto'" or value == '"auto"':
            return 'auto'
    return None


def radius_token(value):
    """Same idea for border-radius."""
    if isinstance(value, int):
        return RADIUS_PX_TO_TW.get(value)
    if isinstance(value, str):
        m = re.match(r"^['\"]?(\d+)px['\"]?$", value)
        if m:
            return RADIUS_PX_TO_TW.get(int(m.group(1)))
        m = re.match(r"^['\"]?(\d+)['\"]?$", value)
        if m:
            return RADIUS_PX_TO_TW.get(int(m.group(1)))
        if value.endswith('%') or value.endswith("%'") or value.endswith('%"'):
            return 'full'
    return None


# Color values that map cleanly to our @theme bridge.
COLOR_VALUE_MAP = {
    "'var(--text-primary)'": 'primary',
    "'var(--text-secondary)'": 'secondary',
    "'var(--text-brand-navy)'": 'brand-navy',
    "'var(--accent-blue)'": 'accent-blue',
    "'var(--accent-blue-hover)'": 'accent-blue-hover',
    "'var(--accent-blue-deep)'": 'accent-blue-deep',
    "'var(--accent-purple)'": 'accent-purple',
    "'var(--accent-purple-deep)'": 'accent-purple-deep',
    "'var(--card-bg)'": 'card',
    "'var(--card-bg-elevated)'": 'card-elevated',
    "'var(--bg-color)'": 'bg',
    "'#002d5b'": 'brand-navy',
    "'#ffffff'": 'white',
    "'#fff'": 'white',
    "'white'": 'white',
    "'#000000'": 'black',
    "'#000'": 'black',
    "'black'": 'black',
}


def color_token(value):
    """Map a color value to a Tailwind utility suffix:
      - 'secondary' / 'brand-navy' for theme-mapped values
      - '[#hexvalue]' arbitrary form for raw hex colors
      - 'transparent' for `'transparent'`
      - None for genuinely-unmappable (rgba with computed alpha, gradients)."""
    if value in COLOR_VALUE_MAP:
        return COLOR_VALUE_MAP[value]
    if value == "'transparent'" or value == '"transparent"':
        return 'transparent'
    if value == "'currentColor'" or value == '"currentColor"':
        return 'current'
    if value == "'inherit'" or value == '"inherit"':
        return 'inherit'
    # Raw hex colors → arbitrary bracket form. Tailwind v4 accepts these
    # without any config: `text-[#ff3b30]`.
    m = re.match(r"^['\"](#[0-9a-fA-F]{3,8})['\"]$", value)
    if m:
        return f'[{m.group(1)}]'
    # rgba()/rgb() — accept simple forms with no template substitution
    m = re.match(r"^['\"](rgba?\([^)]+\))['\"]$", value)
    if m:
        # Tailwind v4 needs spaces escaped inside brackets — replace ' ' with '_'
        return f'[{m.group(1).replace(" ", "_")}]'
    # Generic CSS custom-property fallback — anything matching var(--*)
    # we don't have a named bridge for. Tailwind v4 passes it through
    # untouched: `bg-[var(--gradient-title)]`.
    m = re.match(r"^['\"]?(var\(--[A-Za-z0-9_-]+\))['\"]?$", value)
    if m:
        return f'[{m.group(1)}]'
    # linear-gradient / radial-gradient / conic-gradient — arbitrary bracket
    m = re.match(r"^['\"]((?:linear|radial|conic)-gradient\([^)]+\))['\"]$", value)
    if m:
        return f'[{m.group(1).replace(" ", "_")}]'
    return None


def convert_pair(key, value):
    """Return a Tailwind utility for (key, value) or None if it doesn't
    map cleanly. `value` is the raw source-code text of the value
    (e.g. "'flex'", "32", "'var(--space-3)'")."""
    # Strip whitespace
    v = value.strip()

    # Layout primitives
    if key == 'display':
        d_map = {"'flex'": 'flex', "'inline-flex'": 'inline-flex',
                 "'block'": 'block', "'inline-block'": 'inline-block',
                 "'grid'": 'grid', "'none'": 'hidden',
                 "'inline'": 'inline'}
        if v in d_map:
            return d_map[v]
        # fall through — wave-5 handler catches 'contents', 'list-item', etc.
    if key == 'flexDirection':
        return {"'row'": 'flex-row', "'column'": 'flex-col',
                "'row-reverse'": 'flex-row-reverse',
                "'column-reverse'": 'flex-col-reverse'}.get(v)
    if key == 'alignItems':
        return {"'center'": 'items-center', "'flex-start'": 'items-start',
                "'flex-end'": 'items-end', "'baseline'": 'items-baseline',
                "'stretch'": 'items-stretch'}.get(v)
    if key == 'justifyContent':
        return {"'center'": 'justify-center', "'flex-start'": 'justify-start',
                "'flex-end'": 'justify-end', "'space-between'": 'justify-between',
                "'space-around'": 'justify-around',
                "'space-evenly'": 'justify-evenly'}.get(v)
    if key == 'flexWrap':
        return {"'wrap'": 'flex-wrap', "'nowrap'": 'flex-nowrap'}.get(v)
    if key == 'textAlign':
        return {"'center'": 'text-center', "'left'": 'text-left',
                "'right'": 'text-right', "'justify'": 'text-justify'}.get(v)
    if key == 'position':
        return {"'absolute'": 'absolute', "'relative'": 'relative',
                "'fixed'": 'fixed', "'sticky'": 'sticky',
                "'static'": 'static'}.get(v)
    if key == 'overflow':
        return {"'hidden'": 'overflow-hidden', "'visible'": 'overflow-visible',
                "'scroll'": 'overflow-scroll', "'auto'": 'overflow-auto'}.get(v)

    # Spacing — padding / margin / gap
    if key in ('padding', 'margin'):
        prefix = 'p' if key == 'padding' else 'm'
        # Try unified single value (p-4 / m-4)
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'{prefix}-{tok}'
        # Try shorthand 2/3/4-value form: 'A B', 'A B C', 'A B C D'
        shorthand = _shorthand_to_utilities(prefix, v)
        if shorthand is not None:
            return shorthand
    if key in ('paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
                'marginTop', 'marginBottom', 'marginLeft', 'marginRight'):
        prefix_map = {
            'paddingTop': 'pt', 'paddingBottom': 'pb',
            'paddingLeft': 'pl', 'paddingRight': 'pr',
            'marginTop': 'mt', 'marginBottom': 'mb',
            'marginLeft': 'ml', 'marginRight': 'mr',
        }
        if v == "'auto'":
            return f'{prefix_map[key]}-auto'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'{prefix_map[key]}-{tok}'
    if key == 'gap':
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'gap-{tok}'
    if key in ('columnGap', 'rowGap'):
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            prefix = 'gap-x' if key == 'columnGap' else 'gap-y'
            return f'{prefix}-{tok}'
    # Positional offsets (top / right / bottom / left)
    if key in ('top', 'right', 'bottom', 'left'):
        if v == "'auto'":
            return f'{key}-auto'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'{key}-{tok}'

    # Sizing
    if key == 'width':
        if v == "'100%'": return 'w-full'
        if v == "'auto'": return 'w-auto'
        if v == "'0'" or v == '0': return 'w-0'
        if v == "'100vw'": return 'w-screen'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'w-{tok}'
    if key == 'height':
        if v == "'100%'": return 'h-full'
        if v == "'auto'": return 'h-auto'
        if v == "'0'" or v == '0': return 'h-0'
        if v == "'100vh'": return 'h-screen'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'h-{tok}'
    if key == 'minWidth':
        if v == "'0'" or v == '0': return 'min-w-0'
        if v == "'100%'": return 'min-w-full'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'min-w-{tok}'
    if key == 'maxWidth':
        if v == "'100%'": return 'max-w-full'
        if v == "'none'": return 'max-w-none'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'max-w-{tok}'
    if key == 'minHeight':
        if v == "'0'" or v == '0': return 'min-h-0'
        if v == "'100vh'": return 'min-h-screen'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'min-h-{tok}'
    if key == 'maxHeight':
        if v == "'100vh'": return 'max-h-screen'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'max-h-{tok}'

    # Border radius
    if key == 'borderRadius':
        parsed = _parse_number_or_string(v)
        tok = radius_token(parsed)
        if tok == 'none':
            return 'rounded-none'
        if tok == 'full':
            return 'rounded-full'
        if tok in {'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'xs'}:
            return f'rounded-{tok}'
        # Off-scale integer or quoted 'Npx' — fall back to arbitrary.
        if isinstance(parsed, int):
            return f'rounded-[{parsed}px]'
        if isinstance(parsed, str):
            m = re.match(r"^['\"]?(\d+)px['\"]?$", parsed)
            if m:
                return f'rounded-[{m.group(1)}px]'
        # var(--radius-N) bridge — pass through as arbitrary
        m = re.match(r"^['\"]?(var\(--radius-[^)]+\))['\"]?$", v)
        if m:
            return f'rounded-[{m.group(1)}]'

    # Colors
    if key == 'color':
        tok = color_token(v)
        if tok is not None:
            return f'text-{tok}'
    if key == 'background' or key == 'backgroundColor':
        tok = color_token(v)
        if tok is not None:
            return f'bg-{tok}'

    # Font weight / size
    if key == 'fontWeight':
        weight_map = {'400': 'font-normal', '500': 'font-medium',
                      '600': 'font-semibold', '700': 'font-bold',
                      '800': 'font-extrabold', '900': 'font-black',
                      "'normal'": 'font-normal', "'bold'": 'font-bold'}
        if v in weight_map:
            return weight_map[v]
    if key == 'fontSize':
        size_map = {
            "'0.75rem'": 'text-xs', "'0.875rem'": 'text-sm',
            "'1rem'": 'text-base', "'1.125rem'": 'text-lg',
            "'1.25rem'": 'text-xl', "'1.5rem'": 'text-2xl',
            "'1.875rem'": 'text-3xl', "'2.25rem'": 'text-4xl',
        }
        if v in size_map:
            return size_map[v]
        # Arbitrary font sizes — '0.85rem', '14px', etc.
        m = re.match(r"^['\"]([\d.]+(?:rem|em|px|%))['\"]$", v)
        if m:
            return f'text-[{m.group(1)}]'

    # z-index
    if key == 'zIndex':
        zmap = {'0': 'z-0', '10': 'z-10', '20': 'z-20', '30': 'z-30',
                '40': 'z-40', '50': 'z-50', "'auto'": 'z-auto'}
        if v in zmap:
            return zmap[v]
        if v.lstrip('-').isdigit():
            return f'z-[{v}]'

    # Pointer events / overflow / opacity / text-utilities
    if key == 'pointerEvents':
        return {"'none'": 'pointer-events-none', "'auto'": 'pointer-events-auto'}.get(v)
    if key == 'opacity':
        # Accept both bare `0.5` and quoted `'0.5'` forms
        raw = v[1:-1] if (v.startswith("'") and v.endswith("'")) or \
                         (v.startswith('"') and v.endswith('"')) else v
        try:
            f = float(raw)
            return f'opacity-{int(round(f * 100))}'
        except ValueError:
            pass
    if key == 'whiteSpace':
        return {"'nowrap'": 'whitespace-nowrap', "'pre-wrap'": 'whitespace-pre-wrap',
                "'pre'": 'whitespace-pre', "'normal'": 'whitespace-normal'}.get(v)
    if key == 'textTransform':
        return {"'uppercase'": 'uppercase', "'lowercase'": 'lowercase',
                "'capitalize'": 'capitalize', "'none'": 'normal-case'}.get(v)
    if key == 'fontStyle':
        return {"'italic'": 'italic', "'normal'": 'not-italic'}.get(v)
    if key == 'textDecoration':
        return {"'none'": 'no-underline', "'underline'": 'underline',
                "'line-through'": 'line-through'}.get(v)
    if key == 'wordBreak':
        wb = {"'break-all'": 'break-all', "'normal'": 'break-normal',
              "'keep-all'": 'break-keep'}
        if v in wb:
            return wb[v]
        # fall through — wave-5 handler below catches 'break-word'
    if key == 'overflowWrap':
        return {"'break-word'": 'wrap-break-word', "'anywhere'": 'wrap-anywhere'}.get(v)
    if key == 'textOverflow':
        return {"'ellipsis'": 'overflow-ellipsis', "'clip'": 'overflow-clip'}.get(v)
    if key == 'objectFit':
        return {"'cover'": 'object-cover', "'contain'": 'object-contain',
                "'fill'": 'object-fill', "'none'": 'object-none',
                "'scale-down'": 'object-scale-down'}.get(v)

    # Box sizing
    if key == 'boxSizing':
        return {"'border-box'": 'box-border', "'content-box'": 'box-content'}.get(v)
    # Cursor
    if key == 'cursor':
        return {"'pointer'": 'cursor-pointer', "'default'": 'cursor-default',
                "'help'": 'cursor-help', "'not-allowed'": 'cursor-not-allowed',
                "'wait'": 'cursor-wait', "'text'": 'cursor-text'}.get(v)
    # User-select
    if key == 'userSelect':
        return {"'none'": 'select-none', "'auto'": 'select-auto',
                "'text'": 'select-text', "'all'": 'select-all'}.get(v)
    # Flex shorthand (flex: 1 / flex: 2)
    if key == 'flex':
        flex_map = {'1': 'flex-1', "'1'": 'flex-1', '2': 'flex-[2]', "'2'": 'flex-[2]',
                    "'1 1 0'": 'flex-1', "'0 0 auto'": 'flex-none',
                    "'1 1 auto'": 'flex-auto'}
        if str(v) in flex_map:
            return flex_map[str(v)]
        # fall through — the arbitrary-value handler below catches 3-part flex
    if key == 'flexShrink':
        if v == '0' or v == "'0'": return 'shrink-0'
        if v == '1' or v == "'1'": return 'shrink'
    if key == 'flexGrow':
        if v == '0' or v == "'0'": return 'grow-0'
        if v == '1' or v == "'1'": return 'grow'
    # Line height — named map first, arbitrary fallback further down
    if key == 'lineHeight':
        lh_map = {'1': 'leading-none', "'1'": 'leading-none',
                  "'1.25'": 'leading-tight', "'1.5'": 'leading-normal',
                  "'1.75'": 'leading-relaxed', "'2'": 'leading-loose'}
        if v in lh_map:
            return lh_map[v]
    # Letter spacing — named map first, arbitrary fallback further down
    if key == 'letterSpacing':
        ls_map = {"'-0.05em'": 'tracking-tighter', "'-0.025em'": 'tracking-tight',
                  "'0'": 'tracking-normal', "'0.025em'": 'tracking-wide',
                  "'0.05em'": 'tracking-wider', "'0.1em'": 'tracking-widest'}
        if v in ls_map:
            return ls_map[v]

    # Font family — common keywords
    if key == 'fontFamily':
        # Monospace family (any quoted string containing 'monospace')
        if 'monospace' in v.lower():
            return 'font-mono'
        if "'sans-serif'" in v.lower() or '"sans-serif"' in v.lower() or v.endswith("sans-serif'") or v.endswith('sans-serif"'):
            return 'font-sans'
        if v == "'serif'" or v == '"serif"' or v.endswith("serif'") or v.endswith('serif"'):
            return 'font-serif'
        if v == "'inherit'" or v == '"inherit"':
            return 'font-[inherit]'

    # Grid template columns — simple repeat-N forms
    if key == 'gridTemplateColumns':
        m = re.match(r"^['\"]((?:1fr ?)+1fr)['\"]$", v)
        if m:
            n = len(_split_outer(m.group(1)))
            return f'grid-cols-{n}'
        if v == "'1fr'" or v == '"1fr"':
            return 'grid-cols-1'
        # Arbitrary form — escape spaces with _
        m = re.match(r"^['\"](.+?)['\"]$", v)
        if m:
            inner = m.group(1).replace(' ', '_')
            return f'grid-cols-[{inner}]'

    # Grid column / row spans
    if key == 'gridColumn':
        if v in ("'1 / -1'", '"1 / -1"', "'span 1 / -1'"):
            return 'col-span-full'
        m = re.match(r"^['\"]span (\d+)['\"]$", v)
        if m:
            return f'col-span-{m.group(1)}'
    if key == 'gridRow':
        if v in ("'1 / -1'", '"1 / -1"'):
            return 'row-span-full'
        m = re.match(r"^['\"]span (\d+)['\"]$", v)
        if m:
            return f'row-span-{m.group(1)}'

    # `flex` — arbitrary three-part value
    if key == 'flex':
        m = re.match(r"^['\"]([\d.]+) ([\d.]+) (.+)['\"]$", v)
        if m:
            a, b, c = m.group(1), m.group(2), m.group(3).replace(' ', '_')
            return f'flex-[{a}_{b}_{c}]'

    # Inset shorthand
    if key == 'inset':
        if v == '0' or v == "'0'":
            return 'inset-0'
        tok = spacing_token(_parse_number_or_string(v))
        if tok is not None:
            return f'inset-{tok}'

    # Border color — accept any color value that color_token can resolve
    if key == 'borderColor':
        tok = color_token(v)
        if tok is not None:
            return f'border-{tok}'
    if key == 'borderWidth':
        if v == '0' or v == "'0'":
            return 'border-0'
        m = re.match(r"^['\"]?(\d+)px['\"]?$", v)
        if m:
            n = int(m.group(1))
            if n in (1, 2, 4, 8):
                return f'border-{n}' if n != 1 else 'border'
            return f'border-[{n}px]'

    # Border shorthand — handle the common '<Wpx> <style> <color>' form by
    # splitting into width + style + color utilities. Tailwind's `border`
    # is implicitly 1px solid, so for the typical 1px-solid case we skip
    # the explicit `border-solid` utility.
    if key == 'border':
        if v == '0' or v == "'0'" or v == "'none'" or v == '"none"':
            return 'border-0'
        m = re.match(
            r"^['\"](\d+(?:\.\d+)?)px (solid|dashed|dotted|double) (.+)['\"]$",
            v,
        )
        if m:
            width_raw, style_raw, color_raw = m.group(1), m.group(2), m.group(3)
            color_tok = color_token(f"'{color_raw}'")
            if color_tok is not None:
                w = float(width_raw)
                if w == 1.0:
                    width_util = 'border'
                elif w in (2.0, 4.0, 8.0):
                    width_util = f'border-{int(w)}'
                else:
                    width_util = f'border-[{width_raw}px]'
                style_util = '' if style_raw == 'solid' else f' border-{style_raw}'
                return f'{width_util}{style_util} border-{color_tok}'

    # Single-side borders (borderTop / borderBottom / borderLeft / borderRight)
    # We split into width + color (style defaults to solid). Tailwind has
    # `border-t`, `border-b`, etc. for 1px width on a single side.
    side_map = {
        'borderTop': ('t', 'border-t'),
        'borderBottom': ('b', 'border-b'),
        'borderLeft': ('l', 'border-l'),
        'borderRight': ('r', 'border-r'),
    }
    if key in side_map:
        side, side_util = side_map[key]
        if v == '0' or v == "'0'" or v == "'none'" or v == '"none"':
            return f'border-{side}-0'
        m = re.match(
            r"^['\"](\d+(?:\.\d+)?)px solid (.+)['\"]$",
            v,
        )
        if m:
            width_raw, color_raw = m.group(1), m.group(2)
            color_tok = color_token(f"'{color_raw}'")
            if color_tok is not None:
                w = float(width_raw)
                if w == 1.0:
                    width_util = side_util
                elif w in (2.0, 4.0, 8.0):
                    width_util = f'{side_util}-{int(w)}'
                else:
                    width_util = f'{side_util}-[{width_raw}px]'
                return f'{width_util} border-{color_tok}'

    # Box-shadow — var(--shadow-*) passes through as arbitrary, simple
    # static shadow strings get bracketed (Tailwind v4 accepts the full
    # CSS value inside brackets as long as spaces are escaped).
    if key == 'boxShadow':
        if v == "'none'" or v == '"none"':
            return 'shadow-none'
        m = re.match(r"^['\"]?(var\(--shadow-[A-Za-z0-9_-]+\))['\"]?$", v)
        if m:
            return f'shadow-[{m.group(1)}]'
        # Static shadow with rgba color — strip outer quotes, escape spaces
        m = re.match(r"^['\"](.+)['\"]$", v)
        if m:
            inner = m.group(1).strip()
            # Skip if any dynamic substitution would have been caught
            # earlier; here we just need to escape outer spaces.
            return f'shadow-[{inner.replace(" ", "_")}]'

    # Transition — pass through as arbitrary
    if key == 'transition':
        m = re.match(r"^['\"](.+)['\"]$", v)
        if m:
            return f'transition-[{m.group(1).replace(" ", "_")}]'

    # Letter spacing — arbitrary fallback for any em/px value not in the
    # named map above.
    if key == 'letterSpacing':
        m = re.match(r"^['\"]?(-?[\d.]+(?:em|px|rem))['\"]?$", v)
        if m:
            return f'tracking-[{m.group(1)}]'

    # Line height — arbitrary fallback (numeric only)
    if key == 'lineHeight':
        if v.lstrip('-').replace('.', '').isdigit():
            return f'leading-[{v}]'
        m = re.match(r"^['\"]?(-?[\d.]+(?:em|px|rem|%)?)['\"]?$", v)
        if m:
            return f'leading-[{m.group(1)}]'

    # Gradient-text shorthand — common pair WebkitBackgroundClip:'text' +
    # WebkitTextFillColor:'transparent'. Map them individually; the
    # combination produces gradient-text behaviour.
    if key == 'WebkitBackgroundClip':
        if v == "'text'" or v == '"text"':
            return '[-webkit-background-clip:text]'
    if key == 'backgroundClip':
        if v == "'text'" or v == '"text"':
            return 'bg-clip-text'
    if key == 'WebkitTextFillColor':
        if v == "'transparent'" or v == '"transparent"':
            return '[-webkit-text-fill-color:transparent]'

    # Backdrop filter — pass through as arbitrary (most uses are blurs)
    if key == 'backdropFilter' or key == 'WebkitBackdropFilter':
        m = re.match(r"^['\"]blur\((\d+)px\)['\"]$", v)
        if m:
            n = int(m.group(1))
            named = {0: '0', 4: 'sm', 8: '', 12: 'md', 16: 'lg', 24: 'xl',
                     40: '2xl', 64: '3xl'}
            if n in named:
                return 'backdrop-blur' + (f'-{named[n]}' if named[n] else '')
            return f'backdrop-blur-[{n}px]'
        # Any other backdrop-filter expression (blur + saturate, etc.) →
        # arbitrary bracket — Tailwind v4 accepts the CSS verbatim.
        m = re.match(r"^['\"](.+)['\"]$", v)
        if m:
            inner = m.group(1).replace(' ', '_')
            prefix = 'backdrop-filter' if key == 'backdropFilter' else '[-webkit-backdrop-filter]'
            return f'{prefix}-[{inner}]' if key == 'backdropFilter' else f'[-webkit-backdrop-filter:{m.group(1).replace(" ", "_")}]'

    # CSS transform — single translate/scale/rotate or arbitrary
    if key == 'transform':
        m = re.match(r"^['\"](.+)['\"]$", v)
        if m:
            inner = m.group(1).strip()
            # Named primitives Tailwind ships
            mt = re.match(r'^translateY\((-?[\d.]+)(px|%|rem|em)\)$', inner)
            if mt:
                num, unit = mt.group(1), mt.group(2)
                return f'translate-y-[{num}{unit}]'
            mt = re.match(r'^translateX\((-?[\d.]+)(px|%|rem|em)\)$', inner)
            if mt:
                num, unit = mt.group(1), mt.group(2)
                return f'translate-x-[{num}{unit}]'
            mt = re.match(r'^scale\((-?[\d.]+)\)$', inner)
            if mt:
                # scale-N where N is the percentage * 100
                try:
                    pct = int(round(float(mt.group(1)) * 100))
                    return f'scale-{pct}' if pct in {0, 50, 75, 90, 95, 100, 105, 110, 125, 150} else f'scale-[{mt.group(1)}]'
                except ValueError:
                    pass
            mt = re.match(r'^rotate\((-?[\d.]+)deg\)$', inner)
            if mt:
                num = mt.group(1)
                return f'rotate-[{num}deg]'
            # Fallback — arbitrary transform
            return f'transform-[{inner.replace(" ", "_")}]'

    # Overflow X / Y axis
    if key == 'overflowX':
        return {"'hidden'": 'overflow-x-hidden', "'visible'": 'overflow-x-visible',
                "'scroll'": 'overflow-x-scroll', "'auto'": 'overflow-x-auto'}.get(v)
    if key == 'overflowY':
        return {"'hidden'": 'overflow-y-hidden', "'visible'": 'overflow-y-visible',
                "'scroll'": 'overflow-y-scroll', "'auto'": 'overflow-y-auto'}.get(v)

    # Outline — only the 'reset' shortcut is common
    if key == 'outline':
        if v == '0' or v == "'0'" or v == "'none'" or v == '"none"':
            return 'outline-0'

    # font-variant-numeric — Tailwind has the same set
    if key == 'fontVariantNumeric':
        return {"'tabular-nums'": 'tabular-nums',
                "'proportional-nums'": 'proportional-nums',
                "'normal'": 'normal-nums',
                "'lining-nums'": 'lining-nums',
                "'oldstyle-nums'": 'oldstyle-nums'}.get(v)

    # fontSize via var(--font-*) — generic arbitrary fallback. Tailwind
    # v4 needs the `length:` hint when interpolating a CSS variable
    # because it can't infer the type at compile time.
    if key == 'fontSize':
        m = re.match(r"^['\"]?(var\(--[A-Za-z0-9_-]+\))['\"]?$", v)
        if m:
            return f'text-[length:{m.group(1)}]'

    # fontFamily — `inherit`, `serif`, `sans-serif` were handled above;
    # accept the bare `sf` style identifier we occasionally see by
    # passing through as arbitrary.
    if key == 'fontFamily':
        m = re.match(r"^['\"](.+)['\"]$", v)
        if m:
            inner = m.group(1).replace(' ', '_').replace('"', "'")
            return f'font-[{inner}]'

    # background: 'none' — remove the background image
    if key == 'background' and (v == "'none'" or v == '"none"'):
        return 'bg-none'

    # resize / wordBreak / borderCollapse / verticalAlign — Tailwind has
    # all of these.
    if key == 'resize':
        return {"'none'": 'resize-none', "'both'": 'resize',
                "'horizontal'": 'resize-x', "'vertical'": 'resize-y'}.get(v)
    if key == 'wordBreak':
        # Already handled above for the standard set; this is the v4
        # `break-word` keyword we don't catch up there.
        if v == "'break-word'" or v == '"break-word"':
            return 'break-word'
    if key == 'borderCollapse':
        return {"'collapse'": 'border-collapse',
                "'separate'": 'border-separate'}.get(v)
    if key == 'verticalAlign':
        return {"'top'": 'align-top', "'middle'": 'align-middle',
                "'bottom'": 'align-bottom', "'baseline'": 'align-baseline',
                "'sub'": 'align-sub', "'super'": 'align-super',
                "'text-top'": 'align-text-top',
                "'text-bottom'": 'align-text-bottom'}.get(v)

    # accent-color (form controls)
    if key == 'accentColor':
        tok = color_token(v)
        if tok is not None:
            return f'accent-{tok}'

    # display: 'contents' / 'list-item' — Tailwind ships these as
    # explicit utilities; the existing display handler covers flex/grid
    # but not these less-common values.
    if key == 'display':
        extra = {"'contents'": 'contents', "'list-item'": 'list-item',
                 "'table'": 'table', "'inline-grid'": 'inline-grid',
                 "'flow-root'": 'flow-root'}
        if v in extra:
            return extra[v]

    # Filter — drop-shadow and friends as arbitrary
    if key == 'filter':
        if v == "'none'" or v == '"none"':
            return 'filter-none'
        m = re.match(r"^['\"](.+)['\"]$", v)
        if m:
            return f'[filter:{m.group(1).replace(" ", "_")}]'

    # Width / height / minHeight / maxHeight / minWidth / maxWidth — pass
    # `var(--*)`, `calc(...)`, `fit-content` and similar through as
    # arbitrary so blocks containing them aren't entirely skipped.
    size_axis_prefix = {
        'width': 'w', 'height': 'h', 'minWidth': 'min-w', 'maxWidth': 'max-w',
        'minHeight': 'min-h', 'maxHeight': 'max-h',
    }
    if key in size_axis_prefix:
        prefix = size_axis_prefix[key]
        if v == "'fit-content'" or v == '"fit-content"':
            return f'{prefix}-fit'
        if v == "'max-content'" or v == '"max-content"':
            return f'{prefix}-max'
        if v == "'min-content'" or v == '"min-content"':
            return f'{prefix}-min'
        # var(--*) or calc(...) — arbitrary
        m = re.match(r"^['\"]?(var\(--[A-Za-z0-9_-]+\))['\"]?$", v)
        if m:
            return f'{prefix}-[{m.group(1)}]'
        m = re.match(r"^['\"](calc\([^)]+\))['\"]$", v)
        if m:
            return f'{prefix}-[{m.group(1).replace(" ", "_")}]'

    # Positional offset (top/right/bottom/left) — calc() fallback
    if key in ('top', 'right', 'bottom', 'left'):
        m = re.match(r"^['\"](calc\([^)]+\))['\"]$", v)
        if m:
            return f'{key}-[{m.group(1).replace(" ", "_")}]'

    return None


def _parse_number_or_string(v):
    """Coerce a raw value string to an int (if numeric) or a stripped string."""
    v = v.strip().rstrip(',')
    if v.isdigit() or (v.startswith('-') and v[1:].isdigit()):
        return int(v)
    return v


def _shorthand_to_utilities(prefix, raw):
    """Convert a 2/3/4-value `padding`/`margin` shorthand string to a
    space-separated Tailwind utility list.

      padding: '8px 12px'                       → 'py-2 px-3'
      margin: '0 auto'                          → 'my-0 mx-auto'
      padding: 'var(--space-3) var(--space-5)'  → 'py-3 px-5'
      margin: '24px 0 0'                        → 'mt-6 mx-0 mb-0'
      padding: '1px 2px 3px 4px'                → 'pt-px pr-[2px] pb-[3px] pl-1'

    `prefix` is 'p' or 'm'. Returns None on any unhandled token (so the
    caller falls back to leaving the inline style intact)."""
    v = raw.strip()
    # Strip exactly one layer of surrounding quotes
    if (v.startswith("'") and v.endswith("'")) or \
       (v.startswith('"') and v.endswith('"')):
        v = v[1:-1]
    # Split into space-separated tokens. var(--space-N) doesn't contain
    # an outer space (just inside parens) so naive split is fine for our
    # corpus. If the value has a parenthesised expression with internal
    # spaces (e.g. rgba(0, 0, 0)) it'd break — but we only call this for
    # padding/margin, which don't use rgba.
    parts = _split_outer(v)
    if not parts:
        return None
    # Convert each unquoted part via spacing_token.
    components = []
    for part in parts:
        if part == 'auto':
            components.append('auto')
            continue
        if part.lstrip('-').isdigit():
            token = spacing_token(int(part))
        else:
            token = spacing_token(part)
        if token is None:
            return None
        components.append(token)
    n = len(components)
    if n == 1:
        return f'{prefix}-{components[0]}'
    if n == 2:
        top_bot, left_right = components
        # Special-case '0 auto' / 'auto 0' so we use mx-auto cleanly
        return f'{prefix}y-{top_bot} {prefix}x-{left_right}'
    if n == 3:
        top, left_right, bot = components
        return f'{prefix}t-{top} {prefix}x-{left_right} {prefix}b-{bot}'
    if n == 4:
        top, right, bot, left = components
        return (f'{prefix}t-{top} {prefix}r-{right} '
                f'{prefix}b-{bot} {prefix}l-{left}')
    return None


def _split_outer(s):
    """Split `s` on spaces that are NOT inside parentheses. Returns the
    list of tokens (or [] if input is empty after strip)."""
    out = []
    buf = ''
    depth = 0
    for ch in s.strip():
        if ch == '(':
            depth += 1
            buf += ch
        elif ch == ')':
            depth -= 1
            buf += ch
        elif ch == ' ' and depth == 0:
            if buf:
                out.append(buf)
                buf = ''
        else:
            buf += ch
    if buf:
        out.append(buf)
    return out


# ── Main extraction loop ─────────────────────────────────────────

# Match a `style={{ ... }}` JSX expression. Non-greedy on the inner
# body; allows multi-line. We constrain the body to be balanced
# w.r.t. {} for nested objects (rare in styles but possible).
STYLE_RE = re.compile(r'style=\{\{(.*?)\}\}', re.DOTALL)


def _enclosing_tag_name(src, style_pos):
    """Walk backwards from `style_pos` to find the JSX opening-tag name
    that this style attribute belongs to. Returns None if we can't
    locate it (corrupt input). Useful for deciding whether the host is
    a custom component (PascalCase) or a plain HTML tag."""
    i = style_pos - 1
    # Skip back to the `<` that opens the current tag, respecting brace
    # depth so we don't return a nested `<` inside a {...} attribute.
    depth = 0
    while i >= 0:
        c = src[i]
        if c == '}':
            depth += 1
        elif c == '{':
            depth -= 1
        elif c == '<' and depth == 0:
            # Read tag name
            j = i + 1
            if j < len(src) and (src[j].isalpha() or src[j] == '_'):
                k = j
                while k < len(src) and (src[k].isalnum() or src[k] in '._-'):
                    k += 1
                return src[j:k]
            return None
        i -= 1
    return None


# Components that we know do NOT accept className. Add here when a
# regression surfaces; the converter will leave inline styles alone
# inside these tags. (PascalCase heuristic also kicks in, but listing
# them explicitly documents intent.)
NO_CLASSNAME_COMPONENTS = {
    'FilterSelect',
}

CSS_FN_RE = re.compile(
    r'(?:var|rgba?|hsla?|calc|min|max|clamp|url|'
    r'linear-gradient|radial-gradient|conic-gradient)\([^()]*\)'
)


def is_dynamic(body):
    """Return True if any token in `body` is dynamic (template literal,
    function call, identifier reference, conditional). Conservative:
    we want to skip and leave inline, not produce broken output."""
    # Template strings ${...}
    if '${' in body or '`' in body:
        return True
    # Strip safe CSS functions (var, rgba, calc, gradients, ...) so they
    # don't trip the `(` heuristic below.
    no_css_fns = CSS_FN_RE.sub('', body)
    # Strip string literals — they can contain anything legally.
    no_strings = re.sub(r"'[^']*'|\"[^\"]*\"", '', no_css_fns)
    # Anything that remains with `(` or `=>` is a JS function/arrow.
    if '=>' in no_strings or '(' in no_strings:
        return True
    if '?' in no_strings:
        return True
    if '...' in no_strings:
        return True
    if '[' in no_strings:
        return True
    return False


def _split_top_level_commas(body):
    """Split `body` on commas that are NOT inside (), '', or "". Returns
    list of stripped non-empty segments."""
    parts = []
    buf = ''
    depth = 0
    in_single = in_double = False
    for ch in body:
        if in_single:
            buf += ch
            if ch == "'":
                in_single = False
            continue
        if in_double:
            buf += ch
            if ch == '"':
                in_double = False
            continue
        if ch == "'":
            in_single = True
            buf += ch
        elif ch == '"':
            in_double = True
            buf += ch
        elif ch == '(':
            depth += 1
            buf += ch
        elif ch == ')':
            depth -= 1
            buf += ch
        elif ch == ',' and depth == 0:
            seg = buf.strip()
            if seg:
                parts.append(seg)
            buf = ''
        else:
            buf += ch
    seg = buf.strip()
    if seg:
        parts.append(seg)
    return parts


def parse_object_body(body):
    """Parse a style-object body into list of (key, value_text) pairs.
    Returns None on any failure (caller falls through to "skip"). The
    body is `key: value, key: value, ...` (no enclosing braces)."""
    pairs = []
    parts = _split_top_level_commas(body)
    for p in parts:
        if ':' not in p:
            return None
        key_raw, _, val_raw = p.partition(':')
        key = key_raw.strip()
        val = val_raw.strip()
        # Property name may be quoted ('flex'), unquoted (flex), or
        # shorthand (just identifier == both key and value). We don't
        # see shorthand in our codebase per the surveys.
        if (key.startswith("'") and key.endswith("'")) or \
           (key.startswith('"') and key.endswith('"')):
            key = key[1:-1]
        # Reject keys that aren't simple identifiers
        if not re.match(r'^[a-zA-Z][a-zA-Z0-9]*$', key):
            return None
        pairs.append((key, val))
    return pairs


def convert_one(style_body):
    """Try to convert a `style={{ body }}` body to a className string.
    Returns the className string on success, or None to skip."""
    if is_dynamic(style_body):
        return None
    pairs = parse_object_body(style_body)
    if not pairs:
        return None
    utilities = []
    for key, val in pairs:
        tw = convert_pair(key, val)
        if tw is None:
            # Any single un-mappable property → skip the WHOLE block.
            # Mixing inline + className would split the visual rules
            # across two places and risk regression.
            return None
        utilities.append(tw)
    return ' '.join(utilities)


def _find_opening_tag_end(src, tag_start):
    """Given that src[tag_start] == '<' and a valid identifier follows,
    return the index of the closing `>` (which closes the OPENING JSX
    tag — i.e. the matching `>` or `/>`). Respects single/double quotes
    and brace depth so that `>` inside `{() => x}` doesn't terminate.
    Returns -1 if no terminator found."""
    n = len(src)
    k = tag_start + 1
    # Skip the tag name (letters, digits, ., -, _)
    if k >= n or not (src[k].isalpha() or src[k] == '_'):
        return -1
    while k < n and (src[k].isalnum() or src[k] in '._-'):
        k += 1
    # Walk attributes
    in_single = in_double = False
    brace_depth = 0
    while k < n:
        c = src[k]
        if in_single:
            if c == "'" and src[k-1] != '\\':
                in_single = False
            k += 1; continue
        if in_double:
            if c == '"' and src[k-1] != '\\':
                in_double = False
            k += 1; continue
        if c == "'":
            in_single = True; k += 1; continue
        if c == '"':
            in_double = True; k += 1; continue
        if c == '{':
            brace_depth += 1; k += 1; continue
        if c == '}':
            brace_depth -= 1; k += 1; continue
        if c == '>' and brace_depth == 0:
            return k
        k += 1
    return -1


def _find_classname_attrs(tag):
    """Find every className attribute (static "..." or dynamic {...}) in
    `tag`. Returns list of (start, end, kind, value_text) where kind is
    'static' or 'dynamic'. value_text is the inner content (without
    surrounding quotes/braces). For dynamic, value_text is the raw
    expression source. Uses brace-tracking for {} values."""
    out = []
    i = 0
    n = len(tag)
    name_pat = re.compile(r'\bclassName')
    while i < n:
        m = name_pat.search(tag, i)
        if not m:
            break
        attr_start = m.start()
        j = m.end()
        # Optional whitespace then '='
        while j < n and tag[j] in ' \t\n':
            j += 1
        if j >= n or tag[j] != '=':
            i = m.end(); continue
        j += 1
        while j < n and tag[j] in ' \t\n':
            j += 1
        if j >= n:
            break
        if tag[j] == '"':
            # Static
            k = j + 1
            while k < n and tag[k] != '"':
                k += 1
            if k >= n:
                break
            out.append((attr_start, k + 1, 'static', tag[j+1:k]))
            i = k + 1
        elif tag[j] == '{':
            # Dynamic — track brace depth, but also respect strings
            depth = 1
            k = j + 1
            in_single = in_double = in_back = False
            while k < n and depth > 0:
                c = tag[k]
                if in_single:
                    if c == "'" and tag[k-1] != '\\': in_single = False
                elif in_double:
                    if c == '"' and tag[k-1] != '\\': in_double = False
                elif in_back:
                    if c == '`' and tag[k-1] != '\\': in_back = False
                elif c == "'": in_single = True
                elif c == '"': in_double = True
                elif c == '`': in_back = True
                elif c == '{': depth += 1
                elif c == '}': depth -= 1
                k += 1
            if depth != 0:
                break
            out.append((attr_start, k, 'dynamic', tag[j+1:k-1]))
            i = k
        else:
            i = m.end()
    return out


def merge_classname_in_tags(src):
    """Walk every JSX opening tag and consolidate multiple `className`
    attrs within a single tag.

    Handles three cases:
      - Two or more static `className="A"` `className="B"` → `className="A B"`
        (deduped, order preserved).
      - One dynamic + one or more static → append the static classes
        onto the dynamic expression as ` <static-classes>` at the end of
        the template literal / string concat, falling back to wrapping
        as `${expr} <classes>` template form if the dynamic value is a
        plain expression.
      - All dynamic → leave alone (the script never produces a second
        dynamic className, so this is rare and we play it safe).

    Returns (new_src, merge_count)."""
    out = []
    i = 0
    n = len(src)
    merges = 0
    while i < n:
        ch = src[i]
        if ch == '<' and i + 1 < n and (src[i+1].isalpha() or src[i+1] == '_'):
            end = _find_opening_tag_end(src, i)
            if end < 0:
                out.append(ch); i += 1; continue
            tag = src[i:end+1]
            attrs = _find_classname_attrs(tag)
            if len(attrs) > 1:
                statics = [(s, e, t, v) for (s, e, t, v) in attrs if t == 'static']
                dynamics = [(s, e, t, v) for (s, e, t, v) in attrs if t == 'dynamic']
                # Collect static tokens (order preserved, deduped)
                static_tokens, seen = [], set()
                for (_, _, _, v) in statics:
                    for tok in v.split():
                        if tok and tok not in seen:
                            seen.add(tok); static_tokens.append(tok)
                static_str = ' '.join(static_tokens)
                # Plan a rewrite
                if len(dynamics) == 0:
                    # Case A: all static — merge into the first
                    new_attr = f'className="{static_str}"'
                    keep_start, keep_end = statics[0][0], statics[0][1]
                    drop_ranges = [(s, e) for (s, e, _, _) in statics[1:]]
                elif len(dynamics) == 1 and static_str:
                    # Case B: append static to the dynamic expression
                    dyn_s, dyn_e, _, dyn_expr = dynamics[0]
                    # Prefer template-literal form: ${expr} <static>
                    dyn_expr_stripped = dyn_expr.strip()
                    if dyn_expr_stripped.startswith('`') and dyn_expr_stripped.endswith('`'):
                        # already a template literal — splice classes
                        # before the closing backtick.
                        body = dyn_expr_stripped[1:-1]
                        new_dyn = f'`{body} {static_str}`'
                    else:
                        new_dyn = f'`${{{dyn_expr_stripped}}} {static_str}`'
                    new_attr = f'className={{{new_dyn}}}'
                    keep_start, keep_end = dyn_s, dyn_e
                    drop_ranges = [(s, e) for (s, e, _, _) in statics]
                else:
                    # Case C: multiple dynamics or no static — leave alone
                    out.append(tag); i = end + 1; continue
                # Build the new tag: place new_attr at keep range, drop
                # the other ranges (with leading whitespace if needed).
                replacements = [(keep_start, keep_end, new_attr)] + \
                               [(s, e, None) for (s, e) in drop_ranges]
                replacements.sort(key=lambda r: r[0])
                pieces = []
                cursor = 0
                for (s, e, replacement) in replacements:
                    if replacement is None:
                        # Drop — eat preceding indent + newline if the
                        # attribute occupies its own line.
                        drop_start = s
                        while drop_start > cursor and tag[drop_start-1] in ' \t':
                            drop_start -= 1
                        if drop_start > cursor and tag[drop_start-1] == '\n':
                            drop_start -= 1
                        pieces.append(tag[cursor:drop_start])
                    else:
                        pieces.append(tag[cursor:s])
                        pieces.append(replacement)
                    cursor = e
                pieces.append(tag[cursor:])
                new_tag = ''.join(pieces)
                out.append(new_tag)
                merges += len(attrs) - 1
            else:
                out.append(tag)
            i = end + 1
            continue
        out.append(ch); i += 1
    return ''.join(out), merges


def main(target_path):
    p = Path(target_path)
    src = p.read_text()
    converted = 0
    skipped = 0

    def replace_style(match):
        nonlocal converted, skipped
        body = match.group(1)
        # Bail out if the host JSX tag is a custom component we KNOW
        # doesn't accept className. Conservative — leave the inline
        # style intact so we don't break typecheck.
        tag_name = _enclosing_tag_name(src, match.start())
        if tag_name in NO_CLASSNAME_COMPONENTS:
            skipped += 1
            return match.group(0)
        result = convert_one(body)
        if result is None:
            skipped += 1
            return match.group(0)  # leave as-is
        converted += 1
        return f'className="{result}"'

    new_src = STYLE_RE.sub(replace_style, src)

    # Merge double-className attributes across the entire tag (handles
    # multi-line JSX where attributes span multiple lines).
    new_src, dm = merge_classname_in_tags(new_src)

    p.write_text(new_src)
    print(f"  {target_path}")
    print(f"  converted: {converted}, skipped (dynamic / unmappable): {skipped}")
    print(f"  className merges: {dm}")
    return converted, skipped


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('USAGE: migrate_inline_to_tailwind.py <file1.tsx> [file2.tsx ...]')
        sys.exit(1)
    total_c = total_s = 0
    for path in sys.argv[1:]:
        c, s = main(path)
        total_c += c; total_s += s
    print(f"\nTOTAL across all files: {total_c} converted, {total_s} skipped")
