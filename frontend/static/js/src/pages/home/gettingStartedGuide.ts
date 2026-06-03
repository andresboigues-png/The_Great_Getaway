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
import { iconSvg } from '../../icons.js';
import type { TripDay, Expense } from '../../types';


type GuideStep = {
    text: string;
    done: boolean;
    iconName: string;
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
    tripDays: TripDay[];
    /** Trip expenses for the active trip. Same rationale —
     *  drives `hasExpenses`. */
    tripExpenses: Expense[];
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

    const hasLogin = !!STATE.user || window.isGoogleAuthenticated === true;
    const hasTrip = STATE.trips.length > 0;
    // Companions are per-trip now — for the getting-started
    // checklist, count "any trip with any companions" as having
    // companions set up.
    //
    // BUG-10/42 (MK2 audit): exclude the auto-added self-companion. Every
    // owned trip gets the owner unshifted as a companion
    // (`linkedUserId === me.id`, stamped in api.ts), so the pre-fix
    // `length > 0` check marked "Add companions" done before the user
    // had added anyone. Count only companions that aren't you.
    const myId = STATE.user?.id;
    const hasCompanions = STATE.trips.some(
        t => (t.companions || []).some(
            (c: { linkedUserId?: string }) => c.linkedUserId !== myId,
        ),
    );
    const hasPlan = tripDays.length > 0;
    const hasExpenses = tripExpenses.length > 0;
    const hasBudgets = !!(STATE.budgets && STATE.budgets.length > 0);
    const hasCollections = !!(STATE.archivedTrips && STATE.archivedTrips.length > 0);
    const hasCategories = (STATE.categories || []).length > 3; // Default is 3
    const hasSettlement = STATE.expenses.some((e: Expense) => e.isSettlement);
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
        { text: t('home.guideStep1'), done: !!STATE.guideProgress.login, iconName: 'lock', action: () => navigate('profile') },
        { text: t('home.guideStep2'), done: !!STATE.guideProgress.trip, iconName: 'plane', action: () => openNewTripModal() },
        // Companions are per-trip now — the action opens the
        // trip-companion picker on Home (or just navigates Home
        // if there's no active trip yet, since the picker is
        // reachable from the trip header there).
        { text: t('home.guideStep3'), done: !!STATE.guideProgress.companions, iconName: 'users', action: () => {
            if (activeTrip) openCompanionPickerModal(activeTrip.id);
            else navigate('home');
        } },
        // Personalization page DOM (#persMenu/#persContent/
        // #persCategories) only exists once the page has
        // rendered, so navigate first and switch the tab on the
        // next tick.
        { text: t('home.guideStep4'), done: !!STATE.guideProgress.categories, iconName: 'tag', action: () => { navigate('personalization'); setTimeout(() => showPersTab('categories'), 50); } },
        { text: `${t('home.guideStep5')}<br><span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">(${t('home.guideStep5Prefix')} — ${planSubLink})</span>`, done: !!STATE.guideProgress.plan, iconName: 'sparkles', action: () => navigate('ai') },
        { text: `${t('home.guideStep6')}<br><span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">(${expenseManual} ${t('home.guideStep6Or')} ${expenseBatch})</span>`, done: !!STATE.guideProgress.expenses, iconName: 'wallet', action: () => navigate('expenses') },
        { text: t('home.guideStep7'), done: !!STATE.guideProgress.budgets, iconName: 'barChart', action: () => navigate('budgets') },
        { text: t('home.guideStep8'), done: !!STATE.guideProgress.settlement, iconName: 'handshake', action: () => navigate('settlement') },
        { text: t('home.guideStep9'), done: !!STATE.guideProgress.collections, iconName: 'folder', action: () => navigate('collections') },
        { text: t('home.guideStep10'), done: !!STATE.guideProgress.friends, iconName: 'smartphone', action: () => navigate('friends') },
    ];

    const allDone = steps.every(s => s.done) || !!STATE.guideAllDone;
    if (allDone && !STATE.guideAllDone) {
        STATE.guideAllDone = true;
        emit('state:changed');
    }

    // BUG-10 (MK2 audit): keep the guide expanded until the user
    // EXPLICITLY hides it — never infer dismissal from progress. The
    // previous logic collapsed the guide whenever `completedSteps > 0`,
    // but the "login" step auto-completes the moment you're signed in
    // (you can't reach Home otherwise), so completedSteps was ALWAYS
    // ≥ 1 and the 10-step onboarding guide collapsed to a tiny "Show
    // Quick Access" button before any new user could ever see it —
    // contradicting the very intent the old comment documented.
    //
    //   - STATE.hideQuickAccess === true → user clicked Hide → collapsed
    //     (the small Show button).
    //   - otherwise (false / undefined) → expanded. For a brand-new user
    //     that's the onboarding checklist; once every step is done it
    //     becomes the compact Quick Access toolbar, still one click from
    //     Hide.
    const isHidden = STATE.hideQuickAccess === true;

    if (isHidden) {
        const showBtnContainer = document.createElement('div');
        showBtnContainer.style.textAlign = 'center';
        showBtnContainer.style.marginTop = '40px';
        showBtnContainer.innerHTML = `
            <button class="btn-glass-light" style="display:inline-flex; align-items:center; gap:6px;">
                ${iconSvg('compass', { size: 16 })}${esc(t('home.showQuickAccessBtn'))}
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
    // and dark surfaces. The green-tick state keeps its bright
    // #34c759 accent on the NON-TEXT chrome (card tint, border,
    // circle ring) — green is the success colour in both themes.
    //
    // a11y (WCAG AA): bright #34c759 is too light for SMALL TEXT —
    // it fails the 4.5:1 contrast gate even on white (~2.2:1), and
    // worse on the light-green ticked-card tint (~2.0:1). So the
    // "Step N" label + the ✓ glyph use a darker success green that
    // clears 4.5:1 while still reading as green. The visual identity
    // (bright-green tint/ring) is unchanged.
    const SUCCESS_TEXT = '#166534';
    guideContainer.innerHTML = `
        <div class="card glass" style="padding: 32px; border-radius: 28px; border: 1.5px solid ${allDone ? 'var(--border-subtle)' : 'rgba(0, 122, 255, 0.25)'}; background: var(--card-bg); position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="background: ${allDone ? 'var(--text-brand-navy)' : 'var(--accent-blue)'}; color: white; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">${allDone ? iconSvg('zap', { size: 18 }) : iconSvg('compass', { size: 18 })}</div>
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
                            <div style="flex-shrink: 0; line-height: 1; color: var(--accent-blue); display: inline-flex;">${iconSvg(step.iconName, { size: 22 })}</div>
                            ` : `
                            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${showTick ? '#34c759' : 'var(--border-subtle)'}; display: flex; align-items: center; justify-content: center; color: ${showTick ? SUCCESS_TEXT : 'var(--text-secondary)'}; font-weight: 800; font-size: 0.8rem; background: ${showTick ? 'var(--card-bg)' : 'var(--surface-subtle)'}; flex-shrink: 0;">
                                ${showTick ? '✓' : iconSvg(step.iconName, { size: 14 })}
                            </div>
                            `}
                            <div style="display: flex; flex-direction: column;">
                                ${!allDone ? `<div style="font-size: 0.75rem; font-weight: 800; color: ${showTick ? SUCCESS_TEXT : 'var(--text-secondary)'}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Step ${i + 1}</div>` : ''}
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
