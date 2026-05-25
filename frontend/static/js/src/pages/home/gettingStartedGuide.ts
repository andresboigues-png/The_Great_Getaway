// pages/home/gettingStartedGuide.ts — the home-page bottom
// section: "Getting Started Guide" → "Quick Access" once
// every step is done. Phase B1 twelfth slice. Extracted from
// renderHome's tail.
//
// What this renders:
//   - When `STATE.hideQuickAccess !== false`: just a "🧭 Show
//     Quick Access" button. Default state — most users opt out
//     after their first trip.
//   - Otherwise: the full guide card with 10 step buttons.
//     Pre-completion: green-tick checkmarks for done steps,
//     numbered "Step N" labels, line-through on done text.
//     Post-completion (every step done OR
//     STATE.guideAllDone): switches to a "Quick Access"
//     toolbar — same buttons, no checklist UI, big icons in
//     circles instead of step numbers.
//
// Closure dependencies are passed explicitly via the opts bag:
//   - activeTrip — used by the "Add companions" step's action
//     to decide between opening the picker (with active trip)
//     vs navigating home (so the user can pick a trip first).
//   - tripDays / tripExpenses — used to derive `hasPlan` /
//     `hasExpenses` step-completion flags. Pre-computed by
//     renderHome and passed in to avoid re-filtering.

import { STATE, emit } from '../../state.js';
import { navigate } from '../../router.js';
import { openNewTripModal, openAddDayModal, openCompanionPickerModal } from '../../modals.js';
import { showPersTab } from '../settings.js';
import { t } from '../../i18n.js';
import { esc } from '../../utils.js';


type GuideStep = {
    text: string;
    done: boolean;
    icon: string;
    action: () => void;
};


export interface GettingStartedGuideOptions {
    /** Parent element to append the guide (or "Show" button) into. */
    parent: HTMLElement;
    /** The active trip, if any. The "Add companions" step opens
     *  the per-trip picker when present. (Accepts `undefined`
     *  from STATE.trips.find() too — the .ts/.tsx callers may
     *  not narrow it.) */
    activeTrip: { id: string } | null | undefined;
    /** Trip days for the active trip. Used only to derive the
     *  `hasPlan` step flag (pre-computed by renderHome to avoid
     *  re-filtering STATE.tripDays). */
    tripDays: any[];
    /** Trip expenses for the active trip. Same rationale —
     *  drives `hasExpenses`. */
    tripExpenses: any[];
}


/** Append the home-page "Getting Started Guide" section to the
 *  given parent. No-op if STATE has somehow lost its required
 *  shape (defensive — STATE.guideProgress is auto-initialised
 *  if missing). */
export function appendGettingStartedGuide(opts: GettingStartedGuideOptions): void {
    const { parent, activeTrip, tripDays, tripExpenses } = opts;

    const guideContainer = document.createElement('div');
    guideContainer.style.marginTop = '40px';

    if (!STATE.guideProgress) STATE.guideProgress = {};

    const hasLogin = !!STATE.user || (window as any).isGoogleAuthenticated === true;
    const hasTrip = STATE.trips.length > 0;
    // Companions are per-trip now — for the getting-started
    // checklist, count "any trip with any companions" as having
    // companions set up.
    const hasCompanions = STATE.trips.some(t => (t.companions || []).length > 0);
    const hasPlan = tripDays.length > 0;
    const hasExpenses = tripExpenses.length > 0;
    const hasBudgets = !!(STATE.budgets && STATE.budgets.length > 0);
    const hasCollections = !!(STATE.archivedTrips && STATE.archivedTrips.length > 0);
    const hasCategories = (STATE.categories || []).length > 3; // Default is 3
    const hasSettlement = STATE.expenses.some((e: any) => e.isSettlement);
    const hasFriends = false;

    if (hasLogin) STATE.guideProgress.login = true;
    if (hasTrip) STATE.guideProgress.trip = true;
    if (hasCompanions) STATE.guideProgress.companions = true;
    if (hasPlan) STATE.guideProgress.plan = true;
    if (hasExpenses) STATE.guideProgress.expenses = true;
    if (hasBudgets) STATE.guideProgress.budgets = true;
    if (hasCollections) STATE.guideProgress.collections = true;
    if (hasCategories) STATE.guideProgress.categories = true;
    if (hasSettlement) STATE.guideProgress.settlement = true;
    if (hasFriends) STATE.guideProgress.friends = true;

    // Step copy refreshed 2026-05-15 to reflect the current
    // surface — AI plan now has separate food + sightseeing
    // prompts, Budgets is a first-class spending control,
    // Collections holds completed trips, Friends + Feed are
    // the social layer. Order roughly follows the natural
    // user flow: sign in → plan → log → reconcile → share.
    // 2026-05-25 (audit): each step's text now comes from i18n. The
    // two complex steps (Plan with AI / Log expenses) interpolate the
    // raw t() result with nested data-guide-action spans so the
    // inline action-links keep working — paintI18nBindings re-runs
    // on locale change so the HTML stays in sync.
    const planSubLink = `<span data-guide-action="open-add-day" class="link-underline">${esc(t('home.guideStep5Sub'))}</span>`;
    const expenseManual = `<span data-guide-action="navigate-expenses" class="link-underline">${esc(t('home.guideStep6Manual'))}</span>`;
    const expenseBatch = `<span data-guide-action="navigate-upload" class="link-underline">${esc(t('home.guideStep6Batch'))}</span>`;
    const steps: GuideStep[] = [
        { text: t('home.guideStep1'), done: !!STATE.guideProgress.login, icon: '🔐', action: () => navigate('profile') },
        { text: t('home.guideStep2'), done: !!STATE.guideProgress.trip, icon: '✈️', action: () => openNewTripModal() },
        // Companions are per-trip now — the action opens the
        // trip-companion picker on Home (or just navigates Home
        // if there's no active trip yet, since the picker is
        // reachable from the trip header there).
        { text: t('home.guideStep3'), done: !!STATE.guideProgress.companions, icon: '👥', action: () => {
            if (activeTrip) openCompanionPickerModal(activeTrip.id);
            else navigate('home');
        } },
        // Personalization page DOM (#persMenu/#persContent/
        // #persCategories) only exists once the page has
        // rendered, so navigate first and switch the tab on the
        // next tick.
        { text: t('home.guideStep4'), done: !!STATE.guideProgress.categories, icon: '🏷️', action: () => { navigate('personalization'); setTimeout(() => showPersTab('categories'), 50); } },
        { text: `${t('home.guideStep5')}<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(${t('home.guideStep5Prefix')} — ${planSubLink})</span>`, done: !!STATE.guideProgress.plan, icon: '✦', action: () => navigate('ai') },
        { text: `${t('home.guideStep6')}<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(${expenseManual} ${t('home.guideStep6Or')} ${expenseBatch})</span>`, done: !!STATE.guideProgress.expenses, icon: '💰', action: () => navigate('expenses') },
        { text: t('home.guideStep7'), done: !!STATE.guideProgress.budgets, icon: '📊', action: () => navigate('budgets') },
        { text: t('home.guideStep8'), done: !!STATE.guideProgress.settlement, icon: '🤝', action: () => navigate('settlement') },
        { text: t('home.guideStep9'), done: !!STATE.guideProgress.collections, icon: '📂', action: () => navigate('collections') },
        { text: t('home.guideStep10'), done: !!STATE.guideProgress.friends, icon: '📱', action: () => navigate('friends') },
    ];

    const allDone = steps.every(s => s.done) || !!STATE.guideAllDone;
    if (allDone && !STATE.guideAllDone) {
        STATE.guideAllDone = true;
        emit('state:changed');
    }

    // Round 3 audit fix — first-run UX improvement: previously the
    // guide was hidden by default for ALL users (only showed the tiny
    // "🧭 Show Quick Access" button), which meant new users never saw
    // the 10-step onboarding hint. Now: brand-new users (no completed
    // steps yet AND no explicit Hide click) see the guide expanded
    // by default. Once they complete at least one step OR explicitly
    // hide it, the existing collapsed-by-default behaviour resumes.
    //
    //   - STATE.hideQuickAccess === false → user explicitly opened
    //     it (or never closed it) → expanded.
    //   - STATE.hideQuickAccess === true  → user explicitly hid it
    //     → collapsed (the small Show button).
    //   - undefined → first-run-ish; expand if they've completed
    //     ZERO steps so far (true onboarding moment), otherwise
    //     collapse (returning user who never explicitly opened).
    const completedSteps = steps.filter(s => s.done).length;
    const isHidden = STATE.hideQuickAccess === true
        || (STATE.hideQuickAccess === undefined && completedSteps > 0);

    if (isHidden) {
        const showBtnContainer = document.createElement('div');
        showBtnContainer.style.textAlign = 'center';
        showBtnContainer.style.marginTop = '40px';
        showBtnContainer.innerHTML = `
            <button class="btn-glass-light">
                🧭 ${esc(t('home.showQuickAccessBtn'))}
            </button>
        `;
        const showBtn = (showBtnContainer.querySelector('button') as HTMLButtonElement | null);
        if (showBtn) showBtn.onclick = () => {
            STATE.hideQuickAccess = false;
            emit('state:changed');
            navigate('home');
        };
        parent.appendChild(showBtnContainer);
        return;
    }

    // 2026-05-15 dark-mode sweep — every hardcoded color literal
    // (#002d5b, white, rgba(0,0,0,*), rgba(0,45,91,*)) replaced
    // with theme tokens so the card stays readable on both light
    // and dark surfaces. The green-tick state keeps its #34c759
    // accent (intentional — green is the success color in both
    // themes and reads fine against either background).
    guideContainer.innerHTML = `
        <div class="card glass" style="padding: 32px; border-radius: 28px; border: 1.5px solid ${allDone ? 'var(--border-subtle)' : 'rgba(0, 122, 255, 0.25)'}; background: var(--card-bg); position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="background: ${allDone ? 'var(--text-brand-navy)' : 'var(--accent-blue)'}; color: white; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">${allDone ? '⚡️' : '🧭'}</div>
                    <h2 style="margin: 0; font-size: 1.5rem; letter-spacing: -0.02em; color: var(--text-brand-navy);">${esc(allDone ? t('home.quickAccessTitle') : t('home.gettingStartedTitle'))}</h2>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${allDone ? `<span style="font-size: 0.75rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">${esc(t('home.quickAccessToolbar'))}</span>` : ''}
                    <button id="hideQuickAccessBtn" class="pill-btn-warn-hover">${esc(t('home.hideBtn'))}</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                ${steps.map((step, i) => {
                    const showTick = !allDone && step.done;
                    return `
                        <button type="button" class="card-button-reset guide-step-card" data-index="${i}" style="display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); background: ${showTick ? 'rgba(52, 199, 89, 0.10)' : 'var(--card-bg-elevated)'}; border-radius: var(--radius-xl); border: 1px solid ${showTick ? 'rgba(52, 199, 89, 0.25)' : 'var(--border-subtle)'}; cursor: pointer; position: relative; overflow: hidden;">
                            ${allDone ? `
                            <div style="font-size: 1.4rem; flex-shrink: 0; line-height: 1;">${step.icon}</div>
                            ` : `
                            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${showTick ? '#34c759' : 'var(--border-subtle)'}; display: flex; align-items: center; justify-content: center; color: ${showTick ? '#34c759' : 'var(--text-secondary)'}; font-weight: 800; font-size: 0.8rem; background: ${showTick ? 'var(--card-bg)' : 'var(--surface-subtle)'}; flex-shrink: 0;">
                                ${showTick ? '✓' : step.icon}
                            </div>
                            `}
                            <div style="display: flex; flex-direction: column;">
                                ${!allDone ? `<div style="font-size: 0.75rem; font-weight: 800; color: ${showTick ? '#34c759' : 'var(--text-secondary)'}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Step ${i + 1}</div>` : ''}
                                <div style="font-size: 1rem; font-weight: 700; color: ${showTick ? 'var(--text-secondary)' : 'var(--text-brand-navy)'}; text-decoration: ${showTick ? 'line-through' : 'none'};">
                                    ${step.text}
                                </div>
                            </div>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    setTimeout(() => {
        // Delegated handler — inner [data-guide-action] spans
        // are checked first so they don't bubble to the outer
        // card's main action.
        guideContainer.addEventListener('click', (e) => {
            const target = (e.target as HTMLElement | null);
            if (!target) return;

            const innerAction = (target.closest('[data-guide-action]') as HTMLElement | null);
            if (innerAction) {
                const action = innerAction.dataset.guideAction;
                if (action === 'open-add-day') {
                    // openAddDayModal handles the no-active-trip
                    // case itself with its own alert; no
                    // pre-check needed.
                    openAddDayModal();
                } else if (action === 'navigate-expenses') {
                    navigate('expenses');
                } else if (action === 'navigate-upload') {
                    navigate('upload');
                }
                return;
            }

            const card = (target.closest('.guide-step-card') as HTMLElement | null);
            if (card?.dataset.index) {
                const idx = Number(card.dataset.index);
                steps[idx]?.action();
            }
        });
        const hBtn = (guideContainer.querySelector('#hideQuickAccessBtn') as HTMLButtonElement | null);
        if (hBtn) hBtn.onclick = (e) => {
            e.stopPropagation();
            STATE.hideQuickAccess = true;
            emit('state:changed');
            navigate('home');
        };
    }, 0);

    parent.appendChild(guideContainer);
}
