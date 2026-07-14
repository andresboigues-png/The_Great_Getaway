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

    // ── Emoji-strip sweep: GG line-icons (Lucide-sourced, stroke=currentColor)
    //    replacing the app's remaining emoji as UI chrome, POI/expense category
    //    glyphs, weather, day-parts, vibes and badges. Data-key emoji keep their
    //    STORED value; only the render maps through emojiToIconKey() below. ──────
    close:
        '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check:
        '<path d="M20 6 9 17l-5-5"/>',
    star:
        '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    edit:
        '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
    eye:
        '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    bed:
        '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
    utensils:
        '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    shoppingCart:
        '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
    landmark:
        '<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
    tree:
        '<path d="M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z"/><path d="M12 19v3"/>',
    church:
        '<path d="M10 9h4"/><path d="M12 7v5"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="m18 9 3.52 2.147a1 1 0 0 1 .48.854V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.999a1 1 0 0 1 .48-.854L6 9"/><path d="M6 21V7a1 1 0 0 1 .376-.782l5-3.999a1 1 0 0 1 1.249.001l5 4A1 1 0 0 1 18 7v14"/>',
    hospital:
        '<path d="M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z"/>',
    stethoscope:
        '<path d="M11 2v2"/><path d="M5 2v2"/><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1"/><path d="M8 15a6 6 0 0 0 12 0v-3"/><circle cx="20" cy="10" r="2"/>',
    pawPrint:
        '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>',
    graduationCap:
        '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    stadium:
        '<path d="M11 7a16 16 20 0 1 10.98 4.362"/><path d="M12 12a13 13 0 0 1-8.66 5"/><path d="M16.83 13.634a16 16 0 0 1-9.267 7.328"/><path d="M20.66 17A13 13 0 0 0 12 12a13 13 0 0 1 0-10"/><path d="M8.17 15.366a16 16 0 0 1-1.713-11.69"/><circle cx="12" cy="12" r="10"/>',
    pill:
        '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    clock:
        '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    sun:
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon:
        '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
    sunrise:
        '<path d="M12 2v8"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m8 6 4-4 4 4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
    cloud:
        '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    cloudSun:
        '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
    cloudRain:
        '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
    cloudLightning:
        '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
    snowflake:
        '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>',
    cloudFog:
        '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path d="M17 21H9"/>',
    wind:
        '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
    bookmark:
        '<path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/>',
    link:
        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    mail:
        '<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/>',
    upload:
        '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    scale:
        '<path d="M12 3v18"/><path d="m19 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1"/><path d="m5 8 3 8a5 5 0 0 1-6 0zV7"/><path d="M7 21h10"/>',
    crown:
        '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
    croissant:
        '<path d="M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487"/><path d="M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132"/><path d="M18 5a4 3 0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42"/><path d="M5 18a3 4 0 0 0 3 4 2 2 0 0 0 2-2 10 10 0 0 1 1.42-5.14"/><path d="M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 0-1.626-.676"/>',
    salad:
        '<path d="M7 21h10"/><path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z"/><path d="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1"/><path d="m13 12 4-4"/><path d="M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2"/>',
    wine:
        '<path d="M8 22h8"/><path d="M7 10h10"/><path d="M12 15v7"/><path d="M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>',
    coffee:
        '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
    ticket:
        '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/>',
    shoppingBag:
        '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>',
    iceCream:
        '<path d="m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11"/><path d="M17 7A5 5 0 0 0 7 7"/><path d="M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4"/>',
    theater:
        '<path d="M10 11h.01"/><path d="M14 6h.01"/><path d="M18 6h.01"/><path d="M6.5 13.1h.01"/><path d="M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3"/><path d="M17.4 9.9c-.8.8-2 .8-2.8 0"/><path d="M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7"/><path d="M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4"/>',
    fuel:
        '<path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5"/><path d="M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16"/><path d="M2 21h13"/><path d="M3 9h11"/>',
    parking:
        '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
    home:
        '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    shirt:
        '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
    gift:
        '<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/>',
    flame:
        '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    briefcase:
        '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    cookie:
        '<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/>',
    beer:
        '<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/>',
    gem:
        '<path d="M10.5 3 8 9l4 13 4-13-2.5-6"/><path d="M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z"/><path d="M2 9h20"/>',
    suitcase:
        '<path d="M6 20a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2"/><path d="M8 18V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14"/><path d="M10 20h4"/><circle cx="16" cy="20" r="2"/><circle cx="8" cy="20" r="2"/>',
    books:
        '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    monitor:
        '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    leaf:
        '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    alertTriangle:
        '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    externalLink:
        '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    lifebuoy:
        '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/>',
    circle:
        '<circle cx="12" cy="12" r="10"/>',
    backpack:
        '<path d="M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 10h8"/><path d="M8 18h8"/><path d="M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
    party:
        '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/>',
    checkSquare:
        '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
    square:
        '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    wave:
        '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
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

/**
 * Emoji → GG icon-key map. The single source of truth for the "emoji-strip"
 * render swap: DATA-KEY emoji that persist to the DB (POI/expense category
 * `icon`, MarkedPlace.icon, weather glyphs, backend badge emoji, AI meal-plan
 * headers) keep their STORED value untouched — only the RENDER routes the
 * stored glyph through here to draw a GG line-icon instead. Also covers pure
 * chrome glyphs so any surface can `iconForEmoji(glyph)` without a per-site
 * lookup.
 *
 * Country flags (regional-indicator sequences) and true reactions are
 * deliberately ABSENT → they return null → callers keep the emoji (policy).
 *
 * Keys are normalised to strip the VS16 variation selector (U+FE0F) so '✈' and
 * '✈️' both resolve — write the literal however it is convenient.
 */
const _EMOJI_ICON_RAW: Record<string, string> = {
    // food & dining
    '🍽️': 'utensils', '🍔': 'utensils', '🍕': 'utensils', '🥐': 'croissant',
    '🥗': 'salad', '🍷': 'wine', '☕': 'coffee', '🍦': 'iceCream',
    '🍪': 'cookie', '🍻': 'beer', '🍹': 'beer', '🥂': 'handshake',
    // shopping & goods
    '🛒': 'shoppingCart', '🛍️': 'shoppingBag', '🎁': 'gift', '👕': 'shirt',
    // lodging & home
    '🛏️': 'bed', '🏨': 'bed', '🏠': 'home', '🏡': 'home',
    // transport
    '✈️': 'plane', '🛬': 'plane', '🚕': 'taxi', '🚗': 'car', '🚆': 'train',
    '🚉': 'train', '🚇': 'metro', '🚌': 'bus', '🚊': 'tram', '🚴': 'bike',
    '🚶': 'footprints', '⛴️': 'ferry', '🔀': 'shuffle', '🛣️': 'route',
    '🚠': 'route', '🅿️': 'parking', '⛽': 'fuel', '📱': 'smartphone',
    // sights, culture & leisure
    '🏛️': 'landmark', '🏖️': 'landmark', '🌳': 'tree', '⛪': 'church',
    '🎓': 'graduationCap', '🏟️': 'stadium', '🎭': 'theater', '🎫': 'ticket',
    '🎟️': 'ticket', '🎢': 'ticket', '🎨': 'palette',
    // medical
    '🏥': 'hospital', '💊': 'pill', '🩺': 'stethoscope', '🦷': 'stethoscope',
    '🧑‍⚕️': 'stethoscope',
    // pets
    '🐾': 'pawPrint', '🐶': 'pawPrint',
    // money
    '💰': 'wallet', '💸': 'wallet', '💵': 'wallet', '📒': 'wallet',
    '📊': 'barChart', '📈': 'trendingUp', '💱': 'exchange', '⚖️': 'scale',
    '🏷️': 'tag',
    // weather
    '☀️': 'sun', '🌙': 'moon', '⛅': 'cloudSun', '🌤️': 'cloudSun',
    '🌥️': 'cloudSun', '☁️': 'cloud', '🌦️': 'cloudRain', '🌧️': 'cloudRain',
    '⛈️': 'cloudLightning', '❄️': 'snowflake', '🌨️': 'snowflake',
    '🌫️': 'cloudFog', '💨': 'wind',
    // day-parts
    '🌅': 'sunrise',
    // vibes & misc
    '👪': 'users', '🥾': 'footprints', '💗': 'heart', '🌿': 'leaf',
    '🌱': 'leaf', '🎉': 'party', '🎒': 'backpack', '🧳': 'suitcase',
    '✨': 'sparkles', '🔥': 'flame', '🌊': 'wave', '💼': 'briefcase',
    '💎': 'gem', '📚': 'books', '🖥️': 'monitor',
    // badges & social
    '🏅': 'award', '🏆': 'award', '🌐': 'globe', '🌍': 'globe', '🌏': 'globe',
    '🪐': 'globe', '📣': 'megaphone', '📢': 'megaphone', '🤝': 'handshake',
    '👥': 'users', '👤': 'user', '🔁': 'repost', '🦋': 'users', '🛤️': 'route',
    // chrome glyphs & typographic marks
    '✕': 'close', '❌': 'close', '✓': 'check', '✅': 'check', '★': 'star',
    '⭐': 'star', '✦': 'sparkles', '✎': 'edit', '✏️': 'edit', '👁': 'eye',
    '➕': 'plus', '🔗': 'link', '📤': 'upload', '📧': 'mail', '🔖': 'bookmark',
    '🔍': 'search', '🔎': 'search', '🔒': 'lock', '🔐': 'lock', '🗑️': 'trash',
    '📋': 'checklist', '📝': 'journal', '📎': 'document', '📅': 'calendar',
    '🗓️': 'calendar', '🗺️': 'map', '📸': 'photo', '📷': 'photo', '🖼️': 'photo',
    '📄': 'document', '📜': 'document', '👑': 'crown', '🕐': 'clock',
    '🕒': 'clock', '🧭': 'compass', '⚡': 'zap', '💡': 'lightbulb', 'ℹ️': 'info',
    '⚠️': 'alertTriangle', '😬': 'info', '🛟': 'lifebuoy', '🔵': 'info',
    '○': 'circle', '☑️': 'checkSquare', '☐': 'square', '↗': 'externalLink',
    '↶': 'restore', '🏁': 'flag', '📌': 'pinned', '📂': 'folder', '📍': 'pin',
};

/** VS16-normalised lookup table built once from `_EMOJI_ICON_RAW`. */
const _emojiIconMap: Record<string, string> = (() => {
    const m: Record<string, string> = {};
    for (const [k, v] of Object.entries(_EMOJI_ICON_RAW)) m[k.replace(/️/g, '')] = v;
    return m;
})();

/** Resolve a stored/rendered emoji glyph to its GG icon key, or null when the
 *  glyph is intentionally kept (country flags, reactions) or unknown. */
export function emojiToIconKey(emoji: string | undefined | null): string | null {
    if (!emoji) return null;
    return _emojiIconMap[emoji.replace(/️/g, '').trim()] ?? null;
}

/** Render the GG line-icon for a stored/rendered emoji as an HTML string.
 *  Falls back to `opts.fallback` (an icon key) when the glyph has no mapping,
 *  else returns '' so the caller can decide (e.g. keep a flag). */
export function iconForEmoji(
    emoji: string | undefined | null,
    opts: { size?: number; cls?: string; fallback?: string } = {},
): string {
    const key = emojiToIconKey(emoji) ?? opts.fallback ?? '';
    return key ? iconSvg(key, opts) : '';
}

/** Render a stored CATEGORY `icon` (expense/personalization categories) that
 *  may hold EITHER a legacy emoji ('🍔') OR — for categories created after the
 *  emoji-strip — a GG icon KEY ('utensils'). Tries the icon key first, then the
 *  emoji map, then a neutral 'tag'. Lets the picker store icon keys going
 *  forward while every already-stored emoji still renders as a GG icon. */
export function iconForCategory(
    icon: string | undefined | null,
    opts: { size?: number; cls?: string } = {},
): string {
    if (icon && ICON_PATHS[icon]) return iconSvg(icon, opts);
    return iconForEmoji(icon, { fallback: 'tag', ...opts });
}
