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

            <!-- Format mapping list — was a flat compact-table; now a
                 card list with each mapping rendered as a row showing
                 the variable name, an arrow connecting to the Excel
                 column letter (chip), and a delete chip. Mandatory
                 variables (★) get a star badge and a left stripe in
                 the accent color. Easier to scan than the table —
                 each mapping is a self-contained card. -->
            <div class="format-list" style="margin-bottom: var(--space-6);">
                ${(STATE.customFormat || []).length === 0 ? `
                    <div class="format-list__empty">No mappings yet — pick a variable + column below.</div>
                ` : (STATE.customFormat || []).map(m => {
                    const isMandatory = MANDATORY.includes(m.variable);
                    return `
                        <div class="format-row${isMandatory ? ' is-mandatory' : ''}">
                            <span class="format-row__star" aria-hidden="true">${isMandatory ? '★' : ''}</span>
                            <span class="format-row__variable">${esc(m.variable)}</span>
                            <span class="format-row__arrow" aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                            </span>
                            <span class="format-row__col">${esc(m.column)}</span>
                            <button class="format-row__remove remove-mapping-btn" data-variable="${esc(m.variable)}" title="Remove mapping" aria-label="Remove mapping">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    `;
                }).join('')}
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
                        <div class="saved-format-card">
                            <div class="saved-format-card__name">
                                <span class="saved-format-card__icon">📄</span>
                                <span>${esc(f.name)}</span>
                            </div>
                            <div class="saved-format-card__actions">
                                <button class="saved-format-card__btn saved-format-card__btn--edit edit-saved-format-btn" data-format-id="${esc(f.id)}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                    Edit
                                </button>
                                <button class="saved-format-card__btn saved-format-card__btn--delete delete-saved-format-btn" data-format-id="${esc(f.id)}">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path></svg>
                                    Delete
                                </button>
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
                    const generalSubTab = activeTab === 'general' ? (window.__ggGeneralSubTab || 'pills') : 'pills';
                    /** @param {string} t */
                    const tab = (t) => generalSubTab === t ? ' is-active' : '';
                    const subTabnav = `
                        <div class="general-subtabs" role="tablist" aria-label="General settings sections">
                            <button type="button" class="general-subtab${tab('pills')}" data-general-sub="pills" role="tab" aria-selected="${generalSubTab === 'pills' ? 'true' : 'false'}">
                                <span class="general-subtab__icon">🗺️</span>
                                <span class="general-subtab__label">Map pills</span>
                            </button>
                            <button type="button" class="general-subtab is-coming-soon" disabled aria-disabled="true" role="tab" aria-selected="false" title="More general settings coming soon">
                                <span class="general-subtab__icon">⚙️</span>
                                <span class="general-subtab__label">More soon</span>
                            </button>
                        </div>
                    `;
                    if (generalSubTab !== 'pills') {
                        // Future tabs land here. For now there's only
                        // pills; this branch is the placeholder rail.
                        return `
                            ${subTabnav}
                            <div class="card glass" style="padding: 32px; border-radius: 28px;">
                                <p style="color: var(--text-secondary); margin: 0;">Section coming soon.</p>
                            </div>
                        `;
                    }
                    const filters = STATE.preferences?.poiFilters || {};
                    const anchoring = STATE.preferences?.poiAnchoring || {};
                    const visibility = STATE.preferences?.poiVisible || {};
                    const ratingOptions = [0, 3, 3.5, 4, 4.5];
                    const rows = POI_CATEGORIES
                        // Roads & traffic isn't a Places-API pill, no
                        // rating / anchor filter applies to it.
                        .filter(c => c.placesType)
                        .map(c => {
                            const userMin = typeof filters[c.key]?.minRating === 'number'
                                ? filters[c.key].minRating
                                : c.defaultMinRating;
                            const ratingOpts = ratingOptions.map(v => `
                                <option value="${v}" ${v === userMin ? 'selected' : ''}>${v === 0 ? 'Any rating' : `${v}★ +`}</option>
                            `).join('');
                            // Anchor mode: user override (Settings) wins,
                            // else the category's useGenesisAlways default.
                            const userAnchor = anchoring[c.key];
                            const effectiveAnchor = (userAnchor === 'genesis' || userAnchor === 'epicenter')
                                ? userAnchor
                                : (c.useGenesisAlways ? 'genesis' : 'epicenter');
                            const defaultAnchor = c.useGenesisAlways ? 'genesis' : 'epicenter';
                            const anchorOpts = `
                                <option value="epicenter" ${effectiveAnchor === 'epicenter' ? 'selected' : ''}>📍 Day-aware</option>
                                <option value="genesis"   ${effectiveAnchor === 'genesis' ? 'selected' : ''}>🌐 Trip-wide</option>
                            `;
                            const isVisible = visibility[c.key] !== false; // default true
                            const isRatingCustom = userMin !== c.defaultMinRating;
                            const isAnchorCustom = (userAnchor === 'genesis' || userAnchor === 'epicenter')
                                && userAnchor !== defaultAnchor;
                            const isVisibilityCustom = !isVisible; // default = visible, so hidden = customised
                            const isCustom = isRatingCustom || isAnchorCustom || isVisibilityCustom;
                            return `
                                <div class="poi-filter-row${isVisible ? '' : ' poi-filter-row--hidden'}">
                                    <span class="poi-filter-row__icon">${c.icon}</span>
                                    <div class="poi-filter-row__body">
                                        <div class="poi-filter-row__label">${esc(c.label)}</div>
                                        <div class="poi-filter-row__hint">${esc(c.tooltip)}</div>
                                    </div>
                                    <select class="poi-anchor-mode" data-poi="${c.key}" aria-label="Search anchor for ${esc(c.label)}" title="Day-aware = uses the day you've picked as search center on Home (falls back to genesis). Trip-wide = always anchored on the trip's genesis pin.">
                                        ${anchorOpts}
                                    </select>
                                    <select class="poi-filter-rating" data-poi="${c.key}" aria-label="Minimum rating for ${esc(c.label)}">
                                        ${ratingOpts}
                                    </select>
                                    <span class="poi-filter-row__default" title="Defaults: ${c.defaultMinRating === 0 ? 'Any rating' : c.defaultMinRating + '★+'} / ${defaultAnchor === 'genesis' ? 'Trip-wide' : 'Day-aware'} / shown">
                                        ${isCustom ? '<button type="button" class="poi-filter-reset" data-poi="' + c.key + '" title="Reset rating, anchor, and visibility to default">Reset</button>' : '<span class="muted">Default</span>'}
                                    </span>
                                    <label class="switch poi-visibility-switch" title="${isVisible ? 'Visible on the home pill row — switch off to hide.' : 'Hidden from the home pill row — switch on to show.'}">
                                        <input type="checkbox" class="poi-visibility-toggle" data-poi="${c.key}" ${isVisible ? 'checked' : ''}>
                                        <span class="slider"></span>
                                    </label>
                                </div>
                            `;
                        }).join('');
                    return `
                        ${subTabnav}
                        <div class="card glass" style="padding: 32px; border-radius: 28px;">
                            <h2 style="color: var(--accent-blue); margin-top: 0;">Map pill filters</h2>
                            <p style="color: var(--text-secondary); margin-bottom: 16px;"><strong>Show on Home</strong> (the right-side switch) toggles whether each pill appears in the home map's pill row. Useful for hiding categories you never use so the row stays compact.</p>
                            <p style="color: var(--text-secondary); margin-bottom: 16px;"><strong>Minimum rating</strong> hides results below the chosen ★. Restaurants and Hotels default to 4★+ (rating is a meaningful quality signal there); the rest default to "Any rating".</p>
                            <p style="color: var(--text-secondary); margin-bottom: 24px;"><strong>Search anchor</strong> picks where each pill searches from. <em>Day-aware</em> uses the day you've set as search center on the Home page (falls back to the trip's genesis pin). <em>Trip-wide</em> always anchors on the genesis pin so the 50 km wide search covers the whole trip — better for sparse "where are these across my whole trip" categories like Medical, Sports, Govt, Schools, Public transit.</p>
                            <div class="poi-filter-list">
                                ${rows}
                            </div>
                            <p style="color: var(--text-secondary); margin: 24px 0 0; font-size: 0.85rem;">Visibility changes take effect on next Home navigation. Filter / anchor changes apply on the next pill toggle. Reset returns rating, anchor, AND visibility to the pill's defaults.</p>
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

        // General-page sub-tab strip — switches between sections
        // inside General Settings without leaving the page.
        // Stashes the choice on window so a re-render of the
        // General page (e.g. after a poi-filter-reset) restores
        // the same sub-tab. Disabled tabs are :disabled buttons
        // that the browser ignores for clicks anyway, so the
        // dataset check below covers active tabs only.
        const subTabBtn = /** @type {HTMLElement | null} */ (target.closest('.general-subtab'));
        if (subTabBtn && !subTabBtn.hasAttribute('disabled') && subTabBtn.dataset.generalSub) {
            /** @type {any} */ (window).__ggGeneralSubTab = subTabBtn.dataset.generalSub;
            switchSettingsTab('general');
            return;
        }

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

        // POI filter: reset one category back to its defaults — clears
        // rating, anchor, AND visibility overrides so the row shows
        // "Default" again.
        const resetPoiBtn = /** @type {HTMLElement | null} */ (target.closest('.poi-filter-reset'));
        if (resetPoiBtn?.dataset.poi) {
            ensurePoiPrefs();
            delete STATE.preferences.poiFilters[resetPoiBtn.dataset.poi];
            delete STATE.preferences.poiAnchoring[resetPoiBtn.dataset.poi];
            delete STATE.preferences.poiVisible[resetPoiBtn.dataset.poi];
            emit('state:changed');
            switchSettingsTab('general'); // re-render so the row reflects the reset
            return;
        }
    });

    // POI per-pill controls — change listener handles BOTH the rating
    // dropdown and the anchor-mode dropdown, dispatching by class.
    // Delegated because div.innerHTML is rewritten on tab switch, so
    // per-element listeners would die.
    div.addEventListener('change', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;

        const ratingSel = target.closest('.poi-filter-rating');
        if (ratingSel) {
            const key = /** @type {HTMLElement} */ (ratingSel).dataset.poi;
            if (!key) return;
            const value = parseFloat(/** @type {HTMLSelectElement} */ (ratingSel).value);
            ensurePoiPrefs();
            STATE.preferences.poiFilters[key] = { minRating: value };
            emit('state:changed');
            switchSettingsTab('general');
            return;
        }

        const anchorSel = target.closest('.poi-anchor-mode');
        if (anchorSel) {
            const key = /** @type {HTMLElement} */ (anchorSel).dataset.poi;
            if (!key) return;
            const value = /** @type {HTMLSelectElement} */ (anchorSel).value;
            if (value !== 'genesis' && value !== 'epicenter') return;
            ensurePoiPrefs();
            STATE.preferences.poiAnchoring[key] = value;
            emit('state:changed');
            switchSettingsTab('general');
            return;
        }

        const visibilityToggle = target.closest('.poi-visibility-toggle');
        if (visibilityToggle) {
            const key = /** @type {HTMLElement} */ (visibilityToggle).dataset.poi;
            if (!key) return;
            const checked = /** @type {HTMLInputElement} */ (visibilityToggle).checked;
            ensurePoiPrefs();
            // Default is visible (=== true). Only persist when the user
            // hides — checked = visible = "remove the override".
            if (checked) delete STATE.preferences.poiVisible[key];
            else STATE.preferences.poiVisible[key] = false;
            emit('state:changed');
            switchSettingsTab('general');
            return;
        }
    });

    /** Defensive: STATE.preferences and its sub-objects should already
     *  exist via loadState's backfill, but this protects against a
     *  corrupt / hand-edited localStorage that bypasses
     *  validateLoadedState. */
    function ensurePoiPrefs() {
        if (!STATE.preferences) {
            STATE.preferences = { mapDefaultPois: ['sights', 'parks', 'transit'], poiFilters: {}, pillEpicenters: {}, poiAnchoring: {}, poiVisible: {}, enabledPois: {} };
        }
        if (!STATE.preferences.poiFilters || typeof STATE.preferences.poiFilters !== 'object') {
            STATE.preferences.poiFilters = {};
        }
        if (!STATE.preferences.poiAnchoring || typeof STATE.preferences.poiAnchoring !== 'object') {
            STATE.preferences.poiAnchoring = {};
        }
        if (!STATE.preferences.poiVisible || typeof STATE.preferences.poiVisible !== 'object') {
            STATE.preferences.poiVisible = {};
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

    // Category rows — card-style instead of plain table cells.
    // Each row gets a colored left stripe (the category color),
    // a glyph + name in the middle, and edit/delete chips on the
    // right. Hover lifts the card slightly so it reads as
    // tappable. Designed to scan vertically (categories are
    // dense lists in real-world use).
    const catsHtml = STATE.categories.map(c => `
        <div class="cat-row" style="--cat-color: ${esc(c.color)};">
            <span class="cat-row__stripe" aria-hidden="true"></span>
            <span class="cat-row__icon">${esc(c.icon)}</span>
            <span class="cat-row__name">${esc(c.name)}</span>
            <span class="cat-row__swatch" style="background:${esc(c.color)};" aria-label="Color ${esc(c.color)}"></span>
            <div class="cat-row__actions">
                <button class="cat-row__btn cat-row__btn--edit edit-category-btn" data-category-id="${esc(c.id)}" title="Edit category" aria-label="Edit category">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 20h9"></path>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                </button>
                <button class="cat-row__btn cat-row__btn--delete delete-category-btn" data-category-id="${esc(c.id)}" title="Delete category" aria-label="Delete category">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
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
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: var(--space-4); flex-wrap:wrap;">
                        <h2 class="card-title" style="color: var(--accent-blue); margin: 0;">Categories</h2>
                        <span class="cat-count-chip">${STATE.categories.length}</span>
                    </div>
                    <div class="cat-list" style="margin-bottom: var(--space-5);">
                        ${catsHtml || '<div class="cat-list__empty">No categories yet — add one below.</div>'}
                    </div>

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

