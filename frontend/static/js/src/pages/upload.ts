import { STATE, emit } from '../state.js';
import { CONVERSION_RATES } from '../constants.js';
import { generateId, q, showLiquidAlert } from '../utils.js';
import { syncWithServer } from '../api.js';
import { navigate } from '../router.js';
import { showSettingsTab } from './settings.js';
import { addTripCompanion, getTripCompanionNames } from '../companions.js';
import { t } from '../i18n.js';

// Pad number to 2 digits.
const _pad2 = (n: number): string => String(n).padStart(2, '0');

// Substring keyword → {icon, color} for auto-styling categories created during
// import. Match is case-insensitive on the category name (so "Restaurant Food"
// hits "food"). Order is roughly most-specific-first so "groceries" beats
// "food" when both could match.
const CATEGORY_KEYWORD_DEFAULTS = [
    { key: 'grocer',      icon: '🛒',   color: '#34c759' },
    { key: 'supermarket', icon: '🛒',   color: '#34c759' },
    { key: 'coffee',      icon: '☕',   color: '#8b4513' },
    { key: 'cafe',        icon: '☕',   color: '#8b4513' },
    { key: 'restaurant',  icon: '🍽️', color: '#ff3b30' },
    { key: 'breakfast',   icon: '🥐',   color: '#ff9f0a' },
    { key: 'lunch',       icon: '🥗',   color: '#34c759' },
    { key: 'dinner',      icon: '🍽️', color: '#ff3b30' },
    { key: 'food',        icon: '🍔',   color: '#ff3b30' },
    { key: 'snack',       icon: '🍪',   color: '#ff9f0a' },
    { key: 'dessert',     icon: '🍦',   color: '#ff2d55' },
    { key: 'drink',       icon: '🍻',   color: '#ff9500' },
    { key: 'bar',         icon: '🍹',   color: '#ff9500' },
    { key: 'alcohol',     icon: '🍷',   color: '#9b1c2c' },
    { key: 'flight',      icon: '✈️', color: '#007aff' },
    { key: 'plane',       icon: '✈️', color: '#007aff' },
    { key: 'airport',     icon: '🛬',   color: '#007aff' },
    { key: 'taxi',        icon: '🚕',   color: '#ffd60a' },
    { key: 'uber',        icon: '🚕',   color: '#ffd60a' },
    { key: 'train',       icon: '🚆',   color: '#5ac8fa' },
    { key: 'metro',       icon: '🚇',   color: '#5ac8fa' },
    { key: 'bus',         icon: '🚌',   color: '#5ac8fa' },
    { key: 'fuel',        icon: '⛽',   color: '#8e8e93' },
    { key: 'gas',         icon: '⛽',   color: '#8e8e93' },
    { key: 'parking',     icon: '🅿️', color: '#8e8e93' },
    { key: 'rental',      icon: '🚗',   color: '#007aff' },
    { key: 'car',         icon: '🚗',   color: '#007aff' },
    { key: 'transport',   icon: '🚌',   color: '#007aff' },
    { key: 'hotel',       icon: '🏨',   color: '#5856d6' },
    { key: 'hostel',      icon: '🛏️', color: '#5856d6' },
    { key: 'airbnb',      icon: '🏠',   color: '#5856d6' },
    { key: 'accommod',    icon: '🏨',   color: '#5856d6' },
    { key: 'lodging',     icon: '🏨',   color: '#5856d6' },
    { key: 'ticket',      icon: '🎟️', color: '#af52de' },
    { key: 'museum',      icon: '🏛️', color: '#af52de' },
    { key: 'tour',        icon: '🗺️', color: '#af52de' },
    { key: 'activity',    icon: '🎫',   color: '#af52de' },
    { key: 'entertain',   icon: '🎭',   color: '#af52de' },
    { key: 'shop',        icon: '🛍️', color: '#ff2d55' },
    { key: 'cloth',       icon: '👕',   color: '#ff2d55' },
    { key: 'gift',        icon: '🎁',   color: '#ff2d55' },
    { key: 'health',      icon: '💊',   color: '#34c759' },
    { key: 'pharmac',     icon: '💊',   color: '#34c759' },
    { key: 'medic',       icon: '🩺',   color: '#34c759' },
    { key: 'phone',       icon: '📱',   color: '#5ac8fa' },
    { key: 'internet',    icon: '🌐',   color: '#5ac8fa' },
    { key: 'fee',         icon: '💸',   color: '#8e8e93' },
    { key: 'tip',         icon: '💵',   color: '#34c759' },
];

// Used when no keyword matches. Hash the name so the same category always
// gets the same look (no flicker on re-import).
const CATEGORY_FALLBACK_PALETTE = [
    { icon: '🌍', color: '#0071e3' },
    { icon: '🎒', color: '#9b59b6' },
    { icon: '📸', color: '#ff9500' },
    { icon: '🗺️', color: '#34c759' },
    { icon: '🎨', color: '#ff2d55' },
    { icon: '🔥', color: '#ff3b30' },
    { icon: '⭐', color: '#ffd60a' },
    { icon: '🌊', color: '#5ac8fa' },
];

/**
 * Parse a splits cell like "Alice:50,Bob:50" → { Alice: 50, Bob: 50 }.
 * Permissive — bad tokens are dropped silently (spreadsheets leak weird
 * formatting and we'd rather import 9 good rows than fail the whole file
 * on one stray semicolon). Accepts "," or ";" as token separator and
 * ":" or "=" as the name/percentage delimiter. Returns null on empty
 * input so the caller can apply its own default (100% paid by `who`).
 *
 * @param {string} raw
 * @returns {Record<string, number> | null}
 */
function parseSplitsCell(raw: unknown): Record<string, number> | null {
    if (!raw || !String(raw).trim()) return null;
    const out = ({} as Record<string, number>);
    for (const tok of String(raw).split(/[,;]/)) {
        const m = tok.match(/^\s*(.+?)\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*$/);
        if (!m || !m[1] || !m[2]) continue;
        const name = m[1].trim();
        const pct = parseFloat(m[2]);
        if (!name || isNaN(pct)) continue;
        out[name] = (out[name] || 0) + pct;
    }
    return Object.keys(out).length > 0 ? out : null;
}

/** Y/N-ish cell → boolean. Truthy: y/yes/true/1 (case-insensitive). */
function parseFlagCell(raw: unknown): boolean {
    if (!raw) return false;
    const s = String(raw).trim().toLowerCase();
    return s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

/**
 * @param {string} name
 * @returns {{icon: string, color: string}}
 */
function inferCategoryStyle(name: string): { icon: string; color: string } {
    const lc = (name || '').toLowerCase();
    for (const entry of CATEGORY_KEYWORD_DEFAULTS) {
        if (lc.includes(entry.key)) return { icon: entry.icon, color: entry.color };
    }
    let hash = 0;
    for (let i = 0; i < lc.length; i++) {
        hash = ((hash << 5) - hash + lc.charCodeAt(i)) | 0;
    }
    return CATEGORY_FALLBACK_PALETTE[Math.abs(hash) % CATEGORY_FALLBACK_PALETTE.length] ??
        { icon: '💼', color: '#8e8e93' };
}

/**
 * Robust cell-date → "YYYY-MM-DD" string. Handles every format we've seen
 * leak in via spreadsheet uploads:
 *   - Date object (XLSX with cellDates:true returns these for typed cells)
 *   - "YYYY-MM-DD" or "YYYY/MM/DD" — passed through after normalization
 *   - "DD/MM/YYYY" or "DD-MM-YYYY" — heuristic: 4-digit year is the year
 *   - "MM/DD/YYYY" — same regex, year still pinned to the 4-digit token
 *   - Excel serial number (raw float, or a numeric string like "45357")
 *   - Anything unparseable → '' (caller decides what to do; better than
 *     silently writing Jan 1 epoch)
 *
 * @param {unknown} cell
 * @returns {string}
 */
function parseCellDate(cell: unknown): string {
    if (cell === null || cell === undefined || cell === '') return '';
    // 1. Real Date — easy.
    if (cell instanceof Date && !isNaN(cell.getTime())) {
        return `${cell.getFullYear()}-${_pad2(cell.getMonth() + 1)}-${_pad2(cell.getDate())}`;
    }

    const raw = String(cell).trim();
    if (!raw) return '';

    // 2. Numeric → Excel serial date. Excel's epoch is 1899-12-30 (the
    //    "1900-01-00" off-by-one bug means serial 1 is actually 1900-01-01,
    //    so 1899-12-30 + N days produces the right calendar date).
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
        const serial = parseFloat(raw);
        // Plausible range: ~1900-01-01 (1) to ~2100 (~73000). Reject obviously
        // wrong numbers so we don't pretend "12345" was a date.
        if (serial > 0 && serial < 73000) {
            const epoch = Date.UTC(1899, 11, 30);
            const ms = epoch + Math.round(serial) * 86400000;
            const d = new Date(ms);
            if (!isNaN(d.getTime())) {
                return `${d.getUTCFullYear()}-${_pad2(d.getUTCMonth() + 1)}-${_pad2(d.getUTCDate())}`;
            }
        }
        return '';
    }

    // 3. String date — split on common separators and figure out which
    //    token is the year (the 4-digit one).
    const parts = raw.split(/[/\-.]/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 3) {
        const yIdx = parts.findIndex(p => /^\d{4}$/.test(p));
        if (yIdx === -1) return '';  // No 4-digit year, can't disambiguate.
        const year = parts[yIdx];
        const others = parts.filter((_, i) => i !== yIdx).map(Number);
        if (others.some(n => isNaN(n))) return '';
        // If first token is the year (YYYY-MM-DD), order is month, day.
        // If last token is the year (DD-MM-YYYY most common in EU), the
        // first remaining token is the day; for US (MM-DD-YYYY) it's the
        // month. We can't distinguish DD/MM from MM/DD without locale info,
        // so heuristic: if either >12 it must be the day; otherwise prefer
        // day-first (the rest of this app already targets EU users).
        let month: number | undefined, day: number | undefined;
        if (yIdx === 0) {
            [month, day] = others;
        } else {
            const [a, b] = others;
            if (a === undefined || b === undefined) return '';
            if (a > 12) { day = a; month = b; }
            else if (b > 12) { day = b; month = a; }
            else { day = a; month = b; }  // EU default
        }
        if (month === undefined || day === undefined) return '';
        if (month < 1 || month > 12 || day < 1 || day > 31) return '';
        return `${year}-${_pad2(month)}-${_pad2(day)}`;
    }
    return '';
}

export function renderUpload() {
    const div = document.createElement('div');
    div.innerHTML = `
        <h1>Upload Data</h1>
        <div class="card glass" style="border-color: rgba(33, 115, 70, 0.3); box-shadow: 0 0 15px rgba(33, 115, 70, 0.1);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <h2 class="card-title" style="color: #217346; margin: 0;">Excel Upload</h2>
            </div>

            <!-- Format Selector -->
            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:8px;">Import Format</label>
                <select id="formatSelect" class="glass-input" style="width:100%;">
                    ${(() => {
            const sf = STATE.savedFormats || [];
            const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
            const activeId = activeTrip?.activeFormatId;
            const activeType = activeTrip?.activeFormatType || 'popular';

            const populars = [
                { id: 'tricount', name: 'Tricount Export (CSV/XLSX)' },
                { id: 'splitwise', name: 'Splitwise Export' },
                { id: 'revolut', name: 'Revolut Monthly Statement' }
            ];

            const popOpts = populars.map(p =>
                `<option value="popular:${p.id}" ${activeType === 'popular' && activeId === p.id ? 'selected' : ''}>${p.name}</option>`
            ).join('');

            const custOpts = sf.length === 0
                ? '<option disabled>No saved custom formats yet</option>'
                : sf.map(f =>
                    `<option value="custom:${f.id}" ${activeType === 'custom' && activeId === f.id ? 'selected' : ''}>${f.name}</option>`
                ).join('');

            return `
                            <optgroup label="Popular Formats">${popOpts}</optgroup>
                            <optgroup label="Custom Formats">${custOpts}</optgroup>
                        `;
        })()}
                </select>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 12px; line-height: 1.5;">
                    Use your favourite app's format or <a href="#" id="uploadFormatSettingsLink" style="color: #005bb8; text-decoration: none; font-weight: 600;">customize your own upload format</a> in settings.
                </p>
                <p id="formatNote" style="font-size:0.8rem; color:var(--text-secondary); margin-top:8px;"></p>
            </div>

            <!-- Column reference for custom formats -->
            <div id="customFormatPreview" class="callout-tinted" style="display:none; margin-bottom: var(--space-4); --accent: 255,149,0;">
                <p class="callout-tinted__label">Active Format Mapping</p>
                <div id="customFormatTable"></div>
            </div>

            <!-- Popular format note -->
            <div id="popularNote" class="callout-tinted callout-tinted--lg" style="margin-bottom: var(--space-5); --accent: 0,113,227;">
                <span class="callout-tinted__label">💡 FORMAT PREVIEW</span>
                <p class="callout-tinted__body">Ensure your file contains these columns. We will try to auto-detect categories.</p>
                <div id="popularFormatTableContainer" style="margin-top: var(--space-4); overflow-x: auto; background: white; border-radius: var(--radius-sm); border: 1px solid rgba(0,0,0,0.05);"></div>
            </div>

            <div class="callout-tinted" style="margin-bottom: 15px; --accent: 0,113,227;">
                <p class="callout-tinted__label">📅 Date format</p>
                <p class="callout-tinted__body">Use <strong>DD-MM-YYYY</strong> (e.g. <code class="code-inline">15-03-2024</code>) or <strong>YYYY-MM-DD</strong>. Excel-typed date cells are recognised automatically.</p>
            </div>

            <div class="callout-tinted" style="margin-bottom: 15px; --accent: 52,199,89;">
                <p class="callout-tinted__label">⚖️ Splits &amp; settlements</p>
                <p class="callout-tinted__body">
                    <strong>Tricount / Splitwise</strong> rows are imported as equal-split shared expenses.
                    <strong>Revolut</strong> rows are imported as personal (no debt).
                    <strong>Custom formats</strong> can map two optional variables:
                    <code class="code-inline">splits</code> (e.g. <code class="code-inline">Alice:50,Bob:50</code>) to define percentages, and
                    <code class="code-inline">isSettlement</code> (Y/N) to mark a row as a transfer — receiver goes in the splits cell, e.g. <code class="code-inline">Bob:100</code>.
                    <br>By default, custom rows are <strong>regular expenses, never settlements</strong>: a row only counts as a settlement when <code class="code-inline">isSettlement</code> is mapped <em>and</em> its cell is Y/Yes/True/1. Without <code class="code-inline">splits</code>, the row is recorded as 100% paid by the payer (no debt created).
                </p>
            </div>

            <input type="file" id="excelFile" accept=".xlsx, .xls, .csv" class="glass-input" style="margin-bottom: 15px; width: 100%;">
            
            <div id="previewContainer" style="display: none; margin-bottom: 15px;">
                <h3 style="margin-bottom: 10px;">Preview (First 3 Rows)</h3>
                <div style="overflow-x: auto;">
                    <table class="liquid-table" id="previewTable">
                        <thead></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>

            <br>
            <button class="btn" id="uploadBtn">Upload and Process</button>
            <div id="uploadStatus" style="margin-top: 15px; font-weight: bold;"></div>
        </div>
    `;

    setTimeout(() => {
                let parsedRows: any[][] | null = null;

        div.querySelector('#uploadFormatSettingsLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            navigate('settings');
            // Settings DOM doesn't exist until navigate renders it.
            setTimeout(() => showSettingsTab('format'), 50);
        });

        const formatSelect = (q(div, '#formatSelect') as HTMLSelectElement);
        const popularNote = q(div, '#popularNote');
        const customFormatPreview = q(div, '#customFormatPreview');
        const customFormatTable = q(div, '#customFormatTable');

        const updateUI = () => {
            const val = formatSelect.value;
            const isPopular = val.startsWith('popular:');
            popularNote.style.display = isPopular ? 'block' : 'none';

            if (!isPopular) {
                const formatId = val.split(':')[1];
                const format = (STATE.savedFormats || []).find(f => f.id === formatId);
                if (format) {
                    customFormatPreview.style.display = 'block';
                    customFormatTable.innerHTML = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:8px;">
                        ${format.mappings.map(m => `<div style="font-size:0.75rem;"><span style="color:var(--text-secondary);">${m.variable}:</span> <strong>${m.column}</strong></div>`).join('')}
                    </div>`;

                    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
                    if (trip && formatId) {
                        trip.activeFormatId = formatId;
                        trip.activeFormatType = 'custom';
                        emit('state:changed');
                    }
                } else {
                    customFormatPreview.style.display = 'none';
                }
            } else {
                customFormatPreview.style.display = 'none';

                const popId = val.split(':')[1];
                const popContainer = q(div, '#popularFormatTableContainer');

                                let headers: string[] = [];
                                let row: string[] = [];
                if (popId === 'tricount') {
                    headers = ['Title', 'Amount', 'Currency', 'Date', 'Paid by'];
                    row = ['Dinner', '45.00', 'EUR', '2023-10-12', 'Alice'];
                } else if (popId === 'splitwise') {
                    headers = ['Date', 'Description', 'Category', 'Cost', 'Currency'];
                    row = ['2023-10-12', 'Taxi', 'Transportation', '20.00', 'EUR'];
                } else if (popId === 'revolut') {
                    headers = ['Type', 'Product', 'Started Date', 'Description', 'Amount', 'Currency', 'State'];
                    row = ['CARD_PAYMENT', 'Current', '2023-10-12', 'Restaurant', '-45.00', 'EUR', 'COMPLETED'];
                }

                if (headers.length > 0) {
                    popContainer.innerHTML = `
                        <table class="liquid-table" style="font-size: 0.75rem; margin: 0;">
                            <thead>
                                <tr>${headers.map(h => `<th style="padding: 8px 12px;">${h}</th>`).join('')}</tr>
                            </thead>
                            <tbody>
                                <tr>${row.map(d => `<td style="padding: 8px 12px; color: var(--text-secondary);">${d}</td>`).join('')}</tr>
                            </tbody>
                        </table>
                    `;
                } else {
                    popContainer.innerHTML = '';
                }

                const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
                if (trip && popId) {
                    trip.activeFormatId = popId;
                    trip.activeFormatType = 'popular';
                    emit('state:changed');
                }
            }
        };

        formatSelect.addEventListener('change', updateUI);
        updateUI();

        q(div, '#excelFile').addEventListener('change', (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    const data = new Uint8Array((evt.target?.result as ArrayBuffer));
                    // cellDates: true tells SheetJS to convert XLSX-typed
                    // date cells into JS Date objects instead of returning
                    // the raw Excel serial number (days since 1900-01-01).
                    // Without it `String(row[dateCol])` gives '45357' which
                    // later parses as an invalid Date and falls back to
                    // Jan 1 — every imported expense looked the same.
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                                        const json: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (json.length < 2) return;

                    const header = json[0]!;
                    parsedRows = json.slice(1).filter(r => r.length > 0 && r[0]);

                    const previewContainer = q(div, '#previewContainer');
                    const thead = q(div, '#previewTable thead');
                    const tbody = q(div, '#previewTable tbody');

                    thead.innerHTML = '<tr>' + header.map((/** @type {any} */ h) => `<th>${h || ''}</th>`).join('') + '</tr>';

                    const previewRows = parsedRows.slice(0, 3);
                    tbody.innerHTML = previewRows.map((/** @type {any[]} */ row) => {
                        return '<tr>' + header.map((/** @type {any} */ _, /** @type {number} */ i) => `<td>${row[i] || ''}</td>`).join('') + '</tr>';
                    }).join('');

                    previewContainer.style.display = 'block';
                } catch (err) {
                    console.error("Preview error", err);
                }
            };
            reader.readAsArrayBuffer(file);
        });

        q(div, '#uploadBtn').addEventListener('click', () => {
            if (!STATE.activeTripId) {
                // Round 6 audit fix — toast instead of native alert().
                // i18n session 1: pipe through t() for localization.
                showLiquidAlert(t('validation.selectTripFirst'));
                return;
            }
            const activeTripId = STATE.activeTripId;
            const activeTrip = STATE.trips.find(t => t.id === activeTripId);
            if (activeTrip && !Array.isArray(activeTrip.companions)) activeTrip.companions = [];
            const statusDiv = q(div, '#uploadStatus');
            const formatVal = formatSelect.value;
            const isPopular = formatVal.startsWith('popular:');
            const popularFormat = formatVal.split(':')[1];

            if (!parsedRows) {
                statusDiv.innerText = "Please select a valid file to process.";
                statusDiv.style.color = "red";
                return;
            }

            try {
                let added = 0;
                let mappings: { variable: string; column: string }[] = [];
                /** Collected so the user can hit "Undo last batch" on
                 *  the expenses page and revert this import in one shot. */
                const importedIds = ([] as string[]);

                if (!isPopular) {
                    const formatId = formatVal.split(':')[1];
                    const format = STATE.savedFormats.find(f => f.id === formatId);
                    if (!format) throw new Error("Format not found");
                    mappings = format.mappings;
                }

                parsedRows.forEach((/** @type {any[]} */ row) => {
                    let who = '', catName = '', label = '', date = '', country = '';
                    let value = 0, currency = 'EUR';
                    // Splits + settlement flag. Custom formats can map the new
                    // 'splits' / 'isSettlement' variables; popular formats use
                    // hard-coded conventions filled in below.
                    let splits = (null as Record<string, number> | null);
                    let isSettlement = false;

                    if (isPopular) {
                        if (popularFormat === 'tricount') {
                            label = String(row[0] || '').trim();
                            value = parseFloat(row[1]) || 0;
                            currency = String(row[2] || 'EUR').trim().toUpperCase();
                            date = parseCellDate(row[3]);
                            catName = String(row[4] || '').trim();
                            who = String(row[5] || '').trim();
                            country = 'Unknown';
                        } else if (popularFormat === 'splitwise') {
                            date = parseCellDate(row[0]);
                            label = String(row[1] || '').trim();
                            catName = String(row[2] || '').trim();
                            value = parseFloat(row[3]) || 0;
                            currency = String(row[4] || 'EUR').trim().toUpperCase();
                            who = 'Me';
                            country = 'Unknown';
                        }
                    } else {
                        const colToIdx = (letter: string) => letter ? letter.toUpperCase().charCodeAt(0) - 65 : -1;
                        const get = (varName: string) => {
                            const mapping = mappings.find((m: { variable: string; column: string }) => m.variable === varName);
                            if (!mapping) return '';
                            return String(row[colToIdx(mapping.column)] || '').trim();
                        };
                        /** Raw cell read for date — keeps Date objects
                         *  intact rather than stringifying first and
                         *  losing them. */
                        const getRaw = (varName: string) => {
                            const mapping = mappings.find((m: { variable: string; column: string }) => m.variable === varName);
                            if (!mapping) return null;
                            return row[colToIdx(mapping.column)];
                        };

                        who = get('who');
                        // 'category' is the current variable name; older saved
                        // formats called it 'categoryId'. Read whichever exists.
                        catName = get('category') || get('categoryId');
                        label = get('label');
                        date = parseCellDate(getRaw('date'));
                        country = get('country') || 'Unknown';
                        value = parseFloat(get('value')) || 0;
                        currency = get('currency').toUpperCase() || 'EUR';
                        splits = parseSplitsCell(get('splits'));
                        isSettlement = parseFlagCell(get('isSettlement'));
                    }

                    // Register `who` on both rosters: the account-level master
                    // list (so it shows in personalization for re-use) AND this
                    // trip's roster (UNLINKED — `who` is just a string from a
                    // CSV/XLSX, no friend account behind it; the user can
                    // promote any of these to a linked-friend later via the
                    // companion picker on Home).
                    if (who && activeTrip) {
                        addTripCompanion(activeTrip, who);
                    }
                    if (splits && activeTrip) {
                        for (const name of Object.keys(splits)) {
                            if (!name) continue;
                            addTripCompanion(activeTrip, name);
                        }
                    }

                    if (!splits) {
                        // Tricount/Splitwise are sharing apps — equal split across
                        // THIS TRIP'S companions matches user intent. Revolut is a
                        // bank export (personal); custom formats with no splits
                        // column also default to "no debt" so untagged imports
                        // don't spawn settlements out of nowhere.
                        const tripRoster = activeTrip ? getTripCompanionNames(activeTrip) : [];
                        if (isPopular && (popularFormat === 'tricount' || popularFormat === 'splitwise') && tripRoster.length > 0) {
                            const pct = 100 / tripRoster.length;
                            splits = {};
                            tripRoster.forEach(g => { (splits as Record<string, number>)[g] = pct; });
                        } else {
                            splits = who ? { [who]: 100 } : {};
                        }
                    }

                    let category = STATE.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                    if (!category && catName) {
                        const style = inferCategoryStyle(catName);
                        category = { id: generateId(), name: catName, icon: style.icon, color: style.color };
                        STATE.categories.push(category);
                    }
                    const categoryId = category ? category.id : (STATE.categories[0]?.id ?? '');

                    const expense: import('../types').Expense = {
                        id: generateId(),
                        tripId: activeTripId,
                        who,
                        categoryId,
                        label: isSettlement && !label ? `Settlement: ${who} → ${Object.keys(splits)[0] || ''}` : label,
                        date,
                        country,
                        value,
                        currency,
                        euroValue: value * (CONVERSION_RATES[currency] || 1),
                        splits: splits ?? undefined,
                    };
                    if (isSettlement) expense.isSettlement = true;
                    STATE.expenses.push(expense);
                    importedIds.push(expense.id);
                    added++;
                });

                // Capture the batch so the user can undo it from the
                // expenses History tab. Replaces any previous batch (only
                // the most recent import is undoable — keeping a stack
                // would require schema work for cross-device persistence).
                if (importedIds.length > 0) {
                    STATE.lastImportBatch = {
                        tripId: activeTripId,
                        expenseIds: importedIds,
                        importedAt: new Date().toISOString(),
                    };
                }

                emit('state:changed');
                syncWithServer(); // Bulk: sync all newly imported data to server
                statusDiv.innerText = `Successfully imported ${added} expenses!`;
                statusDiv.style.color = "green";
                parsedRows = null;
                q(div, '#previewContainer').style.display = 'none';
            } catch (error) {
                console.error(error);
                statusDiv.innerText = "Error parsing file. Check the format.";
                statusDiv.style.color = "red";
            }
        });
    }, 0);

    return div;
}

