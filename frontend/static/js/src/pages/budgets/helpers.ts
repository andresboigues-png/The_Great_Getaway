// pages/budgets/helpers.ts — pure budget helpers + create/delete modal
// flows. Pulled out of pages/budgets.ts in C3 so Budgets.tsx can
// import them while keeping the modal flow as legacy showModal()
// (the create-budget modal isn't worth migrating to React in C3 — it
// only opens transiently and the legacy showModal already handles it
// cleanly).

import { STATE, emit } from '../../state.js';
import { EVENTS, CURRENCY_SYMBOLS } from '../../constants.js';
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
import { upsertBudget, deleteBudgetOnServer, isUnretryableRejection } from '../../api.js';
import { getTripCompanionNames } from '../../companions.js';
import { showModal } from '../../components/Modal.js';
import { iconSvg, iconForCategory } from '../../icons.js';
import { t } from '../../i18n.js';
import type { Budget } from '../../types';

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
/** How much of ONE expense counts against ONE budget, given the budget's
 *  trip/category/person scope. Returns 0 when the expense is out of scope.
 *  Single source of truth shared by `spentForBudget` (per-card) and
 *  `spentAcrossBudgets` (Overall) so the two can never disagree.
 *
 *  Settlements never count; the trip + category gates are exact-match
 *  (an empty/`'all'` scope dimension matches everything). For a
 *  person-scoped budget the budget-holder's SHARE of a split is counted
 *  (not the gross paid), mirroring the balance/settlement normalization.
 */
function expenseAmountForBudget(e: typeof STATE.expenses[number], budget: Budget): number {
    if (e.isSettlement) return 0;
    if (budget.tripId && budget.tripId !== 'all' && e.tripId !== budget.tripId) return 0;
    if (budget.categoryId && budget.categoryId !== 'all' && e.categoryId !== budget.categoryId)
        return 0;
    // Integration audit C1: `?? value ?? 0` (not `|| 0`) so this matches
    // the balances/Insights read. Pre-fix a frozen euroValue of 0 read as
    // €0 here but as the raw foreign `value` in balances — the SAME
    // expense meant two different things. Now all three agree, and a
    // legacy EUR row missing euroValue counts its `value` (not €0).
    const euroValue = e.euroValue ?? e.value ?? 0;
    const personScope: string | null =
        budget.user && budget.user !== 'all' ? budget.user : null;
    if (!personScope) return euroValue;
    // Person-scoped budget: count the budget-holder's SHARE of the
    // expense, not the gross amount paid. Splits dict keys are companion
    // names; if the budget holder isn't in the splits dict the expense
    // isn't theirs to count.
    const splits = e.splits;
    if (splits && Object.keys(splits).length > 0) {
        const pct = splits[personScope];
        if (pct === undefined) return 0; // budget-holder isn't on this split
        const denom = Object.values(splits).reduce((a: number, b: number) => a + (Number(b) || 0), 0);
        if (denom <= 0) return 0;
        return (euroValue * pct) / denom;
    }
    // No splits dict: legacy expense, count if the payer matches.
    return e.who === personScope ? euroValue : 0;
}

export function spentForBudget(budget: Budget): number {
    let spent = 0;
    for (const e of STATE.expenses || []) {
        spent += expenseAmountForBudget(e, budget);
    }
    return spent;
}

/** BUG-6 (MK2) + BUD-5 (MK4): total spend covered by a SET of budgets,
 *  counting each expense ONCE and at an amount consistent with the per-card
 *  `spentForBudget`.
 *
 *  BUG-6 fixed double-counting across overlapping TRIP/CATEGORY scopes (a
 *  trip-total budget + a category sub-budget no longer count the same expense
 *  twice). BUD-5 extends the same consistency to PERSON scope: the old version
 *  ignored `budget.user` and always summed the full euroValue, so a single
 *  person-scoped budget read as "€100 / €80 OVER" in the Overall while its own
 *  card correctly read "€50 / €80" (Alice's split share) — the same budget,
 *  two different numbers on one page.
 *
 *  Rule: for each expense, take the LARGEST amount any single covering budget
 *  attributes to it (via the shared `expenseAmountForBudget`), and add that
 *  once. The "max" is the union-correct answer — if a whole-expense
 *  (non-person) budget covers it, the full value counts (broadest wins,
 *  matching BUG-6); if ONLY person-scoped budgets cover it, the largest single
 *  person's share counts, so a set of person-only budgets agrees with the
 *  cards instead of summing shares into a phantom overspend. */
export function spentAcrossBudgets(budgets: Budget[]): number {
    let sum = 0;
    for (const e of STATE.expenses || []) {
        if (e.isSettlement) continue;
        let best = 0;
        for (const b of budgets) {
            const amt = expenseAmountForBudget(e, b);
            if (amt > best) best = amt;
        }
        sum += best;
    }
    return sum;
}

/** True iff budget `inner`'s scope is contained within (is a sub-scope of)
 *  budget `outer` — i.e. for every dimension `outer` is either unscoped
 *  ('all'/empty) or matches `inner`'s value. Used to find which budgets are
 *  "covered" by a broader one so the Overall allocation doesn't double-count.
 *  Reflexive (a budget contains itself); the strict (`!==`) check in
 *  `allocatedAcrossBudgets` excludes the self/duplicate case. */
function dimContains(outerVal: string | undefined, innerVal: string | undefined): boolean {
    const o = outerVal && outerVal !== 'all' ? outerVal : null;
    const i = innerVal && innerVal !== 'all' ? innerVal : null;
    return o === null || o === i; // outer unscoped → contains anything; else exact match
}
function budgetContains(outer: Budget, inner: Budget): boolean {
    return (
        dimContains(outer.tripId, inner.tripId) &&
        dimContains(outer.categoryId, inner.categoryId) &&
        dimContains(outer.user, inner.user)
    );
}

/** BUD-4 (MK4): overlap-aware allocation total for the Overall card.
 *
 *  The Overall previously summed every `b.amount` while spend was deduped by
 *  `spentAcrossBudgets`, so the ratio was internally inconsistent: a trip-total
 *  budget (€1500) + a food sub-budget (€700) over the same trip gave
 *  `totalAllocated = €2200` against a correctly-deduped `totalSpent`, so the
 *  card reported "€1200 remaining" when real trip headroom was €500.
 *
 *  Fix: count only the BROADEST budgets' allocation — a budget whose scope is
 *  strictly contained within another visible budget (the sub-budget) is folded
 *  into its parent and not added again. Non-overlapping budgets (different
 *  trips, disjoint categories, different people) are all still counted. Exact
 *  scope-duplicates (which the DB now prevents, but be defensive) collapse to a
 *  single allocation. The result is a denominator the deduped spend can be
 *  honestly compared against. */
export function allocatedAcrossBudgets(budgets: Budget[]): number {
    let sum = 0;
    for (const [i, b] of budgets.entries()) {
        // Drop b if some OTHER budget strictly contains its scope. For an
        // exact-scope tie (mutual containment) keep only the first index so
        // the pair contributes exactly one allocation.
        const covered = budgets.some((other, j) => {
            if (j === i) return false;
            if (!budgetContains(other, b)) return false;
            // Tie-break exact duplicates: if b also contains other (same
            // scope), only the earlier index survives.
            if (budgetContains(b, other)) return j < i;
            return true;
        });
        if (!covered) sum += b.amount || 0;
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
export function budgetStatus(budget: Budget) {
    const spent = spentForBudget(budget);
    const target = budget.amount || 0;
    const pct = target > 0 ? (spent / target) * 100 : 0;
    if (target > 0 && spent >= target)
        return { tier: 'over' as const, color: '#ff3b30', label: t('budgets.statusLabelOver'), spent, target, pct };
    if (target > 0 && pct > 80)
        return { tier: 'near' as const, color: '#ff9500', label: t('budgets.statusLabelNear'), spent, target, pct };
    return { tier: 'ok' as const, color: '#34c759', label: t('budgets.statusLabelOk'), spent, target, pct };
}

/** Resolve a budget's three scope dimensions to display labels.
 *  Shared by budgetTitle (which joins them with ' · ') and the delete
 *  confirm (which renders them on distinct lines). `trip` is null when
 *  includeTrip=false so callers can omit that dimension entirely. */
export function budgetScopeParts(
    b: Budget,
    includeTrip = true,
): { trip: string | null; category: string; person: string } {
    // Trip. Insights shows budgets for the CURRENT trip only, so it passes
    // includeTrip=false — the trip name would be identical on every row.
    let trip: string | null = null;
    if (includeTrip) {
        if (b.tripId && b.tripId !== 'all') {
            // Renamed local from `t` to `tr` to avoid shadowing the
            // imported `t` (i18n lookup function).
            const tr = (STATE.trips || []).find((x) => x.id === b.tripId);
            const archived = (STATE.archivedTrips || []).find((x) => x.id === b.tripId);
            trip = tr?.name || archived?.name || t('budgets.titleAllTrips');
        } else {
            trip = t('budgets.titleAllTrips');
        }
    }
    // Category.
    let category: string;
    if (b.categoryId && b.categoryId !== 'all') {
        // Resolve by id, then fall back to a case-insensitive NAME match so
        // name-string categoryIds ('food') from imports/legacy/seed data still
        // show their real label instead of dropping the category from the
        // title (matches the Insights by-category fix).
        const cat = (STATE.categories || []).find((c) => c.id === b.categoryId)
            || (STATE.categories || []).find((c) => c.name.toLowerCase() === String(b.categoryId).toLowerCase());
        if (cat) {
            // Title is plain text — the category ICON is shown separately on the
            // budget card (Budgets.tsx CategoryIcon). Name only, no emoji.
            category = cat.name;
        } else {
            // T3-1: show the raw category key (prettified) instead of dropping
            // it, so a budget scoped to an import/legacy/seed slug still reads
            // right (matches the Insights by-category synthetic fallback).
            const raw = String(b.categoryId).trim();
            category = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : t('budgets.titleAllCategories');
        }
    } else {
        category = t('budgets.titleAllCategories');
    }
    // Person.
    const person = b.user && b.user !== 'all' ? b.user : t('budgets.titleEveryone');
    return { trip, category, person };
}

/** Build a human-readable title for a budget's combination of filters.
 *  Always shows all three dimensions (trip, category, person). */
export function budgetTitle(b: Budget, includeTrip = true): string {
    const { trip, category, person } = budgetScopeParts(b, includeTrip);
    return [trip, category, person].filter((p): p is string => !!p).join(' · ');
}

/** Optimistically delete a budget after a confirm, fire the server
 *  delete in the background, and emit state:changed so the React
 *  page re-renders. */
export const deleteBudget = (id: string) => {
    const b = (STATE.budgets || []).find((x) => x.id === id);
    if (!b) return;
    // B4-I5: a structured scope block (trip / category / person on distinct,
    // labelled lines) instead of one dotted string, so look-alike per-person
    // budgets across trips are distinguishable at a glance before deleting.
    // showConfirmModal interpolates `message` as HTML, so we build the block
    // here; every dynamic value is esc()'d.
    const scope = budgetScopeParts(b);
    const scopeRow = (label: string, value: string) =>
        `<span style="display:flex; gap:8px; justify-content:center; align-items:baseline;">` +
        `<span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.06em; opacity:0.5;">${esc(label)}</span>` +
        `<span style="font-weight:700; color:#fff;">${esc(value)}</span></span>`;
    const scopeBlock =
        `<span style="display:flex; flex-direction:column; gap:4px; margin:10px 0;">` +
        (scope.trip ? scopeRow(t('budgets.deleteConfirmTripLabel'), scope.trip) : '') +
        scopeRow(t('budgets.deleteConfirmCategoryLabel'), scope.category) +
        scopeRow(t('budgets.deleteConfirmPersonLabel'), scope.person) +
        scopeRow(t('budgets.deleteConfirmTargetLabel'), formatHome(b.amount, 'EUR')) +
        `</span>` +
        `<span style="opacity:0.65;">${t('budgets.deleteConfirmMessageTail')}</span>`;
    showConfirmModal({
        title: t('budgets.deleteConfirmTitle'),
        message: scopeBlock,
        confirmText: t('budgets.deleteConfirmBtn'),
        onConfirm: () => {
            STATE.budgets = STATE.budgets.filter((x) => x.id !== id);
            emit(EVENTS.STATE_CHANGED);
            void (async () => {
                // Audit MK1 (silent-failure theme): honest-save. The old code
                // fired a fire-and-forget _delete and ALWAYS toasted "deleted",
                // so a server rejection (e.g. an archived-trip 409) reverted
                // the budget on the next pull with no feedback. Now branch on
                // the result: surface + roll back on an unretryable rejection.
                const res = await deleteBudgetOnServer(id);
                if (isUnretryableRejection(res)) {
                    if (!STATE.budgets.some((x) => x.id === id)) {
                        STATE.budgets = [...STATE.budgets, b];
                        emit(EVENTS.STATE_CHANGED);
                    }
                    showLiquidAlert(t('errors.deleteFailed'), 'error');
                } else {
                    // Success, or a network failure the outbox will replay
                    // (isUnretryableRejection lets status-0 stand) → the
                    // optimistic delete holds.
                    showLiquidAlert(t('budgets.deletedToast'), 'success');
                }
            })();
        },
    });
};

/** Modal-driven create-budget flow. Imperative showModal — kept as
 *  legacy because (a) the modal opens transiently so React's
 *  re-render advantage doesn't apply, and (b) showModal handles
 *  focus-trap, esc-to-close, etc. that we'd have to replicate
 *  in React. */
export const openCreateBudgetModal = (existing?: Budget) => {
    // Edit mode (an existing budget is passed in) pre-fills every field and
    // REUSES the budget's id so the upsert UPDATES the row in place. Create
    // mode defaults the trip to the active trip and the currency to home.
    const isEdit = !!existing;
    const activeTripId = STATE.activeTripId || '';
    const selTripId = existing?.tripId || (activeTripId || 'all');
    const selCatId = existing?.categoryId || 'all';
    const selUser = existing?.user || 'all';
    const tripOpts = (STATE.trips || [])
        .map(
            // Renamed param from `t` to `tr` to avoid shadowing the i18n
            // `t` import.
            (tr) =>
                `<option value="${esc(tr.id)}" ${tr.id === selTripId ? 'selected' : ''}>${esc(tr.name)}</option>`,
        )
        .join('');
    // Category picker — a custom GG-icon dropdown (native <option> can't hold
    // SVG). Options = "All categories" (no icon) + each category rendered via
    // iconForCategory (legacy emoji OR icon key). Mirrors the expense-form
    // CategoryListbox so the category picker looks the same everywhere.
    type CatOpt = { id: string; name: string; icon: string | null };
    const catOptList: CatOpt[] = [
        { id: 'all', name: t('budgets.createCategoryAll'), icon: null },
        ...(STATE.categories || []).map((c) => ({ id: c.id, name: c.name, icon: c.icon || null })),
    ];
    const catRowInner = (o: CatOpt): string =>
        `<span style="display:inline-flex;width:20px;justify-content:center;color:var(--accent-blue,#0071e3);">${o.icon ? iconForCategory(o.icon, { size: 18 }) : ''}</span>` +
        `<span style="flex:1;">${esc(o.name)}</span>`;
    const catCurInner = (id: string): string => {
        const o = catOptList.find((x) => x.id === id) || catOptList[0]!;
        return catRowInner(o);
    };
    const renderCatOptions = (selId: string): string =>
        catOptList
            .map(
                (o) =>
                    `<button type="button" class="bud-cat-dd__opt" role="option" data-id="${esc(o.id)}" aria-selected="${o.id === selId ? 'true' : 'false'}" style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;border:0;background:${o.id === selId ? 'color-mix(in srgb, var(--accent-blue,#0071e3) 12%, transparent)' : 'transparent'};border-radius:8px;cursor:pointer;text-align:left;font:inherit;font-size:0.9rem;color:var(--text-brand-navy,#002d5b);">${catRowInner(o)}${o.id === selId ? `<span style="display:inline-flex;color:var(--accent-blue,#0071e3);">${iconSvg('check', { size: 15 })}</span>` : ''}</button>`,
            )
            .join('');
    const allCompanionNames = Array.from(
        new Set((STATE.trips || []).flatMap((tr) => getTripCompanionNames(tr))),
    ).sort();
    const userOpts = allCompanionNames.map((g) => `<option value="${esc(g)}" ${g === selUser ? 'selected' : ''}>${esc(g)}</option>`).join('');
    const home = getHomeCurrency();
    const selCurr = existing?.originalCurrency || home;
    // R3-Round 2 fix: same widening as ManualTab — show every currency
    // the live FX cache OR the static fallback knows about (not just
    // the 17-entry CONVERSION_RATES).
    // F2-DSGN1: union the rate-backed currencies with the full symbol-known
    // (= server-allowed) set, so no-rate currencies (VND/EGP/ARS) are pickable
    // — they get a manual EUR-target field below (mirrors the expense form).
    const currOpts = Array.from(new Set([...getSupportedCurrencies(), ...Object.keys(CURRENCY_SYMBOLS)]))
        .sort((a, b) => (a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b)))
        .map((c) => `<option value="${c}" ${selCurr === c ? 'selected' : ''}>${c}</option>`)
        .join('');

    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle:
            'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;',
        innerHTML: `
            <h2 class="h2-display">${isEdit ? t('budgets.editTitle') : t('budgets.createTitle')}</h2>
            <p class="text-subtitle">${t('budgets.createSubtitle')}</p>
            <div style="display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-4) 0 var(--space-6);">
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">${t('budgets.createTripLabel')}</label>
                <select id="newBudTrip" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    <option value="all" ${selTripId === 'all' ? 'selected' : ''}>${t('budgets.createTripAll')}</option>${tripOpts}
                </select>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">${t('budgets.createCategoryLabel')}</label>
                <div id="newBudCatDd" style="position:relative;">
                    <button type="button" id="newBudCatTrigger" class="glass-input" aria-haspopup="listbox" aria-expanded="false" style="width:100%; padding: var(--space-3); border-radius: 12px; background:white; display:flex; align-items:center; gap:8px; text-align:left; cursor:pointer;">
                        <span id="newBudCatCur" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0;">${catCurInner(selCatId)}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;color:var(--text-secondary);"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    <div id="newBudCatPanel" role="listbox" hidden style="position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:60; background:white; border:1px solid var(--glass-border, rgba(0,45,91,0.14)); border-radius:12px; box-shadow:0 12px 32px rgba(0,45,91,0.18); max-height:240px; overflow:auto; padding:4px;">${renderCatOptions(selCatId)}</div>
                </div>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">${t('budgets.createPersonLabel')}</label>
                <select id="newBudUser" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">
                    <option value="all" ${selUser === 'all' ? 'selected' : ''}>${t('budgets.createPersonAll')}</option>${userOpts}
                </select>
                <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary); margin-top:8px;">${t('budgets.createTargetLabel')}</label>
                <div style="display: grid; grid-template-columns: 1fr 110px; gap: var(--space-3);">
                    <input type="number" id="newBudAmt" class="glass-input" placeholder="1000" min="0" step="any" value="${isEdit && existing?.originalAmount != null ? esc(String(existing.originalAmount)) : ''}" style="padding: var(--space-3); border-radius: 12px;">
                    <select id="newBudCurr" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${currOpts}</select>
                </div>
                <!-- B4-I3: a budget always stores canonical EUR, so a non-EUR
                     target is compared to spend in EUR at today's rate. Say so
                     honestly (rate-backed non-EUR only; the no-rate case has its
                     own manual-EUR hint below). -->
                <span id="newBudFxNote" style="display:none; font-size:0.72rem; color: var(--text-secondary);"></span>
                <!-- F2-DSGN1: manual EUR target, shown only for currencies with no
                     live rate (mirrors the expense form's manual-EUR field). -->
                <div id="newBudEurRow" style="display:none; flex-direction:column; gap: var(--space-2); margin-top:8px;">
                    <label style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-secondary);">${t('budgets.createEurLabel')}</label>
                    <input type="number" id="newBudEur" class="glass-input" placeholder="0.00" min="0" step="any" value="${isEdit && existing?.amount != null ? esc(String(existing.amount)) : ''}" style="padding: var(--space-3); border-radius: 12px;">
                    <span id="newBudEurHint" style="font-size:0.72rem; color: var(--text-secondary);"></span>
                </div>
                <div id="newBudStatus" style="font-size:0.72rem; color: var(--text-secondary); min-height:1em; font-weight:700;"></div>
            </div>
            <div style="display:flex; gap: var(--space-3);">
                <button id="newBudCancelBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${t('budgets.createCancelBtn')}</button>
                <button id="newBudSaveBtn" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${isEdit ? t('budgets.editSaveBtn') : t('budgets.createSaveBtn')}</button>
            </div>
        `,
    });
    const statusEl = q(root, '#newBudStatus') as HTMLElement;
    (q(root, '#newBudCancelBtn') as HTMLButtonElement).onclick = () => close();

    // Custom category dropdown: trigger toggles the panel; picking an option
    // updates the trigger + `selectedCatId` (read by Save) and closes. The
    // outside-click listener lives on the overlay `root`, so it dies with the
    // modal (no document-listener leak).
    let selectedCatId = selCatId;
    const catDd = q(root, '#newBudCatDd') as HTMLElement;
    const catTrigger = q(root, '#newBudCatTrigger') as HTMLButtonElement;
    const catPanel = q(root, '#newBudCatPanel') as HTMLElement;
    const catCur = q(root, '#newBudCatCur') as HTMLElement;
    const closeCatPanel = () => {
        catPanel.hidden = true;
        catTrigger.setAttribute('aria-expanded', 'false');
    };
    const wireCatOptions = () => {
        catPanel.querySelectorAll<HTMLButtonElement>('.bud-cat-dd__opt').forEach((opt) => {
            opt.addEventListener('click', () => {
                selectedCatId = opt.dataset.id || 'all';
                catCur.innerHTML = catCurInner(selectedCatId);
                catPanel.innerHTML = renderCatOptions(selectedCatId);
                wireCatOptions(); // re-bind after re-render
                closeCatPanel();
            });
        });
    };
    wireCatOptions();
    catTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        catPanel.hidden = !catPanel.hidden;
        catTrigger.setAttribute('aria-expanded', catPanel.hidden ? 'false' : 'true');
    });
    root.addEventListener('click', (e) => {
        if (catDd && !catDd.contains(e.target as Node)) closeCatPanel();
    });
    // F2-DSGN1: toggle the manual EUR-target field when the chosen currency has
    // no live rate (so VND/EGP/ARS budgets are enterable). Initial state
    // reflects the default-selected (home) currency, which always has a rate.
    const eurRow = q(root, '#newBudEurRow') as HTMLElement;
    const eurHint = q(root, '#newBudEurHint') as HTMLElement;
    const fxNote = q(root, '#newBudFxNote') as HTMLElement;
    const currSel = q(root, '#newBudCurr') as HTMLSelectElement;
    // B4-I4: the top amount input. When a no-rate currency is picked it's
    // ignored for conversion (only the manual EUR box below is saved), so we
    // dim + disable it and swap its placeholder to say so — otherwise a user
    // types '5000000 VND' up top yet the small EUR figure is what saves.
    const amtInput = q(root, '#newBudAmt') as HTMLInputElement;
    const amtPlaceholderDefault = amtInput.placeholder;
    const syncEurRow = () => {
        const needsEur = !!currSel.value && !hasRate(currSel.value);
        eurRow.style.display = needsEur ? 'flex' : 'none';
        // B4-I4: dim/disable + relabel the top amount when it's ignored.
        amtInput.disabled = needsEur;
        amtInput.style.opacity = needsEur ? '0.4' : '';
        amtInput.placeholder = needsEur
            ? t('budgets.createAmtIgnored', { curr: currSel.value })
            : amtPlaceholderDefault;
        if (needsEur) eurHint.textContent = t('budgets.createEurHint', { curr: currSel.value });
        // B4-I3: for a rate-backed non-EUR target, disclose that it's stored and
        // tracked in EUR at the current rate (the no-rate case already explains
        // its own manual-EUR field, and an EUR target needs no note).
        const showFx = !!currSel.value && currSel.value !== 'EUR' && !needsEur;
        fxNote.style.display = showFx ? 'block' : 'none';
        if (showFx) fxNote.textContent = t('budgets.createFxNote', { curr: currSel.value });
    };
    currSel.onchange = syncEurRow;
    syncEurRow();
    (q(root, '#newBudSaveBtn') as HTMLButtonElement).onclick = async () => {
        const amtRaw = (q(root, '#newBudAmt') as HTMLInputElement).value;
        const amt = parseFloat(amtRaw);
        if (!Number.isFinite(amt) || amt <= 0) {
            statusEl.textContent = t('budgets.createInvalidAmount');
            statusEl.style.color = '#ff9500';
            return;
        }
        const curr = (q(root, '#newBudCurr') as HTMLSelectElement).value;
        // F2-MM4/DSGN1: a currency with no live rate (VND/EGP/ARS) can't be
        // converted — take the explicit EUR target from the manual field
        // (mirrors the expense manual-EUR flow) instead of blocking, or
        // silently converting 1:1 (which stored the raw foreign number as if
        // it were euros). Rate-backed currencies convert via the overlay-aware
        // helper as before. `hasRate` consults EUR + live cache + static table.
        let eurAmt: number;
        if (!hasRate(curr)) {
            eurAmt = parseFloat((q(root, '#newBudEur') as HTMLInputElement).value);
            if (!Number.isFinite(eurAmt) || eurAmt <= 0) {
                statusEl.textContent = t('budgets.createEurRequired', { curr });
                statusEl.style.color = '#ff3b30';
                return;
            }
            eurAmt = Math.round(eurAmt * 100) / 100;
        } else {
            eurAmt = convertCurrency(amt, curr, 'EUR');
        }
        const budget = {
            // Reuse the id when editing so the upsert UPDATES the row.
            id: existing?.id || generateId(),
            tripId: (q(root, '#newBudTrip') as HTMLSelectElement).value,
            categoryId: selectedCatId,
            user: (q(root, '#newBudUser') as HTMLSelectElement).value,
            amount: eurAmt,
            // MM-7: `amount` is already canonical EUR (converted/typed above),
            // so the budget's own currency is EUR. Set it explicitly rather
            // than leaving it undefined — the read side groups/labels off this
            // and an absent currency rendered as a bare number with no unit.
            currency: 'EUR',
            originalAmount: amt,
            originalCurrency: curr,
        };
        // Optimistic write: editing replaces the row in place (keeping the
        // pre-edit copy so a server rejection can roll back to it); creating
        // appends a new row.
        const _idx = STATE.budgets.findIndex((bg) => bg.id === budget.id);
        const _prevRow = _idx >= 0 ? STATE.budgets[_idx] : null;
        if (_idx >= 0) STATE.budgets[_idx] = budget;
        else STATE.budgets.push(budget);
        emit(EVENTS.STATE_CHANGED);
        statusEl.textContent = t('budgets.createSavingStatus');
        statusEl.style.color = 'var(--text-secondary)';
        // Audit MK5 BUG-023 (honest-save): upsertBudget → _upsertWithUpdatedAt
        // RESOLVES {ok:false} on a 409 (duplicate scope) / 4xx / network error
        // and never throws, so the old catch was dead code and the modal always
        // flashed "Budget saved." for a write the server rejected — then the
        // 409's pullFromServer wiped the optimistic row. Inspect the result: on
        // a real rejection roll the row back, keep the modal open, and surface
        // the actual reason. status:0 = network failure (already queued in the
        // outbox) → treat as optimistic-ok so the retry can land.
        const res = await upsertBudget(budget);
        if (res && isUnretryableRejection(res)) {
            // Roll back: restore the pre-edit row, or drop the optimistic new one.
            const _i = STATE.budgets.findIndex((bg) => bg.id === budget.id);
            if (_prevRow) { if (_i >= 0) STATE.budgets[_i] = _prevRow; }
            else if (_i >= 0) STATE.budgets.splice(_i, 1);
            emit(EVENTS.STATE_CHANGED);
            if (res.status === 409) {
                statusEl.textContent = t('budgets.createDuplicateScope');
            } else {
                const reason = (res.body?.error as string | undefined) || `HTTP ${res.status}`;
                statusEl.textContent = t('budgets.createSaveFailed', { message: reason });
            }
            statusEl.style.color = '#ff3b30';
            return;
        }
        close();
        showLiquidAlert(isEdit ? t('budgets.updatedToast') : t('budgets.createSavedToast'), 'success');
    };
};
