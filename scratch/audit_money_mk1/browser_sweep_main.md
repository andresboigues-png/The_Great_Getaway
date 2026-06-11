# Money audit MK1 — Browser sweep (main agent, :5151, locale=pt)

Live visual/interaction check of the 4 money surfaces on the SHIPPED code (fresh-seeded trip-lisbon:
8 expenses €970.61, 2 budgets, 1 settlement €45 Sara→Alex). No bugs found — every surface renders
correctly and the math reconciles. This complements the 5 API/math persona agents (5152–5156).

## WORKS — verified live (all the shipped fixes hold visually)

**Budgets page ("Orçamentos")** — math correct:
- GERAL (overall): spent **€970,61** / allocated €1450 → BUG-6 union holds (each expense counted ONCE; the
  overlapping trip-total + Food budgets don't double it to €1095). Remaining €479,39 ✓.
- Food budget: spent **€124,51** = Pastéis 9.60 + Fado 84.00 + Rooftop drinks (36 USD → €30.91) — confirms
  foreign-currency expenses convert via euroValue into budget spend (the `?? value` read change is fine). 50% ✓.
- Total-trip budget: 970.61/1200 = 81% → "perto do limite" (orange) tier ✓.

**Insights ("Análises")** — every card correct + reconciles:
- Hero total: **€970,61 · 8 transações** ✓.
- By-category: shows **🏷️ Flights** and **🏯 Shopping** as distinct named slices (T3-1 synthetic fallback) —
  no bare gray "Unknown"; Food/Transport/Accommodation resolve by name ✓.
- Daily-average: **€0,00/dia** — correct, because all seed expenses are future-dated (11–14 Jun vs today
  1 Jun); pre-fix (D3) this overstated to ~€970/day. ✓
- Timeline ("Cronologia de gastos"): clean area chart, correct UTC date axis 11/06–14/06, no Invalid Date ✓.
- By-currency ("Gasto por moeda"): **EUR €939,70 (97%)** + **USD $36,00 ≈ €30,91 (3%)** — USD own-amount uses
  the **`$` glyph** (T3-2, was "USD"), and €939.70 + €30.91 = **€970.61** = hero total (cross-surface consistent). ✓
- Net-balance ("Quem deve a quem"): **Alex recebe €440,31 / Sara deve €440,31** — settlement-adjusted (the €45
  is applied), matching the Settle-up page exactly (D1/D4) ✓.

**Settle-up ("Acertos de contas")** [verified in the integration-audit browser pass, still holds]:
- One-click "Liquidar" creates a REAL /api/settlements row (not a fake expense); balances repaint on one click;
  header "+ mais a receber / − deve mais" reads ±440,31 matching the list (was ±485,31 pre-D1).

**Expenses form** — no-rate currency (T3-3): VND selectable; selecting it reveals the localized "Montante em EUR"
field; a VND 270000 / €9.50 expense persists with euroValue=9.5 (verified end-to-end earlier).

**B1 delete-after-settle warning**: deleting an expense on trip-lisbon (which has a settlement) shows the
settlement-aware confirm — *"Esta viagem já tem acertos registados. Apagar esta despesa recalcula os saldos
de todos — poderás ter de acertar contas outra vez."* (correctly localized pt). ✓

## DESIGN nits (minor, non-blocking)
- Budget card titles truncate ("Lisbon Getaway · …") on the narrow card — the trip+category label is clipped.
- (Carry-over) no-rate-currency support exists for EXPENSES but not BUDGETS or SETTLEMENTS — flagged for the
  persona agents to confirm whether that's a usable gap.
