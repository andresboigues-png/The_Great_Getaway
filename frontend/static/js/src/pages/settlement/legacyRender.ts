// pages/settlement/legacyRender.ts — HTML-string builders + modal flows
// for the Settlement page. Pulled out of pages/settlement.ts in C3 so
// Settlement.tsx (the React shell) can call them without owning the
// HTML construction.
//
// Refactor from the legacy file: the renderXxxTab + buildPageHtml
// functions take `activeTab` and `currentTripId` as parameters
// instead of reading module-level globals. Mutations (settleDebt,
// deleteSettlement) drop the `root: HTMLElement` parameter — they
// just mutate STATE + emit, and React's useStore subscriber catches
// the emit and re-renders. Modals stay as legacy showModal flows
// (transient, handle focus-trap cleanly).

import { STATE, emit } from '../../state.js';
import { EVENTS } from '../../constants.js';
import {
    generateId,
    showConfirmModal,
    q,
    formatHome,
    getHomeCurrency,
    convertCurrency,
    esc,
    showLiquidAlert,
} from '../../utils.js';
import {
    getTripCompanionNames,
    findTripCompanionByLinkedUser,
    findAcceptedMemberUserId,
} from '../../companions.js';
import { createSettlement, deleteSettlementOnServer, upsertExpense } from '../../api.js';
import { showModal } from '../../components/Modal.js';
import {
    computeTripBalances,
    computeTripBalancesByCurrency,
    simplifyDebts,
    computeGlobalBalances,
    computeLeaderboard,
} from './balances.js';
import { hasRate } from '../../utils/currency.js';
import { t, tn, formatCurrency } from '../../i18n.js';
import type { Trip } from '../../types';

// §0.4 follow-up: settlement-page shared styles, extracted
// from the inline-style template literals below. Side-effect
// import; Vite chunks alongside the settlement mount.
import './settlement.css';

export type SettlementTab = 'trip' | 'history' | 'global';


/** Total settled amount for `tripId` in EUR — counts BOTH legacy
 *  isSettlement expense rows AND server-side STATE.settlements
 *  rows. Used by the trip-picker chip + the History tab count
 *  badge so the visible numbers match the History list itself
 *  (which renders the union via collectSettlementHistory).
 *
 *  §4.5 cleanup: pre-cleanup this only counted expense rows
 *  because settlements lived as fake-isSettlement expenses. After
 *  the dual-write retirement, new settlements between user-linked
 *  parties land in STATE.settlements only, so the counter needs to
 *  read both stores or the user sees a mismatch between "3 settled"
 *  in the chip and "5 rows" in History. */
function settledStatsForTrip(tripId: string): { count: number; eurTotal: number } {
    let count = 0;
    let eurTotal = 0;
    for (const e of STATE.expenses || []) {
        if (e.tripId === tripId && e.isSettlement) {
            count += 1;
            eurTotal += e.euroValue || 0;
        }
    }
    for (const s of STATE.settlements || []) {
        if (s.tripId === tripId) {
            count += 1;
            eurTotal += s.euroValue || s.amount || 0;
        }
    }
    return { count, eurTotal };
}

// ── Markup ────────────────────────────────────────────────────────────

export function buildPageHtml(
    trip: Trip | null,
    tripIsEditable: boolean,
    activeTab: SettlementTab,
    currentTripId: string | null,
): string {
    // Trip picker is only meaningful on per-trip tabs (Trip + History) —
    // it scopes "this trip's balances" / "this trip's settled history".
    // On the Cross-Trip tab, totals are aggregated across every trip
    // the user is part of, so picking a trip in the picker would have
    // no effect on what's shown. Hiding the picker there removes the
    // confusion the user reported ("change trips in settlements but
    // the who-owes-who totals stay the same"). Cross-Trip gets its
    // own subtitle clarifying the global scope.
    const tripsStrip = activeTab === 'global' ? '' : renderTripsStrip(currentTripId);
    const header = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">${t('settlement.title')}</h1>
            <p>${t('settlement.subtitle')}</p>
        </div>
        ${tripsStrip}
    `;

    if (!trip) {
        return `
            ${header}
            <div class="card glass" style="text-align: center; padding: 60px 32px; margin-top: 24px; border-radius: 28px;">
                <div style="font-size: 4rem; margin-bottom: 12px;">⚖️</div>
                <h2 style="margin:0 0 6px;">${t('settlement.noTripsTitle')}</h2>
                <p class="text-muted">${t('settlement.noTripsBody')}</p>
            </div>
        `;
    }

    return `
        ${header}
        ${renderTabsNav(trip, activeTab)}
        ${activeTab === 'trip' ? renderTripTab(trip, tripIsEditable) : ''}
        ${activeTab === 'history' ? renderHistoryTab(trip, tripIsEditable) : ''}
        ${activeTab === 'global' ? renderGlobalTab() : ''}
    `;
}

function renderTripsStrip(currentTripId: string | null): string {
    if (STATE.trips.length === 0) return '';
    // Phase G v3 — was a horizontal-scrolling strip of trip "pills"
    // (one fat button per trip). Per-user feedback a `<select>` makes
    // more sense: it's the same pattern used elsewhere (the navbar's
    // #tripSelector + the Plan-with-AI trip picker), takes far less
    // vertical room, and on a 20-trip account it doesn't push the
    // settlement view halfway down the page. Settlements-total chip
    // for the picked trip moves to a small pill beside the select.
    const activeTrip = STATE.trips.find((tr) => tr.id === currentTripId);
    const settledTotal = activeTrip ? settledStatsForTrip(activeTrip.id).eurTotal : 0;
    const optionsHtml = STATE.trips
        // Renamed map param from `t` to `tr` so the imported i18n `t`
        // helper isn't shadowed.
        .map((tr) => {
            const total = settledStatsForTrip(tr.id).eurTotal;
            const totalLabel = total > 0 ? ` — ${formatHome(total, 'EUR')} ${t('settlement.settledSuffix')}` : '';
            return `<option value="${esc(tr.id)}"${tr.id === currentTripId ? ' selected' : ''}>${esc(tr.name)}${totalLabel}</option>`;
        })
        .join('');
    return `
        <div class="settlement-trip-picker" style="margin-top: 18px; margin-bottom: 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label for="settlementTripSelect" style="display:inline-flex; align-items:center; gap:8px; font-size:0.74rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-secondary); flex-shrink:0;">
                <span style="font-size:0.95rem;">⚖️</span>
                ${t('settlement.tripPickerLabel')}
            </label>
            <select id="settlementTripSelect" class="settlement-trip-select"
                aria-label="${t('settlement.tripPickerAriaLabel')}"
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color: var(--text-brand-navy); cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${optionsHtml}
            </select>
            ${activeTrip && settledTotal > 0 ? `
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color: var(--accent-blue-deep); font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${formatHome(settledTotal, 'EUR')} ${t('settlement.settledSuffix')}
                </span>
            ` : ''}
        </div>
    `;
}

function renderTabsNav(trip: Trip, activeTab: SettlementTab): string {
    const settlementsCount = settledStatsForTrip(trip.id).count;
    // D3 contrast: active tab text uses #005bb8 (darker brand blue,
    // 5.3:1) instead of var(--accent-blue) (#0071e3, 4.31:1) so the
    // active state passes WCAG AA. Border/badge can keep the brand
    // blue — they're chrome, not text.
    const tab = (key: string, label: string, badge?: number) => `
        <button class="settle-tab${activeTab === key ? ' is-active' : ''}" data-tab="${key}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${activeTab === key ? '800' : '600'}; color:${activeTab === key ? 'var(--accent-blue-deep)' : 'var(--text-secondary)'}; cursor:pointer; border-bottom:2px solid ${activeTab === key ? 'var(--accent-blue)' : 'transparent'}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${label}${badge !== undefined && badge > 0 ? ` <span style="background:rgba(0,113,227,0.12); color: var(--accent-blue-deep); padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${badge}</span>` : ''}
        </button>
    `;
    return `
        <nav style="display:flex; gap:36px; border-bottom: 1px solid rgba(0,113,227,0.25); margin: 22px 0 22px; padding: 0 4px;">
            ${tab('trip', t('settlement.tabThisTrip'))}
            ${tab('history', t('settlement.tabHistory'), settlementsCount)}
            ${tab('global', t('settlement.tabCrossTrip'))}
        </nav>
    `;
}

/** UX (canonical settlement currency): the trip's primary spend
 *  currency — the original currency the most euros were logged in
 *  (settlement rows excluded). Settlements are kept in each viewer's
 *  HOME currency as the big number, but a shared "≈ original currency"
 *  hint underneath gives a EUR-home and a USD-home co-traveler a common
 *  reference (the number they can both quote when paying up). Returns
 *  null when the trip has no recorded spend. */
function tripPrimarySpendCurrency(tripId: string): string | null {
    const byCurrency: Record<string, number> = {};
    for (const e of STATE.expenses || []) {
        if (e.tripId !== tripId || (e as { isSettlement?: boolean }).isSettlement) continue;
        const cur = ((e.currency || 'EUR') as string).toUpperCase();
        // MM-3: `??` so a frozen euroValue of 0 reads €0 (not raw `value`).
        byCurrency[cur] = (byCurrency[cur] || 0) + (e.euroValue ?? e.value ?? 0);
    }
    let best: string | null = null;
    let bestVal = -1;
    for (const [cur, val] of Object.entries(byCurrency)) {
        if (val > bestVal) { bestVal = val; best = cur; }
    }
    return best;
}

/** A small "≈ {symbol}{amount}" hint in the trip's primary spend
 *  currency, rendered under a home-currency big number. Empty when there
 *  is no primary currency or it already equals the viewer's home
 *  currency (the hint would just repeat the big number). */
function originalCurrencyHint(eurAmount: number, primaryCurrency: string | null): string {
    // Case-insensitive home comparison (primaryCurrency is already
    // upper-cased upstream) so the hint can't misfire on a stray-case
    // home currency.
    if (!primaryCurrency || primaryCurrency === getHomeCurrency().toUpperCase()) return '';
    const inPrimary = convertCurrency(Math.abs(eurAmount), 'EUR', primaryCurrency);
    // formatCurrency is locale-aware (separators + per-currency decimals,
    // e.g. JPY has none) — was a raw `symbol + toFixed(2)` which rendered
    // en-US ("$1234.56") on a French page where the big number is "1 234,56 €".
    return `<span style="display:block; font-size:0.72rem; font-weight:600; color:var(--text-secondary); margin-top:1px;">≈ ${esc(formatCurrency(inPrimary, primaryCurrency))}</span>`;
}

function renderTripTab(trip: Trip, tripIsEditable: boolean): string {
    const { balances, removedFromRoster } = computeTripBalances(trip);
    const removedSet = new Set(removedFromRoster || []);
    // MK3-8: per-currency debts for the suggested-payments list. The standing
    // summary below stays in the viewer's home currency; the actual payments
    // to make are shown in the trip's real currencies (a no-rate currency like
    // ARS stays in ARS — the home "≈" hint is gated on hasRate).
    const { byCurrency } = computeTripBalancesByCurrency(trip);
    const curDebts: { from: string; to: string; amount: number; currency: string }[] = [];
    for (const [cur, bal] of Object.entries(byCurrency)) {
        for (const d of simplifyDebts(bal)) {
            curDebts.push({ from: d.from, to: d.to, amount: d.amount, currency: cur });
        }
    }
    curDebts.sort((a, b) =>
        a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.currency.localeCompare(b.currency),
    );
    // Shared "original currency" hint reference for this trip's amounts.
    const primaryCurrency = tripPrimarySpendCurrency(trip.id);
    const board = computeLeaderboard(trip);
    const totalPaid = board.reduce((s, b) => s + b.paid, 0);

    const topPaid = [...board].sort((a, b) => b.paid - a.paid)[0];
    // Integration audit D1: derive "most to receive" / "owes most" from the
    // settlement-ADJUSTED balances (the same map the list below + Insights
    // use), NOT computeLeaderboard.net (= paid − share, which ignores recorded
    // settlements). Pre-fix the header read ±485 while the balances list right
    // beneath it read ±440 on a trip with a €45 settlement — same people,
    // adjacent, contradicting each other.
    const _balArr = Object.entries(balances).map(
        ([name, net]) => ({ name, net: net as number }),
    );
    const topOwes = [..._balArr].sort((a, b) => a.net - b.net)[0];
    const topOwed = [..._balArr].sort((a, b) => b.net - a.net)[0];

    // Build a trip-name banner so the user sees AT A GLANCE which
    // trip's data is on screen. Pre-fix this card just said "TRIP
    // TOTAL" with no reference to which trip — when the user picked
    // a different trip and the math happened to produce the same
    // numbers (same companions, same expense pattern across two
    // trips), it looked like the picker had done nothing. Now the
    // trip name sits above the total so the page is unambiguous.
    const tripNameLabel = esc(trip?.name || 'Trip');
    const leaderboardCard =
        totalPaid > 0
            ? `
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${t('settlement.tripTotal')} · ${tripNameLabel}</div>
                    <div style="font-size:2rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.02em;">${formatHome(totalPaid, 'EUR')}</div>
                </div>
                ${
                    topPaid
                        ? `
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${t('settlement.topPayer')}</div>
                        <div class="stl-heading-2">${esc(topPaid.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${formatHome(topPaid.paid, 'EUR')}</div>
                    </div>
                `
                        : ''
                }
                ${
                    topOwed && topOwed.net > 0.01
                        ? `
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${t('settlement.topOwed')}</div>
                        <div class="stl-heading-2">${esc(topOwed.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${formatHome(topOwed.net, 'EUR')}</div>
                    </div>
                `
                        : ''
                }
                ${
                    topOwes && topOwes.net < -0.01
                        ? `
                    <div class="stl-center-min-120">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${t('settlement.topOwes')}</div>
                        <div class="stl-heading-2">${esc(topOwes.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#a30000;">${formatHome(topOwes.net, 'EUR')}</div>
                    </div>
                `
                        : ''
                }
            </div>
        </div>
    `
            : '';

    const personRows =
        Object.entries(balances)
            .map(([person, bal]) => {
                const isCredit = bal > 0.01;
                const isDebt = bal < -0.01;
                // Audit fix (2026-05-26): show a "(removed)" tag when
                // this name is in the balance roster only because of
                // historical expenses — the companion has since been
                // removed from the trip. Pre-fix these rows were
                // silently dropped from the balance entirely; now they
                // surface so the user can see why the math is what it is.
                const isRemoved = removedSet.has(person);
                const removedTag = isRemoved
                    ? `<span style="margin-left:6px; padding:1px 6px; border-radius:6px; background:rgba(0,0,0,0.06); color:var(--text-secondary); font-size:0.7rem; font-weight:700; text-transform:uppercase;">removed</span>`
                    : '';
                return `
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${isCredit ? 'rgba(52,199,89,0.18)' : isDebt ? 'rgba(255,59,48,0.18)' : 'var(--surface-subtle)'}; color: ${isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)'}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${esc(person.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${esc(person)}${removedTag}</div>
                <div style="font-weight:800; color: ${isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)'}; font-size:1rem; text-align:right;">
                    ${isCredit ? '+' : ''}${formatHome(bal, 'EUR')}${originalCurrencyHint(bal, primaryCurrency)}
                </div>
            </div>
        `;
            })
            .join('') ||
        `<p class="text-muted" style="padding: 20px; text-align:center;">${t('settlement.emptyNoCompanions')}</p>`;

    const debtsHtml =
        curDebts.length === 0
            ? `<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${t('settlement.allSettledTitle')}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${t('settlement.allSettledBody')}</p></div>`
            : curDebts
                  .map((d) => {
                      // Home-currency "≈" hint, gated on hasRate so a no-rate
                      // currency (ARS) shows just its own amount, not a 1:1 fake.
                      const homeHint = hasRate(d.currency)
                          ? ` <span style="font-weight:600; color:var(--text-secondary); font-size:0.8rem;">≈ ${esc(formatHome(convertCurrency(d.amount, d.currency, 'EUR'), 'EUR'))}</span>`
                          : '';
                      return `
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                <div class="stl-flex-grow-truncate">
                    <div class="stl-flex-row-wrap-6">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${esc(d.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span class="stl-heading-3">${esc(d.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${esc(formatCurrency(d.amount, d.currency))}${homeHint}</div>
                </div>
                ${
                    tripIsEditable
                        ? `
                    <button class="btn-primary settle-debt-btn" data-trip-id="${esc(trip.id)}" data-from="${esc(d.from)}" data-to="${esc(d.to)}" data-amount="${d.amount}" data-currency="${esc(d.currency)}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${t('settlement.settleBtn')}</button>
                `
                        : ''
                }
            </div>
        `;
                  })
                  .join('');

    return `
        ${leaderboardCard}
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:18px; margin-bottom:24px;">
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 class="stl-heading-1">${t('settlement.tripBalancesTitle')} · ${tripNameLabel}</h3>
                    <span class="stl-section-label">${tn('settlement.peopleCount', Object.keys(balances).length)}</span>
                </div>
                <div class="stl-flex-col-8">
                    ${personRows}
                </div>
            </div>
            <div class="card glass stl-card-major">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">${t('settlement.suggestedPaymentsTitle')} · ${tripNameLabel}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${t('settlement.suggestedPaymentsSubtitle')}</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${tn('settlement.paymentsCount', curDebts.length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${debtsHtml}
                </div>
            </div>
        </div>
        ${
            tripIsEditable
                ? `
            <div style="text-align:center; margin-bottom: 24px;">
                <button class="btn-ghost open-manual-settle-btn" data-trip-id="${esc(trip.id)}" type="button"
                    style="background: var(--card-bg); border:1px solid var(--border-subtle); color: var(--text-brand-navy); padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${t('settlement.manualSettleOpenBtn')}
                </button>
            </div>
        `
                : ''
        }
    `;
}

/** Unified history-row shape. Renders identical to the legacy
 *  isSettlement expense in the History tab, but `source` tells the
 *  click handlers which store to mutate on edit/undo:
 *    'expense'    → STATE.expenses (legacy fake-isSettlement row)
 *    'settlement' → STATE.settlements (post-§4.5 server row;
 *                   undo goes through DELETE /api/settlements/<id>) */
interface HistoryItem {
    id: string;
    source: 'expense' | 'settlement';
    who: string;
    to: string;
    euroValue: number;
    date: string;
    /** Only set for 'settlement' source — surfaced as a chip next
     *  to the amount. */
    method?: string | null;
    note?: string | null;
}


/** Merge legacy isSettlement expense rows + server-side settlement
 *  rows into a single sorted (newest-first) list. The renderer in
 *  renderHistoryTab walks this unified shape. */
function collectSettlementHistory(trip: Trip): HistoryItem[] {
    const items: HistoryItem[] = [];

    // Source A — legacy isSettlement expense rows. These remain in
    // STATE.expenses indefinitely (old data + new fallback for
    // name-only companion pairs that can't go to the settlements
    // table).
    for (const e of STATE.expenses || []) {
        if (!(e.tripId === trip.id && e.isSettlement)) continue;
        const toPerson = Object.keys(e.splits || {})[0] || '?';
        items.push({
            id: e.id,
            source: 'expense',
            who: e.who || '?',
            to: toPerson,
            euroValue: e.euroValue || 0,
            date: e.date || '',
        });
    }

    // Source B — server-side settlements (post-§4.5). Map user_ids
    // back to companion names so the renderer can show them
    // alongside the legacy rows. Skip rows where either party
    // doesn't resolve (e.g. owner-as-party, which the modal can't
    // produce yet — those settlements would only exist if created
    // via direct API call, which the UI can't trigger).
    for (const s of STATE.settlements || []) {
        if (s.tripId !== trip.id) continue;
        // BUG-4/B3 (MK2 audit): prefer the settlement's name snapshot (the
        // server backfills fromName/toName on every row) so a member with an
        // UNLINKED companion still resolves. Pre-fix the linked-only lookup
        // returned undefined and `continue` DROPPED the row — so the History
        // list showed "no past settlements" while the badge + chip counted it.
        const fromName = (s as { fromName?: string }).fromName
            || findTripCompanionByLinkedUser(trip, s.fromUserId)?.name;
        const toName = (s as { toName?: string }).toName
            || findTripCompanionByLinkedUser(trip, s.toUserId)?.name;
        if (!fromName || !toName) continue;
        items.push({
            id: s.id,
            source: 'settlement',
            who: fromName,
            to: toName,
            euroValue: s.euroValue || s.amount || 0,
            // s.createdAt is a full ISO timestamp; we group by
            // YYYY-MM-DD so the renderer's date logic works on
            // both shapes.
            date: (s.createdAt || '').slice(0, 10),
            method: s.method ?? null,
            note: s.note ?? null,
        });
    }

    items.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return items;
}


function renderHistoryTab(trip: Trip, tripIsEditable: boolean): string {
    const past = collectSettlementHistory(trip);

    if (past.length === 0) {
        return `
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${t('settlement.historyEmptyTitle')}</h2>
                <p class="text-muted" style="margin:0;">${t('settlement.historyEmptyBody')}</p>
            </div>
        `;
    }

    const groupedByDate: Record<string, typeof past> = {};
    for (const s of past) {
        const key = s.date || 'undated';
        if (!groupedByDate[key]) groupedByDate[key] = [];
        groupedByDate[key].push(s);
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const formatGroupHeader = (key: string) => {
        if (key === 'undated') return t('settlement.historyDateNoDate');
        if (key === todayStr) return t('settlement.historyDateToday');
        if (key === yesterdayStr) return t('settlement.historyDateYesterday');
        const d = new Date(key);
        if (isNaN(d.getTime())) return key;
        return d.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };
    const sortedKeys = Object.keys(groupedByDate).sort((a, b) => {
        if (a === 'undated') return 1;
        if (b === 'undated') return -1;
        return b.localeCompare(a);
    });

    return `
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 class="stl-heading-1">${t('settlement.historyTitle')}</h3>
                <span class="stl-section-label">${t('settlement.historyRecorded', { count: past.length })}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:18px;">
                ${sortedKeys
                    .map((key) => {
                        // sortedKeys come from Object.keys(groupedByDate) so
                        // every key has a non-empty array.
                        const items = groupedByDate[key]!;
                        const totalForDay = items.reduce((s, x) => s + (x.euroValue || 0), 0);
                        return `
                        <div>
                            <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:8px; padding: 0 4px;">
                                <h4 style="margin:0; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary);">${esc(formatGroupHeader(key))}</h4>
                                <span style="font-size:0.72rem; font-weight:700; color:var(--text-secondary);">${tn('settlement.historyDayTotalPlural', items.length, { amount: formatHome(totalForDay, 'EUR') })}</span>
                            </div>
                            <div class="stl-flex-col-8">
                                ${items
                                    .map((s) => {
                                        const fromInitial = (s.who || '?').charAt(0).toUpperCase();
                                        // Method chip: only for server settlements (source='settlement').
                                        // Legacy expense rows don't carry method/note.
                                        const methodChip = (s.method && s.source === 'settlement')
                                            ? `<span style="display:inline-flex; align-items:center; gap:3px; background:rgba(0,113,227,0.08); color:var(--accent-blue-deep); padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.05em;">${esc(s.method.replace(/_/g, ' '))}</span>`
                                            : '';
                                        // Note row: optional, only when present.
                                        const noteRow = (s.note && s.source === 'settlement')
                                            ? `<div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; font-style:italic;">"${esc(s.note)}"</div>`
                                            : '';
                                        // Edit affordance — server settlements aren't editable in
                                        // the UI today; only legacy isSettlement expense rows are.
                                        // (Server-side edit would need a PATCH endpoint we haven't
                                        // shipped. Undo via DELETE works for both.)
                                        const editBtn = (tripIsEditable && s.source === 'expense')
                                            ? `<button class="edit-settlement-btn" data-settlement-id="${esc(s.id)}" type="button"
                                                style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color: var(--accent-blue-deep); padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${t('settlement.historyEditBtn')}</button>`
                                            : '';
                                        // Undo affordance — both sources support it. The
                                        // data-source attribute lets deleteSettlement route to
                                        // the right store (expense vs settlement).
                                        const undoBtn = tripIsEditable
                                            ? `<button class="unsettle-settlement-btn" data-settlement-id="${esc(s.id)}" data-source="${esc(s.source)}" data-trip-id="${esc(trip.id)}" type="button"
                                                style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${t('settlement.historyUnsettleBtn')}</button>`
                                            : '';
                                        return `
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${esc(fromInitial)}</div>
                                            <div class="stl-flex-grow-truncate">
                                                <div class="stl-flex-row-wrap-6">
                                                    <span class="stl-heading-3">${esc(s.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span class="stl-heading-3">${esc(s.to)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${t('settlement.historyChipSettled')}</span>
                                                    ${methodChip}
                                                </div>
                                                ${noteRow}
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${formatHome(s.euroValue || 0, 'EUR')}</div>
                                            ${
                                                tripIsEditable && (editBtn || undoBtn)
                                                    ? `<div style="display:flex; gap:6px; flex-shrink:0;">${editBtn}${undoBtn}</div>`
                                                    : ''
                                            }
                                        </div>
                                    `;
                                    })
                                    .join('')}
                            </div>
                        </div>
                    `;
                    })
                    .join('')}
            </div>
        </div>
    `;
}

function renderGlobalTab(): string {
    const globalBalances = computeGlobalBalances();
    const sorted = Object.entries(globalBalances).sort((a, b) => b[1] - a[1]);
    const maxAbs = Math.max(...Object.values(globalBalances).map(Math.abs), 1);
    const hasBalances = sorted.some(([, v]) => Math.abs(v) > 0.01);

    if (sorted.length === 0) {
        return `
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">🌍</div>
                <h2 style="margin:0 0 6px; color: var(--text-brand-navy);">${t('settlement.crossTripEmptyTitle')}</h2>
                <p class="text-muted" style="margin:0;">${t('settlement.crossTripEmptyBody')}</p>
            </div>
        `;
    }

    const globalDebts = simplifyDebts(globalBalances);

    return `
        <div class="card glass stl-card-major">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 class="stl-heading-1">${t('settlement.crossTripTitle')}</h3>
                <span class="stl-section-label">${t('settlement.crossTripSubtitle')}</span>
            </div>
            <div class="stl-flex-col-8">
                ${sorted
                    .map(([person, bal]) => {
                        const pct = hasBalances ? Math.min((Math.abs(bal) / maxAbs) * 100, 100) : 0;
                        const isCredit = bal > 0.01;
                        const isDebt = bal < -0.01;
                        const color = isCredit
                            ? '#1a6b3c'
                            : isDebt
                              ? '#a30000'
                              : 'var(--text-secondary)';
                        const avatarBg = isCredit
                            ? 'rgba(52,199,89,0.12)'
                            : isDebt
                              ? 'rgba(255,59,48,0.1)'
                              : 'var(--surface-subtle)';
                        const avatarColor = isCredit
                            ? '#1a6b3c'
                            : isDebt
                              ? '#a30000'
                              : 'var(--text-secondary)';
                        return `
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${avatarBg}; color: ${avatarColor}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${esc(person.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(person)}</div>
                                <div style="font-weight:800; color: ${color}; font-size:1rem;">
                                    ${isCredit ? '+' : ''}${formatHome(bal, 'EUR')}
                                </div>
                            </div>
                            ${
                                hasBalances
                                    ? `
                                <div style="height:6px; background: rgba(0,0,0,0.05); border-radius:999px; overflow:hidden; position:relative;">
                                    ${isCredit ? `<div style="position:absolute; left:50%; top:0; bottom:0; width:${pct / 2}%; background:#34c759; border-radius:999px;"></div>` : ''}
                                    ${isDebt ? `<div style="position:absolute; right:50%; top:0; bottom:0; width:${pct / 2}%; background:#ff3b30; border-radius:999px;"></div>` : ''}
                                    <div style="position:absolute; left:50%; top:-2px; bottom:-2px; width:1px; background: rgba(0,0,0,0.12);"></div>
                                </div>
                            `
                                    : ''
                            }
                        </div>
                    `;
                    })
                    .join('')}
            </div>
        </div>
        ${
            globalDebts.length > 0
                ? `
            <div class="card glass" style="margin-top:18px; padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 class="stl-heading-1">Suggested cross-trip payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>
                    </div>
                    <span class="stl-section-label--shrink-0">${globalDebts.length} ${globalDebts.length === 1 ? 'payment' : 'payments'}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${globalDebts
                        .map(
                            (d) => `
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:16px;">
                            <div class="stl-flex-grow-truncate">
                                <div class="stl-flex-row-wrap-6">
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${esc(d.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span class="stl-heading-3">${esc(d.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color: var(--text-brand-navy); letter-spacing:-0.01em; margin-top:2px;">${formatHome(d.amount, 'EUR')}</div>
                            </div>
                        </div>
                    `,
                        )
                        .join('')}
                </div>
            </div>
        `
                : ''
        }
    `;
}

// ── Mutations (no `root` parameter — emit triggers React re-render) ───

/** Record a settlement between two trip members.
 *
 *  §4.5 — single-write architecture (post-cleanup of the dual-write
 *  transition pattern). Routes by whether the two parties have user
 *  accounts:
 *
 *    A. Both parties have `companion.linkedUserId`:
 *       - POST /api/settlements with the user_ids + amount + method
 *         + note + currency.
 *       - On success: splice the server's `Settlement` row into
 *         STATE.settlements and emit STATE_CHANGED. The balance math
 *         in balances.ts reads STATE.settlements via
 *         applySettlementToBalances, producing the right shift.
 *       - On failure: keep silent (no fake-expense fallback for
 *         this path — the user can retry; this avoids polluting
 *         the data layer with "did it or didn't it" rows).
 *       - Notifications + the `settled_up` feed event fire on the
 *         server side automatically.
 *
 *    B. At least one party is a name-only companion (no
 *       linkedUserId):
 *       - Cannot POST to /api/settlements (the table is user_id
 *         keyed). Push a legacy "Settlement: X → Y" expense row
 *         with `isSettlement: true` into STATE.expenses. The
 *         expense-based balance math handles it as before.
 *       - No notification, no feed event for this path — there's
 *         no user account to notify.
 *
 *  Pre-cleanup history: the previous version of this function did
 *  both — pushed a fake-expense AND posted to the API. That avoided
 *  the impedance mismatch in balances.ts during the §4.5 frontend
 *  wiring rollout. balances.ts now reads STATE.settlements directly
 *  via applySettlementToBalances, so the fake-expense is no longer
 *  load-bearing for the linked-user path. */
/** Integration audit A2: in-flight settle keys, to drop a concurrent
 *  double-fire of the same settlement (tripId|from|to|amount) before the
 *  optimistic repaint removes the button. Cleared in settleDebt's finally. */
const _settleInFlight = new Set<string>();

export async function settleDebt(
    tripId: string,
    from: string,
    to: string,
    amount: number,
    currency: string,
    options?: { method?: string; note?: string },
): Promise<void> {
    if (from === to) {
        showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
        return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        showLiquidAlert(t('settlement.toastAmountInvalid'));
        return;
    }
    // R3-Round 2 fix: explicit offline check. The settle flow POSTs
    // to /api/settlements (PATH A below) — without this gate the
    // submit blocks for ~30s on a metro / plane connection until the
    // fetch errors out, leaving the modal open with no feedback. The
    // api.ts offline toast only fires after two consecutive /api/sync
    // failures, not for one-shot writes. navigator.onLine is the
    // browser's best-effort signal — false positives possible (it
    // returns true when on a captive wifi with no DNS) but false
    // negatives are very rare, so an "offline" reading is reliable.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        showLiquidAlert(t('errors.offline'));
        return;
    }
    const euroValue = convertCurrency(amount, currency, 'EUR');

    const trip = STATE.trips.find((tr) => tr.id === tripId);
    // Integration audit INT-2: resolve each party to an ACCEPTED-member
    // user id. Prefer the companion's explicit `linkedUserId`, then fall
    // back to the trip's accepted-members roster (Trip.members) by name.
    // Pre-fix this read ONLY `findTripCompanion(...).linkedUserId`, so an
    // accepted member whose companion row was never linked (the common
    // "invite, then separately-named companion" flow) was wrongly routed
    // to the legacy fake-expense path EVEN THOUGH the server would have
    // accepted a real settlement (it gates on `_is_accepted_member` —
    // settlements.py:226). findAcceptedMemberUserId realigns the PATH A/B
    // decision with what the API actually accepts.
    const fromUserId = findAcceptedMemberUserId(trip, from);
    const toUserId = findAcceptedMemberUserId(trip, to);

    // Integration audit A2 (idempotency): the one-click Settle button used
    // to give NO on-screen feedback — a mutating `.push` (below) left the
    // balances' array-ref identity unchanged, so Settlement.tsx's useMemo
    // never recomputed and the page kept showing the pre-settle debts.
    // Users re-clicked and DUPLICATED the settlement, inverting the ledger
    // ("Sara owes Alex €X" became "Alex owes Sara €X"). The repaint is
    // fixed below via immutable replace; this guard additionally blocks a
    // concurrent double-fire during the async PATH A round-trip.
    const inFlightKey = `${tripId}::${from}::${to}::${amount}`;
    if (_settleInFlight.has(inFlightKey)) return;
    _settleInFlight.add(inFlightKey);
    try {
        if (fromUserId && toUserId) {
            // PATH A — server-side settlement. Await the POST so we can
            // splice the server's row (with its real id + createdAt) into
            // STATE.settlements before emitting. The brief in-flight wait
            // (~200-500ms) is acceptable; the next /api/data poll would
            // hydrate the same row anyway, but we don't want to block on
            // it for the UI update.
            const result = await createSettlement({
                tripId,
                fromUserId,
                toUserId,
                amount,
                currency,
                euroValue,
                ...(options?.method ? { method: options.method } : {}),
                ...(options?.note ? { note: options.note } : {}),
            });
            if (result.settlement) {
                // INT-3: immutable replace (not `.push`) so the new array
                // identity bumps Settlement.tsx's useStore(settlements) dep
                // and the balances repaint immediately.
                STATE.settlements = [...STATE.settlements, result.settlement];
                emit(EVENTS.STATE_CHANGED);
                showLiquidAlert(t('settlement.toastRecordedNotified', {
                    amount: formatHome(euroValue, 'EUR'),
                    from,
                    to,
                }));
            } else {
                // Log + toast. We deliberately don't fall back to the
                // fake-expense pattern here — keeping the data layer
                // clean is worth the user-visible failure mode.
                // Sentry catches via §3.8's structured logging.
                console.warn('[settlement] /api/settlements failed:', result.error);
                showLiquidAlert(t('settlement.toastSettlementFailed', {
                    error: result.error || t('settlement.toastSettlementFailedNetwork'),
                }));
                // 2026-05-25 (audit S3): emit STATE_CHANGED so the Settle
                // button re-renders out of its disabled "Recording…" state.
                // Without this, the button stayed permanently disabled on
                // failure since no state mutation triggered a repaint —
                // user had to navigate away to re-arm the row.
                emit(EVENTS.STATE_CHANGED);
            }
            return;
        }

        // PATH B — legacy fake-expense for name-only companions. The
        // settlements table can't store these rows (it's user_id keyed),
        // so we keep the expense-driven balance shift as the only path.
        const settlementExp = {
            id: generateId(),
            tripId: tripId,
            label: t('settlement.settlementLabel', { from, to }),
            value: amount,
            euroValue: euroValue,
            currency: currency,
            who: from,
            categoryId: STATE.categories[0]?.id ?? '',
            country: t('settlement.expenseCountry'),
            date: new Date().toISOString().split('T')[0] ?? '',
            splits: { [to]: 100 },
            isSettlement: true,
        };
        // INT-3: immutable replace (not `.push`) so the new array identity
        // bumps Settlement.tsx's useMemo `expenses` dep and the balances
        // repaint immediately — pre-fix the push left the page showing the
        // pre-settle debts, so users re-clicked and duplicated the row.
        STATE.expenses = [...STATE.expenses, settlementExp];
        emit(EVENTS.STATE_CHANGED);
        // R10-B1 P0-2: POST the new fake-expense row to /api/expenses
        // immediately. Pre-fix the legacy name-only path only pushed
        // into STATE.expenses; the ship-to-server depended on the
        // next /api/sync poll firing AND succeeding. A tab close in
        // that window lost the settlement. Same outbox-safe pattern
        // as the edit path above.
        void upsertExpense(settlementExp);
        showLiquidAlert(t('settlement.toastRecorded', {
            amount: formatHome(euroValue, 'EUR'),
            from,
            to,
        }));
    } finally {
        _settleInFlight.delete(inFlightKey);
    }
}

/** Undo a recorded settlement. Routes by source:
 *
 *    - 'expense'    (legacy isSettlement fake-row) — filter
 *                   STATE.expenses synchronously. The next /api/sync
 *                   pushes the removal to the server.
 *
 *    - 'settlement' (post-§4.5 server row) — DELETE
 *                   /api/settlements/<id>. The server enforces the
 *                   "creator OR trip owner" rule (recipient gets
 *                   403 — see settlements.py:delete_settlement).
 *                   On success we splice the row out of
 *                   STATE.settlements locally so the UI updates
 *                   immediately; on failure we log + toast and
 *                   leave local state intact.
 *
 *  Falls back to 'expense' when source isn't supplied (back-compat
 *  with any earlier callsite that didn't pass it). */
export async function deleteSettlement(
    id: string,
    source: 'expense' | 'settlement' = 'expense',
): Promise<void> {
    showConfirmModal({
        title: t('settlement.toastUnsettleConfirmTitle'),
        message: t('settlement.toastUnsettleConfirmMessage'),
        confirmText: t('settlement.toastUnsettleConfirmBtn'),
        onConfirm: () => { void (async () => {
            if (source === 'settlement') {
                const result = await deleteSettlementOnServer(id);
                if (result.error) {
                    console.warn('[settlement] delete failed:', result.error);
                    showLiquidAlert(
                        `Couldn't undo: ${result.error || 'Network error'}`,
                    );
                    return;
                }
                STATE.settlements = STATE.settlements.filter((s) => s.id !== id);
                emit(EVENTS.STATE_CHANGED);
                return;
            }
            // Legacy expense path — local mutation; the next /api/sync
            // round-trip persists the removal server-side.
            STATE.expenses = STATE.expenses.filter((e) => e.id !== id);
            emit(EVENTS.STATE_CHANGED);
        })(); },
    });
}

// ── Modals ────────────────────────────────────────────────────────────

/** Method quick-picks for the manual settle modal. The `value` is the
 *  enum sent to /api/settlements (mirrors server-side _ALLOWED_METHODS
 *  in routes/settlements.py — any value here gets accepted unchanged;
 *  'custom' is the catch-all for free-form notes). The `labelKey`
 *  resolves at render time so the dropdown reflects the active locale.
 *  Roadmap §4.5 calls out this list. */
const SETTLE_METHODS = [
    { value: 'cash',          labelKey: 'settlement.methodCash' as const },
    { value: 'revolut',       labelKey: 'settlement.methodRevolut' as const },
    { value: 'bank_transfer', labelKey: 'settlement.methodBankTransfer' as const },
    { value: 'wise',          labelKey: 'settlement.methodWise' as const },
    { value: 'paypal',        labelKey: 'settlement.methodPayPal' as const },
    { value: 'custom',        labelKey: 'settlement.methodCustom' as const },
];

export function openManualSettleModal(tripId: string): void {
    const trip = STATE.trips.find((tr) => tr.id === tripId);
    const peopleSource = getTripCompanionNames(trip);
    const peopleOptions = peopleSource.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    const methodOptions = SETTLE_METHODS
        .map(m => `<option value="${esc(m.value)}">${esc(t(m.labelKey))}</option>`)
        .join('');
    const home = getHomeCurrency();
    // MK3-8: per-currency manual settle. Offer the trip's actual spend
    // currencies (default = the primary one), falling back to home when the
    // trip has no expenses yet. The debt is settled in the chosen currency
    // and the overpay check compares like-for-like.
    const _manualByCur = computeTripBalancesByCurrency(trip).byCurrency;
    const _manualCurs = Object.keys(_manualByCur);
    const _manualDefaultCur = (tripPrimarySpendCurrency(trip?.id ?? '') || home).toUpperCase();
    const _manualCurList = _manualCurs.length > 0 ? _manualCurs : [home.toUpperCase()];
    const currencyOptions = _manualCurList
        .map((c) => `<option value="${esc(c)}" ${c === _manualDefaultCur ? 'selected' : ''}>${esc(c)}</option>`)
        .join('');

    const { root: modalRoot, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">${t('settlement.manualTitle')}</h2>
            <p class="text-subtitle">${t('settlement.manualSubtitle')}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${esc(t('settlement.labelFrom'))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${peopleOptions}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelTo'))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${peopleOptions}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelAmount', { currency: _manualDefaultCur }))}</label>
                <div style="display:flex; gap:8px;">
                    <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input stl-card-minor" placeholder="0.00" required style="flex:2;">
                    <select id="manualSettleCurrency" class="glass-input stl-card-minor-bg" style="flex:1;" aria-label="${esc(t('settlement.labelAmount', { currency: '' }))}">${currencyOptions}</select>
                </div>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelMethod'))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${methodOptions}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelNote'))} <span class="text-subtitle" style="font-weight:500;">${esc(t('settlement.labelNoteOptional'))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${esc(t('settlement.notePlaceholder'))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${esc(t('settlement.cancelBtn'))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${esc(t('settlement.recordPaymentBtn'))}</button>
                </div>
            </form>
        `,
    });
    (q(modalRoot, '#cancelManualSettleBtn') as HTMLButtonElement).onclick = () => close();
    (q(modalRoot, '#manualSettleForm') as HTMLFormElement).onsubmit = (evt) => {
        evt.preventDefault();
        const from = (q(modalRoot, '#manualSettleFrom') as HTMLSelectElement).value;
        const to = (q(modalRoot, '#manualSettleTo') as HTMLSelectElement).value;
        const amount = parseFloat((q(modalRoot, '#manualSettleAmount') as HTMLInputElement).value);
        const cur = ((q(modalRoot, '#manualSettleCurrency') as HTMLSelectElement)?.value || home).toUpperCase();
        const method = (q(modalRoot, '#manualSettleMethod') as HTMLSelectElement).value;
        const note = (q(modalRoot, '#manualSettleNote') as HTMLInputElement).value.trim();
        if (from === to) {
            showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
            return;
        }
        // 2026-05-26 (audit S5): warn when the entered amount exceeds
        // the actual outstanding debt from `from` → `to`. Without this
        // check, typing €60 when only €30 is owed silently flipped the
        // balance — Bob now owes Alice €30 — and the user thought
        // they'd settled the debt cleanly. Now we compute the
        // pairwise outstanding via simplifyDebts() on the current trip
        // balance map and pop a confirm if amount > owed (any positive
        // owed; the value-of-zero case is "settling a fictional debt"
        // which is also worth confirming). Confirms always settle as
        // requested — this is a UX nudge, not a hard gate.
        // MK3-8: overpay check is per-currency (owed in `cur`, no conversion).
        const owed = _pairwiseOwed(trip, from, to, cur);
        const proceed = () => {
            // The method + note flow into /api/settlements when both
            // parties have linkedUserIds (see settleDebt step 2). They
            // get dropped silently for the legacy companion-by-name path
            // since there's no server-side record to attach them to.
            void settleDebt(tripId, from, to, amount, cur, { method, note });
            close();
        };
        if (amount > owed + 0.005) {
            showConfirmModal({
                title: t('settlement.overpayConfirmTitle'),
                message: owed > 0.005
                    ? t('settlement.overpayConfirmBody', {
                        amount: formatCurrency(amount, cur),
                        owed: formatCurrency(owed, cur),
                        from,
                        to,
                    })
                    : t('settlement.overpayConfirmBodyNone', {
                        amount: formatCurrency(amount, cur),
                        from,
                        to,
                    }),
                confirmText: t('settlement.overpayConfirmBtn'),
                onConfirm: proceed,
            });
            return;
        }
        proceed();
    };
}


/** Compute how much `from` net-owes `to` on a trip, in the user's
 *  home currency. Drives the overpayment warning on the manual-settle
 *  modal (audit S5). Walks the simplified-debt graph since pairwise
 *  netting can hide behind a chain (Alice owes Bob via Charlie etc.);
 *  if the direct from→to edge exists, that's the answer, otherwise 0
 *  (no direct debt; the user is paying into a chain we can't simplify
 *  without re-running netting from scratch). */
function _pairwiseOwed(trip: Trip | undefined, from: string, to: string, currency: string): number {
    if (!trip) return 0;
    // MK3-8: per-currency. Net debts within the requested currency only and
    // return the direct from→to edge in that currency (no conversion), so the
    // overpay nudge compares like-for-like with the entered amount.
    const { byCurrency } = computeTripBalancesByCurrency(trip);
    const bal = byCurrency[(currency || 'EUR').toUpperCase()];
    if (!bal) return 0;
    const edge = simplifyDebts(bal).find((d) => d.from === from && d.to === to);
    return edge ? edge.amount : 0;
}

export function openEditSettlementModal(id: string): void {
    const s = STATE.expenses.find((e) => e.id === id);
    if (!s) return;
    const trip = STATE.trips.find((tr) => tr.id === s.tripId);
    const peopleSource = getTripCompanionNames(trip);
    const fromOpts = peopleSource
        .map((p) => `<option value="${esc(p)}" ${s.who === p ? 'selected' : ''}>${esc(p)}</option>`)
        .join('');
    const toPerson = Object.keys(s.splits || {})[0];
    const toOpts = peopleSource
        .map((p) => `<option value="${esc(p)}" ${toPerson === p ? 'selected' : ''}>${esc(p)}</option>`)
        .join('');
    const home = getHomeCurrency();

    const { root: modalRoot, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">${t('settlement.editTitle')}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${esc(t('settlement.labelFrom'))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${fromOpts}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelTo'))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${toOpts}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelAmount', { currency: home }))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${convertCurrency(s.euroValue || 0, 'EUR', home).toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${esc(t('settlement.labelDate'))}</label>
                <input type="date" id="editSettleDate" value="${esc(s.date || '')}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${esc(t('settlement.cancelBtn'))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${esc(t('settlement.updateBtn'))}</button>
                </div>
            </form>
        `,
    });
    (q(modalRoot, '#cancelEditSettleBtn') as HTMLButtonElement).onclick = () => close();
    (q(modalRoot, '#editSettlementForm') as HTMLFormElement).onsubmit = (evt) => {
        evt.preventDefault();
        const from = (q(modalRoot, '#editSettleFrom') as HTMLSelectElement).value;
        const to = (q(modalRoot, '#editSettleTo') as HTMLSelectElement).value;
        const amount = parseFloat((q(modalRoot, '#editSettleAmount') as HTMLInputElement).value);
        const date = (q(modalRoot, '#editSettleDate') as HTMLInputElement).value;
        if (from === to) {
            showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
            return;
        }
        s.who = from;
        s.splits = { [to]: 100 };
        s.value = amount;
        s.currency = home;
        s.euroValue = convertCurrency(amount, home, 'EUR');
        s.date = date;
        s.label = t('settlement.settlementLabel', { from, to });
        emit(EVENTS.STATE_CHANGED);
        // R10-B1 P0-1: POST the edit to /api/expenses (these legacy
        // settlement rows live as is_settlement=1 expenses, so the
        // existing upsert path handles them — splits + is_settlement
        // persist server-side per R3-Fix #18). Pre-fix the mutation
        // landed ONLY in STATE and waited for the next /api/sync poll
        // to ship; a tab close before that poll lost the edit
        // entirely. upsertExpense is fire-and-forget — the offline
        // outbox (R7-F1) catches network failures.
        void upsertExpense(s);
        close();
    };
}
