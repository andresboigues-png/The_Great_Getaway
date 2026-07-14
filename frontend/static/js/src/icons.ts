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
    // list-ordered (1·2·3 numbered steps) — "quick guide" / getting-started
    // (was sharing the compass icon with Discover, which read as a duplicate).
    guide:
        '<line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/>' +
        '<line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/>' +
        '<path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    // winding pathway — Path tab + "public, plan only" visibility
    path: '<path d="M9 3c0 4 6 5 6 9s-6 5-6 9"/>',
    // arrow-left — back navigation
    arrowLeft: '<line x1="19" x2="5" y1="12" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    // rotate-ccw — restore / unarchive a completed trip
    restore: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    // heart — public likes a shared trip collected (shown in collections)
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
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
    // calendar — dates (📅)
    calendar:
        '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/>' +
        '<path d="M3 10h18"/>',
    // pin (filled-ish location) — "pin this day" (📌)
    pinned:
        '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z"/>',
    // megaphone — "shared a trip" (📣)
    megaphone:
        '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    // map — trip card (🗺️)
    map:
        '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/>' +
        '<path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
    // flag — trip archived / finished (🏁)
    flag:
        '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>' +
        '<line x1="4" x2="4" y1="22" y2="15"/>',
    // users — someone joined a trip (👥)
    users:
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
        '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    // user-plus — new friendship (🤝)
    userPlus:
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>' +
        '<line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
    // repeat — reposted a trip (🔁)
    repost:
        '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>' +
        '<polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    // award — achievement unlocked (🏅)
    award:
        '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    // handshake — settled up (🤝, money)
    handshake:
        '<path d="m11 17 2 2a1 1 0 1 0 3-3"/>' +
        '<path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/>' +
        '<path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    // sparkles — generic/default feed event (✨)
    sparkles:
        '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
    // wallet — money / amount spent (💰)
    wallet:
        '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>' +
        '<path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
    // bar-chart — budgets (📊)
    barChart:
        '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    // tag — categories (🏷️)
    tag:
        '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/>' +
        '<circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    // compass — quick access / explore (🧭)
    compass:
        '<circle cx="12" cy="12" r="10"/>' +
        '<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    // zap — all-done / fast (⚡️)
    zap:
        '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    // plane — create / pick a trip (✈️)
    plane:
        '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    // lock — sign in (🔐)
    lock:
        '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>' +
        '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    // folder — collections (📂)
    folder:
        '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    // smartphone — friends / install (📱)
    smartphone:
        '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    // plus — add (➕)
    plus:
        '<path d="M5 12h14"/><path d="M12 5v14"/>',
    // info — explainer / "how is this calculated" (ⓘ)
    info:
        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    // lightbulb — tip / idea (💡)
    lightbulb:
        '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
        '<path d="M9 18h6"/><path d="M10 22h4"/>',
    // search — search / no results (🔍)
    search:
        '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    // user — single person (👤)
    user:
        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    // palette — appearance / theme (🎨)
    palette:
        '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>' +
        '<circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>' +
        '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
    // globe — language / region (🌐)
    globe:
        '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    // arrow-left-right — exchange rates / FX (💱)
    exchange:
        '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    // trending-up — inflation (📈)
    trendingUp:
        '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',

    // ── Transport modes (replacing the 🚶🚇🚌… emoji set). GG line-icon
    //    style, inherit currentColor. Mapped from mode → key in
    //    pages/home/transportModal.ts::transportModeIcon. ──────────────
    // footprints — walk (🚶)
    footprints:
        '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/>' +
        '<path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>' +
        '<path d="M16 17h4"/><path d="M4 13h4"/>',
    // train-front-tunnel — metro (🚇)
    metro:
        '<path d="M2 22V12a10 10 0 1 1 20 0v10"/><path d="M15 6.8v1.4a3 3 0 0 1-3 3 3 3 0 0 1-3-3V6.8"/>' +
        '<path d="M10 15h.01"/><path d="M14 15h.01"/>' +
        '<path d="M10 19a4 4 0 0 1-4-4v-3a6 6 0 1 1 12 0v3a4 4 0 0 1-4 4Z"/><path d="m9 19-2 3"/><path d="m15 19 2 3"/>',
    // bus — bus (🚌)
    bus:
        '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>' +
        '<path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/>' +
        '<circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
    // train-front — train (🚆)
    train:
        '<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/>' +
        '<path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>',
    // tram-front — tram (🚊)
    tram:
        '<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/>' +
        '<path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/>',
    // car — car (🚗)
    car:
        '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>' +
        '<circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    // car-taxi-front — taxi (🚕)
    taxi:
        '<path d="M10 2h4"/><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/>' +
        '<path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/>' +
        '<path d="M5 18v2"/><path d="M19 18v2"/>',
    // bike — bike (🚴)
    bike:
        '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/>' +
        '<circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    // ship — ferry (⛴️)
    ferry:
        '<path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>' +
        '<path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/>' +
        '<path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    // shuffle — mixed (🔀)
    shuffle:
        '<path d="m18 2 4 4-4 4"/>' +
        '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/>' +
        '<path d="m18 14 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/>' +
        '<path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/>',
    // route — neutral "getting around" / transport-not-set (was 🚌 placeholder)
    route:
        '<circle cx="6" cy="19" r="3"/>' +
        '<path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
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

/** Remove ALL emoji / decorative pictographs from a string (leading,
 *  trailing, or mid) and tidy whitespace. Used for page TITLES, which go
 *  text-only + sharp (no icon) — e.g. "Search 🔍" → "Search", "Plan with
 *  AI ✦" → "Plan with AI". Covers Extended_Pictographic + the misc-
 *  symbols/dingbats range (✦ ✨ ⚖️) + variation selectors / ZWJ / keycaps.
 *  The Arrows block (→ in "Configure →") is outside these ranges, so CTA
 *  arrows are preserved. */
export function stripEmoji(label: string): string {
    if (!label) return label;
    return label
        // eslint-disable-next-line no-misleading-character-class -- intentional: stripping leftover emoji-sequence marks (VS16 / ZWJ / combining keycap), not matching standalone glyphs.
        .replace(/[\p{Extended_Pictographic}☀-➿️‍⃣]/gu, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
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
