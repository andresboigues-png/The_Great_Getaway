// pages/settings/Personalization.tsx — §3.3 React migration.
//
// Settings → Personalization. Split into three PILLS so the page isn't one long
// scroll: Categories, Exchange rates, Inflation. Categories manages the expense-
// category roster; the two rate pills mount the mode-aware <RatesEditor/> for the
// global manual FX / inflation overrides used by Insights "Worth today".
//
// Architectural notes:
//   - openEditCategoryModal stays in settings.ts as a showModal-driven helper.
//   - showPersTab keeps its imperative role-switching for gettingStartedGuide;
//     the #persMenu/#persContent/#persCategories anchors are preserved (as
//     display:contents/hidden wrappers) so it never blows up.
//   - openPersonalizationTab(tab) lets a deep-link (e.g. the Insights ⓘ "set in
//     settings" link) request which pill opens first.
//   - The Add Category form keeps native <select>/<input> trio + refs.

import { useRef, useState } from 'react';
import { useStore } from '../../react/store.js';
import { STATE, emit } from '../../state.js';
import { syncCategories } from '../../api.js';
import { generateId } from '../../utils.js';
import { t } from '../../i18n.js';
import { iconSvg, iconForCategory } from '../../icons.js';
import { openEditCategoryModal, deleteCategory } from '../settings.js';
import { RatesEditor } from './RatesEditor.js';
import { takePendingPersonalizationTab, type PersTab } from '../../utils/persTab.js';

// GG icon KEYS (not emoji). Native <select> can't render inline SVG, so the
// picker is a swatch grid: choosing a swatch stores its KEY on the new
// category. Legacy categories that stored an emoji still render fine via
// iconForCategory() (it maps a stored emoji → its GG icon).
const ADD_FORM_ICONS = [
    'wine', 'coffee', 'utensils', 'iceCream', 'croissant',
    'bed', 'plane', 'taxi', 'bus', 'train',
    'car', 'ticket', 'shoppingBag', 'gift', 'backpack',
    'landmark', 'tree', 'theater', 'photo', 'globe',
];

export function Personalization() {
    const categories = useStore((s) => s.categories);

    const [tab, setTab] = useState<PersTab>(() => takePendingPersonalizationTab() || 'categories');

    const nameRef = useRef<HTMLInputElement | null>(null);
    const colorRef = useRef<HTMLInputElement | null>(null);
    const [adding, setAdding] = useState(false);
    const [iconKey, setIconKey] = useState<string>(ADD_FORM_ICONS[0] ?? 'tag');

    const onAddCategory = () => {
        if (adding) return;
        const icon = iconKey || 'tag';
        const name = (nameRef.current?.value || '').trim();
        const color = colorRef.current?.value || '#ff3b30';
        if (!name) return;
        setAdding(true);
        STATE.categories.push({ id: generateId(), name, icon, color });
        emit('state:changed');
        void syncCategories();
        // The component re-renders from the emit above (useStore on
        // categories), so the new row appears in place — no navigate /
        // re-mount needed. Clear the name field for the next add; the empty
        // field also guards against a rapid double-submit (the `!name` early
        // return above fires on the second click).
        if (nameRef.current) nameRef.current.value = '';
        setAdding(false);
    };

    // [tab key, label, icon name]. Same pill format as the General-settings
    // SubTabStrip (icon + label, .general-subtab) so the two strips look
    // identical and share the mobile "icons-only" rule in settings.css.
    const pills: [PersTab, string, string][] = [
        ['categories', t('settings.categoriesTitle'), 'tag'],
        ['fx', t('settings.ratesTabFx'), 'exchange'],
        ['infl', t('settings.ratesTabInflation'), 'trendingUp'],
    ];

    return (
        <div>
            {/* Pill nav — mirrors the General-settings sub-tab strip. On mobile
                the label span is hidden (settings.css media query) so only the
                icon shows; the per-button aria-label/title keep it accessible. */}
            <div className="general-subtabs" role="tablist" aria-label="Personalization sections">
                {pills.map(([key, label, icon]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        aria-label={label}
                        title={label}
                        className={`general-subtab${tab === key ? ' is-active' : ''}`}
                        onClick={() => setTab(key)}
                    >
                        <span
                            className="general-subtab__icon inline-flex"
                            dangerouslySetInnerHTML={{ __html: iconSvg(icon, { size: 18 }) }}
                        />
                        <span className="general-subtab__label">{label}</span>
                    </button>
                ))}
            </div>

            {/* ── Categories pill ───────────────────────────────────────────── */}
            {tab === 'categories' ? (
                <div className="card glass settings-section card-glow-blue">
                            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                                <h2 className="card-title m-0">{t('settings.categoriesTitle')}</h2>
                                <span className="cat-count-chip">{categories.length}</span>
                            </div>

                            <div className="cat-list mb-5">
                                {categories.length === 0 ? (
                                    <div className="cat-list__empty">{t('settings.categoriesEmpty')}</div>
                                ) : (
                                    categories.map((c) => (
                                        <div key={c.id} className="cat-row" style={{ ['--cat-color' as string]: c.color }}>
                                            <span className="cat-row__stripe" aria-hidden="true"></span>
                                            <span
                                                className="cat-row__icon"
                                                dangerouslySetInnerHTML={{ __html: iconForCategory(c.icon, { size: 20 }) }}
                                            />
                                            <span className="cat-row__name">{c.name}</span>
                                            <span className="cat-row__swatch" style={{ background: c.color }} aria-label={`Color ${c.color}`}></span>
                                            <div className="cat-row__actions">
                                                <button
                                                    className="cat-row__btn cat-row__btn--edit edit-category-btn"
                                                    data-category-id={c.id}
                                                    title={t('settings.categoryEditTooltip')}
                                                    aria-label={t('settings.categoryEditAriaLabel')}
                                                    onClick={() => openEditCategoryModal(c.id)}
                                                >
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="section-divider">
                                <h3 className="mb-3 text-[length:var(--font-lg)]">{t('settings.categoryAddNewHeading')}</h3>
                                {/* Icon picker — was an emoji <select>; a native
                                    option can't hold inline SVG, so it's now a
                                    swatch grid of GG line-icons. Picking a swatch
                                    stores its icon KEY on the new category. */}
                                <div
                                    className="flex flex-wrap gap-2 mb-3"
                                    role="radiogroup"
                                    aria-label={t('settings.categoryAddNewHeading')}
                                >
                                    {ADD_FORM_ICONS.map((key) => {
                                        const active = iconKey === key;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                aria-label={key}
                                                className="inline-flex items-center justify-center"
                                                style={{
                                                    width: 38,
                                                    height: 38,
                                                    padding: 0,
                                                    borderRadius: 10,
                                                    cursor: 'pointer',
                                                    color: active ? 'var(--accent-blue)' : 'var(--text-primary)',
                                                    border: active
                                                        ? '2px solid var(--accent-blue)'
                                                        : '1px solid var(--glass-border)',
                                                    background: active ? 'rgba(0,113,227,0.10)' : 'rgba(0,0,0,0.04)',
                                                }}
                                                onClick={() => setIconKey(key)}
                                                dangerouslySetInnerHTML={{ __html: iconSvg(key, { size: 18 }) }}
                                            />
                                        );
                                    })}
                                </div>
                                <div className="flex gap-3 flex-wrap">
                                    <input
                                        ref={nameRef}
                                        type="text"
                                        id="catName"
                                        className="glass-input flex-1 min-w-[150px]"
                                        placeholder={t('settings.categoryNamePlaceholder')}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                onAddCategory();
                                            }
                                        }}
                                    />
                                    <input ref={colorRef} type="color" id="catColor" className="glass-input w-[50px] p-0.5" defaultValue="#ff3b30" />
                                    <button id="addCatBtn" className="btn-primary py-3 px-5" onClick={onAddCategory} disabled={adding}>
                                        {t('settings.categoryAddBtn')}
                                    </button>
                                </div>
                            </div>
                </div>
            ) : null}

            {/* ── Exchange-rate + Inflation pills ───────────────────────────── */}
            {tab === 'fx' ? <RatesEditor mode="fx" /> : null}
            {tab === 'infl' ? <RatesEditor mode="infl" /> : null}
        </div>
    );
}
