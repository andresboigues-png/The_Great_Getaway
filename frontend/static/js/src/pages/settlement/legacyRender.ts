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
import { getTripCompanionNames } from '../../companions.js';
import { showModal } from '../../components/Modal.js';
import {
    computeTripBalances,
    simplifyDebts,
    computeGlobalBalances,
    computeLeaderboard,
} from './balances.js';
import { t, tn } from '../../i18n.js';

export type SettlementTab = 'trip' | 'history' | 'global';

// ── Markup ────────────────────────────────────────────────────────────

export function buildPageHtml(
    trip: any,
    tripIsEditable: boolean,
    activeTab: SettlementTab,
    currentTripId: string | null,
): string {
    const tripsStrip = renderTripsStrip(currentTripId);
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
    const settledTotal = activeTrip
        ? (STATE.expenses || [])
            .filter((e) => e.tripId === activeTrip.id && e.isSettlement)
            .reduce((sum, e) => sum + (e.euroValue || 0), 0)
        : 0;
    const optionsHtml = STATE.trips
        // Renamed map param from `t` to `tr` so the imported i18n `t`
        // helper isn't shadowed.
        .map((tr) => {
            const total = (STATE.expenses || [])
                .filter((e) => e.tripId === tr.id && e.isSettlement)
                .reduce((sum, e) => sum + (e.euroValue || 0), 0);
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
                style="flex:1; min-width:200px; max-width:380px; padding:10px 14px; border-radius:12px; border:1.5px solid rgba(255,159,10,0.4); background:linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,159,10,0.04)); font-size:0.92rem; font-weight:700; color:#002d5b; cursor:pointer; outline:none; font-family:inherit; transition: border-color 0.18s ease, box-shadow 0.18s ease;">
                ${optionsHtml}
            </select>
            ${activeTrip && settledTotal > 0 ? `
                <span style="display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; background:rgba(0,113,227,0.08); color:#005bb8; font-size:0.78rem; font-weight:800; flex-shrink:0;">
                    ${formatHome(settledTotal, 'EUR')} ${t('settlement.settledSuffix')}
                </span>
            ` : ''}
        </div>
    `;
}

function renderTabsNav(trip: any, activeTab: SettlementTab): string {
    const settlementsCount = (STATE.expenses || []).filter(
        (e) => e.tripId === trip.id && e.isSettlement,
    ).length;
    // D3 contrast: active tab text uses #005bb8 (darker brand blue,
    // 5.3:1) instead of var(--accent-blue) (#0071e3, 4.31:1) so the
    // active state passes WCAG AA. Border/badge can keep the brand
    // blue — they're chrome, not text.
    const tab = (key: string, label: string, badge?: number) => `
        <button class="settle-tab${activeTab === key ? ' is-active' : ''}" data-tab="${key}" type="button"
            style="background:none; border:0; padding:12px 4px; font-size:0.95rem; font-weight:${activeTab === key ? '800' : '600'}; color:${activeTab === key ? '#005bb8' : 'var(--text-secondary)'}; cursor:pointer; border-bottom:2px solid ${activeTab === key ? 'var(--accent-blue)' : 'transparent'}; margin-bottom:-1px; letter-spacing:-0.01em; transition: color 0.2s, border-color 0.2s;">
            ${label}${badge !== undefined && badge > 0 ? ` <span style="background:rgba(0,113,227,0.12); color:#005bb8; padding:1px 6px; border-radius:999px; font-size:0.7rem; font-weight:800; margin-left:2px;">${badge}</span>` : ''}
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

    const leaderboardCard =
        totalPaid > 0
            ? `
        <div class="card glass" style="margin-bottom: 18px; padding: 22px 26px; border-radius: 28px; background: linear-gradient(135deg, rgba(255,214,10,0.05), rgba(255,159,10,0.03)); border:1px solid rgba(255,159,10,0.18);">
            <div style="display:flex; flex-wrap:wrap; gap:24px; align-items:center; justify-content:space-between;">
                <div style="min-width:0;">
                    <div style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:var(--text-secondary); margin-bottom:6px;">${t('settlement.tripTotal')}</div>
                    <div style="font-size:2rem; font-weight:800; color:#002d5b; letter-spacing:-0.02em;">${formatHome(totalPaid, 'EUR')}</div>
                </div>
                ${
                    topPaid
                        ? `
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${t('settlement.topPayer')}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${esc(topPaid.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:var(--text-secondary);">${formatHome(topPaid.paid, 'EUR')}</div>
                    </div>
                `
                        : ''
                }
                ${
                    topOwed && topOwed.net > 0.01
                        ? `
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#34c759;">${t('settlement.topOwed')}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${esc(topOwed.name)}</div>
                        <div style="font-size:0.78rem; font-weight:700; color:#1a6b3c;">+${formatHome(topOwed.net, 'EUR')}</div>
                    </div>
                `
                        : ''
                }
                ${
                    topOwes && topOwes.net < -0.01
                        ? `
                    <div style="text-align:center; min-width:120px;">
                        <div style="font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; color:#ff3b30;">${t('settlement.topOwes')}</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#002d5b; margin-top:4px;">${esc(topOwes.name)}</div>
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
            })
            .join('') ||
        `<p class="text-muted" style="padding: 20px; text-align:center;">${t('settlement.emptyNoCompanions')}</p>`;

    const debtsHtml =
        debts.length === 0
            ? `<div style="text-align:center; padding: 40px 20px;"><div style="font-size:2.2rem; margin-bottom:8px;">🥂</div><p style="margin:0; font-weight:800; color:#1a6b3c;">${t('settlement.allSettledTitle')}</p><p style="margin:6px 0 0; color:var(--text-secondary); font-size:0.85rem;">${t('settlement.allSettledBody')}</p></div>`
            : debts
                  .map(
                      (d) => `
            <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${esc(d.from)}</span>
                        <span style="color:rgba(0,0,0,0.3);">→</span>
                        <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${esc(d.to)}</span>
                    </div>
                    <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${formatHome(d.amount, 'EUR')}</div>
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
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                    <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${t('settlement.tripBalancesTitle')}</h3>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${tn('settlement.peopleCount', Object.keys(balances).length)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                    ${personRows}
                </div>
            </div>
            <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div style="min-width:0;">
                        <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${t('settlement.suggestedPaymentsTitle')}</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">${t('settlement.suggestedPaymentsSubtitle')}</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${tn('settlement.paymentsCount', debts.length)}</span>
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
                    style="background: white; border:1px solid rgba(0,0,0,0.08); color:#002d5b; padding: 10px 24px; border-radius: 999px; font-weight:800; font-size:0.85rem; cursor:pointer; box-shadow: 0 4px 12px rgba(0,45,91,0.05);">
                    ${t('settlement.manualSettleOpenBtn')}
                </button>
            </div>
        `
                : ''
        }
    `;
}

function renderHistoryTab(trip: any, tripIsEditable: boolean): string {
    const past = (STATE.expenses || [])
        .filter((e) => e.tripId === trip.id && e.isSettlement)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (past.length === 0) {
        return `
            <div class="card glass" style="padding: 48px 32px; text-align:center; border-radius: 28px; border:1.5px dashed rgba(0,113,227,0.3); background: rgba(0,113,227,0.04);">
                <div style="font-size:2.5rem; margin-bottom: 8px;">📜</div>
                <h2 style="margin:0 0 6px; color:#002d5b;">${t('settlement.historyEmptyTitle')}</h2>
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
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${t('settlement.historyTitle')}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${t('settlement.historyRecorded', { count: past.length })}</span>
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
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${items
                                    .map((s) => {
                                        const toPerson = Object.keys(s.splits || {})[0] || '?';
                                        const fromInitial = (s.who || '?').charAt(0).toUpperCase();
                                        return `
                                        <div style="display:flex; align-items:center; gap:14px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                                            <div style="width:34px; height:34px; border-radius:50%; background:rgba(52,199,89,0.12); color:#1a6b3c; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">${esc(fromInitial)}</div>
                                            <div style="flex:1; min-width:0;">
                                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${esc(s.who)}</span>
                                                    <span style="color:rgba(0,0,0,0.3); font-weight:600;">→</span>
                                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${esc(toPerson)}</span>
                                                    <span style="display:inline-flex; align-items:center; gap:3px; background:rgba(52,199,89,0.12); color:#1a6b3c; padding:1px 8px; border-radius:999px; font-size:0.62rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em;">${t('settlement.historyChipSettled')}</span>
                                                </div>
                                            </div>
                                            <div style="font-size:1rem; font-weight:800; color:#1a6b3c; flex-shrink:0;">${formatHome(s.euroValue || 0, 'EUR')}</div>
                                            ${
                                                tripIsEditable
                                                    ? `
                                                <div style="display:flex; gap:6px; flex-shrink:0;">
                                                    <button class="edit-settlement-btn" data-settlement-id="${esc(s.id)}" type="button"
                                                        style="background:rgba(0,113,227,0.08); border:1px solid rgba(0,113,227,0.22); color:#005bb8; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${t('settlement.historyEditBtn')}</button>
                                                    <button class="unsettle-settlement-btn" data-settlement-id="${esc(s.id)}" data-trip-id="${esc(trip.id)}" type="button"
                                                        style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.22); color:#ff3b30; padding:5px 12px; border-radius:999px; font-size:0.72rem; font-weight:800; cursor:pointer;">${t('settlement.historyUnsettleBtn')}</button>
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
                <h2 style="margin:0 0 6px; color:#002d5b;">${t('settlement.crossTripEmptyTitle')}</h2>
                <p class="text-muted" style="margin:0;">${t('settlement.crossTripEmptyBody')}</p>
            </div>
        `;
    }

    const globalDebts = simplifyDebts(globalBalances);

    return `
        <div class="card glass" style="padding: 22px 24px; border-radius: 28px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">${t('settlement.crossTripTitle')}</h3>
                <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em;">${t('settlement.crossTripSubtitle')}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
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
                              : 'rgba(0,0,0,0.04)';
                        const avatarColor = isCredit
                            ? '#1a6b3c'
                            : isDebt
                              ? '#a30000'
                              : 'rgba(0,0,0,0.5)';
                        return `
                        <div style="display:flex; flex-direction:column; gap:10px; padding:12px 14px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:14px;">
                            <div style="display:flex; align-items:center; gap:14px;">
                                <div style="width:34px; height:34px; border-radius:50%; background: ${avatarBg}; color: ${avatarColor}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:0.95rem; flex-shrink:0;">
                                    ${esc(person.charAt(0).toUpperCase())}
                                </div>
                                <div style="flex:1; min-width:0; font-weight:800; color:#002d5b; font-size:0.95rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(person)}</div>
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
                        <h3 style="margin:0; font-size:1.05rem; color:#002d5b; font-weight:800; letter-spacing:-0.02em;">Suggested cross-trip payments</h3>
                        <div style="font-size:0.7rem; font-weight:700; color:var(--text-secondary); margin-top:3px;">Fewest payments to clear everyone across every trip you share. Record the actual settlement on whichever trip's tab fits.</div>
                    </div>
                    <span style="font-size:0.7rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.1em; flex-shrink:0;">${globalDebts.length} ${globalDebts.length === 1 ? 'payment' : 'payments'}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${globalDebts
                        .map(
                            (d) => `
                        <div style="display:flex; align-items:center; gap:14px; padding:14px 16px; background:white; border:1px solid rgba(0,0,0,0.06); border-radius:16px;">
                            <div style="flex:1; min-width:0;">
                                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                    <span style="font-weight:700; color:var(--text-secondary); font-size:0.78rem;">${esc(d.from)}</span>
                                    <span style="color:rgba(0,0,0,0.3);">→</span>
                                    <span style="font-weight:800; color:#002d5b; font-size:0.95rem;">${esc(d.to)}</span>
                                </div>
                                <div style="font-size:1.3rem; font-weight:800; color:#002d5b; letter-spacing:-0.01em; margin-top:2px;">${formatHome(d.amount, 'EUR')}</div>
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

export function settleDebt(
    tripId: string,
    from: string,
    to: string,
    amount: number,
    currency: string,
): void {
    if (from === to) {
        showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
        return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        showLiquidAlert(t('settlement.toastAmountInvalid'));
        return;
    }
    const euroValue = convertCurrency(amount, currency, 'EUR');
    const settlementExp = {
        id: generateId(),
        tripId: tripId,
        label: `Settlement: ${from} → ${to}`,
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

export function deleteSettlement(id: string): void {
    showConfirmModal({
        title: t('settlement.toastUnsettleConfirmTitle'),
        message: t('settlement.toastUnsettleConfirmMessage'),
        confirmText: t('settlement.toastUnsettleConfirmBtn'),
        onConfirm: () => {
            STATE.expenses = STATE.expenses.filter((e) => e.id !== id);
            emit(EVENTS.STATE_CHANGED);
        },
    });
}

// ── Modals ────────────────────────────────────────────────────────────

export function openManualSettleModal(tripId: string): void {
    const trip = STATE.trips.find((tr) => tr.id === tripId);
    const peopleSource = getTripCompanionNames(trip);
    const peopleOptions = peopleSource.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    const home = getHomeCurrency();

    const { root: modalRoot, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">${t('settlement.manualTitle')}</h2>
            <p class="text-subtitle">${t('settlement.manualSubtitle')}</p>
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
    (q(modalRoot, '#cancelManualSettleBtn') as HTMLButtonElement).onclick = () => close();
    (q(modalRoot, '#manualSettleForm') as HTMLFormElement).onsubmit = (evt) => {
        evt.preventDefault();
        const from = (q(modalRoot, '#manualSettleFrom') as HTMLSelectElement).value;
        const to = (q(modalRoot, '#manualSettleTo') as HTMLSelectElement).value;
        const amount = parseFloat((q(modalRoot, '#manualSettleAmount') as HTMLInputElement).value);
        if (from === to) {
            showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
            return;
        }
        settleDebt(tripId, from, to, amount, home);
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
        s.label = `Settlement: ${from} → ${to}`;
        emit(EVENTS.STATE_CHANGED);
        close();
    };
}
