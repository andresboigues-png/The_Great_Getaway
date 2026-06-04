// utils/manualRates.ts
//
// Global (device-local) manual exchange + inflation rates, set in
// Settings → Personalization. Per currency, per year, the user can pin:
//   - fx          : how many HOME-currency units 1 unit of the currency was
//                   worth THAT year (e.g. 1 USD = 0.90 EUR ⇒ 0.90).
//   - inflationPct: that currency's annual inflation % during that year.
// Both optional — a blank field falls back to the automatic source
// (World-Bank CPI for inflation, Frankfurter/live FX for rates).
//
// SCOPE (see money_fx_inflation_invariant): these only affect the Insights
// "Spent" / "Worth today" DISPLAY. Settlements and budgets stay nominal and
// never read this. Persisted client-side in STATE.manualRates via the normal
// localStorage state flow. A per-trip fxOverride (utils/fxOverrides) still
// takes precedence over these globals for that trip's currency.

import { STATE, emit } from '../state.js';
import { EVENTS } from '../constants.js';
import { makeInflationFactor } from './presentValue.js';

export interface ManualYearRate {
    /** 1 unit of the currency in HOME-currency units, that year. */
    fx?: number;
    /** That currency's annual inflation %, that year (e.g. 3.2 = +3.2%). */
    inflationPct?: number;
}

/** The whole map. `{ [CURRENCY]: { [year]: { fx?, inflationPct? } } }`. */
export function getManualRates(): Record<string, Record<string, ManualYearRate>> {
    return STATE.manualRates || {};
}

/** All year entries for one currency (UPPERCASE-keyed). Empty if none. */
export function getManualRatesForCurrency(currency: string): Record<string, ManualYearRate> {
    const code = (currency || '').toUpperCase();
    return (STATE.manualRates && STATE.manualRates[code]) || {};
}

/** A single currency+year entry, or undefined. Used by the Insights calc. */
export function getManualYearRate(currency: string, year: number | string): ManualYearRate | undefined {
    const code = (currency || '').toUpperCase();
    const byYear = STATE.manualRates && STATE.manualRates[code];
    return byYear ? byYear[String(year)] : undefined;
}

/** True iff the currency has at least one year with a finite inflation %.
 *  Gates the calc: when true, the manual (compounded) inflation series is
 *  used for that currency; otherwise it falls back to the World-Bank CPI. */
export function hasManualInflation(currency: string): boolean {
    const byYear = getManualRatesForCurrency(currency);
    return Object.values(byYear).some((r) => Number.isFinite(r?.inflationPct));
}

/** Set / merge one currency+year entry. Pass `null`/empty fields to clear a
 *  single field; a year with no finite fields left is removed, and a currency
 *  with no years left is removed. Replaces object references (so useStore /
 *  useMemo deps keyed on `manualRates` recompute), then emits to persist. */
export function setManualRate(
    currency: string,
    year: number | string,
    rate: ManualYearRate | null,
): void {
    const code = (currency || '').toUpperCase();
    const yr = String(year);
    if (!code || !/^\d{4}$/.test(yr)) return;
    const all = { ...(STATE.manualRates || {}) };
    const byYear = { ...(all[code] || {}) };
    const clean: ManualYearRate = {};
    if (rate && Number.isFinite(rate.fx) && (rate.fx as number) > 0) clean.fx = rate.fx as number;
    if (rate && Number.isFinite(rate.inflationPct)) clean.inflationPct = rate.inflationPct as number;
    if (Object.keys(clean).length > 0) byYear[yr] = clean;
    else delete byYear[yr];
    if (Object.keys(byYear).length > 0) all[code] = byYear;
    else delete all[code];
    STATE.manualRates = all;
    emit(EVENTS.STATE_CHANGED);
}

/** Drop every stored exchange RATE (keeping each year's inflation %, which is
 *  home-currency-independent). Called when the user changes their home currency:
 *  the stored `fx` values are "1 unit = N OLD-home units" and would be silently
 *  misread against the new home (PV-6). Returns true if anything was cleared. */
export function clearAllManualFx(): boolean {
    if (!STATE.manualRates) return false;
    const all: Record<string, Record<string, ManualYearRate>> = {};
    let changed = false;
    for (const cur of Object.keys(STATE.manualRates)) {
        const byYear = STATE.manualRates[cur]!;
        const cleanYears: Record<string, ManualYearRate> = {};
        for (const yr of Object.keys(byYear)) {
            const r = byYear[yr]!;
            if (r.fx !== undefined) changed = true;
            if (Number.isFinite(r.inflationPct)) cleanYears[yr] = { inflationPct: r.inflationPct as number };
        }
        if (Object.keys(cleanYears).length > 0) all[cur] = cleanYears;
    }
    if (changed) {
        STATE.manualRates = all;
        emit(EVENTS.STATE_CHANGED);
    }
    return changed;
}

/** Drop every year for one currency (the "reset to automatic" action). */
export function clearManualRatesForCurrency(currency: string): void {
    const code = (currency || '').toUpperCase();
    if (!STATE.manualRates || !STATE.manualRates[code]) return;
    const all = { ...STATE.manualRates };
    delete all[code];
    STATE.manualRates = all;
    emit(EVENTS.STATE_CHANGED);
}

// ── Auto-fill ("Set automatically from my trips") ────────────────────────────

/** The minimum an expense needs for the auto-fill maths — a structural subset
 *  of the app's `Expense`, so real rows pass straight through. */
export interface AutoRateExpense {
    value: number;
    currency?: string;
    date?: string;
    euroValue?: number;
}

/** Median of a non-empty numeric list (robust to outliers vs the mean). */
function median(values: number[]): number {
    const xs = [...values].sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);
    return xs.length % 2 === 0 ? (xs[mid - 1]! + xs[mid]!) / 2 : xs[mid]!;
}

/** Compute the automatic value the editor would suggest for one
 *  currency+year, in the SAME units the user types (and that Insights reads
 *  via utils/presentValue.ts). PURE — no STATE, no fetch — so it's unit-tested
 *  in isolation; the caller injects the CPI series + a convert fn.
 *
 *  • mode 'infl' → cumulative inflation % from `year` to TODAY. Mirrors the
 *    editor's `autoHint` + presentValue's `inflationFactorFor`:
 *      pct = round((factor(`${year}-06-15`) - 1) * 1000) / 10
 *    where factor = makeInflationFactor(cpiSeries, currentYear). Null if no
 *    usable series (so blanks stay blank rather than being pinned to +0%).
 *  • mode 'fx', currency ≠ home → "1 unit of `currency` in HOME units" (the
 *    same convention presentValue uses: spentHome = value * fx). Derived from
 *    the user's OWN expenses that year — the rate they actually paid — as the
 *    MEDIAN of implied = homeValue / value (homeValue from the frozen euroValue
 *    so it matches the nominal "Spent" leg). Falls back to today's live rate
 *    (convertFn(1, currency, home)) when there are no expenses that year.
 *    Null if not finite/≤0, and always null for currency === home (its rate
 *    is fixed at 1, so there is nothing to pin). */
export function computeAutoRate(
    mode: 'fx' | 'infl',
    currency: string,
    year: number | string,
    expenses: AutoRateExpense[],
    cpiSeriesForCurrency: Record<number, number> | undefined,
    home: string,
    convertFn: (amount: number, from: string, to: string) => number,
): number | null {
    const cur = (currency || '').toUpperCase();
    const homeCur = (home || 'EUR').toUpperCase();
    const yr = String(year);
    if (!/^\d{4}$/.test(yr)) return null;
    const currentYear = new Date().getFullYear();

    if (mode === 'infl') {
        // No series → no honest figure to suggest (leave the field blank).
        if (!cpiSeriesForCurrency || Object.keys(cpiSeriesForCurrency).length === 0) return null;
        const factor = makeInflationFactor(cpiSeriesForCurrency, currentYear)(`${yr}-06-15`);
        if (!Number.isFinite(factor)) return null;
        return Math.round((factor - 1) * 1000) / 10;
    }

    // FX. Home currency's rate is always 1 → nothing to pin.
    if (cur === homeCur) return null;

    // Prefer the rate the user actually PAID that year: median of the implied
    // (homeValue / value) across their expenses in this currency+year.
    const implied: number[] = [];
    for (const e of expenses || []) {
        if ((e.currency || 'EUR').toUpperCase() !== cur) continue;
        if ((e.date || '').slice(0, 4) !== yr) continue;
        const value = e.value;
        const euro = e.euroValue;
        if (!Number.isFinite(value) || (value as number) <= 0) continue;
        if (!Number.isFinite(euro)) continue;
        const homeValue = homeCur === 'EUR' ? (euro as number) : convertFn(euro as number, 'EUR', homeCur);
        if (!Number.isFinite(homeValue)) continue;
        const r = homeValue / (value as number);
        if (Number.isFinite(r) && r > 0) implied.push(r);
    }
    const rate = implied.length > 0 ? median(implied) : convertFn(1, cur, homeCur);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
}

// ── Spreadsheet import (CSV/XLSX) ────────────────────────────────────────────

/** One parsed import cell: a currency + year + the value the user typed. */
export interface ParsedRateCell {
    /** UPPERCASE currency code (e.g. 'USD'). */
    currency: string;
    /** 4-digit year as a string (e.g. '2019'). */
    year: string;
    /** The numeric value: an FX rate (mode 'fx') or an inflation % (mode 'infl'). */
    value: number;
}

/**
 * Locale-aware amount parse for spreadsheet cells, mirroring
 * pages/upload.ts `parseAmount` exactly so the rates importer reads the same
 * EU-locale exports (Tricount/Splitwise/Excel) the expense importer does.
 *
 * `parseFloat` is anglocentric: `parseFloat('45,50')` → 45 (drops the cents)
 * and `parseFloat('1.234,56')` → 1.234 (a 1000× understatement). Real numbers
 * (SheetJS returns these for typed .xlsx cells) pass through untouched. For
 * strings the decimal separator is decided from the LAST separator present.
 * Returns NaN for unparseable input so the caller's finite guard skips the cell.
 */
function parseRateAmount(raw: unknown): number {
    if (typeof raw === 'number') return raw;
    if (raw === null || raw === undefined) return NaN;
    let s = String(raw).trim();
    if (!s) return NaN;
    // Drop currency symbols / spaces / NBSP / a trailing % so "€1.234,56",
    // "1 234,56" or "12,3 %" still parse; keep digits, separators, leading sign.
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

/**
 * Parse an array-of-arrays spreadsheet grid (column A = currency code, row 1 =
 * year headers, cells = rate / inflation %) into a flat list of
 * { currency, year, value } cells, ready to fold into the editor's in-memory
 * matrix. PURE — no STATE, no DOM — so it's unit-tested in isolation.
 *
 * Robustness (never throws on a bad file — returns [] instead):
 *   - Header-row detection: the first row whose later columns contain ≥1 4-digit
 *     year (so a "Currency | 2019 | 2020" header is found even with junk rows
 *     above it). Columns that aren't a 4-digit year are ignored.
 *   - Currency-column detection: column A of every body row; trimmed +
 *     uppercased; rows whose first cell isn't a plausible 3-letter code (or is
 *     blank) are skipped (handles a trailing notes row, totals, etc.).
 *   - Each value cell goes through `parseRateAmount` (decimal-comma aware). Blank
 *     cells are skipped; non-numeric cells are skipped. For FX a non-positive
 *     value is dropped (a rate must be > 0); inflation % may be negative.
 *
 * @param aoa  rows of cells (strings | numbers | Dates | null), e.g. from
 *             XLSX.utils.sheet_to_json(ws, { header: 1 }) or a split CSV.
 * @param mode 'fx' (rate, must be > 0) or 'infl' (inflation %, any sign).
 */
export function parseRatesGrid(aoa: unknown[][], mode: 'fx' | 'infl'): ParsedRateCell[] {
    if (!Array.isArray(aoa) || aoa.length === 0) return [];
    const isFx = mode === 'fx';
    const yearOf = (cell: unknown): string | null => {
        // Accept 2019 / "2019" / "2019.0" (Excel may type a header as a number).
        const s = String(cell ?? '').trim();
        const m = s.match(/^(\d{4})(?:\.0+)?$/);
        if (!m) return null;
        const y = Number(m[1]);
        return y >= 1900 && y <= 2100 ? m[1]! : null;
    };

    // 1. Find the header row: the first row with ≥1 year in columns B onward.
    let headerIdx = -1;
    for (let r = 0; r < aoa.length; r++) {
        const row = aoa[r];
        if (!Array.isArray(row)) continue;
        if (row.slice(1).some((c) => yearOf(c) !== null)) { headerIdx = r; break; }
    }
    if (headerIdx === -1) return [];

    // 2. Map each year-bearing header column → its year string.
    const header = aoa[headerIdx]!;
    const yearByCol: Record<number, string> = {};
    for (let c = 1; c < header.length; c++) {
        const y = yearOf(header[c]);
        if (y) yearByCol[c] = y;
    }
    if (Object.keys(yearByCol).length === 0) return [];

    // 3. Body rows: column A = currency, year columns = values.
    const out: ParsedRateCell[] = [];
    for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r];
        if (!Array.isArray(row) || row.length === 0) continue;
        const code = String(row[0] ?? '').trim().toUpperCase();
        // A plausible currency code is 3 ASCII letters (USD, EUR…). Skip totals
        // rows, blank cells, stray notes — never throw on them.
        if (!/^[A-Z]{3}$/.test(code)) continue;
        for (const colStr of Object.keys(yearByCol)) {
            const col = Number(colStr);
            const cell = row[col];
            if (cell === null || cell === undefined || String(cell).trim() === '') continue;
            const value = parseRateAmount(cell);
            if (!Number.isFinite(value)) continue;
            if (isFx && value <= 0) continue; // a rate must be positive
            out.push({ currency: code, year: yearByCol[col]!, value });
        }
    }
    return out;
}
