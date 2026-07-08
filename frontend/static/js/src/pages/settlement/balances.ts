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

import { STATE, getStateVersion } from '../../state.js';
import {
    getTripCompanionNames,
    findTripCompanionByLinkedUser,
} from '../../companions.js';
import type { Companion, Settlement, Trip } from '../../types';


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
    trip: Trip | null,
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
    // BUG-4 (MK2 audit): generalise the owner's first-name reconciliation to
    // ALL members. The settlement snapshot carries the member's FULL account
    // name ("Sara Lopez") + user_id, but expenses split on the companion's
    // first-name key ("Sara"). The owner is auto-linked so the companion
    // lookup saves them; a non-owner member with an UNLINKED same-person
    // companion was not, so `balances["Sara Lopez"]` was undefined and a
    // PHANTOM duplicate person got seeded below (the €45 landed on the phantom
    // and the real debt never cleared). When the full name + the linked lookup
    // both miss, fall back to the first token so the payment reconciles to the
    // existing companion balance instead of inventing a second person.
    const parties = resolveSettlementParties(settlement, trip, balances);
    if (!parties) return;
    // euroValue is the cross-currency-normalised amount the balance math uses
    // everywhere else; falls back to `amount` for legacy non-euroValue rows.
    const amount = settlement.euroValue || settlement.amount || 0;
    balances[parties.fromName]! += amount;
    balances[parties.toName]! -= amount;
}

/** Resolve a settlement's from/to to roster keys: snapshot name →
 *  linked-companion lookup → first-name fallback, seeding any missing
 *  entry to 0 so the caller can apply the amount. Returns null if
 *  unresolvable. Shared by the EUR path (applySettlementToBalances) and
 *  the per-currency path so the BUG-4 reconciliation can't diverge. */
function resolveSettlementParties(
    settlement: Settlement,
    trip: Trip | null,
    balances: Record<string, number>,
): { fromName: string; toName: string } | null {
    const firstNameKey = (full: string | undefined): string | undefined => {
        const first = (full || '').split(/\s+/)[0];
        return first && balances[first] !== undefined ? first : undefined;
    };
    let fromName: string | undefined = settlement.fromName || undefined;
    if (!fromName || balances[fromName] === undefined) {
        const found = findTripCompanionByLinkedUser(trip, settlement.fromUserId)?.name;
        if (found && balances[found] !== undefined) fromName = found;
        else fromName = firstNameKey(fromName) ?? fromName;
    }
    let toName: string | undefined = settlement.toName || undefined;
    if (!toName || balances[toName] === undefined) {
        const found = findTripCompanionByLinkedUser(trip, settlement.toUserId)?.name;
        if (found && balances[found] !== undefined) toName = found;
        else toName = firstNameKey(toName) ?? toName;
    }
    if (!fromName || !toName) return null;
    if (balances[fromName] === undefined) balances[fromName] = 0;
    if (balances[toName] === undefined) balances[toName] = 0;
    return { fromName, toName };
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
export function computeTripBalances(trip: Trip | null | undefined) {
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
        // Integration audit C1: `??` (not `||`) so a FROZEN euroValue of 0
        // is respected as €0, not silently overridden by the raw foreign
        // `value` (which treated e.g. 270000 VND as €270000). A missing
        // euroValue still falls back to value for legacy EUR rows.
        const amount = exp.euroValue ?? exp.value ?? 0;
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

/** MK3-8: per-currency balances for the settle view. Unlike
 *  computeTripBalances (one EUR net), this keeps each currency separate
 *  using each expense's ORIGINAL `value` + splits — so debts read in the
 *  trip's real currencies and a no-rate currency (ARS) stays in ARS with
 *  no conversion. Mirrors the EUR loop exactly (incl. legacy isSettlement
 *  expense rows + the split-normalisation) so the two can't diverge.
 *  Global + Insights keep the EUR computeTripBalances. */
export function computeTripBalancesByCurrency(trip: Trip | null | undefined): {
    byCurrency: Record<string, Record<string, number>>;
    roster: string[];
} {
    if (!trip) return { byCurrency: {}, roster: [] };
    const tripExps = (STATE.expenses || []).filter((e) => e.tripId === trip.id);
    const tripCompanionNames = getTripCompanionNames(trip);
    const expenseAttributedNames = Array.from(new Set(
        tripExps.flatMap((e) => [e.who, ...Object.keys(e.splits || {})]).filter(Boolean),
    ));
    const roster = Array.from(new Set([...tripCompanionNames, ...expenseAttributedNames]));
    const byCurrency: Record<string, Record<string, number>> = {};
    const ensure = (cur: string): Record<string, number> => {
        if (!byCurrency[cur]) {
            const m: Record<string, number> = {};
            roster.forEach((p) => (m[p] = 0));
            byCurrency[cur] = m;
        }
        return byCurrency[cur]!;
    };
    for (const exp of tripExps) {
        const cur = (exp.currency || 'EUR').toUpperCase();
        const amount = Number(exp.value) || 0; // ORIGINAL currency units, not euroValue
        if (!(amount > 0)) continue;
        const bal = ensure(cur);
        if (bal[exp.who] !== undefined) bal[exp.who]! += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            const totalPct = Object.values(exp.splits).reduce((s, p) => s + Number(p || 0), 0);
            const denom = totalPct > 0 ? totalPct : 100;
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (bal[person] !== undefined) bal[person]! -= amount * (Number(pct) / denom);
            }
        } else {
            const share = amount / Math.max(roster.length, 1);
            roster.forEach((p) => { if (bal[p] !== undefined) bal[p]! -= share; });
        }
    }
    for (const s of (STATE.settlements || []).filter((s) => s.tripId === trip.id)) {
        const cur = (s.currency || 'EUR').toUpperCase();
        const amt = Number(s.amount) || 0;
        if (!(amt > 0)) continue;
        const bal = ensure(cur);
        const parties = resolveSettlementParties(s, trip, bal);
        if (!parties) continue;
        bal[parties.fromName]! += amt;
        bal[parties.toName]! -= amt;
    }
    return { byCurrency, roster };
}

/** Greedy minimal-payments list. Pairs largest debtor with largest
 *  creditor, settles the smaller of the two, repeats.
 *
 *  Epsilon history:
 *   - R3-Round 2 bumped it €0.01 → €0.50 to absorb residue that made
 *     "Alice owes Bob €0.02" linger after a settle-up. But the DOMINANT
 *     residue source at that time was structural, not FX rounding: an
 *     un-normalised 33/33/33 split summed to 99 %, leaking ~1 % of
 *     EVERY expense into the balances (a €100 dinner left €1 unbalanced).
 *   - BUG-23 (MK2 audit): that structural drift was later eliminated by
 *     the "audit S5" split-normalisation in computeTripBalances (it now
 *     divides each split % by the actual sum, so near-100 % splits
 *     self-correct to exactly 0). With the 1 %-per-expense leak gone,
 *     only genuine sub-cent FX rounding remains (JPY→EUR thousandths),
 *     which €0.01 absorbs fine. The old €0.50 floor was now eating REAL
 *     debts — a €0.49 coffee-rounding debt showed "All settled 🥂".
 *     Tightened back to €0.01 so real small debts surface again while
 *     true rounding noise (< 1 cent) is still swallowed. */
const _ZERO_EPSILON_EUR = 0.01;
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

/** MK4 SETL-2: resolve a (trip, display-name) pair to a STABLE cross-trip
 *  identity key. A linked companion (one carrying `linkedUserId`) keys on
 *  `user:<id>`; an unlinked name-only companion (or a name not in the
 *  trip's roster, e.g. a removed-companion expense) keys on `name:<lower>`.
 *
 *  Why per-trip and not a single global name→identity map: the SAME name
 *  string can map to DIFFERENT real people across trips ("Alex" linked to
 *  u-alex1 on trip A, a different "Alex" linked to u-alex2 on trip B), and
 *  the SAME person can appear under two spellings linked to ONE id ("Sara"
 *  vs "Sara L", both → u-sara). Resolving against the originating trip's
 *  roster keeps the two namesakes apart and folds the two spellings
 *  together — which a name-keyed global map could not do (it merged the
 *  namesakes and split the one person). Falls back to the lower-cased name
 *  for unlinked companions so name-only people behave exactly as before. */
function _identityKeyFor(
    companionsByTrip: Map<string, Companion[]>,
    tripId: string,
    name: string,
): string {
    const lower = (name || '').toLocaleLowerCase();
    const companions = companionsByTrip.get(tripId) || [];
    const match = companions.find((c) => (c.name || '').toLocaleLowerCase() === lower);
    if (match?.linkedUserId) return `user:${match.linkedUserId}`;
    return `name:${lower}`;
}

/** Compute the cross-trip balance map. Same shape as the per-trip
 *  one, but seeded with every name from every trip's roster (active
 *  + archived) and accumulated over EVERY expense.
 *
 *  Audit fix (2026-05-26): also seed with every name referenced in
 *  expenses (`who` or split keys) so removed-companion expenses
 *  don't silently vanish — same logic as computeTripBalances.
 *
 *  MK4 SETL-2: accumulate against a stable IDENTITY key (user id for
 *  linked companions, name for unlinked ones — see `_identityKeyFor`)
 *  rather than the raw display name, then project back to a
 *  display-name-keyed result for the renderer. This stops two distinct
 *  same-named linked people from merging into one balance, and stops one
 *  linked person entered under two spellings from splitting into two.
 *  Display-name collisions between DISTINCT identities are disambiguated
 *  with a short id suffix so the merge can't silently re-appear in the UI.
 *
 *  MK3-11: memoized on the state version — this is O(trips × expenses) and is
 *  called on every render, so recompute only when state actually changed. A
 *  fresh shallow copy is returned each call so a mutating caller can never
 *  corrupt the cache (the copy is O(people), negligible vs the compute). */
let _globalBalCache: { v: number; result: Record<string, number> } | null = null;
export function computeGlobalBalances(): Record<string, number> {
    const _v = getStateVersion();
    if (_globalBalCache && _globalBalCache.v === _v) return { ..._globalBalCache.result };

    // Identity-keyed accumulator + the display name we'll show for each
    // identity. `byIdentity` holds the running balance; `displayByIdentity`
    // remembers a human name (the linked companion's name when we have it,
    // else whatever name first referenced the identity).
    const byIdentity: Record<string, number> = {};
    const displayByIdentity: Record<string, string> = {};
    const companionsByTrip = new Map<string, Companion[]>();
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        companionsByTrip.set(t.id, t.companions ?? []);
    }
    /** Seed (or look up) an identity for a name seen on `tripId`. Returns
     *  the identity key so callers can apply amounts. The first non-empty
     *  name to reach an identity becomes its display name; roster names are
     *  seeded first below, so a linked identity shows its roster spelling. */
    const seed = (tripId: string, name: string): string => {
        const key = _identityKeyFor(companionsByTrip, tripId, name);
        if (!(key in byIdentity)) byIdentity[key] = 0;
        if (name && !displayByIdentity[key]) displayByIdentity[key] = name;
        return key;
    };
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        for (const name of getTripCompanionNames(t)) seed(t.id, name);
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

    // Seed any expense-attributed name that isn't already in the global
    // roster — captures removed-companion expenses so their money doesn't
    // disappear from cross-trip balance math. Each name is resolved to its
    // identity key against the originating trip (SETL-2).
    for (const exp of allExpenses) {
        if (exp.who) seed(exp.tripId, exp.who);
        if (exp.splits) {
            for (const name of Object.keys(exp.splits)) {
                if (name) seed(exp.tripId, name);
            }
        }
    }

    const tripCompanionsById: Record<string, string[]> = {};
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        tripCompanionsById[t.id] = getTripCompanionNames(t);
    }

    for (const exp of allExpenses) {
        // Integration audit MM-3: `??` (not `||`) so a frozen euroValue of 0
        // reads €0, not the raw foreign `value` — matches computeTripBalances.
        // Pre-fix a 0-euroValue row read €0 on the per-trip tab but its raw
        // foreign amount here (cross-trip), e.g. 270000 VND as €270000.
        const amount = exp.euroValue ?? exp.value ?? 0;
        // SETL-2: resolve names → identity keys against the expense's trip.
        const whoKey = exp.who ? seed(exp.tripId, exp.who) : undefined;
        if (whoKey !== undefined) byIdentity[whoKey]! += amount;
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
                (a: number, b: number) => a + (Number(b) || 0),
                0,
            );
            if (denom > 0) {
                for (const [person, pct] of Object.entries(exp.splits)) {
                    const k = seed(exp.tripId, person);
                    byIdentity[k]! -= (amount * Number(pct)) / denom;
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
                const k = seed(exp.tripId, p);
                byIdentity[k]! -= share;
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
    const tripsById = new Map<string, Trip>();
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
    // SETL-2: resolve a settlement party to the SAME identity key the
    // expense loop used. Prefer the row's user_id when that linked
    // identity already exists in the accumulator (so a linked-member
    // settlement nets against the right person, even across trips); else
    // resolve the snapshot/roster name against the originating trip
    // exactly like an expense name. Returns null when neither resolves
    // (a legacy row with no usable name + no known user id) so the caller
    // can skip it without seeding a phantom identity.
    const settlementPartyKey = (
        userId: string | null | undefined,
        snapshotName: string | null | undefined,
        trip: Trip | null,
        tripId: string,
    ): string | null => {
        if (userId && `user:${userId}` in byIdentity) {
            const k = `user:${userId}`;
            if (snapshotName && !displayByIdentity[k]) displayByIdentity[k] = snapshotName;
            return k;
        }
        // Fall back to the snapshot name → roster identity (linked
        // companions still collapse to user:<id>; name-only stay by name).
        const rosterName = snapshotName
            || (userId ? findTripCompanionByLinkedUser(trip, userId)?.name : undefined);
        if (rosterName) return seed(tripId, rosterName);
        // Last resort: if we have a user id but no name + no prior
        // identity, key on the id so the money still lands somewhere
        // stable rather than vanishing.
        if (userId) {
            const k = `user:${userId}`;
            if (!(k in byIdentity)) byIdentity[k] = 0;
            return k;
        }
        return null;
    };

    for (const s of allSettlements) {
        const trip = tripsById.get(s.tripId);
        // R10-B6b F4: don't silently drop settlements whose trip
        // isn't in the local cache. Pre-fix this `if (!trip) continue;`
        // dropped any settlement whose trip hadn't been hydrated
        // (post-logout flush, new install before /api/data lands, or
        // an old archived trip that fell off the snapshot). The user
        // saw their global balance silently UNDER-count their debts —
        // a payment they'd received was missing entirely, not even
        // shown with a "pending" hint. The snapshot fromName/toName
        // (every post-§4.5 server-written row carries them) keep the
        // row attributable even with a null trip.
        if (!trip) {
            console.warn('[balances] settlement', s.id, 'trip', s.tripId, 'not in local cache — using snapshot names');
        }
        const fromKey = settlementPartyKey(s.fromUserId, s.fromName, trip || null, s.tripId);
        const toKey = settlementPartyKey(s.toUserId, s.toName, trip || null, s.tripId);
        if (!fromKey || !toKey) continue;
        // euroValue is the cross-currency-normalised amount; legacy rows
        // fall back to raw amount (matches applySettlementToBalances).
        const amount = s.euroValue || s.amount || 0;
        byIdentity[fromKey]! += amount;
        byIdentity[toKey]! -= amount;
    }

    // Project the identity-keyed accumulator back to a display-name-keyed
    // result for the renderer. When two DISTINCT identities resolve to the
    // same base display name (two different linked "Alex"es), disambiguate
    // the SECOND+ occurrence with a short id suffix so the SETL-2 merge
    // can't silently re-appear in the UI as one row.
    const globalBalances: Record<string, number> = {};
    const baseNameCount = new Map<string, number>();
    for (const key of Object.keys(byIdentity)) {
        const base = displayByIdentity[key] || key.slice(key.indexOf(':') + 1);
        const seen = baseNameCount.get(base) || 0;
        baseNameCount.set(base, seen + 1);
        let label = base;
        if (seen > 0) {
            // Collision between distinct identities — append a short tag
            // (first 4 chars of the user id, or an ordinal for name keys).
            const tag = key.startsWith('user:') ? key.slice(5, 9) : String(seen + 1);
            label = `${base} (${tag})`;
        }
        // B6-B1: the short 4-char id tag is NOT guaranteed unique — two
        // distinct linked identities whose subs share a 4-char prefix (or a
        // name key that happens to equal an id-tagged label) yield the SAME
        // `label`, so the write below silently overwrote one balance and
        // dropped that person from simplifyDebts. Guarantee a collision-free
        // key by appending an ordinal until the slot is free.
        if (label in globalBalances) {
            let n = 2;
            while (`${label} #${n}` in globalBalances) n += 1;
            label = `${label} #${n}`;
        }
        globalBalances[label] = byIdentity[key]!;
    }

    _globalBalCache = { v: _v, result: globalBalances };
    return { ...globalBalances };
}

/** Per-companion paid/share leaderboard for a trip — used by the
 *  Trip-tab summary row. "paid" is the sum of expenses they fronted;
 *  "share" is the sum of their split obligations across the trip. */
export function computeLeaderboard(trip: Trip | null | undefined) {
    if (!trip) return [];
    const exps = (STATE.expenses || []).filter((e) => e.tripId === trip.id);
    const roster = getTripCompanionNames(trip);
    const board: Record<string, { paid: number; share: number }> = {};
    roster.forEach((p) => (board[p] = { paid: 0, share: 0 }));
    for (const exp of exps) {
        // Integration audit D2: settlements (legacy isSettlement fake-rows)
        // are NOT trip spend — counting them inflated the leaderboard's
        // "trip total" + "who paid most" (a €440 settle-up made a €970 trip
        // read €1851). Exclude them; real spend only.
        if (exp.isSettlement) continue;
        // C1: `??` (not `||`) — see computeTripBalances.
        const amount = exp.euroValue ?? exp.value ?? 0;
        if (board[exp.who]) board[exp.who]!.paid += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            // R9-B1 H1: denominator is the SUM of split values, not
            // a hardcoded 100. Trip-balance and global-balance code
            // (computeTripBalances / computeGlobalBalances above)
            // already normalize this way; this divisor was the lone
            // holdover. A 33/33/33 split (=99) left each person 1%
            // short; a 50/50/50 split (=150) inflated each share by
            // 50%. Net effect: the leaderboard on the trip-detail
            // page contradicted the balance section right next to
            // it — same expense, different math.
            const denom = Object.values(exp.splits).reduce(
                (sum, v) => sum + Number(v), 0,
            );
            const divisor = denom > 0 ? denom : 100;  // legacy fallback
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (board[person]) board[person]!.share += amount * (Number(pct) / divisor);
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
