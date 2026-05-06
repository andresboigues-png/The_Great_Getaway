// @ts-check
// pages/settlement.js
//
// Trip settlement page — calculates per-person balances on the active
// trip, suggests minimal-payment debts to clear them, and records
// settlements as expense rows tagged `isSettlement: true`.
//
// Revamp goal: same functionality as before, but laid out in 3 tabs
// (Trip / History / Cross-trip), with the GG aesthetic — glass cards,
// big numbers, gradient text, soft shadows, leaderboard card showing
// who paid the most and who owes the most. Audit fixes layered in:
// idempotency guard on the Settle button so a fast double-click can't
// double-record, native alert() replaced with showLiquidAlert(), and
// the snake_case `e.euro_value` fallback dropped (data migration to
// canonical camelCase ran ages ago).

import { STATE, emit } from '../state.js';
import { generateId, showConfirmModal, q, formatHome, getHomeCurrency, convertCurrency, esc, showLiquidAlert } from '../utils.js';
import { getTripCompanionNames } from '../companions.js';
import { canEditExpenses } from '../permissions.js';
import { showModal } from '../components/Modal.js';

/** @type {'trip' | 'history' | 'global'} */
let activeSettlementTab = 'trip';
let currentTripId = /** @type {string | null} */ (null);

// ── Pure helpers ──────────────────────────────────────────────────────
// Pulled out so the per-trip and cross-trip views share one
// implementation. Easier to reason about than inline IIFEs.

/** Compute per-person balance for a single trip (positive = is owed,
 *  negative = owes). Splits roster falls back to (a) the trip's
 *  companion list, then (b) the names referenced by existing expenses. */
function computeTripBalances(trip) {
    if (!trip) return { balances: {}, roster: [], expenses: [] };
    const tripExps = (STATE.expenses || []).filter(e => e.tripId === trip.id);
    const tripCompanionNames = getTripCompanionNames(trip);
    const roster = tripCompanionNames.length > 0
        ? tripCompanionNames
        : Array.from(new Set(
            tripExps.flatMap(e => [e.who, ...Object.keys(e.splits || {})]).filter(Boolean)
        ));

    /** @type {Record<string, number>} */
    const balances = {};
    roster.forEach(p => balances[p] = 0);

    for (const exp of tripExps) {
        const amount = exp.euroValue || exp.value || 0;
        if (balances[exp.who] !== undefined) balances[exp.who] += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (balances[person] !== undefined) balances[person] -= amount * (Number(pct) / 100);
            }
        } else {
            // No-splits fallback: equal share across the roster.
            const share = amount / Math.max(roster.length, 1);
            roster.forEach(p => { if (balances[p] !== undefined) balances[p] -= share; });
        }
    }
    return { balances, roster, expenses: tripExps };
}

/** Greedy minimal-payments list. Pairs largest debtor with largest
 *  creditor, settles the smaller of the two, repeats. */
function simplifyDebts(balances) {
    const creditors = [];
    const debtors = [];
    for (const [person, balance] of Object.entries(balances)) {
        if (balance > 0.01) creditors.push({ person, amount: balance });
        else if (balance < -0.01) debtors.push({ person, amount: Math.abs(balance) });
    }
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);
    const debts = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const pay = Math.min(debtors[i].amount, creditors[j].amount);
        debts.push({ from: debtors[i].person, to: creditors[j].person, amount: pay });
        debtors[i].amount -= pay;
        creditors[j].amount -= pay;
        if (debtors[i].amount < 0.01) i++;
        if (creditors[j].amount < 0.01) j++;
    }
    return debts;
}

/** Compute the cross-trip balance map. Same shape as the per-trip
 *  one, but seeded with every name from every trip's roster (active
 *  + archived) and accumulated over EVERY expense. */
function computeGlobalBalances() {
    /** @type {Record<string, number>} */
    const globalBalances = {};
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        for (const name of getTripCompanionNames(t)) {
            if (!(name in globalBalances)) globalBalances[name] = 0;
        }
    }
    const archivedExps = (STATE.archivedTrips || []).flatMap(t => t.expenses || []);
    const allExpenses = [...STATE.expenses, ...archivedExps];

    /** @type {Record<string, string[]>} */
    const tripCompanionsById = {};
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        tripCompanionsById[t.id] = getTripCompanionNames(t);
    }

    for (const exp of allExpenses) {
        const amount = exp.euroValue || exp.value || 0;
        if (globalBalances[exp.who] !== undefined) globalBalances[exp.who] += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (globalBalances[person] !== undefined) globalBalances[person] -= amount * (Number(pct) / 100);
            }
        } else {
            const roster = tripCompanionsById[exp.tripId] || [];
            const splitGroup = roster.length > 0
                ? roster
                : Array.from(new Set([exp.who, ...Object.keys(exp.splits || {})].filter(Boolean)));
            const share = amount / Math.max(splitGroup.length, 1);
            splitGroup.forEach(p => { if (globalBalances[p] !== undefined) globalBalances[p] -= share; });
        }
    }
    return globalBalances;
}

/** Per-companion paid/share leaderboard for a trip — used by the
 *  Trip-tab summary row. "paid" is the sum of expenses they fronted;
 *  "share" is the sum of their split obligations across the trip. */
function computeLeaderboard(trip) {
    if (!trip) return [];
    const exps = (STATE.expenses || []).filter(e => e.tripId === trip.id);
    const roster = getTripCompanionNames(trip);
    /** @type {Record<string, {paid: number, share: number}>} */
    const board = {};
    roster.forEach(p => board[p] = { paid: 0, share: 0 });
    for (const exp of exps) {
        const amount = exp.euroValue || exp.value || 0;
        if (board[exp.who]) board[exp.who].paid += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (board[person]) board[person].share += amount * (Number(pct) / 100);
            }
        } else {
            const share = amount / Math.max(roster.length, 1);
            roster.forEach(p => { if (board[p]) board[p].share += share; });
        }
    }
    return Object.entries(board).map(([name, v]) => ({
        name,
        paid: v.paid,
        share: v.share,
        net: v.paid - v.share,
    }));
}

// ── Render ────────────────────────────────────────────────────────────

export function renderSettlement() {
    const div = document.createElement('div');
    if (!currentTripId) {
        currentTripId = STATE.activeTripId || (STATE.trips.length > 0 ? STATE.trips[0].id : null);
    } else if (!STATE.trips.find(t => t.id === currentTripId)) {
        // Selected trip got archived / deleted — fall back gracefully.
        currentTripId = STATE.activeTripId || (STATE.trips.length > 0 ? STATE.trips[0].id : null);
    }

    const trip = STATE.trips.find(t => t.id === currentTripId) || null;
    const tripIsEditable = canEditExpenses(trip);

    // Build the entire HTML up-front, wire delegated handlers once at
    // the bottom. Switching tabs / trip just re-runs this whole render.
    div.innerHTML = buildPageHtml(trip, tripIsEditable);

    // ── Delegated handlers ────────────────────────────────────────
    div.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement | null} */ (e.target);
        if (!target) return;

        // Trip card (top strip) — switch the active trip.
        const tripCard = /** @type {HTMLElement | null} */ (target.closest('.settlement-trip-card'));
        if (tripCard?.dataset.tripId) {
            currentTripId = tripCard.dataset.tripId;
            div.innerHTML = buildPageHtml(
                STATE.trips.find(t => t.id === currentTripId) || null,
                canEditExpenses(STATE.trips.find(t => t.id === currentTripId)),
            );
            return;
        }

        // Tab switch.
        const tabBtn = /** @type {HTMLElement | null} */ (target.closest('.settle-tab'));
        if (tabBtn?.dataset.tab) {
            activeSettlementTab = /** @type {any} */ (tabBtn.dataset.tab);
            div.innerHTML = buildPageHtml(
                STATE.trips.find(t => t.id === currentTripId) || null,
                canEditExpenses(STATE.trips.find(t => t.id === currentTripId)),
            );
            return;
        }

        // One-click "Settle" — idempotency guard prevents double-tap
        // duplicates by disabling the button for 1.5s after the click.
        const settleBtn = /** @type {HTMLButtonElement | null} */ (target.closest('.settle-debt-btn'));
        if (settleBtn?.dataset.tripId && settleBtn.dataset.from && settleBtn.dataset.to && settleBtn.dataset.amount && !settleBtn.disabled) {
            settleBtn.disabled = true;
            settleBtn.textContent = 'Recording…';
            settleDebt(
                settleBtn.dataset.tripId,
                settleBtn.dataset.from,
                settleBtn.dataset.to,
                parseFloat(settleBtn.dataset.amount),
                'EUR',
                div,
            );
            return;
        }

        const manualBtn = /** @type {HTMLElement | null} */ (target.closest('.open-manual-settle-btn'));
        if (manualBtn?.dataset.tripId) {
            openManualSettleModal(manualBtn.dataset.tripId, div);
            return;
        }

        const editBtn = /** @type {HTMLElement | null} */ (target.closest('.edit-settlement-btn'));
        if (editBtn?.dataset.settlementId) {
            openEditSettlementModal(editBtn.dataset.settlementId, div);
            return;
        }

        const unsettleBtn = /** @type {HTMLElement | null} */ (target.closest('.unsettle-settlement-btn'));
        if (unsettleBtn?.dataset.settlementId && unsettleBtn.dataset.tripId) {
            deleteSettlement(unsettleBtn.dataset.settlementId, unsettleBtn.dataset.tripId, div);
            return;
        }
    });

    return div;
}

// ── Markup ────────────────────────────────────────────────────────────

function buildPageHtml(trip, tripIsEditable) {
    const tripsStrip = renderTripsStrip();
    const header = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">Settlements</h1>
            <p>Calculate who owes what and settle up fairly.</p>
        </div>
        ${tripsStrip}
    `;

    if (!trip) {
        return `
            ${header}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">No trips yet</h2>
                <p class="text-muted">Create a trip and add expenses to see settlement calculations.</p>
            </div>
        `;
    }

    return `
        ${header}
        ${renderTabsNav(trip)}
        ${activeSettlementTab === 'trip' ? renderTripTab(trip, tripIsEditable) : ''}
        ${activeSettlementTab === 'history' ? renderHistoryTab(trip, tripIsEditable) : ''}
        ${activeSettlementTab === 'global' ? renderGlobalTab() : ''}
    `;
}

/** Top-of-page horizontal scroll strip of trip cards. Same data /
 *  affordance as before; cleaner glass aesthetic. */
function renderTripsStrip() {
    if (STATE.trips.length === 0) return '';
    return `
        <div style="margin-top: 22px; margin-bottom: 12px;">
            <div style="display:flex; gap:12px; overflow-x:auto; padding-bottom:6px; scroll-behavior:smooth; -webkit-overflow-scrolling:touch;">
                ${STATE.trips.map(t => {
                    const settlementsTotal = (STATE.expenses || [])
                        .filter(e => e.tripId === t.id && e.isSettlement)
                        .reduce((sum, e) => sum + (e.euroValue || 0), 0);
                    const isActive = t.id === currentTripId;
                    return `
                        <button type="button" class="settlement-trip-card${isActive ? ' is-active' : ''}" data-trip-id="${esc(t.id)}"
                            style="flex-shrink:0; min-width: 200px; text-align:left; background: ${isActive ? 'linear-gradient(135deg, rgba(255,214,10,0.16), rgba(255,159,10,0.08))' : 'white'}; border: 1.5px solid ${isActive ? 'rgba(255,159,10,0.4)' : 'rgba(0,0,0,0.06)'}; border-radius: 18px; padding: 14px 16px; cursor:pointer; box-shadow: ${isActive ? '0 8px 24px rgba(255,159,10,0.18)' : '0 4px 12px rgba(0,45,91,0.06)'}; display:flex; flex-direction:column; gap:6px;">
                            <span style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:${isActive ? '#a35200' : 'var(--text-secondary)'};">Adventure</span>
                            <span style="font-size:1rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em; line-height:1.15;">${esc(t.name)}</span>
                            <span style="font-size:0.78rem; font-weight:700; color: var(--accent-blue);">${formatHome(settlementsTotal, 'EUR')} settled</span>
                        </button>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderTabsNav(trip) {
    const settlementsCount = (STATE.expenses || []).filter(e => e.tripId === trip.id && e.isSettlement).length;
    const tab = (key, label, badge) => `
        <button class="settle-tab${activeSettlementTab === key ? ' is-active' : ''}" data-tab="${key}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${activeSettlementTab === key ? '800' : '600'}; color:${activeSettlementTab === key ? 'var(--accent-blue)' : 'var(--text-secondary)'}; cursor:pointer; border-bottom:2px solid ${activeSettlementTab === key ? 'var(--accent-blue)' : 'transparent'}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${label}${badge !== undefined && badge > 0 ? ` <span style="background:rgba(0,113,227,0.12); color:var(--accent-blue); padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${badge}</span>` : ''}
        </button>
    `;
    return `
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${tab('trip', 'This trip')}
            ${tab('history', 'History', settlementsCount)}
            ${tab('global', 'Cross-trip')}
        </nav>
    `;
}

function renderTripTab(trip, tripIsEditable) {
    const { balances } = computeTripBalances(trip);
    const debts = simplifyDebts(balances);
    const board = computeLeaderboard(trip);
    const totalPaid = board.reduce((s, b) => s + b.paid, 0);

    const topPaid = [...board].sort((a, b) => b.paid - a.paid)[0];
    const topOwes = [...board].sort((a, b) => a.net - b.net)[0]; // most negative net
    const topOwed = [...board].sort((a, b) => b.net - a.net)[0];

    // ── Leaderboard: 3 highlight chips at the top of the tab ──
    const leaderboardCard = totalPaid > 0 ? `
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">Trip total</div>
                    <div style="font-size:2rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${formatHome(totalPaid, 'EUR')}</div>
                </div>
                ${topPaid ? `
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">💸 Top payer</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${esc(topPaid.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${formatHome(topPaid.paid, 'EUR')}</div>
                    </div>
                ` : ''}
                ${topOwed && topOwed.net > 0.01 ? `
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">+ Most owed</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${esc(topOwed.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${formatHome(topOwed.net, 'EUR')}</div>
                    </div>
                ` : ''}
                ${topOwes && topOwes.net < -0.01 ? `
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">– Owes the most</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${esc(topOwes.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${formatHome(topOwes.net, 'EUR')}</div>
                    </div>
                ` : ''}
            </div>
        </div>
    ` : '';

    // ── Two-column: balances + suggested payments ──
    const personRows = Object.entries(balances).map(([person, bal]) => {
        const isCredit = bal > 0.01;
        const isDebt = bal < -0.01;
        return `
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${isCredit ? 'rgba(52,199,89,0.12)' : isDebt ? 'rgba(255,59,48,0.1)' : 'rgba(0,0,0,0.04)'}; color: ${isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'rgba(0,0,0,0.5)'}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${esc(person.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${esc(person)}</div>
                <div style="font-weight:800; color: ${isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)'}; font-size:1rem;">
                    ${isCredit ? '+' : ''}${formatHome(bal, 'EUR')}
                </div>
            </div>
        `;
    }).join('') || `<p class="text-muted" style="padding: 20px; text-align:center;">No companions on this trip yet.</p>`;

    const debtsHtml = debts.length === 0
        ? `<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">All settled for this trip!</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">Every balance is square.</p></div>`
        : debts.map(d => `
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${esc(d.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${esc(d.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${formatHome(d.amount, 'EUR')}</div>
                </div>
                ${tripIsEditable ? `
                    <button class="btn-primary settle-debt-btn" data-trip-id="${esc(trip.id)}" data-from="${esc(d.from)}" data-to="${esc(d.to)}" data-amount="${d.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">Settle</button>
                ` : ''}
            </div>
        `).join('');

    return `
        ${leaderboardCard}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Trip balances</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${Object.keys(balances).length} ${Object.keys(balances).length === 1 ? 'person' : 'people'}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${personRows}
                </div>
            </div>
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Suggested payments</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${debts.length} ${debts.length === 1 ? 'payment' : 'payments'}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${debtsHtml}
                </div>
            </div>
        </div>
        ${tripIsEditable ? `
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${esc(trip.id)}" type="button"
                    style="background: white; border:1px solid rgba(0,0,0,0.08); color:#002d5b; padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    + Manual settlement
                </button>
            </div>
        ` : ''}
    `;
}

function renderHistoryTab(trip, tripIsEditable) {
    const past = (STATE.expenses || [])
        .filter(e => e.tripId === trip.id && e.isSettlement)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (past.length === 0) {
        return `
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">No past settlements yet</h2>
                <p class="text-muted" style="margin:0;">Once payments are recorded between companions, they show up here as a timeline.</p>
            </div>
        `;
    }

    return `
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Past settlements</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${past.length} recorded</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:10px;">
                ${past.map(s => {
                    const toPerson = Object.keys(s.splits || {})[0] || '?';
                    const dateStr = (() => {
                        const d = new Date(s.date);
                        return isNaN(d.getTime()) ? s.date : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                    })();
                    return `
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                            <div style="width:38px; height:38px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-size:1.2rem; flex-shrink:0;">✓</div>
                            <div style="flex:1; min-width:0;">
                                <div style="font-weight:800; color:#002d5b; font-size:0.95rem;">${esc(s.who)} <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span> ${esc(toPerson)}</div>
                                <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">${esc(dateStr)}</div>
                            </div>
                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${formatHome(s.euroValue || 0, 'EUR')}</div>
                            ${tripIsEditable ? `
                                <div style="display:flex; gap:6px; flex-shrink:0;">
                                    <button class="edit-settlement-btn" data-settlement-id="${esc(s.id)}" type="button"
                                        style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color:var(--accent-blue); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">Edit</button>
                                    <button class="unsettle-settlement-btn" data-settlement-id="${esc(s.id)}" data-trip-id="${esc(trip.id)}" type="button"
                                        style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">Unsettle</button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderGlobalTab() {
    const globalBalances = computeGlobalBalances();
    const sorted = Object.entries(globalBalances).sort((a, b) => b[1] - a[1]);
    const maxAbs = Math.max(...Object.values(globalBalances).map(Math.abs), 1);
    const hasBalances = sorted.some(([, v]) => Math.abs(v) > 0.01);

    if (sorted.length === 0) {
        return `
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">No companions yet</h2>
                <p class="text-muted" style="margin:0;">Add companions to a trip and log expenses to see cross-trip balances.</p>
            </div>
        `;
    }

    return `
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px; background: linear-gradient(135deg, rgba(0,113,227,0.04), rgba(88,86,214,0.03)); border-left: 4px solid var(--accent-blue);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">🌍 Cross-trip net balances</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">Across all trips · active + completed</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:14px;">
                ${sorted.map(([person, bal]) => {
                    const pct = hasBalances ? (Math.abs(bal) / maxAbs) * 100 : 0;
                    const isPos = bal > 0.01;
                    const isNeg = bal < -0.01;
                    const color = isPos ? '#1a6b3c' : isNeg ? '#a30000' : 'var(--text-secondary)';
                    return `
                        <div style="display:grid; grid-template-columns: 120px 1fr 110px; align-items:center; gap:16px;">
                            <div style="font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(person)}</div>
                            ${hasBalances ? `
                                <div style="height:8px; background: rgba(0,0,0,0.06); border-radius:999px; overflow:hidden; position:relative;">
                                    <div style="position:absolute; ${isPos ? 'left:50%' : 'right:50%'}; top:0; bottom:0; width:${pct/2}%; background: ${isPos ? '#34c759' : '#ff3b30'}; border-radius:999px;"></div>
                                </div>
                            ` : '<div></div>'}
                            <div style="text-align:right; font-weight:800; color:${color}; font-size:1rem;">${isPos ? '+' : ''}${formatHome(bal, 'EUR')}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// ── Mutations ─────────────────────────────────────────────────────────

/** Record a settlement payment. Idempotency: callers disable the
 *  button before invoking, but we also de-dupe server-side by trusting
 *  generateId to be unique per call. The previous double-click bug
 *  was a UI-side race; the disabled-button guard fixes it. */
function settleDebt(tripId, from, to, amount, currency, root) {
    if (from === to) {
        showLiquidAlert('Sender and receiver must be different.');
        return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        showLiquidAlert('Amount must be a positive number.');
        return;
    }
    const euroValue = convertCurrency(amount, currency, 'EUR');
    /** @type {import('../types').Expense} */
    const settlementExp = {
        id: generateId(),
        tripId: tripId,
        label: `Settlement: ${from} → ${to}`,
        value: amount,
        euroValue: euroValue,
        currency: currency,
        who: from,
        categoryId: STATE.categories[0]?.id ?? '',
        country: 'Settlement',
        date: new Date().toISOString().split('T')[0],
        splits: { [to]: 100 },
        isSettlement: true,
    };
    STATE.expenses.push(settlementExp);
    emit('state:changed');
    showLiquidAlert(`Recorded ${formatHome(euroValue, 'EUR')} ${from} → ${to}`);
    // Re-render the host page so balances + history update.
    const trip = STATE.trips.find(t => t.id === tripId);
    root.innerHTML = buildPageHtml(trip || null, canEditExpenses(trip));
}

function deleteSettlement(id, tripId, root) {
    showConfirmModal({
        title: 'Unsettle this payment?',
        message: 'The settlement record is removed and balances revert.',
        confirmText: 'Unsettle',
        onConfirm: () => {
            STATE.expenses = STATE.expenses.filter(e => e.id !== id);
            emit('state:changed');
            const trip = STATE.trips.find(t => t.id === tripId);
            root.innerHTML = buildPageHtml(trip || null, canEditExpenses(trip));
        },
    });
}

// ── Modals (manual settlement + edit) ─────────────────────────────────

function openManualSettleModal(tripId, root) {
    const trip = STATE.trips.find(t => t.id === tripId);
    const peopleSource = getTripCompanionNames(trip);
    const peopleOptions = peopleSource.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    const home = getHomeCurrency();

    const { root: modalRoot, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">Manual settlement</h2>
            <p class="text-subtitle">Record a payment that already happened off-app.</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="manualSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${peopleOptions}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="manualSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${peopleOptions}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${esc(home)})</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Record payment</button>
                </div>
            </form>
        `,
    });
    /** @type {HTMLButtonElement} */ (q(modalRoot, '#cancelManualSettleBtn')).onclick = () => close();
    /** @type {HTMLFormElement} */ (q(modalRoot, '#manualSettleForm')).onsubmit = (evt) => {
        evt.preventDefault();
        const from = /** @type {HTMLSelectElement} */ (q(modalRoot, '#manualSettleFrom')).value;
        const to = /** @type {HTMLSelectElement} */ (q(modalRoot, '#manualSettleTo')).value;
        const amount = parseFloat(/** @type {HTMLInputElement} */ (q(modalRoot, '#manualSettleAmount')).value);
        if (from === to) {
            showLiquidAlert('Sender and receiver must be different.');
            return;
        }
        settleDebt(tripId, from, to, amount, home, root);
        close();
    };
}

function openEditSettlementModal(id, root) {
    const s = STATE.expenses.find(e => e.id === id);
    if (!s) return;
    const trip = STATE.trips.find(t => t.id === s.tripId);
    const peopleSource = getTripCompanionNames(trip);
    const fromOpts = peopleSource.map(p => `<option value="${esc(p)}" ${s.who === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
    const toPerson = Object.keys(s.splits || {})[0];
    const toOpts = peopleSource.map(p => `<option value="${esc(p)}" ${toPerson === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
    const home = getHomeCurrency();

    const { root: modalRoot, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">Edit settlement</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">From</label>
                <select id="editSettleFrom" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${fromOpts}</select>
                <label class="form-label" style="margin-top:6px;">To</label>
                <select id="editSettleTo" class="glass-input" style="padding: var(--space-3); border-radius: 12px; background:white;">${toOpts}</select>
                <label class="form-label" style="margin-top:6px;">Amount (${esc(home)})</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${convertCurrency(s.euroValue || 0, 'EUR', home).toFixed(2)}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <label class="form-label" style="margin-top:6px;">Date</label>
                <input type="date" id="editSettleDate" value="${esc(s.date || '')}" class="glass-input" required style="padding: var(--space-3); border-radius: 12px;">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">Cancel</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">Update</button>
                </div>
            </form>
        `,
    });
    /** @type {HTMLButtonElement} */ (q(modalRoot, '#cancelEditSettleBtn')).onclick = () => close();
    /** @type {HTMLFormElement} */ (q(modalRoot, '#editSettlementForm')).onsubmit = (evt) => {
        evt.preventDefault();
        const from = /** @type {HTMLSelectElement} */ (q(modalRoot, '#editSettleFrom')).value;
        const to = /** @type {HTMLSelectElement} */ (q(modalRoot, '#editSettleTo')).value;
        const amount = parseFloat(/** @type {HTMLInputElement} */ (q(modalRoot, '#editSettleAmount')).value);
        const date = /** @type {HTMLInputElement} */ (q(modalRoot, '#editSettleDate')).value;
        if (from === to) {
            showLiquidAlert('Sender and receiver must be different.');
            return;
        }
        s.who = from;
        s.splits = { [to]: 100 };
        s.value = amount;
        s.currency = home;
        s.euroValue = convertCurrency(amount, home, 'EUR');
        s.date = date;
        s.label = `Settlement: ${from} → ${to}`;
        emit('state:changed');
        close();
        const trip2 = STATE.trips.find(t => t.id === s.tripId);
        root.innerHTML = buildPageHtml(trip2 || null, canEditExpenses(trip2));
    };
}
