// pages/budgets/helpers.ts — pure budget helpers + create/delete modal
// flows. Pulled out of pages/budgets.ts in C3 so Budgets.tsx can
// import them while keeping the modal flow as legacy showModal()
// (the create-budget modal isn't worth migrating to React in C3 — it
// only opens transiently and the legacy showModal already handles it
// cleanly).

import { STATE, emit } from '../../state.js';
import { CONVERSION_RATES, EVENTS } from '../../constants.js';
import {
    generateId,
    q,
    formatHome,
    getHomeCurrency,
    esc,
    showLiquidAlert,
    showConfirmModal,
} from '../../utils.js';
import { upsertBudget, deleteBudgetOnServer } from '../../api.js';
import { getTripCompanionNames } from '../../companions.js';
import { showModal } from '../../components/Modal.js';

/** Sum (in EUR) the trip/category/user-filtered expenses for a budget. */
export function spentForBudget(budget: any): number {
    let spent = 0;
    for (const e of STATE.expenses || []) {
        if (e.isSettlement) continue;
        if (budget.tripId && budget.tripId !== 'all' && e.tripId !== budget.tripId) continue;
        if (budget.categoryId && budget.categoryId !== 'all' && e.categoryId !== budget.categoryId)
            continue;
        if (budget.user && budget.user !== 'all' && e.who !== budget.user) continue;
        spent += e.euroValue || 0;
    }
    return spent;
}

/** Status tier for a budget — drives the color + label across the UI. */
export function budgetStatus(budget: any) {
    const spent = spentForBudget(budget);
    const target = budget.amount || 0;
    const pct = target > 0 ? (spent / target) * 100 : 0;
    if (target > 0 && spent > target)
        return { tier: 'over' as const, color: '#ff3b30', label: 'Over budget', spent, target, pct };
    if (target > 0 && pct > 80)
        return { tier: 'near' as const, color: '#ff9500', label: 'Near limit', spent, target, pct };
    return { tier: 'ok' as const, color: '#34c759', label: 'On track', spent, target, pct };
}

/** Build a human-readable title for a budget's combination of filters.
 *  Always shows all three dimensions (trip, category, person). */
export function budgetTitle(b: any): string {
    const parts: string[] = [];
    if (b.tripId && b.tripId !== 'all') {
        const trip = (STATE.trips || []).find((t) => t.id === b.tripId);
        const archived = (STATE.archivedTrips || []).find((t) => t.id === b.tripId);
        const name = trip?.name || archived?.name;
        if (name) parts.push(name);
    } else {
        parts.push('All trips');
    }
    if (b.categoryId && b.categoryId !== 'all') {
        const cat = (STATE.categories || []).find((c) => c.id === b.categoryId);
        if (cat) parts.push(`${cat.icon ? cat.icon + ' ' : ''}${cat.name}`);
    } else {
        parts.push('All categories');
    }
    if (b.user && b.user !== 'all') {
        parts.push(b.user);
    } else {
        parts.push('Everyone');
    }
    return parts.join(' · ');
}

/** Optimistically delete a budget after a confirm, fire the server
 *  delete in the background, and emit state:changed so the React
 *  page re-renders. */
export const deleteBudget = (id: string) => {
    const b = (STATE.budgets || []).find((x) => x.id === id);
    if (!b) return;
    showConfirmModal({
        title: 'Delete this budget?',
        message: `${budgetTitle(b)} — ${formatHome(b.amount, 'EUR')}. The expenses themselves stay; only the budget target is removed.`,
        confirmText: 'Delete',
        onConfirm: () => {
            STATE.budgets = STATE.budgets.filter((x) => x.id !== id);
            emit(EVENTS.STATE_CHANGED);
            const p = deleteBudgetOnServer(id);
            if (p) p.catch((err) => console.error('Delete budget failed:', err));
            showLiquidAlert('Budget deleted.');
        },
    });
};

/** Modal-driven create-budget flow. Imperative showModal — kept as
 *  legacy because (a) the modal opens transiently so React's
 *  re-render advantage doesn't apply, and (b) showModal handles
 *  focus-trap, esc-to-close, etc. that we'd have to replicate
 *  in React. */
export const openCreateBudgetModal = () => {
    const activeTripId = STATE.activeTripId || '';
    const tripOpts = (STATE.trips || [])
        .map(
            (t) =>
                `<option value="${esc(t.id)}" ${t.id === activeTripId ? 'selected' : ''}>${esc(t.name)}</option>`,
        )
        .join('');
    const catOpts = (STATE.categories || [])
        .map(
            (c) =>
                `<option value="${esc(c.id)}">${esc(c.icon ? c.icon + ' ' : '')}${esc(c.name)}</option>`,
        )
        .join('');
    const allCompanionNames = Array.from(
        new Set((STATE.trips || []).flatMap((t) => getTripCompanionNames(t))),
    ).sort();
    const userOpts = allCompanionNames.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    const home = getHomeCurrency();
    const currOpts = Object.keys(CONVERSION_RATES)
        .map((c) => `<option value="${c}" ${home === c ? 'selected' : ''}>${c}</option>`)
        .join('');

    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle:
            'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;',
        innerHTML: `
            <h2 class="h2-display">New budget</h2>
            <p class="text-subtitle">Set a spending ceiling — track it against the matching expenses.</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">Trip</label>
                <select id="newBudTrip" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    <option value="all" ${!activeTripId ? 'selected' : ''}>All trips</option>${tripOpts}
                </select>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Category</label>
                <select id="newBudCat" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    <option value="all">All categories</option>${catOpts}
                </select>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Person</label>
                <select id="newBudUser" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    <option value="all">Everyone on the trip</option>${userOpts}
                </select>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">Target amount</label>
                <div style="display: grid; grid-template-columns: 1fr 110px; gap: var(--space-3);">
                    <input type="number" id="newBudAmt" class="glass-input" placeholder="1000" min="0" step="any" style="padding: var(--space-3); border-radius: 12px;">
                    <select id="newBudCurr" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${currOpts}</select>
                </div>
                <div id="newBudStatus" style="font-size:0.72rem; color: var(--text-secondary); min-height:1em; font-weight:700;"></div>
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="newBudCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                <button id="newBudSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Save budget</button>
            </div>
        `,
    });
    const statusEl = q(root, '#newBudStatus') as HTMLElement;
    (q(root, '#newBudCancelBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#newBudSaveBtn') as HTMLButtonElement).onclick = async () => {
        const amtRaw = (q(root, '#newBudAmt') as HTMLInputElement).value;
        const amt = parseFloat(amtRaw);
        if (!Number.isFinite(amt) || amt <= 0) {
            statusEl.textContent = 'Enter a valid positive amount.';
            statusEl.style.color = '#ff9500';
            return;
        }
        const curr = (q(root, '#newBudCurr') as HTMLSelectElement).value;
        const rate = CONVERSION_RATES[curr];
        if (rate === undefined) {
            statusEl.textContent = `Unknown currency "${curr}" — pick one from the list.`;
            statusEl.style.color = '#ff3b30';
            return;
        }
        const eurAmt = curr === 'EUR' ? amt : amt * rate;
        const budget = {
            id: generateId(),
            tripId: (q(root, '#newBudTrip') as HTMLSelectElement).value,
            categoryId: (q(root, '#newBudCat') as HTMLSelectElement).value,
            user: (q(root, '#newBudUser') as HTMLSelectElement).value,
            amount: eurAmt,
            originalAmount: amt,
            originalCurrency: curr,
        };
        STATE.budgets.push(budget);
        emit(EVENTS.STATE_CHANGED);
        statusEl.textContent = 'Saving…';
        statusEl.style.color = 'var(--text-secondary)';
        try {
            await upsertBudget(budget);
            close();
            showLiquidAlert('Budget saved.');
        } catch (err) {
            STATE.budgets = STATE.budgets.filter((b) => b.id !== budget.id);
            emit(EVENTS.STATE_CHANGED);
            statusEl.textContent = `Save failed (${(err as Error).message}). Try again.`;
            statusEl.style.color = '#ff3b30';
        }
    };
};
