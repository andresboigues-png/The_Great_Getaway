/**
 * 4.8 design (DSGN-2): inline-SVG line-icon helper.
 *
 * Sharp, Apple-like monochrome icons (Lucide-style, 24×24, stroke =
 * currentColor) to replace emoji used as UI chrome. No dependency, no
 * web-font — the SVG is inlined and inherits the surrounding text colour
 * (so it adapts to dark mode + the neutral-ink unification for free) and
 * stays crisp at any size.
 *
 * The nav / sidebar / bottom-tab icons were ALREADY inline SVGs; this
 * helper covers the remaining emoji-as-icon spots (button + card labels).
 * Semantic emoji that carry meaning — country flags, reactions — are
 * intentionally NOT replaced.
 *
 * `iconSvg(name)` returns an HTML string for the vanilla-TS template
 * surfaces (modals, pathTab, etc.). A React `<Icon>` wrapper can read the
 * same `ICON_PATHS` when a TSX surface needs one.
 */
export const ICON_PATHS: Record<string, string> = {
    // clipboard-list — trip checklist
    checklist:
        '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>' +
        '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
        '<path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    // list — open full plan
    plan:
        '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/>' +
        '<line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/>' +
        '<line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
    // map-pin — set/edit anchor pin
    pin:
        '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    // paperclip — documents
    document:
        '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    // image — photos
    photo:
        '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/>' +
        '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    // pen-line — journaling
    journal:
        '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    // trash-2 — delete day
    trash:
        '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
        '<line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
};

/** Leading-emoji stripper — removes a run of pictographic glyphs (+
 *  variation selectors / ZWJ / spaces) from the START of a label, so a
 *  locale string like "📝 Trip checklist" renders as "Trip checklist"
 *  next to an inline icon, WITHOUT editing every locale file. Locale-
 *  agnostic (strips whatever leading emoji each translation uses). */
export function stripLeadingEmoji(label: string): string {
    if (!label) return label;
    return label.replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '');
}

/** Inline-SVG icon as an HTML string for vanilla-TS template surfaces.
 *  Returns '' for an unknown name so a missing icon degrades to text. */
export function iconSvg(name: string, opts: { size?: number; cls?: string } = {}): string {
    const path = ICON_PATHS[name];
    if (!path) return '';
    const size = opts.size ?? 18;
    const cls = opts.cls ? ` class="${opts.cls}"` : '';
    return (
        `<svg${cls} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
        'aria-hidden="true" style="flex-shrink:0;vertical-align:-3px">' +
        path +
        '</svg>'
    );
}
