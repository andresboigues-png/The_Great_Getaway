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

    const steps: GuideStep[] = [
        { text: 'Log in to your account', done: !!STATE.guideProgress.login, icon: '🔐', action: () => navigate('profile') },
        { text: 'Create your first trip', done: !!STATE.guideProgress.trip, icon: '✈️', action: () => openNewTripModal() },
        // Companions are per-trip now — the action opens the
        // trip-companion picker on Home (or just navigates Home
        // if there's no active trip yet, since the picker is
        // reachable from the trip header there).
        { text: 'Add your travel companions', done: !!STATE.guideProgress.companions, icon: '👥', action: () => {
            if (activeTrip) openCompanionPickerModal(activeTrip.id);
            else navigate('home');
        } },
        // Personalization page DOM (#persMenu/#persContent/
        // #persCategories) only exists once the page has
        // rendered, so navigate first and switch the tab on the
        // next tick.
        { text: 'Set your own categories', done: !!STATE.guideProgress.categories, icon: '🏷️', action: () => { navigate('personalization'); setTimeout(() => showPersTab('categories'), 50); } },
        { text: 'Generate your AI travel plan<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(or <span data-guide-action="open-add-day" class="link-underline">create it manually</span>)</span>', done: !!STATE.guideProgress.plan, icon: '✦', action: () => navigate('ai') },
        { text: 'Input your expenses<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(<span data-guide-action="navigate-expenses" class="link-underline">Manually</span> or <span data-guide-action="navigate-upload" class="link-underline">in a batch</span>)</span>', done: !!STATE.guideProgress.expenses, icon: '💰', action: () => navigate('expenses') },
        { text: 'Explore Budgets', done: !!STATE.guideProgress.budgets, icon: '📊', action: () => navigate('budgets') },
        { text: 'Settle your first expenses', done: !!STATE.guideProgress.settlement, icon: '🤝', action: () => navigate('settlement') },
        { text: 'Discover Collections', done: !!STATE.guideProgress.collections, icon: '📂', action: () => navigate('collections') },
        { text: 'Connect with your friends', done: !!STATE.guideProgress.friends, icon: '📱', action: () => navigate('friends') },
    ];

    const allDone = steps.every(s => s.done) || !!STATE.guideAllDone;
    if (allDone && !STATE.guideAllDone) {
        STATE.guideAllDone = true;
        emit('state:changed');
    }

    // Toggle state for Quick Access — hidden by default. Anyone
    // who explicitly opens it (which sets STATE.hideQuickAccess
    // = false) keeps seeing it until they hit Hide; everyone
    // else (undefined or true) sees only the small "Show Quick
    // Access" button.
    const isHidden = STATE.hideQuickAccess !== false;

    if (isHidden) {
        const showBtnContainer = document.createElement('div');
        showBtnContainer.style.textAlign = 'center';
        showBtnContainer.style.marginTop = '40px';
        showBtnContainer.innerHTML = `
            <button class="btn-glass-light">
                🧭 Show Quick Access
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

    guideContainer.innerHTML = `
        <div class="card glass" style="padding: 32px; border-radius: 28px; border: 1.5px solid ${allDone ? 'rgba(0,0,0,0.05)' : 'rgba(0, 122, 255, 0.15)'}; background: ${allDone ? 'rgba(255,255,255,0.4)' : 'linear-gradient(165deg, rgba(255,255,255,0.9), rgba(240,247,255,0.8))'}; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="background: ${allDone ? '#000000' : 'var(--accent-blue)'}; color: white; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">${allDone ? '⚡️' : '🧭'}</div>
                    <h2 style="margin: 0; font-size: 1.5rem; letter-spacing: -0.02em; color: #002d5b;">${allDone ? 'Quick Access' : 'Getting Started Guide'}</h2>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    ${allDone ? `<span style="font-size: 0.75rem; font-weight: 800; color: rgba(0,45,91,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Toolbar</span>` : ''}
                    <button id="hideQuickAccessBtn" class="pill-btn-warn-hover">Hide</button>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                ${steps.map((step, i) => {
                    const showTick = !allDone && step.done;
                    return `
                        <button type="button" class="card-button-reset guide-step-card" data-index="${i}" style="display: flex; align-items: center; gap: var(--space-4); padding: var(--space-4) var(--space-5); background: ${showTick ? 'rgba(52, 199, 89, 0.08)' : 'white'}; border-radius: var(--radius-xl); border: 1px solid ${showTick ? 'rgba(52, 199, 89, 0.2)' : 'rgba(0,0,0,0.05)'}; cursor: pointer; position: relative; overflow: hidden;">
                            ${allDone ? `
                            <div style="font-size: 1.4rem; flex-shrink: 0; line-height: 1;">${step.icon}</div>
                            ` : `
                            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${showTick ? '#34c759' : 'rgba(0,45,91,0.1)'}; display: flex; align-items: center; justify-content: center; color: ${showTick ? '#34c759' : 'rgba(0,0,0,0.4)'}; font-weight: 800; font-size: 0.8rem; background: ${showTick ? 'white' : 'rgba(0,0,0,0.02)'}; flex-shrink: 0;">
                                ${showTick ? '✓' : step.icon}
                            </div>
                            `}
                            <div style="display: flex; flex-direction: column;">
                                ${!allDone ? `<div style="font-size: 0.75rem; font-weight: 800; color: ${showTick ? '#34c759' : 'rgba(0,45,91,0.4)'}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Step ${i + 1}</div>` : ''}
                                <div style="font-size: 1rem; font-weight: 700; color: ${showTick ? 'rgba(0,45,91,0.6)' : '#002d5b'}; text-decoration: ${showTick ? 'line-through' : 'none'};">
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
