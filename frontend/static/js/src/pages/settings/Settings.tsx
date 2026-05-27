// pages/settings/Settings.tsx — §3.3 React migration.
//
// Was a thin wrapper that mounted the legacy renderSettings() into
// a React tree. This commit replaces the wrapper with a full JSX
// implementation — the legacy 641-line imperative renderer in
// pages/settings.ts is now retired.
//
// Architectural notes:
//   - Tab + general-sub-tab state is externalised in ./tabState.ts
//     so external callers (upload.ts → after CSV import) can switch
//     to the format tab via setSettingsTab('format') and the live
//     React component re-renders. useState alone wouldn't suffice
//     because the external call happens AFTER mount. Same pub-sub
//     pattern useStore uses for STATE.
//   - useStore subscribes to STATE.customFormat / .savedFormats /
//     .preferences — mutations (state:changed emits) re-paint the
//     mapped-rows list, saved-formats list, theme picker, POI rows,
//     language picker without manual switchSettingsTab() calls.
//   - Reset, format-delete, and format-edit confirmations stay as
//     showConfirmModal / showLiquidAlert flows because those are
//     transient overlays driven by the imperative Modal helper.
//   - The Format-mapping name input is a CONTROLLED React state
//     so that "Edit saved format" can pre-fill the name in one
//     atomic state update. Legacy code did this via getElementById
//     + .value = ... wrapped in setTimeout(50).
//
// External coupling preserved:
//   - showSettingsTab (settings.ts) — now thin wrapper around
//     setSettingsTab; upload.ts keeps working.
//   - showPersTab, deleteCategory, openEditCategoryModal — left
//     in settings.ts untouched (the personalization page uses
//     them).

import { useState, useSyncExternalStore } from 'react';
import { useStore } from '../../react/store.js';
import { STATE, emit } from '../../state.js';
import { generateId, showConfirmModal, showLiquidAlert, esc } from '../../utils.js';
import { showModal } from '../../components/Modal.js';
import { syncCategories, apiFetch } from '../../api.js';
import { POI_CATEGORIES, getPoiTooltip } from '../home.js';
import { setTheme } from '../../theme.js';
import { t, getLocale, setLocale, type Locale } from '../../i18n.js';
import {
    getSettingsTabState,
    setSettingsTab,
    setGeneralSubTab,
    subscribeSettingsTab,
    getSettingsTabVersion,
    type GeneralSubTab,
} from './tabState.js';
import { Personalization } from './Personalization.js';
import { Developer } from './Developer.js';
import { SessionsView } from './Sessions.js';
import { BlocksView } from './Blocks.js';
// Page-scoped CSS — Theme picker styles. FIXING_ROADMAP §3.1 first
// slice: importing CSS from the page module lets Vite chunk it into
// the Settings JS bundle, so users who never visit /settings don't
// pay for these styles in the initial CSS payload.
import './settings.css';

/** Email allowlist for the Developer settings card. Must match
 *  src/routes/admin.py::ADMIN_EMAILS — the real gate is server-side
 *  (any non-admin caller gets 403 from /api/admin/stats), this list
 *  just hides the menu entry so non-admins don't see a 403'ing card.
 *  Lowercased compare to avoid case-sensitivity bugs on Google-issued
 *  email addresses. */
const ADMIN_EMAILS = new Set(['andres.boigues@gmail.com']);
function isAdminUser(): boolean {
    const email = (STATE.user?.email || '').trim().toLowerCase();
    return ADMIN_EMAILS.has(email);
}


// MANDATORY column variables — without 'category' every imported
// expense lands in the default; the upload reader does find-or-create
// on the cell value so users can either reuse an existing category or
// auto-create one. 'splits' takes free-text like "Alice:50,Bob:50";
// 'isSettlement' takes Y/N to flag a row as a transfer rather than an
// expense (the receiver is read from the splits cell when Y).
const MANDATORY_VARS = ['label', 'date', 'value', 'who', 'category'];
const OPTIONAL_VARS = ['country', 'currency', 'splits', 'isSettlement'];
const RATING_OPTIONS = [0, 3, 3.5, 4, 4.5];


// ── tab-state hook ──────────────────────────────────────────────────
// useSyncExternalStore is the React-recommended way to bridge a
// module-level store into the component tree. We pass the same
// getSnapshot as both getSnapshot and getServerSnapshot so the
// hook works fine even though we don't SSR.
function useSettingsTabSnapshot() {
    useSyncExternalStore(
        subscribeSettingsTab,
        getSettingsTabVersion,
        getSettingsTabVersion,
    );
    return getSettingsTabState();
}


// ── defensive POI-prefs backfill ────────────────────────────────────
// loadState already runs validateLoadedState which seeds these — this
// is the same belt-and-braces fallback the legacy code had against a
// hand-edited localStorage that bypasses validation.
function ensurePoiPrefs(): void {
    if (!STATE.preferences) {
        STATE.preferences = {
            mapDefaultPois: ['sights', 'parks', 'transit'],
            poiFilters: {},
            pillEpicenters: {},
            poiAnchoring: {},
            poiVisible: {},
            enabledPois: {},
        };
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


// ── reset confirms ──────────────────────────────────────────────────
// Three reset flavours, each wrapped in showConfirmModal. The bodies
// mutate STATE, emit state:changed, and (for trips/app) also wipe
// the server-side data via apiFetch. The component re-renders
// automatically via the useStore subscription.
function confirmResetTrips(): void {
    showConfirmModal({
        title: t('settings.resetTripsConfirmTitle'),
        message: t('settings.resetTripsConfirmMessage'),
        confirmText: t('settings.resetTripsConfirmBtn'),
        onConfirm: async () => {
            STATE.trips = [];
            STATE.archivedTrips = [];
            STATE.tripDays = [];
            STATE.expenses = [];
            STATE.budgets = [];
            STATE.activeTripId = null;
            emit('state:changed');
            if (STATE.user) {
                try {
                    await apiFetch('/api/user-data', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                    });
                } catch (e) {
                    console.error('Server wipe failed', e);
                }
            }
        },
    });
}

function confirmResetCategories(): void {
    showConfirmModal({
        title: t('settings.resetCategoriesConfirmTitle'),
        message: t('settings.resetCategoriesConfirmMessage'),
        confirmText: t('settings.resetCategoriesConfirmBtn'),
        onConfirm: () => {
            STATE.categories = [
                { id: 'c1', name: 'Food', icon: '🍔', color: '#ff3b30' },
                { id: 'c2', name: 'Transport', icon: '✈️', color: '#007aff' },
                { id: 'c3', name: 'Accommodation', icon: '🏨', color: '#5856d6' },
            ];
            emit('state:changed');
            syncCategories();
        },
    });
}

function confirmResetApp(): void {
    showConfirmModal({
        title: t('settings.resetFactoryConfirmTitle'),
        message: t('settings.resetFactoryConfirmMessage'),
        confirmText: t('settings.resetFactoryConfirmBtn'),
        onConfirm: async () => {
            if (STATE.user) {
                try {
                    await apiFetch('/api/user-data', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                    });
                } catch (e) {
                    console.error('Server wipe failed', e);
                }
            }
            STATE.trips = [];
            STATE.archivedTrips = [];
            STATE.tripDays = [];
            STATE.expenses = [];
            STATE.budgets = [];
            STATE.categories = [];
            STATE.activeTripId = null;
            STATE.user = null;
            STATE.notifications = [];
            STATE.hasLoggedInBefore = false;
            emit('state:changed');
            localStorage.clear();
            location.reload();
        },
    });
}


// ────────────────────────────────────────────────────────────────────
// Top-level component
// ────────────────────────────────────────────────────────────────────
export function Settings() {
    const { tab } = useSettingsTabSnapshot();

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
                    {t('settings.systemControlTitle')}
                </h1>
                <p>{t('settings.systemControlSubtitle')}</p>
            </div>

            {tab === 'menu' ? (
                <MenuView />
            ) : (
                <>
                    <button
                        type="button"
                        className="btn btn-small btn-liquid-glass mb-6 py-2.5 px-5 rounded-[14px]"
                        onClick={() => setSettingsTab('menu')}
                    >
                        {t('settings.backToControlCenter')}
                    </button>
                    {tab === 'general' && <GeneralView />}
                    {tab === 'format' && <FormatView />}
                    {tab === 'reset' && <ResetView />}
                    {tab === 'personalization' && <Personalization />}
                    {tab === 'sessions' && <SessionsView />}
                    {tab === 'blocks' && <BlocksView />}
                    {tab === 'developer' && isAdminUser() && <Developer />}
                </>
            )}
        </div>
    );
}


// ── Menu (3 big cards) ─────────────────────────────────────────────
function MenuView() {
    return (
        <div className="settings-grid">
            <button
                type="button"
                className="card-button-reset card glass management-card"
                onClick={() => setSettingsTab('general')}
            >
                <h2 className="card-title text-accent-blue-deep m-0">
                    {t('settings.cardGeneralTitle')}
                </h2>
                <p className="st-help-text">
                    {t('settings.cardGeneralBody')}
                </p>
                <div className="mt-5 text-accent-blue-deep font-bold text-[0.85rem]">
                    {t('settings.cardConfigureCta')}
                </div>
            </button>

            <button
                type="button"
                className="card-button-reset card glass management-card"
                onClick={() => setSettingsTab('format')}
            >
                <h2 className="card-title text-[#a85d00] m-0">
                    {t('settings.cardFormatTitle')}
                </h2>
                <p className="st-help-text">
                    {t('settings.cardFormatBody')}
                </p>
                <div className="mt-5 text-[#a85d00] font-bold text-[0.85rem]">
                    {t('settings.cardConfigureCta')}
                </div>
            </button>

            {/* Personalization — was a top-level sidebar entry; folded
                into Settings as a 4th menu card in 2026-05-14 to keep
                the Preferences sidebar section from carrying two
                near-identical items. Direct /personalization route
                still mounts the same page (kept for deep links). */}
            <button
                type="button"
                className="card-button-reset card glass management-card"
                onClick={() => setSettingsTab('personalization')}
            >
                <h2 className="card-title text-[#34c759] m-0">
                    {t('settings.cardPersonalizationTitle')}
                </h2>
                <p className="st-help-text">
                    {t('settings.cardPersonalizationBody')}
                </p>
                <div className="mt-5 text-[#34c759] font-bold text-[0.85rem]">
                    {t('settings.cardConfigureCta')}
                </div>
            </button>

            {/* Sessions — added 2026-05-27 (audit fix #57). Surfaces
                the per-device session list from /api/auth/sessions so
                users can see + revoke individual devices instead of
                the all-or-nothing logout the legacy single-jti
                scheme allowed. */}
            <button
                type="button"
                className="card-button-reset card glass management-card"
                onClick={() => setSettingsTab('sessions')}
            >
                <h2 className="card-title text-accent-blue-deep m-0">
                    Active sessions
                </h2>
                <p className="st-help-text">
                    See where you're signed in and sign out of any device.
                </p>
                <div className="mt-5 text-accent-blue-deep font-bold text-[0.85rem]">
                    {t('settings.cardConfigureCta')}
                </div>
            </button>

            {/* Blocked users — added 2026-05-27 (audit fix #59). Surfaces
                the block primitive from fix #36 so a stray "Block" tap
                on a profile card can be reviewed + reversed without
                going through Support. Sits beside Sessions because
                both are account-safety affordances. */}
            <button
                type="button"
                className="card-button-reset card glass management-card"
                onClick={() => setSettingsTab('blocks')}
            >
                <h2 className="card-title text-accent-blue-deep m-0">
                    Blocked users
                </h2>
                <p className="st-help-text">
                    Review and unblock people you've blocked from following
                    or interacting with you.
                </p>
                <div className="mt-5 text-accent-blue-deep font-bold text-[0.85rem]">
                    {t('settings.cardConfigureCta')}
                </div>
            </button>

            {/* Developer settings — admin-only secret dashboard.
                Rendered only when STATE.user.email matches one of
                the ADMIN_EMAILS allow-listed at the top of this
                file. The 403 from /api/admin/stats is the real gate;
                this hide-the-card check is just to keep non-admins
                from seeing a card that would error if they tapped
                it. */}
            {isAdminUser() && (
                <button
                    type="button"
                    className="card-button-reset card glass management-card"
                    onClick={() => setSettingsTab('developer')}
                >
                    <h2 className="card-title text-accent-purple-deep m-0">
                        {t('settings.cardDeveloperTitle')}
                    </h2>
                    <p className="st-help-text">
                        {t('settings.cardDeveloperBody')}
                    </p>
                    <div className="mt-5 text-accent-purple-deep font-bold text-[0.85rem]">
                        {t('settings.cardConfigureCta')}
                    </div>
                </button>
            )}

            <button
                type="button"
                className="card-button-reset card glass management-card danger-card"
                onClick={() => setSettingsTab('reset')}
            >
                <div className="danger-glow pulse-red"></div>
                <h2 className="card-title text-[#ff3b30] m-0">
                    {t('settings.cardDataMgmtTitle')}
                </h2>
                <p className="st-help-text">
                    {t('settings.cardDataMgmtBody')}
                </p>
                <div className="mt-5 text-[#ff3b30] font-bold text-[0.85rem]">
                    {t('settings.cardDataMgmtCta')}
                </div>
            </button>
        </div>
    );
}


// ── General view (sub-tab strip + active sub-content) ──────────────
function GeneralView() {
    const { generalSubTab } = useSettingsTabSnapshot();

    return (
        <>
            <SubTabStrip current={generalSubTab} />
            {generalSubTab === 'pills' && <GeneralPillsSection />}
            {generalSubTab === 'appearance' && <GeneralAppearanceSection />}
            {generalSubTab === 'language' && <GeneralLanguageSection />}
        </>
    );
}


function SubTabStrip({ current }: { current: GeneralSubTab }) {
    const tab = (key: GeneralSubTab) => (current === key ? ' is-active' : '');
    return (
        <div className="general-subtabs" role="tablist" aria-label="General settings sections">
            <button
                type="button"
                className={`general-subtab${tab('pills')}`}
                role="tab"
                aria-selected={current === 'pills'}
                onClick={() => setGeneralSubTab('pills')}
            >
                <span className="general-subtab__icon">🗺️</span>
                <span className="general-subtab__label">{t('settings.subtabPills')}</span>
            </button>
            <button
                type="button"
                className={`general-subtab${tab('appearance')}`}
                role="tab"
                aria-selected={current === 'appearance'}
                onClick={() => setGeneralSubTab('appearance')}
            >
                <span className="general-subtab__icon">🎨</span>
                <span className="general-subtab__label">{t('settings.appearance')}</span>
            </button>
            <button
                type="button"
                className={`general-subtab${tab('language')}`}
                role="tab"
                aria-selected={current === 'language'}
                onClick={() => setGeneralSubTab('language')}
            >
                <span className="general-subtab__icon">🌐</span>
                <span className="general-subtab__label">{t('settings.language')}</span>
            </button>
        </div>
    );
}


// ── General → Map pills (POI filters) ──────────────────────────────
function GeneralPillsSection() {
    // useStore subscription — every state:changed emit re-renders.
    // We need this so a per-row rating/anchor/visibility change
    // re-paints the active state on its row.
    const prefs = useStore((s) => s.preferences);
    const filters = prefs?.poiFilters || {};
    const anchoring = prefs?.poiAnchoring || {};
    const visibility = prefs?.poiVisible || {};

    // 2026-05-25: pill ⓘ button opens a real modal with a close X
    // (was a 3-second toast which auto-dismissed before the user
    // could finish reading the longer descriptions). Title shows
    // the pill icon + name; body shows the full tooltip text.
    const openPoiInfoModal = (c: { key: string; label: string; icon: string }) => {
        // Tooltip text is locale-scoped — resolves through the
        // shared `getPoiTooltip(key)` helper so the modal body
        // reflects the active i18n locale, not the English copy
        // that used to live inline on the POI_CATEGORIES entries.
        const tooltip = getPoiTooltip(c.key);
        const innerHTML = `
            <div style="text-align:left;">
                <div style="display:flex; align-items:center; gap:14px; padding:18px 22px; background:linear-gradient(135deg, var(--accent-blue) 0%, #5856d6 100%); color:white; border-top-left-radius: var(--radius-3xl); border-top-right-radius: var(--radius-3xl);">
                    <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.18); border:1px solid rgba(255,255,255,0.28); display:inline-flex; align-items:center; justify-content:center; font-size:1.5rem; flex-shrink:0;">${c.icon}</div>
                    <div style="flex:1; min-width:0;">
                        <h2 style="margin:0; font-size:1.15rem; color:white; font-weight:800; letter-spacing:-0.02em; line-height:1.2;">${esc(c.label)}</h2>
                        <p style="margin:3px 0 0; color:rgba(255,255,255,0.85); font-size:0.78rem; font-weight:600;">${esc(t('settings.poiInfoModalSubtitle'))}</p>
                    </div>
                </div>
                <div style="padding:20px 22px 6px; color:var(--text-primary); font-size:0.92rem; line-height:1.5;">
                    ${esc(tooltip)}
                </div>
                <div style="padding:18px 22px 22px;">
                    <button type="button" id="poiInfoCloseBtn" style="width:100%; padding:11px 18px; border-radius:12px; border:0; background:linear-gradient(135deg, var(--accent-blue), #5856d6); color:white; font-weight:800; font-size:0.9rem; cursor:pointer; box-shadow:0 4px 12px rgba(0,113,227,0.28);">${esc(t('settings.poiInfoModalClose'))}</button>
                </div>
            </div>
        `;
        const { root, close } = showModal({
            innerHTML,
            cardStyle: 'max-width: 480px; width: min(480px, calc(100vw - 24px)); padding: 0; overflow: hidden; background: white;',
        });
        const closeBtn = root.querySelector('#poiInfoCloseBtn') as HTMLButtonElement | null;
        if (closeBtn) closeBtn.onclick = () => close();
    };

    const onResetPoi = (key: string) => {
        ensurePoiPrefs();
        delete STATE.preferences.poiFilters[key];
        delete STATE.preferences.poiAnchoring[key];
        delete STATE.preferences.poiVisible[key];
        emit('state:changed');
    };

    const onRatingChange = (key: string, value: number) => {
        ensurePoiPrefs();
        STATE.preferences.poiFilters[key] = { minRating: value };
        emit('state:changed');
    };

    const onAnchorChange = (key: string, value: 'anchor' | 'epicenter') => {
        ensurePoiPrefs();
        STATE.preferences.poiAnchoring[key] = value;
        emit('state:changed');
    };

    const onVisibilityToggle = (key: string, checked: boolean) => {
        ensurePoiPrefs();
        // Default is visible (true). Only persist when the user
        // hides — checked = visible = "remove the override".
        if (checked) delete STATE.preferences.poiVisible[key];
        else STATE.preferences.poiVisible[key] = false;
        emit('state:changed');
    };

    // Roads & traffic isn't a Places-API pill, no rating / anchor filter applies.
    const rows = POI_CATEGORIES.filter((c) => c.placesType);

    return (
        // Padding + borderRadius moved into the .settings-section
        // CSS class so the responsive mobile sweep can shrink them
        // (inline styles otherwise win specificity and force an
        // !important elsewhere). See "Settings → General → POI
        // filters: responsive layout" in index.css.
        <div className="card glass settings-section">
            <h2 className="text-accent-blue-deep mt-0">{t('settings.poiTitle')}</h2>
            <p className="st-paragraph-mb-16">
                {t('settings.poiIntroVisibility')}
            </p>
            <p className="st-paragraph-mb-16">
                {t('settings.poiIntroRating')}
            </p>
            <p className="st-paragraph-mb-24">
                {t('settings.poiIntroAnchor')}
            </p>
            <div className="poi-filter-list">
                {rows.map((c) => {
                    const userMin =
                        typeof filters[c.key]?.minRating === 'number'
                            ? filters[c.key]!.minRating!
                            : c.defaultMinRating;
                    const userAnchor = anchoring[c.key];
                    const effectiveAnchor =
                        userAnchor === 'anchor' || userAnchor === 'epicenter'
                            ? userAnchor
                            : c.useAnchorAlways
                              ? 'anchor'
                              : 'epicenter';
                    const defaultAnchor: 'anchor' | 'epicenter' = c.useAnchorAlways ? 'anchor' : 'epicenter';
                    const isVisible = visibility[c.key] !== false;
                    const isRatingCustom = userMin !== c.defaultMinRating;
                    const isAnchorCustom =
                        (userAnchor === 'anchor' || userAnchor === 'epicenter') &&
                        userAnchor !== defaultAnchor;
                    const isVisibilityCustom = !isVisible;
                    const isCustom = isRatingCustom || isAnchorCustom || isVisibilityCustom;
                    return (
                        <div
                            key={c.key}
                            className={`poi-filter-row${isVisible ? '' : ' poi-filter-row--hidden'}`}
                        >
                            <span className="poi-filter-row__icon">{c.icon}</span>
                            <div className="poi-filter-row__body">
                                <div className="poi-filter-row__label">
                                    {c.label}
                                    {/* 2026-05-24: each pill used to render
                                        a full-paragraph tooltip below the
                                        label — readable but ate ~40% of the
                                        screen on mobile when stacked. Now
                                        the description is hidden behind an
                                        ⓘ button. 2026-05-25 follow-up:
                                        switched from a temporary toast
                                        (auto-dismiss after ~3s) to a real
                                        modal with a Close button. The
                                        toast was too short for the longer
                                        paragraphs and disappeared before
                                        the user could finish reading. */}
                                    {(() => {
                                        // Look the tooltip up once per render —
                                        // the chip is hidden when the pill has no
                                        // translation (defensive; today every
                                        // shipped pill has a poiTooltips entry).
                                        const tooltip = getPoiTooltip(c.key);
                                        return tooltip ? (
                                            <button
                                                type="button"
                                                className="poi-filter-row__info-btn"
                                                aria-label={t('settings.poiInfoBtnAria', { name: c.label })}
                                                title={tooltip}
                                                onClick={() => openPoiInfoModal(c)}
                                            >
                                                ⓘ
                                            </button>
                                        ) : null;
                                    })()}
                                </div>
                            </div>
                            <select
                                className="poi-anchor-mode"
                                value={effectiveAnchor}
                                aria-label={t('settings.poiAnchorAriaLabel', { label: c.label })}
                                title={t('settings.poiAnchorTooltip')}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    if (v === 'anchor' || v === 'epicenter') onAnchorChange(c.key, v);
                                }}
                            >
                                <option value="epicenter">{t('settings.poiAnchorDayAware')}</option>
                                <option value="anchor">{t('settings.poiAnchorTripWide')}</option>
                            </select>
                            <select
                                className="poi-filter-rating"
                                value={String(userMin)}
                                aria-label={t('settings.poiRatingAriaLabel', { label: c.label })}
                                onChange={(e) => onRatingChange(c.key, parseFloat(e.target.value))}
                            >
                                {RATING_OPTIONS.map((v) => (
                                    <option key={v} value={String(v)}>
                                        {v === 0 ? t('settings.poiAnyRating') : `${v}★ +`}
                                    </option>
                                ))}
                            </select>
                            <span
                                className="poi-filter-row__default"
                                title={`Defaults: ${c.defaultMinRating === 0 ? t('settings.poiAnyRating') : c.defaultMinRating + '★+'} / ${defaultAnchor === 'anchor' ? t('settings.poiAnchorTripWide') : t('settings.poiAnchorDayAware')} / shown`}
                            >
                                {isCustom ? (
                                    <button
                                        type="button"
                                        className="poi-filter-reset"
                                        title={t('settings.poiResetTooltip')}
                                        onClick={() => onResetPoi(c.key)}
                                    >
                                        {t('settings.poiResetBtn')}
                                    </button>
                                ) : (
                                    <span className="muted">{t('settings.poiDefaultLabel')}</span>
                                )}
                            </span>
                            <label
                                className="switch poi-visibility-switch"
                                title={
                                    isVisible
                                        ? t('settings.poiVisibilitySwitchTitleVisible')
                                        : t('settings.poiVisibilitySwitchTitleHidden')
                                }
                            >
                                <input
                                    type="checkbox"
                                    className="poi-visibility-toggle"
                                    checked={isVisible}
                                    onChange={(e) => onVisibilityToggle(c.key, e.target.checked)}
                                />
                                <span className="slider"></span>
                            </label>
                        </div>
                    );
                })}
            </div>
            <p className="text-secondary mt-6 mx-0 mb-0 text-[0.85rem]">
                {t('settings.poiOutroNote')}
            </p>
        </div>
    );
}


// ── General → Appearance (theme picker) ────────────────────────────
function GeneralAppearanceSection() {
    const prefs = useStore((s) => s.preferences);
    const currentTheme = prefs?.theme || 'system';

    const onPick = (value: 'light' | 'dark' | 'system') => {
        setTheme(value);
    };

    const opt = (value: 'light' | 'dark' | 'system', label: string, icon: string, body: string) => (
        <button
            key={value}
            type="button"
            className={`theme-option-card${currentTheme === value ? ' is-active' : ''}`}
            onClick={() => onPick(value)}
        >
            <span className="theme-option-card__icon" aria-hidden="true">
                {icon}
            </span>
            <span className="theme-option-card__label">{label}</span>
            <span className="theme-option-card__body">{body}</span>
            <span className="theme-option-card__check" aria-hidden="true">
                {currentTheme === value ? '✓' : ''}
            </span>
        </button>
    );

    return (
        <div className="card glass settings-section">
            <h2 className="st-card-title-indigo">{t('settings.appearance')}</h2>
            {/* themePickerSubtitle contains a literal <strong> tag for
                emphasis on "System" — render as HTML, not as a text
                node, so the tag does NOT appear as visible markup. */}
            <p
                className="st-paragraph-mb-24"
                dangerouslySetInnerHTML={{ __html: t('settings.themePickerSubtitle') }}
            />

            <div className="theme-options">
                {opt('light', t('settings.themeLight'), '☀️', t('settings.themeBodyLight'))}
                {opt('dark', t('settings.themeDark'), '🌙', t('settings.themeBodyDark'))}
                {opt('system', t('settings.themeSystem'), '🖥️', t('settings.themeBodySystem'))}
            </div>
        </div>
    );
}


// ── General → Language picker ──────────────────────────────────────
function GeneralLanguageSection() {
    // useStore subscription so the active highlight updates when
    // setLocale (which writes STATE + emits) lands the new locale.
    useStore((s) => s.preferences);
    const currentLocale = getLocale();

    const onPick = async (value: Locale) => {
        try {
            await setLocale(value);
        } catch (err) {
            console.error('setLocale failed:', err);
            showLiquidAlert(t('toasts.loadFailed'));
        }
    };

    const langOpt = (value: Locale, label: string, native: string) => (
        <button
            key={value}
            type="button"
            className={`theme-option-card${currentLocale === value ? ' is-active' : ''}`}
            onClick={() => void onPick(value)}
        >
            <span className="theme-option-card__icon" aria-hidden="true">
                🌐
            </span>
            <span className="theme-option-card__label">{label}</span>
            <span className="theme-option-card__body">{native}</span>
            <span className="theme-option-card__check" aria-hidden="true">
                {currentLocale === value ? '✓' : ''}
            </span>
        </button>
    );

    return (
        <div className="card glass settings-section">
            <h2 className="st-card-title-indigo">{t('settings.language')}</h2>
            <p className="st-paragraph-mb-24">
                {t('settings.languageDesc')}
            </p>
            <div className="theme-options">
                {langOpt('en', t('settings.languageEnglish'), 'English')}
                {langOpt('pt', t('settings.languagePortuguese'), 'Português')}
                {langOpt('es', t('settings.languageSpanish'), 'Español')}
                {langOpt('fr', t('settings.languageFrench'), 'Français')}
            </div>
        </div>
    );
}


// ── Reset view (3 reset cards) ─────────────────────────────────────
function ResetView() {
    return (
        <div className="settings-grid">
            <div className="card glass p-6">
                <h3 className="st-card-title-amber">{t('settings.resetTripsTitle')}</h3>
                <p className="muted-meta">{t('settings.resetTripsBody')}</p>
                <button
                    type="button"
                    className="themed-block-btn"
                    style={{ ['--accent' as any]: '255,149,0' }}
                    onClick={confirmResetTrips}
                >
                    {t('settings.resetTripsBtn')}
                </button>
            </div>
            <div className="card glass p-6">
                <h3 className="st-card-title-indigo">{t('settings.resetCategoriesTitle')}</h3>
                <p className="muted-meta">{t('settings.resetCategoriesBody')}</p>
                <button
                    type="button"
                    className="themed-block-btn"
                    style={{ ['--accent' as any]: '88,86,214' }}
                    onClick={confirmResetCategories}
                >
                    {t('settings.resetCategoriesBtn')}
                </button>
            </div>
            <div
                className="card glass danger-card p-6 border-[rgba(255,_59,_48,_0.3)]"
            >
                <h3 className="text-[#ff3b30] mt-0">{t('settings.resetFactoryTitle')}</h3>
                <p className="muted-meta">{t('settings.resetFactoryBody')}</p>
                <button
                    type="button"
                    className="btn-confirm-danger text-[length:var(--font-sm)] p-3"
                    onClick={confirmResetApp}
                >
                    {t('settings.resetFactoryBtn')}
                </button>
            </div>
        </div>
    );
}


// ── Format view (mappings + saved formats + add form) ──────────────
function FormatView() {
    const customFormat = useStore((s) => s.customFormat) || [];
    const savedFormats = useStore((s) => s.savedFormats) || [];

    // Controlled add-mapping form. Refs would also work but useState
    // is simpler because we reset both fields after a successful add.
    const [mapVar, setMapVar] = useState('');
    const [mapCol, setMapCol] = useState('');
    // Saved-format name input is also controlled so "Edit" can
    // pre-fill it atomically (legacy used setTimeout + .value=…).
    const [formatName, setFormatName] = useState('');

    const used = new Set(customFormat.map((m) => m.variable));

    const onAddMapping = () => {
        if (!mapVar || !mapCol) return;
        STATE.customFormat = STATE.customFormat || [];
        if (STATE.customFormat.some((m) => m.variable === mapVar)) return;
        STATE.customFormat.push({ variable: mapVar, column: mapCol });
        emit('state:changed');
        setMapVar('');
        setMapCol('');
    };

    const onRemoveMapping = (variable: string) => {
        STATE.customFormat = (STATE.customFormat || []).filter((m) => m.variable !== variable);
        emit('state:changed');
    };

    const onSaveCustomFormat = () => {
        // 'categoryId' is accepted as a synonym for 'category' so users
        // who saved a format before the rename don't get blocked.
        const fmt = STATE.customFormat || [];
        const mapped = new Set(fmt.map((m) => (m.variable === 'categoryId' ? 'category' : m.variable)));
        const missing = MANDATORY_VARS.filter((v) => !mapped.has(v));
        if (missing.length > 0) {
            showLiquidAlert(t('validation.missingRequiredFields', { fields: missing.join(', ') }));
            return;
        }
        const name = formatName.trim();
        if (!name) return;
        STATE.savedFormats = STATE.savedFormats || [];
        STATE.savedFormats.push({ id: generateId(), name, mappings: [...fmt] });
        STATE.customFormat = [];
        emit('state:changed');
        setFormatName('');
    };

    const onDeleteSavedFormat = (id: string) => {
        showConfirmModal({
            title: t('settings.formatDeleteConfirmTitle'),
            message: t('settings.formatDeleteConfirmMessage'),
            confirmText: t('settings.formatDeleteConfirmBtn'),
            onConfirm: () => {
                STATE.savedFormats = (STATE.savedFormats || []).filter((f) => f.id !== id);
                emit('state:changed');
            },
        });
    };

    const onEditSavedFormat = (id: string) => {
        const format = (STATE.savedFormats || []).find((f) => f.id === id);
        if (!format) return;
        // Load saved mappings into the active editor + remove the
        // saved entry so the user can re-save under a (possibly new)
        // name. Pre-fill the name input.
        STATE.customFormat = [...format.mappings];
        STATE.savedFormats = (STATE.savedFormats || []).filter((f) => f.id !== id);
        emit('state:changed');
        setFormatName(format.name);
    };

    const availableVars = MANDATORY_VARS.concat(OPTIONAL_VARS).filter((v) => !used.has(v));

    return (
        <div className="card glass settings-section">
            <h2 className="st-card-title-amber">{t('settings.formatTitle')}</h2>
            <p className="st-paragraph-mb-24">
                {t('settings.formatSubtitle')}
            </p>

            <div>
                {/* Status chips — one per MANDATORY variable, showing
                    DONE if it's already in customFormat. */}
                <div
                    className="flex flex-wrap gap-2 mb-6"
                >
                    {MANDATORY_VARS.map((v) => {
                        const done = used.has(v);
                        return (
                            <span key={v} className={`status-chip${done ? ' is-done' : ''}`}>
                                {done ? '✓' : '★'} {v.toUpperCase()}
                            </span>
                        );
                    })}
                </div>

                {/* Mapping list — was a flat compact-table; now a
                    card list with each mapping rendered as a row
                    showing the variable name, an arrow connecting
                    to the Excel column letter, and a delete chip. */}
                <div className="format-list mb-6">
                    {customFormat.length === 0 ? (
                        <div className="format-list__empty">{t('settings.formatEmpty')}</div>
                    ) : (
                        customFormat.map((m) => {
                            const isMandatory = MANDATORY_VARS.includes(m.variable);
                            return (
                                <div
                                    key={m.variable}
                                    className={`format-row${isMandatory ? ' is-mandatory' : ''}`}
                                >
                                    <span className="format-row__star" aria-hidden="true">
                                        {isMandatory ? '★' : ''}
                                    </span>
                                    <span className="format-row__variable">{m.variable}</span>
                                    <span className="format-row__arrow" aria-hidden="true">
                                        <svg
                                            width="14"
                                            height="14"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2.4"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <polyline points="9 18 15 12 9 6"></polyline>
                                        </svg>
                                    </span>
                                    <span className="format-row__col">{m.column}</span>
                                    <button
                                        type="button"
                                        className="format-row__remove"
                                        title={t('settings.formatRemoveTooltip')}
                                        aria-label={t('settings.formatRemoveAriaLabel')}
                                        onClick={() => onRemoveMapping(m.variable)}
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
                                        >
                                            <line x1="18" y1="6" x2="6" y2="18"></line>
                                            <line x1="6" y1="6" x2="18" y2="18"></line>
                                        </svg>
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Add-mapping form — variable select + column select +
                    map button. Both fields reset after a successful add. */}
                <div
                    className="flex gap-4 items-end flex-wrap mb-8"
                >
                    <div className="flex-1 min-w-[150px]">
                        <label
                            className="compact-form-label text-[length:var(--font-xs)] font-extrabold text-secondary"
                        >
                            {t('settings.formatVariableLabel')}
                        </label>
                        <select
                            className="glass-input w-full"
                            value={mapVar}
                            onChange={(e) => setMapVar(e.target.value)}
                        >
                            <option value="">{t('settings.formatVariablePlaceholder')}</option>
                            {availableVars.map((v) => (
                                <option key={v} value={v}>
                                    {MANDATORY_VARS.includes(v) ? '★ ' : ''}
                                    {v}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[120px]">
                        <label
                            className="compact-form-label text-[length:var(--font-xs)] font-extrabold text-secondary"
                        >
                            {t('settings.formatColumnLabel')}
                        </label>
                        <select
                            className="glass-input w-full"
                            value={mapCol}
                            onChange={(e) => setMapCol(e.target.value)}
                        >
                            <option value="">{t('settings.formatColumnPlaceholder')}</option>
                            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button
                        type="button"
                        className="btn btn-liquid-glass py-3 px-6"
                        onClick={onAddMapping}
                    >
                        {t('settings.formatMapBtn')}
                    </button>
                </div>

                {/* Saved formats list + save-name form. The save form
                    is hidden once 5 formats are stored. */}
                <div className="border-t border-[var(--glass-border)] pt-8">
                    <h3 className="mt-0">
                        {t('settings.formatSavedHeading', { count: savedFormats.length })}
                    </h3>
                    <div className="grid gap-3">
                        {savedFormats.map((f) => (
                            <div key={f.id} className="saved-format-card">
                                <div className="saved-format-card__name">
                                    <span className="saved-format-card__icon">📄</span>
                                    <span>{f.name}</span>
                                </div>
                                <div className="saved-format-card__actions">
                                    <button
                                        type="button"
                                        className="saved-format-card__btn saved-format-card__btn--edit"
                                        onClick={() => onEditSavedFormat(f.id)}
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
                                        >
                                            <path d="M12 20h9"></path>
                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                                        </svg>
                                        {t('settings.formatSavedEditBtn')}
                                    </button>
                                    <button
                                        type="button"
                                        className="saved-format-card__btn saved-format-card__btn--delete"
                                        onClick={() => onDeleteSavedFormat(f.id)}
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
                                        >
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path>
                                        </svg>
                                        {t('settings.formatSavedDeleteBtn')}
                                    </button>
                                </div>
                            </div>
                        ))}
                        {savedFormats.length < 5 ? (
                            <div className="flex gap-3 mt-3">
                                <input
                                    type="text"
                                    placeholder={t('settings.formatSavedNamePlaceholder')}
                                    className="flex-1"
                                    value={formatName}
                                    onChange={(e) => setFormatName(e.target.value)}
                                />
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={onSaveCustomFormat}
                                >
                                    {t('settings.formatSavedSaveBtn')}
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
