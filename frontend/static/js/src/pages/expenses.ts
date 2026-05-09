// pages/expenses.js
//
// Expenses page is a tabbed UI: Manual Upload (the per-row form), Batch
// Upload (the spreadsheet importer, lifted from the old /upload page), and
// History (filterable + sortable list). The active tab persists across
// navigations via the module-level `activeExpensesTab` so editing an expense
// and coming back lands the user on the right tab.

import { STATE, emit } from '../state.js';
import { COUNTRIES, CONVERSION_RATES, COUNTRY_TO_CURRENCY } from '../constants.js';
import { generateId, showConfirmModal, showLiquidAlert, q, formatHome, getHomeCurrency, esc, buildEmptyCardHtml } from '../utils.js';
import { upsertExpense, deleteExpenseOnServer, uploadMedia } from '../api.js';
import { navigate } from '../router.js';
// `showPersTab` import removed — companions live per-trip now, so the
// "no companions" helper just bounces the user to Home where the picker
// lives. Personalization no longer has a companions sub-tab.
import { renderUpload } from './upload.js';
import { canEditExpenses } from '../permissions.js';
import { t, tn } from '../i18n.js';

let activeExpensesTab: 'manual' | 'batch' | 'history' = 'manual';

/** Set the active tab before rendering — used by the /upload route to land
 *  users on the Batch tab without breaking deep links from before the merge. */
export function setExpensesTab(tab: 'manual' | 'batch' | 'history') {
    activeExpensesTab = tab;
}

export const openEditExpenseModal = (id: string) => {
    const e = STATE.expenses.find(exp => exp.id === id);
    if (!e) return;
    STATE.draftExpense = { ...e };
    STATE.activeTripId = e.tripId;
    activeExpensesTab = 'manual';
    emit('state:changed');               // saveState via subscriber
    navigate('expenses');
};

export const deleteExpense = (id: string) => {
    showConfirmModal({
        title: t('expenses.deleteConfirmTitle'),
        message: t('expenses.deleteConfirmMessage'),
        confirmText: t('expenses.deleteConfirmBtn'),
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
        div.innerHTML = `<h1 style="display: inline-block; background: var(--gradient-title); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${t('expenses.title')}</h1><div class="card glass"><p>${t('validation.selectTripFirst')}</p></div>`;
        return div;
    }

    div.innerHTML = `
        <h1 style="display: inline-block; background: var(--gradient-title); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 12px;">${t('expenses.title')}</h1>
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
            const el = (t as HTMLElement);
            el.classList.toggle('is-active', el.dataset.tab === activeExpensesTab);
        });

        const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
        const isReadOnly = !canEditExpenses(activeTrip);

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
    function renderReadOnlyNotice(tabLabel: string, verb: string) {
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
        const el = (t as HTMLElement);
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

    // Trip-scoped companions list (per-trip — companions are no longer
    // account-level). The form only offers people on this trip; if the
    // list is empty, steer the user to the companion picker on Home,
    // which is the canonical place to add companions / friends.
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    const tripCompanionNames = (activeTrip?.companions ?? []).map(c => c.name);
    const hasTripCompanions = tripCompanionNames.length > 0;

    // Build People Options
    let peopleOptions = tripCompanionNames.map(p => `<option value="${p}">${p}</option>`).join('');
    if (!peopleOptions) {
        peopleOptions = `<option value="">No companions on this trip — add some from Home</option>`;
    }

    // Build Category Options
    const categoryOptions = STATE.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

    wrapper.innerHTML = `
        <div class="card glass" style="max-width: 600px; margin: 0 auto; width: 100%; border-radius: 44px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); padding: 48px; box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 2.2rem; margin-bottom: 32px; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Expense</h2>
            <form id="expenseForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">

                <div class="form-row">
                    <label class="form-label-light" for="expWho">Who Paid</label>
                    <select id="expWho" class="glass-input-light" required>
                        ${peopleOptions}
                    </select>
                    ${!hasTripCompanions ? `
                    <div id="addCompanionsHelper" style="margin-top: var(--space-3); font-size: var(--font-sm); color: #005bb8; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                        <span>➕</span> <span style="text-decoration: underline;">Add companions to this trip from Home</span>
                    </div>` : ''}
                </div>

                <div class="form-row">
                    <label class="form-label-light" for="expCategory">Category</label>
                    <select id="expCategory" class="glass-input-light" required>
                        ${categoryOptions}
                    </select>
                </div>

                <div class="form-row">
                    <label class="form-label-light" for="expLabel">Label</label>
                    <input type="text" id="expLabel" class="glass-input-light" placeholder="e.g. Dinner at Mario's" required>
                </div>

                <div class="form-row">
                    <label class="form-label-light" for="expDate">Date</label>
                    <input type="date" id="expDate" class="glass-input-light" required>
                </div>

                <div class="form-row" style="position: relative;" id="countrySearchContainer">
                    <label class="form-label-light" for="expCountry">Country</label>
                    <div class="custom-select-wrapper">
                        <!-- WAI-ARIA combobox pattern (D3): role=combobox +
                             aria-autocomplete=list + aria-expanded + aria-
                             controls let screen readers announce that this
                             input has a popup of suggestions, and how many
                             are visible. The keyboard handler below toggles
                             aria-expanded + sets aria-activedescendant so
                             VoiceOver / NVDA / JAWS announce the active
                             option as the user arrows through them. -->
                        <input type="text" id="expCountry" class="glass-input-light"
                            placeholder="Search country..." autocomplete="off"
                            role="combobox" aria-autocomplete="list"
                            aria-expanded="false" aria-controls="countryDropdownList"
                            aria-haspopup="listbox">
                        <div id="countryDropdownList" class="custom-select-dropdown glass shadow-xl"
                            role="listbox" aria-label="Countries"
                            style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 250px; overflow-y: auto; margin-top: var(--space-2); border-radius: var(--radius-xl); border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${COUNTRIES.sort().map((c, i) => `<div class="dropdown-item" role="option" id="expCountryOpt-${i}" data-value="${c}">${c}</div>`).join('')}
                            <div class="dropdown-item" role="option" id="expCountryOpt-other" data-value="Other">Other</div>
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <label class="form-label-light" for="expValue">Value</label>
                    <input type="number" step="0.01" id="expValue" class="glass-input-light" style="font-weight: 700;" required>
                </div>

                <div class="form-row">
                    <label class="form-label-light" for="expCurrency">Currency</label>
                    <select id="expCurrency" class="glass-input-light" required>
                        <option value="">${t('expenses.currencyPlaceholder')}</option>
                        ${Object.keys(CONVERSION_RATES).map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>

                <!-- Receipt photo (post-Phase-C feature). Hidden file
                     input + styled trigger button for the glass form
                     aesthetic. Preview thumbnail with Remove + lightbox-
                     on-click — same UX shape as the Edit Trip cover
                     picker so users learn it once. -->
                <div class="form-row" style="margin-bottom: var(--space-8);">
                    <label class="form-label-light" for="expReceiptInput">Receipt <span style="font-weight: 500; color: rgba(0,0,0,0.55);">(optional)</span></label>
                    <input type="file" id="expReceiptInput" accept="image/*" style="display: none;">
                    <div style="display: flex; gap: var(--space-3); align-items: center; width: 100%; max-width: 440px; box-sizing: border-box;">
                        <button type="button" id="expReceiptPickBtn" class="btn-ghost" style="flex: 0 0 auto; padding: 10px 16px; font-size: 0.85rem; font-weight: 700; color: #002d5b; background: rgba(0,0,0,0.04); border: 1px solid rgba(0,0,0,0.08);">
                            📎 Attach receipt
                        </button>
                        <div id="expReceiptPreview" style="display: none; align-items: center; gap: var(--space-3);">
                            <img id="expReceiptThumb" src="" alt="Receipt preview" style="width: 48px; height: 48px; border-radius: 10px; object-fit: cover; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 4px 12px rgba(0,0,0,0.08); cursor: pointer;" title="Click to view full size">
                            <button type="button" id="expReceiptRemoveBtn" class="btn-ghost" style="padding: 10px 16px; min-height: var(--tap-min); font-size: 0.78rem; font-weight: 700; color: #ff3b30; background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.2); border-radius: 8px; cursor: pointer;">Remove</button>
                        </div>
                        <span id="expReceiptStatus" style="flex: 1; font-size: 0.75rem; color: rgba(0,0,0,0.5); font-weight: 600;"></span>
                    </div>
                </div>

                <div style="margin-bottom: 40px; background: rgba(0,0,0,0.03); padding: 32px; border-radius: 32px; border: 1px solid rgba(0,0,0,0.05); width: 100%; max-width: 440px; box-sizing: border-box;">
                    <label style="display: block; margin-bottom: 16px; font-size: 0.9rem; font-weight: 800; color: #000000; letter-spacing: -0.02em;">${t('expenses.splitBetween')}</label>
                    <div class="add-split-row" style="display: flex; gap: 14px; margin-bottom: 20px;">
                        <select id="addSplitSelect" class="glass-input" aria-label="Add a person to split the expense between" style="flex: 1; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.4); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" ${!hasTripCompanions ? 'disabled' : ''}>
                            <option value="">${hasTripCompanions ? t('expenses.addPersonToSplit') : t('expenses.noCompanionsYet')}</option>
                            ${tripCompanionNames.map(p => `<option value="${p}">${p}</option>`).join('')}
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
            navigate('home');
        });

        const form = (q(wrapper, '#expenseForm') as HTMLFormElement);
        const splitContainer = q(wrapper, '#splitContainer');
        const addSplitSelect = (q(wrapper, '#addSplitSelect') as HTMLSelectElement);
        const addSplitBtn = (q(wrapper, '#addSplitBtn') as HTMLButtonElement);

                let activeSplitters: string[] = [];

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
                        <button type="button" class="btn-x-bare remove-splitter" data-person="${p}" aria-label="Remove ${esc(p)}" style="font-weight:700; margin-left: var(--space-2);">&times;</button>
                    </div>
                </div>
            `).join('');

            splitContainer.querySelectorAll('.remove-splitter').forEach(btn => {
                (btn as HTMLButtonElement).onclick = () => {
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

        // Auto-suggest currency from country pick (see selectCountry below).
        // Flag flips to true the moment the user touches the currency
        // dropdown themselves, so the suggest can never overwrite an
        // explicit pick. Edit-mode (draft has an id) starts with the flag
        // already set — the existing currency on the expense is the user's
        // earlier choice and we don't want a country re-pick to clobber it.
        let currencyManuallyChosen = !!STATE.draftExpense?.id;

        // Populate from draft
        if (STATE.draftExpense) {
            const d = STATE.draftExpense;
            if (d.who) (q(wrapper, '#expWho') as HTMLSelectElement).value = d.who;
            if (d.categoryId) (q(wrapper, '#expCategory') as HTMLSelectElement).value = d.categoryId;
            if (d.label) (q(wrapper, '#expLabel') as HTMLInputElement).value = d.label;
            if (d.date) (q(wrapper, '#expDate') as HTMLInputElement).value = d.date;
            if (d.country) (q(wrapper, '#expCountry') as HTMLInputElement).value = d.country;
            if (d.value) (q(wrapper, '#expValue') as HTMLInputElement).value = String(d.value);
            if (d.currency) (q(wrapper, '#expCurrency') as HTMLSelectElement).value = d.currency;
        }

        // Manual-pick tracker: any change event on the currency dropdown
        // counts as the user committing to a choice. `change` (not `input`)
        // because `input` fires on programmatic value sets too in some
        // browsers, which would falsely trip the flag the first time we
        // suggest a currency from a country pick.
        const currencySelect = (q(wrapper, '#expCurrency') as HTMLSelectElement);
        currencySelect.addEventListener('change', () => {
            currencyManuallyChosen = true;
        });

        // ── Receipt picker wiring ───────────────────────────────────
        // Closure-mutable receiptUrl threads the picker's latest value
        // into the submit handler without a re-read. Pre-fills from
        // STATE.draftExpense.receiptUrl when editing an existing
        // expense (the openEditExpenseModal path copies it onto the
        // draft before navigating here).
        let receiptUrl: string | null = STATE.draftExpense?.receiptUrl || null;
        const receiptInput = (q(wrapper, '#expReceiptInput') as HTMLInputElement);
        const receiptPickBtn = (q(wrapper, '#expReceiptPickBtn') as HTMLButtonElement);
        const receiptPreview = (q(wrapper, '#expReceiptPreview') as HTMLDivElement);
        const receiptThumb = (q(wrapper, '#expReceiptThumb') as HTMLImageElement);
        const receiptRemoveBtn = (q(wrapper, '#expReceiptRemoveBtn') as HTMLButtonElement);
        const receiptStatus = q(wrapper, '#expReceiptStatus');

        const refreshReceiptUI = () => {
            if (receiptUrl) {
                receiptThumb.src = receiptUrl;
                receiptPreview.style.display = 'flex';
                receiptStatus.textContent = '';
            } else {
                receiptPreview.style.display = 'none';
            }
        };
        refreshReceiptUI();

        receiptPickBtn.onclick = () => receiptInput.click();
        receiptInput.onchange = async () => {
            const file = receiptInput.files?.[0];
            if (!file) return;
            receiptStatus.textContent = t('expenses.uploading');
            receiptPickBtn.disabled = true;
            try {
                const result = await uploadMedia(file);
                if (result?.url) {
                    receiptUrl = result.url;
                    STATE.draftExpense.receiptUrl = result.url;
                    refreshReceiptUI();
                    emit('state:changed');
                } else {
                    // Round 1 audit fix: surface the structured error
                    // message from uploadMedia (file too big, MIME wrong,
                    // network down) instead of a generic "Upload failed".
                    const msg = result?.error || t('expenses.uploadFailed');
                    receiptStatus.textContent = msg;
                    showLiquidAlert(msg);
                }
            } catch (e) {
                console.warn('receipt upload failed', e);
                const msg = t('expenses.uploadFailed');
                receiptStatus.textContent = msg;
                showLiquidAlert(msg);
            } finally {
                receiptPickBtn.disabled = false;
                // Reset so re-picking the same file still fires `change`.
                receiptInput.value = '';
            }
        };
        receiptRemoveBtn.onclick = () => {
            receiptUrl = null;
            STATE.draftExpense.receiptUrl = null;
            refreshReceiptUI();
            emit('state:changed');
        };
        // Click the thumb → open the receipt in a new tab as a quick
        // lightbox. Same pattern History rows use; keeps the editor
        // free of full-screen modal complexity for v1.
        receiptThumb.onclick = () => {
            if (receiptUrl) window.open(receiptUrl, '_blank', 'noopener');
        };

        // Live Save Draft
        form.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', (e) => {
                const t = (e.target as HTMLInputElement | HTMLSelectElement);
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

        // Custom Searchable Dropdown Logic.
        //
        // D3 a11y: this is a WAI-ARIA combobox (role=combobox on the input,
        // role=listbox on the popup, role=option on each item — all set in
        // the markup above). The handlers below keep the ARIA state in sync:
        //   - openList()  → sets aria-expanded=true  on the input
        //   - closeList() → sets aria-expanded=false on the input
        //   - setActive() → sets aria-activedescendant on the input to
        //                   the active option's id, so screen readers
        //                   announce the active option as it changes
        //                   without moving DOM focus off the input.
        // The visible list is controlled by `display: block/none` and a
        // visible `.is-active` class on the highlighted option (matching
        // how the original mouse hover styled active items).
        const countryInput = (q(wrapper, '#expCountry') as HTMLInputElement);
        const countryList = q(wrapper, '#countryDropdownList');
        const countryItems = (countryList.querySelectorAll('.dropdown-item') as NodeListOf<HTMLElement>);

        const openList = () => {
            countryList.style.display = 'block';
            countryInput.setAttribute('aria-expanded', 'true');
        };
        const closeList = () => {
            countryList.style.display = 'none';
            countryInput.setAttribute('aria-expanded', 'false');
            countryInput.removeAttribute('aria-activedescendant');
        };

        countryInput.onfocus = openList;

        countryInput.oninput = (e) => {
            const val = (e.target as HTMLInputElement).value.toLowerCase();
            countryItems.forEach(item => {
                const text = (item.textContent ?? '').toLowerCase();
                item.style.display = text.includes(val) ? 'block' : 'none';
            });
            openList();
        };

        const selectCountry = (item: HTMLElement) => {
            countryInput.value = item.getAttribute('data-value') ?? '';
            closeList();
            STATE.draftExpense.country = countryInput.value;

            // Auto-suggest currency from the picked country, but only
            // when the user hasn't already chosen a currency themselves
            // and only when the suggested code is one we actually
            // support in CONVERSION_RATES (so we never set a value that
            // isn't an option in the dropdown).
            if (!currencyManuallyChosen) {
                const suggested = COUNTRY_TO_CURRENCY[countryInput.value];
                if (suggested && CONVERSION_RATES[suggested] !== undefined) {
                    currencySelect.value = suggested;
                    STATE.draftExpense.currency = suggested;
                }
            }
            emit('state:changed');
        };

        countryItems.forEach(item => {
            item.onclick = (e) => {
                selectCountry(item);
                e.stopPropagation();
            };
        });

        // Keyboard navigation: ↓ ↑ to move the active highlight, Enter to
        // select, Escape to close. Skips items hidden by the search filter.
        // aria-activedescendant on the input points at the active option's
        // id so screen readers announce its label without moving focus.
        let activeIdx = -1;
        const visibleItems = (): HTMLElement[] =>
            Array.from(countryItems).filter(it => it.style.display !== 'none');
        const clearActive = () => {
            countryItems.forEach(it => it.classList.remove('is-active'));
            activeIdx = -1;
            countryInput.removeAttribute('aria-activedescendant');
        };
        const setActive = (idx: number) => {
            const items = visibleItems();
            if (items.length === 0) { clearActive(); return; }
            countryItems.forEach(it => it.classList.remove('is-active'));
            activeIdx = ((idx % items.length) + items.length) % items.length;
            const cur = items[activeIdx];
            if (!cur) return;
            cur.classList.add('is-active');
            cur.scrollIntoView({ block: 'nearest' });
            const id = cur.getAttribute('id');
            if (id) countryInput.setAttribute('aria-activedescendant', id);
        };
        countryInput.addEventListener('keydown', (e) => {
            if (countryList.style.display === 'none') {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    openList();
                }
            }
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); return; }
            if (e.key === 'Home') { e.preventDefault(); setActive(0); return; }
            if (e.key === 'End') { e.preventDefault(); setActive(visibleItems().length - 1); return; }
            if (e.key === 'Enter') {
                const items = visibleItems();
                const cur = activeIdx >= 0 ? items[activeIdx] : undefined;
                if (cur) {
                    e.preventDefault();
                    selectCountry(cur);
                    clearActive();
                }
                return;
            }
            if (e.key === 'Escape') {
                closeList();
                clearActive();
                return;
            }
            if (e.key === 'Tab') {
                // Don't trap Tab — let it move focus naturally and
                // close the list as a side effect (also matches the
                // WAI-ARIA combobox pattern).
                closeList();
                clearActive();
                return;
            }
        });
        // Reset highlight when the user types — the visible-items set changes.
        countryInput.addEventListener('input', clearActive);

        // Click outside to close
        document.addEventListener('click', (e) => {
            const target = (e.target as Node | null);
            const container = wrapper.querySelector('#countrySearchContainer');
            if (!target || !container || !container.contains(target)) {
                closeList();
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!STATE.activeTripId) return;
            const tripId = STATE.activeTripId;

            const payer = (q(wrapper, '#expWho') as HTMLSelectElement).value;
                        const splits: Record<string, number> = {};
            let totalSplit = 0;

            const splitInputs = (wrapper.querySelectorAll('.split-input') as NodeListOf<HTMLInputElement>);
            if (splitInputs.length > 0) {
                splitInputs.forEach(input => {
                    const val = parseFloat(input.value) || 0;
                    const person = input.getAttribute('data-person');
                    if (person) splits[person] = val;
                    totalSplit += val;
                });

                if (Math.abs(totalSplit - 100) > 0.5) {
                    // Round 6 audit fix — use the app's toast helper instead
                    // of native alert() for visual consistency with the rest
                    // of the validation flow. i18n session 1: pipe through t().
                    showLiquidAlert(t('validation.percentagesMustSum'));
                    return;
                }
            } else {
                splits[payer] = 100;
            }

            const val = parseFloat((q(wrapper, '#expValue') as HTMLInputElement).value);
            const curr = (q(wrapper, '#expCurrency') as HTMLSelectElement).value.toUpperCase();

            if (isNaN(val) || val <= 0) {
                showLiquidAlert(t('validation.invalidExpenseValue'));
                return;
            }
            if (!curr) {
                showLiquidAlert(t('validation.currencyRequired'));
                return;
            }

            const activeTrip = STATE.trips.find(t => t.id === tripId);
            const countryVal = (q(wrapper, '#expCountry') as HTMLInputElement).value || (activeTrip ? activeTrip.country : '');

            const isEdit = !!STATE.draftExpense?.id;
            /** @type {import('../types').Expense} */
            const expense = {
                id: isEdit && STATE.draftExpense.id ? STATE.draftExpense.id : generateId(),
                tripId,
                who: payer,
                categoryId: (q(wrapper, '#expCategory') as HTMLSelectElement).value,
                label: (q(wrapper, '#expLabel') as HTMLInputElement).value,
                date: (q(wrapper, '#expDate') as HTMLInputElement).value,
                country: countryVal,
                value: val,
                currency: curr,
                euroValue: val * (CONVERSION_RATES[curr] || 1),
                splits: splits,
                // Receipt is opt-in — write whatever the picker last
                // produced (URL on upload, null on Remove, unchanged-
                // from-load if the user didn't touch it).
                receiptUrl: receiptUrl,
            };

            if (isEdit) {
                const idx = STATE.expenses.findIndex(e => e.id === expense.id);
                if (idx !== -1) STATE.expenses[idx] = expense;
                else STATE.expenses.push(expense);
            } else {
                STATE.expenses.push(expense);
            }

            STATE.draftExpense = { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR', euroValue: '', receiptUrl: null };

            emit('state:changed');
            upsertExpense(expense);

            const status = q(wrapper, '#manualSaveStatus');
            status.textContent = isEdit ? '✓ Expense updated — view in History' : '✓ Expense saved — view in History';
            status.style.color = '#34c759';
            setTimeout(() => { status.textContent = ''; }, 4000);

            form.reset();
            activeSplitters = [];
            updateSplitUI();
            // Clear the receipt picker too — form.reset() doesn't
            // touch our closure-captured `receiptUrl` since the
            // preview is driven by JS state, not the form's reset.
            receiptUrl = null;
            refreshReceiptUI();
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
    const tripCompanionNames = (activeTrip?.companions ?? []).map(c => c.name);
    const tripPayers = tripCompanionNames.length > 0
        ? tripCompanionNames
        : Array.from(new Set(
            STATE.expenses
                .filter(e => e.tripId === STATE.activeTripId)
                .map(e => e.who)
                .filter(Boolean)
        ));

    // Show "Undo last batch" only when the most recent bulk import is
    // for the trip currently being viewed. Single-batch undo is enough
    // — multi-step undo would require schema work for cross-device persistence.
    const undoBatch = STATE.lastImportBatch;
    const canUndoBatch = !!(undoBatch
        && undoBatch.tripId === STATE.activeTripId
        && Array.isArray(undoBatch.expenseIds)
        && undoBatch.expenseIds.length > 0);

    wrapper.innerHTML = `
        <div id="expensesContainer" style="max-width: 1000px; margin: 0 auto; width: 100%; margin-bottom: 60px;">
            <div style="margin-bottom: 40px; padding: 0 10px;">
                <div class="card glass" style="padding: 32px; border-radius: 32px; background: linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1)); border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                        <h2 style="font-size: 1.8rem; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${t('expenses.historyTitle')}</h2>
                        <div style="display: flex; gap: 8px;">
                            ${canUndoBatch ? `<button id="undoLastBatchBtn" class="btn-chip-danger" title="Remove the ${undoBatch.expenseIds.length} expenses just imported">↶ ${t('expenses.undoBatchBtn')} (${undoBatch.expenseIds.length})</button>` : ''}
                            <button id="clearFiltersBtn" class="btn-chip-danger">Clear Filters</button>
                            <span style="font-size: 0.75rem; font-weight: 700; color: #005bb8; background: rgba(0,113,227,0.1); padding: 6px 14px; border-radius: 100px; text-transform: uppercase;">${t('expenses.smartFiltersBadge')}</span>
                        </div>
                    </div>

                    <div class="expense-history-filters">
                        <!-- Row 1: Search (full width) -->
                        <div style="grid-column: 1 / -1;">
                            <label class="filter-label">Search</label>
                            <input type="text" id="filterSearch" class="filter-input" placeholder="Search labels or items...">
                        </div>

                        <!-- Row 2: Category | Payer | Sort -->
                        <div>
                            <label class="filter-label">Category</label>
                            <select id="filterCategory" class="filter-input">
                                <option value="all">${t('expenses.filterAllCategories')}</option>
                                ${STATE.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
                                <option value="settlement">🤝 Settlement</option>
                            </select>
                        </div>
                        <div>
                            <label class="filter-label">Payer</label>
                            <select id="filterWho" class="filter-input">
                                <option value="all">${t('expenses.filterEveryone')}</option>
                                ${tripPayers.map(p => `<option value="${p}">${p}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="filter-label">Sort By</label>
                            <select id="filterSort" class="filter-input">
                                <option value="date_desc">${t('expenses.sortNewestFirst')}</option>
                                <option value="date_asc">${t('expenses.sortOldestFirst')}</option>
                                <option value="value_desc">${t('expenses.sortHighestAmount')}</option>
                                <option value="value_asc">${t('expenses.sortLowestAmount')}</option>
                                <option value="label_asc">${t('expenses.sortLabelAZ')}</option>
                                <option value="who_asc">${t('expenses.sortPayerAZ')}</option>
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

    // Delegated handler for per-row edit/delete/receipt in
    // #tripExpensesList — one listener on wrapper since rows are
    // re-rendered by renderTripExpenses() (rebinding a per-row
    // listener on every keystroke filter change would leak).
    wrapper.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement | null);
        if (!target) return;
        const editBtn = (target.closest('.expense-edit-btn') as HTMLElement | null);
        if (editBtn?.dataset.expenseId) { openEditExpenseModal(editBtn.dataset.expenseId); return; }
        const delBtn = (target.closest('.expense-delete-btn') as HTMLElement | null);
        if (delBtn?.dataset.expenseId) { deleteExpense(delBtn.dataset.expenseId); return; }
        // Receipt button → open the receipt URL in a new tab. Native
        // image viewer is the lightbox for v1; matches the expense-
        // form preview's click-to-view behavior so users learn it
        // once. A proper in-app modal lightbox can come later.
        const recBtn = (target.closest('.expense-receipt-btn') as HTMLElement | null);
        if (recBtn?.dataset.receiptUrl) {
            window.open(recBtn.dataset.receiptUrl, '_blank', 'noopener');
            return;
        }
    });

    setTimeout(() => {
        const filterExps = () => {
            const search = (q(wrapper, '#filterSearch') as HTMLInputElement).value.toLowerCase();
            const catId = (q(wrapper, '#filterCategory') as HTMLSelectElement).value;
            const who = (q(wrapper, '#filterWho') as HTMLSelectElement).value;
            const dateFrom = (q(wrapper, '#filterDateFrom') as HTMLInputElement).value;
            const dateTo = (q(wrapper, '#filterDateTo') as HTMLInputElement).value;
            const minVal = parseFloat((q(wrapper, '#filterMinVal') as HTMLInputElement).value) || 0;
            const maxVal = parseFloat((q(wrapper, '#filterMaxVal') as HTMLInputElement).value) || Infinity;
            const sort = (q(wrapper, '#filterSort') as HTMLSelectElement).value;

            renderTripExpenses(q(wrapper, '#tripExpensesList'), {
                search, catId, who, dateFrom, dateTo, minVal, maxVal, sort
            });
        };

        (q(wrapper, '#filterSearch') as HTMLInputElement).oninput = filterExps;
        (q(wrapper, '#filterCategory') as HTMLSelectElement).onchange = filterExps;
        (q(wrapper, '#filterWho') as HTMLSelectElement).onchange = filterExps;
        (q(wrapper, '#filterSort') as HTMLSelectElement).onchange = filterExps;
        (q(wrapper, '#filterDateFrom') as HTMLInputElement).onchange = filterExps;
        (q(wrapper, '#filterDateTo') as HTMLInputElement).onchange = filterExps;
        (q(wrapper, '#filterMinVal') as HTMLInputElement).oninput = filterExps;
        (q(wrapper, '#filterMaxVal') as HTMLInputElement).oninput = filterExps;

        (q(wrapper, '#clearFiltersBtn') as HTMLButtonElement).onclick = () => {
            (q(wrapper, '#filterSearch') as HTMLInputElement).value = '';
            (q(wrapper, '#filterCategory') as HTMLSelectElement).value = 'all';
            (q(wrapper, '#filterWho') as HTMLSelectElement).value = 'all';
            (q(wrapper, '#filterSort') as HTMLSelectElement).value = 'date_desc';
            (q(wrapper, '#filterDateFrom') as HTMLInputElement).value = '';
            (q(wrapper, '#filterDateTo') as HTMLInputElement).value = '';
            (q(wrapper, '#filterMinVal') as HTMLInputElement).value = '';
            (q(wrapper, '#filterMaxVal') as HTMLInputElement).value = '';
            renderTripExpenses(q(wrapper, '#tripExpensesList'));
        };

        const undoBtn = wrapper.querySelector('#undoLastBatchBtn');
        if (undoBtn) {
            (undoBtn as HTMLButtonElement).onclick = () => {
                const batch = STATE.lastImportBatch;
                if (!batch || !Array.isArray(batch.expenseIds) || batch.expenseIds.length === 0) return;
                showConfirmModal({
                    title: t('expenses.undoBatchTitle'),
                    // i18n session 4: closed the loose end with a plural
                    // tn() form. one/other branches stay grammatical in
                    // every locale.
                    message: tn('expenses.undoBatchMessage', batch.expenseIds.length),
                    confirmText: t('expenses.undoBatchBtn'),
                    onConfirm: () => {
                        const ids = new Set(batch.expenseIds);
                        STATE.expenses = STATE.expenses.filter(e => !ids.has(e.id));
                        STATE.lastImportBatch = null;
                        emit('state:changed');
                        // Server delta: each expense gets its own DELETE.
                        // Fire-and-forget; the local state already reflects
                        // the removal so a slow server doesn't block the UI.
                        ids.forEach(id => deleteExpenseOnServer(id));
                        navigate('expenses');
                    },
                });
            };
        }

        renderTripExpenses(q(wrapper, '#tripExpensesList'));
    }, 0);

    return wrapper;
}

interface ExpensesFilters {
    search?: string;
    catId?: string;
    who?: string;
    dateFrom?: string;
    dateTo?: string;
    minVal?: number;
    maxVal?: number;
    sort?: string;
}
export function renderTripExpenses(container: HTMLElement, filters: ExpensesFilters = {}) {
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

    function formatAppleDate(dateStr: string | null | undefined): string {
        if (!dateStr) return t('expenses.globalGroup');
        // DD-MM-YYYY everywhere the user reads a date. Storage stays ISO
        // YYYY-MM-DD (only the rendering changes).
        const date = new Date(dateStr + 'T00:00:00Z');
        if (isNaN(date.getTime())) return t('expenses.globalGroup');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = date.getUTCFullYear();
        return `${dd}-${mm}-${yyyy}`;
    }

    if (tripExpenses.length === 0) {
        // Round 3 audit fix: was a custom dark-glass card with white-
        // on-white-translucent text (legible only in dark mode); now
        // uses the shared empty-card so it matches Todo / Friends /
        // Insights / Search / Feed in both themes. Orange accent
        // matches the Expenses page's brand colour.
        container.innerHTML = buildEmptyCardHtml({
            accent: 'orange',
            emoji: '💸',
            title: t('expenses.noExpensesYet'),
            // Body left in English for this round — the empty-state is
            // visible only when there are no expenses, lower priority
            // than the always-visible page title / filters / buttons.
            body: 'Add your first expense above — split with companions, attach a receipt, and the totals will roll up here.',
        });
        return;
    }

    const homeCurrency = getHomeCurrency();
    // Edit/delete row buttons are planner-only — hide for relaxers so the
    // History tab reads as a clean read-only ledger when they don't have
    // edit rights. Backend already 403s on the underlying endpoints; this
    // is just to keep the UI honest.
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
    const showRowActions = canEditExpenses(activeTrip);
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
                    ${e.receiptUrl ? `
                    <button class="icon-action-btn expense-receipt-btn" data-receipt-url="${esc(e.receiptUrl)}" aria-label="View receipt" title="View receipt" style="--accent: 138,86,190;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                    </button>
                    ` : ''}
                    <div style="text-align: right;">
                        <div class="expense-row__amount">${e.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span class="expense-row__currency">${esc(e.currency)}</span></div>
                        ${convertedDisplay ? `<div class="expense-row__converted">${convertedDisplay}</div>` : ''}
                    </div>

                    ${showRowActions ? `
                    <div style="display: flex; gap: var(--space-2);">
                        <button class="icon-action-btn expense-edit-btn" data-expense-id="${e.id}" aria-label="Edit expense" style="--accent: 0,113,227;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button class="icon-action-btn expense-delete-btn" data-expense-id="${e.id}" aria-label="Delete expense" style="--accent: 255,59,48;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}
