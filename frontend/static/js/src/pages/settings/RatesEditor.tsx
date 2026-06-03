// pages/settings/RatesEditor.tsx
//
// Settings → Personalization, "Exchange rates" and "Inflation" pills. One
// mode-aware editor for the global MANUAL rates that override the automatic
// figures in Insights ("Spent" / "Worth today"). `mode='fx'` edits the
// per-year exchange rate (1 unit of the currency in HOME units); `mode='infl'`
// edits the per-year inflation % (cumulative-to-today). Both write to
// STATE.manualRates (via utils/manualRates), keyed by UPPERCASE currency → year.
//
// Differences from the old combined editor:
//   - Split by concern (FX vs inflation) so each pill shows one column.
//   - EXPLICIT Save (D3): edits live in local state until the user clicks Save,
//     so a half-typed rate never lands in the calc. A dirty hint nudges them.
//   - Reset to automatic (D4): clears THIS currency's manual values for THIS
//     mode (the other mode is preserved), so the calc falls back to the live
//     API sources — World-Bank CPI for inflation, Frankfurter/live FX for rates.
//     The cleared inputs then show the automatic value as a placeholder hint.
//
// Precedence (unchanged): a per-trip override beats these globals, which beat
// the automatic sources. Blank = automatic. Settlements/budgets never read this.

import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../react/store.js';
import { CURRENCY_SYMBOLS } from '../../constants.js';
import { getHomeCurrency } from '../../utils.js';
import { getSupportedCurrencies, convertCurrency } from '../../utils/currency.js';
import {
    getManualRatesForCurrency,
    setManualRate,
    type ManualYearRate,
} from '../../utils/manualRates.js';
import { makeInflationFactor } from '../../utils/presentValue.js';
import { fetchCpiSeries } from '../../api.js';
import type { Expense } from '../../types';
import { t } from '../../i18n.js';

export type RatesMode = 'fx' | 'infl';

interface Row {
    year: string;
    /** The edited value as a string (fx units, or inflation %), '' = automatic. */
    value: string;
}

const CURRENT_YEAR = new Date().getFullYear();

export function RatesEditor({ mode }: { mode: RatesMode }) {
    const isFx = mode === 'fx';
    // Subscribe so external resets / CPI fetches re-render.
    const manualRates = useStore((s) => s.manualRates);
    const expenses = useStore((s) => s.expenses);
    const cpiCache = useStore((s) => s.cpiCache);

    const home = (getHomeCurrency() || 'EUR').toUpperCase();

    // Currency picker options. FX excludes the home currency (its rate is always
    // 1); inflation includes it (home prices inflate too). Home first, then A→Z.
    const currencyOptions = useMemo(() => {
        const spent = (expenses || []).map((e: Expense) => (e.currency || 'EUR').toUpperCase());
        const pinned = Object.keys(manualRates || {});
        const known = [...getSupportedCurrencies(), ...Object.keys(CURRENCY_SYMBOLS)].map((c) => c.toUpperCase());
        const set = new Set<string>([home, ...spent, ...pinned, ...known]);
        const all = Array.from(set).sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)));
        return isFx ? all.filter((c) => c !== home) : all;
    }, [expenses, manualRates, home, isFx]);

    const [selectedCur, setSelectedCur] = useState(() => currencyOptions[0] || home);
    const [rows, setRows] = useState<Row[]>([]);
    const [newYear, setNewYear] = useState('');
    const [dirty, setDirty] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

    // Read the persisted value for one field of a currency+year.
    const storedValue = (cur: string, year: string): number | undefined => {
        const entry = getManualRatesForCurrency(cur)[year];
        if (!entry) return undefined;
        return isFx ? entry.fx : entry.inflationPct;
    };

    // (Re)build editable rows for a currency from what's persisted + the years it
    // has expenses in, newest first; always at least the current year.
    const buildRows = (cur: string): Row[] => {
        const pinned = getManualRatesForCurrency(cur);
        const expenseYears = (expenses || [])
            .filter((e: Expense) => (e.currency || 'EUR').toUpperCase() === cur && /^\d{4}/.test(e.date || ''))
            .map((e: Expense) => (e.date || '').slice(0, 4));
        const years = Array.from(new Set<string>([...Object.keys(pinned), ...expenseYears]))
            .filter((y) => /^\d{4}$/.test(y))
            .sort((a, b) => Number(b) - Number(a));
        if (years.length === 0) years.push(String(CURRENT_YEAR));
        return years.map((year) => {
            const v = storedValue(cur, year);
            return { year, value: v != null ? String(v) : '' };
        });
    };

    // Reload rows when the currency (or mode) changes; drop any unsaved edits.
    useEffect(() => {
        setRows(buildRows(selectedCur));
        setNewYear('');
        setDirty(false);
        setSavedFlash(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCur, mode]);

    // Inflation mode: lazily pull the World-Bank CPI series for the selected
    // currency so the "auto ≈ N%" hint can render. FX auto is synchronous
    // (convertCurrency), so it needs no fetch. cpiCache is a useStore dep → the
    // hints refine once the series lands.
    useEffect(() => {
        if (!isFx && selectedCur) void fetchCpiSeries(selectedCur);
    }, [isFx, selectedCur]);

    // The automatic value for a year, formatted for the placeholder hint.
    // PV4-2: `convertCurrency` only knows TODAY's rate — it has no historical
    // table — so it must NOT be shown as the "auto" baseline for a PAST year
    // (it would mis-teach the user that blank == today's rate on a 2015 row,
    // re-introducing the era-mix the at-trip historical FX avoids). For FX we
    // therefore only surface the live rate on the CURRENT-year row (labelled as
    // "current rate", not a generic "auto ≈"); past FX rows fall back to the
    // neutral "auto" placeholder. The inflation hint is per-year-correct (it
    // uses the CPI factor for that year), so it stays as-is.
    const autoHint = (year: string): string | null => {
        if (isFx) {
            // Only the CURRENT-year row gets a live-rate hint; past years show
            // the neutral "auto" placeholder rather than a wrong baseline.
            if (Number(year) !== CURRENT_YEAR) return null;
            const r = convertCurrency(1, selectedCur, home);
            if (!Number.isFinite(r) || r <= 0) return null;
            return t('settings.ratesAutoHint', { value: String(Number(r.toPrecision(6))) + ' ' + home });
        }
        const series = cpiCache[selectedCur];
        if (!series || Object.keys(series).length === 0) return null;
        const factor = makeInflationFactor(series, CURRENT_YEAR)(`${year}-06-15`);
        const pct = Math.round((factor - 1) * 1000) / 10;
        return t('settings.ratesAutoHint', { value: String(pct) + '%' });
    };

    const updateRow = (idx: number, value: string) => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, value } : r)));
        setDirty(true);
        setSavedFlash(false);
    };

    const removeRow = (idx: number) => {
        setRows((prev) => prev.filter((_, i) => i !== idx));
        setDirty(true);
        setSavedFlash(false);
    };

    const addYear = () => {
        const y = newYear.trim();
        if (!/^\d{4}$/.test(y)) return;
        const yr = Number(y);
        if (yr < 1900 || yr > CURRENT_YEAR + 1) return;
        if (rows.some((r) => r.year === y)) {
            setNewYear('');
            return;
        }
        setRows((prev) => [{ year: y, value: '' }, ...prev].sort((a, b) => Number(b.year) - Number(a.year)));
        setNewYear('');
        setDirty(true);
    };

    // Persist the current rows for this mode, MERGING with the other mode's
    // stored value per year (so editing FX never wipes a saved inflation % and
    // vice-versa). Years removed from the list get this mode's field cleared.
    const onSave = () => {
        const existing = getManualRatesForCurrency(selectedCur);
        const rowYears = new Set(rows.map((r) => r.year));
        const writeMerged = (year: string, raw: string) => {
            const other = isFx ? existing[year]?.inflationPct : existing[year]?.fx;
            const payload: ManualYearRate = {};
            // Preserve the other mode's value.
            if (isFx) {
                if (Number.isFinite(other)) payload.inflationPct = other as number;
            } else if (Number.isFinite(other)) {
                payload.fx = other as number;
            }
            // Apply this mode's edited value (blank clears it).
            const n = Number(raw);
            if (raw.trim() !== '' && Number.isFinite(n)) {
                if (isFx) {
                    if (n > 0) payload.fx = n;
                } else {
                    payload.inflationPct = n;
                }
            }
            setManualRate(selectedCur, year, payload);
        };
        // Clear this mode's field for years the user removed.
        Object.keys(existing).forEach((year) => {
            if (!rowYears.has(year)) writeMerged(year, '');
        });
        rows.forEach((r) => writeMerged(r.year, r.value));
        setDirty(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2000);
    };

    // Reset to automatic: clear THIS mode's field for every stored year of the
    // currency (the other mode is preserved), so the calc uses the live API
    // value. Inputs blank out and show the automatic figure as a placeholder.
    const onResetAuto = () => {
        const existing = getManualRatesForCurrency(selectedCur);
        Object.keys(existing).forEach((year) => {
            const other = isFx ? existing[year]?.inflationPct : existing[year]?.fx;
            const payload: ManualYearRate = {};
            if (isFx) {
                if (Number.isFinite(other)) payload.inflationPct = other as number;
            } else if (Number.isFinite(other)) {
                payload.fx = other as number;
            }
            setManualRate(selectedCur, year, payload);
        });
        setRows((prev) => prev.map((r) => ({ ...r, value: '' })));
        setDirty(false);
        setSavedFlash(false);
    };

    // Whether this currency currently has ANY pinned value for this mode (gates
    // the Reset-to-automatic button — nothing to reset otherwise).
    const hasPinned = useMemo(() => {
        const byYear = getManualRatesForCurrency(selectedCur);
        return Object.values(byYear).some((r) => Number.isFinite(isFx ? r.fx : r.inflationPct));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCur, manualRates, isFx]);

    const colLabel = isFx ? t('settings.ratesFxHint', { cur: selectedCur, home }) : t('settings.ratesInflationCol');

    return (
        <div className="card glass settings-section card-glow-blue" id="customRates">
            <h2 className="card-title m-0 mb-1">{isFx ? t('settings.ratesTabFx') : t('settings.ratesTabInflation')}</h2>
            <p className="text-secondary text-[0.85rem] mt-1 mb-2">{isFx ? t('settings.ratesFxIntro') : t('settings.ratesInflationIntro')}</p>
            {/* PV4-3: spell out the two-field model. In "Worth today", a manual
                current-year FX is paired with the inflation accumulated SINCE the
                expense's year — the two manual fields answer different questions,
                so name each one explicitly to remove the muddiness D-2/D-3 flagged. */}
            <p className="text-secondary text-[0.78rem] mt-0 mb-2">{isFx ? t('settings.ratesFxFieldNote') : t('settings.ratesInflationFieldNote')}</p>
            <p className="text-secondary text-[0.75rem] mt-0 mb-4 italic">{t('settings.ratesPrecedenceNote')}</p>

            {/* Currency picker + per-currency reset */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <label className="font-bold text-[0.85rem]" htmlFor={`ratesCurSelect-${mode}`}>
                    {t('settings.ratesCurrencyLabel')}
                </label>
                <select
                    id={`ratesCurSelect-${mode}`}
                    className="glass-input"
                    style={{ minWidth: '140px', padding: '8px 10px', borderRadius: '10px' }}
                    value={selectedCur}
                    onChange={(e) => setSelectedCur(e.target.value)}
                >
                    {currencyOptions.map((c) => (
                        <option key={c} value={c}>
                            {(CURRENCY_SYMBOLS[c] ? CURRENCY_SYMBOLS[c] + ' ' : '') + c}
                            {c === home ? ` (${t('settings.ratesHomeTag')})` : ''}
                        </option>
                    ))}
                </select>
                {hasPinned ? (
                    <button
                        type="button"
                        className="btn-neutral text-[0.8rem]"
                        style={{ padding: '7px 14px', borderRadius: '999px', marginLeft: 'auto' }}
                        onClick={onResetAuto}
                    >
                        {t('settings.ratesResetAuto')}
                    </button>
                ) : null}
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-3 px-1 mb-1 text-secondary text-[0.72rem] font-bold uppercase tracking-wide">
                <span style={{ width: '64px' }}>{t('settings.ratesYearCol')}</span>
                <span style={{ flex: 1, minWidth: '140px' }}>{colLabel}</span>
                <span style={{ width: '28px' }} aria-hidden="true"></span>
            </div>

            {/* Rows */}
            <div className="flex flex-col gap-2">
                {rows.length === 0 ? (
                    <div className="text-secondary text-[0.85rem] py-2">{t('settings.ratesEmpty')}</div>
                ) : (
                    rows.map((row, idx) => (
                        <div key={row.year} className="flex items-center gap-3 flex-wrap">
                            <span className="font-extrabold tabular-nums" style={{ width: '64px' }}>
                                {row.year}
                            </span>
                            <input
                                type="number"
                                step={isFx ? 'any' : '0.1'}
                                min={isFx ? '0' : '-100'}
                                inputMode="decimal"
                                className="glass-input"
                                style={{ flex: 1, minWidth: '140px', padding: '7px 10px', borderRadius: '10px' }}
                                placeholder={autoHint(row.year) || t('settings.ratesAutoPlaceholder')}
                                value={row.value}
                                onChange={(e) => updateRow(idx, e.target.value)}
                                aria-label={colLabel}
                            />
                            <button
                                type="button"
                                className="cat-row__btn cat-row__btn--delete"
                                style={{ width: '28px', height: '28px' }}
                                title={t('settings.ratesRemoveYear', { year: row.year })}
                                aria-label={t('settings.ratesRemoveYear', { year: row.year })}
                                onClick={() => removeRow(idx)}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Add-year control */}
            <div className="flex items-center gap-3 mt-4 flex-wrap">
                <input
                    type="number"
                    step="1"
                    min="1900"
                    max={CURRENT_YEAR + 1}
                    inputMode="numeric"
                    className="glass-input"
                    style={{ width: '110px', padding: '7px 10px', borderRadius: '10px' }}
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

            {/* Save bar */}
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
