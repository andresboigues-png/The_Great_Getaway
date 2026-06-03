// pages/settlement/viewData.ts — pure, STATE-reading view-data helpers
// for the Settlement page. Extracted from legacyRender.ts when the
// HTML-string builders migrated to JSX (SettlementView.tsx): these
// derive the numbers/rows the view needs but produce no markup, so they
// stay framework-agnostic (and unit-testable) here rather than living in
// the component file.

import { STATE } from '../../state.js';
import { findTripCompanionByLinkedUser } from '../../companions.js';
import type { Settlement, Trip } from '../../types';

/** MK4 SETL-6: the EUR value of a settlement for a DISPLAY total, without
 *  the unsafe `euroValue || amount` fallback. Post-validation every server
 *  settlement carries a real euroValue (settlements.py derives/overrides
 *  it), so this is latent — but a legacy or future euroValue-less non-EUR
 *  row would otherwise contribute its raw foreign `amount` as if it were
 *  EUR (e.g. 10000 ARS counted as €10000). We only fall back to `amount`
 *  when the row is actually EUR; a non-EUR row with a falsy euroValue
 *  contributes 0 to the euro total rather than a mis-scaled figure. */
function settlementEurForTotal(s: Settlement): number {
    if (s.euroValue) return s.euroValue;
    const cur = (s.currency || 'EUR').toUpperCase();
    return cur === 'EUR' ? (s.amount || 0) : 0;
}

/** Which settlement sub-view is active. Lives here (not in the
 *  component) so both the React shell and the presentational view can
 *  share the union without a circular import. */
export type SettlementTab = 'trip' | 'history' | 'global';

/** Arguments for recording a settlement of a single suggested debt
 *  (one Settle-button click). Shared so the view's button handler and
 *  the shell's `settleDebt` wiring agree on the shape. */
export interface SettleDebtArgs {
    tripId: string;
    from: string;
    to: string;
    amount: number;
    currency: string;
}

/** Stable key for a suggested-debt row. The shell tracks the set of
 *  in-flight keys so the matching Settle button renders disabled +
 *  "Recording…" until the async settle resolves — the React equivalent
 *  of the old delegation handler poking `btn.disabled = true`. */
export function settleDebtKey(d: SettleDebtArgs): string {
    return `${d.tripId}|${d.from}|${d.to}|${d.amount}|${d.currency}`;
}

/** Total settled amount for `tripId` in EUR — counts BOTH legacy
 *  isSettlement expense rows AND server-side STATE.settlements
 *  rows. Used by the trip-picker chip + the History tab count
 *  badge so the visible numbers match the History list itself
 *  (which renders the union via collectSettlementHistory).
 *
 *  §4.5 cleanup: pre-cleanup this only counted expense rows
 *  because settlements lived as fake-isSettlement expenses. After
 *  the dual-write retirement, new settlements between user-linked
 *  parties land in STATE.settlements only, so the counter needs to
 *  read both stores or the user sees a mismatch between "3 settled"
 *  in the chip and "5 rows" in History. */
export function settledStatsForTrip(tripId: string): { count: number; eurTotal: number } {
    let count = 0;
    let eurTotal = 0;
    for (const e of STATE.expenses || []) {
        if (e.tripId === tripId && e.isSettlement) {
            count += 1;
            eurTotal += e.euroValue || 0;
        }
    }
    for (const s of STATE.settlements || []) {
        if (s.tripId === tripId) {
            count += 1;
            // SETL-6: never sum a non-EUR raw amount as EUR.
            eurTotal += settlementEurForTotal(s);
        }
    }
    return { count, eurTotal };
}

/** UX (canonical settlement currency): the trip's primary spend
 *  currency — the original currency the most euros were logged in
 *  (settlement rows excluded). Settlements are kept in each viewer's
 *  HOME currency as the big number, but a shared "≈ original currency"
 *  hint underneath gives a EUR-home and a USD-home co-traveler a common
 *  reference (the number they can both quote when paying up). Returns
 *  null when the trip has no recorded spend. */
export function tripPrimarySpendCurrency(tripId: string): string | null {
    const byCurrency: Record<string, number> = {};
    for (const e of STATE.expenses || []) {
        if (e.tripId !== tripId || (e as { isSettlement?: boolean }).isSettlement) continue;
        const cur = ((e.currency || 'EUR') as string).toUpperCase();
        // MM-3: `??` so a frozen euroValue of 0 reads €0 (not raw `value`).
        // SETL-6: when euroValue is ABSENT (null/undefined), only fall back
        // to the raw `value` for EUR rows — a non-EUR row with no euroValue
        // must not dump its raw foreign amount into the euro-weighted bucket
        // (e.g. 270000 VND skewing which currency reads as "primary").
        const ev = e.euroValue ?? (cur === 'EUR' ? (e.value ?? 0) : 0);
        byCurrency[cur] = (byCurrency[cur] || 0) + ev;
    }
    let best: string | null = null;
    let bestVal = -1;
    for (const [cur, val] of Object.entries(byCurrency)) {
        if (val > bestVal) { bestVal = val; best = cur; }
    }
    return best;
}

/** Unified history-row shape. Renders identical to the legacy
 *  isSettlement expense in the History tab, but `source` tells the
 *  click handlers which store to mutate on edit/undo:
 *    'expense'    → STATE.expenses (legacy fake-isSettlement row)
 *    'settlement' → STATE.settlements (post-§4.5 server row;
 *                   undo goes through DELETE /api/settlements/<id>) */
export interface HistoryItem {
    id: string;
    source: 'expense' | 'settlement';
    who: string;
    to: string;
    euroValue: number;
    date: string;
    /** Only set for 'settlement' source — surfaced as a chip next
     *  to the amount. */
    method?: string | null;
    note?: string | null;
}

/** Merge legacy isSettlement expense rows + server-side settlement
 *  rows into a single sorted (newest-first) list. The renderer in
 *  the History tab walks this unified shape. */
export function collectSettlementHistory(trip: Trip): HistoryItem[] {
    const items: HistoryItem[] = [];

    // Source A — legacy isSettlement expense rows. These remain in
    // STATE.expenses indefinitely (old data + new fallback for
    // name-only companion pairs that can't go to the settlements
    // table).
    for (const e of STATE.expenses || []) {
        if (!(e.tripId === trip.id && e.isSettlement)) continue;
        const toPerson = Object.keys(e.splits || {})[0] || '?';
        items.push({
            id: e.id,
            source: 'expense',
            who: e.who || '?',
            to: toPerson,
            euroValue: e.euroValue || 0,
            date: e.date || '',
        });
    }

    // Source B — server-side settlements (post-§4.5). Map user_ids
    // back to companion names so the renderer can show them
    // alongside the legacy rows. Skip rows where either party
    // doesn't resolve (e.g. owner-as-party, which the modal can't
    // produce yet — those settlements would only exist if created
    // via direct API call, which the UI can't trigger).
    for (const s of STATE.settlements || []) {
        if (s.tripId !== trip.id) continue;
        // BUG-4/B3 (MK2 audit): prefer the settlement's name snapshot (the
        // server backfills fromName/toName on every row) so a member with an
        // UNLINKED companion still resolves. Pre-fix the linked-only lookup
        // returned undefined and `continue` DROPPED the row — so the History
        // list showed "no past settlements" while the badge + chip counted it.
        const fromName = (s as { fromName?: string }).fromName
            || findTripCompanionByLinkedUser(trip, s.fromUserId)?.name;
        const toName = (s as { toName?: string }).toName
            || findTripCompanionByLinkedUser(trip, s.toUserId)?.name;
        if (!fromName || !toName) continue;
        items.push({
            id: s.id,
            source: 'settlement',
            who: fromName,
            to: toName,
            euroValue: s.euroValue || s.amount || 0,
            // s.createdAt is a full ISO timestamp; we group by
            // YYYY-MM-DD so the renderer's date logic works on
            // both shapes.
            date: (s.createdAt || '').slice(0, 10),
            method: s.method ?? null,
            note: s.note ?? null,
        });
    }

    items.sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return items;
}
