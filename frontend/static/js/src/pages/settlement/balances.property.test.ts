// MK1 Wave J (T3-5) — property-based tests for the greedy settle-up
// algorithm (simplifyDebts). The example-based suite pins specific
// scenarios; fast-check explores arbitrary balance maps, where the
// invariants that matter are structural:
//
//   1. Conservation — the transfers move exactly min(total credit,
//      total debt) of money; nobody pays more than they owed or
//      receives more than they were due.
//   2. Settlement — applying the transfers back to the balances leaves
//      every RESIDUAL inside the engine's own €0.01 zero-epsilon...
//      scaled by the participant count (each hop can strand up to one
//      epsilon of dust by design — the loop stops chasing sub-cent
//      remainders rather than emitting noise transfers).
//   3. Shape — no self-payments, no non-positive transfers, and at most
//      (debtors + creditors − 1) transfers (the classic greedy bound).
//
// These are the exact properties the €-balance UI depends on: money
// neither invented nor destroyed, and "Settled up!" truly means dust.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { simplifyDebts } from './balances.js';

const EPS = 0.01; // mirrors _ZERO_EPSILON_EUR in balances.ts

// Balance maps: 1-8 people, balances in cents to avoid generating
// float noise the engine was never meant to see (real balances come
// from 2dp money arithmetic).
const balanceMap = fc
    .dictionary(
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.integer({ min: -500_000, max: 500_000 }).map((c) => c / 100),
        { minKeys: 1, maxKeys: 8 }
    );

describe('simplifyDebts — structural invariants (fast-check)', () => {
    it('conserves money: transfers total exactly min(credit, debt) within dust', () => {
        fc.assert(
            fc.property(balanceMap, (balances) => {
                const debts = simplifyDebts(balances);
                const totalMoved = debts.reduce((s, d) => s + d.amount, 0);
                const credit = Object.values(balances)
                    .filter((b) => b > EPS)
                    .reduce((s, b) => s + b, 0);
                const debt = Object.values(balances)
                    .filter((b) => b < -EPS)
                    .reduce((s, b) => s - b, 0);
                const expected = Math.min(credit, debt);
                const dust = EPS * (Object.keys(balances).length + 1);
                expect(Math.abs(totalMoved - expected)).toBeLessThanOrEqual(dust);
            })
        );
    });

    it('never emits self-payments or non-positive transfers', () => {
        fc.assert(
            fc.property(balanceMap, (balances) => {
                for (const d of simplifyDebts(balances)) {
                    expect(d.from).not.toBe(d.to);
                    expect(d.amount).toBeGreaterThan(0);
                }
            })
        );
    });

    it('uses at most debtors + creditors − 1 transfers (greedy bound)', () => {
        fc.assert(
            fc.property(balanceMap, (balances) => {
                const debts = simplifyDebts(balances);
                const nDebt = Object.values(balances).filter((b) => b < -EPS).length;
                const nCred = Object.values(balances).filter((b) => b > EPS).length;
                const bound = nDebt && nCred ? nDebt + nCred - 1 : 0;
                expect(debts.length).toBeLessThanOrEqual(bound);
            })
        );
    });

    it('settles zero-sum groups: applying the transfers leaves only dust', () => {
        // Construct guaranteed zero-sum maps: n-1 random balances + one
        // person absorbing the negation (the shape real trips produce,
        // since every expense credits the payer by what it debits the
        // sharers — the Σ=0 invariant IA-2 protects).
        const zeroSum = fc
            .array(fc.integer({ min: -300_000, max: 300_000 }), { minLength: 1, maxLength: 7 })
            .map((cents) => {
                const balances: Record<string, number> = {};
                let sum = 0;
                cents.forEach((c, i) => {
                    balances[`p${i}`] = c / 100;
                    sum += c;
                });
                balances['absorber'] = -sum / 100;
                return balances;
            });
        fc.assert(
            fc.property(zeroSum, (balances) => {
                const residual: Record<string, number> = { ...balances };
                for (const d of simplifyDebts(balances)) {
                    residual[d.from] = (residual[d.from] ?? 0) + d.amount;
                    residual[d.to] = (residual[d.to] ?? 0) - d.amount;
                }
                const people = Object.keys(residual).length;
                for (const v of Object.values(residual)) {
                    // Each greedy hop may strand ≤ one epsilon of dust.
                    expect(Math.abs(v)).toBeLessThanOrEqual(EPS * people);
                }
            })
        );
    });

    it('is stable: re-simplifying the residuals yields no meaningful transfers', () => {
        fc.assert(
            fc.property(balanceMap, (balances) => {
                const residual: Record<string, number> = { ...balances };
                for (const d of simplifyDebts(balances)) {
                    residual[d.from] = (residual[d.from] ?? 0) + d.amount;
                    residual[d.to] = (residual[d.to] ?? 0) - d.amount;
                }
                const second = simplifyDebts(residual);
                // One side is exhausted by round 1 (conservation), so a
                // second pass can only shuffle dust — every remaining
                // transfer must be ≤ the accumulated epsilon budget.
                const dust = EPS * (Object.keys(balances).length + 1);
                for (const d of second) {
                    expect(d.amount).toBeLessThanOrEqual(dust);
                }
            })
        );
    });
});
