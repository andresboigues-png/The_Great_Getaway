// pages/settings/RatesEditor.tsx
//
// Settings → Personalization, "Exchange rates" and "Inflation" pills. One
// mode-aware editor for the global MANUAL rates that override the automatic
// figures in Insights ("Spent" / "Worth today"). `mode='fx'` edits the
// per-year exchange rate (1 unit of the currency in HOME units); `mode='infl'`
// edits the per-year inflation % (cumulative-to-today). Both write to
// STATE.manualRates (via utils/manualRates), keyed by UPPERCASE currency → year.
//
// LAYOUT (matrix rework): a single editable currency × year MATRIX.
//   - ROWS = the user's currencies: home + the currencies they have expenses in
//     + any pinned + any added this session. INFLATION includes home (home
//     prices inflate); FX EXCLUDES home (its rate is always 1). A "+ add
//     currency" picker adds a row from the remaining supported currencies.
//   - COLUMNS = years: the union of (years across ALL the user's expenses) +
//     pinned years + the current year, sorted DESCENDING so the current/recent
//     years sit leftmost, right after the sticky currency column.
//   - CELLS = a numeric <input> per (currency, year). Blank = automatic; the
//     placeholder shows the auto hint where computable (computeAutoRate). The
//     first column (currency label + symbol) and the header row are STICKY so
//     they keep context while the year cells scroll horizontally on mobile.
//
// Edits live in local state (`draft`) until the user clicks Save (D3), so a
// half-typed rate never lands in the calc. A dirty hint nudges them. "Reset all
// to automatic" clears THIS mode's values for every currency (the other mode is
// preserved). Import (.csv/.xlsx) folds a spreadsheet grid into the draft; a
// downloadable template gives the exact shape to edit in Excel and re-upload.
//
// Precedence (unchanged): a per-trip override beats these globals, which beat
// the automatic sources. Blank = automatic. Settlements/budgets never read this.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../react/store.js';
import { STATE } from '../../state.js';
import { CURRENCY_SYMBOLS } from '../../constants.js';
import { getHomeCurrency } from '../../utils.js';
import { getSupportedCurrencies, convertCurrency } from '../../utils/currency.js';
import {
    getManualRatesForCurrency,
    setManualRate,
    computeAutoRate,
    parseRatesGrid,
    type ManualYearRate,
} from '../../utils/manualRates.js';
import { makeInflationFactor } from '../../utils/presentValue.js';
import { fetchCpiSeries } from '../../api.js';
import type { Expense } from '../../types';
import { t, tn } from '../../i18n.js';

export type RatesMode = 'fx' | 'infl';

/** The in-memory edit buffer: draft[currency][year] = typed string ('' = auto). */
type Draft = Record<string, Record<string, string>>;

const CURRENT_YEAR = new Date().getFullYear();

export function RatesEditor({ mode }: { mode: RatesMode }) {
    const isFx = mode === 'fx';
    // Subscribe so external resets / CPI fetches re-render.
    const manualRates = useStore((s) => s.manualRates);
    const expenses = useStore((s) => s.expenses);
    const cpiCache = useStore((s) => s.cpiCache);

    const home = (getHomeCurrency() || 'EUR').toUpperCase();

    // Currencies the user has actually spent in (distinct, uppercased).
    const spentCurrencies = useMemo(() => {
        const set = new Set<string>();
        for (const e of expenses || []) set.add(((e as Expense).currency || 'EUR').toUpperCase());
        return set;
    }, [expenses]);

    // The span of years the user has dated expenses in (for the summary line).
    const yearSpan = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;
        for (const e of expenses || []) {
            const y = Number(((e as Expense).date || '').slice(0, 4));
            if (Number.isFinite(y) && y >= 1900) {
                if (y < min) min = y;
                if (y > max) max = y;
            }
        }
        return Number.isFinite(min) ? { min, max } : null;
    }, [expenses]);

    // Codes the user added via "+ add currency" this session, or via an import
    // that referenced a currency they hadn't used yet.
    const [extra, setExtra] = useState<string[]>([]);

    // ROWS — the user's currencies for THIS mode: home + spent + pinned + extra.
    // FX excludes the home currency (its rate is always 1); inflation includes
    // it (home prices inflate too). Home first, then A→Z.
    const rowCurrencies = useMemo(() => {
        const pinned = Object.keys(manualRates || {});
        const set = new Set<string>([home, ...spentCurrencies, ...pinned, ...extra]);
        const all = Array.from(set).sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)));
        return isFx ? all.filter((c) => c !== home) : all;
    }, [spentCurrencies, manualRates, home, isFx, extra]);

    // COLUMNS — the union of every year across ALL the user's expenses + pinned
    // years + the current year, DESCENDING (recent first, next to the sticky
    // currency column). Added years (typed via "+ add year") live in `extraYears`.
    const [extraYears, setExtraYears] = useState<string[]>([]);
    const years = useMemo(() => {
        const set = new Set<string>([String(CURRENT_YEAR), ...extraYears]);
        for (const e of expenses || []) {
            const y = ((e as Expense).date || '').slice(0, 4);
            if (/^\d{4}$/.test(y)) set.add(y);
        }
        for (const cur of Object.keys(manualRates || {})) {
            for (const y of Object.keys(manualRates[cur] || {})) {
                if (/^\d{4}$/.test(y)) set.add(y);
            }
        }
        return Array.from(set).sort((a, b) => Number(b) - Number(a));
    }, [expenses, manualRates, extraYears]);

    // The remaining supported currencies the user could add as a row.
    const otherCurrencies = useMemo(() => {
        const shown = new Set(rowCurrencies);
        const known = [...getSupportedCurrencies(), ...Object.keys(CURRENCY_SYMBOLS)].map((c) => c.toUpperCase());
        const rest = Array.from(new Set(known)).filter((c) => !shown.has(c) && (!isFx || c !== home));
        return rest.sort((a, b) => a.localeCompare(b));
    }, [rowCurrencies, home, isFx]);

    const [draft, setDraft] = useState<Draft>({});
    const [newYear, setNewYear] = useState('');
    const [dirty, setDirty] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [autoBusy, setAutoBusy] = useState(false);
    const [autoFilledCount, setAutoFilledCount] = useState<number | null>(null);
    const [importedCount, setImportedCount] = useState<number | null>(null);
    const [importError, setImportError] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Read the persisted value for one field of a currency+year (this mode).
    const storedValue = (cur: string, year: string): number | undefined => {
        const entry = getManualRatesForCurrency(cur)[year];
        if (!entry) return undefined;
        return isFx ? entry.fx : entry.inflationPct;
    };

    // (Re)build the whole draft from what's persisted for this mode. Blank where
    // nothing is pinned. Rebuilt whenever the mode flips (drops unsaved edits).
    const buildDraft = (): Draft => {
        const next: Draft = {};
        for (const cur of rowCurrencies) {
            const byYear: Record<string, string> = {};
            for (const year of years) {
                const v = storedValue(cur, year);
                byYear[year] = v != null ? String(v) : '';
            }
            next[cur] = byYear;
        }
        return next;
    };

    // Rebuild the draft when the mode changes, or when the set of rows/cols
    // grows (a new expense, a pin, an added currency/year) — but ONLY pull in the
    // newly-appeared cells, so we never clobber values the user is mid-typing.
    useEffect(() => {
        setDraft((prev) => {
            const next: Draft = {};
            for (const cur of rowCurrencies) {
                const prevRow = prev[cur] || {};
                const byYear: Record<string, string> = {};
                for (const year of years) {
                    if (year in prevRow) byYear[year] = prevRow[year]!;
                    else {
                        const v = storedValue(cur, year);
                        byYear[year] = v != null ? String(v) : '';
                    }
                }
                next[cur] = byYear;
            }
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rowCurrencies, years]);

    // Mode flip: hard-reset the draft from storage (drop any unsaved edits) and
    // clear the transient hints.
    useEffect(() => {
        setDraft(buildDraft());
        setNewYear('');
        setDirty(false);
        setSavedFlash(false);
        setAutoFilledCount(null);
        setImportedCount(null);
        setImportError(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    // Inflation mode: lazily pull each row currency's World-Bank CPI series so
    // the "auto ≈ N%" placeholder can render. FX auto is synchronous
    // (convertCurrency). cpiCache is a useStore dep → hints refine once loaded.
    useEffect(() => {
        if (!isFx) for (const cur of rowCurrencies) void fetchCpiSeries(cur);
    }, [isFx, rowCurrencies]);

    // The automatic value for a (currency, year), formatted for the placeholder.
    // PV4-2: `convertCurrency` only knows TODAY's rate — it has no historical
    // table — so it must NOT be shown as the "auto" baseline for a PAST year (it
    // would mis-teach the user that blank == today's rate on a 2015 row). For FX
    // we therefore only surface the live rate on the CURRENT-year cell; past FX
    // cells fall back to the neutral "auto" placeholder. The inflation hint is
    // per-year-correct (it uses the CPI factor for that year), so it stays as-is.
    const autoHint = (cur: string, year: string): string | null => {
        if (isFx) {
            if (Number(year) !== CURRENT_YEAR) return null;
            const r = convertCurrency(1, cur, home);
            if (!Number.isFinite(r) || r <= 0) return null;
            return t('settings.ratesAutoHint', { value: String(Number(r.toPrecision(6))) + ' ' + home });
        }
        const series = cpiCache[cur];
        if (!series || Object.keys(series).length === 0) return null;
        const factor = makeInflationFactor(series, CURRENT_YEAR)(`${year}-06-15`);
        const pct = Math.round((factor - 1) * 1000) / 10;
        return t('settings.ratesAutoHint', { value: String(pct) + '%' });
    };

    const markEdited = () => {
        setDirty(true);
        setSavedFlash(false);
        setAutoFilledCount(null);
        setImportedCount(null);
        setImportError(false);
    };

    const updateCell = (cur: string, year: string, value: string) => {
        setDraft((prev) => ({ ...prev, [cur]: { ...(prev[cur] || {}), [year]: value } }));
        markEdited();
    };

    const addCurrency = (raw: string) => {
        const c = raw.toUpperCase();
        if (!c) return;
        setExtra((prev) => (prev.includes(c) ? prev : [...prev, c]));
    };

    const addYear = () => {
        const y = newYear.trim();
        if (!/^\d{4}$/.test(y)) return;
        const yr = Number(y);
        if (yr < 1900 || yr > CURRENT_YEAR + 1) return;
        setExtraYears((prev) => (prev.includes(y) || years.includes(y) ? prev : [...prev, y]));
        setNewYear('');
    };

    // Persist one currency+year for this mode, MERGING with the OTHER mode's
    // stored value (so editing FX never wipes a saved inflation % and vice-versa).
    const writeMerged = (cur: string, year: string, raw: string) => {
        const existing = getManualRatesForCurrency(cur);
        const other = isFx ? existing[year]?.inflationPct : existing[year]?.fx;
        const payload: ManualYearRate = {};
        if (isFx) {
            if (Number.isFinite(other)) payload.inflationPct = other as number;
        } else if (Number.isFinite(other)) {
            payload.fx = other as number;
        }
        const n = Number(raw);
        if (raw.trim() !== '' && Number.isFinite(n)) {
            if (isFx) {
                if (n > 0) payload.fx = n;
            } else {
                payload.inflationPct = n;
            }
        }
        setManualRate(cur, year, payload);
    };

    // Save the whole draft for this mode. Every cell is written (blank clears
    // this mode's field, preserving the other mode). Covers all rows × all years.
    const onSave = () => {
        for (const cur of rowCurrencies) {
            const row = draft[cur] || {};
            for (const year of years) {
                writeMerged(cur, year, row[year] ?? '');
            }
        }
        setDirty(false);
        setSavedFlash(true);
        setImportedCount(null);
        setTimeout(() => setSavedFlash(false), 2000);
    };

    // "Reset all to automatic" (this mode): clear THIS mode's field for EVERY
    // stored year of EVERY currency (the other mode is preserved), then blank the
    // whole draft so the inputs show the automatic figure as a placeholder.
    const onResetAuto = () => {
        const all = STATE.manualRates || {};
        for (const cur of Object.keys(all)) {
            for (const year of Object.keys(all[cur] || {})) {
                const other = isFx ? all[cur]![year]?.inflationPct : all[cur]![year]?.fx;
                const payload: ManualYearRate = {};
                if (isFx) {
                    if (Number.isFinite(other)) payload.inflationPct = other as number;
                } else if (Number.isFinite(other)) {
                    payload.fx = other as number;
                }
                setManualRate(cur, year, payload);
            }
        }
        setDraft((prev) => {
            const next: Draft = {};
            for (const cur of Object.keys(prev)) {
                next[cur] = {};
                for (const year of Object.keys(prev[cur] || {})) next[cur]![year] = '';
            }
            return next;
        });
        setDirty(false);
        setSavedFlash(false);
        setImportedCount(null);
    };

    // "Set automatically from my trips" (this mode): fill BLANKS ONLY in the
    // draft — never overwrite a value already typed/pinned — across ALL the
    // user's currencies × the years they have expenses in. Uses the SAME maths
    // Insights reads back (computeAutoRate ↔ utils/presentValue.ts). FX skips
    // home (rate fixed at 1). CPI fetches are async, so we await each series.
    const onAutoFill = async () => {
        if (autoBusy) return;
        setAutoBusy(true);
        setSavedFlash(false);
        setAutoFilledCount(null);
        setImportedCount(null);
        try {
            const currencies = rowCurrencies; // already excludes home for FX
            if (!isFx) await Promise.all(currencies.map((c) => fetchCpiSeries(c)));

            const expenseList = (expenses || []) as Expense[];
            const cpi = STATE.cpiCache as Record<string, Record<number, number>>;
            let filled = 0;
            setDraft((prev) => {
                const next: Draft = { ...prev };
                for (const cur of currencies) {
                    const row = { ...(next[cur] || {}) };
                    // Fill every VISIBLE blank cell (the matrix's year columns),
                    // not just years that already have expenses — otherwise a
                    // currency the user added but hasn't spent in stays empty
                    // ("Filled 0 values").
                    for (const year of years) {
                        // BLANKS ONLY — leave a value the user already typed alone.
                        if ((row[year] ?? '').trim() !== '') continue;
                        // FX: never auto-fill a PAST year that has no expenses —
                        // the only fallback there is today's live rate, a
                        // misleading baseline for an old year (PV4-2). The
                        // current year (live rate) and any year with expenses
                        // (the rate actually paid) are fine.
                        if (isFx && Number(year) !== CURRENT_YEAR) {
                            const hasExpense = expenseList.some(
                                (e) => (e.currency || 'EUR').toUpperCase() === cur
                                    && (e.date || '').slice(0, 4) === year,
                            );
                            if (!hasExpense) continue;
                        }
                        const auto = computeAutoRate(mode, cur, year, expenseList, cpi[cur], home, convertCurrency);
                        if (auto == null || !Number.isFinite(auto)) continue;
                        row[year] = String(auto);
                        filled += 1;
                    }
                    next[cur] = row;
                }
                return next;
            });
            if (filled > 0) setDirty(true);
            setAutoFilledCount(filled);
        } finally {
            setAutoBusy(false);
        }
    };

    // ── Spreadsheet import + template ────────────────────────────────────────

    // Build the array-of-arrays for the current matrix (used by the template):
    // ['Currency', ...yearsDesc] header, then one row per currency with the
    // current value (typed draft → manual stored → auto where readily available).
    const currentValueForTemplate = (cur: string, year: string): string => {
        const typed = draft[cur]?.[year];
        if (typed != null && typed.trim() !== '') return typed;
        const stored = storedValue(cur, year);
        if (stored != null) return String(stored);
        const cpi = STATE.cpiCache as Record<string, Record<number, number>>;
        const auto = computeAutoRate(mode, cur, year, (expenses || []) as Expense[], cpi[cur], home, convertCurrency);
        return auto != null && Number.isFinite(auto) ? String(auto) : '';
    };

    const onDownloadTemplate = () => {
        const headerCells = [t('settings.ratesMatrixCurrencyCol'), ...years];
        const lines = [headerCells.join(',')];
        for (const cur of rowCurrencies) {
            const cells = [cur, ...years.map((y) => currentValueForTemplate(cur, y))];
            lines.push(cells.join(','));
        }
        const csv = lines.join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rates-${mode}-template.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Minimal, permissive CSV → array-of-arrays. We don't need full RFC-4180
    // quoting for a rates grid (codes + numbers), so a split is enough; quotes
    // are stripped so '"USD"' still reads as USD.
    const parseCsv = (text: string): string[][] =>
        text
            .replace(/\r\n/g, '\n')
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line) => line.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));

    // Fold parsed cells into the draft: overwrite the cells the file specifies,
    // leave the rest untouched. A currency/year not yet a row/col is added so the
    // value is visible (and saved). Returns how many cells were applied.
    const applyParsedCells = (cells: { currency: string; year: string; value: number }[]): number => {
        if (cells.length === 0) return 0;
        const newCurs = new Set<string>();
        const newYears = new Set<string>();
        for (const { currency, year } of cells) {
            if (isFx && currency === home) continue; // FX has no home row
            if (!rowCurrencies.includes(currency)) newCurs.add(currency);
            if (!years.includes(year)) newYears.add(year);
        }
        if (newCurs.size) setExtra((prev) => Array.from(new Set([...prev, ...newCurs])));
        if (newYears.size) setExtraYears((prev) => Array.from(new Set([...prev, ...newYears])));
        let applied = 0;
        setDraft((prev) => {
            const next: Draft = { ...prev };
            for (const { currency, year, value } of cells) {
                if (isFx && currency === home) continue;
                const row = { ...(next[currency] || {}) };
                row[year] = String(value);
                next[currency] = row;
                applied += 1;
            }
            return next;
        });
        return applied;
    };

    const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Allow re-picking the same file later.
        e.target.value = '';
        if (!file) return;
        setImportError(false);
        setImportedCount(null);
        setSavedFlash(false);
        const reader = new FileReader();
        const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
        reader.onload = (evt) => {
            try {
                let aoa: unknown[][];
                if (isCsv) {
                    aoa = parseCsv(String(evt.target?.result ?? ''));
                } else {
                    const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
                }
                const cells = parseRatesGrid(aoa, mode);
                const applied = applyParsedCells(cells);
                if (applied === 0) {
                    setImportError(true);
                    return;
                }
                setImportedCount(applied);
                setDirty(true);
            } catch (err) {
                console.error('Rates import error', err);
                setImportError(true);
            }
        };
        reader.onerror = () => setImportError(true);
        if (isCsv) reader.readAsText(file);
        else reader.readAsArrayBuffer(file);
    };

    // Whether ANY currency currently has a pinned value for this mode (gates the
    // "reset all to automatic" button — nothing to reset otherwise).
    const hasAnyPinned = useMemo(() => {
        const all = manualRates || {};
        for (const cur of Object.keys(all)) {
            for (const r of Object.values(all[cur] || {})) {
                if (Number.isFinite(isFx ? r.fx : r.inflationPct)) return true;
            }
        }
        return false;
    }, [manualRates, isFx]);

    // "€ EUR" / "$ USD" / "CAD" — symbol prefix when we have one, else the code.
    const curLabel = (c: string): string => (CURRENCY_SYMBOLS[c] ? CURRENCY_SYMBOLS[c] + ' ' : '') + c;

    // Summary of what the user actually has, computed from their expenses.
    const summaryLine = (() => {
        const list = Array.from(spentCurrencies);
        if (list.length === 0 || !yearSpan) return t('settings.ratesSummaryEmpty');
        const sorted = list.sort((a, b) => a.localeCompare(b)).join(', ');
        const span = yearSpan.min === yearSpan.max ? String(yearSpan.min) : `${yearSpan.min}–${yearSpan.max}`;
        return tn('settings.ratesSummary', list.length, { currencies: sorted, span });
    })();

    const cellAria = (cur: string, year: string): string =>
        isFx ? t('settings.ratesFxHint', { cur, home }) + ' ' + year : t('settings.ratesInflationCol') + ' ' + cur + ' ' + year;

    return (
        <div className="card glass settings-section card-glow-blue" id="customRates">
            <h2 className="card-title m-0 mb-1">{isFx ? t('settings.ratesTabFx') : t('settings.ratesTabInflation')}</h2>
            <p className="text-secondary text-[0.85rem] mt-1 mb-2">{isFx ? t('settings.ratesFxIntro') : t('settings.ratesInflationIntro')}</p>
            <p className="text-secondary text-[0.78rem] mt-0 mb-2">{isFx ? t('settings.ratesFxFieldNote') : t('settings.ratesInflationFieldNote')}</p>
            <p className="text-secondary text-[0.75rem] mt-0 mb-2 italic">{t('settings.ratesPrecedenceNote')}</p>

            {/* "How does this work?" explainer — mode-aware, mirrors
                utils/presentValue.ts exactly. */}
            <details className="rates-help mb-4">
                <summary className="text-[0.82rem] font-bold cursor-pointer select-none" style={{ color: 'var(--accent, #0a84ff)' }}>
                    {t('settings.ratesHelpToggle')}
                </summary>
                <div className="text-secondary text-[0.8rem] mt-2 flex flex-col gap-3" style={{ lineHeight: 1.5 }}>
                    <div>
                        <p className="font-bold text-[0.8rem] m-0 mb-1">{t('settings.ratesHelpWhatTitle')}</p>
                        <p className="m-0">{isFx ? t('settings.ratesHelpWhatFx') : t('settings.ratesHelpWhatInflation')}</p>
                    </div>
                    <div>
                        <p className="font-bold text-[0.8rem] m-0 mb-1">{t('settings.ratesHelpHowTitle')}</p>
                        <ul className="m-0 pl-4 flex flex-col gap-1" style={{ listStyle: 'disc' }}>
                            <li>{t('settings.ratesHelpHowYear')}</li>
                            <li>{isFx ? t('settings.ratesHelpHowFx', { year: String(CURRENT_YEAR) }) : t('settings.ratesHelpHowInflation')}</li>
                            <li>{t('settings.ratesHelpHowAuto')}</li>
                        </ul>
                    </div>
                    <div>
                        <p className="font-bold text-[0.8rem] m-0 mb-1">{isFx ? t('settings.ratesHelpFxFieldTitle') : t('settings.ratesHelpInflationFieldTitle')}</p>
                        <p className="m-0">{isFx ? t('settings.ratesHelpFxField', { home }) : t('settings.ratesHelpInflationField')}</p>
                    </div>
                    <div>
                        <p className="font-bold text-[0.8rem] m-0 mb-1">{t('settings.ratesHelpExampleTitle')}</p>
                        <p className="m-0 italic">{isFx ? t('settings.ratesHelpExampleFx') : t('settings.ratesHelpExampleInflation')}</p>
                    </div>
                </div>
            </details>

            {/* Summary of what the user actually has. */}
            <p className="text-secondary text-[0.82rem] mt-0 mb-3">{summaryLine}</p>

            {/* Action row: Set-automatically + Import + Download template. */}
            <div className="flex items-center gap-3 mb-2 flex-wrap">
                <button
                    type="button"
                    className="btn-neutral text-[0.82rem]"
                    style={{ padding: '8px 16px', borderRadius: '999px', opacity: autoBusy ? 0.7 : 1 }}
                    onClick={() => { void onAutoFill(); }}
                    disabled={autoBusy}
                >
                    {autoBusy ? t('settings.ratesAutoFillBusy') : t('settings.ratesAutoFill')}
                </button>
                <button
                    type="button"
                    className="btn-neutral text-[0.82rem]"
                    style={{ padding: '8px 16px', borderRadius: '999px' }}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {t('settings.ratesImport')}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    style={{ display: 'none' }}
                    onChange={onImportFile}
                    aria-hidden="true"
                />
                <button
                    type="button"
                    className="text-[0.82rem] font-bold"
                    style={{ color: 'var(--accent, #0a84ff)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px' }}
                    onClick={onDownloadTemplate}
                >
                    {t('settings.ratesDownloadTemplate')}
                </button>
            </div>

            {/* Status line for the action row (auto-fill / import results). */}
            <div className="mb-3 min-h-[1.1rem]">
                {autoFilledCount != null ? (
                    <span className="text-[0.82rem] font-bold" style={{ color: '#34c759' }}>
                        {tn('settings.ratesAutoFilled', autoFilledCount, { count: autoFilledCount })}
                    </span>
                ) : importedCount != null ? (
                    <span className="text-[0.82rem] font-bold" style={{ color: '#34c759' }}>
                        {tn('settings.ratesImportedN', importedCount, { count: importedCount })}
                    </span>
                ) : importError ? (
                    <span className="text-[0.82rem] font-bold" style={{ color: '#ff3b30' }}>
                        {t('settings.ratesImportError')}
                    </span>
                ) : (
                    <span className="text-secondary text-[0.78rem]">{t('settings.ratesImportHint')}</span>
                )}
            </div>

            {/* The matrix: currencies × years. Sticky first column + header row. */}
            <div className="rates-matrix-wrap">
                <table className="rates-matrix">
                    <thead>
                        <tr>
                            <th scope="col" className="rates-matrix__corner">{t('settings.ratesMatrixCurrencyCol')}</th>
                            {years.map((y) => (
                                <th key={y} scope="col" className="rates-matrix__yearhead tabular-nums">{y}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rowCurrencies.length === 0 ? (
                            <tr>
                                <td className="rates-matrix__rowhead">—</td>
                                <td colSpan={years.length} className="text-secondary text-[0.85rem]" style={{ padding: '10px 12px' }}>
                                    {t('settings.ratesEmpty')}
                                </td>
                            </tr>
                        ) : (
                            rowCurrencies.map((cur) => (
                                <tr key={cur}>
                                    <th scope="row" className="rates-matrix__rowhead">
                                        <span className="rates-matrix__cur">{cur}</span>
                                        {cur === home ? <span className="rates-matrix__hometag">{t('settings.ratesHomeTag')}</span> : null}
                                    </th>
                                    {years.map((year) => (
                                        <td key={year} className="rates-matrix__cell">
                                            <input
                                                type="number"
                                                step={isFx ? 'any' : '0.1'}
                                                min={isFx ? '0' : '-100'}
                                                inputMode="decimal"
                                                className="glass-input rates-matrix__input"
                                                placeholder={autoHint(cur, year) || t('settings.ratesAutoPlaceholder')}
                                                value={draft[cur]?.[year] ?? ''}
                                                onChange={(e) => updateCell(cur, year, e.target.value)}
                                                aria-label={cellAria(cur, year)}
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add-currency + add-year controls below the matrix. */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
                {otherCurrencies.length > 0 ? (
                    <select
                        id={`ratesCurAdd-${mode}`}
                        className="glass-input"
                        style={{ padding: '8px 10px', borderRadius: '10px', fontSize: '0.82rem' }}
                        value=""
                        aria-label={t('settings.ratesAddCurrency')}
                        onChange={(e) => addCurrency(e.target.value)}
                    >
                        <option value="">{t('settings.ratesAddCurrency')}</option>
                        {otherCurrencies.map((c) => (
                            <option key={c} value={c}>{curLabel(c)}</option>
                        ))}
                    </select>
                ) : null}
                <input
                    type="number"
                    step="1"
                    min="1900"
                    max={CURRENT_YEAR + 1}
                    inputMode="numeric"
                    className="glass-input"
                    style={{ width: '110px', padding: '8px 10px', borderRadius: '10px' }}
                    placeholder={t('settings.ratesNewYearPlaceholder')}
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addYear();
                        }
                    }}
                />
                <button type="button" className="btn-neutral text-[0.85rem]" style={{ padding: '8px 16px', borderRadius: '999px' }} onClick={addYear}>
                    {t('settings.ratesAddYear')}
                </button>
            </div>

            {/* Save bar + reset-all-to-automatic. */}
            <div className="flex items-center gap-3 mt-4 flex-wrap section-divider pt-4">
                <button
                    type="button"
                    className="btn-primary text-[0.9rem]"
                    style={{ padding: '9px 22px', borderRadius: '999px', opacity: dirty ? 1 : 0.6 }}
                    onClick={onSave}
                    disabled={!dirty}
                >
                    {t('settings.ratesSave')}
                </button>
                {hasAnyPinned ? (
                    <button
                        type="button"
                        className="btn-neutral text-[0.82rem]"
                        style={{ padding: '8px 16px', borderRadius: '999px' }}
                        onClick={onResetAuto}
                    >
                        {t('settings.ratesResetAllAuto')}
                    </button>
                ) : null}
                {savedFlash ? (
                    <span className="text-[0.82rem] font-bold" style={{ color: '#34c759' }}>
                        {t('settings.ratesSavedFlash')}
                    </span>
                ) : dirty ? (
                    <span className="text-secondary text-[0.78rem]">{t('settings.ratesUnsavedHint')}</span>
                ) : null}
            </div>
        </div>
    );
}
