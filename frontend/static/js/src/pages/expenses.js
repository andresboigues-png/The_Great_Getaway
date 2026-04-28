// pages/expenses.js

import { STATE, emit } from '../state.js';
import { COUNTRIES, CONVERSION_RATES } from '../constants.js';
import { generateId, showConfirmModal, showLiquidAlert } from '../utils.js';
import { upsertExpense, deleteExpenseOnServer } from '../api.js';
import { navigate } from '../router.js';

export const openEditExpenseModal = (id) => {
    const e = STATE.expenses.find(exp => exp.id === id);
    if (!e) return;
    STATE.draftExpense = { ...e };
    STATE.activeTripId = e.tripId;

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

    // Build People Options
    let peopleOptions = STATE.groups.map(p => `<option value="${p}">${p}</option>`).join('');
    if (!peopleOptions) peopleOptions = `<option value="">Add companions in the personalisation section</option>`;

    // Build Category Options
    let categoryOptions = STATE.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

    div.innerHTML = `
        <h1 style="margin-bottom: 32px;">Expenses</h1>
        <div style="display: flex; flex-direction: column; gap: 60px;">
            <!-- Add Expense Section -->
            <div class="card glass" style="max-width: 600px; margin: 0 auto; width: 100%; border-radius: 44px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); padding: 48px; box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
                <h2 class="card-title" style="font-size: 2.2rem; margin-bottom: 32px; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Expense</h2>
                <form id="expenseForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    
                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Who Paid</label>
                        <select id="expWho" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            ${peopleOptions}
                        </select>
                        ${!STATE.groups || STATE.groups.length === 0 ? `
                        <div id="addCompanionsHelper" style="margin-top: 12px; font-size: 0.85rem; color: #0071e3; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <span>➕</span> <span style="text-decoration: underline;">Add companions in the personalization section</span>
                        </div>` : ''}
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Category</label>
                        <select id="expCategory" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            ${categoryOptions}
                        </select>
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Label</label>
                        <input type="text" id="expLabel" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" placeholder="e.g. Dinner at Mario's" required>
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Date</label>
                        <input type="date" id="expDate" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px; position: relative;" id="countrySearchContainer">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Country</label>
                        <div class="custom-select-wrapper">
                            <input type="text" id="expCountry" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" placeholder="Search country..." autocomplete="off">
                            <div id="countryDropdownList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 250px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                                ${COUNTRIES.sort().map(c => `<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${c}">${c}</div>`).join('')}
                                <div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="Other">Other</div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Value</label>
                        <input type="number" step="0.01" id="expValue" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 700; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                    </div>

                    <div style="margin-bottom: 32px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Currency</label>
                        <select id="expCurrency" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            <option value="">Select Currency...</option>
                            ${Object.keys(CONVERSION_RATES).map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 40px; background: rgba(0,0,0,0.03); padding: 32px; border-radius: 32px; border: 1px solid rgba(0,0,0,0.05); width: 100%; max-width: 440px; box-sizing: border-box;">
                        <label style="display: block; margin-bottom: 16px; font-size: 0.9rem; font-weight: 800; color: #000000; letter-spacing: -0.02em;">Split Between</label>
                        <div style="display: flex; gap: 14px; margin-bottom: 20px;">
                            <select id="addSplitSelect" class="glass-input" style="flex: 1; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.4); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;">
                                <option value="">Add person to split...</option>
                                ${STATE.groups.map(p => `<option value="${p}">${p}</option>`).join('')}
                            </select>
                            <button type="button" id="addSplitBtn" class="btn btn-small" style="padding: 0 24px; height: 50px; border-radius: 16px; background: #0071e3; color: #ffffff; font-weight: 700;">+ Add</button>
                        </div>
                        <div id="splitContainer" style="display: flex; flex-direction: column; gap: 12px;">
                            <!-- Dynamic splitters appear here -->
                        </div>
                    </div>
                    <button type="submit" class="btn" style="width: 100%; max-width: 440px; padding: 20px; font-size: 1.2rem; font-weight: 800; border-radius: 24px; background: #0071e3; color: #ffffff; box-shadow: 0 15px 40px rgba(0,113,227,0.3); transition: all 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 20px 50px rgba(0,113,227,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 15px 40px rgba(0,113,227,0.3)';">Save Expense</button>
                </form>
            </div>

            <!-- All Expenses Section -->
            <div id="expensesContainer" style="max-width: 1000px; margin: 0 auto; width: 100%; margin-bottom: 60px;">
                <div style="margin-bottom: 40px; padding: 0 10px;">
                    <div class="card glass" style="padding: 32px; border-radius: 32px; background: linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1)); border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                            <h2 style="font-size: 1.8rem; font-weight: 800; letter-spacing: -0.04em; margin: 0;">Expense History</h2>
                            <div style="display: flex; gap: 8px;">
                                <button id="clearFiltersBtn" style="font-size: 0.7rem; font-weight: 700; color: #ff3b30; background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.1); padding: 6px 14px; border-radius: 100px; text-transform: uppercase; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.15)';" onmouseout="this.style.background='rgba(255,59,48,0.08)';">Clear Filters</button>
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-blue); background: rgba(0,113,227,0.1); padding: 6px 14px; border-radius: 100px; text-transform: uppercase;">Smart Filters</span>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                            <!-- Row 1: Search (full width) -->
                            <div style="grid-column: 1 / -1;">
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Search</label>
                                <input type="text" id="filterSearch" class="glass-input" placeholder="Search labels or items..." style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                            </div>

                            <!-- Row 2: Category | Payer | (empty) -->
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Category</label>
                                <select id="filterCategory" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                    <option value="all">All Categories</option>
                                    ${STATE.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
                                    <option value="settlement">🤝 Settlement</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Payer</label>
                                <select id="filterWho" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                    <option value="all">Everyone</option>
                                    ${STATE.groups.map(p => `<option value="${p}">${p}</option>`).join('')}
                                </select>
                            </div>
                            <div></div>

                            <!-- Row 3: From Date | To Date | Min–Max Value -->
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">From Date</label>
                                <input type="date" id="filterDateFrom" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">To Date</label>
                                <input type="date" id="filterDateTo" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Value Range (€)</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="number" id="filterMinVal" class="glass-input" placeholder="Min" style="flex: 1; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                    <span style="color: rgba(0,0,0,0.3); font-weight: 700; flex-shrink: 0;">–</span>
                                    <input type="number" id="filterMaxVal" class="glass-input" placeholder="Max" style="flex: 1; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="tripExpensesList" style="display: flex; flex-direction: column; gap: 20px;"></div>
            </div>
        </div>
    `;

    // Handle Form Submit & Draft Saving
    setTimeout(() => {
        div.querySelector('#addCompanionsHelper')?.addEventListener('click', () => {
            navigate('personalization');
            // Settings DOM doesn't exist until navigate renders it.
            setTimeout(() => window.showPersTab('companions'), 50);
        });

        // Delegated handler for per-row edit/delete in #tripExpensesList — listener
        // attached on div once; rows are re-rendered by renderTripExpenses().
        div.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.expense-edit-btn');
            if (editBtn) { openEditExpenseModal(editBtn.dataset.expenseId); return; }
            const delBtn = e.target.closest('.expense-delete-btn');
            if (delBtn) { deleteExpense(delBtn.dataset.expenseId); return; }
        });

        const form = div.querySelector('#expenseForm');
        const splitContainer = div.querySelector('#splitContainer');
        const addSplitSelect = div.querySelector('#addSplitSelect');
        const addSplitBtn = div.querySelector('#addSplitBtn');

        let activeSplitters = []; // Array of names currently in the split

        function updateSplitUI() {
            if (activeSplitters.length === 0) {
                splitContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; padding:10px; border:1px dashed var(--glass-border); border-radius:8px; text-align:center;">100% will be attributed to the payer.</p>';
                return;
            }

            const defaultPct = (100 / activeSplitters.length).toFixed(1);
            splitContainer.innerHTML = activeSplitters.map(p => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <span style="font-weight: 500;">${p}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="number" class="glass-input split-input" data-person="${p}" value="${defaultPct}" step="0.1" style="width: 70px; padding: 4px 8px; text-align: center;" required>
                        <span style="color: var(--text-secondary); font-size: 0.9rem;">%</span>
                        <button type="button" class="remove-splitter" data-person="${p}" style="background:none; border:none; color:#ff3b30; cursor:pointer; font-weight:700; margin-left:8px;">&times;</button>
                    </div>
                </div>
            `).join('');

            // Attach remove listeners
            splitContainer.querySelectorAll('.remove-splitter').forEach(btn => {
                btn.onclick = () => {
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
            if (d.who) div.querySelector('#expWho').value = d.who;
            if (d.categoryId) div.querySelector('#expCategory').value = d.categoryId;
            if (d.label) div.querySelector('#expLabel').value = d.label;
            if (d.date) div.querySelector('#expDate').value = d.date;
            if (d.country) div.querySelector('#expCountry').value = d.country;
            if (d.value) div.querySelector('#expValue').value = d.value;
            if (d.currency) div.querySelector('#expCurrency').value = d.currency;
        }

        // Live Save Draft
        form.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', (e) => {
                const id = e.target.id;
                if (!id) return;
                const val = e.target.value;
                if (id === 'expWho') STATE.draftExpense.who = val;
                if (id === 'expCategory') STATE.draftExpense.categoryId = val;
                if (id === 'expLabel') STATE.draftExpense.label = val;
                if (id === 'expDate') STATE.draftExpense.date = val;
                if (id === 'expCountry') STATE.draftExpense.country = val;
                if (id === 'expValue') STATE.draftExpense.value = val;
                if (id === 'expCurrency') STATE.draftExpense.currency = val;

                emit('state:changed'); // Persist draft too
            });
        });

        // Custom Searchable Dropdown Logic
        const countryInput = div.querySelector('#expCountry');
        const countryList = div.querySelector('#countryDropdownList');
        const countryItems = countryList.querySelectorAll('.dropdown-item');

        countryInput.onfocus = () => {
            countryList.style.display = 'block';
        };

        countryInput.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            countryItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(val) ? 'block' : 'none';
            });
            countryList.style.display = 'block';
        };

        countryItems.forEach(item => {
            item.onclick = (e) => {
                countryInput.value = item.getAttribute('data-value');
                countryList.style.display = 'none';
                e.stopPropagation();

                // Trigger draft save manually since we set value programmatically
                STATE.draftExpense.country = countryInput.value;
                emit('state:changed');
            };
            item.onmouseover = () => item.style.background = 'rgba(0, 122, 255, 0.1)';
            item.onmouseout = () => item.style.background = 'transparent';
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!div.querySelector('#countrySearchContainer').contains(e.target)) {
                countryList.style.display = 'none';
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const payer = div.querySelector('#expWho').value;
            const splits = {};
            let totalSplit = 0;

            const splitInputs = div.querySelectorAll('.split-input');
            if (splitInputs.length > 0) {
                splitInputs.forEach(input => {
                    const val = parseFloat(input.value) || 0;
                    splits[input.getAttribute('data-person')] = val;
                    totalSplit += val;
                });

                if (Math.abs(totalSplit - 100) > 0.5) {
                    alert("Percentages must add up to exactly 100%");
                    return;
                }
            } else {
                // Default: 100% to payer
                splits[payer] = 100;
            }

            const val = parseFloat(div.querySelector('#expValue').value);
            const curr = div.querySelector('#expCurrency').value.toUpperCase();

            if (isNaN(val) || val <= 0) {
                alert("Please enter a valid expense value.");
                return;
            }
            if (!curr) {
                alert("Please select a currency.");
                return;
            }

            const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
            const countryVal = div.querySelector('#expCountry').value || (activeTrip ? activeTrip.country : '');

            const isEdit = !!STATE.draftExpense?.id;
            const expense = {
                id: isEdit ? STATE.draftExpense.id : generateId(),
                tripId: STATE.activeTripId,
                who: payer,
                categoryId: div.querySelector('#expCategory').value,
                label: div.querySelector('#expLabel').value,
                date: div.querySelector('#expDate').value,
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

            // Clear draft
            STATE.draftExpense = { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR' };

            emit('state:changed');
            upsertExpense(expense); // Delta: persist expense to server
            renderTripExpenses(div.querySelector('#tripExpensesList'));
            form.reset();
            activeSplitters = [];
            updateSplitUI();
        });

        // Filter Logic
        const filterExps = () => {
            const search = div.querySelector('#filterSearch').value.toLowerCase();
            const catId = div.querySelector('#filterCategory').value;
            const who = div.querySelector('#filterWho').value;
            const dateFrom = div.querySelector('#filterDateFrom').value;
            const dateTo = div.querySelector('#filterDateTo').value;
            const minVal = parseFloat(div.querySelector('#filterMinVal').value) || 0;
            const maxVal = parseFloat(div.querySelector('#filterMaxVal').value) || Infinity;
            
            renderTripExpenses(div.querySelector('#tripExpensesList'), { 
                search, catId, who, dateFrom, dateTo, minVal, maxVal 
            });
        };

        div.querySelector('#filterSearch').oninput = filterExps;
        div.querySelector('#filterCategory').onchange = filterExps;
        div.querySelector('#filterWho').onchange = filterExps;
        div.querySelector('#filterDateFrom').onchange = filterExps;
        div.querySelector('#filterDateTo').onchange = filterExps;
        div.querySelector('#filterMinVal').oninput = filterExps;
        div.querySelector('#filterMaxVal').oninput = filterExps;

        div.querySelector('#clearFiltersBtn').onclick = () => {
            div.querySelector('#filterSearch').value = '';
            div.querySelector('#filterCategory').value = 'all';
            div.querySelector('#filterWho').value = 'all';
            div.querySelector('#filterDateFrom').value = '';
            div.querySelector('#filterDateTo').value = '';
            div.querySelector('#filterMinVal').value = '';
            div.querySelector('#filterMaxVal').value = '';
            renderTripExpenses(div.querySelector('#tripExpensesList'));
        };

        renderTripExpenses(div.querySelector('#tripExpensesList'));
        updateSplitUI();
    }, 0);

    return div;
}

export function renderTripExpenses(container, filters = {}) {
    if (!container) return;

    let tripExpenses = STATE.expenses.filter(e => e.tripId === STATE.activeTripId);

    // Apply Filters
    if (filters.search) {
        tripExpenses = tripExpenses.filter(e => e.label.toLowerCase().includes(filters.search));
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
    if (filters.dateFrom) {
        tripExpenses = tripExpenses.filter(e => e.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
        tripExpenses = tripExpenses.filter(e => e.date <= filters.dateTo);
    }
    if (filters.minVal !== undefined) {
        tripExpenses = tripExpenses.filter(e => (e.euroValue || 0) >= filters.minVal);
    }
    if (filters.maxVal !== undefined && filters.maxVal !== Infinity) {
        tripExpenses = tripExpenses.filter(e => (e.euroValue || 0) <= filters.maxVal);
    }

    tripExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    function formatAppleDate(dateStr) {
        if (!dateStr) return 'Global';
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    }

    if (tripExpenses.length === 0) {
        container.innerHTML = `
            <div class="card glass" style="padding: 50px; text-align: center; border-radius: 32px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); backdrop-filter: blur(25px);">
                <div style="font-size: 2.5rem; margin-bottom: 15px; opacity: 0.5;">💸</div>
                <p style="color: rgba(255,255,255,0.5); font-weight: 500; font-size: 1rem;">No expenses found for this trip.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tripExpenses.map(e => {
        const cat = STATE.categories.find(c => c.id === e.categoryId);
        const displayEuro = e.euroValue;

        return `
            <div class="card glass" style="padding: 14px 22px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); display: flex; justify-content: space-between; align-items: center; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.1);" onmouseover="this.style.transform='scale(1.012)'; this.style.boxShadow='0 20px 50px rgba(0,0,0,0.2)'; this.style.background='rgba(255,255,255,0.2)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 10px 30px rgba(0,0,0,0.1)'; this.style.background='rgba(255,255,255,0.15)';">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 48px; height: 48px; background: rgba(0,0,0,0.04); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; border: 1px solid rgba(0,0,0,0.04);">
                        ${cat ? cat.icon : '💰'}
                    </div>
                    <div>
                        <strong style="display: block; font-size: 1.1rem; letter-spacing: -0.02em; color: #000000; margin-bottom: 1px;">${e.label}</strong>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: rgba(0,0,0,0.5); font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;">
                            <span>${formatAppleDate(e.date)}</span>
                            <span style="width: 3px; height: 3px; background: rgba(0,0,0,0.1); border-radius: 50%;"></span>
                            <span>${e.country || 'Global'}</span>
                            <span style="width: 3px; height: 3px; background: rgba(0,0,0,0.1); border-radius: 50%;"></span>
                            <span>${e.who}</span>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="text-align: right;">
                        <div style="font-weight: 800; font-size: 1.2rem; color: #000000; letter-spacing: -0.03em;">${e.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style="font-size: 0.75rem; opacity: 0.5; font-weight: 600;">${e.currency}</span></div>
                        <div style="font-size: 0.85rem; color: #0071e3; font-weight: 700; margin-top: 1px;">≈ €${(displayEuro || 0).toFixed(2)}</div>
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button class="expense-edit-btn" data-expense-id="${e.id}" style="background: rgba(0,113,227,0.08); border: 1px solid rgba(0,113,227,0.1); color: #0071e3; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.15)';" onmouseout="this.style.background='rgba(0,113,227,0.08)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button class="expense-delete-btn" data-expense-id="${e.id}" style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.1); color: #ff3b30; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.15)';" onmouseout="this.style.background='rgba(255,59,48,0.08)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

