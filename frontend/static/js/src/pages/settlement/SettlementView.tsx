// pages/settlement/SettlementView.tsx — the presentational layer for the
// Settlement page, migrated from the HTML-string builders that used to
// live in legacyRender.ts (buildPageHtml + renderTripsStrip / renderTabsNav
// / renderTripTab / renderHistoryTab / renderGlobalTab).
//
// This is pure + declarative: it takes the picked trip + active tab + the
// in-flight settle keys, and calls back up (onPickTrip / onSetTab / onSettle
// / onManualSettle / onEditSettlement / onUnsettle) for every interaction.
// The shell (Settlement.tsx) owns the state and wires those callbacks to the
// async actions in ./actions.ts.
//
// Styling follows the established settlement.css convention: the patterns
// that repeat across the page are `stl-*` classes; one-shot styles stay
// inline (now as JSX style objects). React escapes text + attributes, so
// the legacy `esc(...)` calls are gone. Visual output is intended to match
// the legacy markup verbatim.

import { STATE } from '../../state.js';
import { t, tn, formatCurrency } from '../../i18n.js';
import { formatHome, getHomeCurrency, convertCurrency } from '../../utils.js';
import { hasRate } from '../../utils/currency.js';
import { iconSvg } from '../../icons.js';
import {
    computeTripBalances,
    computeTripBalancesByCurrency,
    simplifyDebts,
    computeGlobalBalances,
    computeLeaderboard,
} from './balances.js';
import {
    settledStatsForTrip,
    tripPrimarySpendCurrency,
    collectSettlementHistory,
    settleDebtKey,
    type SettlementTab,
    type SettleDebtArgs,
} from './viewData.js';
import type { Trip } from '../../types';
import './settlement.css';

export interface SettlementViewProps {
    trip: Trip | null;
    tripIsEditable: boolean;
    activeTab: SettlementTab;
    currentTripId: string | null;
    /** Keys (settleDebtKey) of suggested debts currently mid-settle. */
    settlingKeys: ReadonlySet<string>;
    onPickTrip: (tripId: string) => void;
    onSetTab: (tab: SettlementTab) => void;
    onSettle: (debt: SettleDebtArgs) => void;
    onManualSettle: (tripId: string) => void;
    onEditSettlement: (settlementId: string) => void;
    onUnsettle: (settlementId: string, source: 'expense' | 'settlement') => void;
}

// ── Small shared bits ───────────────────────────────────────────────────

/** A small "≈ {symbol}{amount}" hint in the trip's primary spend
 *  currency, rendered under a home-currency big number. Renders nothing
 *  when there is no primary currency, it already equals the viewer's
 *  home currency (the hint would just repeat the big number), or there's
 *  no nominal balance to show in that currency.
 *
 *  MK4 SETL-4: `primaryAmount` is the person's NOMINAL balance already
 *  expressed in `primaryCurrency` (from computeTripBalancesByCurrency) —
 *  NOT the EUR net re-converted at today's FX. Pre-fix the hint did
 *  `convertCurrency(eurNet, 'EUR', primary)` at the live rate, so the
 *  "≈ original" figure drifted daily and could disagree with the
 *  per-currency suggested-payment rows (which are nominal). Deriving it
 *  from the frozen per-currency balance makes the big EUR number and the
 *  "≈" two views of the SAME frozen amount. */
function OriginalCurrencyHint({ primaryAmount, primaryCurrency }: { primaryAmount: number | undefined; primaryCurrency: string | null }) {
    if (!primaryCurrency || primaryCurrency === getHomeCurrency().toUpperCase()) return null;
    if (primaryAmount === undefined || Math.abs(primaryAmount) < 0.005) return null;
    return (
        <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '1px' }}>
            ≈ {formatCurrency(Math.abs(primaryAmount), primaryCurrency)}
        </span>
    );
}

// ── Header + trip picker ────────────────────────────────────────────────

function PageHeader() {
    return (
        <div className="ai-page-header">
            <h1 className="gradient-text" style={{ ['--g-from' as string]: '#34c759', ['--g-to' as string]: '#00a86b' }}>
                {t('settlement.title')}
            </h1>
            <p>{t('settlement.subtitle')}</p>
        </div>
    );
}

function TripsStrip({ currentTripId, onPickTrip }: { currentTripId: string | null; onPickTrip: (id: string) => void }) {
    if (STATE.trips.length === 0) return null;
    const activeTrip = STATE.trips.find((tr) => tr.id === currentTripId);
    const settledTotal = activeTrip ? settledStatsForTrip(activeTrip.id).eurTotal : 0;
    return (
        <div
            className="settlement-trip-picker"
            style={{ marginTop: '18px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
        >
            <label
                htmlFor="settlementTripSelect"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)', flexShrink: 0 }}
            >
                <span style={{ fontSize: '0.95rem' }}>⚖️</span>
                {' '}{t('settlement.tripPickerLabel')}
            </label>
            <select
                id="settlementTripSelect"
                className="settlement-trip-select"
                aria-label={t('settlement.tripPickerAriaLabel')}
                value={currentTripId ?? ''}
                onChange={(e) => { if (e.target.value) onPickTrip(e.target.value); }}
                style={{ flex: 1, minWidth: '200px', maxWidth: '380px', padding: '10px 14px', borderRadius: '12px', border: '1.5px solid rgba(52,199,89,0.4)', background: 'linear-gradient(135deg, rgba(52,199,89,0.08), rgba(52,199,89,0.04))', fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-brand-navy)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.18s ease, box-shadow 0.18s ease' }}
            >
                {STATE.trips.map((tr) => {
                    const total = settledStatsForTrip(tr.id).eurTotal;
                    const totalLabel = total > 0 ? ` — ${formatHome(total, 'EUR')} ${t('settlement.settledSuffix')}` : '';
                    return <option key={tr.id} value={tr.id}>{tr.name + totalLabel}</option>;
                })}
            </select>
            {activeTrip && settledTotal > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: '999px', background: 'rgba(52,199,89,0.08)', color: '#0a7d3f', fontSize: '0.78rem', fontWeight: 800, flexShrink: 0 }}>
                    {formatHome(settledTotal, 'EUR')} {t('settlement.settledSuffix')}
                </span>
            ) : null}
        </div>
    );
}

// ── Tabs nav ────────────────────────────────────────────────────────────

function TabsNav({ trip, activeTab, onSetTab }: { trip: Trip; activeTab: SettlementTab; onSetTab: (tab: SettlementTab) => void }) {
    const settlementsCount = settledStatsForTrip(trip.id).count;
    // D3 contrast: active tab text uses #0a7d3f (darker
    // brand blue, 5.3:1) so the active state passes WCAG AA.
    const tabBtn = (key: SettlementTab, label: string, badge?: number) => (
        <button
            key={key}
            className={`settle-tab${activeTab === key ? ' is-active' : ''}`}
            type="button"
            onClick={() => onSetTab(key)}
            style={{ background: 'none', border: 0, padding: '12px 4px', fontSize: '0.95rem', fontWeight: activeTab === key ? 800 : 600, color: activeTab === key ? '#0a7d3f' : 'var(--text-secondary)', cursor: 'pointer', borderBottom: `2px solid ${activeTab === key ? '#34c759' : 'transparent'}`, marginBottom: '-1px', letterSpacing: '-0.01em', transition: 'color 0.2s, border-color 0.2s' }}
        >
            {label}
            {badge !== undefined && badge > 0 ? (
                <>
                    {' '}
                    <span style={{ background: 'rgba(52,199,89,0.12)', color: '#0a7d3f', padding: '1px 6px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 800, marginLeft: '2px' }}>{badge}</span>
                </>
            ) : null}
        </button>
    );
    return (
        <nav style={{ display: 'flex', gap: '36px', borderBottom: '1px solid rgba(52,199,89,0.25)', margin: '22px 0 22px', padding: '0 4px' }}>
            {tabBtn('trip', t('settlement.tabThisTrip'))}
            {tabBtn('history', t('settlement.tabHistory'), settlementsCount)}
            {tabBtn('global', t('settlement.tabCrossTrip'))}
        </nav>
    );
}

// ── Trip tab ────────────────────────────────────────────────────────────

function TripTab({ trip, tripIsEditable, settlingKeys, onSettle, onManualSettle }: {
    trip: Trip;
    tripIsEditable: boolean;
    settlingKeys: ReadonlySet<string>;
    onSettle: (debt: SettleDebtArgs) => void;
    onManualSettle: (tripId: string) => void;
}) {
    const { balances, removedFromRoster } = computeTripBalances(trip);
    const removedSet = new Set(removedFromRoster || []);
    // MK3-8: per-currency debts for the suggested-payments list.
    const { byCurrency } = computeTripBalancesByCurrency(trip);
    const curDebts: SettleDebtArgs[] = [];
    for (const [cur, bal] of Object.entries(byCurrency)) {
        for (const d of simplifyDebts(bal)) {
            curDebts.push({ tripId: trip.id, from: d.from, to: d.to, amount: d.amount, currency: cur });
        }
    }
    curDebts.sort((a, b) =>
        a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.currency.localeCompare(b.currency),
    );
    const primaryCurrency = tripPrimarySpendCurrency(trip.id);
    const board = computeLeaderboard(trip);
    const totalPaid = board.reduce((s, b) => s + b.paid, 0);

    const topPaid = [...board].sort((a, b) => b.paid - a.paid)[0];
    // Integration audit D1: derive "most to receive" / "owes most" from the
    // settlement-ADJUSTED balances (same map the list below uses), NOT
    // computeLeaderboard.net (= paid − share, which ignores settlements).
    const _balArr = Object.entries(balances).map(([name, net]) => ({ name, net }));
    const topOwes = [..._balArr].sort((a, b) => a.net - b.net)[0];
    const topOwed = [..._balArr].sort((a, b) => b.net - a.net)[0];

    const tripNameLabel = trip?.name || 'Trip';
    const personEntries = Object.entries(balances);

    return (
        <>
            {totalPaid > 0 ? (
                <div className="card glass" style={{ marginBottom: '18px', padding: '22px 26px', borderRadius: '28px', background: 'linear-gradient(135deg, rgba(52,199,89,0.05), rgba(52,199,89,0.03))', border: '1px solid rgba(52,199,89,0.18)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                {t('settlement.tripTotal')} · {tripNameLabel}
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-brand-navy)', letterSpacing: '-0.02em' }}>{formatHome(totalPaid, 'EUR')}</div>
                        </div>
                        {topPaid ? (
                            <div className="stl-center-min-120">
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#34c759' }}>{t('settlement.topPayer')}</div>
                                <div className="stl-heading-2">{topPaid.name}</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{formatHome(topPaid.paid, 'EUR')}</div>
                            </div>
                        ) : null}
                        {topOwed && topOwed.net > 0.01 ? (
                            <div className="stl-center-min-120">
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#34c759' }}>{t('settlement.topOwed')}</div>
                                <div className="stl-heading-2">{topOwed.name}</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1a6b3c' }}>+{formatHome(topOwed.net, 'EUR')}</div>
                            </div>
                        ) : null}
                        {topOwes && topOwes.net < -0.01 ? (
                            <div className="stl-center-min-120">
                                <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#ff3b30' }}>{t('settlement.topOwes')}</div>
                                <div className="stl-heading-2">{topOwes.name}</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a30000' }}>{formatHome(topOwes.net, 'EUR')}</div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '24px' }}>
                <div className="card glass stl-card-major">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <h3 className="stl-heading-1">{t('settlement.tripBalancesTitle')} · {tripNameLabel}</h3>
                        <span className="stl-section-label">{tn('settlement.peopleCount', Object.keys(balances).length)}</span>
                    </div>
                    <div className="stl-flex-col-8">
                        {personEntries.length === 0 ? (
                            <p className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>{t('settlement.emptyNoCompanions')}</p>
                        ) : (
                            personEntries.map(([person, bal]) => {
                                const isCredit = bal > 0.01;
                                const isDebt = bal < -0.01;
                                const isRemoved = removedSet.has(person);
                                return (
                                    <div key={person} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: '14px' }}>
                                        <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: isCredit ? 'rgba(52,199,89,0.18)' : isDebt ? 'rgba(255,59,48,0.18)' : 'var(--surface-subtle)', color: isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.95rem', flexShrink: 0 }}>
                                            {person.charAt(0).toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0, fontWeight: 800, color: 'var(--text-brand-navy)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {person}
                                            {isRemoved ? (
                                                <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '6px', background: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>removed</span>
                                            ) : null}
                                        </div>
                                        <div style={{ fontWeight: 800, color: isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)', fontSize: '1rem', textAlign: 'right' }}>
                                            {isCredit ? '+' : ''}{formatHome(bal, 'EUR')}
                                            <OriginalCurrencyHint primaryAmount={primaryCurrency ? byCurrency[primaryCurrency]?.[person] : undefined} primaryCurrency={primaryCurrency} />
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
                <div className="card glass stl-card-major">
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                        <div style={{ minWidth: 0 }}>
                            <h3 className="stl-heading-1">{t('settlement.suggestedPaymentsTitle')} · {tripNameLabel}</h3>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '3px' }}>{t('settlement.suggestedPaymentsSubtitle')}</div>
                        </div>
                        <span className="stl-section-label--shrink-0">{tn('settlement.paymentsCount', curDebts.length)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {curDebts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                                <div style={{ fontSize: '2.2rem', marginBottom: '8px' }}>🥂</div>
                                <p style={{ margin: 0, fontWeight: 800, color: '#1a6b3c' }}>{t('settlement.allSettledTitle')}</p>
                                <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('settlement.allSettledBody')}</p>
                            </div>
                        ) : (
                            curDebts.map((d) => {
                                const settling = settlingKeys.has(settleDebtKey(d));
                                return (
                                    <div key={`${d.from}|${d.to}|${d.currency}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: '16px' }}>
                                        <div className="stl-flex-grow-truncate">
                                            <div className="stl-flex-row-wrap-6">
                                                <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{d.from}</span>
                                                <span style={{ color: 'rgba(0,0,0,0.3)' }}>→</span>
                                                <span className="stl-heading-3">{d.to}</span>
                                            </div>
                                            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-brand-navy)', letterSpacing: '-0.01em', marginTop: '2px' }}>
                                                {formatCurrency(d.amount, d.currency)}
                                                {hasRate(d.currency) ? (
                                                    <>
                                                        {' '}
                                                        <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>≈ {formatHome(convertCurrency(d.amount, d.currency, 'EUR'), 'EUR')}</span>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                        {tripIsEditable ? (
                                            <button
                                                className="btn-primary settle-debt-btn"
                                                type="button"
                                                disabled={settling}
                                                onClick={() => onSettle(d)}
                                                style={{ padding: '8px 18px', fontSize: '0.85rem', borderRadius: '999px', flexShrink: 0 }}
                                            >
                                                {settling ? t('settlement.recordingBtn') : t('settlement.settleBtn')}
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
            {tripIsEditable ? (
                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <button
                        className="btn-ghost open-manual-settle-btn"
                        type="button"
                        onClick={() => onManualSettle(trip.id)}
                        style={{ background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-brand-navy)', padding: '10px 24px', borderRadius: '999px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,45,91,0.05)' }}
                    >
                        {t('settlement.manualSettleOpenBtn')}
                    </button>
                </div>
            ) : null}
        </>
    );
}

// ── History tab ─────────────────────────────────────────────────────────

function HistoryTab({ trip, tripIsEditable, onEditSettlement, onUnsettle }: {
    trip: Trip;
    tripIsEditable: boolean;
    onEditSettlement: (settlementId: string) => void;
    onUnsettle: (settlementId: string, source: 'expense' | 'settlement') => void;
}) {
    const past = collectSettlementHistory(trip);

    if (past.length === 0) {
        return (
            <div className="card glass" style={{ padding: '48px 32px', textAlign: 'center', borderRadius: '28px', border: '1.5px dashed rgba(52,199,89,0.3)', background: 'rgba(52,199,89,0.04)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📜</div>
                <h2 style={{ margin: '0 0 6px', color: 'var(--text-brand-navy)' }}>{t('settlement.historyEmptyTitle')}</h2>
                <p className="text-muted" style={{ margin: 0 }}>{t('settlement.historyEmptyBody')}</p>
            </div>
        );
    }

    const groupedByDate: Record<string, typeof past> = {};
    for (const s of past) {
        const key = s.date || 'undated';
        if (!groupedByDate[key]) groupedByDate[key] = [];
        groupedByDate[key]!.push(s);
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
        return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };
    const sortedKeys = Object.keys(groupedByDate).sort((a, b) => {
        if (a === 'undated') return 1;
        if (b === 'undated') return -1;
        return b.localeCompare(a);
    });

    return (
        <div className="card glass stl-card-major">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 className="stl-heading-1">{t('settlement.historyTitle')}</h3>
                <span className="stl-section-label">{t('settlement.historyRecorded', { count: past.length })}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {sortedKeys.map((key) => {
                    const items = groupedByDate[key]!;
                    const totalForDay = items.reduce((s, x) => s + (x.euroValue || 0), 0);
                    return (
                        <div key={key}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px', padding: '0 4px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)' }}>{formatGroupHeader(key)}</h4>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{tn('settlement.historyDayTotalPlural', items.length, { amount: formatHome(totalForDay, 'EUR') })}</span>
                            </div>
                            <div className="stl-flex-col-8">
                                {items.map((s) => {
                                    const fromInitial = (s.who || '?').charAt(0).toUpperCase();
                                    const showMethod = s.method && s.source === 'settlement';
                                    const showNote = s.note && s.source === 'settlement';
                                    // MK4 SETL-3: Edit is now offered for BOTH sources. Legacy
                                    // expense rows edit in place; server rows route through a
                                    // guided undo + re-record (openEditSettlementModal branches
                                    // on the id's store). Pre-fix server rows had Undo-only.
                                    const showEdit = tripIsEditable;
                                    return (
                                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: '14px' }}>
                                            <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'rgba(52,199,89,0.12)', color: '#1a6b3c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.95rem', flexShrink: 0 }}>{fromInitial}</div>
                                            <div className="stl-flex-grow-truncate">
                                                <div className="stl-flex-row-wrap-6">
                                                    <span className="stl-heading-3">{s.who}</span>
                                                    <span style={{ color: 'rgba(0,0,0,0.3)', fontWeight: 600 }}>→</span>
                                                    <span className="stl-heading-3">{s.to}</span>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(52,199,89,0.12)', color: '#1a6b3c', padding: '1px 8px', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('settlement.historyChipSettled')}</span>
                                                    {showMethod ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(52,199,89,0.08)', color: '#0a7d3f', padding: '1px 8px', borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.method!.replace(/_/g, ' ')}</span>
                                                    ) : null}
                                                </div>
                                                {showNote ? (
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>&quot;{s.note}&quot;</div>
                                                ) : null}
                                            </div>
                                            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1a6b3c', flexShrink: 0 }}>{formatHome(s.euroValue || 0, 'EUR')}</div>
                                            {/* Undo + Edit both offered when editable. SETL-3: server
                                                settlements edit via a guided undo + re-record (no PATCH
                                                endpoint); legacy expense rows edit in place. */}
                                            {tripIsEditable ? (
                                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                    {showEdit ? (
                                                        <button className="edit-settlement-btn" type="button" onClick={() => onEditSettlement(s.id)} style={{ background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.22)', color: '#0a7d3f', padding: '5px 12px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}>{t('settlement.historyEditBtn')}</button>
                                                    ) : null}
                                                    <button className="unsettle-settlement-btn" type="button" onClick={() => onUnsettle(s.id, s.source)} style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.22)', color: '#ff3b30', padding: '5px 12px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer' }}>{t('settlement.historyUnsettleBtn')}</button>
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Global (cross-trip) tab ─────────────────────────────────────────────

function GlobalTab() {
    const globalBalances = computeGlobalBalances();
    const sorted = Object.entries(globalBalances).sort((a, b) => b[1] - a[1]);
    const maxAbs = Math.max(...Object.values(globalBalances).map(Math.abs), 1);
    const hasBalances = sorted.some(([, v]) => Math.abs(v) > 0.01);

    if (sorted.length === 0) {
        return (
            <div className="card glass" style={{ padding: '48px 32px', textAlign: 'center', borderRadius: '28px', border: '1.5px dashed rgba(52,199,89,0.3)', background: 'rgba(52,199,89,0.04)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>🌍</div>
                <h2 style={{ margin: '0 0 6px', color: 'var(--text-brand-navy)' }}>{t('settlement.crossTripEmptyTitle')}</h2>
                <p className="text-muted" style={{ margin: 0 }}>{t('settlement.crossTripEmptyBody')}</p>
            </div>
        );
    }

    const globalDebts = simplifyDebts(globalBalances);

    return (
        <>
            <div className="card glass stl-card-major">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 className="stl-heading-1">{t('settlement.crossTripTitle')}</h3>
                    <span className="stl-section-label">{t('settlement.crossTripSubtitle')}</span>
                </div>
                <div className="stl-flex-col-8">
                    {sorted.map(([person, bal]) => {
                        const pct = hasBalances ? Math.min((Math.abs(bal) / maxAbs) * 100, 100) : 0;
                        const isCredit = bal > 0.01;
                        const isDebt = bal < -0.01;
                        const color = isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)';
                        const avatarBg = isCredit ? 'rgba(52,199,89,0.12)' : isDebt ? 'rgba(255,59,48,0.1)' : 'var(--surface-subtle)';
                        const avatarColor = isCredit ? '#1a6b3c' : isDebt ? '#a30000' : 'var(--text-secondary)';
                        return (
                            <div key={person} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 14px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: avatarBg, color: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.95rem', flexShrink: 0 }}>
                                        {person.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, fontWeight: 800, color: 'var(--text-brand-navy)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person}</div>
                                    <div style={{ fontWeight: 800, color, fontSize: '1rem' }}>{isCredit ? '+' : ''}{formatHome(bal, 'EUR')}</div>
                                </div>
                                {hasBalances ? (
                                    <div style={{ height: '6px', background: 'rgba(0,0,0,0.05)', borderRadius: '999px', overflow: 'hidden', position: 'relative' }}>
                                        {isCredit ? <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: `${pct / 2}%`, background: '#34c759', borderRadius: '999px' }} /> : null}
                                        {isDebt ? <div style={{ position: 'absolute', right: '50%', top: 0, bottom: 0, width: `${pct / 2}%`, background: '#ff3b30', borderRadius: '999px' }} /> : null}
                                        <div style={{ position: 'absolute', left: '50%', top: '-2px', bottom: '-2px', width: '1px', background: 'rgba(0,0,0,0.12)' }} />
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
            {globalDebts.length > 0 ? (
                <div className="card glass" style={{ marginTop: '18px', padding: '22px 24px', borderRadius: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                        <div style={{ minWidth: 0 }}>
                            <h3 className="stl-heading-1">{t('settlement.crossTripPayTitle')}</h3>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '3px' }}>{t('settlement.crossTripPaySubtitle')}</div>
                        </div>
                        <span className="stl-section-label--shrink-0">{tn('settlement.crossTripPaymentsCount', globalDebts.length)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {globalDebts.map((d) => (
                            <div key={`${d.from}|${d.to}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: 'var(--card-bg)', border: '1px solid var(--border-subtle)', borderRadius: '16px' }}>
                                <div className="stl-flex-grow-truncate">
                                    <div className="stl-flex-row-wrap-6">
                                        <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{d.from}</span>
                                        <span style={{ color: 'rgba(0,0,0,0.3)' }}>→</span>
                                        <span className="stl-heading-3">{d.to}</span>
                                    </div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-brand-navy)', letterSpacing: '-0.01em', marginTop: '2px' }}>{formatHome(d.amount, 'EUR')}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </>
    );
}

// ── Page composition (was buildPageHtml) ────────────────────────────────

export function SettlementView(props: SettlementViewProps) {
    const { trip, tripIsEditable, activeTab, currentTripId } = props;
    // Trip picker is only meaningful on per-trip tabs (Trip + History) — on
    // Cross-Trip the totals are global, so picking a trip there does nothing
    // visible. Hidden on the global tab; Cross-Trip carries its own subtitle.
    const showPicker = activeTab !== 'global';

    return (
        <div>
            <PageHeader />
            {showPicker ? <TripsStrip currentTripId={currentTripId} onPickTrip={props.onPickTrip} /> : null}
            {!trip ? (
                <div className="card glass" style={{ textAlign: 'center', padding: '60px 32px', marginTop: '24px', borderRadius: '28px' }}>
                    {/* FE-D-2: monochrome line icon (handshake = "settled up")
                        in place of the raw ⚖️ emoji, matching the app's
                        other empty-state heroes (e.g. Collections). */}
                    <span
                        className="inline-flex"
                        style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}
                        dangerouslySetInnerHTML={{ __html: iconSvg('handshake', { size: 56 }) }}
                    />
                    <h2 style={{ margin: '0 0 6px' }}>{t('settlement.noTripsTitle')}</h2>
                    <p className="text-muted">{t('settlement.noTripsBody')}</p>
                </div>
            ) : (
                <>
                    <TabsNav trip={trip} activeTab={activeTab} onSetTab={props.onSetTab} />
                    {activeTab === 'trip' ? (
                        <TripTab trip={trip} tripIsEditable={tripIsEditable} settlingKeys={props.settlingKeys} onSettle={props.onSettle} onManualSettle={props.onManualSettle} />
                    ) : null}
                    {activeTab === 'history' ? (
                        <HistoryTab trip={trip} tripIsEditable={tripIsEditable} onEditSettlement={props.onEditSettlement} onUnsettle={props.onUnsettle} />
                    ) : null}
                    {activeTab === 'global' ? <GlobalTab /> : null}
                </>
            )}
        </div>
    );
}
