import { STATE, emit } from '../state.js';
import { CONVERSION_RATES } from '../constants.js';
import { generateId, q, formatHome, getHomeCurrency, esc, showLiquidAlert, showConfirmModal } from '../utils.js';
import { upsertBudget, deleteBudgetOnServer } from '../api.js';
import { navigate } from '../router.js';
import { getTripCompanionNames } from '../companions.js';
import { showModal } from '../components/Modal.js';

// ── Budget calculation helpers ────────────────────────────────────────
// Pulled out so the per-card render and the trip-summary card share one
// implementation. Earlier the spent-against-budget logic lived inline
// in the map and could drift between the two views.

/** Sum (in EUR) the trip/category/user-filtered expenses for a budget. */
function spentForBudget(budget) {
    let spent = 0;
    for (const e of STATE.expenses || []) {
        if (e.isSettlement) continue;
        if (budget.tripId && budget.tripId !== 'all' && e.tripId !== budget.tripId) continue;
        if (budget.categoryId && budget.categoryId !== 'all' && e.categoryId !== budget.categoryId) continue;
        if (budget.user && budget.user !== 'all' && e.who !== budget.user) continue;
        spent += e.euroValue || 0;
    }
    return spent;
}

/** Status tier for a budget — drives the color + label across the UI. */
function budgetStatus(budget) {
    const spent = spentForBudget(budget);
    const target = budget.amount || 0;
    const pct = target > 0 ? (spent / target) * 100 : 0;
    if (target > 0 && spent > target) return { tier: 'over',   color: '#ff3b30', label: 'Over budget',  spent, target, pct };
    if (target > 0 && pct > 80)        return { tier: 'near',  color: '#ff9500', label: 'Near limit',   spent, target, pct };
    return                              { tier: 'ok',    color: '#34c759', label: 'On track',     spent, target, pct };
}

// ── Filter/sort state for the budgets page ───────────────────────────
// Module-level so a filter pick survives navigating away and back. Both
// keys are stringly-typed; '' means "no filter / all".
let budgetsFilterTrip = '';

/** Build a human-readable title for a budget's combination of filters.
 *  Always shows all three dimensions (trip, category, person) — the
 *  earlier version silently skipped 'all' selections, which made a
 *  "Everywhere · Everyone" budget appear titled by just the category
 *  and a "Trip + All categories" budget show only the trip name with
 *  no hint of its scope. Now every dimension renders explicitly so
 *  the user can see exactly what each card targets. */
function budgetTitle(b) {
        const parts: string[] = [];
    if (b.tripId && b.tripId !== 'all') {
        const trip = (STATE.trips || []).find(t => t.id === b.tripId);
        const archived = (STATE.archivedTrips || []).find(t => t.id === b.tripId);
        const name = trip?.name || archived?.name;
        // Skip the trip part entirely if the lookup fails (orphaned
        // budget on a deleted trip) — falling back to a generic
        // "Trip" sentinel is misleading.
        if (name) parts.push(name);
    } else {
        parts.push('All trips');
    }
    if (b.categoryId && b.categoryId !== 'all') {
        const cat = (STATE.categories || []).find(c => c.id === b.categoryId);
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

const deleteBudget = (id) => {
    const b = (STATE.budgets || []).find(x => x.id === id);
    if (!b) return;
    showConfirmModal({
        title: 'Delete this budget?',
        message: `${budgetTitle(b)} — ${formatHome(b.amount, 'EUR')}. The expenses themselves stay; only the budget target is removed.`,
        confirmText: 'Delete',
        onConfirm: () => {
            STATE.budgets = STATE.budgets.filter(x => x.id !== id);
            emit('state:changed');
            // Fire-and-forget on the server side; the optimistic local
            // delete already rendered. If the server rejects we have a
            // mild ghost-budget on next sync, but the UI told the user
            // it's gone so we don't block here.
            // deleteBudgetOnServer is a no-op + returns undefined when the
            // user is logged out; guard before chaining .catch to avoid a
            // TypeError on the rare logged-out delete path.
            const p = deleteBudgetOnServer(id);
            if (p) p.catch(err => console.error('Delete budget failed:', err));
            showLiquidAlert('Budget deleted.');
            navigate('budgets');
        },
    });
};

// ── Create-budget modal ───────────────────────────────────────────────
// Replaces the always-visible side-by-side form. Modal flow keeps the
// page clean (just a list of budgets you care about) and means the
// form's defaults reset to "fresh" on every open. Validation +
// error-handling layered in, including a guard against unknown
// currency codes (was a silent default-1 trap in the previous version).
const openCreateBudgetModal = () => {
    // Pre-select the user's active trip if any. The earlier flow
    // defaulted to "All trips" — easy to leave on by accident, then
    // your trip-specific budget becomes a global one. Defaulting to
    // the active trip matches what users almost always want.
    const activeTripId = STATE.activeTripId || '';
    const tripOpts = (STATE.trips || []).map(t => `<option value="${esc(t.id)}" ${t.id === activeTripId ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
    const catOpts = (STATE.categories || []).map(c => `<option value="${esc(c.id)}">${esc(c.icon ? c.icon + ' ' : '')}${esc(c.name)}</option>`).join('');
    const allCompanionNames = Array.from(new Set(
        (STATE.trips || []).flatMap(t => getTripCompanionNames(t))
    )).sort();
    const userOpts = allCompanionNames.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    const home = getHomeCurrency();
    const currOpts = Object.keys(CONVERSION_RATES).map(c => `<option value="${c}" ${home === c ? 'selected' : ''}>${c}</option>`).join('');

    const { root, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 480px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto;',
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
    const statusEl = (q(root, '#newBudStatus') as HTMLElement);
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
        // Validate currency — used to silently default to 1:1 which
        // would lock in a budget at the wrong scale. Now we reject
        // unknown codes outright.
        const rate = CONVERSION_RATES[curr];
        if (rate === undefined) {
            statusEl.textContent = `Unknown currency "${curr}" — pick one from the list.`;
            statusEl.style.color = '#ff3b30';
            return;
        }
        const eurAmt = curr === 'EUR' ? amt : amt * rate;

        /** @type {import('../types').Budget} */
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
        emit('state:changed');
        statusEl.textContent = 'Saving…';
        statusEl.style.color = 'var(--text-secondary)';
        try {
            await upsertBudget(budget);
            close();
            showLiquidAlert('Budget saved.');
            navigate('budgets');
        } catch (err) {
            // Roll the optimistic add back so the user can retry without
            // a duplicate entry.
            STATE.budgets = STATE.budgets.filter(b => b.id !== budget.id);
            emit('state:changed');
            statusEl.textContent = `Save failed (${(err as Error).message}). Try again.`;
            statusEl.style.color = '#ff3b30';
        }
    };
};

// ── Page render ───────────────────────────────────────────────────────
export function renderBudgets() {
    const div = document.createElement('div');
    STATE.budgets = STATE.budgets || [];

    // Apply trip filter — '' means show all budgets.
    const visibleBudgets = budgetsFilterTrip
        ? STATE.budgets.filter(b => b.tripId === budgetsFilterTrip)
        : STATE.budgets;

    // Roll-up totals for the summary card. "Allocated" is the sum of
    // all visible budget targets in EUR; "Spent" is the sum of matched
    // expenses for those same budgets (de-duplicated would be ideal,
    // but in practice budgets target distinct slices so straight sum
    // is fine and matches user intuition).
    const totalAllocated = visibleBudgets.reduce((s, b) => s + (b.amount || 0), 0);
    const totalSpent = visibleBudgets.reduce((s, b) => s + spentForBudget(b), 0);
    const totalRemaining = totalAllocated - totalSpent;
    const overallPct = totalAllocated > 0 ? Math.min((totalSpent / totalAllocated) * 100, 999) : 0;
    const overallTier = totalAllocated === 0
        ? 'ok'
        : (totalSpent > totalAllocated ? 'over' : (overallPct > 80 ? 'near' : 'ok'));
    const overallColor = overallTier === 'over' ? '#ff3b30' : overallTier === 'near' ? '#ff9500' : '#34c759';

    // Trip filter chip row — one chip per trip that has ≥1 budget,
    // plus an "All" chip. Auto-hidden when only one trip is in play.
    const tripsInBudgets = [...new Set(STATE.budgets.map(b => b.tripId).filter(id => id && id !== 'all'))];
    const showTripChips = tripsInBudgets.length > 1;

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">Budgets</h1>
            <p>Set spending ceilings and track them across trips.</p>
        </div>

        <!-- Action row: Create + (optional) trip filter chips -->
        <div style="margin-top: 20px; display:flex; flex-wrap:wrap; gap: 10px; align-items:center;">
            <button id="createBudgetBtn" type="button"
                style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); color:#5e3c00; border:0; padding: 10px 18px; border-radius: 999px; font-weight:800; font-size:0.88rem; cursor:pointer; box-shadow: 0 8px 24px rgba(255,159,10,0.32);">
                + New budget
            </button>
            ${showTripChips ? `
                <button class="bud-trip-chip" data-trip="" type="button"
                    style="background: ${budgetsFilterTrip === '' ? 'rgba(255,159,10,0.16)' : 'rgba(0,0,0,0.04)'}; color:${budgetsFilterTrip === '' ? '#a35200' : '#002d5b'}; border:1px solid ${budgetsFilterTrip === '' ? 'rgba(255,159,10,0.4)' : 'rgba(0,0,0,0.08)'}; padding:7px 14px; border-radius:999px; font-size:0.78rem; font-weight:800; cursor:pointer;">
                    All trips
                </button>
                ${tripsInBudgets.map(tid => {
                    const trip = (STATE.trips || []).find(t => t.id === tid)
                        || (STATE.archivedTrips || []).find(t => t.id === tid);
                    if (!trip) return '';
                    const active = budgetsFilterTrip === tid;
                    return `
                        <button class="bud-trip-chip" data-trip="${esc(tid)}" type="button"
                            style="background:${active ? 'rgba(255,159,10,0.16)' : 'rgba(0,0,0,0.04)'}; color:${active ? '#a35200' : '#002d5b'}; border:1px solid ${active ? 'rgba(255,159,10,0.4)' : 'rgba(0,0,0,0.08)'}; padding:7px 14px; border-radius:999px; font-size:0.78rem; font-weight:800; cursor:pointer;">
                            ${esc(trip.name)}
                        </button>
                    `;
                }).join('')}
            ` : ''}
            <span style="margin-left:auto; font-size:0.78rem; color:var(--text-secondary); font-weight:700;">
                ${visibleBudgets.length} ${visibleBudgets.length === 1 ? 'budget' : 'budgets'}
            </span>
        </div>

        ${visibleBudgets.length > 0 ? `
            <!-- Summary card: allocated vs spent + remaining + overall pct.
                 Big numbers, single-row layout, matches the GG aesthetic
                 (rounded glass card + colour accent). -->
            <div class="card glass" style="margin-top: 18px; padding: 24px 28px; border-radius: 28px; background: ${overallTier === 'over' ? 'linear-gradient(135deg, rgba(255,59,48,0.06), rgba(255,159,10,0.04))' : 'linear-gradient(135deg, rgba(255,214,10,0.06), rgba(255,159,10,0.04))'}; border:1px solid ${overallTier === 'over' ? 'rgba(255,59,48,0.2)' : 'rgba(255,159,10,0.18)'};">
                <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                    <div style="min-width:0;">
                        <div style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${budgetsFilterTrip ? 'Trip overview' : 'Overall'}</div>
                        <div style="display:flex; align-items:baseline; gap:14px; flex-wrap:wrap;">
                            <div>
                                <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-secondary);">Spent</div>
                                <div style="font-size:1.8rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${formatHome(totalSpent, 'EUR')}</div>
                            </div>
                            <span style="color: rgba(0,0,0,0.25); font-size:1.5rem;">/</span>
                            <div>
                                <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-secondary);">Allocated</div>
                                <div style="font-size:1.8rem; font-weight:800; color:#002d5b; opacity:0.55; letter-spacing:-0.02em;">${formatHome(totalAllocated, 'EUR')}</div>
                            </div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-secondary);">${totalRemaining >= 0 ? 'Remaining' : 'Over by'}</div>
                        <div style="font-size:2rem; font-weight:800; color:${overallColor}; letter-spacing:-0.02em;">${formatHome(Math.abs(totalRemaining), 'EUR')}</div>
                        <div style="font-size:0.7rem; color:${overallColor}; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; margin-top:2px;">
                            ${overallTier === 'over' ? '⚠ Over budget' : overallTier === 'near' ? '⚡ Near limit' : '✓ On track'}
                        </div>
                    </div>
                </div>
                <!-- Slim progress bar across the bottom of the summary card. -->
                <div style="height: 8px; background: rgba(0,0,0,0.06); border-radius: 999px; overflow: hidden; margin-top: 16px;">
                    <div style="height: 100%; width: ${Math.min(overallPct, 100)}%; background: ${overallColor}; border-radius: 999px; transition: width 0.6s cubic-bezier(0.16,1,0.3,1); box-shadow: 0 0 12px ${overallColor};"></div>
                </div>
            </div>
        ` : ''}

        <!-- Budget cards grid -->
        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; margin-top: 18px;">
            ${visibleBudgets.length === 0 ? `
                <div class="card glass" style="grid-column: 1 / -1; padding: 48px 32px; border-radius: 28px; text-align:center; border:1.5px dashed rgba(255,159,10,0.32); background: rgba(255,159,10,0.04);">
                    <div style="font-size: 3rem; margin-bottom: 8px;">💰</div>
                    <h2 style="margin:0 0 6px; color:#a35200; font-weight:800;">No budgets ${budgetsFilterTrip ? 'on this trip' : 'yet'}</h2>
                    <p style="margin:0; color: var(--text-secondary);">Click <strong>+ New budget</strong> above to set a target. You can scope it to one trip + category + person, or leave it as an account-wide cap.</p>
                </div>
            ` : visibleBudgets.map(b => {
                const status = budgetStatus(b);
                const variance = status.tier === 'over'
                    ? `Over by ${formatHome(status.spent - status.target, 'EUR')}`
                    : `${formatHome(Math.max(status.target - status.spent, 0), 'EUR')} left`;
                const category = (STATE.categories || []).find(c => c.id === b.categoryId);
                const icon = category?.icon || '💰';
                const accentColor = category?.color || status.color;
                return `
                    <div class="card glass card-glow-blue" style="padding: 18px 20px; border-radius: 24px; display:flex; flex-direction:column; gap:14px; height:100%; box-sizing:border-box;">
                        <!-- Top section: icon + title + status pill.
                             min-height keeps two-line titles from
                             pushing the bottom section out of sync
                             with single-line cards in the same row. -->
                        <div style="display:flex; align-items:flex-start; gap:12px; min-height:56px;">
                            <div style="width:44px; height:44px; border-radius:14px; background: ${accentColor}1f; color:${accentColor}; display:flex; align-items:center; justify-content:center; font-size:1.4rem; flex-shrink:0;">${icon}</div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:800; color:#002d5b; font-size:1rem; line-height:1.25; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${esc(budgetTitle(b))}</div>
                                <div style="font-size:0.7rem; color:var(--text-secondary); font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-top:2px;">
                                    Target ${formatHome(b.amount, 'EUR')}${b.originalCurrency && b.originalCurrency !== 'EUR' ? ` · was ${formatHome(b.originalAmount || 0, b.originalCurrency)}` : ''}
                                </div>
                            </div>
                            <span style="background: ${status.color}1f; color:${status.color}; padding:3px 10px; border-radius:999px; font-size:0.65rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; flex-shrink:0; white-space:nowrap;">${status.label}</span>
                        </div>
                        <!-- Bottom section: spent / variance / progress
                             bar / delete row. margin-top:auto pushes
                             this block to the bottom of the card so
                             progress bars align across cards in the
                             same row regardless of title length. -->
                        <div style="margin-top:auto;">
                            <div style="display:flex; align-items:baseline; gap:6px; margin-bottom:8px; flex-wrap:wrap;">
                                <span style="font-size:1.5rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${formatHome(status.spent, 'EUR')}</span>
                                <span style="font-size:0.85rem; color:var(--text-secondary); font-weight:600;">spent · ${variance}</span>
                            </div>
                            <div style="height: 8px; background: rgba(0,0,0,0.05); border-radius: 999px; overflow: hidden;">
                                <div style="height:100%; width:${Math.min(status.pct, 100)}%; background:${status.color}; border-radius:999px; transition: width 0.6s cubic-bezier(0.16,1,0.3,1); box-shadow: 0 0 8px ${status.color};"></div>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-top:6px; font-size:0.7rem; color:var(--text-secondary); font-weight:700;">
                                <span>${Math.round(status.pct)}% used</span>
                                <button class="delete-budget-btn" data-budget-id="${esc(b.id)}" type="button"
                                    style="background:none; border:0; color:#ff3b30; font-size:0.72rem; font-weight:800; cursor:pointer; padding:0; text-transform:uppercase; letter-spacing:0.06em;">Delete</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Delegated handlers — single click listener on the page root.
    div.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement | null);
        if (!target) return;
        if (target.closest('#createBudgetBtn')) {
            openCreateBudgetModal();
            return;
        }
        const tripChip = (target.closest('.bud-trip-chip') as HTMLElement | null);
        if (tripChip) {
            budgetsFilterTrip = tripChip.dataset.trip || '';
            navigate('budgets');
            return;
        }
        const delBtn = (target.closest('.delete-budget-btn') as HTMLElement | null);
        if (delBtn?.dataset.budgetId) {
            deleteBudget(delBtn.dataset.budgetId);
            return;
        }
    });

    return div;
}
