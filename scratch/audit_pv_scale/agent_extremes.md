# Present-Value Audit — RISKY EDGES (hyperinflation / exotic currencies / CPI projection)

**Date:** 2026-06-03 · **Scope:** the "Worth today" present-value model at its extremes — high-inflation & exotic currencies + the new CPI projection (`makeInflationFactor` PV-2 + the expanded `CURRENCY_TO_CPI_COUNTRY` PV-8). **Findings-only; no app source modified.**

**Data:** REAL World Bank `FP.CPI.TOTL` (`api.worldbank.org`, last-updated 2026-04-08) + Frankfurter FX (`api.frankfurter.dev`), fetched live and cached to `scratch/audit_pv_scale/cache_extremes.json`. Harness: `scratch/audit_pv_scale/extremes.py` (+ `run.py`) — an EXACT port of `makeInflationFactor` (Insights.tsx L114-150) and the app's real current-FX decision tree (Insights.tsx L382-393 + `utils/currency.ts` `hasRate`/`_rateFor`/`convertCurrency`).

## The model under test
`worthToday = amount × currentHomeLeg × CPI_currency(today)/CPI_currency(year)`, where:
- **currentHomeLeg** follows the app tree: `hasRate(cur)` (live Frankfurter **or** static `CONVERSION_RATES`) → `convertCurrency` (live → static → **1.0**); else **PV-1 fallback → frozen `euroValue`**.
- **CPI(today)** is the latest published WB index **projected** to 2026 using the **latest year-over-year rate**, compounded, **capped at 4 YEARS** (`PROJ_CAP=4`). There is **no cap on the rate itself**.
- Today = 2026; **latest WB CPI year for every country = 2024** → projection always runs **2 steps** right now (3 steps in 2027, hitting the 4-cap in 2028).

---

# BUGS (severity-tagged)

## BUG-A [CRITICAL] — Argentina (ARS) has NO World Bank CPI at all → silent factor 1.0 for the single most inflationary currency in the app
WB `FP.CPI.TOTL` for `ARG` returns **66 rows, every value null** (verified directly; this is the well-known INDEC-manipulation gap — WB/IMF suspended the series). `makeInflationFactor(undefined→{})` returns **`() => 1`**. So for ARS:

| ARS expense | spent (€) | inflFactor | worthToday (€) | today/spent |
|---|---|---|---|---|
| 100 @ 2008 | 20.79 | **1.000** | 20.79 | 1.00 |
| 100 @ 2015 | 9.97 | **1.000** | 9.97 | 1.00 |
| 100 @ 2020 | 1.30 | **1.000** | 1.30 | 1.00 |

Argentina ran **~100–290%/yr** inflation in 2023-2024. The app applies **ZERO** inflation adjustment and shows worthToday ≈ spent. The expanded map added `ARS: 'ARG'` (PV-8) but it buys **nothing** — there is no series behind it. The "Worth today" toggle is silently a no-op for ARS. Worse, ARS also has **no Frankfurter FX** (see BUG-B), so the current-FX leg is the frozen `euroValue` — the entire feature degenerates to `worthToday == euroValue` for ARS. (`TWD`/Taiwan is the same "mapped but empty series" case, lower stakes.)

## BUG-B [CRITICAL] — Currencies with CPI but NO Frankfurter FX apply a huge CPI uplift with NOTHING to offset depreciation → overstatement up to ~90×
The current-FX leg and the CPI leg are supposed to roughly cancel for a depreciating currency (relative PPP). But **8 CPI-mapped currencies have no live Frankfurter rate and aren't in the 17-entry static table**, so `hasRate=false` → PV-1 path → currentHomeLeg = **frozen `euroValue`** (a NOMINAL at-trip EUR value). The CPI factor is then applied on top with **no current-FX depreciation to cancel it**:

**Affected (CPI but no FX): `EGP, VND, ARS, CLP, COP, PEN, AED, SAR`** (ARS additionally has factor 1.0 per BUG-A).

EGP modeled with a realistic frozen `euroValue` (= 100 EGP × real EGP→EUR spot of that year), worthToday = `euroValue × projectedCPI`:

| EGP expense | euroValue frozen (€) | CPI factor | worthToday app (€) | reality: 100 EGP today ≈ €1.80 | overstated |
|---|---|---|---|---|---|
| 100 @ 2008 | 13.00 | 12.76 | **165.93** | 1.80 | **~92×** |
| 100 @ 2015 | 11.50 | 6.55 | **75.29** | 1.80 | ~42× |
| 100 @ 2020 | 5.40 | 3.39 | **18.28** | 1.80 | ~10× |
| 100 @ 2023 | 3.00 | 2.11 | 6.33 | 1.80 | ~4× |

EGP's CPI rose ~12× since 2008 **because** the pound collapsed (~0.13 → ~0.018 €/EGP). The app multiplies the CPI uplift onto a euroValue that is **also** frozen at the old strong rate, and never marks it to today's weak rate. Result: a 2008 EGP meal "worth today" **€166** when 100 EGP is worth **€1.80**. This is the worst class in the audit — direction AND magnitude are wrong, and it's silent.

## BUG-C [HIGH] — Projecting the latest year-over-year RATE forward compounds hyperinflation; the 4-year cap is on YEARS, not on the RATE
`annualRate = CPI[latest]/CPI[latest-1]`, then `today = latest × annualRate^min(yearsAhead, 4)`. Real latest (2024) YoY:

| cur | latest YoY% | steps now (2026) | projMult now | projMult at cap (4yr, e.g. 2028) |
|---|---|---|---|---|
| **TRY** | **58.5%** | 2 | **×2.51** | **×6.31** |
| **EGP** | **28.3%** | 2 | **×1.65** | **×2.71** |
| COP | 6.6% | 2 | ×1.14 | ×1.29 |
| BRL/ZAR/CLP | ~4.4% | 2 | ×1.09 | ×1.19 |
| VND | 3.6% | 2 | ×1.07 | ×1.15 |

The projection assumes the **most recent single year's** inflation **persists for up to 4 years**. For TRY a same-year (2024) expense already gets **×2.51 from projection alone today**, rising to **×6.31** once the cap is hit. If 2024's print had been a spike (Argentina-style 150–290%), `annualRate^4` would be **×9–×80**. The 4-year cap bounds the number of compounding steps but **does nothing to bound a single absurd rate** — one bad/volatile latest print poisons every expense in that currency. A noisy or rebased latest YoY (see BUG-D) feeds straight into `annualRate` and gets compounded.

## BUG-D [HIGH] — WB CPI rebasing / hyperinflation history creates giant in-series jumps; pre-redenomination + old-base years yield 100–2500× factors
The WB series is a **single chained index per country**, but for countries with hyperinflation history the early years sit near **0.00** and the index climbs by orders of magnitude — so `CPI[latest]/CPI[oldYear]` explodes. Real max single-year jumps found in-series (`maxYoY`):

| cur | max in-series YoY jump | at | note |
|---|---|---|---|
| PEN (Peru) | **×75.8** | 1990 | hyperinflation; series chained but near-zero base |
| BRL (Brazil) | **×30.5** | 1990 | 9 consecutive >3× jumps 1985-1994 (cruzado/cruzeiro/real chain) |
| HRK (Croatia) | ×16.0 | 1993 | post-Yugoslav hyperinflation |
| IDR (Indonesia) | ×12.4 | 1966 | |
| BGN (Bulgaria) | ×11.6 | 1997 | lev crisis |
| CLP, PLN | ×6.0, ×6.7 | 1974, 1990 | |

These are **not** rebasing artifacts (the index is continuous/chained, so `CPI[latest]/CPI[Y]` is mathematically valid), but combined with **redenomination** (the currency dropped zeros, but the CPI index is expressed in NEW-currency terms) the app produces nonsense for any expense dated before the redenomination:

| cur | expense year | inflFactor | worthToday for 100 units (today-leg × factor) | redenomination |
|---|---|---|---|---|
| **TRY** | 1995 | **2549.3** | **€4,765** | dropped 6 zeros in 2005 (1e6 old = 1 new) |
| TRY | 1998 | 412.2 | €770 | |
| TRY | 2004 | 54.6 | €102 | (pre-redenom new-lira terms) |
| **BRL** | 1993 | **239.7** | — (no pre-1999 FX) | real 1994 (2750 cruzeiro real = 1 real) |
| **RON** | 1995 | 74.0 | — | heavy 2005 (1e4 old = 1 new) |

The WB TRY index is smooth across 2005 (2003:56.1 → 2004:60.9 → 2005:65.9 → 2006:72.2) — i.e. it is **chained in NEW-lira terms and does NOT encode the 1,000,000× redenomination**. So if a user logs "100 TRY" dated 1995 meaning 100 **old** lira (~€0.002 at the time), the app treats it as 100 **new** lira and applies the 2549× factor → **€4,765**. Off by ~9 orders of magnitude. The app has no concept of redenomination boundaries.

## BUG-E [MEDIUM] — Pre-1999 expenses: Frankfurter has no FX before 1999, so "Spent" silently falls back to the frozen euroValue while "Worth today" still applies a 100–2500× CPI factor
Frankfurter's earliest date is 1999-01-04 (verified: `histFX(1TRY=EUR)` returns `None` for 1998/1995). For any pre-1999 expense the **Spent** leg drops to `euroValue ?? convertCurrency(...)` (write-time frozen / static), but **Worth today** still multiplies by the full CPI factor (TRY 1995 → 2549×, BRL 1998 → 5.2×, RON 1995 → 74×). The two legs are computed on inconsistent bases (frozen nominal vs projected real), so the "X% pricier/cheaper today" hero is meaningless for pre-1999 dates. Not hyperinflation-specific but amplified by it.

## BUG-F [LOW/MEDIUM] — Static `CONVERSION_RATES` (~2yr stale) is used as the current-FX leg for BRL/ZAR/IDR/etc. when live FX is down
For the 17 static-table currencies, if the live Frankfurter overlay hasn't loaded (or fails), `convertCurrency` uses the bundled `CONVERSION_RATES` (e.g. `BRL: 0.18`, `ZAR: 0.049`) — ~2 years stale. For a fast-depreciating currency that's a meaningful error on the "today" leg, compounded by the CPI factor. Degraded-mode only, but silent. (Most of these also have live FX, so this only bites during outages / before boot fetch settles.)

---

# FX availability vs CPI availability — the full mismatch matrix (Q4)
- **Server allows 41 currencies. Live Frankfurter covers 29. Static table covers 17. CPI-mapped covers 41 (but 2 are empty series).**
- **CPI but NO FX (live or static) → PV-1 euroValue path, CPI applied with no FX offset → BUG-B:** `AED, BGN, CLP, COP, EGP, HRK, PEN, SAR, VND` (9). `ARS` also here but with factor 1.0 (BUG-A).
- **FX but NO CPI → CPI factor 1.0, no inflation:** `ARS` (no series despite map), `TWD` (no series despite map). Every other live/static currency has a CPI series.
- **CPI + live FX (the double-discount family, BUG-1 territory):** `TRY, BRL, ZAR, IDR, ILS, ...` — TRY is the acid case: today-leg €1.87 for 100 TRY × CPI 38× = €71.66 vs €52.27 spent (ratio 1.37); the result is governed by the FX-vs-CPI race, not real purchasing power.
- Note: BGN/HRK have **no live Frankfurter** even though BGN is EUR-pegged and HRK was retired (Croatia joined the euro 2023) — both fall to PV-1.

---

# Per-currency verdicts (acid tests bolded)

| cur | CPI series | Frankfurter FX | verdict |
|---|---|---|---|
| **ARS** | **NONE (66 null rows)** | **NONE** | **BROKEN: factor 1.0 + euroValue leg → worthToday == euroValue, zero inflation for ~150-290%/yr currency. CRITICAL.** |
| **TRY** | 1960-2024, smooth, ×1322 since base | live | **Double-discount + projection ×2.51 (→×6.31 at cap); pre-2005 redenom → factor 2549× nonsense. HIGH.** |
| **EGP** | 1960-2024, ×624 | **NONE** | **PV-1 path: CPI ×12.8 on frozen euroValue, no FX offset → 2008 expense overstated ~92×. CRITICAL.** |
| **VND** | 1995-2024, ×1.9 since 2008 | **NONE** | PV-1 path; lower inflation so overstatement milder (~2.4× at 2008) but still no FX mark-to-today. HIGH. |
| **BRL** | 1980-2024, 9 huge jumps 1985-94 | live | Double-discount; pre-1994 real-redenom → factor 240× for 1993. Modern years plausible (1.05-1.16). MEDIUM. |
| **ZAR** | 1960-2024 | live + static | Double-discount; modern years plausible (1.17-1.58). Static fallback stale. LOW-MEDIUM. |
| CLP/COP/PEN | present | **NONE** | PV-1 path (BUG-B). PEN has ×75 in-series jump (1990) → pre-1991 expenses nonsense. |
| AED/SAR | present | **NONE** | PV-1 path, but both are USD-pegged & low-inflation → overstatement small; still structurally wrong leg. |
| TWD | **NONE** | NONE | factor 1.0 (mapped but empty series), low stakes. |

---

# Recommendations (concrete)

1. **[CRITICAL] Cap / dampen the projection RATE, not just the years.** `annualRate` should be clamped to a sane band (e.g. `min(annualRate, 1.15)` → max 15%/yr projected, or use a 3-year geometric mean of YoY instead of the single latest year). The 4-year step cap is insufficient: one volatile latest print (TRY 58.5%, or an ARS-style 150%) compounds to ×6–×80. A trailing-average + rate cap kills the worst tail.

2. **[CRITICAL] Detect "mapped but empty" CPI series and surface it, don't silently return 1.0.** ARS and TWD map to countries with no usable `FP.CPI.TOTL`. Either (a) drop them from `CURRENCY_TO_CPI_COUNTRY` so the UI shows the existing `cpiUnavailable` note, or (b) fall back to a regional/IMF series. As-is the toggle is a silent no-op for the highest-inflation currency the app supports.

3. **[CRITICAL] Fix the PV-1 path for depreciating currencies (EGP/VND/CLP/COP/PEN/ARS).** Applying a CPI uplift to a frozen nominal `euroValue` with NO current-FX leg is the ~92× EGP bug. Options: (a) require a current FX rate before applying any CPI factor (no FX → show euroValue, factor 1, with an "FX unavailable" note); (b) source FX for these from an alternate feed; or (c) adopt the **home-CPI present-value model** (`spentHome × CPI_home[today]/CPI_home[year]`) recommended in the prior `agent_auto.md` BUG-1 — it needs no foreign FX leg at all and is immune to both the double-discount and the no-FX cases.

4. **[HIGH] Handle redenomination boundaries / pre-1999 dates.** Either refuse the CPI factor for expense years before the currency's last redenomination (and before 1999 where Frankfurter has no FX), or cap the total factor (e.g. clamp `factor ≤ 50`). A worthToday of €4,765 for a 100-TRY 1995 entry is indefensible. At minimum, gate the "Worth today" toggle off for pre-1999 expenses where the Spent leg itself is a frozen-fallback.

5. **[MEDIUM] Reconcile the three currency lists.** 41 allowed vs 29 live vs 17 static vs 41-but-2-empty CPI. Any currency offered in the expense dropdown but lacking BOTH live FX AND CPI will silently mis-value. Trim `_ALLOWED_CURRENCIES` to what can be valued, or wire the missing FX/CPI sources.

6. **[LOW] Bound the static fallback / mark degraded.** When the current-FX leg uses stale `CONVERSION_RATES`, tag the figure as approximate so a stale BRL/ZAR rate × CPI factor isn't presented as precise.

---

## Reproduce
```
./.venv/bin/python3 scratch/audit_pv_scale/run.py        # full tables, real data (cached)
```
Harness: `scratch/audit_pv_scale/extremes.py` · cache: `scratch/audit_pv_scale/cache_extremes.json`.
All numbers above are from live WB CPI (lastupdated 2026-04-08) + Frankfurter, today pinned 2026.
