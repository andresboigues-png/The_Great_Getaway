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
import { useActiveTrip } from '../../react/TripContext.js';
import { useNavigate } from '../../react/useNavigate.js';
import { STATE, emit } from '../../state.js';
import { CONVERSION_RATES, EVENTS } from '../../constants.js';
import { convertCurrency } from '../../utils/currency.js';
import { fetchHistoricalRates } from '../../api.js';
import { getIntlLocale } from '../../i18n.js';
import { getHomeCurrency, currencySymbol } from '../../utils.js';
import { loadChart } from '../../utils/loadGlobalScript.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import type { Expense, Category } from '../../types';
import { t } from '../../i18n.js';

// R11-B2: Chart.js is now lazy-loaded via `loadChart()` (see
// utils/loadGlobalScript.ts) — pre-fix it rode as a synchronous CDN
// script in index.html (~190KB parser-blocking on every cold paint).
// The constructor flows through `await loadChart()` inside each
// useEffect below; the `declare const Chart: any` global is no
// longer referenced from this module.

interface ConvertedExpense {
    id: string;
    tripId: string;
    who: string;
    categoryId: string;
    label: string;
    date: string;
    /** §4.3: user's country pick on the manual-entry form (full name
     *  like "Portugal" / "Spain", NOT ISO code — stored as-is from
     *  the COUNTRIES dropdown). Optional because legacy / batch-
     *  uploaded expenses may have it empty, in which case the per-
     *  country aggregation skips them rather than bucketing under a
     *  fake "Unknown" key that would inflate the breakdown. */
    country?: string;
    currency: string;
    value: number;
    euroValue?: number;
    isSettlement?: boolean;
    displayValue: number;
}

export function Insights() {
    const navigate = useNavigate();
    // §3.4 — `useActiveTrip` provides the activeTripId + the
    // already-filtered expenses array. The Insights chart wants
    // expenses MINUS settlements (it's a spend-by-category view,
    // not a balance view), so we further filter below. Note: the
    // hook's `expenses` slice is filter-by-tripId; the
    // !isSettlement filter is Insights-specific and stays here.
    const { activeTripId, expenses: tripExpensesAll } = useActiveTrip();
    const categories = useStore((s) => s.categories);
    const insightCurrency = useStore((s) => s.insightCurrency);
    const rateMode = useStore((s) => s.rateMode);
    const rateCache = useStore((s) => s.rateCache);

    // ── Empty: no active trip ─────────────────────────────────────────────
    if (!activeTripId) {
        return (
            <div>
                <h1
                    className="inline-block [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
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
    // §3.4 — `useActiveTrip` returns expenses already scoped to the
    // active trip; we further strip settlements here because Insights
    // is a "real spend" view (a Sara→Andrés settlement isn't a fresh
    // outflow, just a balance shift).
    const tripExps = useMemo(
        () => tripExpensesAll.filter((e: Expense) => !e.isSettlement),
        [tripExpensesAll],
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
        sortedCountries,
    } = useMemo(() => {
        const convertedExps: ConvertedExpense[] = tripExps.map((e: Expense) => {
            // Step 1: Get value in EUR.
            // R2 audit fix: the static CONVERSION_RATES fallback runs
            // against a ~2-year-stale baked table. For 'current' mode
            // use the live FX overlay (convertCurrency); for 'at_trip'
            // mode the historical rateCache wins when available, and
            // the LAST-resort fallback also goes through the live
            // overlay rather than the stale baked table.
            let euroVal: number;
            if (mode === 'at_trip') {
                const cacheKey = `${e.date}_${e.currency}_EUR`;
                if (rateCache && rateCache[cacheKey]) {
                    euroVal = e.euroValue || e.value * rateCache[cacheKey];
                } else {
                    euroVal = e.euroValue || convertCurrency(e.value, e.currency, 'EUR');
                }
            } else {
                euroVal = e.euroValue || convertCurrency(e.value, e.currency, 'EUR');
            }
            // Step 2: Convert EUR to target insightCurrency.
            let targetVal = euroVal;
            if (targetCurr !== 'EUR') {
                if (mode === 'at_trip') {
                    const targetCacheKeyInv = `${e.date}_${targetCurr}_EUR`;
                    if (rateCache && rateCache[targetCacheKeyInv]) {
                        targetVal = euroVal / rateCache[targetCacheKeyInv];
                    } else {
                        targetVal = convertCurrency(euroVal, 'EUR', targetCurr);
                    }
                } else {
                    targetVal = convertCurrency(euroVal, 'EUR', targetCurr);
                }
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
        // §4.3: per-country expense aggregation. Each expense already
        // carries a `country` field (set by the user on the manual-
        // entry form's country picker). We DON'T derive country from
        // the trip's `countries` array — the array tells us WHICH
        // countries the trip touched, not WHICH country each expense
        // belongs to. Using e.country directly preserves "I spent X
        // on this side-trip to Spain" semantics rather than smearing
        // by trip-level country mix.
        const countryTotals: Record<string, number> = {};
        convertedExps.forEach((e) => {
            catTotals[e.categoryId] = (catTotals[e.categoryId] || 0) + e.displayValue;
            spenderTotals[e.who] = (spenderTotals[e.who] || 0) + e.displayValue;
            const d = e.date || t('insights.unknownDate');
            dateTotals[d] = (dateTotals[d] || 0) + e.displayValue;
            // Expenses without a `country` (legacy data, batch upload
            // without country tagging) bucket under a sentinel key so
            // they're visible in the breakdown but distinguishable
            // from real geographies. Falsy-checked rather than empty-
            // string to also catch null/undefined from legacy rows.
            const countryKey = e.country || '';
            if (countryKey) {
                countryTotals[countryKey] = (countryTotals[countryKey] || 0) + e.displayValue;
            }
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

        // §4.3: sorted-by-spend so the biggest country leads. Slice
        // limit matches the spender/category lists for visual rhythm —
        // a trip with 11+ distinct countries is extraordinary, but the
        // cap means even an outlier doesn't blow out the card height.
        const sortedCountries = Object.entries(countryTotals)
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
            sortedCountries,
        };
    }, [tripExps, mode, targetCurr, rateCache]);

    // ── Empty: trip has no expenses ───────────────────────────────────────
    if (tripExps.length === 0) {
        return (
            <div>
                <h1
                    className="inline-block [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
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
        // R11-B2: chart.js is lazy-loaded on first /insights visit (was
        // synchronous parser-blocking in index.html). The async load
        // means the chart instance becomes available a tick after this
        // effect runs — guard with `cancelled` so a re-run / unmount
        // before resolve doesn't construct an orphan chart on a stale
        // canvas. Same shape on the timeline chart below.
        let chart: any = null;
        let cancelled = false;
        loadChart().then((ChartCtor: any) => {
            if (cancelled || !pieCanvasRef.current) return;
            chart = new ChartCtor(pieCanvasRef.current, {
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
        }).catch((e) => {
            console.warn('[insights] chart.js load failed', e);
        });
        return () => {
            cancelled = true;
            if (chart && typeof chart.destroy === 'function') chart.destroy();
        };
    }, [pieData.join('|'), pieLabels.join('|'), pieColors.join('|')]);

    useEffect(() => {
        if (!timeCanvasRef.current || tripExps.length === 0) return;
        const sortedDates = Object.keys(dateTotals).sort();
        const timeData = sortedDates.map((d) => dateTotals[d]);
        const chartLabels = sortedDates.map((d) => {
            try {
                const dateObj = new Date(d);
                return dateObj.toLocaleDateString(getIntlLocale(), { month: 'short', day: 'numeric' });
            } catch (e) {
                return d;
            }
        });
        // R11-B2: see lazy-load rationale on the pie effect above.
        let chart: any = null;
        let cancelled = false;
        loadChart().then((ChartCtor: any) => {
            if (cancelled || !timeCanvasRef.current) return;
            chart = new ChartCtor(timeCanvasRef.current, {
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
        }).catch((e) => {
            console.warn('[insights] chart.js load failed', e);
        });
        return () => {
            cancelled = true;
            if (chart && typeof chart.destroy === 'function') chart.destroy();
        };
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
                className="insights-header flex flex-wrap justify-between items-end gap-5 mb-10 pb-5 border-b border-[var(--glass-border)]"
            >
                <div className="min-w-0 flex-[1_1_240px]">
                    <h1
                        className="inline-block [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text mb-3"
                    >
                        {t('insights.title')}
                    </h1>
                    <p
                        className="text-secondary m-0 text-base"
                    >
                        {t('insights.subtitle')}
                    </p>
                </div>
                <div
                    className="insights-header__controls flex items-center gap-3 flex-wrap"
                >
                    <div
                        className="glass flex p-1 rounded-[14px] border border-[var(--glass-border)] shadow-[var(--shadow-sm)]"
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
                        className="glass-input w-[110px] py-2 px-3 font-medium text-[0.9rem] bg-[var(--glass-bg)]"
                        aria-label={t('insights.currencySelectorAriaLabel')}
                        value={targetCurr}
                        onChange={(e) => setCurrency(e.target.value)}
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
            <div className="mb-8">
                <div className="card glass hero-stat-card">
                    <h2 className="card-title hero-stat-card__title">{t('insights.heroTitle')}</h2>
                    <div className="flex items-baseline gap-3">
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
                className="grid-2 grid-cols-2 mb-8"
            >
                <div className="card glass">
                    <h2 className="card-title metric-label">{t('insights.avgDaily')}</h2>
                    <h1 className="metric-value">
                        {targetSym}
                        {(totalDisplay / (Object.keys(dateTotals).length || 1)).toFixed(2)}
                        <small
                            className="text-[length:var(--font-lg)] font-normal text-secondary ml-2"
                        >
                            {t('insights.avgDailySuffix')}
                        </small>
                    </h1>
                </div>
                {highestExpense && (
                    <div className="card glass">
                        <h2 className="card-title metric-label">{t('insights.singlePeak')}</h2>
                        <h1 className="metric-value text-[#ff3b30]">
                            {targetSym}
                            {highestExpense.displayValue.toFixed(2)}
                        </h1>
                        <p
                            className="metric-label mt-1 mr-0 mb-0 ml-0"
                        >
                            {highestExpense.label} • {highestExpense.who}
                        </p>
                    </div>
                )}
            </div>

            {/* Rankings Grid */}
            <div className="grid-2 mb-8">
                <div className="card glass in-card-pad-28">
                    <h2 className="card-title">{t('insights.topSpenders')}</h2>
                    <div className="mb-5">
                        <h1 className="m-0 text-[2rem] text-primary">
                            {topSpender}
                        </h1>
                        <span
                            className="text-accent-blue font-bold text-[1.1rem]"
                        >
                            {totalDisplay > 0 ? targetSym + topSpenderAmount.toFixed(2) : '0'}
                        </span>
                    </div>
                    <div
                        className="mt-5 flex flex-col gap-1"
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

                <div className="card glass in-card-pad-28">
                    <h2 className="card-title">{t('insights.categoryBreakdown')}</h2>
                    <div
                        className="relative h-[200px] w-full mb-5"
                    >
                        <canvas id="categoryChart" ref={pieCanvasRef}></canvas>
                    </div>
                    <div
                        className="mt-5 flex flex-col gap-1"
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

            {/* §4.3 — Per-country breakdown. Conditional render: a
                single-country trip would just show "{country}: 100%",
                redundant with the existing Category card. ≥2 distinct
                countries unlocks this card. Each row: country name +
                amount + a percentage bar so the visual rhythm matches
                the legend-style ranking-row pattern used elsewhere on
                the page. */}
            {sortedCountries.length >= 2 && (
                <div className="card glass mb-8 p-7">
                    <div
                        className="flex justify-between items-center mb-4"
                    >
                        <h2 className="card-title m-0">
                            {t('insights.byCountryTitle')}
                        </h2>
                        <div className="text-secondary text-[0.85rem]">
                            {t('insights.byCountrySubtitle')}
                        </div>
                    </div>
                    <div className="flex flex-col gap-[10px]">
                        {sortedCountries.map(([country, amount]) => {
                            const pct = totalDisplay > 0 ? (amount / totalDisplay) * 100 : 0;
                            return (
                                <div
                                    key={country}
                                    className="flex flex-col gap-1"
                                >
                                    <div
                                        className="flex justify-between items-baseline gap-3"
                                    >
                                        <span
                                            className="font-bold text-[0.95rem] text-primary wrap-anywhere min-w-0"
                                        >
                                            {country}
                                        </span>
                                        <span
                                            className="font-extrabold text-accent-blue tabular-nums whitespace-nowrap"
                                        >
                                            {targetSym}
                                            {amount.toFixed(2)}
                                            <span
                                                className="ml-2 text-secondary font-semibold text-[0.8rem]"
                                            >
                                                {pct.toFixed(0)}%
                                            </span>
                                        </span>
                                    </div>
                                    {/* Percentage bar — bg track + filled
                                        portion. inline styles to keep the
                                        whole card self-contained (no new
                                        CSS file for one bar pattern). */}
                                    <div
                                        className="relative h-1.5 rounded-full bg-[rgba(0,113,227,0.08)] overflow-hidden"
                                        aria-hidden="true"
                                    >
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                bottom: 0,
                                                width: `${Math.min(100, Math.max(0, pct))}%`,
                                                background:
                                                    'linear-gradient(90deg, #0071e3, #5856d6)',
                                                borderRadius: 999,
                                                transition: 'width 0.3s ease',
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Timeline Section (Full Width) */}
            <div className="card glass mb-0 p-8">
                <div
                    className="flex justify-between items-center mb-6"
                >
                    <h2 className="card-title m-0">
                        {t('insights.timelineTitle')}
                    </h2>
                    <div className="text-secondary text-[0.9rem]">
                        {t('insights.timelineSubtitle')}
                    </div>
                </div>
                <div className="relative h-[350px] w-full">
                    <canvas id="timelineChart" ref={timeCanvasRef}></canvas>
                </div>
            </div>
        </div>
    );
}

