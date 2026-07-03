// pages/expenses/BatchUpload.tsx — the batch CSV/XLSX import UI,
// migrated from the imperative renderUpload() HTML builder (pages/
// upload.ts) to JSX (#4).
//
// React owns the UI state (selected format, parsed spreadsheet, status
// line). The data-creating path stays in pages/upload.ts as
// runBatchImport() — this component just parses the file (SheetJS), shows
// the preview, and calls runBatchImport on upload, rendering the
// { added, skipped } result.
//
// Notes vs the legacy renderer:
//   - the dead `#uploadFormatSettingsLink` handler is dropped (the
//     element never existed in the markup, so the listener was a no-op);
//   - the trip <select> change persists trip.activeFormatId/Type exactly
//     as before (so re-opening the tab restores the last-used format).

import { useState } from 'react';
import { loadXlsx } from '../../utils/lazyCdn.js';
import { STATE, emit } from '../../state.js';
import { useStore } from '../../react/store.js';
import { runBatchImport, cellToText } from '../upload.js';
import { t } from '../../i18n.js';
import { showLiquidAlert } from '../../utils.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SheetJS sheet_to_json yields heterogeneous cells (string|number|Date); typing as unknown[][] would break the preview's cellToText coercion + runBatchImport's parseFloat without a runtime change
type SheetRows = { header: any[]; rows: any[][] };

const POPULARS = [
    { id: 'tricount', name: 'Tricount Export (CSV/XLSX)' },
    { id: 'splitwise', name: 'Splitwise Export' },
];

// Sample header + row shown under a popular format so the user knows the
// column order we expect before they upload.
const POPULAR_SAMPLES: Record<string, { headers: string[]; row: string[] }> = {
    tricount: {
        headers: ['Title', 'Amount', 'Currency', 'Date', 'Paid by'],
        row: ['Dinner', '45.00', 'EUR', '2023-10-12', 'Alice'],
    },
    splitwise: {
        headers: ['Date', 'Description', 'Category', 'Cost', 'Currency'],
        row: ['2023-10-12', 'Taxi', 'Transportation', '20.00', 'EUR'],
    },
};

function initialFormatVal(): string {
    const at = STATE.trips.find((tr) => tr.id === STATE.activeTripId);
    const type = at?.activeFormatType || 'popular';
    const id = at?.activeFormatId;
    if (type === 'custom' && id && (STATE.savedFormats || []).some((f) => f.id === id)) return `custom:${id}`;
    if (type === 'popular' && (id === 'tricount' || id === 'splitwise')) return `popular:${id}`;
    return 'popular:tricount';
}

export function BatchUpload() {
    // Subscribe so a format saved in Settings (or a trip switch) repaints
    // the select + active-format note.
    const savedFormats = useStore((s) => s.savedFormats);

    const [formatVal, setFormatVal] = useState<string>(initialFormatVal);
    const [parsed, setParsed] = useState<SheetRows | null>(null);
    const [status, setStatus] = useState<{ text: string; color: string } | null>(null);

    const isPopular = formatVal.startsWith('popular:');
    const popId = formatVal.split(':')[1] || '';
    const customFormat = !isPopular ? (savedFormats || []).find((f) => f.id === popId) : undefined;
    const sample = isPopular ? POPULAR_SAMPLES[popId] : undefined;

    // Format change → remember it on the active trip (so re-opening the tab
    // restores the choice), exactly like the legacy updateUI side effect.
    const onFormatChange = (val: string) => {
        setFormatVal(val);
        const trip = STATE.trips.find((tr) => tr.id === STATE.activeTripId);
        const id = val.split(':')[1];
        if (trip && id) {
            trip.activeFormatId = id;
            trip.activeFormatType = val.startsWith('custom:') ? 'custom' : 'popular';
            emit('state:changed');
        }
    };

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                // MK1 Wave F (T2-6): SheetJS (~1MB) loads on first use now
                // instead of blocking every page load from the <head>.
                await loadXlsx();
                const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                // cellDates: true → SheetJS returns JS Date objects for typed
                // date cells instead of raw Excel serials (else every imported
                // expense collapsed to Jan 1).
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                if (json.length < 2) return;
                const header = json[0];
                // BUG-076: keep any row with at least one non-empty cell —
                // NOT just rows whose FIRST cell is truthy. The meaningful
                // column depends on the format/mapping (a custom format may
                // map its required fields to columns B+, or a Tricount row may
                // have a blank Title), so a first-cell filter silently dropped
                // valid rows before runBatchImport's own per-row validation +
                // skipped[] reporting could account for them. Let the importer
                // decide what's unusable so nothing vanishes unreported.
                const rows = json
                    .slice(1)
                    .filter((r: unknown[]) => Array.isArray(r) && r.some((cell) => cell !== '' && cell != null));
                setParsed({ header, rows });
                setStatus(null);
            } catch (err) {
                console.error('Preview error', err);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const onUpload = () => {
        if (!STATE.activeTripId) {
            showLiquidAlert(t('validation.selectTripFirst'));
            return;
        }
        if (!parsed) {
            setStatus({ text: t('upload.errorSelectFile'), color: 'red' });
            return;
        }
        try {
            const { added, skipped, noRateCurrencies, truncatedCount } = runBatchImport(parsed.rows, formatVal);
            let text = t('upload.successImported', { count: added });
            if (skipped.length > 0) {
                text = `${text} ${t('upload.skippedRows', { count: skipped.length, rows: skipped.join(', ') })}`;
            }
            // DSGN-037: warn when the file exceeded the 500-row cap.
            if (truncatedCount > 0) {
                text = `${text} ${t('upload.truncatedRows', { total: added + skipped.length + truncatedCount, limit: 500 })}`;
            }
            // EXP-1: surface the no-live-rate currencies as an ACTIONABLE
            // line so a Tricount/Splitwise export in ARS/EGP/VND/CLP/etc.
            // doesn't just vanish into the skipped list. Tells the user
            // how many rows (+ which currencies) need a manual EUR amount,
            // since these rows can't be auto-converted and the server
            // would reject them without one.
            const noRateCodes = Object.keys(noRateCurrencies);
            if (noRateCodes.length > 0) {
                const noRateRows = noRateCodes.reduce(
                    (sum, ccy) => sum + (noRateCurrencies[ccy] ?? 0),
                    0,
                );
                text = `${text} ${t('upload.noRateImport', { count: noRateRows, currency: noRateCodes.join(', ') })}`;
            }
            // Amber when nothing imported but rows need a manual EUR amount;
            // red on a pure invalid-data failure; green otherwise.
            const color = added === 0 && noRateCodes.length > 0
                ? '#ff9500'
                : added === 0 && skipped.length > 0
                    ? 'red'
                    : 'green';
            setStatus({ text, color });
            // Keep the preview on screen if nothing imported so the user can
            // see what was rejected; clear it once at least one row landed.
            if (added > 0) setParsed(null);
        } catch (error) {
            console.error(error);
            setStatus({ text: t('upload.errorParsing'), color: 'red' });
        }
    };

    return (
        <div>
            {/* No page <h1> here: Batch is a sub-mode of the Expenses tab
                (the "Expenses" gradient title + the Upload mode-switch
                already label it). A second 3rem h1 read as a co-equal page
                title. The green card-title below ("Excel Upload") is the
                section heading. */}
            <div className="card glass" style={{ borderColor: 'rgba(33, 115, 70, 0.3)', boxShadow: '0 0 15px rgba(33, 115, 70, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <h2 className="card-title" style={{ color: '#217346', margin: 0 }}>{t('upload.sectionHeading')}</h2>
                </div>

                {/* Format selector */}
                <div style={{ marginBottom: '20px' }}>
                    <label htmlFor="formatSelect" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '8px' }}>{t('upload.labelImportFormat')}</label>
                    <select id="formatSelect" className="glass-input" style={{ width: '100%' }} value={formatVal} onChange={(e) => onFormatChange(e.target.value)}>
                        <optgroup label={t('upload.groupPopular')}>
                            {POPULARS.map((p) => <option key={p.id} value={`popular:${p.id}`}>{p.id === 'tricount' ? t('upload.formatTricount') : t('upload.formatSplitwise')}</option>)}
                        </optgroup>
                        <optgroup label={t('upload.groupCustom')}>
                            {(savedFormats || []).length === 0
                                ? <option disabled>{t('upload.noCustomFormats')}</option>
                                : (savedFormats || []).map((f) => <option key={f.id} value={`custom:${f.id}`}>{f.name}</option>)}
                        </optgroup>
                    </select>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '12px', lineHeight: 1.5 }}>{t('upload.helperText')}</p>
                </div>

                {/* Active custom-format mapping reference */}
                {customFormat ? (
                    <div className="callout-tinted" style={{ marginBottom: 'var(--space-4)', ['--accent' as string]: '255,149,0' }}>
                        <p className="callout-tinted__label">{t('upload.activeFormatMapping')}</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                            {customFormat.mappings.map((m, i) => (
                                <div key={`${m.variable}-${i}`} style={{ fontSize: '0.75rem' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>{m.variable}:</span> <strong>{m.column}</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* Popular format sample */}
                {isPopular ? (
                    <div className="callout-tinted callout-tinted--lg" style={{ marginBottom: 'var(--space-5)', ['--accent' as string]: '0,113,227' }}>
                        <span className="callout-tinted__label">{t('upload.previewCalloutLabel')}</span>
                        <p className="callout-tinted__body">{t('upload.previewCalloutBody')}</p>
                        {sample ? (
                            <div style={{ marginTop: 'var(--space-4)', overflowX: 'auto', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                                <table className="liquid-table" style={{ fontSize: '0.75rem', margin: 0 }}>
                                    <thead>
                                        <tr>{sample.headers.map((h) => <th key={h} style={{ padding: '8px 12px' }}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        <tr>{sample.row.map((d, i) => <td key={i} style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{d}</td>)}</tr>
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <div className="callout-tinted" style={{ marginBottom: '15px', ['--accent' as string]: '0,113,227' }}>
                    <p className="callout-tinted__label">{t('upload.dateCalloutLabel')}</p>
                    <p className="callout-tinted__body">{t('upload.dateCalloutBody')}</p>
                </div>

                <div className="callout-tinted" style={{ marginBottom: '15px', ['--accent' as string]: '52,199,89' }}>
                    <p className="callout-tinted__label">{t('upload.splitsCalloutLabel')}</p>
                    {/* The copy intentionally contains <code> spans (e.g. <code>splits</code>,
                        <code>Alice:50,Bob:50</code>). Rendered as a plain JSX child React escapes
                        them, so the literal tags showed on screen. Render as HTML — the string is a
                        static translation (no user input), matching the ~13 other i18n keys that use
                        this pattern. */}
                    <p className="callout-tinted__body" dangerouslySetInnerHTML={{ __html: t('upload.splitsCalloutBody') }} />
                </div>

                <input type="file" id="excelFile" accept=".xlsx, .xls, .csv" className="glass-input" style={{ marginBottom: '15px', width: '100%' }} onChange={onFile} />

                {parsed ? (
                    <div style={{ marginBottom: '15px' }}>
                        <h3 style={{ marginBottom: '10px' }}>{t('upload.previewHeading')}</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="liquid-table">
                                <thead>
                                    <tr>{parsed.header.map((h, i) => <th key={i}>{cellToText(h)}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {parsed.rows.slice(0, 3).map((row, ri) => (
                                        <tr key={ri}>{parsed.header.map((_, i) => <td key={i}>{cellToText(row[i])}</td>)}</tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : null}

                <br />
                <button className="btn" id="uploadBtn" onClick={onUpload}>{t('upload.uploadBtn')}</button>
                {status ? (
                    <div id="uploadStatus" style={{ marginTop: '15px', fontWeight: 'bold', color: status.color }}>{status.text}</div>
                ) : (
                    <div id="uploadStatus" style={{ marginTop: '15px', fontWeight: 'bold' }} />
                )}
            </div>
        </div>
    );
}
