# MONEY findings (agent, confirmed by hand + empirical SQLite test)

## MONEY-1 — P1 Confirmed — Partially-scoped budgets double-count spend (B6 fix incomplete)
- budgets.py:130-153 uses ON CONFLICT(id) only; dedup relies on UNIQUE(user_id,trip_id,category_id,owner_name) but SQLite treats NULL as distinct. Partial index idx_budgets_user_trip_generic only covers BOTH-NULL.
- Empirically: (cat set, owner NULL) and (owner set, cat NULL) can be duplicated → same expenses counted under both budget cards → fake overspend.
- Fix: non-NULL sentinel ('') for unscoped, or two more partial UNIQUE indexes. Mirror in data.py sync.

## MONEY-2 — P2 Confirmed — Fully-scoped duplicate budget → unhandled IntegrityError → 500
- budgets.py:130-153; retry_on_lock only catches OperationalError, not IntegrityError. Case D (both set) duplicate with new id → 500.
- Fix: try/except IntegrityError → 409 clean message.

## MONEY-3 — P1 Confirmed — Balance page shows stale/wrong debts to non-party members
- data.py:1065-1075 ships only settlements where caller is from/to. But balances.ts applies settlements to a shared per-person map incl. all members. A third member never subtracts a settlement between two others → shows already-paid debt + wrong suggested payment graph. Affects every multi-member trip with settlements.
- Fix: ship all trip settlements to all accepted members, OR compute simplified graph server-side and ship per-person balances only.

## MONEY-4 — P2 Confirmed — Per-trip vs cross-trip equal-split use different denominators
- balances.ts:179 (computeTripBalances) roster = current ∪ attributed; :324-336 (computeGlobalBalances) = current companions only. Same split-less expense → different share → views disagree when an on-expense person is no longer a current companion. Live only for legacy/API split-less rows (form always sends splits).
- Fix: identical split-group derivation in both.

## MONEY-5 — P2 Confirmed — simplifyDebts €0.50 epsilon drops sub-50-cent debts
- balances.ts:212-233 _ZERO_EPSILON_EUR=0.5 applied to NET balance, not just residue. A genuine €0.40 debt is invisible/unsettleable; "All settled" can show with real imbalance.
- Fix: tight epsilon (€0.005) for classification; handle FX residue separately.

## MONEY-6 — P2 Confirmed — Server doesn't enforce splits sum ≈ 100
- validators.py:169-205 caps each value [0,100] but never checks sum or key count. Crafted splits {"a":100,"b":100} accepted; readers normalize by Σ so reinterpreted as ratios. Latent contract violation + fuzz vector (no key-count cap).
- Fix: reject |sum-100|>tol; cap key count.

## MONEY-7 — P2 Confirmed — Non-EUR settlement crafted euroValue:0 stores 0 → balance uses raw foreign amount
- settlements.py:190-222 guard only rejects when rate None AND euro_value None; euroValue:0 passes; compute_euro_value returns 0 (0>=0). balances.ts:103 `euroValue || amount` → 0 falsy → raw foreign amount treated as EUR. Needs cold-FX path + crafted client.
- Fix: treat euro_value<=0 as missing for non-EUR; explicit `!= null` fallback.

## MONEY-8 — P2 Confirmed — Home currency forced to EUR outside 17-entry static table
- utils/currency.ts:33-40 getHomeCurrency gates on static CONVERSION_RATES (17 codes) though app supports ~41. THB/EGP/TRY/PLN users silently shown EUR everywhere. Entry dropdowns widened, home/display currency not.
- Fix: gate on hasRate(set) (live ∪ static ∪ EUR).

## Verified CORRECT (don't re-audit)
- compute_euro_value overrides client value when live rate exists, 4-dp round. validate_money rejects NaN/Inf/neg/>1e9. Currency allowlist.
- is_settlement rows excluded from all server aggregates (achievements, pdf total, public share). No backend double-count.
- Split normalization consistent across balances/leaderboard/budget.
- IDOR closed on expenses (UPDATE gates existing row trip_id) and budgets (ownership SELECT). Settlement requires caller+both parties accepted members.
- Optimistic-concurrency staleness gates atomic; tombstone resurrection blocked.
- Settlement delete authz (creator/owner only) + R12-B3 audit trail correct.

Priority: MONEY-3 and MONEY-1.
