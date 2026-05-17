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
        m = re.match(r'(\d+)px$', value)
        if m:
            return RADIUS_PX_TO_TW.get(int(m.group(1)))
        if value.isdigit():
            return RADIUS_PX_TO_TW.get(int(value))
        if value.endswith('%'):
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
    return None


def convert_pair(key, value):
    """Return a Tailwind utility for (key, value) or None if it doesn't
    map cleanly. `value` is the raw source-code text of the value
    (e.g. "'flex'", "32", "'var(--space-3)'")."""
    # Strip whitespace
    v = value.strip()

    # Layout primitives
    if key == 'display':
        return {"'flex'": 'flex', "'inline-flex'": 'inline-flex',
                "'block'": 'block', "'inline-block'": 'inline-block',
                "'grid'": 'grid', "'none'": 'hidden',
                "'inline'": 'inline'}.get(v)
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
        return {"'break-all'": 'break-all', "'normal'": 'break-normal',
                "'keep-all'": 'break-keep'}.get(v)
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
    # Line height
    if key == 'lineHeight':
        return {'1': 'leading-none', "'1'": 'leading-none',
                "'1.25'": 'leading-tight', "'1.5'": 'leading-normal',
                "'1.75'": 'leading-relaxed', "'2'": 'leading-loose'}.get(v)
    # Letter spacing
    if key == 'letterSpacing':
        return {"'-0.05em'": 'tracking-tighter', "'-0.025em'": 'tracking-tight',
                "'0'": 'tracking-normal', "'0.025em'": 'tracking-wide',
                "'0.05em'": 'tracking-wider', "'0.1em'": 'tracking-widest'}.get(v)

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

    # Single-side borders we can't shorthand are skipped (would split into
    # border-width + border-color + border-style — too risky mechanically).

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


def merge_classname_in_tags(src):
    """Walk every JSX opening tag and merge multiple static className=""
    attrs within a single tag (handles multi-line tags). Returns
    (new_src, merge_count)."""
    out = []
    i = 0
    n = len(src)
    merges = 0
    cn_pat = re.compile(r'\bclassName="([^"]*)"')
    while i < n:
        ch = src[i]
        if ch == '<' and i + 1 < n and (src[i+1].isalpha() or src[i+1] == '_'):
            end = _find_opening_tag_end(src, i)
            if end < 0:
                out.append(ch); i += 1; continue
            tag = src[i:end+1]
            matches = list(cn_pat.finditer(tag))
            if len(matches) > 1:
                # Merge unique tokens preserving order
                tokens, seen = [], set()
                for m in matches:
                    for tok in m.group(1).split():
                        if tok and tok not in seen:
                            seen.add(tok); tokens.append(tok)
                merged_attr = f'className="{" ".join(tokens)}"'
                # Rebuild tag: replace FIRST match with merged, drop the
                # rest (along with their preceding indent/space so we
                # don't leave dangling blank lines).
                pieces = [tag[:matches[0].start()], merged_attr]
                cursor = matches[0].end()
                for m in matches[1:]:
                    # Eat preceding whitespace (incl. newline)
                    drop_start = m.start()
                    while drop_start > cursor and tag[drop_start-1] in ' \t':
                        drop_start -= 1
                    if drop_start > cursor and tag[drop_start-1] == '\n':
                        drop_start -= 1
                    pieces.append(tag[cursor:drop_start])
                    cursor = m.end()
                pieces.append(tag[cursor:])
                new_tag = ''.join(pieces)
                out.append(new_tag)
                merges += len(matches) - 1
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
