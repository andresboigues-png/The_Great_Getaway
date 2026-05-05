// @ts-check
import { STATE, emit } from '../state.js';
import { generateId, showConfirmModal, q } from '../utils.js';
import { syncCategories, syncCompanions, upsertTrip, apiUrl } from '../api.js';
import { navigate } from '../router.js';
import { addCompanion, removeCompanion, hasCompanion, clearCompanionLink, findCompanion, isSelfCompanion } from '../companions.js';
import { unlinkCompanion as apiUnlinkCompanion } from '../api.js';
import { openCompanionLinkPickerModal } from '../modals.js';

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
export const showPersTab = (tab) => {
    const menu = document.getElementById('persMenu');
    const content = document.getElementById('persContent');
    const catSection = document.getElementById('persCategories');
    const compSection = document.getElementById('persCompanions');

    if (tab === 'menu') {
        if (menu) menu.style.display = 'grid';
        if (content) content.style.display = 'none';
    } else {
        if (menu) menu.style.display = 'none';
        if (content) content.style.display = 'block';
        if (catSection) catSection.style.display = (tab === 'categories' ? 'block' : 'none');
        if (compSection) compSection.style.display = (tab === 'companions' ? 'block' : 'none');
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

/** Cancel a pending outbound link invitation. The /api/companions/unlink
 *  endpoint is symmetric — calling it with a friend_user_id while the
 *  status is still 'pending' clears the inviter's row and is a no-op on
 *  the friend's side (they have no row yet). Sends a "declined" notification
 *  to the friend? No — the friend never accepted, so no follow-up; the
 *  open invite notification on their side just becomes stale. */
const cancelCompanionLink = (name) => {
    const c = findCompanion(name);
    if (!c || !c.linkedUserId) return;
    const friendId = c.linkedUserId;
    showConfirmModal({
        title: "Cancel invitation?",
        message: `Cancel the link request to "${name}"?`,
        confirmText: "Cancel link",
        onConfirm: () => {
            clearCompanionLink(name);
            emit('state:changed');
            apiUnlinkCompanion(friendId);
            navigate('personalization');
            setTimeout(() => showPersTab('companions'), 50);
        },
    });
};

/** Mutual unlink — both sides revert to plain unlinked companions; names stay. */
const confirmUnlinkCompanion = (name, friendUserId) => {
    showConfirmModal({
        title: "Unlink companion?",
        message: `Unlink "${name}" from their friend account? Both sides keep the companion record but the link is broken.`,
        confirmText: "Unlink",
        onConfirm: () => {
            clearCompanionLink(name);
            emit('state:changed');
            apiUnlinkCompanion(friendUserId);
            navigate('personalization');
            setTimeout(() => showPersTab('companions'), 50);
        },
    });
};

const deleteCompanion = (name) => {
    showConfirmModal({
        title: "Remove Companion?",
        message: `Remove "${name}" from your travel companions? They'll be removed from any trips they're on too.`,
        confirmText: "Remove",
        onConfirm: () => {
            removeCompanion(name);
            // Cascade: strip the name from each trip's roster too. Without
            // this, the trip-scoped expense form would still offer the name
            // (since it reads trip.companions), and the settlement balance
            // would still allocate against them.
            const touchedTrips = [];
            for (const trip of STATE.trips) {
                if (Array.isArray(trip.companions) && trip.companions.includes(name)) {
                    trip.companions = trip.companions.filter(c => c !== name);
                    touchedTrips.push(trip);
                }
            }
            emit('state:changed');
            syncCompanions(); // Delta: sync companions to server
            touchedTrips.forEach(t => upsertTrip(t));
            navigate('personalization');
            setTimeout(() => showPersTab('companions'), 50);
        }
    });
};

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

        return `
            <div class="ai-page-header">
                <h1 class="gradient-text" style="--g-from: #5856d6; --g-to: #ff2d55;">System Control</h1>
                <p>Manage your travel data, custom formats, and core preferences.</p>
            </div>

            ${isMenu ? `
                <div class="settings-grid">
                    <div class="card glass management-card settings-tab-card" data-tab="format" style="cursor: pointer;">
                        <h2 class="card-title" style="color: #ff9500; margin: 0;">Format Options</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Configure Excel import mappings and global data formats.</p>
                        <div style="margin-top: 20px; color: #ff9500; font-weight: 700; font-size: 0.85rem;">Configure &rarr;</div>
                    </div>

                    <div class="card glass management-card danger-card settings-tab-card" data-tab="reset" style="cursor: pointer;">
                        <div class="danger-glow pulse-red"></div>
                        <h2 class="card-title" style="color: #ff3b30; margin: 0;">Data Management</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Wipe specific data categories or perform a factory reset.</p>
                        <div style="margin-top: 20px; color: #ff3b30; font-weight: 700; font-size: 0.85rem;">Manage Data &rarr;</div>
                    </div>
                </div>
            ` : `
                <button class="btn btn-small btn-liquid-glass settings-tab-card" data-tab="menu" style="margin-bottom: 24px; padding: 10px 20px; border-radius: 14px;">&larr; Back to Control Center</button>
                
                ${isReset ? `
                    <div class="settings-grid">
                        <div class="card glass" style="padding: var(--space-6);">
                            <h3 style="color: #007aff; margin-top: 0;">Companions</h3>
                            <p class="muted-meta">Delete your travel companions and groups.</p>
                            <button class="themed-block-btn confirm-reset-btn" data-reset-type="groups" style="--accent: 0,113,227;">Clear Groups</button>
                        </div>
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
            groups: {
                title: "Clear Companions?",
                message: "This will remove all travel companions and group lists.",
                confirmText: "Clear All",
                onConfirm: () => { STATE.groups = []; emit('state:changed'); switchSettingsTab('reset'); }
            },
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
                            await fetch(apiUrl('/api/user-data'), {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user_id: STATE.user.id })
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
                            await fetch(apiUrl('/api/user-data'), {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user_id: STATE.user.id })
                            });
                        } catch(e) { console.error('Server wipe failed', e); }
                    }
                    STATE.trips = []; STATE.archivedTrips = []; STATE.tripDays = []; STATE.expenses = []; STATE.groups = []; STATE.budgets = []; STATE.categories = []; STATE.activeTripId = null; STATE.user = null; STATE.notifications = []; STATE.hasLoggedInBefore = false;
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
    });

    return div;
}

export function renderPersonalization() {
    const div = document.createElement('div');

    const catsHtml = STATE.categories.map(c => `
        <tr>
            <td>${c.icon} ${c.name}</td>
            <td class="is-right"><span class="color-swatch" style="background: ${c.color}"></span></td>
            <td class="is-right">
                <button class="btn-x-bare delete-category-btn" data-category-id="${c.id}">✕</button>
            </td>
        </tr>
    `).join('');

    // Companion roster row — left column is the name + a link-status pill
    // (unlinked / pending / linked / self). Right column carries the action
    // button: unlinked → "Link to friend", pending → "Cancel link",
    // linked → "Unlink", self → none (you can't link yourself).
    // Delete (✕) is always available, and the cascade in `deleteCompanion`
    // also nulls the friend's reciprocal link so dangling rows can't form.
    const linkPill = (/** @type {import('../types').Companion} */ c) => {
        if (isSelfCompanion(c.name)) {
            return `<span class="companion-link-pill companion-link-pill--self">👤 That's you</span>`;
        }
        if (c.linkStatus === 'pending') {
            return `<span class="companion-link-pill companion-link-pill--pending">⏳ Pending</span>`;
        }
        if (c.linkStatus === 'accepted' && c.linkedUserId) {
            return `<span class="companion-link-pill companion-link-pill--linked">🟢 Linked</span>`;
        }
        return '';
    };
    const linkAction = (/** @type {import('../types').Companion} */ c) => {
        if (isSelfCompanion(c.name)) {
            return ''; // self-companion can't be linked to a friend
        }
        if (c.linkStatus === 'pending') {
            return `<button class="btn-link-action companion-cancel-link-btn" data-companion="${c.name}">Cancel</button>`;
        }
        if (c.linkStatus === 'accepted' && c.linkedUserId) {
            return `<button class="btn-link-action companion-unlink-btn" data-companion="${c.name}" data-friend-id="${c.linkedUserId}">Unlink</button>`;
        }
        return `<button class="btn-link-action companion-link-btn" data-companion="${c.name}">🔗 Link to friend</button>`;
    };
    const groupsHtml = STATE.groups.map(c => `
        <tr>
            <td>
                <div style="display:flex; align-items:center; gap: var(--space-2); flex-wrap: wrap;">
                    <span style="font-weight:600;">${c.name}</span>
                    ${linkPill(c)}
                </div>
            </td>
            <td class="is-right">
                <div style="display:inline-flex; align-items:center; gap: var(--space-2);">
                    ${linkAction(c)}
                    <button class="btn-x-bare delete-companion-btn" data-companion="${c.name}">✕</button>
                </div>
            </td>
        </tr>
    `).join('');

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #5856d6; --g-to: #ff2d55;">Personalization</h1>
            <p>Customize your experience, categories, and travel companions.</p>
        </div>

        <div id="persMenu" class="grid-2">
            <div class="card glass card-glow-blue pers-tab-card" data-tab="categories" style="cursor: pointer;">
                <h2 class="card-title" style="color: var(--accent-blue);">Manage Categories</h2>
                <p class="text-muted">Customize expense categories, icons, and colors.</p>
            </div>
            <div class="card glass card-glow-purple pers-tab-card" data-tab="companions" style="cursor: pointer;">
                <h2 class="card-title" style="color: #5856d6;">Manage Companions</h2>
                <p class="text-muted">Add the people who usually travel and split expenses with you.</p>
            </div>
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

            <div id="persCompanions" style="display: none;">
                <div class="card glass card-glow-purple">
                    <h2 class="card-title" style="color: #5856d6;">Travel Companions</h2>
                    <p style="color: var(--text-secondary); margin-bottom: var(--space-4);">The people who usually pay for or share expenses with you.</p>
                    <table class="compact-table" style="margin-bottom: var(--space-5);">
                        <thead>
                            <tr>
                                <th class="is-left">Name</th>
                                <th class="is-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupsHtml || `<tr><td class="is-center" colspan="2" class="text-muted">No companions added yet.</td></tr>`}
                        </tbody>
                    </table>

                    <div class="section-divider">
                        <h3 style="margin-bottom: var(--space-3); font-size: var(--font-lg);">Add Companion</h3>
                        <div style="display: flex; gap: var(--space-3);">
                            <input type="text" id="newPerson" class="glass-input" style="flex: 1;" placeholder="Enter name...">
                            <button id="addPersonBtn" class="btn-primary" style="background: #5856d6; padding: var(--space-3) var(--space-5);">Add Person</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Delegated handler for the per-row delete buttons + the menu/back tab cards.
    div.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;

        const persTabCard = /** @type {HTMLElement | null} */ (target.closest('.pers-tab-card'));
        if (persTabCard?.dataset.tab) { showPersTab(persTabCard.dataset.tab); return; }

        const delCatBtn = /** @type {HTMLElement | null} */ (target.closest('.delete-category-btn'));
        if (delCatBtn?.dataset.categoryId) { deleteCategory(delCatBtn.dataset.categoryId); return; }

        const delCompBtn = /** @type {HTMLElement | null} */ (target.closest('.delete-companion-btn'));
        if (delCompBtn?.dataset.companion) { deleteCompanion(delCompBtn.dataset.companion); return; }

        const linkBtn = /** @type {HTMLElement | null} */ (target.closest('.companion-link-btn'));
        if (linkBtn?.dataset.companion) { openCompanionLinkPickerModal(linkBtn.dataset.companion); return; }

        const cancelLinkBtn = /** @type {HTMLElement | null} */ (target.closest('.companion-cancel-link-btn'));
        if (cancelLinkBtn?.dataset.companion) { cancelCompanionLink(cancelLinkBtn.dataset.companion); return; }

        const unlinkBtn = /** @type {HTMLElement | null} */ (target.closest('.companion-unlink-btn'));
        if (unlinkBtn?.dataset.companion && unlinkBtn.dataset.friendId) {
            confirmUnlinkCompanion(unlinkBtn.dataset.companion, unlinkBtn.dataset.friendId);
            return;
        }
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

        const addPersonBtn = div.querySelector('#addPersonBtn');
        if (addPersonBtn) addPersonBtn.addEventListener('click', () => {
            const name = /** @type {HTMLInputElement} */ (q(div, '#newPerson')).value.trim();
            if (name && !hasCompanion(name)) {
                addCompanion(name);
                emit('state:changed');
                syncCompanions(); // Delta: sync new companion
                navigate('personalization');
                setTimeout(() => showPersTab('companions'), 50);
            }
        });
    }, 0);

    return div;
}

