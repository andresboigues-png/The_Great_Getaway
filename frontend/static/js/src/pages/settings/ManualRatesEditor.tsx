// pages/settings/ManualRatesEditor.tsx
//
// Settings → Personalization: a comprehensive, per-currency / per-year editor
// for MANUAL exchange + inflation rates that override the automatic ones in
// Insights ("Spent" / "Worth today"). Writes go straight to STATE.manualRates
// (via utils/manualRates) and persist on this device through the normal
// debounced localStorage save — no Save button needed.
//
// Precedence (documented for the user in the intro): a per-trip override
// (set from the Insights ⓘ panel) beats these globals, which in turn beat the
// automatic World-Bank CPI + Frankfurter/live FX. Blank fields fall back to
// automatic. Settlements + budgets never read any of this (they stay nominal).

import { useEffect, useState } from 'react';
import { useStore } from '../../react/store.js';
import { CURRENCY_SYMBOLS } from '../../constants.js';
import { getHomeCurrency } from '../../utils.js';
import { getSupportedCurrencies } from '../../utils/currency.js';
import {
    getManualRatesForCurrency,
    setManualRate,
    clearManualRatesForCurrency,
    type ManualYearRate,
} from '../../utils/manualRates.js';
import type { Expense } from '../../types';
import { t } from '../../i18n.js';

interface Row {
    year: string;
    fx: string;
    inflationPct: string;
}

const CURRENT_YEAR = new Date().getFullYear();

export function ManualRatesEditor() {
    // Subscribe so external resets re-render; expenses drive the currency list
    // + which years to pre-fill.
    const manualRates = useStore((s) => s.manualRates);
    const expenses = useStore((s) => s.expenses);

    const home = (getHomeCurrency() || 'EUR').toUpperCase();

    // Currencies offered in the picker: home + everything spent in + everything
    // already pinned + the full known set, de-duped, home first then A→Z.
    const currencyOptions = (() => {
        const spent = (expenses || []).map((e: Expense) => (e.currency || 'EUR').toUpperCase());
        const pinned = Object.keys(manualRates || {});
        const known = [...getSupportedCurrencies(), ...Object.keys(CURRENCY_SYMBOLS)].map((c) => c.toUpperCase());
        const set = new Set<string>([home, ...spent, ...pinned, ...known]);
        return Array.from(set).sort((a, b) => (a === home ? -1 : b === home ? 1 : a.localeCompare(b)));
    })();

    const [selectedCur, setSelectedCur] = useState(home);
    const [rows, setRows] = useState<Row[]>([]);
    const [newYear, setNewYear] = useState('');

    // (Re)build the editable rows for a currency: the union of years already
    // pinned for it and years it has expenses in, newest first. One blank
    // current-year row if there's nothing yet, so there's always something to fill.
    const buildRows = (cur: string): Row[] => {
        const pinned = getManualRatesForCurrency(cur);
        const expenseYears = (expenses || [])
            .filter((e: Expense) => (e.currency || 'EUR').toUpperCase() === cur && /^\d{4}/.test(e.date || ''))
            .map((e: Expense) => (e.date || '').slice(0, 4));
        const years = Array.from(new Set<string>([...Object.keys(pinned), ...expenseYears]))
            .filter((y) => /^\d{4}$/.test(y))
            .sort((a, b) => Number(b) - Number(a));
        if (years.length === 0) years.push(String(CURRENT_YEAR));
        return years.map((year) => ({
            year,
            fx: pinned[year]?.fx != null ? String(pinned[year]!.fx) : '',
            inflationPct: pinned[year]?.inflationPct != null ? String(pinned[year]!.inflationPct) : '',
        }));
    };

    // Reload rows whenever the selected currency changes.
    useEffect(() => {
        setRows(buildRows(selectedCur));
        setNewYear('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedCur]);

    const isHome = selectedCur === home;

    // Persist a single row to STATE (parses the strings; blanks clear that
    // field). Home currency never stores an fx (the calc treats it as 1).
    const persistRow = (row: Row) => {
        const fxNum = Number(row.fx);
        const inflNum = Number(row.inflationPct);
        // Build conditionally — exactOptionalPropertyTypes forbids passing an
        // explicit `undefined`. An empty payload clears that year. Home
        // currency never stores an fx (the calc treats it as 1).
        const payload: ManualYearRate = {};
        if (!isHome && row.fx.trim() !== '' && Number.isFinite(fxNum)) payload.fx = fxNum;
        if (row.inflationPct.trim() !== '' && Number.isFinite(inflNum)) payload.inflationPct = inflNum;
        setManualRate(selectedCur, row.year, payload);
    };

    const updateRow = (idx: number, patch: Partial<Row>) => {
        setRows((prev) => {
            const next = prev.map((r, i) => (i === idx ? { ...r, ...patch } : r));
            persistRow(next[idx]!);
            return next;
        });
    };

    const removeRow = (idx: number) => {
        setRows((prev) => {
            const row = prev[idx];
            if (row) setManualRate(selectedCur, row.year, null); // clear it
            return prev.filter((_, i) => i !== idx);
        });
    };

    const addYear = () => {
        const y = newYear.trim();
        if (!/^\d{4}$/.test(y)) return;
        const yr = Number(y);
        if (yr < 1900 || yr > CURRENT_YEAR + 1) return;
        if (rows.some((r) => r.year === y)) { setNewYear(''); return; }
        setRows((prev) => [{ year: y, fx: '', inflationPct: '' }, ...prev].sort((a, b) => Number(b.year) - Number(a.year)));
        setNewYear('');
    };

    const resetCurrency = () => {
        clearManualRatesForCurrency(selectedCur);
        setRows(buildRows(selectedCur).map((r) => ({ ...r, fx: '', inflationPct: '' })));
    };

    const hasAnyPinned = Object.keys(getManualRatesForCurrency(selectedCur)).length > 0;

    return (
        <div className="card glass settings-section card-glow-blue" id="customRates">
            <h2 className="card-title m-0 mb-1">{t('settings.ratesTitle')}</h2>
            <p className="text-secondary text-[0.85rem] mt-1 mb-2">{t('settings.ratesIntro')}</p>
            <p className="text-secondary text-[0.75rem] mt-0 mb-4 italic">{t('settings.ratesPrecedenceNote')}</p>

            {/* Currency picker */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
                <label className="font-bold text-[0.85rem]" htmlFor="ratesCurSelect">
                    {t('settings.ratesCurrencyLabel')}
                </label>
                <select
                    id="ratesCurSelect"
                    className="glass-input"
                    style={{ minWidth: '120px', padding: '8px 10px', borderRadius: '10px' }}
                    value={selectedCur}
                    onChange={(e) => setSelectedCur(e.target.value)}
                >
                    {currencyOptions.map((c) => (
                        <option key={c} value={c}>
                            {(CURRENCY_SYMBOLS[c] ? CURRENCY_SYMBOLS[c] + ' ' : '') + c}{c === home ? ` (${t('settings.ratesHomeTag')})` : ''}
                        </option>
                    ))}
                </select>
                {hasAnyPinned ? (
                    <button
                        type="button"
                        className="btn-neutral text-[0.8rem]"
                        style={{ padding: '7px 14px', borderRadius: '999px', marginLeft: 'auto' }}
                        onClick={resetCurrency}
                    >
                        {t('settings.ratesReset', { cur: selectedCur })}
                    </button>
                ) : null}
            </div>

            {isHome ? (
                <p className="text-secondary text-[0.78rem] mb-3">{t('settings.ratesHomeNoFx', { home })}</p>
            ) : null}

            {/* Column headers */}
            <div className="flex items-center gap-3 px-1 mb-1 text-secondary text-[0.72rem] font-bold uppercase tracking-wide">
                <span style={{ width: '64px' }}>{t('settings.ratesYearCol')}</span>
                {!isHome ? <span style={{ flex: 1, minWidth: '120px' }}>{t('settings.ratesFxHint', { cur: selectedCur, home })}</span> : null}
                <span style={{ flex: 1, minWidth: '120px' }}>{t('settings.ratesInflationCol')}</span>
                <span style={{ width: '28px' }} aria-hidden="true"></span>
            </div>

            {/* Rows */}
            <div className="flex flex-col gap-2">
                {rows.length === 0 ? (
                    <div className="text-secondary text-[0.85rem] py-2">{t('settings.ratesEmpty')}</div>
                ) : (
                    rows.map((row, idx) => (
                        <div key={row.year} className="flex items-center gap-3 flex-wrap">
                            <span className="font-extrabold tabular-nums" style={{ width: '64px' }}>{row.year}</span>
                            {!isHome ? (
                                <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    inputMode="decimal"
                                    className="glass-input"
                                    style={{ flex: 1, minWidth: '120px', padding: '7px 10px', borderRadius: '10px' }}
                                    placeholder={t('settings.ratesAutoPlaceholder')}
                                    value={row.fx}
                                    onChange={(e) => updateRow(idx, { fx: e.target.value })}
                                    aria-label={t('settings.ratesFxHint', { cur: selectedCur, home })}
                                />
                            ) : null}
                            <input
                                type="number"
                                step="0.1"
                                min="-100"
                                inputMode="decimal"
                                className="glass-input"
                                style={{ flex: 1, minWidth: '120px', padding: '7px 10px', borderRadius: '10px' }}
                                placeholder={t('settings.ratesAutoPlaceholder')}
                                value={row.inflationPct}
                                onChange={(e) => updateRow(idx, { inflationPct: e.target.value })}
                                aria-label={t('settings.ratesInflationCol')}
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
            <div className="flex items-center gap-3 mt-4 flex-wrap section-divider pt-4">
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
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addYear(); } }}
                />
                <button type="button" className="btn-primary text-[0.85rem]" style={{ padding: '8px 16px' }} onClick={addYear}>
                    {t('settings.ratesAddYear')}
                </button>
                <span className="text-secondary text-[0.72rem] ml-auto">{t('settings.ratesSavedHint')}</span>
            </div>
        </div>
    );
}
