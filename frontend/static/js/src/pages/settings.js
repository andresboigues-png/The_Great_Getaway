// @ts-check
import { STATE, emit } from '../state.js';
import { generateId, showConfirmModal, q, esc } from '../utils.js';
import { syncCategories, apiFetch } from '../api.js';
import { navigate } from '../router.js';
import { showModal } from '../components/Modal.js';
import { POI_CATEGORIES } from './home.js';

export const showSettingsTab = (tab) => {
    const tabs = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.settings-tab-btn'));
    const sections = document.querySelectorAll('.settings-section');

    tabs.forEach(t => t.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));

    const activeTab = Array.from(tabs).find(t => t.innerText.toLowerCase().includes(tab.toLowerCase()));
    if (activeTab) activeTab.classList.add('active');

    const activeSection = document.getElementById(`settings-${tab}`);
    if (activeSection) activeSection.classList.add('active');
};

// Exported because home.js (guide actions) and expenses.js (Add Companions
// helper) reach in here to switch the personalization tab after navigating.
// The Companions sub-tab was removed when companions became per-trip;
// `tab === 'companions'` is treated as 'categories' so legacy callers
// don't break.
export const showPersTab = (tab) => {
    const menu = document.getElementById('persMenu');
    const content = document.getElementById('persContent');
    const catSection = document.getElementById('persCategories');

    if (tab === 'menu') {
        if (menu) menu.style.display = 'grid';
        if (content) content.style.display = 'none';
    } else {
        if (menu) menu.style.display = 'none';
        if (content) content.style.display = 'block';
        if (catSection) catSection.style.display = 'block';
    }
};

const deleteCategory = (id) => {
    showConfirmModal({
        title: "Delete Category?",
        message: "This will not affect existing expenses, but you won't be able to select this category again.",
        confirmText: "Delete",
        onConfirm: () => {
            STATE.categories = STATE.categories.filter(c => c.id !== id);
            emit('state:changed');
            syncCategories(); // Delta: sync categories to server
            navigate('personalization');
            setTimeout(() => showPersTab('categories'), 50);
        }
    });
};

// The companion-management helpers (cancelCompanionLink,
// confirmUnlinkCompanion, deleteCompanion) used to live here when
// companions were account-level. With the per-trip refactor they're gone
// — managing companions happens inside the trip's companion picker now.

export function renderSettings() {
    const div = document.createElement('div');

    function renderMappingContent() {
        // 'category' is mandatory: without it every imported expense lands
        // in the default category. The matching path in upload.js does
        // find-or-create on the cell value, so users can either reuse an
        // existing category or auto-create a new one just by filling the
        // column — but the column itself has to be mapped. Old saved
        // formats use 'categoryId' as the variable name; the upload reader
        // accepts both for back-compat.
        const MANDATORY = ['label', 'date', 'value', 'who', 'category'];
        // 'splits' takes a free-text cell like "Alice:50,Bob:50" (percentages).
        // Empty/unmapped → 100% paid by `who` (no debt). 'isSettlement' takes
        // Y/N to flag a row as a transfer rather than a real expense — when Y,
        // the receiver is read from the splits cell.
        const OPTIONAL = ['country', 'currency', 'splits', 'isSettlement'];
        const used = new Set((STATE.customFormat || []).map(m => m.variable));
        const sf = STATE.savedFormats || [];

        return `
            <div style="display:flex; flex-wrap:wrap; gap:var(--space-2); margin-bottom:var(--space-6);">
                ${MANDATORY.map(v => {
            const done = used.has(v);
            return `<span class="status-chip${done ? ' is-done' : ''}">
                        ${done ? '✓' : '★'} ${v.toUpperCase()}
                    </span>`;
        }).join('')}
            </div>

            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: var(--radius-xl); overflow: hidden; margin-bottom: var(--space-6);">
                <table class="mapping-table">
                    <thead>
                        <tr>
                            <th class="is-left">Variable</th>
                            <th class="is-left">Excel Column</th>
                            <th class="is-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(STATE.customFormat || []).length === 0 ? '<tr><td class="empty-cell" colspan="3">No mappings yet.</td></tr>' : (STATE.customFormat || []).map(m => `
                            <tr>
                                <td style="font-weight:700;">${m.variable}</td>
                                <td><span class="col-tag">${m.column}</span></td>
                                <td class="is-center">
                                    <button class="icon-x-btn remove-mapping-btn" data-variable="${m.variable}">&times;</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div style="display:flex; gap:var(--space-4); align-items:flex-end; flex-wrap:wrap; margin-bottom:var(--space-8);">
                <div style="flex:1; min-width:150px;">
                    <label class="compact-form-label" style="font-size:var(--font-xs); font-weight:800; color:var(--text-secondary);">VARIABLE</label>
                    <select id="mapVarSelect" class="glass-input" style="width:100%;">
                        <option value="">Select...</option>
                        ${MANDATORY.concat(OPTIONAL).filter(v => !used.has(v)).map(v => `<option value="${v}">${MANDATORY.includes(v) ? '★ ' : ''}${v}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1; min-width:120px;">
                    <label class="compact-form-label" style="font-size:var(--font-xs); font-weight:800; color:var(--text-secondary);">COLUMN</label>
                    <select id="mapColSelect" class="glass-input" style="width:100%;">
                        <option value="">Col...</option>
                        ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <button class="btn btn-liquid-glass" id="addFormatMappingBtn" style="padding: var(--space-3) var(--space-6);">Map Field</button>
            </div>

            <div style="border-top: 1px solid var(--glass-border); padding-top: var(--space-8);">
                <h3 style="margin-top:0;">Saved Formats (${sf.length}/5)</h3>
                <div style="display:grid; gap:var(--space-3);">
                    ${sf.map(f => `
                        <div class="saved-format-row">
                            <div style="font-weight:700;">${f.name}</div>
                            <div style="display:flex; gap:var(--space-2);">
                                <button class="themed-block-btn themed-block-btn--sm edit-saved-format-btn" data-format-id="${f.id}" style="--accent: 0,113,227;">Edit</button>
                                <button class="themed-block-btn themed-block-btn--sm delete-saved-format-btn" data-format-id="${f.id}" style="--accent: 255,59,48;">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                    ${sf.length < 5 ? `
                        <div style="display:flex; gap:var(--space-3); margin-top:var(--space-3);">
                            <input type="text" id="formatNameInput" class="glass-input" placeholder="Name this format..." style="flex:1;">
                            <button class="btn-primary" id="saveCustomFormatBtn">Save Format</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    const buildSettingsUI = (activeTab = 'menu') => {
        const isMenu = activeTab === 'menu';
        const isReset = activeTab === 'reset';
        const isFormat = activeTab === 'format';
        const isGeneral = activeTab === 'general';

        return `
            <div class="ai-page-header">
                <h1 class="gradient-text" style="--g-from: #1a6b3c; --g-to: #34c759;">System Control</h1>
                <p>Manage your travel data, custom formats, and core preferences.</p>
            </div>

            ${isMenu ? `
                <div class="settings-grid">
                    <button type="button" class="card-button-reset card glass management-card settings-tab-card" data-tab="general">
                        <h2 class="card-title" style="color: var(--accent-blue); margin: 0;">General Settings</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Customise per-pill filters for the home map (minimum rating, etc.).</p>
                        <div style="margin-top: 20px; color: var(--accent-blue); font-weight: 700; font-size: 0.85rem;">Configure &rarr;</div>
                    </button>

                    <button type="button" class="card-button-reset card glass management-card settings-tab-card" data-tab="format">
                        <h2 class="card-title" style="color: #ff9500; margin: 0;">Format Options</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Configure Excel import mappings and global data formats.</p>
                        <div style="margin-top: 20px; color: #ff9500; font-weight: 700; font-size: 0.85rem;">Configure &rarr;</div>
                    </button>

                    <button type="button" class="card-button-reset card glass management-card danger-card settings-tab-card" data-tab="reset">
                        <div class="danger-glow pulse-red"></div>
                        <h2 class="card-title" style="color: #ff3b30; margin: 0;">Data Management</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Wipe specific data categories or perform a factory reset.</p>
                        <div style="margin-top: 20px; color: #ff3b30; font-weight: 700; font-size: 0.85rem;">Manage Data &rarr;</div>
                    </button>
                </div>
            ` : `
                <button class="btn btn-small btn-liquid-glass settings-tab-card" data-tab="menu" style="margin-bottom: 24px; padding: 10px 20px; border-radius: 14px;">&larr; Back to Control Center</button>

                ${isGeneral ? (() => {
                    const filters = STATE.preferences?.poiFilters || {};
                    const ratingOptions = [0, 3, 3.5, 4, 4.5];
                    const rows = POI_CATEGORIES
                        // Roads & traffic isn't a Places-API pill, no
                        // rating filter applies to it.
                        .filter(c => c.placesType)
                        .map(c => {
                            const userMin = typeof filters[c.key]?.minRating === 'number'
                                ? filters[c.key].minRating
                                : c.defaultMinRating;
                            const opts = ratingOptions.map(v => `
                                <option value="${v}" ${v === userMin ? 'selected' : ''}>${v === 0 ? 'Any rating' : `${v}★ +`}</option>
                            `).join('');
                            const isCustom = userMin !== c.defaultMinRating;
                            return `
                                <div class="poi-filter-row">
                                    <span class="poi-filter-row__icon">${c.icon}</span>
                                    <div class="poi-filter-row__body">
                                        <div class="poi-filter-row__label">${esc(c.label)}</div>
                                        <div class="poi-filter-row__hint">${esc(c.tooltip)}</div>
                                    </div>
                                    <select class="poi-filter-rating" data-poi="${c.key}" aria-label="Minimum rating for ${esc(c.label)}">
                                        ${opts}
                                    </select>
                                    <span class="poi-filter-row__default" title="Default for this category: ${c.defaultMinRating === 0 ? 'Any rating' : `${c.defaultMinRating}★ +`}">
                                        ${isCustom ? '<button type="button" class="poi-filter-reset" data-poi="' + c.key + '" title="Reset to default">Reset</button>' : '<span class="muted">Default</span>'}
                                    </span>
                                </div>
                            `;
                        }).join('');
                    return `
                        <div class="card glass" style="padding: 32px; border-radius: 28px;">
                            <h2 style="color: var(--accent-blue); margin-top: 0;">Map pill filters</h2>
                            <p style="color: var(--text-secondary); margin-bottom: 24px;">Set the minimum rating for each Places-API pill. The home map's pin search applies this floor to results — a 4★+ filter on Restaurants hides everything below 4 stars. Restaurants and Hotels default to 4★+ (because rating is a meaningful quality signal there); the rest default to "Any rating" so you don't accidentally hide a real-but-unrated supermarket or hospital.</p>
                            <div class="poi-filter-list">
                                ${rows}
                            </div>
                            <p style="color: var(--text-secondary); margin: 24px 0 0; font-size: 0.85rem;">Changes take effect the next time you toggle a pill on (or click the same pill twice to refresh).</p>
                        </div>
                    `;
                })() : ''}

                ${isReset ? `
                    <div class="settings-grid">
                        <div class="card glass" style="padding: var(--space-6);">
                            <h3 style="color: #ff9500; margin-top: 0;">Trips & Days</h3>
                            <p class="muted-meta">Remove all trips, itineraries, and daily logs.</p>
                            <button class="themed-block-btn confirm-reset-btn" data-reset-type="trips" style="--accent: 255,149,0;">Delete All Trips</button>
                        </div>
                        <div class="card glass" style="padding: var(--space-6);">
                            <h3 style="color: #5856d6; margin-top: 0;">Categories</h3>
                            <p class="muted-meta">Reset custom expense categories to defaults.</p>
                            <button class="themed-block-btn confirm-reset-btn" data-reset-type="categories" style="--accent: 88,86,214;">Restore Defaults</button>
                        </div>
                        <div class="card glass danger-card" style="padding: var(--space-6); border-color: rgba(255, 59, 48, 0.3);">
                            <h3 style="color: #ff3b30; margin-top: 0;">Factory Reset</h3>
                            <p class="muted-meta">Permanently wipe every trace of data from the app.</p>
                            <button class="btn-confirm-danger confirm-reset-btn" data-reset-type="app" style="font-size: var(--font-sm); padding: var(--space-3);">Erase Everything</button>
                        </div>
                    </div>
                ` : ''}

                ${isFormat ? `
                    <div class="card glass" style="padding: 32px; border-radius: 28px;">
                        <h2 style="color: #ff9500; margin-top: 0;">Custom Excel Mapping</h2>
                        <p style="color: var(--text-secondary); margin-bottom: 24px;">Define how internal app fields map to Excel columns for seamless imports.</p>
                        
                        <div id="mappingTableContainer">
                            ${renderMappingContent()}
                        </div>
                    </div>
                ` : ''}
            `}
        `;
    };

    const switchSettingsTab = (tab) => {
        div.innerHTML = buildSettingsUI(tab);
    };

    const confirmReset = (type) => {
        const configs = {
            trips: {
                title: "Wipe All Trips?",
                message: "This permanently deletes every trip, day log, and itinerary.",
                confirmText: "Delete Trips",
                onConfirm: async () => {
                    STATE.trips = []; STATE.archivedTrips = []; STATE.tripDays = []; STATE.expenses = []; STATE.budgets = []; STATE.activeTripId = null;
                    emit('state:changed');
                    // Also wipe trips from server
                    if (STATE.user) {
                        try {
                            await apiFetch('/api/user-data', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({})
                            });
                        } catch(e) { console.error('Server wipe failed', e); }
                    }
                    switchSettingsTab('reset');
                }
            },
            categories: {
                title: "Reset Categories?",
                message: "Reverts all expense categories to the system defaults.",
                confirmText: "Restore Defaults",
                onConfirm: () => {
                    STATE.categories = [
                        { id: 'c1', name: 'Food', icon: '🍔', color: '#ff3b30' },
                        { id: 'c2', name: 'Transport', icon: '✈️', color: '#007aff' },
                        { id: 'c3', name: 'Accommodation', icon: '🏨', color: '#5856d6' }
                    ];
                    emit('state:changed');
                    syncCategories(); // Delta: sync reset categories
                    switchSettingsTab('reset');
                }
            },
            app: {
                title: "Factory Reset",
                message: "Absolute destruction. This wipes EVERY bit of data from the application.",
                confirmText: "ERASE EVERYTHING",
                onConfirm: async () => {
                    // Wipe server data first if logged in
                    if (STATE.user) {
                        try {
                            await apiFetch('/api/user-data', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({})
                            });
                        } catch(e) { console.error('Server wipe failed', e); }
                    }
                    STATE.trips = []; STATE.archivedTrips = []; STATE.tripDays = []; STATE.expenses = []; STATE.budgets = []; STATE.categories = []; STATE.activeTripId = null; STATE.user = null; STATE.notifications = []; STATE.hasLoggedInBefore = false;
                    emit('state:changed');
                    localStorage.clear();
                    location.reload();
                }
            }
        };
        showConfirmModal(configs[type]);
    };

    const addFormatMapping = () => {
        const variable = /** @type {HTMLSelectElement | null} */ (document.getElementById('mapVarSelect'))?.value;
        const column = /** @type {HTMLSelectElement | null} */ (document.getElementById('mapColSelect'))?.value;
        if (!variable || !column) return;
        STATE.customFormat = STATE.customFormat || [];
        if (STATE.customFormat.some(m => m.variable === variable)) return;
        STATE.customFormat.push({ variable, column });
        emit('state:changed');
        switchSettingsTab('format');
    };

    const removeFormatMapping = (variable) => {
        STATE.customFormat = (STATE.customFormat || []).filter(m => m.variable !== variable);
        emit('state:changed');
        switchSettingsTab('format');
    };

    const saveCustomFormat = () => {
        // Keep this in sync with the MANDATORY list in renderMappingContent.
        // We accept legacy 'categoryId' as a synonym for 'category' so users
        // who saved a format before the rename don't get blocked from saving.
        const MANDATORY = ['label', 'date', 'value', 'who', 'category'];
        const fmt = STATE.customFormat || [];
        const mapped = new Set(fmt.map(m => m.variable === 'categoryId' ? 'category' : m.variable));
        const missing = MANDATORY.filter(v => !mapped.has(v));
        if (missing.length > 0) return alert(`Missing required fields: ${missing.join(', ')}`);
        const name = (/** @type {HTMLInputElement | null} */ (document.getElementById('formatNameInput'))?.value || '').trim();
        if (!name) return;
        STATE.savedFormats = STATE.savedFormats || [];
        STATE.savedFormats.push({ id: generateId(), name, mappings: [...fmt] });
        STATE.customFormat = [];
        emit('state:changed');
        switchSettingsTab('format');
    };

    const deleteSavedFormat = (id) => {
        showConfirmModal({
            title: "Delete Format?",
            message: "This mapping will no longer be available for imports.",
            confirmText: "Delete",
            onConfirm: () => {
                STATE.savedFormats = (STATE.savedFormats || []).filter(f => f.id !== id);
                emit('state:changed');
                switchSettingsTab('format');
            }
        });
    };

    const editSavedFormat = (id) => {
        const format = (STATE.savedFormats || []).find(f => f.id === id);
        if (!format) return;
        // Load the saved format's mappings into the active editor
        STATE.customFormat = [...format.mappings];
        // Remove it from saved so the user can re-save it with a new name or overwrite
        STATE.savedFormats = (STATE.savedFormats || []).filter(f => f.id !== id);
        emit('state:changed');
        switchSettingsTab('format');
        // Pre-fill the name input after tab renders
        setTimeout(() => {
            const nameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('formatNameInput'));
            if (nameInput) nameInput.value = format.name;
        }, 50);
    };

    div.innerHTML = buildSettingsUI('menu');

    // Delegated handler — listener attached on div once; switchSettingsTab
    // rewrites div.innerHTML on every tab change, so per-element listeners
    // would die. Delegation on div survives.
    div.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;

        const tabCard = /** @type {HTMLElement | null} */ (target.closest('.settings-tab-card'));
        if (tabCard?.dataset.tab) { switchSettingsTab(tabCard.dataset.tab); return; }

        // POI default-pill checkbox is handled via the change listener
        // below, not here — clicks bubble up but the toggle's actual
        // state change is what we react to.

        const resetBtn = /** @type {HTMLElement | null} */ (target.closest('.confirm-reset-btn'));
        if (resetBtn?.dataset.resetType) { confirmReset(resetBtn.dataset.resetType); return; }

        const removeMappingBtn = /** @type {HTMLElement | null} */ (target.closest('.remove-mapping-btn'));
        if (removeMappingBtn?.dataset.variable) { removeFormatMapping(removeMappingBtn.dataset.variable); return; }

        const editFormatBtn = /** @type {HTMLElement | null} */ (target.closest('.edit-saved-format-btn'));
        if (editFormatBtn?.dataset.formatId) { editSavedFormat(editFormatBtn.dataset.formatId); return; }

        const delFormatBtn = /** @type {HTMLElement | null} */ (target.closest('.delete-saved-format-btn'));
        if (delFormatBtn?.dataset.formatId) { deleteSavedFormat(delFormatBtn.dataset.formatId); return; }

        if (target.closest('#addFormatMappingBtn')) { addFormatMapping(); return; }
        if (target.closest('#saveCustomFormatBtn')) { saveCustomFormat(); return; }

        // POI filter: reset one category back to its default min rating.
        const resetPoiBtn = /** @type {HTMLElement | null} */ (target.closest('.poi-filter-reset'));
        if (resetPoiBtn?.dataset.poi) {
            ensurePoiFilters();
            delete STATE.preferences.poiFilters[resetPoiBtn.dataset.poi];
            emit('state:changed');
            switchSettingsTab('general'); // re-render so the row reflects the reset
            return;
        }
    });

    // POI filter rating dropdown — change listener so picking a new
    // floor saves immediately. Delegated for the same reason as click:
    // div.innerHTML is rewritten on tab switch, so per-element listeners
    // would die.
    div.addEventListener('change', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        const sel = target?.closest('.poi-filter-rating');
        if (!sel) return;
        const key = /** @type {HTMLElement} */ (sel).dataset.poi;
        if (!key) return;
        const value = parseFloat(/** @type {HTMLSelectElement} */ (sel).value);
        ensurePoiFilters();
        STATE.preferences.poiFilters[key] = { minRating: value };
        emit('state:changed');
        // Re-render so the "Default / Reset" indicator on the right
        // flips to "Reset" (or back to "Default" if they re-pick the
        // category's own default).
        switchSettingsTab('general');
    });

    /** Defensive: STATE.preferences and .poiFilters should already exist
     *  via loadState's backfill, but this protects against a corrupt
     *  / hand-edited localStorage that bypasses validateLoadedState. */
    function ensurePoiFilters() {
        if (!STATE.preferences) {
            STATE.preferences = { mapDefaultPois: ['sights', 'parks', 'transit'], poiFilters: {} };
        }
        if (!STATE.preferences.poiFilters || typeof STATE.preferences.poiFilters !== 'object') {
            STATE.preferences.poiFilters = {};
        }
    }

    return div;
}

/** Open a modal to edit an existing category's name / icon / color.
 *  Saves directly into STATE.categories, syncs to the server, and
 *  re-renders the personalization page so the row reflects the change. */
function openEditCategoryModal(categoryId) {
    const cat = STATE.categories.find(c => c.id === categoryId);
    if (!cat) return;

    const iconOptions = ['🍷','🏨','✈️','🚕','🍕','🎟️','🛍️','🍦','🥐','🏛️','🏖️','🎢','🚠','🚌','🚆','🌍','🗺️','🎒','📸','☕','🍔','🛒','🎨','💊','🎭','🚗']
        .map(i => `<option value="${i}" ${i === cat.icon ? 'selected' : ''}>${i}</option>`).join('');

    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 420px;',
        innerHTML: `
            <h2 style="margin: 0 0 var(--space-5); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">Edit Category</h2>
            <form id="editCategoryForm" style="display: flex; flex-direction: column; gap: var(--space-4);">
                <div style="display: flex; gap: var(--space-3); align-items: center;">
                    <select id="editCatIcon" class="glass-input" style="width: 80px;">${iconOptions}</select>
                    <input type="text" id="editCatName" class="glass-input" value="${esc(cat.name)}" placeholder="Category name" required style="flex: 1;">
                    <input type="color" id="editCatColor" class="glass-input" value="${esc(cat.color)}" style="width: 50px; padding: 2px;">
                </div>
                <div style="display: flex; gap: var(--space-3); margin-top: var(--space-2);">
                    <button type="submit" class="btn-primary" style="flex: 2;">Save Changes</button>
                    <button type="button" id="cancelEditCatBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">Cancel</button>
                </div>
            </form>
        `,
    });

    /** @type {HTMLButtonElement} */ (q(root, '#cancelEditCatBtn')).onclick = () => close();
    /** @type {HTMLFormElement} */ (q(root, '#editCategoryForm')).onsubmit = (e) => {
        e.preventDefault();
        const icon = /** @type {HTMLSelectElement} */ (q(root, '#editCatIcon')).value;
        const name = /** @type {HTMLInputElement} */ (q(root, '#editCatName')).value.trim();
        const color = /** @type {HTMLInputElement} */ (q(root, '#editCatColor')).value;
        if (!name) return;
        cat.icon = icon;
        cat.name = name;
        cat.color = color;
        emit('state:changed');
        syncCategories();
        close();
        navigate('personalization');
        setTimeout(() => showPersTab('categories'), 50);
    };
}

export function renderPersonalization() {
    const div = document.createElement('div');

    const catsHtml = STATE.categories.map(c => `
        <tr>
            <td>${c.icon} ${esc(c.name)}</td>
            <td class="is-right"><span class="color-swatch" style="background: ${c.color}"></span></td>
            <td class="is-right">
                <button class="btn-x-bare edit-category-btn" data-category-id="${c.id}" aria-label="Edit category" style="margin-right: var(--space-2);">✏️</button>
                <button class="btn-x-bare delete-category-btn" data-category-id="${c.id}" aria-label="Delete category">✕</button>
            </td>
        </tr>
    `).join('');

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #1a6b3c; --g-to: #34c759;">Personalization</h1>
            <p>Customize your experience and categories. Manage friends in the Friends tab; add companions per-trip from the Home page.</p>
        </div>

        <div id="persMenu" class="grid-2">
            <button type="button" class="card-button-reset card glass card-glow-blue pers-tab-card" data-tab="categories">
                <h2 class="card-title" style="color: var(--accent-blue);">Manage Categories</h2>
                <p class="text-muted">Customize expense categories, icons, and colors.</p>
            </button>
        </div>

        <div id="persContent" style="display: none;">
            <button class="btn btn-small btn-liquid-glass pers-tab-card" data-tab="menu" style="margin-bottom: 20px;">&larr; Back to Personalization</button>

            <div id="persCategories" style="display: none;">
                <div class="card glass card-glow-blue">
                    <h2 class="card-title" style="color: var(--accent-blue);">Categories</h2>
                    <table class="compact-table" style="margin-bottom: var(--space-5);">
                        <thead>
                            <tr>
                                <th class="is-left">Name</th>
                                <th class="is-right">Color</th>
                                <th class="is-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${catsHtml}
                        </tbody>
                    </table>

                    <div class="section-divider">
                        <h3 style="margin-bottom: var(--space-3); font-size: var(--font-lg);">Add New Category</h3>
                        <div style="display:flex; gap: var(--space-3); flex-wrap: wrap;">
                            <select id="catIcon" class="glass-input" style="width: 80px;">
                                <option value="🍷">🍷</option><option value="🏨">🏨</option><option value="✈️">✈️</option><option value="🚕">🚕</option><option value="🍕">🍕</option>
                                <option value="🎟️">🎟️</option><option value="🛍️">🛍️</option><option value="🍦">🍦</option><option value="🥐">🥐</option><option value="🏛️">🏛️</option>
                                <option value="🏖️">🏖️</option><option value="🎢">🎢</option><option value="🚠">🚠</option><option value="🚌">🚌</option><option value="🚆">🚆</option>
                                <option value="🌍">🌍</option><option value="🗺️">🗺️</option><option value="🎒">🎒</option><option value="📸">📸</option><option value="☕">☕</option>
                            </select>
                            <input type="text" id="catName" class="glass-input" placeholder="Category Name" style="flex:1; min-width: 150px;">
                            <input type="color" id="catColor" class="glass-input" value="#ff3b30" style="width: 50px; padding: 2px;">
                            <button id="addCatBtn" class="btn-primary" style="padding: var(--space-3) var(--space-5);">Add</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Delegated handler for category-row delete + the menu/back tab cards.
    div.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;

        const persTabCard = /** @type {HTMLElement | null} */ (target.closest('.pers-tab-card'));
        if (persTabCard?.dataset.tab) { showPersTab(persTabCard.dataset.tab); return; }

        const editCatBtn = /** @type {HTMLElement | null} */ (target.closest('.edit-category-btn'));
        if (editCatBtn?.dataset.categoryId) { openEditCategoryModal(editCatBtn.dataset.categoryId); return; }

        const delCatBtn = /** @type {HTMLElement | null} */ (target.closest('.delete-category-btn'));
        if (delCatBtn?.dataset.categoryId) { deleteCategory(delCatBtn.dataset.categoryId); return; }
    });

    setTimeout(() => {
        const addCatBtn = div.querySelector('#addCatBtn');
        if (addCatBtn) addCatBtn.addEventListener('click', () => {
            const icon = /** @type {HTMLSelectElement} */ (q(div, '#catIcon')).value;
            const name = /** @type {HTMLInputElement} */ (q(div, '#catName')).value.trim();
            const color = /** @type {HTMLInputElement} */ (q(div, '#catColor')).value;
            if (name) {
                STATE.categories.push({ id: generateId(), name, icon, color });
                emit('state:changed');
                syncCategories(); // Delta: sync new category
                navigate('personalization');
                setTimeout(() => showPersTab('categories'), 50);
            }
        });

    }, 0);

    return div;
}

