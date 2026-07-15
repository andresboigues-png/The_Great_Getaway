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
import { generateId, showConfirmModal, showLiquidAlert } from '../../utils.js';
import { InfoPopover } from '../../react/components/InfoPopover.js';
import { syncCategories, apiFetch } from '../../api.js';
import { POI_CATEGORIES, getPoiTooltip, resolveAnchorMode } from '../home.js';
import { setTheme } from '../../theme.js';
import { t, getLocale, setLocale, type Locale } from '../../i18n.js';
import { iconSvg, iconForEmoji } from '../../icons.js';
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
import { Creator } from './Creator.js';
import { SessionsView } from './Sessions.js';
import { BlocksView } from './Blocks.js';
import { SettingsSectionHeader, SETTINGS_ACCENTS } from './SectionHeader.js';
import { CategoryListbox } from '../expenses/CategoryListbox.js';
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

/** Trip Templates: show the Creator card to creator accounts. The dev is
 *  always a creator (server-resolved STATE.user.isCreator already accounts
 *  for that); the real gate is the 403 from /api/templates for non-creators. */
function isCreatorUser(): boolean {
    return !!STATE.user?.isCreator || isAdminUser();
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
        onConfirm: () => { void (async () => {
            STATE.trips = [];
            STATE.archivedTrips = [];
            STATE.tripDays = [];
            STATE.expenses = [];
            STATE.budgets = [];
            STATE.activeTripId = null;
            emit('state:changed');
            if (STATE.user) {
                try {
                    // Trips-only reset: DELETE /api/trips loops the vetted
                    // per-trip cascade over the caller's OWNED trips and leaves
                    // the account fully intact. It must NOT hit
                    // DELETE /api/user-data — that endpoint nukes the entire
                    // account (users row + social graph + uploads), which is
                    // the Factory Reset path (confirmResetApp), not this one.
                    // (Audit MK1 P0 / F2: the two were wired to the same call.)
                    await apiFetch('/api/trips', { method: 'DELETE' });
                } catch (e) {
                    console.error('Trips reset failed', e);
                }
            }
        })(); },
    });
}

function confirmResetCategories(): void {
    showConfirmModal({
        title: t('settings.resetCategoriesConfirmTitle'),
        message: t('settings.resetCategoriesConfirmMessage'),
        confirmText: t('settings.resetCategoriesConfirmBtn'),
        onConfirm: () => {
            STATE.categories = [
                { id: 'c1', name: 'Food', icon: 'utensils', color: '#ff3b30' },
                { id: 'c2', name: 'Transport', icon: 'plane', color: '#007aff' },
                { id: 'c3', name: 'Accommodation', icon: 'bed', color: '#5856d6' },
            ];
            emit('state:changed');
            void syncCategories();
        },
    });
}

function confirmResetApp(): void {
    showConfirmModal({
        title: t('settings.resetFactoryConfirmTitle'),
        message: t('settings.resetFactoryConfirmMessage'),
        confirmText: t('settings.resetFactoryConfirmBtn'),
        onConfirm: () => { void (async () => {
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
        })(); },
    });
}


// ────────────────────────────────────────────────────────────────────
// Top-level component
// ────────────────────────────────────────────────────────────────────
export function Settings() {
    const { tab } = useSettingsTabSnapshot();
    // DSGN-021: subscribe the top-level component to the store so a locale
    // change (setLocale → emit('state:changed')) repaints the ENTIRE Settings
    // subtree — the page H1, the "Back to Control Center" button, the menu
    // cards, and the sub-tab strip. useSettingsTabSnapshot only tracks the tab
    // store, so without this the surrounding chrome stayed in the old language
    // until the user navigated away and back. useStore re-renders on every
    // state:changed (version-counter snapshot); MenuView/SubTabStrip are plain
    // children, so they repaint with their parent.
    useStore((s) => s.preferences);

    return (
        <div>
            <div className="ai-page-header">
                <h1
                    className="gradient-text"
                    style={{
                        ['--g-from' as string]: '#1a6b3c',
                        ['--g-to' as string]: '#34c759',
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
                    {tab === 'creator' && isCreatorUser() && <Creator />}
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
                <span
                    className="management-card__icon"
                    style={{ ['--mc-accent' as string]: '0,113,227' }}
                    dangerouslySetInnerHTML={{ __html: iconSvg('palette', { size: 22 }) }}
                />
                <h2 className="card-title m-0">
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
                <span
                    className="management-card__icon"
                    style={{ ['--mc-accent' as string]: '255,149,0' }}
                    dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 22 }) }}
                />
                <h2 className="card-title m-0">
                    {t('settings.cardFormatTitle')}
                </h2>
                <p className="st-help-text">
                    {t('settings.cardFormatBody')}
                </p>
                <div className="mt-5 text-accent-blue-deep font-bold text-[0.85rem]">
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
                <span
                    className="management-card__icon"
                    style={{ ['--mc-accent' as string]: '88,86,214' }}
                    dangerouslySetInnerHTML={{ __html: iconSvg('user', { size: 22 }) }}
                />
                <h2 className="card-title m-0">
                    {t('settings.cardPersonalizationTitle')}
                </h2>
                <p className="st-help-text">
                    {t('settings.cardPersonalizationBody')}
                </p>
                <div className="mt-5 text-accent-blue-deep font-bold text-[0.85rem]">
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
                <span
                    className="management-card__icon"
                    style={{ ['--mc-accent' as string]: '52,199,89' }}
                    dangerouslySetInnerHTML={{ __html: iconSvg('smartphone', { size: 22 }) }}
                />
                <h2 className="card-title m-0">
                    {t('settings.cardSessionsTitle')}
                </h2>
                <p className="st-help-text">
                    {t('settings.cardSessionsBody')}
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
                <span
                    className="management-card__icon"
                    style={{ ['--mc-accent' as string]: '0,199,190' }}
                    dangerouslySetInnerHTML={{ __html: iconSvg('lock', { size: 22 }) }}
                />
                <h2 className="card-title m-0">
                    {t('settings.cardBlocksTitle')}
                </h2>
                <p className="st-help-text">
                    {t('settings.cardBlocksBody')}
                </p>
                <div className="mt-5 text-accent-blue-deep font-bold text-[0.85rem]">
                    {t('settings.cardConfigureCta')}
                </div>
            </button>

            {/* Creator options — Trip Templates. Shown only to creator
                accounts (STATE.user.isCreator; the dev is always one). The
                403 from /api/templates is the real gate; this hide-the-card
                check just keeps non-creators from seeing a card that errors. */}
            {isCreatorUser() && (
                <button
                    type="button"
                    className="card-button-reset card glass management-card"
                    onClick={() => setSettingsTab('creator')}
                >
                    <span
                        className="management-card__icon"
                        style={{ ['--mc-accent' as string]: '175,82,222' }}
                        dangerouslySetInnerHTML={{ __html: iconSvg('sparkles', { size: 22 }) }}
                    />
                    <h2 className="card-title m-0">
                        {t('settings.cardCreatorTitle')}
                    </h2>
                    <p className="st-help-text">
                        {t('settings.cardCreatorBody')}
                    </p>
                    <div className="mt-5 text-accent-blue-deep font-bold text-[0.85rem]">
                        {t('settings.cardConfigureCta')}
                    </div>
                </button>
            )}

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
                    <span
                        className="management-card__icon"
                        style={{ ['--mc-accent' as string]: '90,200,250' }}
                        dangerouslySetInnerHTML={{ __html: iconSvg('zap', { size: 22 }) }}
                    />
                    <h2 className="card-title m-0">
                        {t('settings.cardDeveloperTitle')}
                    </h2>
                    <p className="st-help-text">
                        {t('settings.cardDeveloperBody')}
                    </p>
                    <div className="mt-5 text-accent-blue-deep font-bold text-[0.85rem]">
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
                <span
                    className="management-card__icon"
                    style={{ ['--mc-accent' as string]: '255,59,48' }}
                    dangerouslySetInnerHTML={{ __html: iconSvg('trash', { size: 22 }) }}
                />
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
            {/* The sub-tab strip now rides each section's header row
                (SettingsSectionHeader right slot) — in line with the title. */}
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
                aria-label={t('settings.subtabPills')}
                title={t('settings.subtabPills')}
                onClick={() => setGeneralSubTab('pills')}
            >
                <span className="general-subtab__icon inline-flex" dangerouslySetInnerHTML={{ __html: iconSvg('map', { size: 18 }) }} />
                <span className="general-subtab__label">{t('settings.subtabPills')}</span>
            </button>
            <button
                type="button"
                className={`general-subtab${tab('appearance')}`}
                role="tab"
                aria-selected={current === 'appearance'}
                aria-label={t('settings.appearance')}
                title={t('settings.appearance')}
                onClick={() => setGeneralSubTab('appearance')}
            >
                <span className="general-subtab__icon inline-flex" dangerouslySetInnerHTML={{ __html: iconSvg('palette', { size: 18 }) }} />
                <span className="general-subtab__label">{t('settings.appearance')}</span>
            </button>
            <button
                type="button"
                className={`general-subtab${tab('language')}`}
                role="tab"
                aria-selected={current === 'language'}
                aria-label={t('settings.language')}
                title={t('settings.language')}
                onClick={() => setGeneralSubTab('language')}
            >
                <span className="general-subtab__icon inline-flex" dangerouslySetInnerHTML={{ __html: iconSvg('globe', { size: 18 }) }} />
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
            <SettingsSectionHeader
                title={t('settings.poiTitle')}
                accent={SETTINGS_ACCENTS.general}
                icon="map"
                info={[
                    t('settings.poiIntroVisibility'),
                    t('settings.poiIntroRating'),
                    t('settings.poiIntroAnchor'),
                ]}
                right={<SubTabStrip current="pills" />}
            />
            <div className="poi-filter-list">
                {/* Column headers — one per control column, width-matched to
                    the controls beneath (anchor 132 / rating 110 / status 64).
                    Hidden ≤720px where the rows stack into a 2-row layout and
                    columns stop existing. aria-hidden: each control already
                    carries its own aria-label; the visual header is redundant
                    for AT. */}
                <div className="poi-filter-head" aria-hidden="true">
                    <span></span>
                    <span className="poi-filter-head__cell poi-filter-head__cell--start">{t('settings.poiColCategory')}</span>
                    <span className="poi-filter-head__cell poi-filter-head__cell--anchor">{t('settings.poiColAnchor')}</span>
                    <span className="poi-filter-head__cell poi-filter-head__cell--rating">{t('settings.poiColRating')}</span>
                    <span className="poi-filter-head__cell poi-filter-head__cell--status">{t('settings.poiColStatus')}</span>
                    <span className="poi-filter-head__cell">{t('settings.poiColShow')}</span>
                </div>
                {rows.map((c) => {
                    const userMin =
                        typeof filters[c.key]?.minRating === 'number'
                            ? filters[c.key]!.minRating!
                            : c.defaultMinRating;
                    const userAnchor = anchoring[c.key];
                    // Audit MK5 BUG-038: shared single source of truth with the
                    // home map (HeroMap.shouldForceAnchor) so the displayed
                    // setting can't drift from the actual map behavior again.
                    const effectiveAnchor = resolveAnchorMode(c, anchoring);
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
                            <span
                                className="poi-filter-row__icon"
                                dangerouslySetInnerHTML={{ __html: iconForEmoji(c.icon, { size: 20, fallback: 'pin' }) }}
                            />
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
                                            <InfoPopover
                                                accent={SETTINGS_ACCENTS.general}
                                                ariaLabel={t('settings.poiInfoBtnAria', { name: c.label })}
                                                title={c.label}
                                                paragraphs={[tooltip]}
                                                buttonClassName="poi-filter-row__info-btn"
                                                iconSize={16}
                                            />
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
                                        {v === 0 ? t('settings.poiAnyRating') : `${v}+`}
                                    </option>
                                ))}
                            </select>
                            <span
                                className="poi-filter-row__default"
                                title={`Defaults: ${c.defaultMinRating === 0 ? t('settings.poiAnyRating') : c.defaultMinRating + '+'} / ${defaultAnchor === 'anchor' ? t('settings.poiAnchorTripWide') : t('settings.poiAnchorDayAware')} / shown`}
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
    // Round 19: mobile "menu handle" — the left-edge peek that opens the rail
    // island. Local + localStorage-backed (a UI-only pref, not server-synced);
    // toggling flips the body class the peek CSS keys off. Default on.
    const [menuHandle, setMenuHandle] = useState(
        () => localStorage.getItem('gg_menu_handle') !== 'off',
    );
    const onToggleHandle = (on: boolean) => {
        setMenuHandle(on);
        localStorage.setItem('gg_menu_handle', on ? 'on' : 'off');
        document.body.classList.toggle('menu-handle-off', !on);
    };

    // Profile memory-canvas connection network — which relationships to draw
    // when hovering a memory. localStorage-backed view pref (mirrors the reader
    // in Profile.tsx / gg_mem_connect); all on by default. The canvas reads it
    // on mount, so a change applies next time the profile is opened.
    const [connect, setConnect] = useState<{ author: boolean; trip: boolean; year: boolean }>(() => {
        try {
            const raw = localStorage.getItem('gg_mem_connect');
            if (raw) {
                const p = JSON.parse(raw);
                return { author: p.author !== false, trip: p.trip !== false, year: p.year !== false };
            }
        } catch {
            /* malformed / unavailable → defaults */
        }
        return { author: true, trip: true, year: true };
    });
    const setConnectDim = (dim: 'author' | 'trip' | 'year', on: boolean) => {
        setConnect((prev) => {
            const next = { ...prev, [dim]: on };
            try {
                localStorage.setItem('gg_mem_connect', JSON.stringify(next));
            } catch {
                /* storage unavailable — the in-memory toggle still reflects intent */
            }
            return next;
        });
    };
    // Fixed dimension colours — mirror MEM_LINK_DIMS in Profile.tsx.
    const connectColor = { author: '#0a84ff', trip: '#30b46b', year: '#f5a623' } as const;

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
            <span
                className="theme-option-card__icon"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: iconSvg(icon, { size: 24 }) }}
            />
            <span className="theme-option-card__label">{label}</span>
            <span className="theme-option-card__body">{body}</span>
            <span
                className="theme-option-card__check"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: currentTheme === value ? iconSvg('check', { size: 16 }) : '' }}
            />
        </button>
    );

    return (
        <div className="card glass settings-section">
            {/* themePickerSubtitleV2 contains a literal <strong> tag (F6-I2
                device-local note) — passed as trusted locale HTML into the
                ⓘ popup instead of an inline paragraph. */}
            <SettingsSectionHeader
                title={t('settings.appearance')}
                accent={SETTINGS_ACCENTS.general}
                icon="palette"
                infoHtml={[t('settings.themePickerSubtitleV2')]}
                right={<SubTabStrip current="appearance" />}
            />

            <div className="theme-options">
                {opt('light', t('settings.themeLight'), 'sun', t('settings.themeBodyLight'))}
                {opt('dark', t('settings.themeDark'), 'moon', t('settings.themeBodyDark'))}
                {opt('system', t('settings.themeSystem'), 'monitor', t('settings.themeBodySystem'))}
            </div>

            {/* Round 19: mobile menu-handle (left-edge peek) on/off.
                st-mobile-only: the grip only exists on mobile (the rail
                island is permanent on desktop), so the toggle is hidden
                on web viewports — it would be a dead switch there. */}
            <div className="st-mobile-only flex items-center justify-between gap-4 mt-7">
                <div className="min-w-0">
                    <div className="font-semibold text-[0.95rem]">{t('settings.menuHandleLabel')}</div>
                    <div className="text-secondary text-[0.82rem] mt-0.5">{t('settings.menuHandleSub')}</div>
                </div>
                <label className="switch" title={t('settings.menuHandleLabel')}>
                    <input
                        type="checkbox"
                        checked={menuHandle}
                        onChange={(e) => onToggleHandle(e.target.checked)}
                    />
                    <span className="slider"></span>
                </label>
            </div>

            {/* Profile memory-canvas connection network — pick which
                relationships light up when you hover a memory. All on by
                default; turning one off drops its rays + legend entry. */}
            <div className="mt-7">
                <div className="font-semibold text-[0.95rem]">{t('settings.memConnectLabel')}</div>
                <div className="text-secondary text-[0.82rem] mt-0.5 mb-2">
                    {t('settings.memConnectSub')}
                </div>
                {(
                    [
                        ['author', t('profile.memGroupAuthor')],
                        ['trip', t('profile.memGroupTrip')],
                        ['year', t('profile.memGroupYear')],
                    ] as const
                ).map(([dim, label]) => (
                    <div key={dim} className="flex items-center justify-between gap-4 mt-2">
                        <div className="min-w-0 flex items-center gap-2.5">
                            <span
                                aria-hidden="true"
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    background: connectColor[dim],
                                }}
                            />
                            <span className="text-[0.9rem]">{label}</span>
                        </div>
                        <label className="switch" title={label}>
                            <input
                                type="checkbox"
                                checked={connect[dim]}
                                onChange={(e) => setConnectDim(dim, e.target.checked)}
                            />
                            <span className="slider"></span>
                        </label>
                    </div>
                ))}
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
    // F2-I5: setLocale dynamically imports the locale chunk, so on a slow
    // connection there's a gap between tap and repaint. Track the locale
    // being loaded to show a pending highlight + lock the picker; clear it
    // on success (the store emit re-highlights the active card) and on
    // failure (so the previous selection shows again).
    const [pending, setPending] = useState<Locale | null>(null);

    const onPick = async (value: Locale) => {
        if (pending || value === currentLocale) return;
        setPending(value);
        try {
            await setLocale(value);
        } catch (err) {
            console.error('setLocale failed:', err);
            showLiquidAlert(t('toasts.loadFailed'));
        } finally {
            setPending(null);
        }
    };

    const langOpt = (value: Locale, label: string, native: string) => {
        const isPending = pending === value;
        const isActive = currentLocale === value;
        return (
            <button
                key={value}
                type="button"
                className={`theme-option-card${isActive || isPending ? ' is-active' : ''}`}
                disabled={pending !== null}
                aria-busy={isPending}
                onClick={() => void onPick(value)}
            >
                <span
                    className="theme-option-card__icon"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: iconSvg('globe', { size: 24 }) }}
                />
                <span className="theme-option-card__label">{label}</span>
                <span className="theme-option-card__body">{native}</span>
                <span
                    className="theme-option-card__check"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: isPending ? '…' : isActive ? iconSvg('check', { size: 16 }) : '' }}
                />
            </button>
        );
    };

    return (
        <div className="card glass settings-section">
            <SettingsSectionHeader
                title={t('settings.language')}
                accent={SETTINGS_ACCENTS.general}
                icon="globe"
                info={[t('settings.languageDesc')]}
                right={<SubTabStrip current="language" />}
            />
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
// F2-I6: the cards are grouped + styled by SCOPE, not laid out flat.
//   • Reset Categories is a purely LOCAL restore-to-defaults (reversible
//     by re-adding categories) → neutral card, listed first (safest).
//   • Reset Trips and Factory Reset are IRREVERSIBLE SERVER WIPES → both
//     carry danger-card styling so a destructive server action never
//     reads like the benign local one. A scope caption on every card
//     spells out exactly what gets deleted and from where.
function ResetView() {
    return (
        <div className="settings-grid">
            {/* Unified section-title treatment (SectionHeader). The reset
                bodies + scope captions stay INLINE on purpose: they spell out
                exactly what a wipe deletes — safety copy a user must see
                before clicking, never behind an ⓘ. */}
            <div className="card glass p-6">
                <SettingsSectionHeader
                    title={t('settings.resetCategoriesTitle')}
                    accent={SETTINGS_ACCENTS.personalization}
                    icon="trash"
                    small
                />
                <p className="muted-meta">{t('settings.resetCategoriesBody')}</p>
                <p className="text-secondary text-[0.78rem] font-semibold mb-4">
                    {t('settings.resetScopeLocal')}
                </p>
                <button
                    type="button"
                    className="themed-block-btn"
                    style={{ ['--accent' as string]: '88,86,214' }}
                    onClick={confirmResetCategories}
                >
                    {t('settings.resetCategoriesBtn')}
                </button>
            </div>
            <div className="card glass danger-card p-6 border-[rgba(255,_59,_48,_0.3)]">
                <SettingsSectionHeader
                    title={t('settings.resetTripsTitle')}
                    accent={SETTINGS_ACCENTS.danger}
                    icon="trash"
                    small
                />
                <p className="muted-meta">{t('settings.resetTripsBody')}</p>
                <p className="text-[#ff3b30] text-[0.78rem] font-semibold mb-4">
                    {t('settings.resetScopeServer')}
                </p>
                <button
                    type="button"
                    className="btn-confirm-danger text-[length:var(--font-sm)] p-3"
                    onClick={confirmResetTrips}
                >
                    {t('settings.resetTripsBtn')}
                </button>
            </div>
            <div
                className="card glass danger-card p-6 border-[rgba(255,_59,_48,_0.3)]"
            >
                <SettingsSectionHeader
                    title={t('settings.resetFactoryTitle')}
                    accent={SETTINGS_ACCENTS.danger}
                    icon="trash"
                    small
                />
                <p className="muted-meta">{t('settings.resetFactoryBody')}</p>
                <p className="text-[#ff3b30] text-[0.78rem] font-semibold mb-4">
                    {t('settings.resetScopeServer')}
                </p>
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
        if (!mapVar || !mapCol) {
            showLiquidAlert(t('settings.formatMapIncomplete'));
            return;
        }
        STATE.customFormat = STATE.customFormat || [];
        if (STATE.customFormat.some((m) => m.variable === mapVar)) {
            showLiquidAlert(t('settings.formatMapDuplicate', { variable: mapVar }));
            return;
        }
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
        if (!name) {
            showLiquidAlert(t('settings.formatNameRequired'));
            return;
        }
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
        <div className="card glass settings-section settings-section--roomy">
            <SettingsSectionHeader
                title={t('settings.formatTitle')}
                accent={SETTINGS_ACCENTS.format}
                icon="document"
                info={[t('settings.formatSubtitle')]}
            />

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
                                <span dangerouslySetInnerHTML={{ __html: iconSvg(done ? 'check' : 'star', { size: 13 }) }} />{' '}
                                {v.toUpperCase()}
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
                                    <span
                                        className="format-row__star"
                                        aria-hidden="true"
                                        dangerouslySetInnerHTML={{ __html: isMandatory ? iconSvg('star', { size: 12 }) : '' }}
                                    />
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
                        <CategoryListbox
                            value={mapVar}
                            onChange={setMapVar}
                            options={availableVars.map((v) => ({ value: v, label: v }))}
                            triggerClassName="glass-input w-full st-select-trigger"
                            panelMaxHeight={440}
                            ariaLabel={t('settings.formatVariableLabel')}
                            placeholder={t('settings.formatVariablePlaceholder')}
                        />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                        <label
                            className="compact-form-label text-[length:var(--font-xs)] font-extrabold text-secondary"
                        >
                            {t('settings.formatColumnLabel')}
                        </label>
                        <CategoryListbox
                            value={mapCol}
                            onChange={setMapCol}
                            options={'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({ value: c, label: c }))}
                            triggerClassName="glass-input w-full st-select-trigger"
                            panelMaxHeight={440}
                            ariaLabel={t('settings.formatColumnLabel')}
                            placeholder={t('settings.formatColumnPlaceholder')}
                        />
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
                                    <span
                                        className="saved-format-card__icon"
                                        dangerouslySetInnerHTML={{ __html: iconSvg('document', { size: 15 }) }}
                                    />
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
                                    className="btn-primary st-btn-amber"
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
