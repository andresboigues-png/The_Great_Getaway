// pages/budgets/helpers.ts — pure budget helpers + create/delete modal
// flows. Pulled out of pages/budgets.ts in C3 so Budgets.tsx can
// import them while keeping the modal flow as legacy showModal()
// (the create-budget modal isn't worth migrating to React in C3 — it
// only opens transiently and the legacy showModal already handles it
// cleanly).

import { STATE, emit } from '../../state.js';
import { EVENTS } from '../../constants.js';
import { convertCurrency, getSupportedCurrencies, hasRate } from '../../utils/currency.js';
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
import { t } from '../../i18n.js';

/** Sum (in EUR) the trip/category/user-filtered expenses for a budget.
 *
 *  2026-05-26 (audit B4): now split-aware on per-person budgets. The
 *  old version added `e.euroValue` whole for any expense where Alice
 *  was the payer (`e.who === budget.user`). For shared expenses this
 *  overstated Alice's spend because the others paid her back via the
 *  split — a €100 dinner split 50/50 with Bob counts as €100 against
 *  Alice's budget despite Alice only owing €50. The corrected rule:
 *
 *    - If a `user`-scoped budget AND the expense has splits, use that
 *      person's share — `(e.euroValue * splits[budget.user]) / sum(splits)`.
 *      The denom is the actual sum of split percentages, not a hard
 *      100, so the same normalization rule the balance math uses
 *      (settlement/balances.ts) applies here too — a 33/33/33 (99%)
 *      custom split aggregates to the right per-person share.
 *    - If a `user`-scoped budget AND the expense has NO splits but
 *      `e.who === budget.user`, the payer ate the whole expense; count
 *      the full euroValue.
 *    - If the budget has no user scope (or `user='all'`), splits are
 *      irrelevant — count the full euroValue. The trip+category gate
 *      above is the only filter.
 *
 *  Per-trip "All categories → everyone" overall budgets are unaffected
 *  by this change (they still count the trip's total spend, which is
 *  correct: the trip's spend is the sum of all expenses, regardless of
 *  who paid).
 */
export function spentForBudget(budget: any): number {
    const personScope: string | null =
        budget.user && budget.user !== 'all' ? budget.user : null;
    let spent = 0;
    for (const e of STATE.expenses || []) {
        if (e.isSettlement) continue;
        if (budget.tripId && budget.tripId !== 'all' && e.tripId !== budget.tripId) continue;
        if (budget.categoryId && budget.categoryId !== 'all' && e.categoryId !== budget.categoryId)
            continue;
        const euroValue = e.euroValue || 0;
        if (!personScope) {
            spent += euroValue;
            continue;
        }
        // Person-scoped budget: count the budget-holder's SHARE of the
        // expense, not the gross amount paid. Splits dict keys are
        // companion names; if the budget holder isn't in the splits
        // dict the expense isn't theirs to count.
        const splits = e.splits;
        if (splits && Object.keys(splits).length > 0) {
            const pct = splits[personScope];
            if (pct === undefined) continue; // budget-holder isn't on this split
            const denom = Object.values(splits).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
            if (denom <= 0) continue;
            spent += (euroValue * pct) / denom;
            continue;
        }
        // No splits dict: legacy expense, count if the payer matches.
        if (e.who === personScope) {
            spent += euroValue;
        }
    }
    return spent;
}

/** BUG-6 (MK2 audit): total spend covered by a SET of budgets, counting each
 *  expense ONCE. The Overall card previously summed `spentForBudget` per
 *  budget, so any expense under overlapping scopes was double-counted — a
 *  trip-total budget + a category sub-budget both counted the same expenses
 *  (Lisbon's real €970.62 spend showed as €1,095.13). Here we take the UNION
 *  of expenses matched by any budget's trip+category scope and sum each at
 *  full euroValue. (Person-scoped budgets count a share in their own card; the
 *  at-a-glance Overall intentionally uses the full value of each covered
 *  expense once.) */
export function spentAcrossBudgets(budgets: any[]): number {
    const seen = new Set<string>();
    let sum = 0;
    for (const e of STATE.expenses || []) {
        if (e.isSettlement) continue;
        if (e.id && seen.has(e.id)) continue;
        const covered = budgets.some((b) =>
            (!b.tripId || b.tripId === 'all' || e.tripId === b.tripId)
            && (!b.categoryId || b.categoryId === 'all' || e.categoryId === b.categoryId),
        );
        if (covered) {
            if (e.id) seen.add(e.id);
            sum += (e.euroValue || 0);
        }
    }
    return sum;
}


/** Status tier for a budget — drives the color + label across the UI.
 *
 *  2026-05-26 (audit B5): the "over" gate was `spent > target`, which
 *  meant a budget at *exactly* its limit (spent === target → pct = 100)
 *  fell through to the `pct > 80` "near limit" branch and rendered
 *  yellow instead of red. Tightened to `spent >= target` so hitting
 *  the ceiling exactly is treated as "over" (the spirit of the budget
 *  has been spent in full). */
export function budgetStatus(budget: any) {
    const spent = spentForBudget(budget);
    const target = budget.amount || 0;
    const pct = target > 0 ? (spent / target) * 100 : 0;
    if (target > 0 && spent >= target)
        return { tier: 'over' as const, color: '#ff3b30', label: t('budgets.statusLabelOver'), spent, target, pct };
    if (target > 0 && pct > 80)
        return { tier: 'near' as const, color: '#ff9500', label: t('budgets.statusLabelNear'), spent, target, pct };
    return { tier: 'ok' as const, color: '#34c759', label: t('budgets.statusLabelOk'), spent, target, pct };
}

/** Build a human-readable title for a budget's combination of filters.
 *  Always shows all three dimensions (trip, category, person). */
export function budgetTitle(b: any): string {
    const parts: string[] = [];
    if (b.tripId && b.tripId !== 'all') {
        // Renamed local from `t` to `trip` to avoid shadowing the
        // imported `t` (i18n lookup function).
        const trip = (STATE.trips || []).find((tr) => tr.id === b.tripId);
        const archived = (STATE.archivedTrips || []).find((tr) => tr.id === b.tripId);
        const name = trip?.name || archived?.name;
        if (name) parts.push(name);
    } else {
        parts.push(t('budgets.titleAllTrips'));
    }
    if (b.categoryId && b.categoryId !== 'all') {
        const cat = (STATE.categories || []).find((c) => c.id === b.categoryId);
        if (cat) parts.push(`${cat.icon ? cat.icon + ' ' : ''}${cat.name}`);
    } else {
        parts.push(t('budgets.titleAllCategories'));
    }
    if (b.user && b.user !== 'all') {
        parts.push(b.user);
    } else {
        parts.push(t('budgets.titleEveryone'));
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
        title: t('budgets.deleteConfirmTitle'),
        message: t('budgets.deleteConfirmMessage', {
            title: budgetTitle(b),
            amount: formatHome(b.amount, 'EUR'),
        }),
        confirmText: t('budgets.deleteConfirmBtn'),
        onConfirm: () => {
            STATE.budgets = STATE.budgets.filter((x) => x.id !== id);
            emit(EVENTS.STATE_CHANGED);
            const p = deleteBudgetOnServer(id);
            if (p) p.catch((err) => console.error('Delete budget failed:', err));
            showLiquidAlert(t('budgets.deletedToast'));
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
            // Renamed param from `t` to `tr` to avoid shadowing the i18n
            // `t` import.
            (tr) =>
                `<option value="${esc(tr.id)}" ${tr.id === activeTripId ? 'selected' : ''}>${esc(tr.name)}</option>`,
        )
        .join('');
    const catOpts = (STATE.categories || [])
        .map(
            (c) =>
                `<option value="${esc(c.id)}">${esc(c.icon ? c.icon + ' ' : '')}${esc(c.name)}</option>`,
        )
        .join('');
    const allCompanionNames = Array.from(
        new Set((STATE.trips || []).flatMap((tr) => getTripCompanionNames(tr))),
    ).sort();
    const userOpts = allCompanionNames.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    const home = getHomeCurrency();
    // R3-Round 2 fix: same widening as ManualTab — show every currency
    // the live FX cache OR the static fallback knows about (not just
    // the 17-entry CONVERSION_RATES).
    const currOpts = getSupportedCurrencies()
        .map((c) => `<option value="${c}" ${home === c ? 'selected' : ''}>${c}</option>`)
        .join('');

    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle:
            'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;',
        innerHTML: `
            <h2 class="h2-display">${t('budgets.createTitle')}</h2>
            <p class="text-subtitle">${t('budgets.createSubtitle')}</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">${t('budgets.createTripLabel')}</label>
                <select id="newBudTrip" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    <option value="all" ${!activeTripId ? 'selected' : ''}>${t('budgets.createTripAll')}</option>${tripOpts}
                </select>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">${t('budgets.createCategoryLabel')}</label>
                <select id="newBudCat" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    <option value="all">${t('budgets.createCategoryAll')}</option>${catOpts}
                </select>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">${t('budgets.createPersonLabel')}</label>
                <select id="newBudUser" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    <option value="all">${t('budgets.createPersonAll')}</option>${userOpts}
                </select>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">${t('budgets.createTargetLabel')}</label>
                <div style="display: grid; grid-template-columns: 1fr 110px; gap: var(--space-3);">
                    <input type="number" id="newBudAmt" class="glass-input" placeholder="1000" min="0" step="any" style="padding: var(--space-3); border-radius: 12px;">
                    <select id="newBudCurr" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${currOpts}</select>
                </div>
                <div id="newBudStatus" style="font-size:0.72rem; color: var(--text-secondary); min-height:1em; font-weight:700;"></div>
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="newBudCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${t('budgets.createCancelBtn')}</button>
                <button id="newBudSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${t('budgets.createSaveBtn')}</button>
            </div>
        `,
    });
    const statusEl = q(root, '#newBudStatus') as HTMLElement;
    (q(root, '#newBudCancelBtn') as HTMLButtonElement).onclick = () => close();
    (q(root, '#newBudSaveBtn') as HTMLButtonElement).onclick = async () => {
        const amtRaw = (q(root, '#newBudAmt') as HTMLInputElement).value;
        const amt = parseFloat(amtRaw);
        if (!Number.isFinite(amt) || amt <= 0) {
            statusEl.textContent = t('budgets.createInvalidAmount');
            statusEl.style.color = '#ff9500';
            return;
        }
        const curr = (q(root, '#newBudCurr') as HTMLSelectElement).value;
        // R10-B6b F3: live-rate-aware gate. Pre-fix this used the bare
        // `CONVERSION_RATES[curr]` truthy check, which sees only the
        // 17-entry static fallback table — a user picking THB (or any
        // code outside the static table) hit the "unknown currency"
        // toast even though Frankfurter's live rate had already been
        // fetched and cached. `hasRate` consults EUR + live cache +
        // static table, matching pages/expenses/ManualTab.tsx:344.
        if (!hasRate(curr)) {
            statusEl.textContent = t('budgets.createUnknownCurrency', { curr });
            statusEl.style.color = '#ff3b30';
            return;
        }
        // R2 audit fix: route through convertCurrency so the live FX
        // overlay wins over the stale static `rate` constant above.
        // The `rate` lookup stays as a known-currency gate; the
        // actual conversion goes through the overlay-aware helper.
        const eurAmt = convertCurrency(amt, curr, 'EUR');
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
        statusEl.textContent = t('budgets.createSavingStatus');
        statusEl.style.color = 'var(--text-secondary)';
        try {
            await upsertBudget(budget);
            close();
            showLiquidAlert(t('budgets.createSavedToast'));
        } catch (err) {
            STATE.budgets = STATE.budgets.filter((b) => b.id !== budget.id);
            emit(EVENTS.STATE_CHANGED);
            statusEl.textContent = t('budgets.createSaveFailed', { message: (err as Error).message });
            statusEl.style.color = '#ff3b30';
        }
    };
};
