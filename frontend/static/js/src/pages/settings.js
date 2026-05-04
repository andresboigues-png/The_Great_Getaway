// @ts-check
import { STATE, emit } from '../state.js';
import { generateId, showConfirmModal, q } from '../utils.js';
import { syncCategories, syncCompanions, apiUrl } from '../api.js';
import { navigate } from '../router.js';

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

const deleteCompanion = (name) => {
    showConfirmModal({
        title: "Remove Companion?",
        message: `Remove "${name}" from your travel companions?`,
        confirmText: "Remove",
        onConfirm: () => {
            STATE.groups = STATE.groups.filter(g => g !== name);
            emit('state:changed');
            syncCompanions(); // Delta: sync companions to server
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
        const OPTIONAL = ['country', 'currency'];
        const used = new Set((STATE.customFormat || []).map(m => m.variable));
        const sf = STATE.savedFormats || [];

        return `
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px;">
                ${MANDATORY.map(v => {
            const done = used.has(v);
            return `<span style="padding:6px 14px; border-radius:20px; font-size:0.75rem; font-weight:700; border:1px solid ${done ? 'rgba(52,199,89,0.3)' : 'rgba(255,59,48,0.3)'}; background:${done ? 'rgba(52,199,89,0.05)' : 'rgba(255,59,48,0.05)'}; color:${done ? '#34c759' : '#ff3b30'};">
                        ${done ? '✓' : '★'} ${v.toUpperCase()}
                    </span>`;
        }).join('')}
            </div>

            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: 20px; overflow: hidden; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: rgba(255,149,0,0.05);">
                        <tr>
                            <th style="text-align:left; padding:16px; font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary);">Variable</th>
                            <th style="text-align:left; padding:16px; font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary);">Excel Column</th>
                            <th style="text-align:center; padding:16px; font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary);">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(STATE.customFormat || []).length === 0 ? '<tr><td colspan="3" style="padding:32px; text-align:center; color:var(--text-secondary); font-style:italic;">No mappings yet.</td></tr>' : (STATE.customFormat || []).map(m => `
                            <tr style="border-bottom: 1px solid var(--glass-border);">
                                <td style="padding:16px; font-weight:700;">${m.variable}</td>
                                <td style="padding:16px;"><span style="background:#ff9500; color:white; padding:4px 10px; border-radius:8px; font-weight:800; font-size:0.8rem;">${m.column}</span></td>
                                <td style="padding:16px; text-align:center;">
                                    <button class="remove-mapping-btn" data-variable="${m.variable}" style="background:rgba(255,59,48,0.1); border:none; color:#ff3b30; width:32px; height:32px; border-radius:50%; cursor:pointer;">&times;</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div style="display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap; margin-bottom:32px;">
                <div style="flex:1; min-width:150px;">
                    <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--text-secondary);">VARIABLE</label>
                    <select id="mapVarSelect" class="glass-input" style="width:100%;">
                        <option value="">Select...</option>
                        ${MANDATORY.concat(OPTIONAL).filter(v => !used.has(v)).map(v => `<option value="${v}">${MANDATORY.includes(v) ? '★ ' : ''}${v}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1; min-width:120px;">
                    <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--text-secondary);">COLUMN</label>
                    <select id="mapColSelect" class="glass-input" style="width:100%;">
                        <option value="">Col...</option>
                        ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <button class="btn btn-liquid-glass" id="addFormatMappingBtn" style="padding: 12px 24px;">Map Field</button>
            </div>

            <div style="border-top: 1px solid var(--glass-border); padding-top: 32px;">
                <h3 style="margin-top:0;">Saved Formats (${sf.length}/5)</h3>
                <div style="display:grid; gap:12px;">
                    ${sf.map(f => `
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:16px; border-radius:16px; border:1px solid var(--glass-border);">
                            <div style="font-weight:700;">${f.name}</div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-small edit-saved-format-btn" data-format-id="${f.id}" style="background:rgba(0,113,227,0.1); color:#007aff; border:none; padding:8px 16px; border-radius:12px;">Edit</button>
                                <button class="btn btn-small delete-saved-format-btn" data-format-id="${f.id}" style="background:rgba(255,59,48,0.1); color:#ff3b30; border:none; padding:8px 16px; border-radius:12px;">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                    ${sf.length < 5 ? `
                        <div style="display:flex; gap:12px; margin-top:12px;">
                            <input type="text" id="formatNameInput" class="glass-input" placeholder="Name this format..." style="flex:1;">
                            <button class="btn" id="saveCustomFormatBtn" style="background:var(--accent-blue);">Save Format</button>
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
                <h1 style="background: linear-gradient(135deg, #5856d6, #ff2d55); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">System Control</h1>
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
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #007aff; margin-top: 0;">Companions</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Delete your travel companions and groups.</p>
                            <button class="btn btn-small confirm-reset-btn" data-reset-type="groups" style="background: rgba(0, 113, 227, 0.1); color: #007aff; border: 1px solid rgba(0, 113, 227, 0.2); width: 100%;">Clear Groups</button>
                        </div>
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #ff9500; margin-top: 0;">Trips & Days</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Remove all trips, itineraries, and daily logs.</p>
                            <button class="btn btn-small confirm-reset-btn" data-reset-type="trips" style="background: rgba(255, 149, 0, 0.1); color: #ff9500; border: 1px solid rgba(255, 149, 0, 0.2); width: 100%;">Delete All Trips</button>
                        </div>
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #5856d6; margin-top: 0;">Categories</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Reset custom expense categories to defaults.</p>
                            <button class="btn btn-small confirm-reset-btn" data-reset-type="categories" style="background: rgba(88, 86, 214, 0.1); color: #5856d6; border: 1px solid rgba(88, 86, 214, 0.2); width: 100%;">Restore Defaults</button>
                        </div>
                        <div class="card glass danger-card" style="padding: 24px; border-color: rgba(255, 59, 48, 0.3);">
                            <h3 style="color: #ff3b30; margin-top: 0;">Factory Reset</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Permanently wipe every trace of data from the app.</p>
                            <button class="btn-confirm-danger confirm-reset-btn" data-reset-type="app" style="font-size: 0.85rem; padding: 12px;">Erase Everything</button>
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
        <tr style="border-bottom: 1px solid var(--glass-border)">
            <td style="padding: 12px; font-weight: 500;">${c.icon} ${c.name}</td>
            <td style="padding: 12px; text-align: right;"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background: ${c.color}"></span></td>
            <td style="padding: 12px; text-align: right;">
                <button class="btn-small delete-category-btn" data-category-id="${c.id}" style="background:none; color:#ff3b30; border:none; cursor:pointer;">✕</button>
            </td>
        </tr>
    `).join('');

    const groupsHtml = STATE.groups.map(g => `
        <tr style="border-bottom: 1px solid var(--glass-border)">
            <td style="padding: 12px; font-weight: 500;">${g}</td>
            <td style="padding: 12px; text-align: right;">
                <button class="btn-small delete-companion-btn" data-companion="${g}" style="background:none; color:#ff3b30; border:none; cursor:pointer;">✕</button>
            </td>
        </tr>
    `).join('');

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #5856d6, #ff2d55); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Personalization</h1>
            <p>Customize your experience, categories, and travel companions.</p>
        </div>

        <div id="persMenu" class="grid-2">
            <div class="card glass card-glow-blue pers-tab-card" data-tab="categories" style="cursor: pointer;">
                <h2 class="card-title" style="color: var(--accent-blue);">Manage Categories</h2>
                <p style="color: var(--text-secondary);">Customize expense categories, icons, and colors.</p>
            </div>
            <div class="card glass card-glow-purple pers-tab-card" data-tab="companions" style="cursor: pointer;">
                <h2 class="card-title" style="color: #5856d6;">Manage Companions</h2>
                <p style="color: var(--text-secondary);">Add the people who usually travel and split expenses with you.</p>
            </div>
        </div>

        <div id="persContent" style="display: none;">
            <button class="btn btn-small btn-liquid-glass pers-tab-card" data-tab="menu" style="margin-bottom: 20px;">&larr; Back to Personalization</button>
            
            <div id="persCategories" style="display: none;">
                <div class="card glass card-glow-blue">
                    <h2 class="card-title" style="color: var(--accent-blue);">Categories</h2>
                    <table class="liquid-table" style="width: 100%; margin-bottom: 20px;">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Name</th>
                                <th style="text-align: right;">Color</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${catsHtml}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--glass-border);">
                        <h3 style="margin-bottom: 12px; font-size: 1rem;">Add New Category</h3>
                        <div style="display:flex; gap: 12px; flex-wrap: wrap;">
                            <select id="catIcon" class="glass-input" style="width: 80px;">
                                <option value="🍷">🍷</option><option value="🏨">🏨</option><option value="✈️">✈️</option><option value="🚕">🚕</option><option value="🍕">🍕</option>
                                <option value="🎟️">🎟️</option><option value="🛍️">🛍️</option><option value="🍦">🍦</option><option value="🥐">🥐</option><option value="🏛️">🏛️</option>
                                <option value="🏖️">🏖️</option><option value="🎢">🎢</option><option value="🚠">🚠</option><option value="🚌">🚌</option><option value="🚆">🚆</option>
                                <option value="🌍">🌍</option><option value="🗺️">🗺️</option><option value="🎒">🎒</option><option value="📸">📸</option><option value="☕">☕</option>
                            </select>
                            <input type="text" id="catName" class="glass-input" placeholder="Category Name" style="flex:1; min-width: 150px;">
                            <input type="color" id="catColor" class="glass-input" value="#ff3b30" style="width: 50px; padding: 2px;">
                            <button id="addCatBtn" class="btn">Add</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="persCompanions" style="display: none;">
                <div class="card glass card-glow-purple">
                    <h2 class="card-title" style="color: #5856d6;">Travel Companions</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">The people who usually pay for or share expenses with you.</p>
                    <table class="liquid-table" style="width: 100%; margin-bottom: 20px;">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Name</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupsHtml || '<tr><td colspan="2" style="text-align:center; padding: 20px; color: var(--text-secondary);">No companions added yet.</td></tr>'}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--glass-border);">
                        <h3 style="margin-bottom: 12px; font-size: 1rem;">Add Companion</h3>
                        <div style="display: flex; gap: 12px;">
                            <input type="text" id="newPerson" class="glass-input" style="flex: 1;" placeholder="Enter name...">
                            <button id="addPersonBtn" class="btn" style="background: #5856d6;">Add Person</button>
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
            if (name && !STATE.groups.includes(name)) {
                STATE.groups.push(name);
                emit('state:changed');
                syncCompanions(); // Delta: sync new companion
                navigate('personalization');
                setTimeout(() => showPersTab('companions'), 50);
            }
        });
    }, 0);

    return div;
}

