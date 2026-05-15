// pages/insights/Insights.tsx — first React leaf migration (Phase C2).
//
// Mirrors the legacy `renderInsights()` (pages/insights.ts) one-for-one:
// same data shape, same DOM structure, same Chart.js integration. The
// strangler pattern keeps the URL contract (`/insights` route) and the
// inner markup unchanged so the existing pages.spec.js page-render
// smoke + visual baselines still apply.
//
// Once this version is stable for one full session, the legacy file
// will be deleted (per ROADMAP C2's "Done when" gate).
//
// Subscriptions: useStore selects the slices we read; mutations to
// STATE.insightCurrency / STATE.rateMode go through the legacy
// setRateMode / setInsightCurrency mutation (mutate STATE + emit
// 'state:changed'). React's useStore subscriber catches the emit and
// re-renders. No need to call navigate('insights') after the mutation
// the way the imperative version did.

import { useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../react/store.js';
import { useNavigate } from '../../react/useNavigate.js';
import { STATE, emit } from '../../state.js';
import { CONVERSION_RATES, EVENTS } from '../../constants.js';
import { fetchHistoricalRates } from '../../api.js';
import { getHomeCurrency, currencySymbol } from '../../utils.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import type { Expense, Category } from '../../types';
import { t } from '../../i18n.js';

// Chart is loaded via CDN in index.html and declared as a global in types.d.ts
declare const Chart: any;

interface ConvertedExpense {
    id: string;
    tripId: string;
    who: string;
    categoryId: string;
    label: string;
    date: string;
    currency: string;
    value: number;
    euroValue?: number;
    isSettlement?: boolean;
    displayValue: number;
}

export function Insights() {
    const navigate = useNavigate();
    const activeTripId = useStore((s) => s.activeTripId);
    const expenses = useStore((s) => s.expenses);
    const categories = useStore((s) => s.categories);
    const insightCurrency = useStore((s) => s.insightCurrency);
    const rateMode = useStore((s) => s.rateMode);
    const rateCache = useStore((s) => s.rateCache);

    // ── Empty: no active trip ─────────────────────────────────────────────
    if (!activeTripId) {
        return (
            <div>
                <h1
                    style={{
                        display: 'inline-block',
                        background: 'var(--gradient-title)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}
                >
                    {t('insights.title')}
                </h1>
                <div className="card glass">
                    <p>{t('insights.emptyNoTripBody')}</p>
                </div>
            </div>
        );
    }

    // ── Compute trip slice + derived stats (memoized so chart effects
    //    don't thrash on unrelated re-renders) ────────────────────────────
    const tripExps = useMemo(
        () => expenses.filter((e: Expense) => e.tripId === activeTripId && !e.isSettlement),
        [expenses, activeTripId],
    );

    // Background fetch for historical rates — fire-and-forget. The
    // Promise resolves into rateCache; the next render picks up the
    // updated cache via useStore.
    useEffect(() => {
        const uniqueDates = [
            ...new Set(tripExps.map((e: Expense) => e.date).filter((d) => !!d)),
        ] as string[];
        if (uniqueDates.length > 0) fetchHistoricalRates(uniqueDates).then(() => {});
    }, [tripExps]);

    const targetCurr = insightCurrency || getHomeCurrency();
    const targetSym = currencySymbol(targetCurr);
    const mode = rateMode || 'at_trip';

    const {
        totalDisplay,
        totalCount,
        highestExpense,
        sortedSpenders,
        sortedCats,
        catTotals,
        dateTotals,
    } = useMemo(() => {
        const convertedExps: ConvertedExpense[] = tripExps.map((e: Expense) => {
            // Step 1: Get value in EUR
            let rateToEur = CONVERSION_RATES[e.currency] || 1;
            if (mode === 'at_trip') {
                const cacheKey = `${e.date}_${e.currency}_EUR`;
                if (rateCache && rateCache[cacheKey]) rateToEur = rateCache[cacheKey];
            }
            const euroVal = e.euroValue || e.value * rateToEur;
            // Step 2: Convert EUR to target insightCurrency
            let targetVal = euroVal;
            if (targetCurr !== 'EUR') {
                let eurToTargetRate = 1 / (CONVERSION_RATES[targetCurr] || 1);
                if (mode === 'at_trip') {
                    const targetCacheKeyInv = `${e.date}_${targetCurr}_EUR`;
                    if (rateCache && rateCache[targetCacheKeyInv]) {
                        eurToTargetRate = 1 / rateCache[targetCacheKeyInv];
                    }
                }
                targetVal = euroVal * eurToTargetRate;
            }
            return { ...e, displayValue: targetVal };
        });

        const totalDisplay = convertedExps.reduce((sum, e) => sum + e.displayValue, 0);
        const totalCount = convertedExps.length;

        let highestExpense: ConvertedExpense | null = null;
        if (convertedExps.length > 0) {
            // length-checked above so [0] is safe; explicit local
            // avoids `convertedExps[0]` being typed as `ConvertedExpense | undefined`.
            const seed: ConvertedExpense = convertedExps[0]!;
            highestExpense = convertedExps.reduce<ConvertedExpense>(
                (max, e) => (e.displayValue > max.displayValue ? e : max),
                seed,
            );
        }

        const spenderTotals: Record<string, number> = {};
        const catTotals: Record<string, number> = {};
        const dateTotals: Record<string, number> = {};
        convertedExps.forEach((e) => {
            catTotals[e.categoryId] = (catTotals[e.categoryId] || 0) + e.displayValue;
            spenderTotals[e.who] = (spenderTotals[e.who] || 0) + e.displayValue;
            const d = e.date || t('insights.unknownDate');
            dateTotals[d] = (dateTotals[d] || 0) + e.displayValue;
        });

        const sortedSpenders = Object.entries(spenderTotals)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        // Category counts use raw tripExps (unconverted) — same as legacy.
        const catCounts: Record<string, number> = {};
        tripExps.forEach((e: Expense) => {
            catCounts[e.categoryId] = (catCounts[e.categoryId] || 0) + 1;
        });
        const sortedCats = Object.entries(catCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        return {
            totalDisplay,
            totalCount,
            highestExpense,
            sortedSpenders,
            sortedCats,
            catTotals,
            dateTotals,
        };
    }, [tripExps, mode, targetCurr, rateCache]);

    // ── Empty: trip has no expenses ───────────────────────────────────────
    if (tripExps.length === 0) {
        return (
            <div>
                <h1
                    style={{
                        display: 'inline-block',
                        background: 'var(--gradient-title)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}
                >
                    {t('insights.title')}
                </h1>
                <EmptyState
                    variant="tall"
                    emoji="📊"
                    title={t('insights.emptyNoExpensesTitle')}
                    // Body holds inline <b> markup; render as HTML so the
                    // bold renders. Source string is from our own
                    // translation tables (no user input), safe to inject.
                    body={<span dangerouslySetInnerHTML={{ __html: t('insights.emptyNoExpensesBody') }} />}
                    ctaLabel={t('insights.emptyNoExpensesCta')}
                    onCta={() => navigate('expenses')}
                />
            </div>
        );
    }

    const topEntry = sortedSpenders[0];
    const topSpender = topEntry ? topEntry[0] : 'N/A';
    const topSpenderAmount = topEntry ? topEntry[1] : 0;

    // Pie data — matched to category lookups for color/label display.
    const pieLabels: string[] = [];
    const pieData: number[] = [];
    const pieColors: string[] = [];
    Object.keys(catTotals).forEach((catId) => {
        const cat = categories.find((c: Category) => c.id === catId);
        pieLabels.push(cat ? `${cat.icon} ${cat.name}` : t('insights.unknownCategory'));
        pieColors.push(cat ? cat.color : '#ccc');
        pieData.push(catTotals[catId] ?? 0);
    });

    // ── Chart.js side-effects ─────────────────────────────────────────────
    const pieCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const timeCanvasRef = useRef<HTMLCanvasElement | null>(null);

    useEffect(() => {
        if (!pieCanvasRef.current || pieData.length === 0) return;
        const chart = new Chart(pieCanvasRef.current, {
            type: 'doughnut',
            data: {
                labels: pieLabels,
                datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 0 }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } },
            },
        });
        return () => chart.destroy();
    }, [pieData.join('|'), pieLabels.join('|'), pieColors.join('|')]);

    useEffect(() => {
        if (!timeCanvasRef.current || tripExps.length === 0) return;
        const sortedDates = Object.keys(dateTotals).sort();
        const timeData = sortedDates.map((d) => dateTotals[d]);
        const chartLabels = sortedDates.map((d) => {
            try {
                const dateObj = new Date(d);
                return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            } catch (e) {
                return d;
            }
        });
        const chart = new Chart(timeCanvasRef.current, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: targetCurr + ' Spent',
                        data: timeData,
                        borderColor: '#0071e3',
                        backgroundColor: 'rgba(0, 113, 227, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#0071e3',
                        borderWidth: 3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 },
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            maxTicksLimit: 5,
                            callback: (value: number | string) => targetSym + value,
                        },
                    },
                },
            },
        });
        return () => chart.destroy();
    }, [dateTotals, targetCurr, targetSym, tripExps.length]);

    // ── Mutation handlers ─────────────────────────────────────────────────
    // Mutate STATE then emit — useStore subscribers re-render. No need
    // to call navigate('insights') the way the legacy imperative
    // version did; React handles the repaint.
    const setMode = (m: 'at_trip' | 'today') => {
        STATE.rateMode = m;
        emit(EVENTS.STATE_CHANGED);
    };
    const setCurrency = (c: string) => {
        STATE.insightCurrency = c;
        emit(EVENTS.STATE_CHANGED);
    };

    return (
        <div>
            {/* Header Section — wraps cleanly on mobile (title + subtitle
                on the first row, controls collapsed below). Title uses
                browser-default h1 sizing to match Expenses / other pages
                (previously hardcoded 3.5rem made it visibly bigger AND
                overflowed on narrow viewports). Controls switch from a
                horizontal toggle pair + dropdown to a tighter row at
                <520px so the currency selector doesn't push beyond the
                right edge. */}
            <div
                className="insights-header"
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'flex-end',
                    gap: '20px',
                    marginBottom: '40px',
                    paddingBottom: '20px',
                    borderBottom: '1px solid var(--glass-border)',
                }}
            >
                <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                    <h1
                        style={{
                            display: 'inline-block',
                            background: 'var(--gradient-title)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            marginBottom: 12,
                        }}
                    >
                        {t('insights.title')}
                    </h1>
                    <p
                        style={{
                            color: 'var(--text-secondary)',
                            margin: '0',
                            fontSize: '1rem',
                        }}
                    >
                        {t('insights.subtitle')}
                    </p>
                </div>
                <div
                    className="insights-header__controls"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                    }}
                >
                    <div
                        className="glass"
                        style={{
                            display: 'flex',
                            padding: '4px',
                            borderRadius: '14px',
                            border: '1px solid var(--glass-border)',
                            boxShadow: 'var(--shadow-sm)',
                        }}
                    >
                        <button
                            className={`toggle-btn rate-mode-btn ${mode === 'at_trip' ? 'active' : ''}`}
                            onClick={() => setMode('at_trip')}
                        >
                            {t('insights.rateModeAtTrip')}
                        </button>
                        <button
                            className={`toggle-btn rate-mode-btn ${mode === 'today' ? 'active' : ''}`}
                            onClick={() => setMode('today')}
                        >
                            {t('insights.rateModeToday')}
                        </button>
                    </div>

                    <select
                        id="insightCurrencySelector"
                        className="glass-input"
                        aria-label={t('insights.currencySelectorAriaLabel')}
                        value={targetCurr}
                        onChange={(e) => setCurrency(e.target.value)}
                        style={{
                            width: '110px',
                            padding: '8px 12px',
                            fontWeight: 500,
                            fontSize: '0.9rem',
                            background: 'var(--glass-bg)',
                        }}
                    >
                        {Object.keys(CONVERSION_RATES).map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Hero Row: Totals */}
            <div style={{ marginBottom: 'var(--space-8)' }}>
                <div className="card glass hero-stat-card">
                    <h2 className="card-title hero-stat-card__title">{t('insights.heroTitle')}</h2>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                        <h1 className="hero-stat-card__value">
                            {targetSym}
                            {totalDisplay.toFixed(2)}
                        </h1>
                        <span className="hero-stat-card__currency">{targetCurr}</span>
                    </div>
                    <p
                        className="hero-stat-card__sub"
                        // {count} interpolation rolls in the transaction
                        // count; <strong> markup ships in the locale
                        // string and renders via dangerouslySetInnerHTML.
                        // Source string is from our own translation
                        // tables — no user input — so injection-safe.
                        dangerouslySetInnerHTML={{
                            __html: t('insights.heroSubText', { count: totalCount }),
                        }}
                    />
                </div>
            </div>

            {/* Summary Grid */}
            <div
                className="grid-2"
                style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 'var(--space-8)' }}
            >
                <div className="card glass">
                    <h2 className="card-title metric-label">{t('insights.avgDaily')}</h2>
                    <h1 className="metric-value">
                        {targetSym}
                        {(totalDisplay / (Object.keys(dateTotals).length || 1)).toFixed(2)}
                        <small
                            style={{
                                fontSize: 'var(--font-lg)',
                                fontWeight: 400,
                                color: 'var(--text-secondary)',
                                marginLeft: 'var(--space-2)',
                            }}
                        >
                            {t('insights.avgDailySuffix')}
                        </small>
                    </h1>
                </div>
                {highestExpense && (
                    <div className="card glass">
                        <h2 className="card-title metric-label">{t('insights.singlePeak')}</h2>
                        <h1 className="metric-value" style={{ color: '#ff3b30' }}>
                            {targetSym}
                            {highestExpense.displayValue.toFixed(2)}
                        </h1>
                        <p
                            className="metric-label"
                            style={{ margin: 'var(--space-1) 0 0 0' }}
                        >
                            {highestExpense.label} • {highestExpense.who}
                        </p>
                    </div>
                )}
            </div>

            {/* Rankings Grid */}
            <div className="grid-2" style={{ marginBottom: '32px' }}>
                <div className="card glass" style={{ padding: '28px' }}>
                    <h2 className="card-title">{t('insights.topSpenders')}</h2>
                    <div style={{ marginBottom: '20px' }}>
                        <h1 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>
                            {topSpender}
                        </h1>
                        <span
                            style={{
                                color: 'var(--accent-blue)',
                                fontWeight: 700,
                                fontSize: '1.1rem',
                            }}
                        >
                            {totalDisplay > 0 ? targetSym + topSpenderAmount.toFixed(2) : '0'}
                        </span>
                    </div>
                    <div
                        style={{
                            marginTop: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                        }}
                    >
                        {sortedSpenders.slice(1).map(([who, amount], index) => (
                            <div className="ranking-row" key={who}>
                                <span className="ranking-row__label">
                                    {index + 2}. {who}
                                </span>
                                <span className="ranking-row__value">
                                    {targetSym}
                                    {amount.toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="card glass" style={{ padding: '28px' }}>
                    <h2 className="card-title">{t('insights.categoryBreakdown')}</h2>
                    <div
                        style={{
                            position: 'relative',
                            height: '200px',
                            width: '100%',
                            marginBottom: '20px',
                        }}
                    >
                        <canvas id="categoryChart" ref={pieCanvasRef}></canvas>
                    </div>
                    <div
                        style={{
                            marginTop: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                        }}
                    >
                        {sortedCats.slice(1).map(([catId, count], index) => {
                            const cat = categories.find((c: Category) => c.id === catId);
                            return (
                                <div className="ranking-row" key={catId}>
                                    <span className="ranking-row__label">
                                        {index + 2}. {cat ? cat.icon + ' ' + cat.name : t('insights.unknownCategory')}
                                    </span>
                                    <span className="ranking-row__value">{count} {t('insights.transactionsAbbrev')}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Timeline Section (Full Width) */}
            <div className="card glass" style={{ marginBottom: 0, padding: '32px' }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '24px',
                    }}
                >
                    <h2 className="card-title" style={{ margin: 0 }}>
                        {t('insights.timelineTitle')}
                    </h2>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {t('insights.timelineSubtitle')}
                    </div>
                </div>
                <div style={{ position: 'relative', height: '350px', width: '100%' }}>
                    <canvas id="timelineChart" ref={timeCanvasRef}></canvas>
                </div>
            </div>
        </div>
    );
}

