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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../react/store.js';
import { useActiveTrip } from '../../react/TripContext.js';
import { useNavigate } from '../../react/useNavigate.js';
import { STATE, emit } from '../../state.js';
import { EVENTS, CURRENCY_SYMBOLS } from '../../constants.js';
import { convertCurrency } from '../../utils/currency.js';
import { fetchHistoricalRates, fetchCpiSeries } from '../../api.js';
import { getIntlLocale, formatNumber, formatNumberForCurrency } from '../../i18n.js';
import { getHomeCurrency, currencySymbol } from '../../utils.js';
import { computeTripBalances } from '../settlement/balances.js';
import { budgetStatus, budgetTitle } from '../budgets/helpers.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import type { Expense, Category } from '../../types';
import { t } from '../../i18n.js';
import { openNewTripModal } from '../../modals.js';
import { showModal } from '../../components/Modal.js';
import { iconSvg } from '../../icons.js';
import { esc } from '../../utils.js';

// Chart is loaded via CDN in index.html and declared as a global in types.d.ts
declare const Chart: any;

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

/** True when the date keys span more than one calendar year — used to
 *  decide whether the timeline axis needs the year to disambiguate
 *  (e.g. a "Jun 1 2016" and a "Jun 1 2026" expense). Parses UTC and
 *  ignores non-date keys (the localized "Unknown" undated bucket). */
function datesSpanMultipleYears(isoKeys: string[]): boolean {
    const years = isoKeys
        .map((d) => new Date(d + 'T00:00:00Z').getUTCFullYear())
        .filter((y) => Number.isFinite(y));
    return years.length > 0 && Math.max(...years) !== Math.min(...years);
}

/** Build a Chart.js axis label from a bare date key. Parses as UTC — so
 *  "2026-06-01" never slips to "May 31" for UTC-negative users (mirrors
 *  i18n.formatDateShort) — guards an Invalid Date (the undated bucket
 *  carries a localized "Unknown" key, not an ISO date) by returning the
 *  key verbatim, and includes the year when the trip spans >1 year. */
function timelineDateLabel(isoKey: string, includeYear: boolean): string {
    const dt = new Date(isoKey + 'T00:00:00Z');
    if (Number.isNaN(dt.getTime())) return isoKey;
    try {
        return new Intl.DateTimeFormat(getIntlLocale(), {
            month: 'short',
            day: 'numeric',
            ...(includeYear ? { year: 'numeric' } : {}),
            timeZone: 'UTC',
        }).format(dt);
    } catch {
        return isoKey;
    }
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
    const rateMode = useStore((s) => s.rateMode);
    const rateCache = useStore((s) => s.rateCache);
    const cpiCache = useStore((s) => s.cpiCache);
    // Currency-breakdown expander (multi-currency trips only).
    const [showCurrencyBreakdown, setShowCurrencyBreakdown] = useState(false);
    // Has the CPI fetch settled (resolved or failed)? Gates the
    // "no inflation data" note so it doesn't flash during the initial
    // load before the World Bank series lands.
    const [cpiChecked, setCpiChecked] = useState(false);

    // ── Empty: no active trip ─────────────────────────────────────────────
    if (!activeTripId) {
        return (
            <div>
                <h1
                    className="inline-block [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
                >
                    {t('insights.title')}
                </h1>
                {/* MK2 UX: was a bare "Please select a trip." in a card — route
                    through EmptyState with a create-trip CTA. */}
                <EmptyState
                    variant="tall"
                    iconName="barChart"
                    title={t('validation.selectTripFirst')}
                    body=""
                    ctaLabel={t('todo.emptyNoTripCta')}
                    onCta={() => openNewTripModal()}
                />
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

    // Background fetch for the home-currency CPI series — powers the
    // "Worth today" inflation adjustment. Re-fetches if the home
    // currency changes (a profile change between visits).
    useEffect(() => {
        fetchCpiSeries(getHomeCurrency()).finally(() => setCpiChecked(true));
    }, []);

    // Insights always reports in the viewer's HOME currency now (the
    // selectable display currency was removed — the original-currency
    // story lives in the breakdown below instead). The At trip / Today
    // toggle is what varies the rate.
    const targetCurr = getHomeCurrency();
    const targetSym = currencySymbol(targetCurr);
    const mode = rateMode || 'at_trip';
    // Whether the CPI fetch produced a usable series for the home currency.
    // If it settled with no data — an unmapped currency OR a failed World
    // Bank fetch — "Worth today" silently equals "Spent", so we surface a
    // note instead of letting the toggle look broken. `cpiChecked` gates it
    // so the note never flashes before the series has had a chance to land.
    const hasCpiData = !!(cpiCache[targetCurr] && Object.keys(cpiCache[targetCurr]).length > 0);
    const cpiUnavailable = cpiChecked && !hasCpiData;

    const {
        totalDisplay,
        totalCount,
        highestExpense,
        sortedSpenders,
        sortedCats,
        catTotals,
        dateTotals,
        sortedCountries,
        currencyHomeTotals,
        currencyOwnTotals,
        currencyDateTotals,
    } = useMemo(() => {
        // ── Inflation ("Worth today") factor ──────────────────────────
        // Real CPI for the home currency's region (World Bank FP.CPI.TOTL,
        // cached in cpiCache). Factor = CPI(latest available year) /
        // CPI(expense's year). Recent years (e.g. the current one, whose
        // CPI isn't published yet) clamp to the latest available, so a
        // brand-new trip shows ~no inflation, which is correct. Returns 1
        // when we have no CPI data (→ "Worth today" == as-spent).
        const cpi = cpiCache[targetCurr];
        let cpiLatestYear = 0;
        let cpiLatestVal = 0;
        let cpiEarliestYear = 0;
        if (cpi) {
            const ys = Object.keys(cpi).map(Number).filter((y) => Number.isFinite(y));
            if (ys.length) {
                cpiLatestYear = Math.max(...ys);
                cpiEarliestYear = Math.min(...ys);
                cpiLatestVal = cpi[cpiLatestYear] || 0;
            }
        }
        const inflationFactor = (date: string): number => {
            if (!cpi || !cpiLatestVal) return 1;
            let y = Number((date || '').slice(0, 4));
            // Guard against an empty/garbage date: `Number('')` is 0
            // (finite!), which would otherwise clamp to the earliest year
            // and apply max inflation. Treat any implausible year as the
            // latest (→ factor 1, no inflation) instead.
            if (!Number.isFinite(y) || y < 1900 || y > cpiLatestYear + 1) y = cpiLatestYear;
            let baseYear = Math.max(cpiEarliestYear, Math.min(cpiLatestYear, y));
            let baseCpi = cpi[baseYear];
            // Walk down to the nearest year that has data (gaps are rare).
            while (baseCpi == null && baseYear > cpiEarliestYear) {
                baseYear -= 1;
                baseCpi = cpi[baseYear];
            }
            return baseCpi ? cpiLatestVal / baseCpi : 1;
        };

        const convertedExps: ConvertedExpense[] = tripExps.map((e: Expense) => {
            // "Spent" = the cost in the home currency AT THE TIME: convert
            // the original amount at the REAL ECB rate on the expense's
            // own date (historical rateCache), falling back to the value
            // frozen at write time, then the live overlay. Identical in
            // both modes — the toggle no longer changes the exchange rate.
            // Use historical (real ECB) rates for BOTH legs or NEITHER —
            // never one historical + one static, which would pair an
            // at-the-time foreign rate with a present-day home rate and
            // quietly skew the home value (R-audit DATA-5). Both legs come
            // from the same Frankfurter fetch, so in practice they land
            // together; when either is missing we fall back to the
            // write-time frozen euroValue + a single static/live hop.
            const k = `${e.date}_${e.currency}_EUR`;
            const hk = `${e.date}_${targetCurr}_EUR`;
            const histForeign = rateCache ? rateCache[k] : undefined;
            const histHome = targetCurr === 'EUR' ? 1 : (rateCache ? rateCache[hk] : undefined);
            let spentHome: number;
            if (histForeign && histHome) {
                const euroVal = e.value * histForeign;
                spentHome = targetCurr === 'EUR' ? euroVal : euroVal / histHome;
            } else {
                // C1: `??` (not `||`) — a frozen euroValue of 0 is respected
                // as €0, not re-converted 1:1 from the raw foreign value.
                const euroVal = e.euroValue ?? convertCurrency(e.value, e.currency, 'EUR');
                spentHome = targetCurr === 'EUR' ? euroVal : convertCurrency(euroVal, 'EUR', targetCurr);
            }
            // "Worth today" = that as-spent home cost, adjusted for the
            // home currency's inflation since the expense's year.
            const displayValue = mode === 'today'
                ? spentHome * inflationFactor(e.date)
                : spentHome;
            return { ...e, displayValue };
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
        // Per-original-currency aggregates for the currency breakdown:
        //  - home-equivalent total (donut share + list "≈ home" column)
        //  - own-currency total (list "what you actually spent" column)
        //  - home-equiv per date per currency (the stacked timeline)
        const currencyHomeTotals: Record<string, number> = {};
        const currencyOwnTotals: Record<string, number> = {};
        const currencyDateTotals: Record<string, Record<string, number>> = {};
        convertedExps.forEach((e) => {
            catTotals[e.categoryId] = (catTotals[e.categoryId] || 0) + e.displayValue;
            spenderTotals[e.who] = (spenderTotals[e.who] || 0) + e.displayValue;
            const d = e.date || t('insights.unknownDate');
            dateTotals[d] = (dateTotals[d] || 0) + e.displayValue;
            const cur = (e.currency || 'EUR').toUpperCase();
            currencyHomeTotals[cur] = (currencyHomeTotals[cur] || 0) + e.displayValue;
            currencyOwnTotals[cur] = (currencyOwnTotals[cur] || 0) + e.value;
            if (!currencyDateTotals[cur]) currencyDateTotals[cur] = {};
            currencyDateTotals[cur][d] = (currencyDateTotals[cur][d] || 0) + e.displayValue;
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
            currencyHomeTotals,
            currencyOwnTotals,
            currencyDateTotals,
        };
    }, [tripExps, mode, targetCurr, rateCache, cpiCache]);

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
                    iconName="barChart"
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

    // Resolve a category by id, falling back to a case-insensitive NAME
    // match — so name-string categoryIds from imports / legacy / external
    // writes (e.g. 'food') resolve to the real "Food" category instead of
    // collapsing the whole by-category view to "Unknown" (audit BUG).
    const findCategory = (catId: string): { id: string; name: string; icon: string; color: string } => {
        const match =
            categories.find((c: Category) => c.id === catId) ||
            categories.find((c: Category) => c.name.toLowerCase() === String(catId).toLowerCase());
        if (match) return match;
        // T3-1: never collapse an unmatched categoryId (from imports / legacy /
        // API / seed slugs like 'flights') to a bare gray "Unknown" — show the
        // key's own name with a STABLE hashed colour so the donut + ranking
        // stay readable and consistent across renders.
        const raw = String(catId || '').trim();
        if (!raw) return { id: '', name: t('insights.unknownCategory'), icon: '🏷️', color: '#8e8e93' };
        const _palette = ['#0071e3', '#9b59b6', '#ff9500', '#34c759', '#ff2d55', '#5ac8fa', '#ffd60a', '#8e8e93'];
        let h = 0;
        for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
        return { id: raw, name: raw.charAt(0).toUpperCase() + raw.slice(1), icon: '🏷️', color: _palette[h % _palette.length]! };
    };

    // Pie data — matched to category lookups for color/label display.
    const pieLabels: string[] = [];
    const pieData: number[] = [];
    const pieColors: string[] = [];
    // Cap the donut at the top categories + an aggregated "Other" slice —
    // a 50-slice ring with an overflowing legend is unreadable (audit).
    const _catSorted = Object.keys(catTotals)
        .map((catId) => ({ catId, total: catTotals[catId] ?? 0 }))
        .sort((a, b) => b.total - a.total);
    const _CAT_TOP_N = 7;
    _catSorted.slice(0, _CAT_TOP_N).forEach(({ catId, total }) => {
        const cat = findCategory(catId);  // T3-1: always resolves (synthetic fallback)
        pieLabels.push(`${cat.icon} ${cat.name}`);
        pieColors.push(cat.color);
        pieData.push(total);
    });
    const _catRest = _catSorted.slice(_CAT_TOP_N);
    if (_catRest.length > 0) {
        pieLabels.push(t('insights.otherCategories'));
        pieColors.push('#8e8e93');
        pieData.push(_catRest.reduce((s, c) => s + c.total, 0));
    }

    // Daily-average denominator: count only real trip days (a valid date
    // <= today). Empty-date + far-future buckets shouldn't dilute it (audit).
    const _todayIso = new Date().toISOString().slice(0, 10);
    // Integration audit D3: the daily average must divide spend and days over
    // the SAME window. Pre-fix the numerator was ALL spend (incl. future-dated
    // expenses) while the denominator was past-valid-days only, overstating
    // €/day (e.g. €506 shown vs €411 actual). Sum dateTotals across exactly
    // the days the denominator counts.
    const _validDayKeys = Object.keys(dateTotals).filter(
        (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= _todayIso,
    );
    const validDayCount = _validDayKeys.length || 1;
    const pastValidSpend = _validDayKeys.reduce((s, d) => s + (dateTotals[d] || 0), 0);

    // Net balances (who owes whom) — reuses the settlement engine (splits +
    // settlements), shown in the home currency. Hidden when everyone's even.
    const activeTrip = STATE.trips.find((tr: any) => tr.id === activeTripId);
    const netBalances = activeTrip
        ? Object.entries(computeTripBalances(activeTrip).balances)
              .map(([name, eur]) => ({ name, eur: eur as number, home: convertCurrency(eur as number, 'EUR', targetCurr) }))
              // Integration audit D4 + MM-6: filter on the EUR balance with the
              // SAME strict `> 0.01` test simplifyDebts uses (balances.ts
              // _ZERO_EPSILON_EUR), so Insights never shows "owes €0.01" while
              // Settle-up says "all settled" — including at exactly €0.01.
              .filter((b) => Math.abs(b.eur) > 0.01)
              .sort((a, b) => b.home - a.home)
        : [];

    // Budget vs. spent — planned (EUR canonical) vs actual spend per budget
    // scope, both shown in the home currency. Reuses the budgets helpers.
    const tripBudgets = (STATE.budgets || [])
        .filter((b: any) => b.tripId === activeTripId || b.tripId === 'all')
        .map((b: any) => {
            const stat = budgetStatus(b);
            return {
                title: budgetTitle(b),
                spentHome: convertCurrency(stat.spent, 'EUR', targetCurr),
                targetHome: convertCurrency(stat.target, 'EUR', targetCurr),
                pct: stat.pct,
                color: stat.color,
            };
        });

    // ── Currency breakdown data ───────────────────────────────────────
    // The currency story only appears when the trip involved spend
    // OUTSIDE the viewer's home currency. A single home-currency trip
    // has nothing to break down (and the At trip / Today toggle would be
    // a no-op), so both are hidden in that case.
    // Uppercased so the home-vs-foreign test is case-insensitive and
    // airtight: `spendCurrencies` are already upper-cased at aggregation
    // time, so normalising home here guarantees a stray-case home
    // currency can never be misread as "foreign".
    const homeCurr = (targetCurr || 'EUR').toUpperCase();
    const spendCurrencies = Object.keys(currencyHomeTotals).sort(
        (a, b) => (currencyHomeTotals[b] ?? 0) - (currencyHomeTotals[a] ?? 0),
    );
    // Show the breakdown whenever EVEN ONE expense was in a non-home
    // currency — `.some` is true if any single currency differs, so a
    // trip that's 99.9% home currency + one foreign coffee still shows
    // it. It's hidden ONLY when every expense is the home currency.
    const hasForeignSpend = spendCurrencies.some((c) => c !== homeCurr);
    // The donut + over-time charts only make sense with 2+ currencies
    // (a 1-slice donut / single-series stack is pointless). A single
    // foreign-currency trip still shows the per-currency LIST so the
    // user sees what they actually spent in that currency.
    const isMultiCurrency = spendCurrencies.length >= 2;
    const currencyGrandTotal = spendCurrencies.reduce(
        (s, c) => s + (currencyHomeTotals[c] ?? 0), 0,
    );
    const CURRENCY_PALETTE = ['#0071e3', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#8e8e93'];
    const currencyColor = (i: number) => CURRENCY_PALETTE[i % CURRENCY_PALETTE.length] ?? '#8e8e93';
    const currencyRows = spendCurrencies.map((c, i) => ({
        code: c,
        color: currencyColor(i),
        ownAmount: currencyOwnTotals[c] ?? 0,
        homeAmount: currencyHomeTotals[c] ?? 0,
        pct: currencyGrandTotal > 0 ? ((currencyHomeTotals[c] ?? 0) / currencyGrandTotal) * 100 : 0,
    }));

    // ── Chart.js side-effects ─────────────────────────────────────────────
    const pieCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const timeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const currencyPieRef = useRef<HTMLCanvasElement | null>(null);
    const currencyTimeRef = useRef<HTMLCanvasElement | null>(null);

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
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `${ctx.label}: ${targetSym}${formatNumberForCurrency(ctx.parsed, targetCurr)}`,
                        },
                    },
                },
            },
        });
        return () => chart.destroy();
    }, [pieData.join('|'), pieLabels.join('|'), pieColors.join('|'), targetCurr, targetSym]);

    useEffect(() => {
        if (!timeCanvasRef.current || tripExps.length === 0) return;
        const sortedDates = Object.keys(dateTotals).sort();
        const timeData = sortedDates.map((d) => dateTotals[d]);
        const includeYear = datesSpanMultipleYears(sortedDates);
        const chartLabels = sortedDates.map((d) => timelineDateLabel(d, includeYear));
        const chart = new Chart(timeCanvasRef.current, {
            type: 'line',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: targetCurr + ' ' + t(mode === 'today' ? 'insights.rateModeToday' : 'insights.rateModeAtTrip'),
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
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => targetSym + formatNumberForCurrency(ctx.parsed.y, targetCurr),
                        },
                    },
                },
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
                            callback: (value: number | string) => targetSym + formatNumber(Number(value), 0),
                        },
                    },
                },
            },
        });
        return () => chart.destroy();
    }, [dateTotals, targetCurr, targetSym, mode, tripExps.length]);

    // Currency-share donut — share of spend (home-equivalent) by the
    // ORIGINAL currency it was logged in. Only built when the breakdown
    // is expanded (the canvas isn't in the DOM until then).
    useEffect(() => {
        if (!showCurrencyBreakdown || !currencyPieRef.current || currencyRows.length === 0) return;
        const chart = new Chart(currencyPieRef.current, {
            type: 'doughnut',
            data: {
                labels: currencyRows.map((r) => r.code),
                datasets: [{
                    data: currencyRows.map((r) => r.homeAmount),
                    backgroundColor: currencyRows.map((r) => r.color),
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `${ctx.label}: ${targetSym}${formatNumberForCurrency(ctx.parsed, targetCurr)}`,
                        },
                    },
                },
            },
        });
        return () => chart.destroy();
    }, [showCurrencyBreakdown, targetCurr, targetSym, currencyRows.map((r) => `${r.code}:${r.homeAmount.toFixed(2)}`).join('|')]);

    // Currency-over-time stacked bars — home-equivalent spend per
    // original currency per day, so the currency mix shift across the
    // trip is visible at a glance.
    useEffect(() => {
        if (!showCurrencyBreakdown || !currencyTimeRef.current || spendCurrencies.length === 0) return;
        const allDates = Array.from(
            new Set(spendCurrencies.flatMap((c) => Object.keys(currencyDateTotals[c] || {}))),
        ).sort();
        const includeYear = datesSpanMultipleYears(allDates);
        const labels = allDates.map((d) => timelineDateLabel(d, includeYear));
        const datasets = currencyRows.map((r) => ({
            label: r.code,
            data: allDates.map((d) => (currencyDateTotals[r.code]?.[d]) || 0),
            backgroundColor: r.color,
            borderWidth: 0,
        }));
        const chart = new Chart(currencyTimeRef.current, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `${ctx.dataset.label}: ${targetSym}${formatNumberForCurrency(ctx.parsed.y, targetCurr)}`,
                        },
                    },
                },
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 7 } },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { maxTicksLimit: 5, callback: (value: number | string) => targetSym + formatNumber(Number(value), 0) },
                    },
                },
            },
        });
        return () => chart.destroy();
    }, [showCurrencyBreakdown, targetSym, targetCurr, JSON.stringify(currencyDateTotals)]);

    // ── Mutation handlers ─────────────────────────────────────────────────
    // Mutate STATE then emit — useStore subscribers re-render. No need
    // to call navigate('insights') the way the legacy imperative
    // version did; React handles the repaint.
    const setMode = (m: 'at_trip' | 'today') => {
        STATE.rateMode = m;
        emit(EVENTS.STATE_CHANGED);
    };
    // ⓘ explainer — how "Spent" and "Worth today" are calculated.
    const openRateModeInfo = () => {
        const { root, close } = showModal({
            variant: 'glass',
            cardStyle: 'width: 460px; max-width: calc(100vw - 32px); padding: 26px; border-radius: 24px;',
            innerHTML: `
                <h2 style="margin:0 0 14px; font-size:1.3rem; font-weight:800; color:var(--text-brand-navy); letter-spacing:-0.02em;">${t('insights.rateInfoTitle')}</h2>
                <div style="display:flex; flex-direction:column; gap:12px; font-size:0.92rem; line-height:1.5; color:var(--text-brand-navy);">
                    <p style="margin:0;"><strong>${t('insights.rateModeAtTrip')}</strong> — ${t('insights.rateInfoSpent', { currency: esc(targetCurr) })}</p>
                    <p style="margin:0;"><strong>${t('insights.rateModeToday')}</strong> — ${t('insights.rateInfoWorthToday', { currency: esc(targetCurr) })}</p>
                    <p style="margin:6px 0 0; font-size:0.82rem; color:var(--text-secondary);">${t('insights.rateInfoNote')}</p>
                </div>
                <div style="display:flex; justify-content:flex-end; margin-top:20px;">
                    <button id="rateInfoClose" class="btn-primary" style="padding:9px 20px; border-radius:999px;">${t('common.close')}</button>
                </div>
            `,
        });
        (root.querySelector('#rateInfoClose') as HTMLButtonElement | null)?.addEventListener('click', close);
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
                    className="insights-header__controls flex items-center gap-2 flex-wrap"
                >
                    {/* The currency SELECTOR was removed — Insights always
                        reports in your home currency. The Spent / Worth-today
                        toggle is always shown now: even a home-currency trip
                        differs by inflation. The ⓘ explains the math. */}
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
                    <button
                        type="button"
                        className="icon-action-btn"
                        onClick={openRateModeInfo}
                        aria-label={t('insights.rateModeInfoAria')}
                        title={t('insights.rateModeInfoAria')}
                        dangerouslySetInnerHTML={{ __html: iconSvg('info', { size: 18 }) }}
                    />
                    {/* The toggle explainer, now visible (was a hover-only
                        title= tooltip — invisible on touch). When the home
                        currency has no inflation data, this becomes the
                        "unavailable" note instead. */}
                    <p className="basis-full text-secondary text-[0.75rem] leading-snug text-right m-0 mt-1">
                        {cpiUnavailable
                            ? t('insights.rateModeNoCpi', {
                                  currency: targetCurr,
                                  today: t('insights.rateModeToday'),
                                  spent: t('insights.rateModeAtTrip'),
                              })
                            : t('insights.rateModeHint')}
                    </p>
                </div>
            </div>

            {/* Hero Row: Totals */}
            <div className="mb-8">
                <div className="card glass hero-stat-card">
                    <h2 className="card-title hero-stat-card__title">{t('insights.heroTitle')}</h2>
                    <div className="flex items-baseline gap-3">
                        <h1 className="hero-stat-card__value">
                            {targetSym}
                            {formatNumberForCurrency(totalDisplay, targetCurr)}
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
                    <p className="hero-stat-card__sub" style={{ opacity: 0.7, marginTop: '4px' }}>
                        {t('insights.heroHomeCurrencyHint', { currency: targetCurr })}
                    </p>
                    {hasForeignSpend ? (
                        <button
                            type="button"
                            onClick={() => setShowCurrencyBreakdown((v) => !v)}
                            className="link-underline text-accent-blue font-bold text-[0.85rem]"
                            style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginTop: '12px' }}
                        >
                            {showCurrencyBreakdown
                                ? t('insights.hideCurrencyBreakdown')
                                : t('insights.seeCurrencyBreakdown')}
                        </button>
                    ) : null}
                </div>
            </div>

            {/* Currency breakdown — only for trips with foreign spend. */}
            {hasForeignSpend && showCurrencyBreakdown ? (
                <div className="mb-8">
                    <div className="card glass in-card-pad-28 mb-8">
                        <h2 className="card-title">{t('insights.currencyBreakdownTitle')}</h2>
                        <p className="text-secondary text-[0.85rem] mt-1 mb-5">
                            {t('insights.currencyBreakdownSub')}
                        </p>
                        <div className={isMultiCurrency ? 'grid-2 grid-cols-2 gap-6 items-center' : ''}>
                            {isMultiCurrency ? (
                                <div className="relative h-[220px] w-full">
                                    <canvas ref={currencyPieRef}></canvas>
                                </div>
                            ) : null}
                            <div className="flex flex-col gap-2">
                                {currencyRows.map((r) => (
                                    <div className="flex items-center gap-2" key={r.code}>
                                        <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: r.color, flexShrink: 0 }} />
                                        <span className="font-extrabold" style={{ minWidth: '46px' }}>{r.code}</span>
                                        {/* Original-currency amount (what you paid) — only for
                                            FOREIGN currencies; for the home-currency row it would
                                            be the same currency as the home figure on the right,
                                            which read as a contradiction (two numbers, one currency). */}
                                        {r.code !== homeCurr ? (
                                            <span className="text-secondary text-[0.85rem]">{(CURRENCY_SYMBOLS[r.code] || '') + formatNumberForCurrency(r.ownAmount, r.code)}</span>
                                        ) : null}
                                        {/* Home-currency value. Foreign rows get a "≈" so it
                                            reads as a conversion, not a second price. */}
                                        <span className="ml-auto font-extrabold" style={{ color: 'var(--text-brand-navy)' }}>{r.code !== homeCurr ? '≈ ' : ''}{targetSym}{formatNumberForCurrency(r.homeAmount, targetCurr)}</span>
                                        <span className="text-secondary text-[0.78rem]" style={{ minWidth: '40px', textAlign: 'right' }}>{formatNumber(r.pct, 0)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {isMultiCurrency ? (
                        <div className="card glass in-card-pad-28">
                            <h2 className="card-title">{t('insights.currencyTimelineTitle')}</h2>
                            <p className="text-secondary text-[0.85rem] mt-1 mb-5">
                                {t('insights.currencyTimelineSub')}
                            </p>
                            <div className="relative h-[300px] w-full">
                                <canvas ref={currencyTimeRef}></canvas>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* Budget vs. spent — only when the trip has budgets. */}
            {tripBudgets.length > 0 ? (
                <div className="card glass in-card-pad-28 mb-8">
                    <h2 className="card-title">{t('insights.budgetVsActualTitle')}</h2>
                    <p className="text-secondary text-[0.85rem] mt-1 mb-5">{t('insights.budgetVsActualSub')}</p>
                    <div className="flex flex-col gap-4">
                        {tripBudgets.map((b, i) => (
                            <div key={i}>
                                <div className="flex justify-between items-baseline mb-1.5 gap-3">
                                    <span className="font-bold text-[0.9rem]">{b.title}</span>
                                    <span className="text-[0.85rem] whitespace-nowrap" style={{ fontWeight: 700 }}>
                                        <span style={{ color: b.color }}>{targetSym}{formatNumberForCurrency(b.spentHome, targetCurr)}</span>
                                        <span className="text-secondary font-normal"> / {targetSym}{formatNumberForCurrency(b.targetHome, targetCurr)}</span>
                                    </span>
                                </div>
                                <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(b.pct, 100)}%`, background: b.color, borderRadius: 999, transition: 'width 0.3s ease' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* Net balances — who owes whom (after splits + settlements). */}
            {netBalances.length > 0 ? (
                <div className="card glass in-card-pad-28 mb-8">
                    <h2 className="card-title">{t('insights.netBalanceTitle')}</h2>
                    <p className="text-secondary text-[0.85rem] mt-1 mb-5">{t('insights.netBalanceSub')}</p>
                    <div className="flex flex-col gap-2">
                        {netBalances.map((b) => (
                            <div className="flex items-center gap-2" key={b.name}>
                                <span className="font-extrabold">{b.name}</span>
                                <span className="ml-auto font-bold text-[0.9rem]" style={{ color: b.home >= 0 ? '#34c759' : '#ff3b30' }}>
                                    {b.home >= 0 ? t('insights.balanceGetsBack') : t('insights.balanceOwes')} {targetSym}{formatNumberForCurrency(Math.abs(b.home), targetCurr)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* Summary Grid */}
            <div
                className="grid-2 grid-cols-2 mb-8"
            >
                <div className="card glass">
                    <h2 className="card-title metric-label">{t('insights.avgDaily')}</h2>
                    <h1 className="metric-value">
                        {targetSym}
                        {formatNumberForCurrency(pastValidSpend / validDayCount, targetCurr)}
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
                            {formatNumberForCurrency(highestExpense.displayValue, targetCurr)}
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
                            {totalDisplay > 0 ? targetSym + formatNumberForCurrency(topSpenderAmount, targetCurr) : '0'}
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
                                    {formatNumberForCurrency(amount, targetCurr)}
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
                            const cat = findCategory(catId);
                            return (
                                <div className="ranking-row" key={catId}>
                                    <span className="ranking-row__label">
                                        {index + 2}. {cat.icon} {cat.name}
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
                                            {formatNumberForCurrency(amount, targetCurr)}
                                            <span
                                                className="ml-2 text-secondary font-semibold text-[0.8rem]"
                                            >
                                                {formatNumber(pct, 0)}%
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

