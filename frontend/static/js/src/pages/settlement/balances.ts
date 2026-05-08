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
import { getTripCompanionNames } from '../../companions.js';

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
 *  negative = owes). Splits roster falls back to (a) the trip's
 *  companion list, then (b) the names referenced by existing expenses. */
export function computeTripBalances(trip: any) {
    if (!trip) return { balances: {}, roster: [], expenses: [] };
    const tripExps = (STATE.expenses || []).filter((e) => e.tripId === trip.id);
    const tripCompanionNames = getTripCompanionNames(trip);
    const roster =
        tripCompanionNames.length > 0
            ? tripCompanionNames
            : Array.from(
                  new Set(
                      tripExps
                          .flatMap((e) => [e.who, ...Object.keys(e.splits || {})])
                          .filter(Boolean),
                  ),
              );

    const balances: Record<string, number> = {};
    roster.forEach((p) => (balances[p] = 0));

    for (const exp of tripExps) {
        const amount = exp.euroValue || exp.value || 0;
        if (balances[exp.who] !== undefined) balances[exp.who]! += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (balances[person] !== undefined)
                    balances[person]! -= amount * (Number(pct) / 100);
            }
        } else {
            // No-splits fallback: equal share across the roster.
            const share = amount / Math.max(roster.length, 1);
            roster.forEach((p) => {
                if (balances[p] !== undefined) balances[p]! -= share;
            });
        }
    }
    return { balances, roster, expenses: tripExps };
}

/** Greedy minimal-payments list. Pairs largest debtor with largest
 *  creditor, settles the smaller of the two, repeats. */
export function simplifyDebts(balances: Record<string, number>): SettlementDebt[] {
    const creditors: BalanceEntry[] = [];
    const debtors: BalanceEntry[] = [];
    for (const [person, balance] of Object.entries(balances)) {
        if (balance > 0.01) creditors.push({ person, amount: balance });
        else if (balance < -0.01) debtors.push({ person, amount: Math.abs(balance) });
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
        if (debtor.amount < 0.01) i++;
        if (creditor.amount < 0.01) j++;
    }
    return debts;
}

/** Compute the cross-trip balance map. Same shape as the per-trip
 *  one, but seeded with every name from every trip's roster (active
 *  + archived) and accumulated over EVERY expense. */
export function computeGlobalBalances() {
    const globalBalances: Record<string, number> = {};
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        for (const name of getTripCompanionNames(t)) {
            if (!(name in globalBalances)) globalBalances[name] = 0;
        }
    }
    const archivedExps = (STATE.archivedTrips || []).flatMap((t) => t.expenses || []);
    const allExpenses = [...STATE.expenses, ...archivedExps];

    const tripCompanionsById: Record<string, string[]> = {};
    for (const t of [...STATE.trips, ...(STATE.archivedTrips || [])]) {
        tripCompanionsById[t.id] = getTripCompanionNames(t);
    }

    for (const exp of allExpenses) {
        const amount = exp.euroValue || exp.value || 0;
        if (globalBalances[exp.who] !== undefined) globalBalances[exp.who]! += amount;
        if (exp.splits && Object.keys(exp.splits).length > 0) {
            for (const [person, pct] of Object.entries(exp.splits)) {
                if (globalBalances[person] !== undefined)
                    globalBalances[person]! -= amount * (Number(pct) / 100);
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
