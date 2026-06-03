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
import { navigate } from '../../router.js';
import { generateId } from '../../utils.js';
import { t } from '../../i18n.js';
import { showPersTab, openEditCategoryModal, deleteCategory } from '../settings.js';
import { RatesEditor } from './RatesEditor.js';
import { takePendingPersonalizationTab, type PersTab } from '../../utils/persTab.js';

const ADD_FORM_ICONS = [
    '🍷', '🏨', '✈️', '🚕', '🍕',
    '🎟️', '🛍️', '🍦', '🥐', '🏛️',
    '🏖️', '🎢', '🚠', '🚌', '🚆',
    '🌍', '🗺️', '🎒', '📸', '☕',
];

export function Personalization() {
    const categories = useStore((s) => s.categories);

    const [tab, setTab] = useState<PersTab>(() => takePendingPersonalizationTab() || 'categories');

    const iconRef = useRef<HTMLSelectElement | null>(null);
    const nameRef = useRef<HTMLInputElement | null>(null);
    const colorRef = useRef<HTMLInputElement | null>(null);
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
        navigate('personalization');
        setTimeout(() => {
            showPersTab('categories');
            setAdding(false);
        }, 50);
    };

    const pills: [PersTab, string][] = [
        ['categories', t('settings.categoriesTitle')],
        ['fx', t('settings.ratesTabFx')],
        ['infl', t('settings.ratesTabInflation')],
    ];

    return (
        <div>
            {/* Pill nav */}
            <div
                className="glass inline-flex p-1 rounded-[14px] border border-[var(--glass-border)] shadow-[var(--shadow-sm)] mb-6 flex-wrap"
                role="tablist"
            >
                {pills.map(([key, label]) => (
                    <button
                        key={key}
                        role="tab"
                        aria-selected={tab === key}
                        className={`toggle-btn ${tab === key ? 'active' : ''}`}
                        onClick={() => setTab(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Categories pill ───────────────────────────────────────────── */}
            {/* #persMenu/#persContent/#persCategories kept as anchors so the
                legacy showPersTab() (gettingStartedGuide) never crashes. */}
            <div id="persMenu" className="hidden" />
            <div id="persContent" className={tab === 'categories' ? 'contents' : 'hidden'}>
                <div id="persCategories" className="contents">
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
                                            <span className="cat-row__icon">{c.icon}</span>
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
                                <div className="flex gap-3 flex-wrap">
                                    <select ref={iconRef} id="catIcon" className="glass-input w-20" defaultValue={ADD_FORM_ICONS[0]}>
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
                </div>
            </div>

            {/* ── Exchange-rate + Inflation pills ───────────────────────────── */}
            {tab === 'fx' ? <RatesEditor mode="fx" /> : null}
            {tab === 'infl' ? <RatesEditor mode="infl" /> : null}
        </div>
    );
}
