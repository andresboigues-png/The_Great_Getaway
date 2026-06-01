// pages/expenses/ManualTab.tsx — §3.3 React migration.
//
// Manual expense entry form: pick who paid, category, label, date,
// country, value, currency, optional split, optional receipt. Was
// ~530 lines of imperative renderManualTab() with extensive ref-
// shadowing closures (currencyManuallyChosen, receiptUrl,
// activeSplitters) wired up inside a setTimeout to give the
// innerHTML a frame to land. JSX migration folds all that into
// component-local React state.
//
// Design choices
//   - Form fields stay UNCONTROLLED (defaultValue + refs). Reasons:
//       a) Each input writes to STATE.draftExpense on every change
//          (mirrors legacy draft auto-save). Controlled inputs
//          would mean re-render-per-keystroke for the whole form
//          via useStore subscription. Uncontrolled + refs avoids
//          that churn while preserving the autosave behaviour.
//       b) Edit-mode pre-fill (when the user clicks "edit" on a
//          History row) writes to STATE.draftExpense and navigates
//          here — refs read d.X for the initial value via
//          defaultValue, no re-render needed.
//   - Country combobox uses React state for visual concerns
//     (open / active index / search filter) but the input itself
//     is controlled because we need to programmatically set its
//     value after a click-pick.
//   - Split editor uses useState for `splitters: string[]`. Add/
//     remove triggers a re-render that paints the rows with fresh
//     defaultPct.
//   - Receipt picker keeps `receiptUrl` in component state
//     (mirrored to STATE.draftExpense.receiptUrl on every change
//     so the draft survives navigate-away).
//   - Save status (the green "✓ Expense saved" toast under the
//     submit button) is a small useState that times itself out
//     via setTimeout — same as legacy.
//
// Auto-suggest currency: a useRef boolean tracks whether the user
// has personally touched the currency dropdown. Until they do,
// picking a country auto-fills the currency from
// COUNTRY_TO_CURRENCY. Edit-mode starts with the flag already set
// so a re-pick of the country can't clobber the existing currency.

import { useEffect, useMemo, useRef, useState } from 'react';
import { STATE, emit } from '../../state.js';
import {
    COUNTRIES,
    CONVERSION_RATES,
    COUNTRY_TO_CURRENCY,
} from '../../constants.js';
import { generateId, showLiquidAlert } from '../../utils.js';
import { upsertExpense, uploadMedia } from '../../api.js';
import { convertCurrency, getSupportedCurrencies, hasRate } from '../../utils/currency.js';
import { navigate } from '../../router.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';
import type { Expense } from '../../types';


// Pre-sort the countries list so the combobox dropdown shows
// alphabetical order without re-sorting per render.
const SORTED_COUNTRIES = [...COUNTRIES].sort();

// R3-Round 2 fix: pre-fix this was `Object.keys(CONVERSION_RATES)` (17
// entries), hard-locking the form to a narrow 2024-era list — THB /
// EGP / TRY / ARS / VND / PHP all in the server's _ALLOWED_CURRENCIES
// but invisible to the user. `getSupportedCurrencies()` returns the
// union of CONVERSION_RATES + the live FX cache + EUR, sorted with
// EUR first. Called as a function not a top-level constant so a
// late-arriving /api/fx-rates payload (Frankfurter slow path)
// expands the dropdown on the next render rather than being stuck
// on the boot-time snapshot.


export function ManualTab() {
    // Read STATE directly (no useStore) — we don't want every emit to
    // re-render this 7-field form. The legacy renderer was also a
    // one-shot render; per-field changes only mutate STATE.draftExpense
    // and DO NOT visually update the rest of the form. Add-category,
    // add-companion, etc. propagate on tab unmount/remount.
    const activeTrip = STATE.trips.find((tr) => tr.id === STATE.activeTripId);
    const tripCompanionNames = useMemo(
        () => (activeTrip?.companions ?? []).map((c) => c.name),
        [activeTrip],
    );
    const hasTripCompanions = tripCompanionNames.length > 0;
    const categories = STATE.categories;

    // ── refs for uncontrolled form fields ────────────────────────
    const whoRef = useRef<HTMLSelectElement | null>(null);
    const categoryRef = useRef<HTMLSelectElement | null>(null);
    const labelRef = useRef<HTMLInputElement | null>(null);
    const dateRef = useRef<HTMLInputElement | null>(null);
    const valueRef = useRef<HTMLInputElement | null>(null);
    const currencyRef = useRef<HTMLSelectElement | null>(null);

    // ── country combobox state ───────────────────────────────────
    const initialCountry = STATE.draftExpense?.country || '';
    const [countryValue, setCountryValue] = useState(initialCountry);
    const [comboOpen, setComboOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const countryInputRef = useRef<HTMLInputElement | null>(null);
    const countryListRef = useRef<HTMLDivElement | null>(null);

    // currencyManuallyChosen — flips the first time the user touches
    // the currency dropdown themselves. Edit-mode starts true so a
    // country re-pick can't clobber the existing currency.
    const currencyManuallyChosen = useRef<boolean>(!!STATE.draftExpense?.id);

    // ── split editor state ───────────────────────────────────────
    const [splitters, setSplitters] = useState<string[]>([]);

    // ── receipt picker state ─────────────────────────────────────
    const [receiptUrl, setReceiptUrl] = useState<string | null>(
        STATE.draftExpense?.receiptUrl || null,
    );
    const [receiptStatus, setReceiptStatus] = useState<string>('');
    const [receiptUploading, setReceiptUploading] = useState(false);
    const receiptInputRef = useRef<HTMLInputElement | null>(null);

    // ── save status (green confirmation under submit) ────────────
    const [saveStatus, setSaveStatus] = useState<{ text: string; color: string } | null>(null);

    // ── click-outside-to-close the combobox ──────────────────────
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node | null;
            const container = countryListRef.current?.parentElement?.parentElement; // .form-row
            if (!target || !container) return;
            if (!container.contains(target)) {
                setComboOpen(false);
                setActiveIdx(-1);
            }
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, []);

    // ── filtered country options ─────────────────────────────────
    const filteredCountries = useMemo(() => {
        const needle = countryValue.toLowerCase();
        const filtered = needle
            ? SORTED_COUNTRIES.filter((c) => c.toLowerCase().includes(needle))
            : SORTED_COUNTRIES;
        // Always offer "Other" at the bottom for off-list picks.
        return [...filtered, 'Other'];
    }, [countryValue]);

    // ── scroll active option into view ───────────────────────────
    useEffect(() => {
        if (activeIdx < 0) return;
        const el = countryListRef.current?.querySelector<HTMLElement>(
            `[data-idx="${activeIdx}"]`,
        );
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIdx]);

    // ── helper: write a single draft field + emit ────────────────
    const draft = (key: keyof typeof STATE.draftExpense, value: any) => {
        (STATE.draftExpense as any)[key] = value;
        emit('state:changed');
    };

    // ── country pick ─────────────────────────────────────────────
    const onPickCountry = (countryName: string) => {
        setCountryValue(countryName);
        setComboOpen(false);
        setActiveIdx(-1);
        STATE.draftExpense.country = countryName;

        // Auto-suggest currency from country, unless the user has
        // already picked one. The suggested code must exist in
        // CONVERSION_RATES (so we never write a value that isn't an
        // option in the dropdown).
        if (!currencyManuallyChosen.current) {
            const suggested = COUNTRY_TO_CURRENCY[countryName];
            if (suggested && CONVERSION_RATES[suggested] !== undefined && currencyRef.current) {
                currencyRef.current.value = suggested;
                STATE.draftExpense.currency = suggested;
            }
        }
        emit('state:changed');
    };

    // ── keyboard nav on the country combobox ─────────────────────
    const onCountryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!comboOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') setComboOpen(true);
        }
        const count = filteredCountries.length;
        if (count === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((idx) => (idx + 1 + count) % count);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((idx) => (idx - 1 + count) % count);
            return;
        }
        if (e.key === 'Home') {
            e.preventDefault();
            setActiveIdx(0);
            return;
        }
        if (e.key === 'End') {
            e.preventDefault();
            setActiveIdx(count - 1);
            return;
        }
        if (e.key === 'Enter') {
            const picked = activeIdx >= 0 ? filteredCountries[activeIdx] : undefined;
            if (picked) {
                e.preventDefault();
                onPickCountry(picked);
            }
            return;
        }
        if (e.key === 'Escape') {
            setComboOpen(false);
            setActiveIdx(-1);
            return;
        }
        if (e.key === 'Tab') {
            // Don't trap Tab; let it move focus naturally and just
            // close the popup as a side effect.
            setComboOpen(false);
            setActiveIdx(-1);
            return;
        }
    };

    // ── split editor handlers ────────────────────────────────────
    const [addSplitChoice, setAddSplitChoice] = useState('');
    const onAddSplit = () => {
        if (addSplitChoice && !splitters.includes(addSplitChoice)) {
            setSplitters([...splitters, addSplitChoice]);
            setAddSplitChoice('');
        }
    };
    const onRemoveSplit = (person: string) => {
        setSplitters(splitters.filter((p) => p !== person));
    };

    // ── receipt picker handlers ──────────────────────────────────
    const onPickReceipt = () => receiptInputRef.current?.click();

    const onReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setReceiptStatus(t('expenses.uploading'));
        setReceiptUploading(true);
        try {
            const result = await uploadMedia(file);
            if (result?.url) {
                setReceiptUrl(result.url);
                setReceiptStatus('');
                STATE.draftExpense.receiptUrl = result.url;
                emit('state:changed');
            } else {
                const msg = result?.error || t('expenses.uploadFailed');
                setReceiptStatus(msg);
                showLiquidAlert(msg);
            }
        } catch (err) {
            console.warn('receipt upload failed', err);
            const msg = t('expenses.uploadFailed');
            setReceiptStatus(msg);
            showLiquidAlert(msg);
        } finally {
            setReceiptUploading(false);
            // Reset so re-picking the same file still fires `change`.
            if (receiptInputRef.current) receiptInputRef.current.value = '';
        }
    };

    const onRemoveReceipt = () => {
        setReceiptUrl(null);
        STATE.draftExpense.receiptUrl = null;
        emit('state:changed');
    };

    const onViewReceipt = () => {
        if (receiptUrl) window.open(receiptUrl, '_blank', 'noopener');
    };

    // ── submit ──────────────────────────────────────────────────
    const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!STATE.activeTripId) return;
        const tripId = STATE.activeTripId;

        const payer = whoRef.current?.value || '';
        // Build splits map — read from DOM since splitter inputs use
        // defaultValue + the user can mutate them after init.
        const splitInputs = Array.from(
            (e.currentTarget.querySelectorAll('.split-input') as NodeListOf<HTMLInputElement>),
        );
        const splits: Record<string, number> = {};
        let totalSplit = 0;
        if (splitInputs.length > 0) {
            for (const input of splitInputs) {
                const val = parseFloat(input.value) || 0;
                const person = input.getAttribute('data-person');
                if (person) splits[person] = val;
                totalSplit += val;
            }
            // 2026-05-26 (audit SP2): was `> 0.5`, which silently
            // accepted 100.49% (or 99.51%) totals. The downstream
            // balance math then re-normalizes by the actual sum, so
            // splits don't visually match what the user typed —
            // confusing. Tightened to 0.01 so the form catches any
            // human-meaningful drift while still tolerating tiny
            // float-precision residue from the auto-equal-split
            // helper.
            if (Math.abs(totalSplit - 100) > 0.01) {
                showLiquidAlert(t('validation.percentagesMustSum'));
                return;
            }
        } else {
            splits[payer] = 100;
        }

        const val = parseFloat(valueRef.current?.value || '');
        const curr = (currencyRef.current?.value || '').toUpperCase();

        if (isNaN(val) || val <= 0) {
            showLiquidAlert(t('validation.invalidExpenseValue'));
            return;
        }
        if (!curr) {
            showLiquidAlert(t('validation.currencyRequired'));
            return;
        }
        // 2026-05-26 (audit SP3) + R3-Round 2 widening: pre-fix the
        // conversion fallback was `CONVERSION_RATES[curr] || 1`, which
        // silently treated any currency missing from the rate table as
        // 1:1 EUR. A legacy record (or a typo) of `currency='ARS'` then
        // counted 100 ARS as €100 in every balance — silent corruption.
        // R3 widens "known rate" to also cover the live FX cache so a
        // user picking THB / EGP / TRY / ARS / VND can actually submit
        // (those currencies are in the Frankfurter feed but were absent
        // from the static fallback table). Only when BOTH miss do we
        // refuse — that's the true "we cannot convert" case.
        if (!hasRate(curr)) {
            showLiquidAlert(t('budgets.createUnknownCurrency', { curr }));
            return;
        }

        // R2 audit fix: euroValue MUST be computed via convertCurrency
        // so the live FX overlay wins over the 2-year-stale static
        // CONVERSION_RATES table. Pre-fix the display path used live
        // rates but the storage path here used `val * rate` (static),
        // so an EGP 100 expense rendered as ~€1.84 but PERSISTED as
        // €100 (rate=1 for EGP in the stale table). Settlement /
        // balance math then read the stored euroValue → permanently
        // wrong. The `rate !== undefined` check above stays as a
        // user-friendly gate against unknown currencies; the actual
        // conversion routes through the overlay-aware helper.
        const countryVal = countryValue || (activeTrip ? activeTrip.country : '');
        const isEdit = !!STATE.draftExpense?.id;
        // R3-Round 2 fix: only re-derive euroValue when the user
        // actually changed value or currency. Pre-fix every edit
        // (typo fix in label, who change, receipt swap, …) re-stamped
        // euroValue at TODAY's FX, breaking the "stamped at write time"
        // invariant the balance math relies on. A 6-month-old expense
        // edited just to fix its label would silently shift its EUR
        // value as the rate had drifted.
        const draftValue = Number(STATE.draftExpense?.value ?? NaN);
        const draftCurrency = STATE.draftExpense?.currency ?? '';
        const draftEuro = Number(STATE.draftExpense?.euroValue ?? NaN);
        const moneyUnchanged = (
            isEdit
            && Number.isFinite(draftValue)
            && draftValue === val
            && draftCurrency === curr
            && Number.isFinite(draftEuro)
        );
        const euroValueForRow = moneyUnchanged ? draftEuro : convertCurrency(val, curr, 'EUR');
        const expense: Expense = {
            id: isEdit && STATE.draftExpense.id ? STATE.draftExpense.id : generateId(),
            tripId,
            who: payer,
            categoryId: categoryRef.current?.value || '',
            label: labelRef.current?.value || '',
            date: dateRef.current?.value || '',
            country: countryVal,
            value: val,
            currency: curr,
            euroValue: euroValueForRow,
            splits,
            receiptUrl,
        };

        if (isEdit) {
            const idx = STATE.expenses.findIndex((ex) => ex.id === expense.id);
            if (idx !== -1) STATE.expenses[idx] = expense;
            else STATE.expenses.push(expense);
        } else {
            STATE.expenses.push(expense);
        }

        // Reset draft to empty so a fresh form opens next time.
        STATE.draftExpense = {
            who: '',
            categoryId: '',
            label: '',
            date: '',
            country: '',
            value: '',
            currency: 'EUR',
            euroValue: '',
            receiptUrl: null,
        };

        emit('state:changed');
        upsertExpense(expense);

        setSaveStatus({
            text: isEdit
                ? t('expenses.updatedToast')
                : t('expenses.savedToast'),
            color: '#34c759',
        });
        setTimeout(() => setSaveStatus(null), 4000);

        // Reset form fields, splitters, receipt.
        e.currentTarget.reset();
        setSplitters([]);
        setReceiptUrl(null);
    };

    // ── render ──────────────────────────────────────────────────
    const draftCategory = STATE.draftExpense?.categoryId || '';
    const draftCurrency = STATE.draftExpense?.currency || '';
    // BUG-5 (MK2 audit): distribute an equal split so the values actually sum
    // to 100 (the last person absorbs the rounding remainder). Pre-fix every
    // input got (100/N).toFixed(1) — 33.3×3 = 99.9 — which the submit gate
    // then rejected, making an even 3-way split impossible to save.
    const splitDefaults: string[] = (() => {
        const n = splitters.length;
        if (n === 0) return [];
        const base = Math.floor(10000 / n) / 100;            // 2-dp floor, e.g. 33.33
        const out: number[] = Array(n).fill(base);
        out[n - 1] = Math.round((100 - base * (n - 1)) * 100) / 100;  // remainder → 33.34
        return out.map((v) => String(v));
    })();

    return (
        <div>
            <div
                className="card glass manual-expense-card max-w-[600px] my-0 mx-auto w-full rounded-[44px] border border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-[25px] p-12 shadow-[0_40px_100px_rgba(0,0,0,0.25)]"
            >
                <h2
                    className="card-title text-[2.2rem] mb-8 text-primary tracking-[-0.06em] font-extrabold text-center"
                >
                    {t('expenses.addExpenseTitle')}
                </h2>
                <form
                    onSubmit={onSubmit}
                    className="flex flex-col items-center w-full"
                >
                    {/* Who paid */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expWho">
                            {t('expenses.whoPaid')}
                        </label>
                        <select
                            id="expWho"
                            ref={whoRef}
                            className="glass-input-light"
                            required
                            defaultValue={STATE.draftExpense?.who || ''}
                            onChange={(e) => draft('who', e.target.value)}
                        >
                            {hasTripCompanions ? (
                                tripCompanionNames.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))
                            ) : (
                                <option value="">{t('expenses.noCompanionsAddFromHome')}</option>
                            )}
                        </select>
                        {!hasTripCompanions ? (
                            <div
                                className="mt-3 text-[length:var(--font-sm)] text-[#005bb8] font-semibold cursor-pointer flex items-center gap-1.5"
                                onClick={() => navigate('home')}
                            >
                                <span className="inline-flex align-[-2px]" dangerouslySetInnerHTML={{ __html: iconSvg('plus', { size: 14 }) }} />{' '}
                                <span className="underline">
                                    {t('expenses.addCompanionsCta')}
                                </span>
                            </div>
                        ) : null}
                    </div>

                    {/* Category */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expCategory">
                            {t('expenses.catLabel')}
                        </label>
                        <select
                            id="expCategory"
                            ref={categoryRef}
                            className="glass-input-light"
                            required
                            defaultValue={draftCategory}
                            onChange={(e) => draft('categoryId', e.target.value)}
                        >
                            {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.icon} {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Label */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expLabel">
                            {t('expenses.labelLabel')}
                        </label>
                        <input
                            id="expLabel"
                            ref={labelRef}
                            type="text"
                            className="glass-input-light"
                            placeholder={t('expenses.labelPlaceholder')}
                            required
                            defaultValue={STATE.draftExpense?.label || ''}
                            onInput={(e) => draft('label', (e.target as HTMLInputElement).value)}
                        />
                    </div>

                    {/* Date */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expDate">
                            {t('expenses.dateLabel')}
                        </label>
                        <input
                            id="expDate"
                            ref={dateRef}
                            type="date"
                            className="glass-input-light"
                            required
                            min="2000-01-01"
                            max={new Date().toISOString().slice(0, 10)}
                            defaultValue={STATE.draftExpense?.date || ''}
                            onChange={(e) => draft('date', e.target.value)}
                        />
                    </div>

                    {/* Country combobox */}
                    <div className="form-row relative">
                        <label className="form-label-light" htmlFor="expCountry">
                            {t('expenses.countryLabel')}
                        </label>
                        <div className="custom-select-wrapper">
                            <input
                                id="expCountry"
                                ref={countryInputRef}
                                type="text"
                                className="glass-input-light"
                                placeholder={t('expenses.countrySearchPlaceholder')}
                                autoComplete="off"
                                role="combobox"
                                aria-autocomplete="list"
                                aria-expanded={comboOpen}
                                aria-controls="countryDropdownList"
                                aria-haspopup="listbox"
                                aria-activedescendant={
                                    activeIdx >= 0 ? `expCountryOpt-${activeIdx}` : undefined
                                }
                                value={countryValue}
                                onFocus={() => setComboOpen(true)}
                                onChange={(e) => {
                                    setCountryValue(e.target.value);
                                    setActiveIdx(-1);
                                    setComboOpen(true);
                                    draft('country', e.target.value);
                                }}
                                onKeyDown={onCountryKeyDown}
                            />
                            <div
                                id="countryDropdownList"
                                ref={countryListRef}
                                className="custom-select-dropdown glass shadow-xl"
                                role="listbox"
                                aria-label={t('expenses.countriesAria')}
                                style={{
                                    display: comboOpen ? 'block' : 'none',
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    zIndex: 1000,
                                    maxHeight: 250,
                                    overflowY: 'auto',
                                    marginTop: 'var(--space-2)',
                                    borderRadius: 'var(--radius-xl)',
                                    border: '1px solid rgba(0,0,0,0.1)',
                                    background: 'rgba(255,255,255,0.95)',
                                    backdropFilter: 'blur(20px)',
                                }}
                            >
                                {filteredCountries.map((c, i) => (
                                    <div
                                        key={c}
                                        id={`expCountryOpt-${i}`}
                                        data-idx={i}
                                        className={`dropdown-item${activeIdx === i ? ' is-active' : ''}`}
                                        role="option"
                                        aria-selected={activeIdx === i}
                                        onMouseDown={(e) => {
                                            // mouseDown not click — click fires AFTER blur,
                                            // and blur fires click-outside-close logic
                                            // first. mouseDown beats the click-outside.
                                            e.stopPropagation();
                                            onPickCountry(c);
                                        }}
                                    >
                                        {c === 'Other' ? t('expenses.countryOther') : c}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Value */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expValue">
                            {t('expenses.valueLabel')}
                        </label>
                        <input
                            id="expValue"
                            ref={valueRef}
                            type="number"
                            step="0.01"
                            className="glass-input-light font-bold"
                            required
                            defaultValue={
                                STATE.draftExpense?.value !== undefined &&
                                STATE.draftExpense.value !== ''
                                    ? String(STATE.draftExpense.value)
                                    : ''
                            }
                            onInput={(e) => draft('value', (e.target as HTMLInputElement).value)}
                        />
                    </div>

                    {/* Currency */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expCurrency">
                            {t('expenses.currencyLabel')}
                        </label>
                        <select
                            id="expCurrency"
                            ref={currencyRef}
                            className="glass-input-light"
                            required
                            defaultValue={draftCurrency}
                            onChange={(e) => {
                                currencyManuallyChosen.current = true;
                                draft('currency', e.target.value);
                            }}
                        >
                            <option value="">{t('expenses.currencyPlaceholder')}</option>
                            {getSupportedCurrencies().map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Receipt picker */}
                    <div className="form-row mb-8">
                        <label className="form-label-light" htmlFor="expReceiptInput">
                            {t('expenses.receiptLabel')}{' '}
                            <span className="font-medium text-[rgba(0,0,0,0.55)]">
                                {t('expenses.receiptOptional')}
                            </span>
                        </label>
                        <input
                            id="expReceiptInput"
                            ref={receiptInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={onReceiptChange}
                        />
                        <div
                            className="flex gap-3 items-center w-full max-w-[440px] box-border"
                        >
                            <button
                                type="button"
                                className="btn-ghost flex-none py-2.5 px-4 text-[0.85rem] font-bold text-brand-navy bg-[rgba(0,0,0,0.04)] border border-[rgba(0,0,0,0.08)]"
                                disabled={receiptUploading}
                                onClick={onPickReceipt}
                            >
                                <span className="inline-flex align-[-2px] mr-1" dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 14 }) }} />
                                {t('expenses.attachReceipt')}
                            </button>
                            {receiptUrl ? (
                                <div
                                    className="flex items-center gap-3"
                                >
                                    <img
                                        src={receiptUrl}
                                        alt={t('expenses.receiptPreviewAlt')}
                                        className="w-12 h-12 rounded-[10px] object-cover border border-[rgba(0,0,0,0.08)] shadow-[0_4px_12px_rgba(0,0,0,0.08)] cursor-pointer"
                                        title={t('expenses.receiptViewFull')}
                                        onClick={onViewReceipt}
                                    />
                                    <button
                                        type="button"
                                        className="btn-ghost py-2.5 px-4 min-h-[var(--tap-min)] text-[0.78rem] font-bold text-[#ff3b30] bg-[rgba(255,59,48,0.08)] border border-[rgba(255,59,48,0.2)] rounded-lg cursor-pointer"
                                        onClick={onRemoveReceipt}
                                    >
                                        {t('common.remove')}
                                    </button>
                                </div>
                            ) : null}
                            <span
                                className="flex-1 text-xs text-[rgba(0,0,0,0.5)] font-semibold"
                            >
                                {receiptStatus}
                            </span>
                        </div>
                    </div>

                    {/* Split editor */}
                    <div
                        className="mb-10 bg-[rgba(0,0,0,0.03)] p-8 rounded-3xl border border-[rgba(0,0,0,0.05)] w-full max-w-[440px] box-border"
                    >
                        <label
                            className="block mb-4 text-[0.9rem] font-extrabold text-primary tracking-[-0.02em]"
                        >
                            {t('expenses.splitBetween')}
                        </label>
                        <div className="add-split-row flex gap-[14px] mb-5">
                            <select
                                className="glass-input flex-1 p-3.5 rounded-[16px] bg-[rgba(255,255,255,0.4)] text-primary font-semibold border border-[rgba(0,0,0,0.05)] box-border"
                                aria-label="Add a person to split the expense between"
                                disabled={!hasTripCompanions}
                                value={addSplitChoice}
                                onChange={(e) => setAddSplitChoice(e.target.value)}
                            >
                                <option value="">
                                    {hasTripCompanions
                                        ? t('expenses.addPersonToSplit')
                                        : t('expenses.noCompanionsYet')}
                                </option>
                                {tripCompanionNames.map((p) => (
                                    <option key={p} value={p}>
                                        {p}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="btn btn-small py-0 px-6 h-[50px] rounded-[16px] bg-[#0071e3] text-white font-bold"
                                onClick={onAddSplit}
                            >
                                {t('expenses.addPersonBtn')}
                            </button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {splitters.length === 0 ? (
                                <p
                                    className="text-secondary text-[0.85rem] p-2.5 border border-dashed border-[var(--glass-border)] rounded-lg text-center"
                                >
                                    {t('expenses.payerGets100')}
                                </p>
                            ) : (
                                splitters.map((p, idx) => (
                                    // Key includes splitters.length so adding/
                                    // removing a person forces every row to
                                    // remount with the freshly-computed equal
                                    // split. Matches the legacy "redistribute
                                    // equally on every change" behaviour (where
                                    // innerHTML rewrite reset all inputs).
                                    // Manual edits live until the next
                                    // add/remove — same tradeoff.
                                    <div key={`${p}_${splitters.length}`} className="splitter-row">
                                        <span className="font-medium">{p}</span>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="number"
                                                className="glass-input split-input splitter-row__pct"
                                                data-person={p}
                                                defaultValue={splitDefaults[idx]}
                                                step="any"
                                                required
                                            />
                                            <span
                                                className="text-secondary text-[length:var(--font-base)]"
                                            >
                                                %
                                            </span>
                                            <button
                                                type="button"
                                                className="btn-x-bare font-bold ml-2"
                                                aria-label={t('expenses.removeSplitterAria', { name: p })}
                                                onClick={() => onRemoveSplit(p)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <button type="submit" className="btn-primary btn-primary--lg">
                        {t('expenses.saveExpense')}
                    </button>
                    {saveStatus ? (
                        <div
                            style={{
                                marginTop: 16,
                                fontWeight: 700,
                                textAlign: 'center',
                                color: saveStatus.color,
                            }}
                        >
                            {saveStatus.text}
                        </div>
                    ) : null}
                </form>
            </div>
        </div>
    );
}
