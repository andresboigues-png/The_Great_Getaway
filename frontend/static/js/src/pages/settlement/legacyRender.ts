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
    findTripCompanion,
    findTripCompanionByLinkedUser,
} from '../../companions.js';
import { createSettlement, deleteSettlementOnServer } from '../../api.js';
import { showModal } from '../../components/Modal.js';
import {
    computeTripBalances,
    simplifyDebts,
    computeGlobalBalances,
    computeLeaderboard,
} from './balances.js';
import { t, tn } from '../../i18n.js';

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
    trip: any,
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

function renderTabsNav(trip: any, activeTab: SettlementTab): string {
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

function renderTripTab(trip: any, tripIsEditable: boolean): string {
    const { balances } = computeTripBalances(trip);
    const debts = simplifyDebts(balances);
    const board = computeLeaderboard(trip);
    const totalPaid = board.reduce((s, b) => s + b.paid, 0);

    const topPaid = [...board].sort((a, b) => b.paid - a.paid)[0];
    const topOwes = [...board].sort((a, b) => a.net - b.net)[0];
    const topOwed = [...board].sort((a, b) => b.net - a.net)[0];

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
                return `
            <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background: var(--card-bg); border:1px solid var(--border-subtle); border-radius:14px;">
                <div style="width:34px; height:34px; border-radius:50%; background: ${isCredit ? 'rgba(52,199,89,0.18)' : isDebt ? 'rgba(255,59,48,0.18)' : 'var(--surface-subtle)'}; color: ${isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)'}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                    ${esc(person.charAt(0).toUpperCase())}
                </div>
                <div style="flex:1; min-width:0; font-weight:800; color: var(--text-brand-navy); font-size:0.95rem; overflow:hidden; text-overflow:ellipsis;">${esc(person)}</div>
                <div style="font-weight:800; color: ${isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)'}; font-size:1rem;">
                    ${isCredit ? '+' : ''}${formatHome(bal, 'EUR')}
                </div>
            </div>
        `;
            })
            .join('') ||
        `<p class="text-muted" style="padding: 20px; text-align:center;">${t('settlement.emptyNoCompanions')}</p>`;

    const debtsHtml =
        debts.length === 0
            ? `<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${t('settlement.allSettledTitle')}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${t('settlement.allSettledBody')}</p></div>`
            : debts
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
                ${
                    tripIsEditable
                        ? `
                    <button class="btn-primary settle-debt-btn" data-trip-id="${esc(trip.id)}" data-from="${esc(d.from)}" data-to="${esc(d.to)}" data-amount="${d.amount}"
                        style="padding: 8px 18px; font-size:0.85rem; border-radius: 999px; flex-shrink:0;">${t('settlement.settleBtn')}</button>
                `
                        : ''
                }
            </div>
        `,
                  )
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
                    <span class="stl-section-label--shrink-0">${tn('settlement.paymentsCount', debts.length)}</span>
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
function collectSettlementHistory(trip: any): HistoryItem[] {
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
        const fromName = findTripCompanionByLinkedUser(trip, s.fromUserId)?.name;
        const toName = findTripCompanionByLinkedUser(trip, s.toUserId)?.name;
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


function renderHistoryTab(trip: any, tripIsEditable: boolean): string {
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
    const euroValue = convertCurrency(amount, currency, 'EUR');

    const trip = STATE.trips.find((tr) => tr.id === tripId);
    const fromUserId = findTripCompanion(trip, from)?.linkedUserId;
    const toUserId = findTripCompanion(trip, to)?.linkedUserId;

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
            STATE.settlements.push(result.settlement);
            emit(EVENTS.STATE_CHANGED);
            showLiquidAlert(`Recorded ${formatHome(euroValue, 'EUR')} ${from} → ${to} · notified ${to}`);
        } else {
            // Log + toast. We deliberately don't fall back to the
            // fake-expense pattern here — keeping the data layer
            // clean is worth the user-visible failure mode.
            // Sentry catches via §3.8's structured logging.
            console.warn('[settlement] /api/settlements failed:', result.error);
            showLiquidAlert(
                `Settlement failed: ${result.error || 'Network error'}`,
            );
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
    STATE.expenses.push(settlementExp);
    emit(EVENTS.STATE_CHANGED);
    showLiquidAlert(`Recorded ${formatHome(euroValue, 'EUR')} ${from} → ${to}`);
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
        onConfirm: async () => {
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
        },
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
                <label class="form-label stl-mt-6">${esc(t('settlement.labelAmount', { currency: home }))}</label>
                <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" placeholder="0.00" required class="stl-card-minor">
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
        const method = (q(modalRoot, '#manualSettleMethod') as HTMLSelectElement).value;
        const note = (q(modalRoot, '#manualSettleNote') as HTMLInputElement).value.trim();
        if (from === to) {
            showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
            return;
        }
        // The method + note flow into /api/settlements when both
        // parties have linkedUserIds (see settleDebt step 2). They
        // get dropped silently for the legacy companion-by-name path
        // since there's no server-side record to attach them to.
        settleDebt(tripId, from, to, amount, home, { method, note });
        close();
    };
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
        close();
    };
}
