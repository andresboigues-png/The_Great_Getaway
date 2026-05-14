// pages/settings/Personalization.tsx — §3.3 React migration.
//
// Was a thin wrapper that mounted the legacy renderPersonalization()
// into a React tree (Phase C3 wave 5). This commit replaces the
// wrapper with a full JSX implementation — the legacy 110-line
// imperative renderer in pages/settings.ts is now retired.
//
// Architectural notes:
//   - openEditCategoryModal stays in settings.ts as a showModal-
//     driven helper (it's a transient form, not part of the page's
//     persistent JSX). The categories-list row triggers it via
//     onClick, same as the legacy click delegation did.
//   - showPersTab keeps its imperative role-switching behaviour
//     because home/gettingStartedGuide still imports it. The React
//     component reads the same persMenu/persContent DOM ids that
//     showPersTab toggles, so the imperative + declarative paths
//     coexist without conflict.
//   - The Add Category form keeps its native <select>/<input>/
//     <input type="color"> trio rather than a React-controlled
//     state to stay close to the legacy form. Submit grabs values
//     via refs.

import { useRef, useState } from 'react';
import { useStore } from '../../react/store.js';
import { STATE, emit } from '../../state.js';
import { syncCategories } from '../../api.js';
import { navigate } from '../../router.js';
import { generateId } from '../../utils.js';
import { t } from '../../i18n.js';
import { showPersTab, openEditCategoryModal, deleteCategory } from '../settings.js';

// Same icon roster the legacy form offered. Kept inline rather than
// shared with openEditCategoryModal's roster because the modal also
// includes a few extras (medical, theatre, transport) that the add
// form doesn't surface — the divergence is intentional and matches
// the pre-fix UX exactly.
const ADD_FORM_ICONS = [
    '🍷', '🏨', '✈️', '🚕', '🍕',
    '🎟️', '🛍️', '🍦', '🥐', '🏛️',
    '🏖️', '🎢', '🚠', '🚌', '🚆',
    '🌍', '🗺️', '🎒', '📸', '☕',
];


export function Personalization() {
    // Subscribe so add/edit/delete propagate after navigate('personalization')
    // re-mounts this component (matches the legacy flow).
    const categories = useStore((s) => s.categories);

    // Native form refs — the legacy code read these values via
    // document.getElementById on submit. Keeping native + refs avoids
    // a controlled-input migration that would land hundreds of lines
    // of React state churn for no functional gain.
    const iconRef = useRef<HTMLSelectElement | null>(null);
    const nameRef = useRef<HTMLInputElement | null>(null);
    const colorRef = useRef<HTMLInputElement | null>(null);
    // Optimistic disable on the Add button — prevents double-click
    // creating two categories with the same name on a slow click.
    const [adding, setAdding] = useState(false);

    const onAddCategory = () => {
        if (adding) return;
        const icon = iconRef.current?.value || '🍷';
        const name = (nameRef.current?.value || '').trim();
        const color = colorRef.current?.value || '#ff3b30';
        if (!name) return;
        setAdding(true);
        STATE.categories.push({ id: generateId(), name, icon, color });
        emit('state:changed');
        syncCategories();
        // Re-render via navigate (same flow as the legacy code) — the
        // useStore subscription would re-render in place too, but the
        // navigate also reasserts the "you're on the categories
        // sub-tab" state via the showPersTab call below.
        navigate('personalization');
        setTimeout(() => {
            showPersTab('categories');
            setAdding(false);
        }, 50);
    };

    return (
        <div>
            <div className="ai-page-header">
                <h1
                    className="gradient-text"
                    style={{
                        ['--g-from' as any]: '#1a6b3c',
                        ['--g-to' as any]: '#34c759',
                    }}
                >
                    {t('settings.personalizationTitle')}
                </h1>
                <p>{t('settings.personalizationSubtitle')}</p>
            </div>

            {/* Menu card — only "Manage Categories" today. Companion
                management used to live here too before the per-trip
                refactor; this is what's left. The pers-tab-card
                class hooks into showPersTab's DOM toggle (sets
                #persMenu display:none + #persContent display:block). */}
            <div id="persMenu" className="grid-2">
                <button
                    type="button"
                    className="card-button-reset card glass card-glow-blue pers-tab-card"
                    data-tab="categories"
                    onClick={() => showPersTab('categories')}
                >
                    <h2 className="card-title" style={{ color: '#005bb8' }}>
                        {t('settings.manageCategoriesTitle')}
                    </h2>
                    <p className="text-muted">{t('settings.manageCategoriesBody')}</p>
                </button>
            </div>

            {/* Content area — hidden by default, revealed by showPersTab.
                Same #persContent / #persCategories ids the imperative
                helper toggles via inline style. React doesn't need to
                manage display itself; showPersTab still works because
                we render the same id'd nodes. */}
            <div id="persContent" style={{ display: 'none' }}>
                <button
                    className="btn btn-small btn-liquid-glass pers-tab-card"
                    data-tab="menu"
                    onClick={() => showPersTab('menu')}
                    style={{ marginBottom: '20px' }}
                >
                    {t('settings.backToPersonalization')}
                </button>

                <div id="persCategories" style={{ display: 'none' }}>
                    <div className="card glass card-glow-blue">
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                marginBottom: 'var(--space-4)',
                                flexWrap: 'wrap',
                            }}
                        >
                            <h2 className="card-title" style={{ color: '#005bb8', margin: 0 }}>
                                {t('settings.categoriesTitle')}
                            </h2>
                            <span className="cat-count-chip">{categories.length}</span>
                        </div>

                        {/* Category list. Each row is a colored-stripe
                            card with icon + name + swatch + edit/delete
                            chips. Empty state shows the localised
                            "no categories" prompt. */}
                        <div className="cat-list" style={{ marginBottom: 'var(--space-5)' }}>
                            {categories.length === 0 ? (
                                <div className="cat-list__empty">
                                    {t('settings.categoriesEmpty')}
                                </div>
                            ) : (
                                categories.map((c) => (
                                    <div
                                        key={c.id}
                                        className="cat-row"
                                        style={{ ['--cat-color' as any]: c.color }}
                                    >
                                        <span className="cat-row__stripe" aria-hidden="true"></span>
                                        <span className="cat-row__icon">{c.icon}</span>
                                        <span className="cat-row__name">{c.name}</span>
                                        <span
                                            className="cat-row__swatch"
                                            style={{ background: c.color }}
                                            aria-label={`Color ${c.color}`}
                                        ></span>
                                        <div className="cat-row__actions">
                                            <button
                                                className="cat-row__btn cat-row__btn--edit edit-category-btn"
                                                data-category-id={c.id}
                                                title={t('settings.categoryEditTooltip')}
                                                aria-label={t('settings.categoryEditAriaLabel')}
                                                onClick={() => openEditCategoryModal(c.id)}
                                            >
                                                <svg
                                                    width="13"
                                                    height="13"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.4"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M12 20h9"></path>
                                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                                </svg>
                                            </button>
                                            <button
                                                className="cat-row__btn cat-row__btn--delete delete-category-btn"
                                                data-category-id={c.id}
                                                title={t('settings.categoryDeleteTooltip')}
                                                aria-label={t('settings.categoryDeleteAriaLabel')}
                                                onClick={() => deleteCategory(c.id)}
                                            >
                                                <svg
                                                    width="13"
                                                    height="13"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.4"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Add-new-category form. Keeps the legacy
                            inline <select>/<input>/<input type=color>
                            trio with refs. On click, reads the three
                            values + pushes a category, syncs to server,
                            re-navigates so the list re-renders with
                            the new row. */}
                        <div className="section-divider">
                            <h3
                                style={{
                                    marginBottom: 'var(--space-3)',
                                    fontSize: 'var(--font-lg)',
                                }}
                            >
                                {t('settings.categoryAddNewHeading')}
                            </h3>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 'var(--space-3)',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <select
                                    ref={iconRef}
                                    id="catIcon"
                                    className="glass-input"
                                    style={{ width: '80px' }}
                                    defaultValue={ADD_FORM_ICONS[0]}
                                >
                                    {ADD_FORM_ICONS.map((i) => (
                                        <option key={i} value={i}>
                                            {i}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    ref={nameRef}
                                    type="text"
                                    id="catName"
                                    className="glass-input"
                                    placeholder={t('settings.categoryNamePlaceholder')}
                                    style={{ flex: 1, minWidth: '150px' }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            onAddCategory();
                                        }
                                    }}
                                />
                                <input
                                    ref={colorRef}
                                    type="color"
                                    id="catColor"
                                    className="glass-input"
                                    defaultValue="#ff3b30"
                                    style={{ width: '50px', padding: '2px' }}
                                />
                                <button
                                    id="addCatBtn"
                                    className="btn-primary"
                                    onClick={onAddCategory}
                                    disabled={adding}
                                    style={{ padding: 'var(--space-3) var(--space-5)' }}
                                >
                                    {t('settings.categoryAddBtn')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
