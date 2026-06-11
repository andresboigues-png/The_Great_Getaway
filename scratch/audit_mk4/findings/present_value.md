# MK4 audit — PRESENT VALUE (FX + inflation "Worth today")

**Scope:** the pure present-value engine (`utils/presentValue.ts`) + its unit tests,
the Insights consumer (`pages/insights/Insights.tsx`), the manual per-year rate editor
(`pages/settings/RatesEditor.tsx`), the manual-rate/override data models
(`utils/manualRates.ts`, `utils/fxOverrides.ts`), CPI/FX fetch (`api/misc.ts`),
server FX cache (`src/fx_rates.py`), the `/api/fx-rates` endpoint
(`src/routes/integrations.py`), and the load-path sanitizers (`state.ts`).

**Method:** whole-file read of every file above; full dedupe read of the THREE prior
present-value audits (`audit_insights/`, `audit_insights_mk3/`, `audit_present_value/`,
`audit_pv_scale/`) — all PV-1..8 / PV-S1..S9 / IA-1..10 / D-1..D-6 confirmed FIXED or
consciously-accepted in code. **REPRODUCED** via 3 throwaway Vitest harnesses
(34 assertions) on the real module: a rich 8-currency × 2015→2026 basket (EUR-home and
USD-home), the full manual/auto precedence matrix, no-FX Model-B, hyperinflation
projection, redenomination clamp, deflation, clock-skew, mid-gap CPI walk-down, and
corner manual-override interactions. The shipped `presentValue.test.ts` (21) + my
harnesses (30) = **51 assertions all green**.

**Verdict (professional grade): PASS, with a tight cluster of minor honesty gaps.**
The money math is correct and internally consistent to the cent across every mode,
home currency, and edge case I could construct. Totals reconcile (Σ of per-row legs ==
hero in both modes); the chart / readout / per-row breakdown all derive from one
`convertedExps` map so they cannot disagree; the no-FX Model-B fallback, the 100×
redenomination clamp, the 3-yr-geomean projection (capped 4yr), the ≥0 inflation floor,
the NaN-override guard, and the historical/static mixed-source guard all behave exactly
as the prior audits' fixes intended. The invariant holds: **only Insights applies
FX+CPI**; settlements/budgets read nominal `euroValue`; the server serves FX only (CPI
is browser-direct). No P0/P1. The defects below are **3 net-new P2/P3** honesty/consistency
gaps in the *manual* layer and one *carry-over* (accepted) per-currency warning gap.

---

## NET-NEW FINDINGS

### PV4-1 · P2 · Bug · Manual inflation % for a no-FX currency is SILENTLY DROPPED in "Worth today"
- **Where:** `utils/presentValue.ts:224-238` (the worth-today branch order).
- **What:** For a currency with NO live/static FX (ARS, EGP, VND, CLP, COP, PEN, AED,
  SAR…), if the user pins a per-year **inflation %** in Settings → Personalization but
  does NOT also pin a current-year **FX**, that manual inflation is never applied. The
  precedence is: per-trip override → manual *current-year FX* (`manualNowFx`) → `hasRate`
  Model A → **else Model B**. A no-FX currency with only a manual inflation falls to the
  Model-B `else` branch (line 233-237), which grows the frozen `euroValue` by
  `inflationFactorFor(targetCurr, …)` — the **HOME** currency's factor — so the
  currency's own manual inflation (keyed under e.g. `ARS`) is looked up for the home
  code and missed entirely.
- **Why it matters:** ARS/EGP are precisely the high-inflation currencies where a user
  is most likely to hand-enter inflation because the auto CPI is missing/unusable
  (ARS has an empty World-Bank series). They enter, say, ARS +100% for 2018, save, and
  "Worth today" shows **no change at all** for those rows — the feature appears broken
  for the one case it most needs to work. The Settings editor even renders the inflation
  input for these currencies (it's not gated on `hasRate`), so the affordance promises
  something the calc won't deliver.
- **Tag:** **[REPRODUCED]** — `_mk4_pv_probe.test.ts` PROBE 1: manual ARS +100% / 2018
  with no manual FX → `todayValue == euroValue (120)`, i.e. factor 1.0. Adding a manual
  2026 FX flips it into Model A and the +100% then applies (→ 100). So the inflation is
  reachable only by *also* pinning an FX the user may not know.
- **Fix:** in the Model-B branch, prefer the EXPENSE currency's own manual inflation
  when present, before falling back to the home factor — e.g.
  `const homeFactor = hasManualInflation(curUp) ? inflationFactorFor(curUp, date) : inflationFactorFor(targetCurr, date);`
  (or, more simply, always use `inflationFactorFor(curUp, …)` in Model B — it already
  returns the home/auto factor when the currency has neither manual nor CPI data, and
  honours a manual entry when present). Keeps Model B's "no foreign FX needed" property
  while respecting an explicit user override.

### PV4-2 · P3 · Design · Settings FX rate hint shows TODAY's rate for every historical year row
- **Where:** `pages/settings/RatesEditor.tsx:115-119` (`autoHint`, `isFx` branch).
- **What:** The "auto ≈ N {home}" placeholder for an FX row is
  `convertCurrency(1, selectedCur, home)` — the **current** live rate — regardless of
  the row's year. So a user adding a **2015** USD-FX row sees today's ≈0.92 EUR as the
  "automatic" value, even though the calc's actual auto for a 2015 expense's *Spent* leg
  uses the **2015 historical** Frankfurter rate (~0.89). The inflation-mode hint
  (line 123) correctly uses the per-year CPI factor; only the FX hint is year-agnostic.
- **Why it matters:** the placeholder is the user's only signal of "what am I overriding."
  For historical years it suggests a wrong baseline, so a user who types the hinted value
  (or trusts that "blank == this number") silently pins the *current* rate onto a
  past-year expense — re-introducing an era-mix the at-trip historical FX was designed to
  avoid. Cosmetic in that the calc itself is right when the field is left blank, but the
  hint mis-teaches.
- **Tag:** **[TRACED]** — `autoHint` ignores `year` in the `isFx` path; `rateCache`
  (the only historical-FX source) isn't fetched by the editor, so a correct per-year hint
  isn't available without a fetch.
- **Fix (Design — needs taste):** either (a) label the FX hint as "current rate" / drop
  it for non-current years (honest about the limitation), or (b) lazily fetch the
  historical rate for the row's year (mirrors the inflation hint's lazy CPI fetch) and
  show the real per-year auto.

### PV4-3 · P3 · Design · Manual current-year FX (`manualNowFx`) ignores a manual current-year inflation, pairing with EXPENSE-year CPI instead
- **Where:** `utils/presentValue.ts:227-230`.
- **What:** When a manual *current-year* FX is pinned (the escape hatch that puts a no-FX
  currency on Model A), the today leg is
  `value × manualNowFx × inflationFactorFor(curUp, e.date)` — i.e. the FX is the
  **current-year** manual number but the inflation factor is keyed on the **expense's**
  year/date. That's correct for the auto/historical reading (grow the expense by its own
  ageing). But it means a manual inflation the user pinned for the **current** year is
  never consulted on this path, and there's no single field that says "the cumulative
  inflation to apply." Combined with D-2 (manual inflation is cumulative-to-today and
  doesn't auto-advance), the two manual fields interact in a way that's hard to reason
  about: FX is "now", inflation is "from the expense year."
- **Why it matters:** low — it's self-consistent and only bites a power user mixing both
  manual fields on the same currency. Flagging for completeness of the manual-surface
  semantics, which the prior audits noted as muddy (D-2/D-3) but didn't pin at this exact
  line.
- **Tag:** **[REPRODUCED]** — `_mk4_pv_probe.test.ts` PROBE 1b / PROBE 5 show the
  expense-year inflation pairing with the current-year manual FX.
- **Fix (Design):** document the two-field model in the editor copy (FX = today's rate;
  inflation = cumulative since the expense year), or unify into one "value-today
  multiplier" per currency. No code-correctness change required.

---

## CARRY-OVER (prior finding, consciously accepted — NOT re-reported as net-new)

- **`cpiUnavailable` still keys ONLY on the home currency** (`Insights.tsx:231-232`).
  This is prior PV-8 / PV-S2 / D-4 ("the no-data note is home-only; a EUR-home user with
  ARS/TWD expenses gets no per-currency warning"). It was NOT regressed — it was resolved
  by a **generic** disclaimer in the ⓘ modal instead of a per-currency note
  (`en.ts:710` valueTodayInfoOldRates: "currencies/years with no data aren't adjusted"),
  and the empty-CPI currencies (`ARS:'ARG'`, `TWD:'TWN'`) were left mapped rather than
  dropped (`constants.ts:165`). Mentioned for honesty; **interacts with PV4-1** — a
  no-FX/no-CPI currency both (a) gives no per-currency warning and (b) silently ignores a
  manual inflation, so it's doubly opaque. If PV4-1 is fixed, the residual opacity is just
  the missing per-currency note. Per dedupe rules I am not counting this as a new finding.

---

## VERIFIED CORRECT (high confidence — assurance / coverage)

- **Core math** = `nominal × FX × (CPI_now/CPI_year)` applied in the right order, right
  base currency, both legs in HOME currency. Hand-checked: USD-2015 EUR-home Spent €89
  (hist 0.89) / Worth €119.6 (0.92 × 1.30); EUR-2020 home Worth = 200 × 125/106; JPY
  USD-home two-hop both legs. **[REPRODUCED]**
- **Totals reconcile** — Σ per-row spentValue/todayValue == the mapped sum to 1e-9, no
  NaN/Inf, in both modes. Chart / readout / per-row breakdown all read the same
  `convertedExps`, so they cannot diverge by construction. **[REPRODUCED + TRACED]**
- **Automatic FX** — historical rate fetched per expense date (frozen in `rateCache`,
  nearest-prior business day via `api/misc.ts:355-375`); both legs from the same fetch or
  neither (DATA-5 mixed-source guard at `presentValue.ts:199-207`). **[REPRODUCED]** (PROBE 3)
- **CPI projection (PV-2/PV-S5)** — projects to the CURRENT year at the **3-yr geometric
  mean**, capped 4 years; falls flat (rate 1) when the 3-yr-prior index is absent
  (conservative). Mid-series gaps walk DOWN to the nearest prior year; deflation allowed
  both directions; clock-skew anchors "today" to `currentYear`. **[REPRODUCED]** (`_mk4_pv_cpi.test.ts`, 6 cases)
- **No-FX fallback (PV-1/PV-S2/PV-S3)** — Model B grows the frozen `euroValue` by HOME
  CPI; EGP (CPI-mapped, no-FX) correctly uses ~1.20× home, NOT the ~2.4× foreign CPI that
  caused the ~92× overstatement. ARS (empty CPI) → factor 1 on euroValue. **[REPRODUCED]**
- **Factor clamp (PV-S6)** — redenomination 5000× → clamped to MAX_INFLATION_FACTOR=100.
  Negative manual inflation floored at 0 (PV-5). **[REPRODUCED]**
- **Manual overrides flow into BOTH legs** — manual per-year FX overrides the Spent
  historical FX; manual current-year FX drives the today FX; manual per-year inflation %
  beats auto CPI for that year; per-trip override > global manual > auto precedence holds.
  Mixing manual on one year + auto on another (same currency) works. **[REPRODUCED]** (8 cases)
- **NaN/corrupt-override guard (IA-1)** — non-finite per-trip override → falls through to
  auto; load-path sanitizer (`state.ts:146-188`) drops non-finite/non-positive entries
  for BOTH `fxOverridesByTrip` and `manualRates` on boot. **[TRACED]**
- **Home-currency change migration (PV-6)** — exactly ONE home-currency write site
  (`Profile.tsx:886`); it calls `clearAllManualFx()` + `clearAllFxOverrides()` on change
  (manual inflation %, being home-independent, is kept) and toasts the user. At the pure
  level, `manualFxFor` returns 1 for the home currency, so a stale same-code manual FX is
  ignored. **[REPRODUCED + TRACED]**
- **Edge cases** — undated/future/pre-1900 → CPI factor 1 (undated excluded from the
  time-series at `Insights.tsx:614-620, 731-733`, IA-5); zero → zero both legs;
  single-year basket reconciles; `??`-respect of a frozen euroValue of 0 (C1). **[REPRODUCED]**
- **Scale/perf (PV-S1/S9)** — CPI gate races a 4s timeout (`Insights.tsx:208-216`) +
  6s per-fetch timeout + presence-based negative-cache so empty-series currencies don't
  re-stall (`api/misc.ts:407-447`); auto-factor memoised per currency in the calc;
  O(n) one map + reduces. `getHomeCurrency` resolves against live+static via `hasRate`
  (no EUR coercion for SEK/NOK/THB/TRY homes). **[TRACED]**
- **Charts at scale (PV-UX1/UX2)** — per-currency donut + stacked cap at top-8 + "Other"
  with a 12-colour palette; stacked is by-period (year/month) bars (IA-6); undated dropped
  from the date axis (IA-5). **[TRACED]**
- **Honesty of presentation (D-1/D-3/D-5/D-6/PV-UX3)** — Worth-today prefixed with "≈";
  budget card labelled NOMINAL; ⓘ explains FX+CPI move both ways + generic no-data
  caveat; ⓘ representative inflation is spend-weighted (not max). **[TRACED]**
- **Invariant** — no settlement/budget/expense code imports the present-value module or
  `cpiCache`; balances.ts uses nominal `euroValue`; `/api/fx-rates` serves FX only, no CPI.
  **[TRACED]**

---

## Out-of-scope note passed to other agents
- `pages/settlement/balances.ts:90` uses `settlement.euroValue || settlement.amount`
  (`||`, not `??`) where the expense paths (`:183, :398`) use `??` — a frozen
  settlement euroValue of 0 would fall through to `amount`. Degenerate (€0 settlement),
  settlement-engine scope, not present value. Spawned as a separate task for the
  settlements auditor.
