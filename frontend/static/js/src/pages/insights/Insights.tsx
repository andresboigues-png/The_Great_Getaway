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

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadChartJs } from '../../utils/lazyCdn.js';
import { useStore } from '../../react/store.js';
import { useActiveTrip } from '../../react/TripContext.js';
import { useNavigate } from '../../react/useNavigate.js';
import { STATE, emit } from '../../state.js';
import { EVENTS, CURRENCY_SYMBOLS, CURRENCY_TO_CPI_COUNTRY } from '../../constants.js';
import { convertCurrency, hasRate } from '../../utils/currency.js';
import { fetchHistoricalRates, fetchCpiSeries } from '../../api.js';
import { getTripFxOverrides } from '../../utils/fxOverrides.js';
import { requestPersonalizationTab } from '../../utils/persTab.js';
import { makeInflationFactor, makePresentValueCalc } from '../../utils/presentValue.js';
import { getIntlLocale, formatNumber, formatNumberForCurrency, formatShortMonthDay } from '../../i18n.js';
import { getHomeCurrency, currencySymbol } from '../../utils.js';
import { isDarkMode } from '../../theme.js';
import { computeTripBalances } from '../settlement/balances.js';
import { budgetStatus, budgetTitle } from '../budgets/helpers.js';
import { EmptyState } from '../../react/components/EmptyState.js';
import type { Expense, Category } from '../../types';
import type { TooltipItem, Plugin } from 'chart.js';
import { t } from '../../i18n.js';
import { openNewTripModal } from '../../modals.js';
import { showModal } from '../../components/Modal.js';
import { iconSvg, iconForCategory } from '../../icons.js';
import { esc } from '../../utils.js';

// Chart is loaded via CDN in index.html and declared as a global in types.d.ts.

// (The old PieTooltipCtx shape is gone with the donut tooltips — the pies
// have no on-canvas labels now; the right-side rows cross-highlight instead.)

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
    /** The two legs, kept on every row so the "more expensive / cheaper than
     *  you paid" comparison can sum both regardless of the active mode.
     *  spentValue = at-the-time home cost; todayValue = cost to do it today. */
    spentValue: number;
    todayValue: number;
    /** today's-FX leg before inflation — drives the hero's FX-vs-inflation split. */
    todayValueNoInflation: number;
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
    return formatShortMonthDay(dt, includeYear);
}

// Donut/legend slice colours (distinct hues; the list dot mirrors the slice).
const DASH_PALETTE = ['#0071e3', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#ff6482', '#30b0c7', '#a2845e', '#bf5af2', '#ff9f0a'];

/** Soft per-slice halo shared by every Insights donut: pre-draw each arc with
 *  its own colour as a canvas shadow, so a coloured glow bleeds out behind the
 *  crisp slice Chart.js paints on top. Pair with `layout.padding` on the chart
 *  so the halo isn't clipped by the canvas edge. */
const DONUT_GLOW: Plugin<'doughnut'> = {
    id: 'ggDonutGlow',
    beforeDatasetsDraw(c) {
        const meta = c.getDatasetMeta(0);
        const bg = (c.data.datasets[0]?.backgroundColor as string[]) || [];
        if (!meta?.data) return;
        const ctx = c.ctx;
        ctx.save();
        meta.data.forEach((arc, i) => {
            ctx.shadowColor = bg[i] ?? 'rgba(0,113,227,0.5)';
            ctx.shadowBlur = 10;
            (arc as unknown as { draw: (x: CanvasRenderingContext2D) => void }).draw(ctx);
        });
        ctx.restore();
    },
};

/** rgba() of a #rrggbb colour at the given alpha — donut hover dimming. */
const dimHex = (hex: string, alpha: number): string => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const n = parseInt(m[1]!, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

/** GG-styled dropdown replacing the native <select>s on Insights — mirrors
 *  the navbar trip picker: blue-bordered pill trigger + white panel with a
 *  check on the selected row. Outside-click + Escape close. */
function GGSelect({
    value,
    options,
    onChange,
    ariaLabel,
}: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (v: string) => void;
    ariaLabel?: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    const cur = options.find((o) => o.value === value) ?? options[0];
    return (
        <div ref={rootRef} style={{ position: 'relative' }}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1.5"
                style={{
                    border: '1.5px solid var(--accent-blue, #0071e3)',
                    color: 'var(--accent-blue, #0071e3)',
                    background: 'transparent',
                    borderRadius: 999,
                    padding: '4px 12px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                }}
            >
                <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur?.label}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>
            {open ? (
                <div
                    role="listbox"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        right: 0,
                        zIndex: 70,
                        minWidth: 190,
                        background: 'white',
                        border: '1px solid rgba(0,45,91,0.12)',
                        borderRadius: 14,
                        boxShadow: '0 14px 34px rgba(0,45,91,0.16)',
                        padding: 4,
                        maxHeight: 280,
                        overflow: 'auto',
                    }}
                >
                    {options.map((o) => {
                        const sel = o.value === value;
                        return (
                            <button
                                key={o.value}
                                type="button"
                                role="option"
                                aria-selected={sel}
                                onClick={() => {
                                    onChange(o.value);
                                    setOpen(false);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    width: '100%',
                                    textAlign: 'left',
                                    border: 0,
                                    cursor: 'pointer',
                                    padding: '8px 10px',
                                    borderRadius: 9,
                                    font: 'inherit',
                                    fontSize: '0.84rem',
                                    fontWeight: sel ? 800 : 600,
                                    color: '#002d5b',
                                    background: sel ? 'rgba(0,113,227,0.1)' : 'transparent',
                                }}
                            >
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                                {sel ? (
                                    <span style={{ display: 'inline-flex', color: 'var(--accent-blue, #0071e3)' }} dangerouslySetInnerHTML={{ __html: iconSvg('check', { size: 14 }) }} />
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}

/** iOS-style segmented control: a white "lens" slides + resizes under the
 *  active segment. Segments are CONTENT-sized (so unequal-length labels never
 *  overflow), and the lens is MEASURED off the active button so it always fits
 *  the text exactly. Re-measures on selection change and on container resize. */
function SegmentedControl<T extends string>({ options, value, onChange, ariaLabel }: {
    options: ReadonlyArray<{ value: T; label: string }>;
    value: T;
    onChange: (v: T) => void;
    ariaLabel?: string;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [lens, setLens] = useState<{ left: number; width: number } | null>(null);
    useLayoutEffect(() => {
        const measure = () => {
            const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
            if (el) setLens({ left: el.offsetLeft, width: el.offsetWidth });
        };
        measure();
        const node = ref.current;
        if (!node || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(node);
        return () => ro.disconnect();
    }, [value, options]);
    return (
        <div ref={ref} role="tablist" aria-label={ariaLabel} className="seg-control">
            {lens ? <div aria-hidden="true" className="seg-lens" style={{ left: lens.left, width: lens.width }} /> : null}
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-active={active}
                        onClick={() => onChange(o.value)}
                        className="seg-btn"
                        style={{ fontWeight: active ? 700 : 500, color: active ? 'var(--text-brand-navy)' : 'var(--text-secondary)' }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

// MAX_INFLATION_FACTOR + makeInflationFactor now live in utils/presentValue
// (pure + unit-tested) and are imported above. makeInflationFactor is still
// used directly by computeCurrencyAutos below (override-panel pre-fill).

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
    // B7-I4: read trips + budgets through useStore selectors (not STATE.*
    // directly). Today every mutation emits state:changed so a direct read
    // would still repaint, but routing through the store makes the netBalances
    // + tripBudgets derivations resilient if a future mutation ever emits a
    // narrower event — same contract as every other slice on this page.
    const trips = useStore((s) => s.trips);
    const budgets = useStore((s) => s.budgets);
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
    // Has the CPI fetch settled (resolved or failed)? Gates the
    // "no inflation data" note so it doesn't flash during the initial
    // load before the World Bank series lands.
    const [cpiChecked, setCpiChecked] = useState(false);
    // MK1 Wave F (T2-6): chart.js loads on-demand now (it was a
    // parser-blocking <head> tag paid by every page although only
    // Insights uses it). Chart effects bail until the global exists.
    const [chartLibReady, setChartLibReady] = useState(
        () => typeof (window as { Chart?: unknown }).Chart !== 'undefined'
    );
    useEffect(() => {
        if (chartLibReady) return;
        let cancelled = false;
        void loadChartJs().then(
            () => {
                if (!cancelled) setChartLibReady(true);
            },
            () => {
                /* CDN failure — charts stay absent; tables still render. */
            }
        );
        return () => {
            cancelled = true;
        };
    }, [chartLibReady]);
    // IA-4 (MK3 audit): has the historical-FX fetch for THIS trip's dates
    // settled? The hero total leans on rateCache; until it lands, spentHome
    // falls back to the write-time euroValue and the figure renders ~12% off,
    // then visibly jumps. We show a "calculating…" placeholder until this is
    // true so the headline never displays a number that's about to move.
    const [ratesSettled, setRatesSettled] = useState(false);

    // ── Dashboard controls (sort / filter / dimension toggles) ────────────
    // Spenders dashboard: how to order the list.
    const [spenderSort, setSpenderSort] = useState<'amount_desc' | 'amount_asc' | 'count_desc' | 'name_asc'>('amount_desc');
    // Spenders is ALWAYS per-companion. The dimension is a SECONDARY breakdown
    // of each companion's spend: 'general' = their plain total (the original
    // view); category/country/currency split each companion's bar by that
    // dimension so you can see what each person spent across categories, etc.
    const [spenderDim, setSpenderDim] = useState<'general' | 'category' | 'country' | 'currency'>('general');
    // "Budget vs spent" card — hidden by default behind a gold pill (mirrors the
    // budgets page's collapsible summary).
    const [showBudgetVs, setShowBudgetVs] = useState(false);
    const [showSettle, setShowSettle] = useState(false);
    // Avg-per-day dashboard: narrow the average to one payer / category.
    const [avgWho, setAvgWho] = useState<string>('all');
    const [avgCat, setAvgCat] = useState<string>('all');
    // "Expenses per…" dashboard: which dimension to group by + which metric.
    const [perDim, setPerDim] = useState<'category' | 'country' | 'currency'>('category');
    const [perMetric, setPerMetric] = useState<'value' | 'count'>('value');

    // ── Empty states are rendered AFTER all hooks (see the guarded returns
    //    just before the main return below). react-hooks/rules-of-hooks: hooks
    //    must run in the same order every render, so we never `return` before a
    //    hook. Every derived const below no-ops safely on absent/empty data.

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
        void fetchHistoricalRates(uniqueDates).finally(() => {
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
        // B7-I3: only drop the gate when a needed, CPI-mappable currency is not
        // yet in the cache. `cur in cpiCache` records an ATTEMPT (even empty), and
        // an un-mappable currency never enters the cache at all, so gating on
        // "mapped-but-absent" means an unrelated expense edit — where every needed
        // series is already cached — no longer reverts the headline to
        // "Calculating…". If nothing's missing we skip the reset and keep
        // cpiChecked true; the fetches below are dedupe no-ops.
        const anyMappedMissing = curs.some(
            (c) => c in CURRENCY_TO_CPI_COUNTRY && !(c in STATE.cpiCache),
        );
        if (anyMappedMissing) setCpiChecked(false);
        // PV-S1: release the hero gate when the fetches settle OR after ~4s,
        // whichever comes first — one slow/empty World-Bank endpoint (Taiwan
        // ~10s) must not freeze "Worth today". Late CPIs still refine the figure
        // as they land (cpiCache is a useStore dep).
        let released = false;
        const release = () => { if (!released) { released = true; setCpiChecked(true); } };
        void Promise.allSettled(curs.map((c) => fetchCpiSeries(c))).then(release);
        const timer = setTimeout(release, 4000);
        return () => clearTimeout(timer);
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
    // B3-I5: the 4s gate can release the hero while a slow World-Bank endpoint is
    // still in flight, so a multi-currency trip can paint a "final" figure that's
    // still missing some inflation factors and then silently refine. Detect that
    // window — gate released (cpiChecked) but a needed, CPI-mappable currency
    // hasn't landed in the cache yet — so the hero can carry a quiet "still
    // updating" note. This reads the live useStore cpiCache, so it clears itself
    // as the late series arrive. Only relevant in "today" mode (the only mode CPI
    // feeds); at-trip never inflates.
    const cpiStillUpdating = cpiChecked && mode === 'today' && Array.from(new Set([
        targetCurr.toUpperCase(),
        ...tripExps.map((e: Expense) => (e.currency || 'EUR').toUpperCase()),
    ])).some((c) => c in CURRENCY_TO_CPI_COUNTRY && !(c in cpiCache));

    // B3-I1 + B3-I2 shared input: this trip's per-trip FX overrides (empty if none).
    const tripFxOverridesActive = (activeTripId && fxOverridesByTrip[activeTripId]) || {};

    // B3-I2: cpiUnavailable above checks ONLY the home currency, so a foreign
    // leg can silently lose ITS OWN inflation with no signal — e.g. a 2018
    // Argentina trip where ARS has no live FX (→ Model B applies HOME CPI,
    // ignoring 300%+ local inflation), or a currency whose World-Bank CPI
    // series never landed (→ factor 1, no inflation at all). List the FOREIGN
    // currencies whose local inflation is being dropped in "today" mode, once
    // the CPI fetch has settled (cpiChecked). A per-trip override or a
    // user-pinned manual inflation % supplies a real figure, so those aren't
    // flagged. Empty in "at trip" mode (no inflation is applied there at all).
    const inflationFallbackCurrencies = (cpiChecked && mode === 'today')
        ? Array.from(new Set(tripExps.map((e: Expense) => (e.currency || 'EUR').toUpperCase())))
            .filter((c) => c !== targetCurr.toUpperCase())
            .filter((c) => {
                if (tripFxOverridesActive[c]) return false;
                const noFx = !hasRate(c);
                const series = cpiCache[c];
                const noCpi = !(series && Object.keys(series).length > 0);
                // Model B (no FX) drops local inflation; factor-1 (FX but no CPI
                // series) applies none. Either way the currency's OWN inflation
                // is silently ignored. If it has both FX and a CPI series it's fine.
                if (!noFx && !noCpi) return false;
                // A user-pinned manual inflation % (any year) is an explicit
                // choice, not a silent auto fallback — don't warn about it.
                const manualInfl = manualRates[c] && Object.values(manualRates[c]!)
                    .some((r) => Number.isFinite(r?.inflationPct));
                return !manualInfl;
            })
            .sort()
        : [];

    // B3-I1: manualRates + per-trip fxOverridesByTrip persist ONLY in this
    // device's localStorage (and CPI/FX caches are client-side), so two
    // companions on one trip can see different "Worth today" totals. Flag when a
    // manual override is actually shaping THIS trip's figure — a per-trip FX
    // override, or a global manual rate for a currency this trip used — so the
    // hero can note the number is device-specific. Only in "today" mode
    // (overrides never touch the at-trip "Spent" leg).
    const worthTodayIsDeviceLocal = mode === 'today' && (
        Object.keys(tripFxOverridesActive).length > 0 ||
        Array.from(new Set(tripExps.map((e: Expense) => (e.currency || 'EUR').toUpperCase())))
            .some((c) => manualRates[c] && Object.keys(manualRates[c]!).length > 0)
    );

    const {
        totalDisplay,
        totalSpent,
        totalToday,
        totalTodayNoInfl,
        totalCount,
        highestExpense,
        convertedExps,
        dateTotals,
        currencyHomeTotals,
        currencyOwnTotals,
        currencyDateTotals,
        currencySpentTotals,
        currencyTodayTotals,
        currencyTodayNoInflTotals,
    } = useMemo(() => {
        // F2 — per-currency manual overrides for "Value today". When the
        // user has set their own inflation %/exchange-rate for a currency,
        // it REPLACES the auto CPI+historical-FX estimate for that currency
        // in `today` mode (uppercase-keyed). `at_trip` (Spent) is always the
        // at-the-time figure and ignores overrides.
        // activeTripId can be null here now (the calc runs before the empty-state
        // returns below); fall back to no overrides in that case.
        const tripOverrides = (activeTripId && fxOverridesByTrip[activeTripId]) || {};
        // ── Per-expense present value (Spent + Worth today) ───────────────
        // The pure money math lives in utils/presentValue (unit-tested). We bind
        // a calculator to the live caches + this trip's overrides, then map it
        // over the expenses. BOTH legs are computed for every expense so the
        // "pricier / cheaper than you paid" comparison works in either mode.
        const _curYear = new Date().getFullYear();
        const pvCalc = makePresentValueCalc({
            homeCurrency: targetCurr,
            currentYear: _curYear,
            rateCache,
            cpiCache,
            manualRates,
            tripOverrides,
            convert: convertCurrency,
            hasRate,
        });

        const convertedExps: ConvertedExpense[] = tripExps.map((e: Expense) => {
            const { spentValue, todayValue, todayValueNoInflation } = pvCalc(e);
            const displayValue = mode === 'today' ? todayValue : spentValue;
            return { ...e, displayValue, spentValue, todayValue, todayValueNoInflation };
        });

        const totalDisplay = convertedExps.reduce((sum, e) => sum + e.displayValue, 0);
        // Both legs summed so the hero can show "X% pricier / cheaper to do today".
        const totalSpent = convertedExps.reduce((sum, e) => sum + e.spentValue, 0);
        const totalToday = convertedExps.reduce((sum, e) => sum + e.todayValue, 0);
        // Same sum WITHOUT inflation (today's FX only) — the midpoint of the
        // spent → FX → inflation bridge the hero breakdown shows.
        const totalTodayNoInfl = convertedExps.reduce((sum, e) => sum + e.todayValueNoInflation, 0);
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

        const dateTotals: Record<string, number> = {};
        // Per-original-currency aggregates for the currency breakdown:
        //  - home-equivalent total (donut share + list "≈ home" column)
        //  - own-currency total (list "what you actually spent" column)
        //  - home-equiv per date per currency (the stacked timeline)
        const currencyHomeTotals: Record<string, number> = {};
        const currencyOwnTotals: Record<string, number> = {};
        const currencyDateTotals: Record<string, Record<string, number>> = {};
        // Per-currency "worth today" legs, so the breakdown can show each
        // currency's OWN FX move + inflation (not just the blended headline).
        const currencySpentTotals: Record<string, number> = {};
        const currencyTodayTotals: Record<string, number> = {};
        const currencyTodayNoInflTotals: Record<string, number> = {};
        convertedExps.forEach((e) => {
            const d = e.date || t('insights.unknownDate');
            dateTotals[d] = (dateTotals[d] || 0) + e.displayValue;
            const cur = (e.currency || 'EUR').toUpperCase();
            currencyHomeTotals[cur] = (currencyHomeTotals[cur] || 0) + e.displayValue;
            currencyOwnTotals[cur] = (currencyOwnTotals[cur] || 0) + e.value;
            currencySpentTotals[cur] = (currencySpentTotals[cur] || 0) + e.spentValue;
            currencyTodayTotals[cur] = (currencyTodayTotals[cur] || 0) + e.todayValue;
            currencyTodayNoInflTotals[cur] = (currencyTodayNoInflTotals[cur] || 0) + e.todayValueNoInflation;
            if (!currencyDateTotals[cur]) currencyDateTotals[cur] = {};
            currencyDateTotals[cur][d] = (currencyDateTotals[cur][d] || 0) + e.displayValue;
        });

        return {
            totalDisplay,
            totalSpent,
            totalToday,
            totalTodayNoInfl,
            totalCount,
            highestExpense,
            convertedExps,
            dateTotals,
            currencyHomeTotals,
            currencyOwnTotals,
            currencyDateTotals,
            currencySpentTotals,
            currencyTodayTotals,
            currencyTodayNoInflTotals,
        };
    }, [tripExps, mode, targetCurr, rateCache, cpiCache, fxOverridesByTrip, manualRates, activeTripId, categories]);

    // (no-expenses empty state moved below the hooks — see main return)

    // Resolve a category by id, falling back to a case-insensitive NAME
    // match — so name-string categoryIds from imports / legacy / external
    // writes (e.g. 'food') resolve to the real "Food" category instead of
    // collapsing the whole by-category view to "Unknown" (audit BUG).
    // NB: no `icon` field — the category glyph is never read off this result
    // (only name / color / id are), so the emoji-strip drops it rather than
    // carrying a dead '🏷️' literal that would never render.
    const findCategory = (catId: string): { id: string; name: string; color: string; icon?: string } => {
        const match =
            categories.find((c: Category) => c.id === catId) ||
            categories.find((c: Category) => c.name.toLowerCase() === String(catId).toLowerCase());
        if (match) return match;
        // T3-1: never collapse an unmatched categoryId (from imports / legacy /
        // API / seed slugs like 'flights') to a bare gray "Unknown" — show the
        // key's own name with a STABLE hashed colour so the donut + ranking
        // stay readable and consistent across renders.
        const raw = String(catId || '').trim();
        if (!raw) return { id: '', name: t('insights.unknownCategory'), color: '#8e8e93' };
        // IA-9 (MK3 audit): NO #8e8e93 here — that exact gray is the "Other"
        // slice color (pushed below), so a hashed synthetic category landing
        // on it would be visually indistinguishable from the aggregate slice.
        // Widened with extra distinct hues to keep collisions rare now that
        // the gray is gone.
        const _palette = ['#0071e3', '#9b59b6', '#ff9500', '#34c759', '#ff2d55', '#5ac8fa', '#ffd60a', '#af52de', '#ff6482', '#30b0c7'];
        let h = 0;
        for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
        return { id: raw, name: raw.charAt(0).toUpperCase() + raw.slice(1), color: _palette[h % _palette.length]! };
    };

    // ── Spenders dashboard: per-person spend + count, ordered by the chosen sort.
    const spenderRows = useMemo(() => {
        // Primary axis = companion (who). When a secondary dimension is active,
        // each companion also carries a per-dimension breakdown (`seg`) so the
        // bar can split into what THAT person spent per category/country/currency.
        const byWho: Record<string, { name: string; value: number; count: number; seg: Record<string, number> }> = {};
        const catColorOf: Record<string, string> = {};
        const allKeys = new Set<string>();
        for (const e of convertedExps) {
            const who = e.who || '—';
            if (!byWho[who]) byWho[who] = { name: who, value: 0, count: 0, seg: {} };
            const row = byWho[who]!;
            row.value += e.displayValue;
            row.count += 1;
            if (spenderDim !== 'general') {
                let k: string;
                if (spenderDim === 'category') { const c = findCategory(e.categoryId); k = c.name; catColorOf[k] = c.color; }
                else if (spenderDim === 'country') { k = e.country || '—'; }
                else { k = (e.currency || 'EUR').toUpperCase(); }
                row.seg[k] = (row.seg[k] || 0) + e.displayValue;
                allKeys.add(k);
            }
        }
        // Stable colour per dimension value — category keeps its own colour;
        // country/currency get a palette colour by sorted position — so the same
        // value reads the same across every companion's bar AND the shared legend.
        const colorOf: Record<string, string> = {};
        [...allKeys].sort().forEach((k, i) => { colorOf[k] = catColorOf[k] || DASH_PALETTE[i % DASH_PALETTE.length] || '#0071e3'; });
        const rows = Object.values(byWho).map((r) => ({
            name: r.name,
            value: r.value,
            count: r.count,
            segs: Object.entries(r.seg)
                .map(([label, value]) => ({ label, value, color: colorOf[label] || '#0071e3' }))
                .sort((a, b) => b.value - a.value),
        }));
        // STABLE slice colour by spend-order (value desc), so a person keeps
        // the same hue across sort/metric switches — mirrors perRows.
        const spendOrder = [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
        const sliceColorOf = new Map<string, string>();
        spendOrder.forEach((r, i) => sliceColorOf.set(r.name, DASH_PALETTE[i % DASH_PALETTE.length] ?? '#0071e3'));
        rows.sort((a, b) => {
            if (spenderSort === 'amount_asc') return a.value - b.value;
            if (spenderSort === 'count_desc') return b.count - a.count || b.value - a.value;
            if (spenderSort === 'name_asc') return a.name.localeCompare(b.name);
            return b.value - a.value;
        });
        return rows.map((r) => ({ ...r, sliceColor: sliceColorOf.get(r.name) ?? '#0071e3' }));
    }, [convertedExps, spenderSort, spenderDim]);

    // Shared legend for the secondary dimension (unique value → colour across
    // all companions). Empty for 'general'.
    const spenderLegend = useMemo(() => {
        if (spenderDim === 'general') return [] as { label: string; color: string }[];
        const seen = new Map<string, string>();
        for (const r of spenderRows) for (const s of r.segs) if (!seen.has(s.label)) seen.set(s.label, s.color);
        return [...seen.entries()].map(([label, color]) => ({ label, color }));
    }, [spenderRows, spenderDim]);

    // ── Avg-per-day dashboard: average over the days that actually had spend,
    // past + dated only (same window as before), now narrowable by payer/category.
    const avgDailyData = useMemo(() => {
        const todayIso = new Date().toISOString().slice(0, 10);
        const byDay: Record<string, number> = {};
        let total = 0;
        for (const e of convertedExps) {
            if (avgWho !== 'all' && (e.who || '—') !== avgWho) continue;
            // Match the SAME key the catOptions dropdown emits (`c.id || c.name`)
            // — otherwise an uncategorized expense (id '') never equals its own
            // 'Unknown' option value and every such row is silently skipped.
            if (avgCat !== 'all') {
                const c = findCategory(e.categoryId);
                if ((c.id || c.name) !== avgCat) continue;
            }
            if (!e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || e.date > todayIso) continue;
            byDay[e.date] = (byDay[e.date] || 0) + e.displayValue;
            total += e.displayValue;
        }
        const days = Object.keys(byDay).length;
        return { avg: total / (days || 1), days };
    }, [convertedExps, avgWho, avgCat]);

    // ── "Expenses per…" dashboard: group by the chosen dimension; each group
    // carries value AND count so the metric pill can switch between them.
    const perRows = useMemo(() => {
        const m: Record<string, { label: string; value: number; count: number; color: string; icon?: string }> = {};
        for (const e of convertedExps) {
            let key: string;
            let label: string;
            let color = '#0071e3';
            let icon: string | undefined;
            // B7-I1: bucket no-country expenses under a labeled "No country"
            // slice instead of silently dropping them (which understated the
            // trip while the Spenders "by country" breakdown still counted the
            // same rows under '—'). Now both surfaces agree; a footnote below
            // explains the bucket for auditability.
            if (perDim === 'country') { key = e.country || '__nocountry__'; label = e.country || t('insights.perNoCountry'); }
            else if (perDim === 'currency') { key = (e.currency || 'EUR').toUpperCase(); label = key; }
            else { const c = findCategory(e.categoryId); key = c.id || c.name; label = c.name; color = c.color; icon = c.icon; }
            if (!m[key]) m[key] = { label, value: 0, count: 0, color, ...(icon ? { icon } : {}) };
            m[key]!.value += e.displayValue;
            m[key]!.count += 1;
        }
        const all = Object.values(m);
        const totalVal = all.reduce((sm, r) => sm + r.value, 0);
        const totalCnt = all.reduce((sm, r) => sm + r.count, 0);
        // STABLE slice colour: assign the palette by spend-order (value desc,
        // label tiebreak) BEFORE the metric sort, so a category keeps the same
        // hue when the user flips Spent ↔ Transactions — the donut + row icon
        // + bar all read as one identity.
        const byValue = [...all].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
        const sliceColorOf = new Map<string, string>();
        byValue.forEach((r, i) => sliceColorOf.set(r.label, DASH_PALETTE[i % DASH_PALETTE.length] ?? '#0071e3'));
        all.sort((a, b) => (perMetric === 'count' ? b.count - a.count || b.value - a.value : b.value - a.value));
        return {
            rows: all.slice(0, 14).map((r) => ({ ...r, sliceColor: sliceColorOf.get(r.label) ?? '#0071e3' })),
            totalVal,
            totalCnt,
        };
    }, [convertedExps, perDim, perMetric]);

    // Filter-dropdown option lists (payers + categories actually present).
    const payerOptions = useMemo(
        () => Array.from(new Set(convertedExps.map((e) => e.who || '—'))).sort(),
        [convertedExps],
    );
    const catOptions = useMemo(() => {
        const m = new Map<string, string>();
        for (const e of convertedExps) {
            const c = findCategory(e.categoryId);
            const id = c.id || c.name;
            if (!m.has(id)) m.set(id, c.name);
        }
        return Array.from(m.entries()).map(([id, label]) => ({ id, label }));
    }, [convertedExps]);

    // Net balances (who owes whom) — reuses the settlement engine (splits +
    // settlements), shown in the home currency. Hidden when everyone's even.
    const activeTrip = trips.find((tr) => tr.id === activeTripId);
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
    const tripBudgets = (budgets || [])
        .filter((b) => b.tripId === activeTripId || b.tripId === 'all')
        .map((b) => {
            const stat = budgetStatus(b);
            const spentHome = convertCurrency(stat.spent, 'EUR', targetCurr);
            const targetHome = convertCurrency(stat.target, 'EUR', targetCurr);
            return {
                title: budgetTitle(b, false), // current-trip only → drop the trip name
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
    // PV-UX1/UX2: widened to 12 distinct hues (was 8) and the gray is reserved
    // for the aggregated "Other" bucket only, so chart colours don't collide
    // until well past the top-N cap below.
    const CURRENCY_PALETTE = ['#0071e3', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#ffcc00', '#ff6482', '#30b0c7', '#a2845e', '#bf5af2', '#ff9f0a'];
    const CURRENCY_OTHER_COLOR = '#8e8e93';
    const currencyColor = (i: number) => CURRENCY_PALETTE[i % CURRENCY_PALETTE.length] ?? CURRENCY_OTHER_COLOR;
    // Full per-currency list (sorted by home-equiv spend desc) — powers the
    // breakdown LIST, which stays readable at any currency count.
    const currencyRows = spendCurrencies.map((c, i) => {
        const spentC = currencySpentTotals[c] ?? 0;
        const todayNoInflC = currencyTodayNoInflTotals[c] ?? 0;
        const todayC = currencyTodayTotals[c] ?? 0;
        return {
            code: c,
            color: currencyColor(i),
            ownAmount: currencyOwnTotals[c] ?? 0,
            homeAmount: currencyHomeTotals[c] ?? 0,
            pct: currencyGrandTotal > 0 ? ((currencyHomeTotals[c] ?? 0) / currencyGrandTotal) * 100 : 0,
            // This currency's OWN "worth today" split: FX move (today's rate vs
            // the rate at the time), then inflation on top. Kept as floats —
            // sgnPct rounds to 1 decimal so a sub-1% move still shows.
            fxPct: spentC > 0 ? ((todayNoInflC - spentC) / spentC) * 100 : 0,
            inflPct: todayNoInflC > 0 ? ((todayC - todayNoInflC) / todayNoInflC) * 100 : 0,
        };
    });
    // Lookup by code so the "Expenses per… / Currency" dashboard rows can show
    // each currency's worth-today FX + inflation move (the detail that used to
    // live in its own separate breakdown card).
    const currencyByCode = new Map(currencyRows.map((r) => [r.code, r]));
    // PV-UX1/UX2: the per-currency DONUT + stacked chart cap at the top N
    // currencies + a single aggregated "Other" — a 16-slice donut / 16-series
    // stack is unreadable (and the palette would wrap). `members` lists the codes
    // each chart row aggregates (one for a normal row, the long tail for "Other").
    const CURRENCY_CHART_TOP_N = 8;
    const currencyChartRows: { code: string; color: string; homeAmount: number; members: string[] }[] =
        currencyRows.length <= CURRENCY_CHART_TOP_N + 1
            ? currencyRows.map((r) => ({ code: r.code, color: r.color, homeAmount: r.homeAmount, members: [r.code] }))
            : [
                ...currencyRows.slice(0, CURRENCY_CHART_TOP_N).map((r) => ({ code: r.code, color: r.color, homeAmount: r.homeAmount, members: [r.code] })),
                {
                    code: t('insights.otherCurrencies'),
                    color: CURRENCY_OTHER_COLOR,
                    homeAmount: currencyRows.slice(CURRENCY_CHART_TOP_N).reduce((s, r) => s + r.homeAmount, 0),
                    members: currencyRows.slice(CURRENCY_CHART_TOP_N).map((r) => r.code),
                },
            ];

    // IA-4 (MK3 audit): is the hero total still settling? It depends on
    // async data that arrives AFTER first paint — historical FX (rateCache)
    // in both modes, plus CPI in "today" mode. Until those land the figure
    // renders off the write-time fallback and then jumps (~12% measured), so
    // we show a "calculating…" placeholder while either is in-flight. Foreign
    // spend is the only thing that needs historical FX; an all-home-currency
    // trip in "at trip" mode is final immediately (no flicker to hide).
    // Today mode = current FX (synchronous via convertCurrency) + per-currency
    // CPI (async). At-trip mode = historical FX (async). Historical FX matters
    // in BOTH modes: even in "today" mode the "then you paid" figure + the FX
    // split (totalSpent / totalTodayNoInfl) are built off spentValue, which
    // falls back to the write-time euroValue until rateCache lands — so gating
    // today mode on CPI alone lets showPvCompare render the frozen fallback the
    // moment CPI settles, then jump when historical FX arrives. Gate on BOTH
    // fetches (rate fetch only matters with foreign spend, same as at-trip).
    const heroCalculating = mode === 'today'
        ? (!cpiChecked || (hasForeignSpend && !ratesSettled))
        : (hasForeignSpend && !ratesSettled);

    // "Did this trip get more expensive or cheaper to do today?" — compare the
    // cost-to-do-today (Σ todayValue) against what was actually paid at the time
    // (Σ spentValue), both in home currency. Positive ⇒ pricier now; negative ⇒
    // cheaper now (e.g. the local currency weakened more than prices rose). Only
    // surfaced once the inputs have settled and there's a non-trivial gap.
    const pvDelta = totalSpent > 0 ? (totalToday - totalSpent) / totalSpent : 0;
    const pvPct = Math.round(Math.abs(pvDelta) * 100);
    const showPvCompare = !heroCalculating && totalSpent > 0 && pvPct >= 1;
    // Split that headline into its two levers so the user can see it isn't a
    // made-up number: an FX step (today's rates vs the rates back then) and an
    // inflation step (CPI since). The euro amounts form an exact bridge —
    // totalSpent → totalTodayNoInfl (FX) → totalToday (inflation) — and the two
    // signed % deltas multiply back to the headline ratio.
    // 1-decimal so a small-but-real move (a currency that drifted, say, −0.5%
    // since the trip) isn't rounded away to a misleading "0%". Normalises −0.0
    // back to 0.0 so a tiny negative doesn't render as "-0.0%".
    const sgnPct = (p: number) => {
        const r = Math.round(p * 10) / 10 || 0;
        return `${r >= 0 ? '+' : ''}${r.toFixed(1)}%`;
    };
    // Direction + colour for a worth-today move: pricier reads amber, cheaper
    // green, flat grey — same cue as the hero's "more/less expensive today".
    // The dark surface (--card-bg #1c1c1e) needs lighter tones — the deep
    // amber/green read at ~1.5:1 there — so we pick theme-aware variants the
    // same way the chart ticks do (isDarkMode above).
    const dark = isDarkMode();
    const pricierColor = dark ? '#ff9f0a' : '#a85d00';
    const cheaperColor = dark ? '#30d158' : '#1a6b3c';
    const mv = (pct: number) => {
        const r = Math.round(pct * 10) / 10 || 0;
        const text = `${Math.abs(r).toFixed(1)}%`;
        if (r > 0) return { color: pricierColor, arrow: '↑ ', text };
        if (r < 0) return { color: cheaperColor, arrow: '↓ ', text };
        return { color: 'var(--text-secondary)', arrow: '', text };
    };
    const fxPctNum = (totalSpent > 0 ? (totalTodayNoInfl - totalSpent) / totalSpent : 0) * 100;
    const inflPctNum = (totalTodayNoInfl > 0 ? (totalToday - totalTodayNoInfl) / totalTodayNoInfl : 0) * 100;
    const fxPctSigned = sgnPct(fxPctNum);
    const inflPctSigned = sgnPct(inflPctNum);
    // Dated timeline points — drives the chart's mobile min-width so each day
    // gets room to breathe (the card scrolls horizontally when they don't fit).
    const timelinePointCount = Object.keys(dateTotals).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).length;

    // ── Chart.js side-effects ─────────────────────────────────────────────
    const timeCanvasRef = useRef<HTMLCanvasElement | null>(null);
    // Fixed Y-axis companion canvas — renders ONLY the € scale in a
    // non-scrolling gutter so the money axis stays put while the plot
    // scrolls sideways on phones (see the timeline effect + .timeline-yaxis).
    const timeAxisRef = useRef<HTMLCanvasElement | null>(null);
    const currencyTimeRef = useRef<HTMLCanvasElement | null>(null);
    const spenderPieRef = useRef<HTMLCanvasElement | null>(null);
    const perPieRef = useRef<HTMLCanvasElement | null>(null);
    // Donut ↔ legend hover cross-highlight: hovering a slice dims every OTHER
    // right-side row (and vice versa — hovering a row dims the other slices).
    // The chart instances live on refs so the dim effect can repaint without
    // rebuilding the chart.
    const spenderChartRef = useRef<InstanceType<typeof Chart> | null>(null);
    const perChartRef = useRef<InstanceType<typeof Chart> | null>(null);
    const [spenderHover, setSpenderHover] = useState<number | null>(null);
    const [perHover, setPerHover] = useState<number | null>(null);

    // ── Timeline zoom ─────────────────────────────────────────────────────
    // Default is zoomed OUT: every point fits the visible width, no scroll.
    // When there are more points than fit at a comfortable per-point width, a
    // glass button lets the user zoom IN (spread to --timeline-min + scroll)
    // and back. We measure the actual plot width so the button only appears
    // when the points genuinely overflow — never for a timeline that already
    // fits (where zooming would be a no-op).
    const [timelineZoomed, setTimelineZoomed] = useState(false);
    const timeScrollRef = useRef<HTMLDivElement | null>(null);
    const [timelinePlotW, setTimelinePlotW] = useState(0);
    useEffect(() => {
        const el = timeScrollRef.current;
        if (!el) {
            setTimelinePlotW(0);
            return;
        }
        const measure = () => setTimelinePlotW(el.clientWidth);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
        // tripExps.length re-runs this on the no-expenses → loaded transition
        // (when .timeline-scroll first mounts) so the plot gets measured.
    }, [tripExps.length]);
    const timelineNeedsZoom = timelinePlotW > 0 && timelinePointCount * 40 > timelinePlotW + 12;
    // Mirror the EFFECTIVE zoom state into a ref the chart's x-axis tick
    // callback reads on every (resize-driven) render — so the date labels
    // switch between "first + last only" (zoomed out) and "all" (zoomed in)
    // without re-creating the chart. useLayoutEffect keeps it current before
    // the zoom transition paints.
    const zoomedRef = useRef(false);
    useLayoutEffect(() => {
        zoomedRef.current = timelineZoomed && timelineNeedsZoom;
    }, [timelineZoomed, timelineNeedsZoom]);

    useEffect(() => {
        if (!chartLibReady) return;
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
        // Theme-aware tick colour. The old hardcoded dark slate
        // (rgba(60,60,67,0.5)) was near-invisible on the dark-mode card — use
        // the same secondary-text tones as the rest of the app (#5a5a5e light
        // / #c4c4cc dark) so the € + date labels read in both themes.
        const tickCol = isDarkMode() ? '#c4c4cc' : '#5a5a5e';
        // Clamp the x-axis to the exact data span (first/last expense) so the
        // line begins on the Y axis and ends at the right edge.
        const xMin = points.length ? points[0]!.x : undefined;
        const xMax = points.length ? points[points.length - 1]!.x : undefined;
        const chart = new Chart(timeCanvasRef.current, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: targetCurr + ' ' + t(mode === 'today' ? 'insights.rateModeToday' : 'insights.rateModeAtTrip'),
                        data: points,
                        borderColor: '#0071e3',
                        // Soft vertical gradient under the line — strongest at the
                        // line, fading to nothing at the axis (built off the live
                        // chartArea so it scales with the canvas).
                        backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
                            const { ctx, chartArea } = context.chart;
                            if (!chartArea) return 'rgba(0,113,227,0.12)';
                            const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                            g.addColorStop(0, 'rgba(0,113,227,0.28)');
                            g.addColorStop(0.85, 'rgba(0,113,227,0.02)');
                            g.addColorStop(1, 'rgba(0,113,227,0)');
                            return g;
                        },
                        fill: true,
                        // Gentle MONOTONE smoothing — prettier than hard segments
                        // but it never overshoots, so no false peak/dip is invented
                        // between two real data points (the reason we avoided a
                        // plain spline before).
                        cubicInterpolationMode: 'monotone',
                        borderWidth: 2.5,
                        borderCapStyle: 'round',
                        borderJoinStyle: 'round',
                        // Clean line by default; a crisp white-cored dot appears on
                        // hover at the focused point.
                        pointRadius: 0,
                        pointHitRadius: 16,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#ffffff',
                        pointHoverBorderColor: '#0071e3',
                        pointHoverBorderWidth: 3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // Hover anywhere along the x to surface the nearest day.
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        backgroundColor: 'rgba(17,24,39,0.92)',
                        padding: 10,
                        cornerRadius: 10,
                        titleColor: '#ffffff',
                        bodyColor: 'rgba(255,255,255,0.82)',
                        titleFont: { size: 13, weight: 700 },
                        bodyFont: { size: 13 },
                        callbacks: {
                            title: (items: TooltipItem<'line'>[]) => {
                                const v = items && items[0] ? Number(items[0].parsed.x) : NaN;
                                if (!Number.isFinite(v)) return '';
                                return timelineDateLabel(new Date(v).toISOString().slice(0, 10), includeYear);
                            },
                            // chart.js types parsed.y as number|null; for a plotted
                            // line point it's always a number, so `!` restates that
                            // without changing what's passed through.
                            label: (ctx: TooltipItem<'line'>) => targetSym + formatNumberForCurrency(ctx.parsed.y!, targetCurr),
                        },
                    },
                },
                scales: {
                    x: {
                        // Numeric time axis (x = epoch-ms); ticks reformat to dates.
                        type: 'linear',
                        // Clamp the axis to the exact data span so the line begins
                        // on the Y axis and ends at the right edge — no "nice tick"
                        // padding either side (default 'ticks' rounded out and left
                        // the line starting partway across).
                        min: xMin,
                        max: xMax,
                        bounds: 'data',
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 7,
                            // 'inner' aligns the first/last date labels INWARD so
                            // they don't overflow the chart edges. Without it,
                            // Chart.js pads the plot to fit the centered first
                            // label, pushing the line off the Y axis.
                            align: 'inner',
                            color: tickCol,
                            font: { size: 11 },
                            padding: 8,
                            callback: (value: number | string, index: number, ticks: readonly unknown[]) => {
                                const v = Number(value);
                                if (!Number.isFinite(v)) return '';
                                // Zoomed out: show ONLY the first + last date (the
                                // endpoints). Zoomed in: show every generated tick.
                                // zoomedRef is read fresh on each resize-driven
                                // render, so this flips with the zoom animation.
                                if (!zoomedRef.current && index !== 0 && index !== ticks.length - 1) {
                                    return '';
                                }
                                return timelineDateLabel(new Date(v).toISOString().slice(0, 10), includeYear);
                            },
                        },
                    },
                    y: {
                        beginAtZero: true,
                        grid: { display: false },
                        border: { display: false },
                        // Labels are drawn by the fixed-axis companion canvas
                        // (timeAxisRef) so they stay visible while this plot
                        // scrolls; hide them here to avoid a doubled axis.
                        ticks: {
                            display: false,
                            maxTicksLimit: 5,
                            color: tickCol,
                            font: { size: 11 },
                            padding: 10,
                            callback: (value: number | string) => targetSym + formatNumber(Number(value), 0),
                        },
                    },
                },
            },
        });

        // Compact € axis labels for the narrow fixed gutter — "€500", "€1.5k",
        // "€12k", "€1.2M". Full "€1.000"-style labels overflowed and clipped.
        // The width is capped at every magnitude so a label can never outgrow
        // the 44px gutter: a decimal only in the 1k–10k band, none above, and
        // an "M" suffix for millions (so a big day reads "€1.2M", not the
        // 38px-wide "€1500k").
        const fmtAxisTick = (value: number | string): string => {
            const n = Number(value);
            if (!Number.isFinite(n)) return '';
            const abs = Math.abs(n);
            if (abs >= 1_000_000) {
                const m = n / 1_000_000;
                return targetSym + (Number.isInteger(m) ? String(m) : m.toFixed(1)) + 'M';
            }
            if (abs >= 10_000) {
                return targetSym + String(Math.round(n / 1000)) + 'k';
            }
            if (abs >= 1000) {
                const k = n / 1000;
                return targetSym + (Number.isInteger(k) ? String(k) : k.toFixed(1)) + 'k';
            }
            return targetSym + formatNumber(n, 0);
        };

        // ── Fixed Y-axis gutter ───────────────────────────────────────
        // The timeline scrolls horizontally on phones (overflow-x), which
        // would drag the € scale off-screen. This second canvas renders
        // ONLY the Y axis and lives in a non-scrolling gutter to the left,
        // so the money scale stays put while the user scrubs the plot. It
        // shares the main chart's data + axis config, so its ticks line up
        // 1:1 with the plot heights: identical canvas height + identical
        // x-axis reserved height (same x config, just transparent text) +
        // identical auto-computed y bounds (same data, beginAtZero,
        // maxTicksLimit) → identical getPixelForValue. The line itself is
        // transparent — only the axis shows.
        let axisChart: InstanceType<typeof Chart> | null = null;
        if (timeAxisRef.current) {
            axisChart = new Chart(timeAxisRef.current, {
                type: 'line',
                data: {
                    datasets: [
                        {
                            data: points,
                            borderColor: 'transparent',
                            backgroundColor: 'transparent',
                            fill: false,
                            pointRadius: 0,
                            pointHoverRadius: 0,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: false,
                    events: [], // decorative — no hover / tooltip
                    plugins: { legend: { display: false }, tooltip: { enabled: false } },
                    scales: {
                        x: {
                            // Mirror the main x-axis EXACTLY so it reserves the
                            // same bottom height (→ same plot rect), but render
                            // its tick text invisible.
                            type: 'linear',
                            grid: { display: false },
                            border: { display: false },
                            ticks: {
                                maxRotation: 0,
                                autoSkip: true,
                                maxTicksLimit: 7,
                                color: 'transparent',
                                font: { size: 11 },
                                padding: 8,
                                callback: (value: number | string) => {
                                    const v = Number(value);
                                    if (!Number.isFinite(v)) return '';
                                    return timelineDateLabel(new Date(v).toISOString().slice(0, 10), includeYear);
                                },
                            },
                        },
                        y: {
                            beginAtZero: true,
                            grid: { display: false },
                            border: { display: false },
                            // The gutter's plot is decorative (the line is
                            // transparent), so hand almost the whole canvas
                            // width to the axis. Otherwise Chart.js splits this
                            // narrow canvas ~half/half and the € labels clip on
                            // the left — only the trailing chars showed
                            // ("€1.5k"→"5k", "€500"→"00").
                            afterFit: (scale: { width: number; chart: { width: number } }) => {
                                scale.width = scale.chart.width - 4;
                            },
                            ticks: {
                                maxTicksLimit: 5,
                                color: tickCol,
                                font: { size: 11 },
                                padding: 4,
                                callback: fmtAxisTick,
                            },
                        },
                    },
                },
            });
        }

        return () => {
            chart.destroy();
            if (axisChart) axisChart.destroy();
        };
    }, [chartLibReady, dateTotals, targetCurr, targetSym, mode, tripExps.length]);

    // Spenders share donut — per-person spend. The list beside it is the legend.
    useEffect(() => {
        if (!chartLibReady) return;
        if (!spenderPieRef.current || spenderRows.length < 2) return;
        // No tooltip on the pie — the right-side list IS the label surface; a
        // hover cross-highlights it instead. layout.padding gives the glow halo
        // room so it isn't clipped at the canvas edge.
        const chart = new Chart(spenderPieRef.current, {
            type: 'doughnut',
            plugins: [DONUT_GLOW],
            data: { labels: spenderRows.map((r) => r.name), datasets: [{ data: spenderRows.map((r) => r.value), backgroundColor: spenderRows.map((r) => r.sliceColor), borderWidth: 0 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                layout: { padding: 14 },
                onHover: (_evt, els) => setSpenderHover(els.length ? (els[0]?.index ?? null) : null),
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
            },
        });
        spenderChartRef.current = chart;
        setSpenderHover(null);
        return () => {
            spenderChartRef.current = null;
            chart.destroy();
        };
    }, [chartLibReady, targetCurr, targetSym, spenderRows.map((r) => `${r.name}:${r.value.toFixed(2)}`).join('|')]);

    // Repaint the spender donut on hover: the hovered slice keeps its colour,
    // every other slice fades. update('none') = no animation churn.
    useEffect(() => {
        const ch = spenderChartRef.current;
        if (!ch) return;
        const ds = ch.data.datasets[0];
        if (!ds) return;
        ds.backgroundColor = spenderRows.map((r, i) =>
            spenderHover == null || i === spenderHover ? r.sliceColor : dimHex(r.sliceColor, 0.16),
        );
        ch.update('none');
    }, [spenderHover, spenderRows]);

    // "Expenses per…" share donut — slices follow the active metric (spent / count).
    useEffect(() => {
        if (!chartLibReady) return;
        if (!perPieRef.current || perRows.rows.length < 2) return;
        const isCount = perMetric === 'count';
        // Shared glow plugin + no tooltip (the right-side rows are the labels;
        // hover cross-highlights them). Stable per-row sliceColor keeps a
        // category's hue identical across the Spent ↔ Transactions toggle.
        const chart = new Chart(perPieRef.current, {
            type: 'doughnut',
            plugins: [DONUT_GLOW],
            data: { labels: perRows.rows.map((r) => r.label), datasets: [{ data: perRows.rows.map((r) => (isCount ? r.count : r.value)), backgroundColor: perRows.rows.map((r) => r.sliceColor), borderWidth: 0 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                layout: { padding: 14 },
                onHover: (_evt, els) => setPerHover(els.length ? (els[0]?.index ?? null) : null),
                plugins: { legend: { display: false }, tooltip: { enabled: false } },
            },
        });
        perChartRef.current = chart;
        setPerHover(null);
        return () => {
            perChartRef.current = null;
            chart.destroy();
        };
    }, [chartLibReady, targetCurr, targetSym, perMetric, perRows.rows.map((r) => `${r.label}:${(perMetric === 'count' ? r.count : r.value).toFixed(2)}`).join('|')]);

    // Hover repaint for the "Expenses per…" donut (mirrors the spender one).
    useEffect(() => {
        const ch = perChartRef.current;
        if (!ch) return;
        const ds = ch.data.datasets[0];
        if (!ds) return;
        ds.backgroundColor = perRows.rows.map((r, i) =>
            perHover == null || i === perHover ? r.sliceColor : dimHex(r.sliceColor, 0.16),
        );
        ch.update('none');
    }, [perHover, perRows.rows]);

    // Currency-over-time stacked bars — home-equivalent spend per
    // original currency per day, so the currency mix shift across the
    // trip is visible at a glance.
    useEffect(() => {
        if (!chartLibReady) return;
        if (perDim !== 'currency' || !currencyTimeRef.current || spendCurrencies.length === 0) return;
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
        // PV-UX2: top-N currencies + an aggregated "Other" series (members), so
        // the stack stays legible past ~8 currencies.
        const datasets = currencyChartRows.map((r) => ({
            label: r.code,
            data: buckets.map((bk) => r.members.reduce((sum, code) => {
                const byDate = currencyDateTotals[code] || {};
                return sum + Object.keys(byDate)
                    .filter((d) => Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && bucketKey(d) === bk)
                    .reduce((s, d) => s + (byDate[d] || 0), 0);
            }, 0)),
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
                            // parsed.y is number|null in chart.js types but always a
                            // number for a plotted bar; `!` restates that.
                            label: (ctx: TooltipItem<'bar'>) => `${ctx.dataset.label}: ${targetSym}${formatNumberForCurrency(ctx.parsed.y!, targetCurr)}`,
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
    }, [chartLibReady, perDim, targetSym, targetCurr, JSON.stringify(currencyDateTotals)]);

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
        const nowYear = new Date().getFullYear();
        return Object.keys(byCur).sort().map((cur) => {
            const yrs = byCur[cur]!.years;
            const avgYear = yrs.length ? Math.round(yrs.reduce((a, b) => a + b, 0) / yrs.length) : nowYear;
            // Per-currency CPI (each currency's own region), matching the main
            // calc — so the override prefill IS the auto "worth today" figure.
            const factor = makeInflationFactor(cpiCache[cur], nowYear);
            // PV-7: start from the user's GLOBAL manual rate (Settings → per-year)
            // when present, so opening + saving the per-trip override panel doesn't
            // silently discard the globals. Falls back to the auto figure.
            const gYear = manualRates[cur] && manualRates[cur]![String(avgYear)];
            const gNow = manualRates[cur] && manualRates[cur]![String(nowYear)];
            const autoInflationPct = gYear && Number.isFinite(gYear.inflationPct)
                ? gYear.inflationPct as number
                : Math.round((factor(`${avgYear}-06-15`) - 1) * 1000) / 10;
            // IA-3: 6 significant figures, not 4 decimals. A fixed 4dp can't
            // represent tiny-unit currencies (JPY/KRW/IDR/VND/HUF ≈ 0.005…).
            const autoFx = gNow && Number.isFinite(gNow.fx) && (gNow.fx as number) > 0
                ? gNow.fx as number
                : Number(convertCurrency(1, cur, targetCurr).toPrecision(6));
            return { code: cur, autoInflationPct, autoFx, ov: overrides[cur] };
        });
    };

    // (Per-trip override panel removed — "Worth today" now has a single rates
    // entry point: the "set in settings" link below → Personalization. The
    // fxOverridesByTrip data model + calc precedence are kept for any overrides
    // already saved on a device, but there's no longer a second UI to create new
    // ones, which read as redundant alongside the global Settings editor.)

    // ⓘ explainer. In "Worth today" mode it explains the inflation + FX
    // logic and offers the manual-override link; otherwise the original
    // Spent-vs-Worth-today explanation.
    const openRateModeInfo = () => {
        if (mode === 'today') {
            const autos = computeCurrencyAutos();
            // D-6: a SPEND-WEIGHTED average across the trip's currencies, not the
            // single worst (Math.max over-stated the headline figure).
            const _wTot = autos.reduce((s, a) => s + (currencyHomeTotals[a.code] ?? 0), 0);
            const repInflation = _wTot > 0
                ? Math.round(autos.reduce((s, a) => s + a.autoInflationPct * ((currencyHomeTotals[a.code] ?? 0) / _wTot), 0))
                : (autos.length ? Math.round(autos.reduce((s, a) => s + a.autoInflationPct, 0) / autos.length) : 0);
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
                    <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:20px; flex-wrap:wrap;">
                        <button id="rateInfoClose" class="btn-primary" style="padding:9px 20px; border-radius:999px;">${t('common.close')}</button>
                    </div>
                `,
            });
            (root.querySelector('#rateInfoClose') as HTMLButtonElement | null)?.addEventListener('click', close);
            // Deep-link to the global per-year rate editor in Settings →
            // Personalization (Inflation pill), then scroll it into view.
            (root.querySelector('#vtSettingsLink') as HTMLAnchorElement | null)?.addEventListener('click', (ev) => {
                ev.preventDefault();
                close();
                // Defer the nav until AFTER the modal's close() history.back()
                // popstate fires — otherwise that back() reverts the navigate and
                // we'd stay on #expenses. Then scroll the editor into view once
                // the Personalization page has mounted.
                setTimeout(() => {
                    requestPersonalizationTab('infl');
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

    // ── Empty states (rendered AFTER all hooks, so hook order is identical
    //    every render — react-hooks/rules-of-hooks). No active trip → "select a
    //    trip"; trip with no expenses → "add expenses". ────────────────────────
    if (!activeTripId) {
        return (
            <div>
                <h1
                    className="inline-block text-[1.5rem] font-extrabold text-brand-navy tracking-[-0.02em]"
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

    if (tripExps.length === 0) {
        return (
            <div>
                <h1
                    className="inline-block text-[1.5rem] font-extrabold text-brand-navy tracking-[-0.02em]"
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
                        className="inline-block text-[1.5rem] font-extrabold text-brand-navy tracking-[-0.02em] mb-1"
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
                            {/* B7-I5: make the toggle's effect self-evident — show
                                the net inflation delta the figure applies (reuses
                                inflPctNum). Hidden while the async inputs settle and
                                when the move rounds to ~0% (no CPI series yet, or a
                                very recent trip), so it never advertises a no-op. */}
                            {!heroCalculating && Math.abs(inflPctNum) >= 0.1 ? (
                                <span style={{ marginLeft: '5px', fontSize: '0.72em', fontWeight: 600, opacity: 0.7 }}>
                                    {inflPctSigned}
                                </span>
                            ) : null}
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
                                    {/* PV-UX3: "≈" flags Worth-today as an estimate
                                        (projected inflation + FX); Spent is the
                                        at-the-time figure, shown exact. */}
                                    {mode === 'today' ? '≈ ' : ''}
                                    {targetSym}
                                    {formatNumberForCurrency(totalDisplay, targetCurr)}
                                </h1>
                                <span className="hero-stat-card__currency">{targetCurr}</span>
                            </>
                        )}
                    </div>
                    {/* B3-I5: the 4s CPI gate can release this hero before a slow
                        World-Bank series lands, so a multi-currency figure can show
                        as "final" then quietly refine. Carry an explicit "still
                        updating" note in that window so the number never looks
                        settled while inflation factors are still arriving. Clears
                        itself once the late series land (live cpiCache). */}
                    {!heroCalculating && cpiStillUpdating ? (
                        <p className="hero-stat-card__sub" style={{ opacity: 0.7, marginTop: '4px' }}>
                            {t('insights.cpiStillUpdating')}
                        </p>
                    ) : null}
                    {/* B3-I2: name the foreign currencies whose OWN inflation the
                        "Worth today" figure silently ignores (no FX → Model B, or
                        no CPI series → factor 1), so a hyper-inflation trip (e.g.
                        2018 Argentina) doesn't quietly look flat. */}
                    {!heroCalculating && inflationFallbackCurrencies.length > 0 ? (
                        <p className="hero-stat-card__sub" style={{ opacity: 0.7, marginTop: '4px' }}>
                            {t('insights.worthTodayFallbackNote', { currencies: inflationFallbackCurrencies.join(', ') })}
                        </p>
                    ) : null}
                    {/* B3-I1: manual FX/inflation overrides live only in this
                        device's localStorage, so companions can see different
                        "Worth today" totals — flag it so the figure isn't read as
                        authoritative across devices. */}
                    {!heroCalculating && worthTodayIsDeviceLocal ? (
                        <p className="hero-stat-card__sub" style={{ opacity: 0.7, marginTop: '4px' }}>
                            {t('insights.worthTodayDeviceLocalNote')}
                        </p>
                    ) : null}
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
                        {t('insights.heroHomeCurrencyHint', { currency: targetCurr })}{' '}
                        <button
                            type="button"
                            onClick={() => navigate('profile')}
                            className="link-underline text-accent-blue"
                            style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontSize: 'inherit', fontWeight: 700 }}
                        >
                            {t('insights.changeHomeCurrency')}
                        </button>
                    </p>
                    {/* "More expensive / cheaper to do today" — the headline answer
                        to "did the trip get pricier or cheaper since then". */}
                    {showPvCompare ? (
                        <p className="text-[0.85rem] font-bold mt-2.5" style={{ color: pvDelta > 0 ? '#ff9500' : '#34c759' }}>
                            {t(pvDelta > 0 ? 'insights.pvPricier' : 'insights.pvCheaper', {
                                pct: String(pvPct),
                                then: targetSym + formatNumberForCurrency(totalSpent, targetCurr),
                            })}
                        </p>
                    ) : null}
                    {/* PV transparency: the two levers (FX + inflation) behind the
                        headline, so the figure is auditable rather than magic. The
                        euro amounts bridge spent → today's-FX → +inflation. */}
                    {showPvCompare ? (
                        <div className="text-secondary text-[0.78rem] leading-snug mt-1" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            {hasForeignSpend ? (
                                <>
                                    <span>{t('insights.pvBreakdownFx', { pct: fxPctSigned, amount: targetSym + formatNumberForCurrency(totalTodayNoInfl, targetCurr) })}</span>
                                    <span>{t('insights.pvBreakdownInflation', { pct: inflPctSigned, amount: targetSym + formatNumberForCurrency(totalToday, targetCurr) })}</span>
                                </>
                            ) : (
                                <span>{t('insights.pvBreakdownInflationOnly', { pct: inflPctSigned })}</span>
                            )}
                        </div>
                    ) : null}
                    {hasForeignSpend ? (
                        <button
                            type="button"
                            onClick={() => {
                                // Consolidated: the per-currency breakdown now lives in
                                // the "Expenses per…" dashboard. Select its Currency
                                // dimension and scroll there instead of opening a
                                // separate card.
                                setPerDim('currency');
                                setTimeout(() => document.getElementById('expensesPerDash')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
                            }}
                            className="link-underline text-accent-blue font-bold text-[0.85rem]"
                            style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginTop: '12px' }}
                        >
                            {t('insights.seeCurrencyBreakdown')}
                        </button>
                    ) : null}
                </div>
            </div>

            {/* The standalone currency-breakdown card was consolidated INTO the
                "Expenses per…" dashboard below: its Currency dimension now carries
                the per-currency FX + inflation detail, and the per-currency
                timeline moved directly beneath the dashboard. */}

            {/* Budgets + Who-owes-whom quick openers, side by side. Budgets
                only shows when there ARE budgets; Who-owes shows for any active
                trip (its card reads "all settled" when everyone's even), so the
                settlements entry point is always reachable from Insights. Each
                card links out to its full page. */}
            {activeTrip ? (
                <div className="mb-8">
                    <div className="flex flex-wrap items-center gap-2.5">
                        {tripBudgets.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => setShowBudgetVs((v) => !v)}
                                aria-expanded={showBudgetVs}
                                className="inline-flex items-center gap-1.5 bg-[linear-gradient(135deg,_#ffd60a,_#ff9f0a)] text-white border-0 py-2 px-3.5 rounded-full font-extrabold text-[0.78rem] cursor-pointer shadow-[0_6px_18px_rgba(255,159,10,0.3)]"
                            >
                                {t('insights.budgetPill')}
                                <span aria-hidden="true">{showBudgetVs ? '▴' : '▾'}</span>
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => setShowSettle((v) => !v)}
                            aria-expanded={showSettle}
                            className="inline-flex items-center gap-1.5 bg-[linear-gradient(135deg,_#34c759,_#00a86b)] text-white border-0 py-2 px-3.5 rounded-full font-extrabold text-[0.78rem] cursor-pointer shadow-[0_6px_18px_rgba(52,199,89,0.3)]"
                        >
                            {t('insights.settlePill')}
                            <span aria-hidden="true">{showSettle ? '▴' : '▾'}</span>
                        </button>
                    </div>

                    {showBudgetVs && tripBudgets.length > 0 ? (
                        // Gold edge ties this card to its gold "Budgets" pill.
                        <div className="card glass in-card-pad-28 mt-3" style={{ border: '1.5px solid rgba(255,159,10,0.5)' }}>
                            <p className="text-secondary text-[0.85rem] mb-5">{t('insights.budgetVsActualSub')}</p>
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
                                        {b.overHome > 0 ? (
                                            <div className="text-[0.75rem] font-bold mt-1" style={{ color: '#ff3b30' }}>
                                                {t('insights.budgetOverBy', { amount: targetSym + formatNumberForCurrency(b.overHome, targetCurr) })}
                                            </div>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                            {/* Budgets are NOMINAL — original amounts vs amount spent. */}
                            <p className="text-secondary text-[0.72rem] mt-4 italic">{t('insights.budgetBasisNote')}</p>
                            <button
                                type="button"
                                onClick={() => navigate('budgets')}
                                className="mt-5 inline-flex items-center gap-1 bg-transparent border-0 p-0 text-accent-blue-deep font-bold text-[0.85rem] cursor-pointer"
                            >
                                {t('insights.viewBudgets')} <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    ) : null}

                    {showSettle ? (
                        // Green edge ties this card to its green "Who owes?" pill.
                        <div className="card glass in-card-pad-28 mt-3" style={{ border: '1.5px solid rgba(52,199,89,0.55)' }}>
                            <p className="text-secondary text-[0.85rem] mb-5">{t('insights.netBalanceSub')}</p>
                            {netBalances.length > 0 ? (
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
                            ) : (
                                <p className="text-[0.9rem] font-semibold" style={{ color: '#34c759' }}>{t('insights.allSettled')}</p>
                            )}
                            <button
                                type="button"
                                onClick={() => navigate('settlement')}
                                className="mt-5 inline-flex items-center gap-1 bg-transparent border-0 p-0 text-accent-blue-deep font-bold text-[0.85rem] cursor-pointer"
                            >
                                {t('insights.viewSettlements')} <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* Summary Grid */}
            <div
                className="grid-2 grid-cols-2 mb-8"
            >
                <div className="card glass">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <h2 className="card-title metric-label m-0">{t('insights.avgDaily')}</h2>
                        <div className="flex gap-1.5 flex-wrap">
                            <GGSelect
                                value={avgWho}
                                onChange={setAvgWho}
                                ariaLabel={t('insights.filterPayer')}
                                options={[
                                    { value: 'all', label: t('insights.allPayers') },
                                    ...payerOptions.map((pp) => ({ value: pp, label: pp })),
                                ]}
                            />
                            <GGSelect
                                value={avgCat}
                                onChange={setAvgCat}
                                ariaLabel={t('insights.filterCategory')}
                                options={[
                                    { value: 'all', label: t('insights.allCategories') },
                                    ...catOptions.map((c) => ({ value: c.id, label: c.label })),
                                ]}
                            />
                        </div>
                    </div>
                    {/* B7-I2: the average is computed only over PAST, dated days.
                        A filter that matches solely future/undated rows leaves
                        days=0, and the old markup rendered "€0.00 / day over 0
                        days" — reads like a bug. Show an honest empty line
                        instead. */}
                    {avgDailyData.days === 0 ? (
                        <p className="metric-value text-secondary text-[length:var(--font-lg)] font-normal">
                            {t('insights.avgDailyNoDatedSpend')}
                        </p>
                    ) : (
                        <>
                            <h1 className="metric-value">
                                {targetSym}
                                {formatNumberForCurrency(avgDailyData.avg, targetCurr)}
                                <small
                                    className="text-[length:var(--font-lg)] font-normal text-secondary ml-2"
                                >
                                    {t('insights.avgDailySuffix')}
                                </small>
                            </h1>
                            <p className="metric-label mt-1">{t('insights.avgDailyOverDays', { days: String(avgDailyData.days) })}</p>
                        </>
                    )}
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

            {/* Spenders dashboard — per-person spend, sortable, with a share donut. */}
            <div className="card glass in-card-pad-28 mb-8">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="card-title m-0">{t('insights.spendersTitle')}</h2>
                        <SegmentedControl
                            ariaLabel={t('insights.spendersTitle')}
                            value={spenderDim}
                            onChange={setSpenderDim}
                            options={[
                                { value: 'general', label: t('insights.dimGeneral') },
                                { value: 'category', label: t('insights.dimCategory') },
                                { value: 'country', label: t('insights.dimCountry') },
                                { value: 'currency', label: t('insights.dimCurrency') },
                            ]}
                        />
                    </div>
                    <SegmentedControl
                        ariaLabel={t('insights.sortBy')}
                        value={spenderSort}
                        onChange={setSpenderSort}
                        options={[
                            { value: 'amount_desc', label: t('insights.sortAmountDesc') },
                            { value: 'amount_asc', label: t('insights.sortAmountAsc') },
                            { value: 'count_desc', label: t('insights.sortCountDesc') },
                            { value: 'name_asc', label: t('insights.sortNameAsc') },
                        ]}
                    />
                </div>
                <div className={spenderRows.length >= 2 ? 'grid-2 grid-cols-2 gap-6 items-center' : ''}>
                    {spenderRows.length >= 2 ? (
                        <div className="relative h-[220px] w-full min-w-0" onMouseLeave={() => setSpenderHover(null)}><canvas ref={spenderPieRef}></canvas></div>
                    ) : null}
                    <div className="flex flex-col gap-1">
                        {(() => {
                            const maxV = spenderRows.reduce((m, x) => Math.max(m, x.value), 0);
                            return spenderRows.map((r, index) => {
                                const barPct = maxV > 0 ? (r.value / maxV) * 100 : 0;
                                const sharePct = totalDisplay > 0 ? (r.value / totalDisplay) * 100 : 0;
                                return (
                                    <div
                                        key={r.name}
                                        className="flex flex-col gap-1 py-1.5"
                                        onMouseEnter={() => setSpenderHover(index)}
                                        onMouseLeave={() => setSpenderHover(null)}
                                        style={{
                                            ...(index < spenderRows.length - 1 ? { borderBottom: '1px solid var(--border-subtle)' } : {}),
                                            opacity: spenderHover != null && spenderHover !== index ? 0.35 : 1,
                                            transition: 'opacity 0.15s ease',
                                        }}
                                    >
                                        <div className="flex items-baseline justify-between gap-3 min-w-0">
                                            <span className="font-bold text-primary break-words min-w-0 flex items-center gap-2">
                                                <span className="inline-block rounded-full" style={{ width: 10, height: 10, flexShrink: 0, background: r.sliceColor }} />
                                                {r.name}
                                            </span>
                                            <span className="font-extrabold text-accent-blue tabular-nums whitespace-nowrap">
                                                {targetSym}{formatNumberForCurrency(r.value, targetCurr)}
                                                <span className="ml-2 text-secondary font-semibold text-[0.78rem]">{r.count} {t('insights.transactionsAbbrev')} · {formatNumber(sharePct, 0)}%</span>
                                            </span>
                                        </div>
                                        <div className="relative h-1.5 rounded-full bg-[rgba(0,113,227,0.08)] overflow-hidden flex" aria-hidden="true">
                                            {r.segs.length > 0
                                                ? r.segs.map((s) => (
                                                    <div key={s.label} title={`${s.label}: ${targetSym}${formatNumberForCurrency(s.value, targetCurr)}`} style={{ width: `${maxV > 0 ? (s.value / maxV) * 100 : 0}%`, background: s.color, transition: 'width 0.3s ease' }} />
                                                  ))
                                                : <div style={{ width: `${Math.min(100, Math.max(0, barPct))}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${r.sliceColor} 70%, #fff), ${r.sliceColor})`, borderRadius: 999, transition: 'width 0.3s ease' }} />}
                                        </div>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
                {/* Shared legend for the secondary dimension — same colour =
                    same category / country / currency across every companion. */}
                {spenderLegend.length > 0 ? (
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-4 pt-4 border-t border-[var(--border-subtle)]">
                        {spenderLegend.map((l) => (
                            <span key={l.label} className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-secondary">
                                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: l.color }} />
                                {l.label}
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>

            {/* "Expenses per…" dashboard — dimension + metric, with a share donut + %.
                The Currency dimension also carries the per-currency FX + inflation
                "worth today" detail (consolidated from the old breakdown card). */}
            <div id="expensesPerDash" className="card glass mb-8 p-7">
                <div className="flex justify-between items-center gap-3 flex-wrap mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="card-title m-0">{t('insights.expensesPer')}</h2>
                        <SegmentedControl
                            ariaLabel={t('insights.expensesPer')}
                            value={perDim}
                            onChange={setPerDim}
                            options={[
                                { value: 'category', label: t('insights.dimCategory') },
                                { value: 'country', label: t('insights.dimCountry') },
                                { value: 'currency', label: t('insights.dimCurrency') },
                            ]}
                        />
                    </div>
                    <SegmentedControl
                        ariaLabel={t('insights.metricSpent')}
                        value={perMetric}
                        onChange={setPerMetric}
                        options={[
                            { value: 'value', label: t('insights.metricSpent') },
                            { value: 'count', label: t('insights.metricCount') },
                        ]}
                    />
                </div>
                {perRows.rows.length === 0 ? (
                    <p className="text-secondary text-[0.85rem]">{t('insights.perEmpty')}</p>
                ) : (
                    <div className={perRows.rows.length >= 2 ? 'grid-2 grid-cols-2 gap-6 items-center' : ''}>
                        {perRows.rows.length >= 2 ? (
                            <div className="relative h-[240px] w-full min-w-0" onMouseLeave={() => setPerHover(null)}><canvas ref={perPieRef}></canvas></div>
                        ) : null}
                        <div className="flex flex-col gap-[10px]">
                            {(() => {
                                const denom = perMetric === 'count' ? perRows.totalCnt : perRows.totalVal;
                                const maxV = perRows.rows.reduce((m, r) => Math.max(m, perMetric === 'count' ? r.count : r.value), 0);
                                return perRows.rows.map((r, index) => {
                                    const metricVal = perMetric === 'count' ? r.count : r.value;
                                    const barPct = maxV > 0 ? (metricVal / maxV) * 100 : 0;
                                    const sharePct = denom > 0 ? (metricVal / denom) * 100 : 0;
                                    // r.sliceColor is the donut's hue for this row — STABLE
                                    // across the Spent ↔ Transactions toggle (assigned by
                                    // spend-order in perRows), so icon + bar + slice always
                                    // read as one category.
                                    const catColor = r.sliceColor;
                                    return (
                                        <div
                                            key={r.label}
                                            className="flex flex-col gap-1"
                                            onMouseEnter={() => setPerHover(index)}
                                            onMouseLeave={() => setPerHover(null)}
                                            style={{
                                                opacity: perHover != null && perHover !== index ? 0.35 : 1,
                                                transition: 'opacity 0.15s ease',
                                            }}
                                        >
                                            <div className="flex justify-between items-baseline gap-3 min-w-0">
                                                <span className="font-bold text-[0.95rem] text-primary break-words min-w-0 flex items-center gap-2">
                                                    {perDim === 'category' && r.icon ? (
                                                        <span style={{ color: catColor, display: 'inline-flex', flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: iconForCategory(r.icon, { size: 16 }) }} />
                                                    ) : (
                                                        <span className="inline-block rounded-full" style={{ width: 10, height: 10, flexShrink: 0, background: catColor }} />
                                                    )}
                                                    {r.label}
                                                </span>
                                                <span className="font-extrabold text-accent-blue tabular-nums whitespace-nowrap">
                                                    {perMetric === 'count'
                                                        ? `${r.count} ${t('insights.transactionsAbbrev')}`
                                                        : `${targetSym}${formatNumberForCurrency(r.value, targetCurr)}`}
                                                    <span className="ml-2 text-secondary font-semibold text-[0.8rem]">{formatNumber(sharePct, 0)}%</span>
                                                </span>
                                            </div>
                                            <div className="relative h-1.5 rounded-full bg-[rgba(0,113,227,0.08)] overflow-hidden" aria-hidden="true">
                                                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${Math.min(100, Math.max(0, barPct))}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${catColor} 70%, #fff), ${catColor})`, borderRadius: 999, transition: 'width 0.3s ease' }} />
                                            </div>
                                            {/* Currency dimension only: what you actually paid in
                                                that currency + its own worth-today move (FX then
                                                inflation), colour-coded. Home currency has no move. */}
                                            {perDim === 'currency' ? (() => {
                                                const cr = currencyByCode.get(r.label);
                                                if (!cr || r.label === homeCurr) return null;
                                                const fx = mv(cr.fxPct);
                                                const infl = mv(cr.inflPct);
                                                return (
                                                    <div className="flex items-center justify-between gap-3 mt-1" style={{ paddingLeft: '18px', fontSize: '0.76rem', fontWeight: 600 }}>
                                                        <span className="text-secondary whitespace-nowrap">
                                                            {CURRENCY_SYMBOLS[r.label] || ''}{formatNumberForCurrency(cr.ownAmount, r.label)}
                                                        </span>
                                                        <span className="flex items-center gap-3 whitespace-nowrap">
                                                            <span style={{ color: fx.color }}>{fx.arrow}{t('insights.pvFxLabel')} {fx.text}</span>
                                                            <span style={{ color: infl.color }}>{infl.arrow}{t('insights.pvInflLabel')} {infl.text}</span>
                                                        </span>
                                                    </div>
                                                );
                                            })() : null}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                )}
                {/* B7-I1: footnote so the per-country numbers audit — expenses
                    with no country recorded are shown as a "No country" slice
                    here (they used to be dropped, understating the trip). */}
                {perDim === 'country' && convertedExps.some((e) => !e.country) ? (
                    <p className="text-secondary text-[0.75rem] leading-snug mt-3 m-0">
                        {t('insights.perNoCountryNote')}
                    </p>
                ) : null}
            </div>

            {/* Per-currency spend over time — moved here from the old breakdown
                card; multi-currency trips only, shown when the dashboard's
                Currency dimension is active. */}
            {perDim === 'currency' && isMultiCurrency ? (
                <div className="card glass in-card-pad-28 mb-8">
                    <h2 className="card-title">{t('insights.currencyTimelineTitle')}</h2>
                    <p className="text-secondary text-[0.85rem] mt-1 mb-5">
                        {t('insights.currencyTimelineSub')}
                    </p>
                    <div className="relative h-[300px] w-full">
                        <canvas ref={currencyTimeRef}></canvas>
                    </div>
                </div>
            ) : null}

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
                {/* On phones the daily points don't fit a narrow width, so the
                    plot gets a min per-point width and the card scrolls sideways
                    (stays fit-to-width on desktop — see .timeline-inner in index.css). */}
                <div className="timeline-frame">
                    {timelineNeedsZoom ? (
                        <button
                            type="button"
                            className="timeline-zoom-btn"
                            onClick={() => setTimelineZoomed((z) => !z)}
                            aria-pressed={timelineZoomed}
                            aria-label={timelineZoomed ? t('insights.timelineZoomOut') : t('insights.timelineZoomIn')}
                            title={timelineZoomed ? t('insights.timelineZoomOut') : t('insights.timelineZoomIn')}
                        >
                            {timelineZoomed ? (
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="7"></circle>
                                    <line x1="8" y1="11" x2="14" y2="11"></line>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                            ) : (
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="7"></circle>
                                    <line x1="11" y1="8" x2="11" y2="14"></line>
                                    <line x1="8" y1="11" x2="14" y2="11"></line>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                            )}
                        </button>
                    ) : null}
                    {/* Fixed € axis — stays put while .timeline-scroll scrolls. */}
                    <div className="timeline-yaxis relative h-[350px]">
                        <canvas ref={timeAxisRef}></canvas>
                    </div>
                    <div className="timeline-scroll" ref={timeScrollRef}>
                        <div
                            className={`timeline-inner relative h-[350px]${timelineZoomed && timelineNeedsZoom ? ' is-zoomed' : ''}`}
                            style={{ ['--timeline-min' as string]: `${timelinePointCount * 40}px` }}
                        >
                            <canvas id="timelineChart" ref={timeCanvasRef}></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

