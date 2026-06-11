# Insights "Spent vs Worth today" — Data + Clarity Audit (MK1)

**Scope:** the Insights currency/inflation feature — home-currency hero total, the
Spent ↔ Worth-today toggle (historical FX + real CPI), the ⓘ explainer, and the
multi-currency breakdown (donut + per-currency list + over-time bars).

**Two lenses (as requested):** (1) **DATA** — is every number airtight across
currencies, dates, and edge cases? (2) **UX** — can a non-expert understand what
each number means and how it's shown?

**Method:** 5 parallel persona/lens agents (EUR long-haul inflation · USD-home JPY
FX+decimals · unmapped/high-inflation home · airtight gating + dirty-data ·
i18n/clarity across en/es/fr/pt) doing code-trace + numeric checks against **real
World Bank CPI and Frankfurter FX** (WebFetch), plus a live browser sweep on the
persona server. Date context: 2026-06-01.

**Bottom line:** the **core math is airtight** — inflation factors match real German
CPI to the cent, the JPY→EUR→USD two-hop FX is exact, gating is correct, and there
are **no crashes / NaN / divide-by-zero** anywhere (server validators + client
guards are solid). The problems are concentrated in **presentation/formatting** (a
few of which are genuinely wrong numbers on screen) and **honesty/clarity of the
inflation story**. 9 DATA findings, 10 UX findings. None are P0; five P1s, two of
them confirmed live.

---

## SECTION 1 — DATA CORRECTNESS

### DATA-1 · P1 · 0-decimal home currencies render with 2 decimals ✅ confirmed live
- **Where:** `Insights.tsx:614, 696, 709, 731, 744, 815` (every home-currency figure) → `formatNumber` `i18n.ts:386` is hard-locked to 2 fraction digits.
- **Scenario:** any user whose **home** currency is JPY/KRW/HUF/CLP/ISK/VND.
- **Confirmed live:** JPY home → hero **¥320 505,93**, daily **¥64 101,19**, peak **¥92 725,00** (yen with cents).
- **Expected vs actual:** JPY has 0 decimals → should be ¥320 506. Every figure on the page is wrong for these users and screams "broken."
- **Fix:** route home amounts through `formatCurrency(value, targetCurr)` (Intl gives per-currency decimals + correct symbol placement), dropping the manual `targetSym + formatNumber`. Note the per-currency **own-amount** (`:666`) already does this correctly.

### DATA-2 · P1 · Chart.js tooltips & axes leak unrounded, locale-unsafe numbers ✅ confirmed live
- **Where:** donut `Insights.tsx:471`, currency timeline `:498-517`, category pie `:391-396`, spend timeline `:412-428`; axis callbacks `:444, :511` do `targetSym + value` on Chart's raw en-US number.
- **Confirmed live:** hovering the EUR donut slice shows **"EUR 1,56…678"** (the raw `1565.6783…`).
- **Expected vs actual:** should show `€1.565,68`; shows a 13-digit float, un-grouped, wrong decimal separator for fr/pt.
- **Fix:** add `plugins.tooltip.callbacks.label` and wrap each axis `callback` value in `formatCurrency(Number(v), targetCurr)`.

### DATA-3 · P1 · Timeline renders literal "Invalid Date" for empty-date expenses
- **Where:** `Insights.tsx:248` (`d = e.date || unknownDate`) → `:404-411` & `:485-491`; `new Date("Unknown")` → Invalid Date; `toLocaleDateString` returns the literal string `"Invalid Date"` so the `catch` never fires; it also sorts to the far right (letters > digits). `validate_date` explicitly allows `""` (`validators.py:255-259`).
- **Scenario:** an expense saved with a blank date (allowed) → a tick labelled "Invalid Date" on both timelines.
- **Fix:** guard `Number.isNaN(dateObj.getTime())` and skip/label undated points ("Undated").

### DATA-4 · P1 · Timeline dates are off-by-one for UTC-negative users
- **Where:** `Insights.tsx:406, :487` build `new Date(bareISO)` (parsed as UTC midnight) then render in **local** time.
- **Scenario:** a user in America/* → `2026-06-01` renders **"May 31"** on the chart axis.
- **Note:** this regresses the codebase's own fix — `formatDateShort` (`i18n.ts:401-409`) forces `timeZone:'UTC'` precisely to avoid this.
- **Fix:** `new Date(d + 'T00:00:00Z')` + `{ timeZone:'UTC', month:'short', day:'numeric' }`.

### DATA-5 · P2 · Mixed-source FX across the two conversion hops
- **Where:** `Insights.tsx:192-203`. If `rateCache[date_JPY_EUR]` is present but `rateCache[date_USD_EUR]` (home) misses, hop-1 uses historical FX and hop-2 falls back to the static table → e.g. ¥28000 = **$187.22 vs correct $190.52 (−$3.30)**. The `e.euroValue` branch (write-time freeze) combined with the expense-date home rate is a date mismatch that can compound.
- **Fix:** gate both hops on the same source — if either historical rate is missing, do one direct `convertCurrency(e.value, e.currency, targetCurr)` instead of mixing.

### DATA-6 · P2 · Unmapped-FX home renders the home total wildly wrong, silently
- **Where:** `utils/currency.ts:75` (`CONVERSION_RATES[upper] || 1`) reached via `Insights.tsx:202/196`. If the **home** currency is absent from CONVERSION_RATES **and** the live overlay **and** rateCache (e.g. ISK while Frankfurter is cold, or a currency Frankfurter never covers), `_rateFor` returns 1 → €100 shows as "ISK 100" (true ≈ ISK 15 000, ~150× off).
- **Mitigation:** `validate_currency` restricts persisted codes to `_ALLOWED_CURRENCIES`, and rateCache self-heals once Frankfurter lands — so for most currencies this is a **transient pre-fetch window** (Agent D rated it "acceptable"). It's **persistent** only for a home currency Frankfurter genuinely doesn't cover.
- **Fix:** in Insights, gate the home figure on `hasRate(targetCurr)` (the helper already exists, `currency.ts:86`) and show a "rates unavailable" state instead of a 1:1 number.

### DATA-7 · P2 · Foreign-currency expense in a hyper-inflated home conflates FX + CPI
- **Where:** `Insights.tsx:197-208`. Home = TRY, an expense paid in **EUR in 2010**: "Spent" converts EUR→TRY at the 2010 rate (a small TRY figure), then "Worth today" multiplies by the TRY CPI factor (×13.23, verified vs World Bank). For a **home-currency** expense this is one clean adjustment; for a **foreign** expense it mixes "2010-TRY price" with "2024-TRY purchasing power" while the EUR/TRY rate already moved ~20×. Conceptually muddy, not a hard bug.
- **Fix:** decide & document the semantic — likely base "Worth today" for foreign-currency expenses on **today's** FX, or restrict the CPI adjustment to home-currency expenses.

### DATA-8 · P2 · Pre-CPI-series expenses clamp silently (and pre-1999 "EUR" is fictional)
- **Where:** `Insights.tsx:176` + the fetch window `api.ts` (`date=2000:…`). A 1998 expense clamps `baseYear` to 2000 and applies ~24y of inflation with no flag; the real 1998 factor would actually be higher, so the clamp silently **under**-states. (And "EUR" didn't exist in 1998.)
- **Fix:** extend the fetch window earlier (`date=1996:`) or mark clamped values with a subtle "≈"/asterisk.

### DATA-9 · P3 · Percentage rendering inconsistency
- **Where:** per-country pct uses `pct.toFixed(0)` (`Insights.tsx:815-819`) while the currency list uses `formatNumber(r.pct, 0)` (`:668`). Cosmetic; pick one (locale-aware) helper.

---

## SECTION 2 — UX CLARITY

### UX-1 · P1 · Per-currency list shows the same currency twice, unlabeled
- **Where:** `Insights.tsx:662-669`. An EUR-home user's EUR row reads **"EUR 1439,70 € … €1565,68 82%"** — two euro numbers, no column captions; worse in "Worth today" where the home figure is inflation-adjusted. Reads as a contradiction / an impossible exchange rate.
- **Fix:** add tiny column captions ("you paid" / "≈ in {home}"); for the row where `code === homeCurr` suppress the redundant own-amount or prefix the home figure with "≈" so it reads as derived, not a second price.

### UX-2 · P1 · The one sentence that explains the toggle is hover-only
- **Where:** `Insights.tsx:581` renders `rateModeHint` as a `title=` tooltip — never visible text, nothing for touch users. "Spent" / "Worth today" alone don't self-explain.
- **Fix:** render `rateModeHint` as a visible caption line under the toggle (already translated in all 4 locales); keep the ⓘ for the deep dive.

### UX-3 · P1 · "Worth today" silently equals "Spent" when CPI is unavailable
- **Where:** `api.ts:1779-1782` early-returns for a home currency not in `CURRENCY_TO_CPI_COUNTRY` (AED/SAR/ISK/ILS/PHP/VND/EGP/ARS…) → factor 1 → toggling does nothing, no indication. `rateInfoNote` explains "recent trip," not "no data for your currency."
- **Fix:** when `cpiCache[home]` is empty, disable the Worth-today button + show "inflation data unavailable for {currency}"; add a `rateInfoNoData` locale key.

### UX-4 · P1 · Recent-trip "Worth today" == "Spent" looks broken
- **Where:** `Insights.tsx:175-176`; CPI lags ~1.5y, so **2025 and 2026** expenses get factor exactly 1.000 — a recent trip shows **zero** uplift. `rateInfoNote` ("a very recent trip shows little or no change") undersells "identical to the cent for 2+ years."
- **Fix:** strengthen the note: "trips from the last ~2 years show no change yet, because official inflation data isn't published that quickly."

### UX-5 · P2 · German CPI presented as "EUR inflation from the World Bank"
- **Where:** `rateInfoWorthToday`, all locales (`en.ts:671, es.ts:522, fr.ts:527, pt.ts:526`). EUR uses **German (DEU)** CPI as a Eurozone proxy (`constants.ts`), undisclosed; cumulative 2000→2024 DEU rose ~57% vs Eurozone HICP ~63% (~6pt gap, larger single-year gaps). "real CPI … from the World Bank" is also jargon-dense and technically over-claims the source country.
- **Fix:** soften ("we estimate today's value using official inflation figures for your home currency's region") + optional footnote "the euro uses German inflation as a stand-in."

### UX-6 · P2 · English island — spend-timeline dataset label "EUR Spent"
- **Where:** `Insights.tsx:418` `targetCurr + ' Spent'`. Untranslated in es/fr/pt and stale in "Worth today" mode. The legend is currently `display:false` (`:433`) so it's hidden, but it leaks via tooltips/exports.
- **Fix:** build from `t(mode === 'today' ? 'insights.rateModeToday' : 'insights.rateModeAtTrip')` prefixed with `targetCurr`.

### UX-7 · P2 · Hyper-inflation multipliers shown with no sanity context
- **Where:** `Insights.tsx:206-212`. TRY home, 2010 trip → totals jump ×13.23 (2015 → ×9.06), hero balloons, no caveat — reads alarming/implausible.
- **Fix:** when the trip-level factor exceeds ~3×, append a caveat ("reflects {currency}'s high inflation since {year}") and/or show the multiplier. No hard cap (that would falsify the math).

### UX-8 · P2 · Chart axis ticks aren't locale-formatted
- **Where:** `Insights.tsx:444, :511` prefix `targetSym` onto Chart's default en-US number (period decimal, no grouping) → a fr/pt user sees "€1234" instead of "1 234 €".
- **Fix:** `callback: (v) => formatCurrency(Number(v), targetCurr)`.

### UX-9 · P2 · Same day-of-year across years is indistinguishable on the timeline
- **Where:** `Insights.tsx:407, :487` labels use `{month:'short', day:'numeric'}` — no year. `2016-06-01` and `2026-06-01` both render "Jun 1" (also "May 31" per DATA-4).
- **Fix:** include the year when the trip span crosses a calendar year.

### UX-10 · P3 · Label / jargon nits
- "**Worth today**" is ambiguous (resale value vs inflation-adjusted) — consider "In today's money."
- "**Single Peak**" / "Pico isolado" / "Pic isolé" / "Pico individual" is jargon — it's the single biggest expense → "Biggest expense" / "Maior despesa" / "Plus grosse dépense" / "Mayor gasto."
- "**Currency mix over time**" → "Spend by currency over time" reads clearer.

---

## SECTION 3 — VERIFIED OK (assurance / coverage)

- **Inflation factor math** exact vs real German & Turkish CPI for every year, including all clamps (latest-year, earliest-year walk-down, empty/garbage date, future-year). `Insights.tsx:168-184`. *(Agents A, C)*
- **Two-hop FX** (JPY→EUR→USD) exact: ¥28000 → **$190.52** vs live Frankfurter. No precision loss. *(Agent B)*
- **JPY own-amount** correctly 0-decimal via `formatCurrency` (`:666`). *(Agent B)*
- **Single-foreign-currency gating** — list-only, no 1-slice donut; the earlier wart stays fixed. `:358-363`. *(Agent B)*
- **`currencyOwnTotals`** = nominal spend; **pct** computed off a shared grand total → sums to 100. *(Agent B)*
- **No NaN / Infinity / divide-by-zero** anywhere: CPI=0 filtered at ingest, `rate>0` enforced, daily-avg denominator `|| 1`, `totalDisplay>0` guards. *(Agents C, D)*
- **Server write-validators** reject zero/negative amounts, bad/mixed-case currencies, and uppercase codes on both write paths → most "dirty data" can't even persist. *(Agent D)*
- **Breakdown gating airtight:** all-home → hidden; 99.99%-home + one $0.01 → shows (0% slice is sane); settlements stripped from "real spend"; empty → empty state. *(Agent D)*
- **Reactivity** (fixed earlier this session): async CPI/FX now flow into the totals on first paint.

---

## SECTION 4 — RECOMMENDED FIX ORDER

**Tier 1 — clearly-wrong numbers on screen (do first; low-risk, high-impact):**
- DATA-1 (0-decimal home currency) → route every home figure through `formatCurrency`.
- DATA-2 (Chart.js unrounded/locale-unsafe) → tooltip + axis callbacks via `formatCurrency`/`formatNumber`. (Fixing DATA-1's helper choice naturally feeds this.)
- DATA-3 + DATA-4 + UX-9 (timeline: Invalid Date, UTC off-by-one, no year) → one shared date-label helper reusing `formatDateShort`'s UTC handling, with year when the span crosses years.
- UX-6 (English island `' Spent'`) → tiny `t()` fix.

**Tier 2 — clarity of the inflation story (small copy/logic, needs your taste):**
- UX-2 (surface `rateModeHint` as visible text), UX-1 (label/clean the per-currency row), UX-4 (strengthen the recent-trip note), UX-5 (soften the "EUR = World Bank CPI" over-claim), UX-3 (handle no-CPI-data home currencies).

**Tier 3 — judgment calls / semantics:**
- DATA-7 + UX-7 (how to treat foreign expenses & hyper-inflated homes in "Worth today"), DATA-5 (mixed-source FX fallback), DATA-6 (hasRate gate), DATA-8 (pre-2000 clamp), DATA-9 / UX-10 (nits).

---

## Appendix — agent/persona coverage

| Agent | Persona / lens | Headline findings |
|---|---|---|
| A | "Mei" — EUR long-haul, inflation math | math airtight; UX-5 (German CPI), UX-4 (lag), DATA-8 (pre-2000) |
| B | "Kenji" — USD-home JPY, FX + decimals | FX exact; **DATA-2** (tooltips), DATA-5 (mixed FX), UX-1 |
| C | "Aisha" — unmapped / high-inflation home | no crash; **UX-3** (no-CPI silent), DATA-6 (ISK 1:1), DATA-7, UX-7 |
| D | "Tom" — airtight gating + dirty data | gating solid; **DATA-3** (Invalid Date), **DATA-4** (UTC), UX-9 |
| E | "Lucia" — i18n + clarity (en/es/fr/pt) | **DATA-1** (0-dec), **UX-1/UX-2**, UX-5/6/8, UX-10 |

*Live browser sweep confirmed: hero inflation (€1728→€1908), breakdown render,
ⓘ modal, DATA-2 tooltip ("EUR 1,56…678"), DATA-1 (¥320 505,93).*
