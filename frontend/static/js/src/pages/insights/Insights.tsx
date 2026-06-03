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
import { getTripFxOverrides, setTripFxOverride, clearTripFxOverrides } from '../../utils/fxOverrides.js';
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

/** Build a CPI inflation-factor lookup from a year→index series (World
 *  Bank FP.CPI.TOTL). `factor(date)` = CPI(latest available year) /
 *  CPI(expense's year), clamped to the series: recent / undated / future
 *  years clamp to the latest (factor 1 — no inflation), and gaps walk down
 *  to the nearest year with data. Returns 1 when there's no usable series
 *  (→ "worth today" == as-spent for that currency). Pure + per-series, so
 *  the same helper drives BOTH the main calc and the override-panel auto
 *  figures — each indexed by the EXPENSE's own currency, not a single
 *  home-region figure smeared across every currency. */
function makeInflationFactor(cpi: Record<number, number> | undefined): (date: string) => number {
    let latestYear = 0;
    let latestVal = 0;
    let earliestYear = 0;
    if (cpi) {
        const ys = Object.keys(cpi).map(Number).filter((y) => Number.isFinite(y));
        if (ys.length) {
            latestYear = Math.max(...ys);
            earliestYear = Math.min(...ys);
            latestVal = cpi[latestYear] || 0;
        }
    }
    return (date: string): number => {
        if (!cpi || !latestVal) return 1;
        let y = Number((date || '').slice(0, 4));
        if (!Number.isFinite(y) || y < 1900 || y > latestYear + 1) y = latestYear;
        let baseYear = Math.max(earliestYear, Math.min(latestYear, y));
        let baseCpi = cpi[baseYear];
        while (baseCpi == null && baseYear > earliestYear) {
            baseYear -= 1;
            baseCpi = cpi[baseYear];
        }
        return baseCpi ? latestVal / baseCpi : 1;
    };
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
    // Per-trip manual FX/inflation overrides for "Value today" (F2). The
    // whole map is the useStore selector so a save (which replaces the
    // reference) recomputes the calc useMemo below; the active trip's slice
    // is read inside it.
    const fxOverridesByTrip = useStore((s) => s.fxOverridesByTrip);
    // Global manual exchange/inflation rates (Settings → Personalization).
    // Subscribed so an edit there re-runs the calc useMemo below; the actual
    // per-currency/per-year lookups go through utils/manualRates.
    const manualRates = useStore((s) => s.manualRates);
    // Currency-breakdown expander (multi-currency trips only).
    const [showCurrencyBreakdown, setShowCurrencyBreakdown] = useState(false);
    // Has the CPI fetch settled (resolved or failed)? Gates the
    // "no inflation data" note so it doesn't flash during the initial
    // load before the World Bank series lands.
    const [cpiChecked, setCpiChecked] = useState(false);
    // IA-4 (MK3 audit): has the historical-FX fetch for THIS trip's dates
    // settled? The hero total leans on rateCache; until it lands, spentHome
    // falls back to the write-time euroValue and the figure renders ~12% off,
    // then visibly jumps. We show a "calculating…" placeholder until this is
    // true so the headline never displays a number that's about to move.
    const [ratesSettled, setRatesSettled] = useState(false);

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
        // IA-4: with no dated expenses there's nothing to fetch — the figure
        // is already final, so mark settled immediately. Otherwise reset to
        // "pending", fetch, and flip settled when the request resolves (or
        // fails). The `cancelled` guard stops a stale trip's resolve from
        // un-gating the figure after the user switches trips mid-flight.
        if (uniqueDates.length === 0) {
            setRatesSettled(true);
            return;
        }
        let cancelled = false;
        setRatesSettled(false);
        fetchHistoricalRates(uniqueDates).finally(() => {
            if (!cancelled) setRatesSettled(true);
        });
        return () => {
            cancelled = true;
        };
    }, [tripExps]);

    // Background fetch for the CPI series that power "Worth today". Each
    // expense now inflates on ITS OWN currency-region CPI (not a single
    // home-region figure applied to everything), so we fetch the home
    // currency AND every currency the trip spent in. Each fetch is
    // dedupe-guarded + cached; cpiChecked flips once they all settle (gates
    // the hero "calculating…" placeholder in today mode).
    useEffect(() => {
        const curs = Array.from(new Set([
            getHomeCurrency().toUpperCase(),
            ...tripExps.map((e: Expense) => (e.currency || 'EUR').toUpperCase()),
        ]));
        setCpiChecked(false);
        Promise.all(curs.map((c) => fetchCpiSeries(c))).finally(() => setCpiChecked(true));
    }, [tripExps]);

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
        // F2 — per-currency manual overrides for "Value today". When the
        // user has set their own inflation %/exchange-rate for a currency,
        // it REPLACES the auto CPI+historical-FX estimate for that currency
        // in `today` mode (uppercase-keyed). `at_trip` (Spent) is always the
        // at-the-time figure and ignores overrides.
        const tripOverrides = fxOverridesByTrip[activeTripId] || {};
        // ── Inflation ("Worth today") — PER CURRENCY ──────────────────
        // Each expense is grown by ITS OWN currency-region CPI (World Bank
        // FP.CPI.TOTL — CAD→Canada, USD→USA, EUR→Germany proxy), memoised
        // per currency. Pre-fix a single home-region figure was smeared
        // across every currency (a CAD expense inflated on German CPI),
        // which the user flagged ("inflation happened for the other
        // currencies as well"). makeInflationFactor returns 1 for a
        // currency whose series hasn't loaded / doesn't exist.
        const _curYear = new Date().getFullYear();
        const _autoFactorByCur: Record<string, (d: string) => number> = {};
        const inflationFactorFor = (cur: string, date: string): number => {
            const c = (cur || 'EUR').toUpperCase();
            const y = (date || '').slice(0, 4);
            // Per-YEAR precedence: a manual cumulative-to-today % the user pinned
            // for THIS expense's year (Settings) wins; otherwise fall back to the
            // auto World-Bank CPI factor for the currency. Setting one year does
            // NOT disable auto for the currency's other years.
            const manualPct = manualRates[c] && manualRates[c]![y] ? manualRates[c]![y]!.inflationPct : undefined;
            if (Number.isFinite(manualPct)) return 1 + (manualPct as number) / 100;
            if (!_autoFactorByCur[c]) _autoFactorByCur[c] = makeInflationFactor(cpiCache[c]);
            return _autoFactorByCur[c]!(date);
        };
        // Manual per-year exchange rate (1 unit of `cur` in home units) for a
        // given year, or null. Used for BOTH the at-trip historical FX and the
        // worth-today current-year FX, taking precedence over the auto rates.
        const manualFxFor = (cur: string, year: string | number): number | null => {
            const c = (cur || 'EUR').toUpperCase();
            if (c === targetCurr) return 1;
            const r = manualRates[c] && manualRates[c]![String(year)];
            return r && Number.isFinite(r.fx) && (r.fx as number) > 0 ? (r.fx as number) : null;
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
            const curUp = (e.currency || 'EUR').toUpperCase();
            const eYear = (e.date || '').slice(0, 4);
            const k = `${e.date}_${e.currency}_EUR`;
            const hk = `${e.date}_${targetCurr}_EUR`;
            const histForeign = rateCache ? rateCache[k] : undefined;
            const histHome = targetCurr === 'EUR' ? 1 : (rateCache ? rateCache[hk] : undefined);
            const manualSpentFx = manualFxFor(curUp, eYear);
            let spentHome: number;
            if (manualSpentFx != null) {
                // Manual per-year rate (Settings → Personalization) overrides the
                // historical FX for this expense's year (and is 1 for the home
                // currency itself). User-pinned rate beats the auto Frankfurter one.
                spentHome = e.value * manualSpentFx;
            } else if (histForeign && histHome) {
                const euroVal = e.value * histForeign;
                spentHome = targetCurr === 'EUR' ? euroVal : euroVal / histHome;
            } else {
                // C1: `??` (not `||`) — a frozen euroValue of 0 is respected
                // as €0, not re-converted 1:1 from the raw foreign value.
                const euroVal = e.euroValue ?? convertCurrency(e.value, e.currency, 'EUR');
                spentHome = targetCurr === 'EUR' ? euroVal : convertCurrency(euroVal, 'EUR', targetCurr);
            }
            // "Worth today" = the foreign amount converted at TODAY'S FX,
            // grown by that currency's OWN inflation since the expense's year
            // — UNLESS the user set a manual override for this currency, in
            // which case we use their numbers (original amount × their rate ×
            // (1 + their inflation%)). `at_trip` (Spent) stays the at-the-time
            // cost (historical FX, no inflation). User feedback: current FX is
            // the right lens for "what's it worth now", and inflation is
            // per-currency — not one home-region figure for every currency.
            // This unifies the auto path with the manual-override formula.
            let displayValue: number;
            if (mode === 'today') {
                const ov = tripOverrides[curUp];
                // IA-1: only trust an override whose numbers are actually finite.
                // A corrupt/hand-edited localStorage entry (NaN, Infinity, string)
                // would otherwise turn displayValue into NaN and poison the total,
                // donut, and timeline with no recovery — validateLoadedState never
                // inspects this field. Bad override ⇒ fall back to the auto estimate.
                const ovValid = ov && Number.isFinite(ov.fxToHome) && Number.isFinite(ov.inflationPct);
                if (ovValid) {
                    displayValue = e.value * ov.fxToHome * (1 + ov.inflationPct / 100);
                } else {
                    // Current FX: a manual CURRENT-year rate (Settings) overrides
                    // the live one; the inflation factor prefers the manual annual
                    // series, else the auto CPI (both handled in inflationFactorFor).
                    const manualNowFx = manualFxFor(curUp, _curYear);
                    const currentHome = manualNowFx != null
                        ? e.value * manualNowFx
                        : convertCurrency(e.value, e.currency, targetCurr);
                    displayValue = currentHome * inflationFactorFor(curUp, e.date);
                }
            } else {
                displayValue = spentHome;
            }
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
        // IA-8 (MK3 audit): collapse category keys that resolve to the SAME
        // category before aggregating, so the donut + ranking don't render
        // two slices for e.g. "food" and "Food" (both later resolved to
        // "🍔 Food" by findCategory, double-counting the slice/label). Key by
        // the canonical id — matched by id, then case-insensitive name —
        // falling back to a trimmed-lowercase form so case-only variants of
        // an UNmatched id (imports / legacy slugs) still merge into one key.
        const canonicalCatId = (catId: string): string => {
            const raw = String(catId ?? '');
            const match =
                categories.find((c: Category) => c.id === raw) ||
                categories.find((c: Category) => c.name.toLowerCase() === raw.toLowerCase());
            return match ? match.id : raw.trim().toLowerCase();
        };
        convertedExps.forEach((e) => {
            const catKey = canonicalCatId(e.categoryId);
            catTotals[catKey] = (catTotals[catKey] || 0) + e.displayValue;
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
            const catKey = canonicalCatId(e.categoryId);
            catCounts[catKey] = (catCounts[catKey] || 0) + 1;
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
    }, [tripExps, mode, targetCurr, rateCache, cpiCache, fxOverridesByTrip, manualRates, activeTripId, categories]);

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
        // IA-9 (MK3 audit): NO #8e8e93 here — that exact gray is the "Other"
        // slice color (pushed below), so a hashed synthetic category landing
        // on it would be visually indistinguishable from the aggregate slice.
        // Widened with extra distinct hues to keep collisions rare now that
        // the gray is gone.
        const _palette = ['#0071e3', '#9b59b6', '#ff9500', '#34c759', '#ff2d55', '#5ac8fa', '#ffd60a', '#af52de', '#ff6482', '#30b0c7'];
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
            const spentHome = convertCurrency(stat.spent, 'EUR', targetCurr);
            const targetHome = convertCurrency(stat.target, 'EUR', targetCurr);
            return {
                title: budgetTitle(b),
                spentHome,
                targetHome,
                pct: stat.pct,
                color: stat.color,
                // D-4 (MK3 audit): how far PAST the target (home currency) for
                // the over-budget callout. Non-zero only when actually over.
                overHome: stat.pct > 100 ? spentHome - targetHome : 0,
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

    // IA-4 (MK3 audit): is the hero total still settling? It depends on
    // async data that arrives AFTER first paint — historical FX (rateCache)
    // in both modes, plus CPI in "today" mode. Until those land the figure
    // renders off the write-time fallback and then jumps (~12% measured), so
    // we show a "calculating…" placeholder while either is in-flight. Foreign
    // spend is the only thing that needs historical FX; an all-home-currency
    // trip in "at trip" mode is final immediately (no flicker to hide).
    // Today mode = current FX (synchronous via convertCurrency) + per-currency
    // CPI (async) → gate purely on the CPI fetches. At-trip mode = historical
    // FX (async) → gate on the rate fetch (only matters with foreign spend).
    const heroCalculating = mode === 'today'
        ? !cpiChecked
        : (hasForeignSpend && !ratesSettled);

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
        // MK2 audit fix (timeline must represent TIME): plot points on a
        // numeric (epoch-ms) x-axis so expenses that are days vs YEARS
        // apart are spaced proportionally. Pre-fix this used a CATEGORY
        // axis (one evenly-spaced slot per date) + a smoothing spline, so
        // a 2015 and a 2018 expense rendered side-by-side as if adjacent.
        // Undated expenses (the "unknown date" bucket) have no position on
        // a time axis, so they're omitted here (still counted in the
        // totals/breakdowns above).
        const sortedDates = Object.keys(dateTotals).sort();
        const includeYear = datesSpanMultipleYears(sortedDates);
        const points = sortedDates
            .map((d) => ({ x: Date.parse(`${d}T00:00:00Z`), y: dateTotals[d]! }))
            .filter((p) => Number.isFinite(p.x));
        const chart = new Chart(timeCanvasRef.current, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: targetCurr + ' ' + t(mode === 'today' ? 'insights.rateModeToday' : 'insights.rateModeAtTrip'),
                        data: points,
                        borderColor: '#0071e3',
                        backgroundColor: 'rgba(0, 113, 227, 0.1)',
                        fill: true,
                        // Straight segments between real data points — a
                        // spline would imply spend on dates that had none,
                        // misleading once points are far apart in time.
                        tension: 0,
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
                            title: (items: any[]) => {
                                const v = items && items[0] ? Number(items[0].parsed.x) : NaN;
                                if (!Number.isFinite(v)) return '';
                                return timelineDateLabel(new Date(v).toISOString().slice(0, 10), includeYear);
                            },
                            label: (ctx: any) => targetSym + formatNumberForCurrency(ctx.parsed.y, targetCurr),
                        },
                    },
                },
                scales: {
                    x: {
                        // Numeric time axis (no Chart.js date-adapter on the
                        // CDN build): x values are epoch-ms; ticks are
                        // formatted back to date labels.
                        type: 'linear',
                        grid: { display: false },
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 7,
                            callback: (value: number | string) => {
                                const v = Number(value);
                                if (!Number.isFinite(v)) return '';
                                return timelineDateLabel(new Date(v).toISOString().slice(0, 10), includeYear);
                            },
                        },
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
        // IA-5 (MK3 audit): drop the undated bucket — keyed in via
        // `e.date || t('insights.unknownDate')`, that localized sentinel has
        // no place on a date-ordered axis (pre-fix it rendered a literal
        // "Unknown" column). Keep only keys that parse as real dates.
        const realDates = Array.from(
            new Set(spendCurrencies.flatMap((c) => Object.keys(currencyDateTotals[c] || {}))),
        ).filter((d) => Number.isFinite(Date.parse(`${d}T00:00:00Z`)));
        // IA-6 (MK3 audit): bucket by PERIOD rather than plotting one bar per
        // exact date on a category axis. Per-exact-date bars spaced far-apart
        // dates EVENLY (a 2016 bar sitting next to a 2026 bar), contradicting
        // the time-proportional main timeline one card up. Honest reframe (the
        // audit's suggested option): group into YEAR buckets when the trip
        // spans multiple years, else MONTH buckets — discrete, correctly-
        // labelled "currency mix per period" bars where even spacing is the
        // right encoding (one slot per period, not per calendar day).
        const multiYear = datesSpanMultipleYears(realDates);
        const bucketKey = (iso: string) => (multiYear ? iso.slice(0, 4) : iso.slice(0, 7));
        const bucketLabel = (key: string): string => {
            if (multiYear) return key; // 'YYYY'
            const dt = new Date(`${key}-01T00:00:00Z`); // key = 'YYYY-MM'
            if (Number.isNaN(dt.getTime())) return key;
            try {
                return new Intl.DateTimeFormat(getIntlLocale(), { month: 'short', timeZone: 'UTC' }).format(dt);
            } catch { return key; }
        };
        const buckets = Array.from(new Set(realDates.map(bucketKey))).sort();
        const labels = buckets.map(bucketLabel);
        const datasets = currencyRows.map((r) => {
            const byDate = currencyDateTotals[r.code] || {};
            return {
                label: r.code,
                data: buckets.map((bk) =>
                    Object.keys(byDate)
                        .filter((d) => Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && bucketKey(d) === bk)
                        .reduce((s, d) => s + (byDate[d] || 0), 0),
                ),
                backgroundColor: r.color,
                borderWidth: 0,
            };
        });
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
    // Per-currency AUTO figures (World-Bank CPI inflation + today's FX) for
    // the currencies this trip used — powers both the info popover's numbers
    // and the manual-override panel's pre-filled inputs. Computed on demand
    // (the modals open on click), so no extra render cost.
    const computeCurrencyAutos = () => {
        const byCur: Record<string, { years: number[]; count: number }> = {};
        for (const e of tripExps) {
            const cur = (e.currency || 'EUR').toUpperCase();
            const y = Number((e.date || '').slice(0, 4));
            if (!byCur[cur]) byCur[cur] = { years: [], count: 0 };
            if (Number.isFinite(y) && y > 1900) byCur[cur].years.push(y);
            byCur[cur].count += 1;
        }
        const overrides = getTripFxOverrides(activeTripId);
        return Object.keys(byCur).sort().map((cur) => {
            const yrs = byCur[cur]!.years;
            const avgYear = yrs.length ? Math.round(yrs.reduce((a, b) => a + b, 0) / yrs.length) : new Date().getFullYear();
            // Per-currency CPI (each currency's own region), matching the main
            // calc — so the override prefill IS the auto "worth today" figure.
            const factor = makeInflationFactor(cpiCache[cur]);
            return {
                code: cur,
                autoInflationPct: Math.round((factor(`${avgYear}-06-15`) - 1) * 1000) / 10,
                // IA-3: 6 significant figures, not 4 decimals. A fixed 4dp can't
                // represent tiny-unit currencies (JPY/KRW/IDR/VND/HUF ≈ 0.005…) —
                // it rounded 1 JPY = 0.00537374 → 0.0054 (+0.79%), so saving the
                // panel UNCHANGED silently shifted the "Value today" total.
                autoFx: Number(convertCurrency(1, cur, targetCurr).toPrecision(6)),
                ov: overrides[cur],
            };
        });
    };

    // Manual-override panel: per-currency inflation % + exchange rate, pre-
    // filled with the auto figures. Only affects "Value today" (the info
    // popover links here). Settlements/budgets never read these.
    const openOverridePanel = () => {
        const autos = computeCurrencyAutos();
        const rowsHtml = autos.map((a) => `
            <div class="vt-ov-row" data-cur="${esc(a.code)}" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 0; border-bottom:1px solid var(--glass-border);">
                <span style="font-weight:800; min-width:46px; color:var(--text-brand-navy);">${esc(a.code)}</span>
                <label style="display:inline-flex; align-items:center; gap:5px; font-size:0.82rem; color:var(--text-secondary);">
                    ${t('insights.overrideInflationLabel')}
                    <input type="number" class="vt-inf" step="0.1" value="${a.ov ? a.ov.inflationPct : a.autoInflationPct}" style="width:70px; padding:5px 8px; border:1px solid var(--glass-border); border-radius:8px;">%
                </label>
                <label style="display:inline-flex; align-items:center; gap:5px; font-size:0.82rem; color:var(--text-secondary);">
                    ${t('insights.overrideRatePrefix', { cur: esc(a.code) })}
                    <input type="number" class="vt-fx" step="any" value="${a.ov ? a.ov.fxToHome : a.autoFx}" style="width:90px; padding:5px 8px; border:1px solid var(--glass-border); border-radius:8px;"> ${esc(targetCurr)}
                </label>
                <span style="font-size:0.72rem; color:var(--text-tertiary, var(--text-secondary)); margin-left:auto;">${t('insights.overrideAutoNote')}: ${a.autoInflationPct}% · 1 ${esc(a.code)} = ${a.autoFx} ${esc(targetCurr)}</span>
            </div>
        `).join('');
        const { root, close } = showModal({
            variant: 'glass',
            cardStyle: 'width: 520px; max-width: calc(100vw - 32px); padding: 26px; border-radius: 24px; background: var(--glass-bg);',
            innerHTML: `
                <h2 style="margin:0 0 6px; font-size:1.3rem; font-weight:800; color:var(--text-brand-navy); letter-spacing:-0.02em;">${t('insights.overrideTitle')}</h2>
                <p style="margin:0 0 14px; font-size:0.85rem; line-height:1.5; color:var(--text-secondary);">${t('insights.overrideIntro', { today: esc(t('insights.rateModeToday')) })}</p>
                <div style="display:flex; flex-direction:column;">${rowsHtml || `<p style="color:var(--text-secondary);">—</p>`}</div>
                <div style="display:flex; justify-content:space-between; gap:10px; margin-top:20px;">
                    <button id="vtReset" class="btn-ghost" style="padding:9px 16px; border-radius:999px;">${t('insights.overrideReset')}</button>
                    <button id="vtSave" class="btn-primary" style="padding:9px 20px; border-radius:999px;">${t('insights.overrideSave')}</button>
                </div>
            `,
        });
        (root.querySelector('#vtSave') as HTMLButtonElement | null)?.addEventListener('click', () => {
            root.querySelectorAll('.vt-ov-row').forEach((rowEl) => {
                const cur = (rowEl as HTMLElement).dataset.cur || '';
                const inf = parseFloat((rowEl.querySelector('.vt-inf') as HTMLInputElement).value);
                const fx = parseFloat((rowEl.querySelector('.vt-fx') as HTMLInputElement).value);
                if (cur && Number.isFinite(inf) && Number.isFinite(fx) && fx > 0) {
                    setTripFxOverride(activeTripId, cur, { inflationPct: inf, fxToHome: fx });
                }
            });
            close();
        });
        (root.querySelector('#vtReset') as HTMLButtonElement | null)?.addEventListener('click', () => {
            clearTripFxOverrides(activeTripId);
            close();
        });
    };

    // ⓘ explainer. In "Worth today" mode it explains the inflation + FX
    // logic and offers the manual-override link; otherwise the original
    // Spent-vs-Worth-today explanation.
    const openRateModeInfo = () => {
        if (mode === 'today') {
            const autos = computeCurrencyAutos();
            const repInflation = autos.length ? Math.max(...autos.map((a) => a.autoInflationPct), 0) : 0;
            const { root, close } = showModal({
                variant: 'glass',
                cardStyle: 'width: 480px; max-width: calc(100vw - 32px); padding: 26px; border-radius: 24px; background: var(--glass-bg);',
                innerHTML: `
                    <h2 style="margin:0 0 14px; font-size:1.3rem; font-weight:800; color:var(--text-brand-navy); letter-spacing:-0.02em;">${t('insights.valueTodayInfoTitle')}</h2>
                    <div style="display:flex; flex-direction:column; gap:11px; font-size:0.92rem; line-height:1.55; color:var(--text-brand-navy);">
                        <p style="margin:0;">${t('insights.valueTodayInfoIntro', { spent: esc(t('insights.rateModeAtTrip')), today: esc(t('insights.rateModeToday')) })}</p>
                        <p style="margin:0;">${t('insights.valueTodayInfoInflation', { pct: String(repInflation) })}</p>
                        <p style="margin:4px 0 0; font-size:0.82rem; color:var(--text-secondary);">${t('insights.valueTodayInfoSources')}</p>
                        <p style="margin:4px 0 0; font-size:0.82rem; color:var(--text-secondary);">${t('insights.valueTodayInfoOldRates')}</p>
                        <p style="margin:8px 0 0; font-size:0.85rem;"><a id="vtSettingsLink" href="#" style="color:var(--accent-blue); font-weight:700; text-decoration:none; cursor:pointer;">${t('insights.valueTodaySettingsCta')}</a></p>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:20px; flex-wrap:wrap;">
                        <button id="vtManual" class="btn-ghost" style="padding:9px 16px; border-radius:999px; font-weight:700; color:var(--accent-blue);">${t('insights.valueTodayManualCta')}</button>
                        <button id="rateInfoClose" class="btn-primary" style="padding:9px 20px; border-radius:999px;">${t('common.close')}</button>
                    </div>
                `,
            });
            (root.querySelector('#rateInfoClose') as HTMLButtonElement | null)?.addEventListener('click', close);
            (root.querySelector('#vtManual') as HTMLButtonElement | null)?.addEventListener('click', () => { close(); openOverridePanel(); });
            // Deep-link to the global per-year rate editor in Settings →
            // Personalization, then scroll it into view once that page mounts.
            (root.querySelector('#vtSettingsLink') as HTMLAnchorElement | null)?.addEventListener('click', (ev) => {
                ev.preventDefault();
                close();
                // Defer the nav until AFTER the modal's close() history.back()
                // popstate fires — otherwise that back() reverts the navigate and
                // we'd stay on #expenses. Then scroll the editor into view once
                // the Personalization page has mounted.
                setTimeout(() => {
                    navigate('personalization');
                    setTimeout(() => document.getElementById('customRates')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
                }, 80);
            });
            return;
        }
        const { root, close } = showModal({
            variant: 'glass',
            cardStyle: 'width: 460px; max-width: calc(100vw - 32px); padding: 26px; border-radius: 24px; background: var(--glass-bg);',
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
                        {/* IA-4: hold a "calculating…" placeholder until the
                            async FX/CPI inputs land, so the headline never
                            shows a number that's about to jump. */}
                        {heroCalculating ? (
                            <h1 className="hero-stat-card__value" style={{ opacity: 0.55 }}>
                                {t('insights.calculating')}
                            </h1>
                        ) : (
                            <>
                                <h1 className="hero-stat-card__value">
                                    {targetSym}
                                    {formatNumberForCurrency(totalDisplay, targetCurr)}
                                </h1>
                                <span className="hero-stat-card__currency">{targetCurr}</span>
                            </>
                        )}
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
                                {/* D-4: the bar caps at 100%, so an overspend is
                                    otherwise invisible beyond the colour flip — spell
                                    out how far over the target the spend went. */}
                                {b.overHome > 0 ? (
                                    <div className="text-[0.75rem] font-bold mt-1" style={{ color: '#ff3b30' }}>
                                        {t('insights.budgetOverBy', { amount: targetSym + formatNumberForCurrency(b.overHome, targetCurr) })}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                    {/* D-3: budgets are NOMINAL — original amounts vs amount spent,
                        never inflation-/FX-re-adjusted (unlike the figures above).
                        On a non-EUR home this stops the same "food spend" reading
                        two different numbers on one page with no explanation. */}
                    <p className="text-secondary text-[0.72rem] mt-4 italic">{t('insights.budgetBasisNote')}</p>
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

