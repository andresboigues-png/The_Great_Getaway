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
import { navigate } from '../../router.js';
import { t } from '../../i18n.js';
import type { Expense } from '../../types';


// Pre-sort the countries list so the combobox dropdown shows
// alphabetical order without re-sorting per render.
const SORTED_COUNTRIES = [...COUNTRIES].sort();

const CURRENCY_CODES = Object.keys(CONVERSION_RATES);


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
            if (Math.abs(totalSplit - 100) > 0.5) {
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

        const countryVal = countryValue || (activeTrip ? activeTrip.country : '');
        const isEdit = !!STATE.draftExpense?.id;
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
            euroValue: val * (CONVERSION_RATES[curr] || 1),
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
                ? '✓ Expense updated — view in History'
                : '✓ Expense saved — view in History',
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
    const defaultPct = splitters.length > 0 ? (100 / splitters.length).toFixed(1) : '';

    return (
        <div>
            <div
                className="card glass"
                style={{
                    maxWidth: 600,
                    margin: '0 auto',
                    width: '100%',
                    borderRadius: 44,
                    border: '1px solid rgba(255,255,255,0.4)',
                    background: 'rgba(255,255,255,0.15)',
                    backdropFilter: 'blur(25px)',
                    padding: 48,
                    boxShadow: '0 40px 100px rgba(0,0,0,0.25)',
                }}
            >
                <h2
                    className="card-title"
                    style={{
                        fontSize: '2.2rem',
                        marginBottom: 32,
                        color: '#000000',
                        letterSpacing: '-0.06em',
                        fontWeight: 800,
                        textAlign: 'center',
                    }}
                >
                    {t('expenses.addExpenseTitle')}
                </h2>
                <form
                    onSubmit={onSubmit}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: '100%',
                    }}
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
                                style={{
                                    marginTop: 'var(--space-3)',
                                    fontSize: 'var(--font-sm)',
                                    color: '#005bb8',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                                onClick={() => navigate('home')}
                            >
                                <span>➕</span>{' '}
                                <span style={{ textDecoration: 'underline' }}>
                                    Add companions to this trip from Home
                                </span>
                            </div>
                        ) : null}
                    </div>

                    {/* Category */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expCategory">
                            Category
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
                            Label
                        </label>
                        <input
                            id="expLabel"
                            ref={labelRef}
                            type="text"
                            className="glass-input-light"
                            placeholder="e.g. Dinner at Mario's"
                            required
                            defaultValue={STATE.draftExpense?.label || ''}
                            onInput={(e) => draft('label', (e.target as HTMLInputElement).value)}
                        />
                    </div>

                    {/* Date */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expDate">
                            Date
                        </label>
                        <input
                            id="expDate"
                            ref={dateRef}
                            type="date"
                            className="glass-input-light"
                            required
                            defaultValue={STATE.draftExpense?.date || ''}
                            onChange={(e) => draft('date', e.target.value)}
                        />
                    </div>

                    {/* Country combobox */}
                    <div className="form-row" style={{ position: 'relative' }}>
                        <label className="form-label-light" htmlFor="expCountry">
                            Country
                        </label>
                        <div className="custom-select-wrapper">
                            <input
                                id="expCountry"
                                ref={countryInputRef}
                                type="text"
                                className="glass-input-light"
                                placeholder="Search country..."
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
                                aria-label="Countries"
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
                                        {c}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Value */}
                    <div className="form-row">
                        <label className="form-label-light" htmlFor="expValue">
                            Value
                        </label>
                        <input
                            id="expValue"
                            ref={valueRef}
                            type="number"
                            step="0.01"
                            className="glass-input-light"
                            style={{ fontWeight: 700 }}
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
                            Currency
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
                            {CURRENCY_CODES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Receipt picker */}
                    <div className="form-row" style={{ marginBottom: 'var(--space-8)' }}>
                        <label className="form-label-light" htmlFor="expReceiptInput">
                            Receipt{' '}
                            <span style={{ fontWeight: 500, color: 'rgba(0,0,0,0.55)' }}>
                                (optional)
                            </span>
                        </label>
                        <input
                            id="expReceiptInput"
                            ref={receiptInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={onReceiptChange}
                        />
                        <div
                            style={{
                                display: 'flex',
                                gap: 'var(--space-3)',
                                alignItems: 'center',
                                width: '100%',
                                maxWidth: 440,
                                boxSizing: 'border-box',
                            }}
                        >
                            <button
                                type="button"
                                className="btn-ghost"
                                disabled={receiptUploading}
                                style={{
                                    flex: '0 0 auto',
                                    padding: '10px 16px',
                                    fontSize: '0.85rem',
                                    fontWeight: 700,
                                    color: '#002d5b',
                                    background: 'rgba(0,0,0,0.04)',
                                    border: '1px solid rgba(0,0,0,0.08)',
                                }}
                                onClick={onPickReceipt}
                            >
                                📎 Attach receipt
                            </button>
                            {receiptUrl ? (
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-3)',
                                    }}
                                >
                                    <img
                                        src={receiptUrl}
                                        alt="Receipt preview"
                                        style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: 10,
                                            objectFit: 'cover',
                                            border: '1px solid rgba(0,0,0,0.08)',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                            cursor: 'pointer',
                                        }}
                                        title="Click to view full size"
                                        onClick={onViewReceipt}
                                    />
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        style={{
                                            padding: '10px 16px',
                                            minHeight: 'var(--tap-min)',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            color: '#ff3b30',
                                            background: 'rgba(255,59,48,0.08)',
                                            border: '1px solid rgba(255,59,48,0.2)',
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                        }}
                                        onClick={onRemoveReceipt}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ) : null}
                            <span
                                style={{
                                    flex: 1,
                                    fontSize: '0.75rem',
                                    color: 'rgba(0,0,0,0.5)',
                                    fontWeight: 600,
                                }}
                            >
                                {receiptStatus}
                            </span>
                        </div>
                    </div>

                    {/* Split editor */}
                    <div
                        style={{
                            marginBottom: 40,
                            background: 'rgba(0,0,0,0.03)',
                            padding: 32,
                            borderRadius: 32,
                            border: '1px solid rgba(0,0,0,0.05)',
                            width: '100%',
                            maxWidth: 440,
                            boxSizing: 'border-box',
                        }}
                    >
                        <label
                            style={{
                                display: 'block',
                                marginBottom: 16,
                                fontSize: '0.9rem',
                                fontWeight: 800,
                                color: '#000000',
                                letterSpacing: '-0.02em',
                            }}
                        >
                            {t('expenses.splitBetween')}
                        </label>
                        <div className="add-split-row" style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
                            <select
                                className="glass-input"
                                aria-label="Add a person to split the expense between"
                                disabled={!hasTripCompanions}
                                value={addSplitChoice}
                                onChange={(e) => setAddSplitChoice(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: 14,
                                    borderRadius: 16,
                                    background: 'rgba(255,255,255,0.4)',
                                    color: '#000000',
                                    fontWeight: 600,
                                    border: '1px solid rgba(0,0,0,0.05)',
                                    boxSizing: 'border-box',
                                }}
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
                                className="btn btn-small"
                                onClick={onAddSplit}
                                style={{
                                    padding: '0 24px',
                                    height: 50,
                                    borderRadius: 16,
                                    background: '#0071e3',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                }}
                            >
                                + Add
                            </button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {splitters.length === 0 ? (
                                <p
                                    style={{
                                        color: 'var(--text-secondary)',
                                        fontSize: '0.85rem',
                                        padding: 10,
                                        border: '1px dashed var(--glass-border)',
                                        borderRadius: 8,
                                        textAlign: 'center',
                                    }}
                                >
                                    100% will be attributed to the payer.
                                </p>
                            ) : (
                                splitters.map((p) => (
                                    // Key includes splitters.length so adding/
                                    // removing a person forces every row to
                                    // remount with the freshly-computed
                                    // defaultPct. Matches the legacy
                                    // "redistribute equally on every change"
                                    // behaviour (where innerHTML rewrite reset
                                    // all inputs). Manual edits live until the
                                    // next add/remove — same tradeoff.
                                    <div key={`${p}_${splitters.length}`} className="splitter-row">
                                        <span style={{ fontWeight: 500 }}>{p}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                            <input
                                                type="number"
                                                className="glass-input split-input splitter-row__pct"
                                                data-person={p}
                                                defaultValue={defaultPct}
                                                step="0.1"
                                                required
                                            />
                                            <span
                                                style={{
                                                    color: 'var(--text-secondary)',
                                                    fontSize: 'var(--font-base)',
                                                }}
                                            >
                                                %
                                            </span>
                                            <button
                                                type="button"
                                                className="btn-x-bare"
                                                aria-label={`Remove ${p}`}
                                                style={{ fontWeight: 700, marginLeft: 'var(--space-2)' }}
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
                        Save Expense
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
