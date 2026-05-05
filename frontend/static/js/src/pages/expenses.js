// @ts-check
// pages/expenses.js
//
// Expenses page is a tabbed UI: Manual Upload (the per-row form), Batch
// Upload (the spreadsheet importer, lifted from the old /upload page), and
// History (filterable + sortable list). The active tab persists across
// navigations via the module-level `activeExpensesTab` so editing an expense
// and coming back lands the user on the right tab.

import { STATE, emit } from '../state.js';
import { COUNTRIES, CONVERSION_RATES } from '../constants.js';
import { generateId, showConfirmModal, q, formatHome, getHomeCurrency, esc } from '../utils.js';
import { upsertExpense, deleteExpenseOnServer } from '../api.js';
import { navigate } from '../router.js';
import { showPersTab } from './settings.js';
import { renderUpload } from './upload.js';
import { canEdit } from '../permissions.js';

/** @type {'manual' | 'batch' | 'history'} */
let activeExpensesTab = 'manual';

/** Set the active tab before rendering — used by the /upload route to land
 *  users on the Batch tab without breaking deep links from before the merge. */
export function setExpensesTab(/** @type {'manual' | 'batch' | 'history'} */ tab) {
    activeExpensesTab = tab;
}

export const openEditExpenseModal = (id) => {
    const e = STATE.expenses.find(exp => exp.id === id);
    if (!e) return;
    STATE.draftExpense = { ...e };
    STATE.activeTripId = e.tripId;
    activeExpensesTab = 'manual';
    emit('state:changed');               // saveState via subscriber
    navigate('expenses');
};

export const deleteExpense = (id) => {
    showConfirmModal({
        title: "Delete Expense?",
        message: "This action cannot be undone.",
        confirmText: "Delete",
        onConfirm: () => {
            STATE.expenses = STATE.expenses.filter(e => e.id !== id);

            emit('state:changed');               // saveState via subscriber
            deleteExpenseOnServer(id);           // server delta still explicit
            activeExpensesTab = 'history';
            navigate('expenses');
        }
    });
};

export function renderExpenses() {
    const div = document.createElement('div');

    if (!STATE.activeTripId) {
        div.innerHTML = `<h1>Expenses</h1><div class="card glass"><p>Please select a trip first.</p></div>`;
        return div;
    }

    div.innerHTML = `
        <h1 style="margin-bottom: 12px;">Expenses</h1>
        <nav class="expenses-tabnav" role="tablist">
            <button class="expenses-tabnav__tab" data-tab="manual" role="tab">Manual Upload</button>
            <button class="expenses-tabnav__tab" data-tab="batch" role="tab">Batch Upload</button>
            <button class="expenses-tabnav__tab" data-tab="history" role="tab">History</button>
        </nav>
        <div id="expensesTabContent"></div>
    `;

    const mountTab = () => {
        const content = q(div, '#expensesTabContent');
        content.innerHTML = '';

        div.querySelectorAll('.expenses-tabnav__tab').forEach(t => {
            const el = /** @type {HTMLElement} */ (t);
            el.classList.toggle('is-active', el.dataset.tab === activeExpensesTab);
        });

        const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
        const isReadOnly = !canEdit(activeTrip);

        if (activeExpensesTab === 'manual') {
            content.appendChild(isReadOnly ? renderReadOnlyNotice('Manual Upload', 'log new expenses') : renderManualTab());
        } else if (activeExpensesTab === 'batch') {
            content.appendChild(isReadOnly ? renderReadOnlyNotice('Batch Upload', 'import expenses') : renderUpload());
        } else {
            content.appendChild(renderHistoryTab());
        }
    };

    /** Friendly "you're a Relaxer here" panel — used in the Manual + Batch
     *  tabs when the current user can't edit the active trip. Keeps the
     *  tab structure visible so there's no confusing "tab disappeared" UX,
     *  but blocks the form / file picker behind a clear explanation. */
    function renderReadOnlyNotice(/** @type {string} */ tabLabel, /** @type {string} */ verb) {
        const w = document.createElement('div');
        w.innerHTML = `
            <div class="card glass" style="max-width: 520px; margin: 32px auto; padding: 36px; border-radius: 28px; text-align: center; background: rgba(255,255,255,0.6);">
                <div style="font-size: 2.4rem; margin-bottom: 12px;">👁</div>
                <h2 style="margin: 0 0 12px; font-size: 1.4rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">Read-only — Relaxer view</h2>
                <p style="margin: 0; color: rgba(0,0,0,0.55); line-height: 1.5;">
                    You're a <strong>Relaxer</strong> on this trip, so you can't ${verb} from the <strong>${tabLabel}</strong> tab. Switch to the <strong>History</strong> tab to see what's been added — and ask the trip's planner to promote you if you want to contribute.
                </p>
            </div>
        `;
        return w;
    }

    div.querySelectorAll('.expenses-tabnav__tab').forEach(t => {
        const el = /** @type {HTMLElement} */ (t);
        el.addEventListener('click', () => {
            const tab = el.dataset.tab;
            if (tab === 'manual' || tab === 'batch' || tab === 'history') {
                activeExpensesTab = tab;
                mountTab();
            }
        });
    });

    setTimeout(mountTab, 0);

    return div;
}

// ── Manual Upload tab ───────────────────────────────────────────────────────
// The per-row expense form, with split editor, country search, and live
// draft persistence to STATE.draftExpense.

function renderManualTab() {
    const wrapper = document.createElement('div');

    // Trip-scoped companions list (a subset of STATE.groups). The expense
    // form only offers people the user has explicitly attached to this trip
    // — keeps Splits clean and stops cross-trip companions polluting the
    // dropdown. If the list is empty the form steers the user to the
    // companion picker on Home, which is the canonical place to manage it.
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    const tripCompanions = activeTrip?.companions ?? [];
    const hasTripCompanions = tripCompanions.length > 0;

    // Build People Options
    let peopleOptions = tripCompanions.map(p => `<option value="${p}">${p}</option>`).join('');
    if (!peopleOptions) {
        peopleOptions = STATE.groups.length === 0
            ? `<option value="">Add companions in the personalisation section</option>`
            : `<option value="">No companions on this trip — pick some from Home</option>`;
    }

    // Build Category Options
    const categoryOptions = STATE.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

    wrapper.innerHTML = `
        <div class="card glass" style="max-width: 600px; margin: 0 auto; width: 100%; border-radius: 44px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); padding: 48px; box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 2.2rem; margin-bottom: 32px; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Expense</h2>
            <form id="expenseForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">

                <div class="form-row">
                    <label class="form-label-light">Who Paid</label>
                    <select id="expWho" class="glass-input-light" required>
                        ${peopleOptions}
                    </select>
                    ${!STATE.groups || STATE.groups.length === 0 ? `
                    <div id="addCompanionsHelper" style="margin-top: var(--space-3); font-size: var(--font-sm); color: var(--accent-blue); font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <span>➕</span> <span style="text-decoration: underline;">Add companions in the personalization section</span>
                    </div>` : ''}
                </div>

                <div class="form-row">
                    <label class="form-label-light">Category</label>
                    <select id="expCategory" class="glass-input-light" required>
                        ${categoryOptions}
                    </select>
                </div>

                <div class="form-row">
                    <label class="form-label-light">Label</label>
                    <input type="text" id="expLabel" class="glass-input-light" placeholder="e.g. Dinner at Mario's" required>
                </div>

                <div class="form-row">
                    <label class="form-label-light">Date</label>
                    <input type="date" id="expDate" class="glass-input-light" required>
                </div>

                <div class="form-row" style="position: relative;" id="countrySearchContainer">
                    <label class="form-label-light">Country</label>
                    <div class="custom-select-wrapper">
                        <input type="text" id="expCountry" class="glass-input-light" placeholder="Search country..." autocomplete="off">
                        <div id="countryDropdownList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 250px; overflow-y: auto; margin-top: var(--space-2); border-radius: var(--radius-xl); border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${COUNTRIES.sort().map(c => `<div class="dropdown-item" data-value="${c}">${c}</div>`).join('')}
                            <div class="dropdown-item" data-value="Other">Other</div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <label class="form-label-light">Value</label>
                    <input type="number" step="0.01" id="expValue" class="glass-input-light" style="font-weight: 700;" required>
                </div>

                <div class="form-row" style="margin-bottom: var(--space-8);">
                    <label class="form-label-light">Currency</label>
                    <select id="expCurrency" class="glass-input-light" required>
                        <option value="">Select Currency...</option>
                        ${Object.keys(CONVERSION_RATES).map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>

                <div style="margin-bottom: 40px; background: rgba(0,0,0,0.03); padding: 32px; border-radius: 32px; border: 1px solid rgba(0,0,0,0.05); width: 100%; max-width: 440px; box-sizing: border-box;">
                    <label style="display: block; margin-bottom: 16px; font-size: 0.9rem; font-weight: 800; color: #000000; letter-spacing: -0.02em;">Split Between</label>
                    <div style="display: flex; gap: 14px; margin-bottom: 20px;">
                        <select id="addSplitSelect" class="glass-input" style="flex: 1; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.4); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" ${!hasTripCompanions ? 'disabled' : ''}>
                            <option value="">${hasTripCompanions ? 'Add person to split...' : 'No trip companions yet'}</option>
                            ${tripCompanions.map(p => `<option value="${p}">${p}</option>`).join('')}
                        </select>
                        <button type="button" id="addSplitBtn" class="btn btn-small" style="padding: 0 24px; height: 50px; border-radius: 16px; background: #0071e3; color: #ffffff; font-weight: 700;">+ Add</button>
                    </div>
                    <div id="splitContainer" style="display: flex; flex-direction: column; gap: 12px;">
                        <!-- Dynamic splitters appear here -->
                    </div>
                </div>
                <button type="submit" class="btn-primary btn-primary--lg">Save Expense</button>
                <div id="manualSaveStatus" style="margin-top: 16px; font-weight: 700; text-align: center;"></div>
            </form>
        </div>
    `;

    setTimeout(() => {
        wrapper.querySelector('#addCompanionsHelper')?.addEventListener('click', () => {
            navigate('personalization');
            // Settings DOM doesn't exist until navigate renders it.
            setTimeout(() => showPersTab('companions'), 50);
        });

        const form = /** @type {HTMLFormElement} */ (q(wrapper, '#expenseForm'));
        const splitContainer = q(wrapper, '#splitContainer');
        const addSplitSelect = /** @type {HTMLSelectElement} */ (q(wrapper, '#addSplitSelect'));
        const addSplitBtn = /** @type {HTMLButtonElement} */ (q(wrapper, '#addSplitBtn'));

        /** @type {string[]} */
        let activeSplitters = [];

        function updateSplitUI() {
            if (activeSplitters.length === 0) {
                splitContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; padding:10px; border:1px dashed var(--glass-border); border-radius:8px; text-align:center;">100% will be attributed to the payer.</p>';
                return;
            }

            const defaultPct = (100 / activeSplitters.length).toFixed(1);
            splitContainer.innerHTML = activeSplitters.map(p => `
                <div class="splitter-row">
                    <span style="font-weight: 500;">${p}</span>
                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                        <input type="number" class="glass-input split-input splitter-row__pct" data-person="${p}" value="${defaultPct}" step="0.1" required>
                        <span style="color: var(--text-secondary); font-size: var(--font-base);">%</span>
                        <button type="button" class="btn-x-bare remove-splitter" data-person="${p}" style="font-weight:700; margin-left: var(--space-2);">&times;</button>
                    </div>
                </div>
            `).join('');

            splitContainer.querySelectorAll('.remove-splitter').forEach(btn => {
                /** @type {HTMLButtonElement} */ (btn).onclick = () => {
                    const person = btn.getAttribute('data-person');
                    activeSplitters = activeSplitters.filter(p => p !== person);
                    updateSplitUI();
                };
            });
        }

        addSplitBtn.onclick = () => {
            const person = addSplitSelect.value;
            if (person && !activeSplitters.includes(person)) {
                activeSplitters.push(person);
                updateSplitUI();
            }
        };

        // Populate from draft
        if (STATE.draftExpense) {
            const d = STATE.draftExpense;
            if (d.who) /** @type {HTMLSelectElement} */ (q(wrapper, '#expWho')).value = d.who;
            if (d.categoryId) /** @type {HTMLSelectElement} */ (q(wrapper, '#expCategory')).value = d.categoryId;
            if (d.label) /** @type {HTMLInputElement} */ (q(wrapper, '#expLabel')).value = d.label;
            if (d.date) /** @type {HTMLInputElement} */ (q(wrapper, '#expDate')).value = d.date;
            if (d.country) /** @type {HTMLInputElement} */ (q(wrapper, '#expCountry')).value = d.country;
            if (d.value) /** @type {HTMLInputElement} */ (q(wrapper, '#expValue')).value = String(d.value);
            if (d.currency) /** @type {HTMLSelectElement} */ (q(wrapper, '#expCurrency')).value = d.currency;
        }

        // Live Save Draft
        form.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', (e) => {
                const t = /** @type {HTMLInputElement | HTMLSelectElement} */ (e.target);
                const id = t.id;
                if (!id) return;
                const val = t.value;
                if (id === 'expWho') STATE.draftExpense.who = val;
                if (id === 'expCategory') STATE.draftExpense.categoryId = val;
                if (id === 'expLabel') STATE.draftExpense.label = val;
                if (id === 'expDate') STATE.draftExpense.date = val;
                if (id === 'expCountry') STATE.draftExpense.country = val;
                if (id === 'expValue') STATE.draftExpense.value = val;
                if (id === 'expCurrency') STATE.draftExpense.currency = val;

                emit('state:changed');
            });
        });

        // Custom Searchable Dropdown Logic
        const countryInput = /** @type {HTMLInputElement} */ (q(wrapper, '#expCountry'));
        const countryList = q(wrapper, '#countryDropdownList');
        const countryItems = /** @type {NodeListOf<HTMLElement>} */ (countryList.querySelectorAll('.dropdown-item'));

        countryInput.onfocus = () => {
            countryList.style.display = 'block';
        };

        countryInput.oninput = (e) => {
            const val = /** @type {HTMLInputElement} */ (e.target).value.toLowerCase();
            countryItems.forEach(item => {
                const text = (item.textContent ?? '').toLowerCase();
                item.style.display = text.includes(val) ? 'block' : 'none';
            });
            countryList.style.display = 'block';
        };

        countryItems.forEach(item => {
            item.onclick = (e) => {
                countryInput.value = item.getAttribute('data-value') ?? '';
                countryList.style.display = 'none';
                e.stopPropagation();
                STATE.draftExpense.country = countryInput.value;
                emit('state:changed');
            };
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            const target = /** @type {Node | null} */ (e.target);
            const container = wrapper.querySelector('#countrySearchContainer');
            if (!target || !container || !container.contains(target)) {
                countryList.style.display = 'none';
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!STATE.activeTripId) return;
            const tripId = STATE.activeTripId;

            const payer = /** @type {HTMLSelectElement} */ (q(wrapper, '#expWho')).value;
            /** @type {Record<string, number>} */
            const splits = {};
            let totalSplit = 0;

            const splitInputs = /** @type {NodeListOf<HTMLInputElement>} */ (wrapper.querySelectorAll('.split-input'));
            if (splitInputs.length > 0) {
                splitInputs.forEach(input => {
                    const val = parseFloat(input.value) || 0;
                    const person = input.getAttribute('data-person');
                    if (person) splits[person] = val;
                    totalSplit += val;
                });

                if (Math.abs(totalSplit - 100) > 0.5) {
                    alert("Percentages must add up to exactly 100%");
                    return;
                }
            } else {
                splits[payer] = 100;
            }

            const val = parseFloat(/** @type {HTMLInputElement} */ (q(wrapper, '#expValue')).value);
            const curr = /** @type {HTMLSelectElement} */ (q(wrapper, '#expCurrency')).value.toUpperCase();

            if (isNaN(val) || val <= 0) {
                alert("Please enter a valid expense value.");
                return;
            }
            if (!curr) {
                alert("Please select a currency.");
                return;
            }

            const activeTrip = STATE.trips.find(t => t.id === tripId);
            const countryVal = /** @type {HTMLInputElement} */ (q(wrapper, '#expCountry')).value || (activeTrip ? activeTrip.country : '');

            const isEdit = !!STATE.draftExpense?.id;
            /** @type {import('../types').Expense} */
            const expense = {
                id: isEdit && STATE.draftExpense.id ? STATE.draftExpense.id : generateId(),
                tripId,
                who: payer,
                categoryId: /** @type {HTMLSelectElement} */ (q(wrapper, '#expCategory')).value,
                label: /** @type {HTMLInputElement} */ (q(wrapper, '#expLabel')).value,
                date: /** @type {HTMLInputElement} */ (q(wrapper, '#expDate')).value,
                country: countryVal,
                value: val,
                currency: curr,
                euroValue: val * (CONVERSION_RATES[curr] || 1),
                splits: splits
            };

            if (isEdit) {
                const idx = STATE.expenses.findIndex(e => e.id === expense.id);
                if (idx !== -1) STATE.expenses[idx] = expense;
                else STATE.expenses.push(expense);
            } else {
                STATE.expenses.push(expense);
            }

            STATE.draftExpense = { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR', euroValue: '' };

            emit('state:changed');
            upsertExpense(expense);

            const status = q(wrapper, '#manualSaveStatus');
            status.textContent = isEdit ? '✓ Expense updated — view in History' : '✓ Expense saved — view in History';
            status.style.color = '#34c759';
            setTimeout(() => { status.textContent = ''; }, 4000);

            form.reset();
            activeSplitters = [];
            updateSplitUI();
        });

        updateSplitUI();
    }, 0);

    return wrapper;
}

// ── History tab ─────────────────────────────────────────────────────────────
// Filterable + sortable list of all expenses for the active trip.

function renderHistoryTab() {
    const wrapper = document.createElement('div');

    // Payer filter draws from this trip's companions — same scope as the
    // expense form, so the dropdown only offers people who could have paid
    // an expense on this trip. Falls back to the union of `who` values
    // already on file (in case the user is viewing the page before picking
    // companions but does have historical expenses).
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    const tripCompanions = activeTrip?.companions ?? [];
    const tripPayers = tripCompanions.length > 0
        ? tripCompanions
        : Array.from(new Set(
            STATE.expenses
                .filter(e => e.tripId === STATE.activeTripId)
                .map(e => e.who)
                .filter(Boolean)
        ));

    wrapper.innerHTML = `
        <div id="expensesContainer" style="max-width: 1000px; margin: 0 auto; width: 100%; margin-bottom: 60px;">
            <div style="margin-bottom: 40px; padding: 0 10px;">
                <div class="card glass" style="padding: 32px; border-radius: 32px; background: linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1)); border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                        <h2 style="font-size: 1.8rem; font-weight: 800; letter-spacing: -0.04em; margin: 0;">Expense History</h2>
                        <div style="display: flex; gap: 8px;">
                            <button id="clearFiltersBtn" class="btn-chip-danger">Clear Filters</button>
                            <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-blue); background: rgba(0,113,227,0.1); padding: 6px 14px; border-radius: 100px; text-transform: uppercase;">Smart Filters</span>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-3);">
                        <!-- Row 1: Search (full width) -->
                        <div style="grid-column: 1 / -1;">
                            <label class="filter-label">Search</label>
                            <input type="text" id="filterSearch" class="filter-input" placeholder="Search labels or items...">
                        </div>

                        <!-- Row 2: Category | Payer | Sort -->
                        <div>
                            <label class="filter-label">Category</label>
                            <select id="filterCategory" class="filter-input">
                                <option value="all">All Categories</option>
                                ${STATE.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
                                <option value="settlement">🤝 Settlement</option>
                            </select>
                        </div>
                        <div>
                            <label class="filter-label">Payer</label>
                            <select id="filterWho" class="filter-input">
                                <option value="all">Everyone</option>
                                ${tripPayers.map(p => `<option value="${p}">${p}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="filter-label">Sort By</label>
                            <select id="filterSort" class="filter-input">
                                <option value="date_desc">Newest first</option>
                                <option value="date_asc">Oldest first</option>
                                <option value="value_desc">Highest amount</option>
                                <option value="value_asc">Lowest amount</option>
                                <option value="label_asc">Label (A–Z)</option>
                                <option value="who_asc">Payer (A–Z)</option>
                            </select>
                        </div>

                        <!-- Row 3: From Date | To Date | Min–Max Value -->
                        <div>
                            <label class="filter-label">From Date</label>
                            <input type="date" id="filterDateFrom" class="filter-input">
                        </div>
                        <div>
                            <label class="filter-label">To Date</label>
                            <input type="date" id="filterDateTo" class="filter-input">
                        </div>
                        <div>
                            <label class="filter-label">Value Range (€)</label>
                            <div style="display: flex; gap: var(--space-2); align-items: center;">
                                <input type="number" id="filterMinVal" class="filter-input" placeholder="Min" style="flex: 1; padding: var(--space-3);">
                                <span style="color: rgba(0,0,0,0.3); font-weight: 700; flex-shrink: 0;">–</span>
                                <input type="number" id="filterMaxVal" class="filter-input" placeholder="Max" style="flex: 1; padding: var(--space-3);">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="tripExpensesList" style="display: flex; flex-direction: column; gap: 20px;"></div>
        </div>
    `;

    // Delegated handler for per-row edit/delete in #tripExpensesList — listener
    // attached on wrapper once; rows are re-rendered by renderTripExpenses().
    wrapper.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;
        const editBtn = /** @type {HTMLElement | null} */ (target.closest('.expense-edit-btn'));
        if (editBtn?.dataset.expenseId) { openEditExpenseModal(editBtn.dataset.expenseId); return; }
        const delBtn = /** @type {HTMLElement | null} */ (target.closest('.expense-delete-btn'));
        if (delBtn?.dataset.expenseId) { deleteExpense(delBtn.dataset.expenseId); return; }
    });

    setTimeout(() => {
        const filterExps = () => {
            const search = /** @type {HTMLInputElement} */ (q(wrapper, '#filterSearch')).value.toLowerCase();
            const catId = /** @type {HTMLSelectElement} */ (q(wrapper, '#filterCategory')).value;
            const who = /** @type {HTMLSelectElement} */ (q(wrapper, '#filterWho')).value;
            const dateFrom = /** @type {HTMLInputElement} */ (q(wrapper, '#filterDateFrom')).value;
            const dateTo = /** @type {HTMLInputElement} */ (q(wrapper, '#filterDateTo')).value;
            const minVal = parseFloat(/** @type {HTMLInputElement} */ (q(wrapper, '#filterMinVal')).value) || 0;
            const maxVal = parseFloat(/** @type {HTMLInputElement} */ (q(wrapper, '#filterMaxVal')).value) || Infinity;
            const sort = /** @type {HTMLSelectElement} */ (q(wrapper, '#filterSort')).value;

            renderTripExpenses(q(wrapper, '#tripExpensesList'), {
                search, catId, who, dateFrom, dateTo, minVal, maxVal, sort
            });
        };

        /** @type {HTMLInputElement} */ (q(wrapper, '#filterSearch')).oninput = filterExps;
        /** @type {HTMLSelectElement} */ (q(wrapper, '#filterCategory')).onchange = filterExps;
        /** @type {HTMLSelectElement} */ (q(wrapper, '#filterWho')).onchange = filterExps;
        /** @type {HTMLSelectElement} */ (q(wrapper, '#filterSort')).onchange = filterExps;
        /** @type {HTMLInputElement} */ (q(wrapper, '#filterDateFrom')).onchange = filterExps;
        /** @type {HTMLInputElement} */ (q(wrapper, '#filterDateTo')).onchange = filterExps;
        /** @type {HTMLInputElement} */ (q(wrapper, '#filterMinVal')).oninput = filterExps;
        /** @type {HTMLInputElement} */ (q(wrapper, '#filterMaxVal')).oninput = filterExps;

        /** @type {HTMLButtonElement} */ (q(wrapper, '#clearFiltersBtn')).onclick = () => {
            /** @type {HTMLInputElement} */ (q(wrapper, '#filterSearch')).value = '';
            /** @type {HTMLSelectElement} */ (q(wrapper, '#filterCategory')).value = 'all';
            /** @type {HTMLSelectElement} */ (q(wrapper, '#filterWho')).value = 'all';
            /** @type {HTMLSelectElement} */ (q(wrapper, '#filterSort')).value = 'date_desc';
            /** @type {HTMLInputElement} */ (q(wrapper, '#filterDateFrom')).value = '';
            /** @type {HTMLInputElement} */ (q(wrapper, '#filterDateTo')).value = '';
            /** @type {HTMLInputElement} */ (q(wrapper, '#filterMinVal')).value = '';
            /** @type {HTMLInputElement} */ (q(wrapper, '#filterMaxVal')).value = '';
            renderTripExpenses(q(wrapper, '#tripExpensesList'));
        };

        renderTripExpenses(q(wrapper, '#tripExpensesList'));
    }, 0);

    return wrapper;
}

/**
 * @param {HTMLElement} container
 * @param {{ search?: string; catId?: string; who?: string; dateFrom?: string; dateTo?: string; minVal?: number; maxVal?: number; sort?: string }} [filters]
 */
export function renderTripExpenses(container, filters = {}) {
    if (!container) return;

    let tripExpenses = STATE.expenses.filter(e => e.tripId === STATE.activeTripId);

    // Apply Filters
    const search = filters.search;
    if (search) {
        tripExpenses = tripExpenses.filter(e => e.label.toLowerCase().includes(search));
    }
    if (filters.catId && filters.catId !== 'all') {
        if (filters.catId === 'settlement') {
            tripExpenses = tripExpenses.filter(e => e.isSettlement);
        } else {
            tripExpenses = tripExpenses.filter(e => e.categoryId === filters.catId && !e.isSettlement);
        }
    } else {
        // By default, only show non-settlements unless filtered for settlements
        tripExpenses = tripExpenses.filter(e => !e.isSettlement);
    }
    if (filters.who && filters.who !== 'all') {
        tripExpenses = tripExpenses.filter(e => e.who === filters.who);
    }
    const { dateFrom, dateTo, minVal, maxVal } = filters;
    if (dateFrom) tripExpenses = tripExpenses.filter(e => e.date >= dateFrom);
    if (dateTo) tripExpenses = tripExpenses.filter(e => e.date <= dateTo);
    if (minVal !== undefined) tripExpenses = tripExpenses.filter(e => (e.euroValue || 0) >= minVal);
    if (maxVal !== undefined && maxVal !== Infinity) {
        tripExpenses = tripExpenses.filter(e => (e.euroValue || 0) <= maxVal);
    }

    const sort = filters.sort || 'date_desc';
    switch (sort) {
        case 'date_asc':
            tripExpenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            break;
        case 'value_desc':
            tripExpenses.sort((a, b) => (b.euroValue || 0) - (a.euroValue || 0));
            break;
        case 'value_asc':
            tripExpenses.sort((a, b) => (a.euroValue || 0) - (b.euroValue || 0));
            break;
        case 'label_asc':
            tripExpenses.sort((a, b) => (a.label || '').localeCompare(b.label || ''));
            break;
        case 'who_asc':
            tripExpenses.sort((a, b) => (a.who || '').localeCompare(b.who || ''));
            break;
        case 'date_desc':
        default:
            tripExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            break;
    }

    function formatAppleDate(dateStr) {
        if (!dateStr) return 'Global';
        // DD-MM-YYYY everywhere the user reads a date. Storage stays ISO
        // YYYY-MM-DD (only the rendering changes).
        const date = new Date(dateStr + 'T00:00:00Z');
        if (isNaN(date.getTime())) return 'Global';
        const dd = String(date.getUTCDate()).padStart(2, '0');
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = date.getUTCFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

    if (tripExpenses.length === 0) {
        container.innerHTML = `
            <div class="card glass expense-row__empty">
                <div style="font-size: 2.5rem; margin-bottom: 15px; opacity: 0.5;">💸</div>
                <p style="color: rgba(255,255,255,0.5); font-weight: 500; font-size: var(--font-lg);">No expenses found for this trip.</p>
            </div>
        `;
        return;
    }

    const homeCurrency = getHomeCurrency();
    // Edit/delete row buttons are planner-only — hide for relaxers so the
    // History tab reads as a clean read-only ledger when they don't have
    // edit rights. Backend already 403s on the underlying endpoints; this
    // is just to keep the UI honest.
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    const showRowActions = canEdit(activeTrip);
    container.innerHTML = tripExpenses.map(e => {
        const cat = STATE.categories.find(c => c.id === e.categoryId);
        // Convert from the original currency to the user's home currency for
        // the blue helper line. Skip the line entirely when the expense was
        // already in the home currency (no extra info to add).
        const showConverted = e.currency !== homeCurrency;
        const convertedDisplay = showConverted ? `≈ ${formatHome(e.value, e.currency)}` : '';

        return `
            <div class="card glass expense-row" style="padding: 14px 22px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; gap: var(--space-4);">
                    <div class="expense-row__icon">
                        ${cat ? cat.icon : '💰'}
                    </div>
                    <div>
                        <strong class="expense-row__title">${esc(e.label)}</strong>
                        <div class="expense-row__meta">
                            <span>${formatAppleDate(e.date)}</span>
                            <span class="expense-row__meta-dot"></span>
                            <span>${esc(e.country || 'Global')}</span>
                            <span class="expense-row__meta-dot"></span>
                            <span>${esc(e.who)}</span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: var(--space-3);">
                    <div style="text-align: right;">
                        <div class="expense-row__amount">${e.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="expense-row__currency">${esc(e.currency)}</span></div>
                        ${convertedDisplay ? `<div class="expense-row__converted">${convertedDisplay}</div>` : ''}
                    </div>

                    ${showRowActions ? `
                    <div style="display: flex; gap: var(--space-2);">
                        <button class="icon-action-btn expense-edit-btn" data-expense-id="${e.id}" style="--accent: 0,113,227;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button class="icon-action-btn expense-delete-btn" data-expense-id="${e.id}" style="--accent: 255,59,48;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}
