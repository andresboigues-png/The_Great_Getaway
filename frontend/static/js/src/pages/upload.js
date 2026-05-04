// @ts-check
import { STATE, emit } from '../state.js';
import { CONVERSION_RATES } from '../constants.js';
import { generateId, q } from '../utils.js';
import { syncWithServer } from '../api.js';
import { navigate } from '../router.js';
import { showSettingsTab } from './settings.js';

// Pad number to 2 digits.
const _pad2 = (n) => String(n).padStart(2, '0');

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
function parseCellDate(cell) {
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
        let month, day;
        if (yIdx === 0) {
            [month, day] = others;
        } else {
            const [a, b] = others;
            if (a > 12) { day = a; month = b; }
            else if (b > 12) { day = b; month = a; }
            else { day = a; month = b; }  // EU default
        }
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
                    Use your favourite app's format or <a href="#" id="uploadFormatSettingsLink" style="color: var(--accent-blue); text-decoration: none; font-weight: 600;">customize your own upload format</a> in settings.
                </p>
                <p id="formatNote" style="font-size:0.8rem; color:var(--text-secondary); margin-top:8px;"></p>
            </div>

            <!-- Column reference for custom formats -->
            <div id="customFormatPreview" style="display:none; margin-bottom:16px; padding:12px 16px; background:rgba(255,149,0,0.07); border:1px solid rgba(255,149,0,0.2); border-radius:10px;">
                <p style="font-size:0.82rem; font-weight:600; margin-bottom:8px; color:#ff9500;">Active Format Mapping</p>
                <div id="customFormatTable"></div>
            </div>

            <!-- Popular format note -->
            <div id="popularNote" style="padding: 16px; background: rgba(0,113,227,0.05); border-radius: 12px; border: 1px solid rgba(0,113,227,0.1); margin-bottom: 20px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent-blue);">💡 FORMAT PREVIEW</span>
                <p style="margin: 5px 0 0; font-size: 0.85rem; color: var(--text-secondary);">Ensure your file contains these columns. We will try to auto-detect categories.</p>
                <div id="popularFormatTableContainer" style="margin-top: 16px; overflow-x: auto; background: white; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);"></div>
            </div>

            <div style="padding: 12px 16px; background: rgba(0,113,227,0.05); border: 1px solid rgba(0,113,227,0.15); border-radius: 12px; margin-bottom: 15px;">
                <p style="margin: 0; font-size: 0.82rem; color: var(--accent-blue); font-weight: 600;">📅 Date format</p>
                <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">Use <strong>DD-MM-YYYY</strong> (e.g. <code style="background: rgba(0,0,0,0.04); padding: 1px 6px; border-radius: 4px;">15-03-2024</code>) or <strong>YYYY-MM-DD</strong>. Excel-typed date cells are recognised automatically.</p>
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
        /** @type {any[][] | null} */
        let parsedRows = null;

        div.querySelector('#uploadFormatSettingsLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            navigate('settings');
            // Settings DOM doesn't exist until navigate renders it.
            setTimeout(() => showSettingsTab('format'), 50);
        });

        const formatSelect = /** @type {HTMLSelectElement} */ (q(div, '#formatSelect'));
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
                    if (trip) {
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

                /** @type {string[]} */
                let headers = [];
                /** @type {string[]} */
                let row = [];
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
                if (trip) {
                    trip.activeFormatId = popId;
                    trip.activeFormatType = 'popular';
                    emit('state:changed');
                }
            }
        };

        formatSelect.addEventListener('change', updateUI);
        updateUI();

        q(div, '#excelFile').addEventListener('change', (e) => {
            const file = /** @type {HTMLInputElement} */ (e.target).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (evt) {
                try {
                    const data = new Uint8Array(/** @type {ArrayBuffer} */ (evt.target?.result));
                    // cellDates: true tells SheetJS to convert XLSX-typed
                    // date cells into JS Date objects instead of returning
                    // the raw Excel serial number (days since 1900-01-01).
                    // Without it `String(row[dateCol])` gives '45357' which
                    // later parses as an invalid Date and falls back to
                    // Jan 1 — every imported expense looked the same.
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    /** @type {any[][]} */
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                    if (json.length < 2) return;

                    const header = json[0];
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
                alert("Please select or create a trip first!");
                return;
            }
            const activeTripId = STATE.activeTripId;
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
                let mappings = [];

                if (!isPopular) {
                    const formatId = formatVal.split(':')[1];
                    const format = STATE.savedFormats.find(f => f.id === formatId);
                    if (!format) throw new Error("Format not found");
                    mappings = format.mappings;
                }

                parsedRows.forEach((/** @type {any[]} */ row) => {
                    let who = '', catName = '', label = '', date = '', country = '';
                    let value = 0, currency = 'EUR';

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
                        /** @param {string} letter */
                        const colToIdx = (letter) => letter ? letter.toUpperCase().charCodeAt(0) - 65 : -1;
                        /** @param {string} varName */
                        const get = (varName) => {
                            const mapping = mappings.find((/** @type {{variable: string; column: string}} */ m) => m.variable === varName);
                            if (!mapping) return '';
                            return String(row[colToIdx(mapping.column)] || '').trim();
                        };
                        /** Raw cell read for date — keeps Date objects intact
                         *  rather than stringifying first and losing them. */
                        const getRaw = (varName) => {
                            const mapping = mappings.find((/** @type {{variable: string; column: string}} */ m) => m.variable === varName);
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
                    }

                    if (who && !STATE.groups.includes(who)) {
                        STATE.groups.push(who);
                    }

                    let category = STATE.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                    if (!category && catName) {
                        category = { id: generateId(), name: catName, icon: '📌', color: '#8e8e93' };
                        STATE.categories.push(category);
                    }
                    const categoryId = category ? category.id : STATE.categories[0].id;

                    /** @type {import('../types').Expense} */
                    const expense = {
                        id: generateId(),
                        tripId: activeTripId,
                        who,
                        categoryId,
                        label,
                        date,
                        country,
                        value,
                        currency,
                        euroValue: value * (CONVERSION_RATES[currency] || 1)
                    };
                    STATE.expenses.push(expense);
                    added++;
                });

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

