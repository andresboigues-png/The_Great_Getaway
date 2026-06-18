// pages/upload.ts — batch-import (CSV/XLSX) parsing helpers + the
// row→Expense import routine. The page UI migrated to JSX in
// expenses/BatchUpload.tsx (#4); what's left here is the pure-ish logic
// the component imports: the cell parsers + category inference, and
// runBatchImport (the data-creating path), kept out of the component so
// it stays isolated + unit-testable.

import { STATE, emit } from '../state.js';
import { convertCurrency, hasRate } from '../utils/currency.js';
import { generateId } from '../utils.js';
import { syncCategories, upsertTrip, upsertExpense } from '../api.js';
import { addTripCompanion, getTripCompanionNames } from '../companions.js';
import { t } from '../i18n.js';

// Pad number to 2 digits.
const _pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Locale-aware amount parse for spreadsheet cells (EXP-3).
 *
 * `parseFloat` is anglocentric: `parseFloat('45,50')` → 45 (drops the
 * cents) and `parseFloat('1.234,56')` → 1.234 (a 1000× understatement).
 * EU-locale Tricount/Splitwise/custom CSV exports — the common case for
 * this PT/ES/FR app — write `,` as the decimal separator and often `.`
 * as the thousands grouping, so the bare parseFloat silently corrupts
 * every amount.
 *
 * Strategy:
 *   - Real numbers (SheetJS returns these for typed .xlsx cells) pass
 *     through untouched — no string surgery, no precision loss.
 *   - For strings, decide the decimal separator from the LAST separator
 *     present: if a comma appears after the last dot (or there is no dot),
 *     the comma is decimal → strip any dots (thousands) and swap the
 *     comma to a dot. Otherwise the dot is decimal (en: `1,234.56`,
 *     `1234.56`) → strip the grouping commas.
 *   - Anything else (single separator, no separator) is left for
 *     parseFloat, which already handles `45.50`, `1234`, `12.349`, etc.
 *
 * Returns NaN for unparseable input so the caller's finite/`> 0` guard
 * skips the row (matching the server contract) instead of importing 0.
 */
function parseAmount(raw: unknown): number {
    if (typeof raw === 'number') return raw;
    if (raw === null || raw === undefined) return NaN;
    let s = String(raw).trim();
    if (!s) return NaN;
    // Drop currency symbols / spaces / NBSP so "€1.234,56" or "1 234,56"
    // still parse; keep digits, separators and a leading sign.
    s = s.replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
        // Comma is the decimal separator (e.g. "1.234,56" or "45,50").
        s = s.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma) {
        // Dot is the decimal separator (e.g. "1,234.56"); commas group.
        s = s.replace(/,/g, '');
    }
    // else: at most one kind of separator — leave it for parseFloat.
    return parseFloat(s);
}

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
        // Mirror the server's [0,100] per-share bound (validators.py:216) so
        // the parser drops what would 400 instead of pushing a doomed row
        // into local STATE + over-counting "Imported N" (EXP-5). A negative
        // or >100 share is a malformed cell, not a usable percentage.
        if (!name || isNaN(pct) || pct < 0 || pct > 100) continue;
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
        let yIdx = parts.findIndex(p => /^\d{4}$/.test(p));
        let twoDigitYear = false;
        if (yIdx === -1) {
            // BUG-077: no 4-digit year token. Spreadsheet exports commonly
            // write a 2-digit year ('12/10/23', '5-3-24'); pre-fix every such
            // row imported undated ('Global'), silently losing the timeline.
            // When all three tokens are 1-2 digit numbers, treat the LAST as a
            // 2-digit year (the dominant DD/MM/YY & MM/DD/YY layouts) instead
            // of dropping the date. (Year-first 2-digit YY/MM/DD is rare and
            // not worth the extra ambiguity.)
            if (parts.every(p => /^\d{1,2}$/.test(p))) {
                yIdx = 2;
                twoDigitYear = true;
            } else {
                return '';  // Not a recognisable date — can't disambiguate.
            }
        }
        let year = parts[yIdx]!;
        if (twoDigitYear) {
            // Standard strptime %y pivot: 00-69 → 2000-2069, 70-99 → 1970-1999.
            const yy = Number(year);
            year = String(yy <= 69 ? 2000 + yy : 1900 + yy);
        }
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

/**
 * Coerce a raw SheetJS cell to a plain display string for the preview
 * table. `cellDates: true` (BatchUpload) hands back JS Date objects for
 * typed date cells; rendering a Date straight into JSX throws React
 * error #31 ("Objects are not valid as a React child"), which crashed
 * the entire upload page the moment a file carried a typed date column.
 * Dates → YYYY-MM-DD; null/undefined → ''; everything else → String().
 */
export function cellToText(cell: unknown): string {
    if (cell === null || cell === undefined) return '';
    if (cell instanceof Date) {
        return isNaN(cell.getTime())
            ? ''
            : `${cell.getFullYear()}-${_pad2(cell.getMonth() + 1)}-${_pad2(cell.getDate())}`;
    }
    return String(cell);
}

/** Run the batch import: turn already-parsed spreadsheet rows into
 *  expenses on the active trip.
 *
 *  Extracted verbatim from the legacy renderUpload() upload-button
 *  handler when the batch-import page migrated to JSX (expenses/
 *  BatchUpload.tsx). The data-creating path is the risky part, so it
 *  lives here as one function rather than buried in the component —
 *  the row → Expense mapping (per-format parsing, category inference,
 *  split defaulting, FX euroValue, skip-on-reject) is unchanged.
 *
 *  The caller (BatchUpload) guarantees STATE.activeTripId is set and
 *  `parsedRows` is non-null before calling, then renders the status
 *  message from the returned { added, skipped, noRateCurrencies }.
 *  Throws on a malformed custom format; the caller catches it + shows
 *  the generic parse error.
 *
 *  `noRateCurrencies` is the subset of skip reasons the user can ACT on
 *  (EXP-1): a currency with no live ECB rate and no static fallback (e.g.
 *  ARS/EGP/VND/CLP/COP/AED/SAR/BGN/TWD). The whole point of a
 *  Tricount/Splitwise export from a high-inflation/exotic destination is
 *  to avoid re-keying 50 rows by hand, so silently dropping them all looks
 *  like data loss. The caller surfaces a specific "N rows use <CCY>, which
 *  has no exchange rate — add them manually with a EUR amount" message
 *  rather than a bare skipped-labels list. */
/** DSGN-037: max rows processed per import. Keeps the synchronous
 *  forEach + parallel upsertExpense fire from flooding the backend
 *  (PythonAnywhere's 120/min /api/expenses rate limit would drop rows
 *  beyond ~120 anyway). Files over this limit are silently truncated
 *  and the caller receives `truncatedCount > 0` to surface a warning. */
const MAX_IMPORT_ROWS = 500;

export function runBatchImport(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SheetJS sheet_to_json rows: heterogeneous cells (string|number|Date) coerced at use; unknown[][] would break parseFloat(row[n]) without a runtime change
    parsedRows: any[][],
    formatVal: string,
): { added: number; skipped: string[]; noRateCurrencies: Record<string, number>; truncatedCount: number } {
    const activeTripId = STATE.activeTripId!;
    const activeTrip = STATE.trips.find(t => t.id === activeTripId);
    if (activeTrip && !Array.isArray(activeTrip.companions)) activeTrip.companions = [];
    const isPopular = formatVal.startsWith('popular:');
    const popularFormat = formatVal.split(':')[1];

    // DSGN-037: cap row count before the per-row loop to avoid a simultaneous
    // flood of thousands of POST /api/expenses (one per row, no queue/throttle).
    const truncatedCount = Math.max(0, parsedRows.length - MAX_IMPORT_ROWS);
    if (truncatedCount > 0) parsedRows = parsedRows.slice(0, MAX_IMPORT_ROWS);

    let added = 0;
    let mappings: { variable: string; column: string }[] = [];
    /** Collected so the user can hit "Undo last batch" on the expenses
     *  page and revert this import in one shot. */
    const importedIds = ([] as string[]);
    /** Rows we refused to import (server would reject them) — reported to
     *  the user instead of silently over-counting. */
    const skipped = ([] as string[]);
    /** Code → count of rows dropped purely because the currency has no
     *  rate (EXP-1). Lets the caller tell the user exactly which currencies
     *  need a manual EUR amount instead of just "N skipped". */
    const noRateCurrencies = ({} as Record<string, number>);

    if (!isPopular) {
        const formatId = formatVal.split(':')[1];
        const format = STATE.savedFormats.find(f => f.id === formatId);
        if (!format) throw new Error("Format not found");
        mappings = format.mappings;
    }

    // BUG-029: register every Tricount payer from the WHOLE file BEFORE the
    // per-row loop. The equal-split default below divides 100 over the trip's
    // CURRENT roster; pre-fix that roster grew row-by-row, so early Tricount
    // rows (which carry no splits column) were split across fewer people than
    // later ones — the same "shared by everyone" intent produced order-dependent
    // settle-up balances. Building the full roster up front makes the split
    // order-independent. (Splitwise has no payer column, and custom formats
    // carry an explicit splits column, so neither needs this pre-pass.)
    if (activeTrip && isPopular && popularFormat === 'tricount') {
        for (const row of parsedRows) {
            const payer = String(row[4] || '').trim();
            if (payer) addTripCompanion(activeTrip, payer);
        }
    }

    parsedRows.forEach((row, rowIndex) => {
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
                value = parseAmount(row[1]) || 0;
                currency = String(row[2] || 'EUR').trim().toUpperCase();
                date = parseCellDate(row[3]);
                // Tricount columns are [Title, Amount, Currency, Date,
                // Paid by] — index 4 is the PAYER, and there is NO
                // category column. (audit P0)
                who = String(row[4] || '').trim();
                catName = '';
                country = 'Unknown';
            } else if (popularFormat === 'splitwise') {
                date = parseCellDate(row[0]);
                label = String(row[1] || '').trim();
                catName = String(row[2] || '').trim();
                value = parseAmount(row[3]) || 0;
                currency = String(row[4] || 'EUR').trim().toUpperCase();
                // BUG-030: the app's Splitwise column layout
                // [Date, Description, Category, Cost, Currency] has NO payer
                // column, so the old `who = 'Me'` fabricated a payer + planted a
                // literal 'Me' companion, mis-crediting every row. Leave the
                // payer UNKNOWN — the user assigns it post-import — rather than
                // inventing one.
                who = '';
                country = 'Unknown';
            }
        } else {
            const colToIdx = (letter: string) => letter ? letter.toUpperCase().charCodeAt(0) - 65 : -1;
            const get = (varName: string) => {
                const mapping = mappings.find((m: { variable: string; column: string }) => m.variable === varName);
                if (!mapping) return '';
                return String(row[colToIdx(mapping.column)] || '').trim();
            };
            /** Raw cell read for date — keeps Date objects intact rather
             *  than stringifying first and losing them. */
            const getRaw = (varName: string) => {
                const mapping = mappings.find((m: { variable: string; column: string }) => m.variable === varName);
                if (!mapping) return null;
                return row[colToIdx(mapping.column)];
            };

            who = get('who');
            // 'category' is the current variable name; older saved formats
            // called it 'categoryId'. Read whichever exists.
            catName = get('category') || get('categoryId');
            label = get('label');
            date = parseCellDate(getRaw('date'));
            country = get('country') || 'Unknown';
            value = parseAmount(get('value')) || 0;
            currency = get('currency').toUpperCase() || 'EUR';
            splits = parseSplitsCell(get('splits'));
            isSettlement = parseFlagCell(get('isSettlement'));
        }

        // Skip rows the server would reject anyway (audit P1): filter here
        // and report what we skipped instead of optimistically over-counting.
        // Audit MK5 P2: also pre-skip amounts over the server's _MAX_MONEY
        // (1e9) cap — pre-fix those were counted as "imported" then silently
        // dropped server-side (the per-row upsertExpense is fire-and-forget).
        if (!Number.isFinite(value) || value <= 0 || value > 1e9 || !hasRate(currency)) {
            skipped.push(label || `#${rowIndex + 2}`);
            // EXP-1: distinguish the actionable case — a valid amount in a
            // currency we just can't convert — so the caller can tell the
            // user which currencies need a manual EUR amount. (Bad amounts
            // aren't recoverable by adding a rate, so they're not counted.)
            if (Number.isFinite(value) && value > 0 && !hasRate(currency)) {
                const ccy = currency || 'EUR';
                noRateCurrencies[ccy] = (noRateCurrencies[ccy] || 0) + 1;
            }
            return;
        }

        // Register `who` on both rosters: the account-level master list AND
        // this trip's roster (UNLINKED — `who` is just a CSV string; the
        // user can promote it to a linked friend later).
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
            // Tricount/Splitwise are sharing apps — equal split across THIS
            // TRIP'S companions matches user intent. Custom formats with no
            // splits column default to "no debt".
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
        // No category match + no category column (e.g. Tricount): leave it
        // uncategorized rather than dumping every row into the first category.
        const categoryId = category ? category.id : '';

        const expense: import('../types').Expense = {
            id: generateId(),
            tripId: activeTripId,
            who,
            categoryId,
            label: isSettlement && !label ? t('settlement.settlementLabel', { from: who, to: Object.keys(splits)[0] || '' }) : label,
            date,
            country,
            value,
            currency,
            // R2 audit fix: route through convertCurrency so the live FX
            // overlay wins over the stale static table.
            euroValue: convertCurrency(value, currency, 'EUR'),
            splits: splits ?? undefined,
        };
        if (isSettlement) expense.isSettlement = true;
        STATE.expenses.push(expense);
        importedIds.push(expense.id);
        added++;
        // Persist per-row (audit P0): syncWithServer() below only sends
        // categories, so without this the import lived in localStorage only
        // and vanished on the next /api/data poll.
        void upsertExpense(expense);
    });

    // Capture the batch so the user can undo it from the expenses History
    // tab. Replaces any previous batch (only the most recent import is
    // undoable).
    if (importedIds.length > 0) {
        STATE.lastImportBatch = {
            tripId: activeTripId,
            expenseIds: importedIds,
            importedAt: new Date().toISOString(),
        };
    }

    emit('state:changed');
    // Audit MK5 P2: persist everything the import created. Expenses were
    // upserted per-row above. Categories now go via syncCategories() —
    // syncWithServer() no longer carries them (it's an empty connectivity
    // probe), so the old call persisted NOTHING and auto-created categories
    // vanished on the next /api/data poll. The trip's auto-added companions
    // (companions_json is trip metadata) are persisted via upsertTrip(); they
    // were likewise lost on reload before.
    void syncCategories();
    if (activeTrip) void upsertTrip(activeTrip);
    return { added, skipped, noRateCurrencies, truncatedCount };
}
