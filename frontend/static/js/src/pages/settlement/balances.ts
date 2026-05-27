// pages/settlement/balances.ts
//
// Pure (no DOM, no events) balance + simplification math for the
// settlement page. Pulled out of pages/settlement.ts in B1's split
// pass so the host file stays under the 800-line bound. Each function
// takes only data as input and returns only data — no side effects.
//
// The per-trip and cross-trip views in settlement.ts share these
// implementations, which is why they're factored at this level
// rather than inlined into one of the renderers.

import { STATE } from '../../state.js';
import {
    getTripCompanionNames,
    findTripCompanionByLinkedUser,
} from '../../companions.js';
import type { Settlement } from '../../types';


/** Apply a server-side `Settlement` row to a per-person balance map.
 *
 *  FIXING_ROADMAP §4.5 retirement of the dual-write: pre-cleanup,
 *  `settleDebt` pushed a synthetic "isSettlement" expense row into
 *  STATE.expenses AND posted to /api/settlements, because the balance
 *  math here only knew how to read expenses. The fake-expense row was
 *  load-bearing for the balance shift.
 *
 *  After cleanup, `settleDebt` for user-linked companions writes ONLY
 *  to STATE.settlements (via the server). This helper produces the
 *  same balance shift that the fake-expense pattern produced, but
 *  reading from the server settlement row directly:
 *
 *    fromUserId paid toUserId `amount`:
 *      balances[fromName] += amount   (they paid out → +owed)
 *      balances[toName]   -= amount   (they received → no longer owed)
 *
 *  Name resolution: walks `trip.companions[].linkedUserId` to map the
 *  settlement's user_ids back to the companion names the balance map
 *  is keyed by. If either side doesn't resolve (e.g. the settlement
 *  involves the trip owner, who isn't in the companions list), the
 *  helper silently skips the row — the balance stays where it was,
 *  no double-counting risk. This matches the modal's pre-existing
 *  scope (companions only, not owners).
 *
 *  Legacy isSettlement expense rows (from before §4.5 frontend
 *  wiring shipped) STAY in STATE.expenses and continue to drive the
 *  balance via the regular expense math. Combined with this helper,
 *  the math handles both pre-§4.5 settlements (expense path) and
 *  post-§4.5 settlements (server path) correctly without
 *  double-counting because new writes only land in ONE store. */
export function applySettlementToBalances(
    balances: Record<string, number>,
    settlement: Settlement,
    trip: any,
): void {
    // 2026-05-26 (audit S1 + S6): prefer the snapshotted display
    // names on the settlement row. Pre-snapshot, this helper depended
    // entirely on findTripCompanionByLinkedUser() — so if either
    // party had been unlinked from the trip after the settlement was
    // recorded, the lookup returned undefined and the settlement was
    // silently skipped from balance shifts (the debt persisted in
    // the UI even though the payment was recorded). The server now
    // ships `fromName` / `toName` snapshots on every new row + a
    // backfill for legacy rows; use those first, fall back to the
    // companion-roster lookup for any null fields the migration
    // couldn't reach.
    //
    // R2 audit fix: the server's snapshot uses `users.name` (the FULL
    // Google display name, e.g. "Alice Smith"), but the OWNER's
    // companion entry is stored under their FIRST NAME only (the
    // self-stamp at api.ts ~286 splits on whitespace). So for any
    // settlement where the trip owner is a party, `settlement.fromName`
    // would be "Alice Smith" but `balances["Alice Smith"]` is undefined
    // (roster only has "Alice"), and the settlement was silently
    // dropped from balance math — the debt stayed visible after
    // payment. Resolution: when the snapshot name misses, try the
    // companion-lookup, which IS keyed on the roster-side name.
    let fromName: string | undefined = settlement.fromName || undefined;
    if (!fromName || balances[fromName] === undefined) {
        const found = findTripCompanionByLinkedUser(trip, settlement.fromUserId)?.name;
        if (found && balances[found] !== undefined) fromName = found;
    }
    let toName: string | undefined = settlement.toName || undefined;
    if (!toName || balances[toName] === undefined) {
        const found = findTripCompanionByLinkedUser(trip, settlement.toUserId)?.name;
        if (found && balances[found] !== undefined) toName = found;
    }
    if (!fromName || !toName) return;
    // R3-Round 2 fix: SEED missing roster entries instead of silently
    // dropping the settlement. The expense-side path already does this
    // for removed companions (via `removedFromRoster`); pre-fix the
    // settlement side just returned, so a settlement involving a
    // companion who was later removed left the original debt visible
    // forever as if the payment never happened. Now: if the snapshot
    // name resolves to a person not in the live roster, we create a
    // zero balance for them so the +=/-= below applies cleanly.
    if (balances[fromName] === undefined) balances[fromName] = 0;
    if (balances[toName] === undefined) balances[toName] = 0;
    // euroValue is the cross-currency-normalised amount the balance
    // math uses everywhere else. Falls back to `amount` only when
    // euroValue is null (older / non-EUR rows that pre-date the
    // server's conversion logic).
    const amount = settlement.euroValue || settlement.amount || 0;
    balances[fromName]! += amount;
    balances[toName]! -= amount;
}

/** A single debt → creditor settlement edge produced by simplifyDebts. */
export interface SettlementDebt {
    from: string;
    to: string;
    amount: number;
}
interface BalanceEntry {
    person: string;
    amount: number;
}

/** Compute per-person balance for a single trip (positive = is owed,
 *  negative = owes).
 *
 *  Audit fix (2026-05-26): augment the roster with names referenced
 *  by existing expenses (in `who` or `splits` keys), not just the
 *  trip's current companion list. Pre-fix, when a companion was
 *  removed from a trip, every expense paid by or split with that
 *  person was SILENTLY dropped from the balance (the
 *  `balances[exp.who] !== undefined` guard skipped them). The
 *  expense still appeared in History but contributed nothing to
 *  the balance — money vanished with no UI signal.
 *
 *  Now we union (current companions) ∪ (expense-attributed names);
 *  the returned `roster` includes "ghost" entries for removed
 *  companions so the balance math accounts for them. The renderer
 *  can label entries not in the live companion list with "(removed)"
 *  by comparing against `tripCompanionNames` returned alongside. */
export function computeTripBalances(trip: any) {
    if (!trip) return { balances: {}, roster: [], expenses: [], removedFromRoster: [] };
    const tripExps = (STATE.expenses || []).filter((e) => e.tripId === trip.id);
    const tripCompanionNames = getTripCompanionNames(trip);
    const expenseAttributedNames = Array.from(
        new Set(
            tripExps
                .flatMap((e) => [e.who, ...Object.keys(e.splits || {})])
                .filter(Boolean),
        ),
    );
    const roster = Array.from(
        new Set([...tripCompanionNames, ...expenseAttributedNames]),
    );
    const removedFromRoster = expenseAttributedNames.filter(
        (n) => !tripCompanionNames.includes(n),
    );

    const balances: Record<string, number> = {};
    roster.forEach((p) => (balances[p] = 0));

    for (const exp of tripExps) {
        const amount = exp.euroValue || exp.value || 0;
        if (balances[exp.who] !== undefined) balances[exp.who]! += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            // 2026-05-25 (audit S5): normalise splits to sum to 100%
            // before applying. Without normalisation, a 33/33/33 (=99%)
            // entry leaked 1% of every expense; the simplifyDebts 0.01
            // epsilon below couldn't catch it because the drift is
            // structural, not numerical. Now we divide each percentage
            // by the actual sum, so any near-100 entry self-corrects
            // and the balances always close to zero (modulo rounding).
            const totalPct = Object.values(exp.splits).reduce(
                (s, p) => s + Number(p || 0),
                0,
            );
            const denom = totalPct > 0 ? totalPct : 100;
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (balances[person] !== undefined)
                    balances[person]! -= amount * (Number(pct) / denom);
            }
        } else {
            // No-splits fallback: equal share across the roster.
            const share = amount / Math.max(roster.length, 1);
            roster.forEach((p) => {
                if (balances[p] !== undefined) balances[p]! -= share;
            });
        }
    }

    // §4.5 retirement of the dual-write: apply server-side settlements
    // for this trip on top of the expense-derived balances. New
    // settlements (post-§4.5) live in STATE.settlements; legacy
    // isSettlement expense rows (pre-§4.5) ride the expense loop
    // above. New writes only land in ONE store so no double-counting.
    const tripSettlements = (STATE.settlements || []).filter(
        (s) => s.tripId === trip.id,
    );
    for (const settlement of tripSettlements) {
        applySettlementToBalances(balances, settlement, trip);
    }

    return { balances, roster, expenses: tripExps, removedFromRoster };
}

/** Greedy minimal-payments list. Pairs largest debtor with largest
 *  creditor, settles the smaller of the two, repeats.
 *
 *  R3-Round 2 fix: epsilon bumped from €0.01 to €0.50. The previous
 *  value couldn't absorb FX rounding residue from multi-currency
 *  trips (JPY→EUR rounds at the thousandths place per row; summed
 *  over a few dozen expenses the residue routinely lands in
 *  €0.02–€0.40 range). Users saw "Alice owes Bob €0.02" lingering
 *  after a settle-up. €0.50 is below the visible-friction threshold
 *  (nobody balks at the cents column in a group split) and well
 *  above plausible accumulated rounding error. */
const _ZERO_EPSILON_EUR = 0.5;
export function simplifyDebts(balances: Record<string, number>): SettlementDebt[] {
    const creditors: BalanceEntry[] = [];
    const debtors: BalanceEntry[] = [];
    for (const [person, balance] of Object.entries(balances)) {
        if (balance > _ZERO_EPSILON_EUR) creditors.push({ person, amount: balance });
        else if (balance < -_ZERO_EPSILON_EUR) debtors.push({ person, amount: Math.abs(balance) });
    }
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);
    const debts: SettlementDebt[] = [];
    let i = 0,
        j = 0;
    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i]!;
        const creditor = creditors[j]!;
        const pay = Math.min(debtor.amount, creditor.amount);
        debts.push({ from: debtor.person, to: creditor.person, amount: pay });
        debtor.amount -= pay;
        creditor.amount -= pay;
        if (debtor.amount < _ZERO_EPSILON_EUR) i++;
        if (creditor.amount < _ZERO_EPSILON_EUR) j++;
    }
    return debts;
}

/** Compute the cross-trip balance map. Same shape as the per-trip
 *  one, but seeded with every name from every trip's roster (active
 *  + archived) and accumulated over EVERY expense.
 *
 *  Audit fix (2026-05-26): also seed with every name referenced in
 *  expenses (`who` or split keys) so removed-companion expenses
 *  don't silently vanish — same logic as computeTripBalances. */
export function computeGlobalBalances() {
    const globalBalances: Record<string, number> = {};
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        for (const name of getTripCompanionNames(t)) {
            if (!(name in globalBalances)) globalBalances[name] = 0;
        }
    }
    // R2 audit fix: STATE.expenses already contains EVERY expense
    // from EVERY trip (active + archived) because /api/data returns
    // them all into one bucket. The per-archived-trip `t.expenses`
    // snapshot at api.ts:420 is `STATE.expenses.filter(...)` — same
    // rows. Pre-fix `[...STATE.expenses, ...archivedExps]` doubled
    // every archived-trip expense in the cross-trip view: a €100
    // hotel on an archived trip showed as €200 of phantom debt in
    // the global tab. Dedupe by id; STATE.expenses is the source of
    // truth, the archived snapshot is convenience for the
    // archived-trip detail view only.
    const seenIds = new Set<string>();
    const allExpenses: typeof STATE.expenses = [];
    for (const e of STATE.expenses) {
        if (!seenIds.has(e.id)) {
            seenIds.add(e.id);
            allExpenses.push(e);
        }
    }
    for (const t of STATE.archivedTrips || []) {
        for (const e of (t.expenses || [])) {
            if (!seenIds.has(e.id)) {
                seenIds.add(e.id);
                allExpenses.push(e);
            }
        }
    }

    // Seed any expense-attributed name that isn't already in the
    // global roster — captures removed-companion expenses so their
    // money doesn't disappear from cross-trip balance math.
    for (const exp of allExpenses) {
        if (exp.who && !(exp.who in globalBalances)) {
            globalBalances[exp.who] = 0;
        }
        if (exp.splits) {
            for (const name of Object.keys(exp.splits)) {
                if (name && !(name in globalBalances)) {
                    globalBalances[name] = 0;
                }
            }
        }
    }

    const tripCompanionsById: Record<string, string[]> = {};
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        tripCompanionsById[t.id] = getTripCompanionNames(t);
    }

    for (const exp of allExpenses) {
        const amount = exp.euroValue || exp.value || 0;
        if (globalBalances[exp.who] !== undefined) globalBalances[exp.who]! += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            // 2026-05-26 (audit SP1): normalize the split by the ACTUAL
            // sum, not a hard /100. A custom 33/33/33 split sums to 99%
            // and the old code's `/100` divisor leaked 1% of every
            // expense into phantom global debt across trips, drifting
            // the cross-trip view away from the per-trip math (which
            // already normalizes via computeTripBalances). Match the
            // trip path's denom-by-actual-sum so a balance sheet built
            // from {trip1 → trip1 view, trip2 → trip2 view, …} agrees
            // with the global aggregate.
            const denom = Object.values(exp.splits).reduce(
                (a: number, b: any) => a + (Number(b) || 0),
                0,
            );
            if (denom > 0) {
                for (const [person, pct] of Object.entries(exp.splits)) {
                    if (globalBalances[person] !== undefined)
                        globalBalances[person]! -= (amount * Number(pct)) / denom;
                }
            }
        } else {
            const roster = tripCompanionsById[exp.tripId] || [];
            const splitGroup =
                roster.length > 0
                    ? roster
                    : Array.from(
                          new Set(
                              [exp.who, ...Object.keys(exp.splits || {})].filter(Boolean),
                          ),
                      );
            const share = amount / Math.max(splitGroup.length, 1);
            splitGroup.forEach((p) => {
                if (globalBalances[p] !== undefined) globalBalances[p]! -= share;
            });
        }
    }

    // §4.5 retirement: server-side settlements across every trip the
    // viewer is a member of. We look the trip up per-settlement so the
    // name-resolution helper has the right companion list to walk.
    //
    // 2026-05-26 (audit SP4 + TR3): archived trips now carry a
    // `settlements` snapshot (set by trip-controls.ts on archive +
    // pullFromServer's archived-trip pass). Walk both the active
    // STATE.settlements AND each archived trip's local snapshot so
    // global balance reflects ALL settlement history, not just
    // active-trip rows.
    const tripsById = new Map<string, any>();
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        tripsById.set(t.id, t);
    }
    // R2 audit fix: dedupe settlements by id. STATE.settlements is
    // already the master list pulled from /api/data; the per-archived
    // -trip snapshot at api.ts:429 is `STATE.settlements.filter(...)`
    // — same rows. Pre-fix the concat doubled every archived-trip
    // settlement → debt direction was reversed twice → net effect is
    // the settlement counted ZERO times in the global view. Either
    // way the global balance disagreed with the per-trip view.
    const seenSettlements = new Set<string>();
    const allSettlements: Settlement[] = [];
    for (const s of (STATE.settlements || [])) {
        if (!seenSettlements.has(s.id)) {
            seenSettlements.add(s.id);
            allSettlements.push(s);
        }
    }
    for (const t of (STATE.archivedTrips || [])) {
        const snap = ((t as { settlements?: Settlement[] }).settlements) || [];
        for (const s of snap) {
            if (!seenSettlements.has(s.id)) {
                seenSettlements.add(s.id);
                allSettlements.push(s);
            }
        }
    }
    for (const s of allSettlements) {
        const trip = tripsById.get(s.tripId);
        if (!trip) continue;
        applySettlementToBalances(globalBalances, s, trip);
    }

    return globalBalances;
}

/** Per-companion paid/share leaderboard for a trip — used by the
 *  Trip-tab summary row. "paid" is the sum of expenses they fronted;
 *  "share" is the sum of their split obligations across the trip. */
export function computeLeaderboard(trip: any) {
    if (!trip) return [];
    const exps = (STATE.expenses || []).filter((e) => e.tripId === trip.id);
    const roster = getTripCompanionNames(trip);
    const board: Record<string, { paid: number; share: number }> = {};
    roster.forEach((p) => (board[p] = { paid: 0, share: 0 }));
    for (const exp of exps) {
        const amount = exp.euroValue || exp.value || 0;
        if (board[exp.who]) board[exp.who]!.paid += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (board[person]) board[person]!.share += amount * (Number(pct) / 100);
            }
        } else {
            const share = amount / Math.max(roster.length, 1);
            roster.forEach((p) => {
                if (board[p]) board[p]!.share += share;
            });
        }
    }
    return Object.entries(board).map(([name, v]) => ({
        name,
        paid: v.paid,
        share: v.share,
        net: v.paid - v.share,
    }));
}
