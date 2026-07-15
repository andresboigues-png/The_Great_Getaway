// pages/settings.ts — §3.3 React migration leftover.
//
// The legacy renderSettings() lived here for years until the §3.3
// React migration (see pages/settings/Settings.tsx for the new JSX
// implementation). renderPersonalization() also lived here until
// the previous §3.3 wave (see pages/settings/Personalization.tsx).
//
// What's left in this file is the cross-page surface that other
// modules still depend on:
//
//   - `showSettingsTab(tab)` — used by upload.ts after a CSV import
//     to jump the user to the Format tab. Thin wrapper around
//     setSettingsTab from ./settings/tabState — the new React
//     Settings component subscribes to that store and re-renders
//     when the tab flips. Pre-§3.3 this function looked for
//     `.settings-tab-btn` / `.settings-section` DOM nodes that no
//     longer exist (the imperative renderer had moved on from
//     class-toggle to innerHTML rewrite) — it was effectively a
//     no-op. The new wiring actually works.
//
//   - `showPersTab(tab)` — used by home/gettingStartedGuide.ts
//     after the "Set your own categories" guide action. Direct DOM
//     toggle on the Personalization page's #persMenu / #persContent
//     / #persCategories ids — the React Personalization component
//     renders these same ids so the imperative + declarative paths
//     coexist.
//
//   - `deleteCategory(id)` — used by Personalization.tsx's delete
//     button. Confirm + STATE write + syncCategories.
//
//   - `openEditCategoryModal(id)` — used by Personalization.tsx's
//     edit button. showModal-driven form, saves to STATE +
//     syncCategories.

import { STATE, emit } from '../state.js';
import { showConfirmModal, q, esc } from '../utils.js';
import { syncCategories } from '../api.js';
import { showModal } from '../components/Modal.js';
import { t } from '../i18n.js';
import { setSettingsTab, type SettingsTab } from './settings/tabState.js';
import { iconSvg, emojiToIconKey, ICON_PATHS } from '../icons.js';


/** Imperative-API surface for jumping to a specific Settings sub-tab
 *  from outside the page (currently: upload.ts after a successful
 *  CSV import). The new React Settings component subscribes to
 *  tabState via useSyncExternalStore, so a setSettingsTab() write
 *  re-renders the live component without any DOM manipulation here.
 *
 *  The lenient string param matches the legacy signature; we narrow
 *  to the SettingsTab union before dispatching so a typo silently
 *  no-ops rather than corrupting the store. */
export const showSettingsTab = (tab: string): void => {
    if (tab === 'menu' || tab === 'general' || tab === 'format' || tab === 'reset') {
        setSettingsTab(tab as SettingsTab);
    }
};


// (#4 migration) `showPersTab` is gone: it was an imperative
// display-toggle on #persMenu/#persContent/#persCategories that only
// existed to coexist with the old renderer. The React Personalization
// component owns its tab via useState, and a cross-page deep-link
// (gettingStartedGuide → "Set your own categories") now uses
// requestPersonalizationTab('categories') instead. The category
// mutators below no longer re-navigate either — the component
// re-renders from the `state:changed` emit, so the edited/deleted row
// updates in place.


// Exported so the React Personalization page can dispatch this from
// its delete-button click handler. Confirm-modal flow + state delete
// + server sync + re-navigate to land back on the categories sub-tab.
export const deleteCategory = (id: string) => {
    showConfirmModal({
        title: t('settings.categoryDeleteConfirmTitle'),
        message: t('settings.categoryDeleteConfirmMessage'),
        confirmText: t('settings.categoryDeleteConfirmBtn'),
        onConfirm: () => {
            STATE.categories = STATE.categories.filter(c => c.id !== id);
            emit('state:changed');
            void syncCategories();
        }
    });
};


/** Open a modal to edit an existing category's name / icon / color.
 *  Saves directly into STATE.categories, syncs to the server, and
 *  re-renders the personalization page so the row reflects the change.
 *
 *  Exported so the React Personalization page can call it from its
 *  edit-button click handler (pre-§3.3 React migration this was
 *  module-internal; the imperative renderPersonalization called it
 *  via a delegated click handler in the same file). */
export function openEditCategoryModal(categoryId: string) {
    const cat = STATE.categories.find(c => c.id === categoryId);
    if (!cat) return;

    // GG icon-key palette (native <select> can't hold inline SVG). Mirrors
    // Personalization's ADD_FORM_ICONS. Legacy categories that stored an emoji
    // resolve to their GG key via emojiToIconKey so the right swatch pre-selects;
    // saving always writes a KEY.
    const PALETTE = [
        'wine', 'coffee', 'utensils', 'iceCream', 'croissant',
        'bed', 'plane', 'taxi', 'bus', 'train',
        'car', 'ticket', 'shoppingBag', 'gift', 'backpack',
        'landmark', 'tree', 'theater', 'photo', 'globe',
    ];
    const initialKey = (cat.icon && ICON_PATHS[cat.icon]) ? cat.icon : (emojiToIconKey(cat.icon) ?? 'tag');
    const swatches = PALETTE
        .map((key) => `<button type="button" class="edit-cat-swatch${key === initialKey ? ' is-active' : ''}" role="radio" aria-checked="${key === initialKey}" data-key="${esc(key)}" title="${esc(key)}" style="display:flex;align-items:center;justify-content:center;width:100%;aspect-ratio:1;border-radius:13px;border:1.5px solid var(--glass-border, rgba(0,45,91,0.14));background:transparent;color:var(--text-brand-navy,#002d5b);cursor:pointer;transition:border-color .15s ease,color .15s ease,background .15s ease;">${iconSvg(key, { size: 20 })}</button>`)
        .join('');
    const secLabel = 'font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-secondary);display:block;margin-bottom:8px;';

    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 460px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 style="margin: 0 0 var(--space-5); font-size: var(--font-2xl); color: #002d5b; font-weight: 800; letter-spacing: -0.03em;">${esc(t('settings.editCategoryTitle'))}</h2>
            <form id="editCategoryForm" style="display: flex; flex-direction: column; gap: var(--space-5);">
                <div style="display:flex; gap: var(--space-4); align-items:flex-end;">
                    <div style="flex:1; min-width:0;">
                        <label style="${secLabel}">${esc(t('settings.editCategoryNameLabel'))}</label>
                        <input type="text" id="editCatName" class="glass-input" value="${esc(cat.name)}" placeholder="${esc(t('settings.editCategoryNamePlaceholder'))}" required style="width:100%;">
                    </div>
                    <div style="flex-shrink:0;">
                        <label style="${secLabel}">${esc(t('settings.editCategoryColorLabel'))}</label>
                        <label class="edit-cat-color" style="display:block; position:relative; width:46px; height:46px; border-radius:50%; overflow:hidden; cursor:pointer; box-shadow: inset 0 0 0 2px #fff, 0 0 0 1.5px var(--glass-border, rgba(0,45,91,0.18)), 0 2px 8px rgba(0,45,91,0.12);">
                            <input type="color" id="editCatColor" value="${esc(cat.color)}" style="position:absolute; inset:-8px; width:calc(100% + 16px); height:calc(100% + 16px); border:0; padding:0; margin:0; cursor:pointer;">
                        </label>
                    </div>
                </div>
                <div>
                    <label style="${secLabel}">${esc(t('settings.editCategoryIconLabel'))}</label>
                    <div id="editCatIconGrid" role="radiogroup" aria-label="${esc(t('settings.editCategoryIconLabel'))}" style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">${swatches}</div>
                </div>
                <div style="display: flex; gap: var(--space-3); margin-top: var(--space-1);">
                    <button type="button" id="cancelEditCatBtn" class="btn-neutral" style="flex: 1; border-radius: var(--radius-lg);">${esc(t('settings.editCategoryCancelBtn'))}</button>
                    <button type="submit" class="btn-primary" style="flex: 2;">${t('settings.editCategorySaveBtn')}</button>
                </div>
            </form>
        `,
    });

    let selectedKey = initialKey;
    root.querySelectorAll<HTMLButtonElement>('.edit-cat-swatch').forEach((btn) => {
        btn.addEventListener('click', () => {
            selectedKey = btn.dataset.key || 'tag';
            root.querySelectorAll<HTMLButtonElement>('.edit-cat-swatch').forEach((b) => paintSwatch(b, b === btn));
        });
    });
    // Selected swatch: accent border + tint + a slightly thicker ring so the
    // pick is obvious on the roomier grid.
    function paintSwatch(b: HTMLButtonElement, on: boolean) {
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.style.borderColor = on ? 'var(--accent-blue,#0071e3)' : 'var(--glass-border, rgba(0,45,91,0.14))';
        b.style.borderWidth = on ? '2px' : '1.5px';
        b.style.color = on ? 'var(--accent-blue,#0071e3)' : 'var(--text-brand-navy,#002d5b)';
        b.style.background = on ? 'rgba(0,113,227,0.08)' : 'transparent';
    }
    const active0 = root.querySelector<HTMLButtonElement>('.edit-cat-swatch.is-active');
    if (active0) paintSwatch(active0, true);

    (q(root, '#cancelEditCatBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#editCategoryForm') as HTMLFormElement).onsubmit = (e) => {
        e.preventDefault();
        const icon = selectedKey;
        const name = (q(root, '#editCatName') as HTMLInputElement).value.trim();
        const color = (q(root, '#editCatColor') as HTMLInputElement).value;
        if (!name) return;
        cat.icon = icon;
        cat.name = name;
        cat.color = color;
        emit('state:changed');
        void syncCategories();
        close();
    };
}
