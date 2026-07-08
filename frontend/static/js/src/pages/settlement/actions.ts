// pages/settlement/actions.ts — settlement mutations + modal flows.
//
// The page's HTML-string builders used to live here too (the file was
// `legacyRender.ts`); the §4 migration moved them to JSX in
// SettlementView.tsx and the pure view-data helpers to viewData.ts. What
// remains is the imperative side that JSX shouldn't own:
//
//   - settleDebt / deleteSettlement — async STATE mutations + server
//     writes. No `root` parameter: they emit STATE_CHANGED and React's
//     useStore subscriber repaints.
//   - openManualSettleModal / openEditSettlementModal — transient
//     showModal flows (focus-trap + form wiring), the same imperative
//     modal pattern used across the app (e.g. openEditCategoryModal).
//
// The Settlement shell imports settleDebt/deleteSettlement/the modal
// openers and passes them to SettlementView as callbacks.

import { STATE, emit } from '../../state.js';
import { EVENTS } from '../../constants.js';
import {
    generateId,
    showConfirmModal,
    q,
    formatHome,
    getHomeCurrency,
    convertCurrency,
    esc,
    showLiquidAlert,
} from '../../utils.js';
import {
    getTripCompanionNames,
    findAcceptedMemberUserId,
    findTripCompanionByLinkedUser,
} from '../../companions.js';
import { hasRate } from '../../utils/currency.js';
import { createSettlement, deleteSettlementOnServer, upsertExpense } from '../../api.js';
import { showModal } from '../../components/Modal.js';
import {
    computeTripBalancesByCurrency,
    simplifyDebts,
} from './balances.js';
import { tripPrimarySpendCurrency } from './viewData.js';
import { t, formatCurrency } from '../../i18n.js';
import type { Settlement, Trip } from '../../types';

// ── Mutations (no `root` parameter — emit triggers React re-render) ───

/** Record a settlement between two trip members.
 *
 *  §4.5 — single-write architecture (post-cleanup of the dual-write
 *  transition pattern). Routes by whether the two parties have user
 *  accounts:
 *
 *    A. Both parties have `companion.linkedUserId`:
 *       - POST /api/settlements with the user_ids + amount + method
 *         + note + currency.
 *       - On success: splice the server's `Settlement` row into
 *         STATE.settlements and emit STATE_CHANGED. The balance math
 *         in balances.ts reads STATE.settlements via
 *         applySettlementToBalances, producing the right shift.
 *       - On failure: keep silent (no fake-expense fallback for
 *         this path — the user can retry; this avoids polluting
 *         the data layer with "did it or didn't it" rows).
 *       - Notifications + the `settled_up` feed event fire on the
 *         server side automatically.
 *
 *    B. At least one party is a name-only companion (no
 *       linkedUserId):
 *       - Cannot POST to /api/settlements (the table is user_id
 *         keyed). Push a legacy "Settlement: X → Y" expense row
 *         with `isSettlement: true` into STATE.expenses. The
 *         expense-based balance math handles it as before.
 *       - No notification, no feed event for this path — there's
 *         no user account to notify.
 *
 *  Pre-cleanup history: the previous version of this function did
 *  both — pushed a fake-expense AND posted to the API. That avoided
 *  the impedance mismatch in balances.ts during the §4.5 frontend
 *  wiring rollout. balances.ts now reads STATE.settlements directly
 *  via applySettlementToBalances, so the fake-expense is no longer
 *  load-bearing for the linked-user path. */
/** Integration audit A2: in-flight settle keys, to drop a concurrent
 *  double-fire of the same settlement (tripId|from|to|amount) before the
 *  optimistic repaint removes the button. Cleared in settleDebt's finally. */
const _settleInFlight = new Set<string>();

export async function settleDebt(
    tripId: string,
    from: string,
    to: string,
    amount: number,
    currency: string,
    options?: { method?: string; note?: string; euroValue?: number },
): Promise<void> {
    if (from === to) {
        showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
        return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        showLiquidAlert(t('settlement.toastAmountInvalid'));
        return;
    }
    // R3-Round 2 fix: explicit offline check. The settle flow POSTs
    // to /api/settlements (PATH A below) — without this gate the
    // submit blocks for ~30s on a metro / plane connection until the
    // fetch errors out, leaving the modal open with no feedback. The
    // api.ts offline toast only fires after two consecutive /api/sync
    // failures, not for one-shot writes. navigator.onLine is the
    // browser's best-effort signal — false positives possible (it
    // returns true when on a captive wifi with no DNS) but false
    // negatives are very rare, so an "offline" reading is reliable.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        showLiquidAlert(t('errors.offline'), 'info');
        return;
    }
    // Audit MK5 P1: NEVER fabricate a 1:1 euroValue for a no-rate currency.
    // convertCurrency returns the amount unchanged when there's no live rate,
    // so a 100,000 ARS settle was booked as €100,000 — poisoning the EUR /
    // cross-trip Global / Insights totals. Mirror the expense form: EUR is
    // itself; a rated currency converts; an exotic currency REQUIRES an
    // explicit €value (entered in the manual settle modal and passed via
    // options.euroValue). The one-click Settle has no €field, so it refuses and
    // points the user to the manual modal rather than corrupting balances.
    const cur = currency.toUpperCase();
    let euroValue: number;
    if (cur === 'EUR') {
        euroValue = amount;
    } else if (hasRate(cur)) {
        euroValue = convertCurrency(amount, cur, 'EUR');
    } else if (
        typeof options?.euroValue === 'number'
        && Number.isFinite(options.euroValue)
        && options.euroValue > 0
    ) {
        euroValue = Math.round(options.euroValue * 10000) / 10000;
    } else {
        showLiquidAlert(t('settlement.toastNoRateNeedEuro', { currency: cur }));
        return;
    }

    const trip = STATE.trips.find((tr) => tr.id === tripId);
    // Integration audit INT-2: resolve each party to an ACCEPTED-member
    // user id. Prefer the companion's explicit `linkedUserId`, then fall
    // back to the trip's accepted-members roster (Trip.members) by name.
    // Pre-fix this read ONLY `findTripCompanion(...).linkedUserId`, so an
    // accepted member whose companion row was never linked (the common
    // "invite, then separately-named companion" flow) was wrongly routed
    // to the legacy fake-expense path EVEN THOUGH the server would have
    // accepted a real settlement (it gates on `_is_accepted_member` —
    // settlements.py:226). findAcceptedMemberUserId realigns the PATH A/B
    // decision with what the API actually accepts.
    const fromUserId = findAcceptedMemberUserId(trip, from);
    const toUserId = findAcceptedMemberUserId(trip, to);

    // Integration audit A2 (idempotency): the one-click Settle button used
    // to give NO on-screen feedback — a mutating `.push` (below) left the
    // balances' array-ref identity unchanged, so Settlement.tsx's useMemo
    // never recomputed and the page kept showing the pre-settle debts.
    // Users re-clicked and DUPLICATED the settlement, inverting the ledger
    // ("Sara owes Alex €X" became "Alex owes Sara €X"). The repaint is
    // fixed below via immutable replace; this guard additionally blocks a
    // concurrent double-fire during the async PATH A round-trip.
    const inFlightKey = `${tripId}::${from}::${to}::${amount}`;
    if (_settleInFlight.has(inFlightKey)) return;
    _settleInFlight.add(inFlightKey);
    try {
        if (fromUserId && toUserId) {
            // PATH A — server-side settlement. Await the POST so we can
            // splice the server's row (with its real id + createdAt) into
            // STATE.settlements before emitting. The brief in-flight wait
            // (~200-500ms) is acceptable; the next /api/data poll would
            // hydrate the same row anyway, but we don't want to block on
            // it for the UI update.
            const result = await createSettlement({
                tripId,
                fromUserId,
                toUserId,
                amount,
                currency,
                euroValue,
                ...(options?.method ? { method: options.method } : {}),
                ...(options?.note ? { note: options.note } : {}),
            });
            if (result.settlement) {
                // INT-3: immutable replace (not `.push`) so the new array
                // identity bumps Settlement.tsx's useStore(settlements) dep
                // and the balances repaint immediately.
                STATE.settlements = [...STATE.settlements, result.settlement];
                emit(EVENTS.STATE_CHANGED);
                showLiquidAlert(t('settlement.toastRecordedNotified', {
                    amount: formatHome(euroValue, 'EUR'),
                    from,
                    to,
                }), 'success');
            } else {
                // Log + toast. We deliberately don't fall back to the
                // fake-expense pattern here — keeping the data layer
                // clean is worth the user-visible failure mode.
                // Sentry catches via §3.8's structured logging.
                console.warn('[settlement] /api/settlements failed:', result.error);
                showLiquidAlert(t('settlement.toastSettlementFailed', {
                    error: result.error || t('settlement.toastSettlementFailedNetwork'),
                }));
                // 2026-05-25 (audit S3): emit STATE_CHANGED so the Settle
                // button re-renders out of its disabled "Recording…" state.
                // Without this, the button stayed permanently disabled on
                // failure since no state mutation triggered a repaint —
                // user had to navigate away to re-arm the row.
                emit(EVENTS.STATE_CHANGED);
            }
            return;
        }

        // PATH B — legacy fake-expense for name-only companions. The
        // settlements table can't store these rows (it's user_id keyed),
        // so we keep the expense-driven balance shift as the only path.
        const settlementExp = {
            id: generateId(),
            tripId: tripId,
            label: t('settlement.settlementLabel', { from, to }),
            value: amount,
            euroValue: euroValue,
            currency: currency,
            who: from,
            categoryId: STATE.categories[0]?.id ?? '',
            country: t('settlement.expenseCountry'),
            date: new Date().toISOString().split('T')[0] ?? '',
            splits: { [to]: 100 },
            isSettlement: true,
        };
        // INT-3: immutable replace (not `.push`) so the new array identity
        // bumps Settlement.tsx's useMemo `expenses` dep and the balances
        // repaint immediately — pre-fix the push left the page showing the
        // pre-settle debts, so users re-clicked and duplicated the row.
        STATE.expenses = [...STATE.expenses, settlementExp];
        emit(EVENTS.STATE_CHANGED);
        // R10-B1 P0-2: POST the new fake-expense row to /api/expenses
        // immediately. Pre-fix the legacy name-only path only pushed
        // into STATE.expenses; the ship-to-server depended on the
        // next /api/sync poll firing AND succeeding. A tab close in
        // that window lost the settlement. Same outbox-safe pattern
        // as the edit path above.
        void upsertExpense(settlementExp);
        showLiquidAlert(t('settlement.toastRecorded', {
            amount: formatHome(euroValue, 'EUR'),
            from,
            to,
        }), 'success');
    } finally {
        _settleInFlight.delete(inFlightKey);
    }
}

/** Undo a recorded settlement. Routes by source:
 *
 *    - 'expense'    (legacy isSettlement fake-row) — filter
 *                   STATE.expenses synchronously. The next /api/sync
 *                   pushes the removal to the server.
 *
 *    - 'settlement' (post-§4.5 server row) — DELETE
 *                   /api/settlements/<id>. The server enforces the
 *                   "creator OR trip owner" rule (recipient gets
 *                   403 — see settlements.py:delete_settlement).
 *                   On success we splice the row out of
 *                   STATE.settlements locally so the UI updates
 *                   immediately; on failure we log + toast and
 *                   leave local state intact.
 *
 *  Falls back to 'expense' when source isn't supplied (back-compat
 *  with any earlier callsite that didn't pass it). */
export async function deleteSettlement(
    id: string,
    source: 'expense' | 'settlement' = 'expense',
): Promise<void> {
    showConfirmModal({
        title: t('settlement.toastUnsettleConfirmTitle'),
        message: t('settlement.toastUnsettleConfirmMessage'),
        confirmText: t('settlement.toastUnsettleConfirmBtn'),
        onConfirm: () => { void (async () => {
            if (source === 'settlement') {
                const result = await deleteSettlementOnServer(id);
                if (result.error) {
                    console.warn('[settlement] delete failed:', result.error);
                    showLiquidAlert(
                        `Couldn't undo: ${result.error || 'Network error'}`,
                    );
                    return;
                }
                STATE.settlements = STATE.settlements.filter((s) => s.id !== id);
                emit(EVENTS.STATE_CHANGED);
                return;
            }
            // Legacy expense path — local mutation; the next /api/sync
            // round-trip persists the removal server-side.
            STATE.expenses = STATE.expenses.filter((e) => e.id !== id);
            emit(EVENTS.STATE_CHANGED);
        })(); },
    });
}

// ── Modals ────────────────────────────────────────────────────────────

/** Method quick-picks for the manual settle modal. The `value` is the
 *  enum sent to /api/settlements (mirrors server-side _ALLOWED_METHODS
 *  in routes/settlements.py — any value here gets accepted unchanged;
 *  'custom' is the catch-all for free-form notes). The `labelKey`
 *  resolves at render time so the dropdown reflects the active locale.
 *  Roadmap §4.5 calls out this list. */
const SETTLE_METHODS = [
    { value: 'cash',          labelKey: 'settlement.methodCash' as const },
    { value: 'revolut',       labelKey: 'settlement.methodRevolut' as const },
    { value: 'bank_transfer', labelKey: 'settlement.methodBankTransfer' as const },
    { value: 'wise',          labelKey: 'settlement.methodWise' as const },
    { value: 'paypal',        labelKey: 'settlement.methodPayPal' as const },
    { value: 'custom',        labelKey: 'settlement.methodCustom' as const },
];

export function openManualSettleModal(tripId: string): void {
    const trip = STATE.trips.find((tr) => tr.id === tripId);
    const peopleSource = getTripCompanionNames(trip);
    const peopleOptions = peopleSource.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    const methodOptions = SETTLE_METHODS
        .map(m => `<option value="${esc(m.value)}">${esc(t(m.labelKey))}</option>`)
        .join('');
    const home = getHomeCurrency();
    // MK3-8: per-currency manual settle. Offer the trip's actual spend
    // currencies (default = the primary one), falling back to home when the
    // trip has no expenses yet. The debt is settled in the chosen currency
    // and the overpay check compares like-for-like.
    const _manualByCur = computeTripBalancesByCurrency(trip).byCurrency;
    const _manualCurs = Object.keys(_manualByCur);
    const _manualDefaultCur = (tripPrimarySpendCurrency(trip?.id ?? '') || home).toUpperCase();
    const _manualCurList = _manualCurs.length > 0 ? _manualCurs : [home.toUpperCase()];
    const currencyOptions = _manualCurList
        .map((c) => `<option value="${esc(c)}" ${c === _manualDefaultCur ? 'selected' : ''}>${esc(c)}</option>`)
        .join('');

    const { root: modalRoot, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">${t('settlement.manualTitle')}</h2>
            <p class="text-subtitle">${t('settlement.manualSubtitle')}</p>
            <form id="manualSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${esc(t('settlement.labelFrom'))}</label>
                <select id="manualSettleFrom" class="glass-input stl-card-minor-bg">${peopleOptions}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelTo'))}</label>
                <select id="manualSettleTo" class="glass-input stl-card-minor-bg">${peopleOptions}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelAmount', { currency: _manualDefaultCur }))}</label>
                <div style="display:flex; gap:8px;">
                    <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input stl-card-minor" placeholder="0.00" required style="flex:2;">
                    <select id="manualSettleCurrency" class="glass-input stl-card-minor-bg" style="flex:1;" aria-label="${esc(t('settlement.labelAmount', { currency: '' }))}">${currencyOptions}</select>
                </div>
                <div id="manualSettleEuroRow" style="display:none; flex-direction:column; gap: var(--space-2); margin-top: var(--space-2);">
                    <label class="form-label" id="manualSettleEuroLabel" for="manualSettleEuro"></label>
                    <input type="number" step="0.01" min="0.01" id="manualSettleEuro" class="glass-input stl-card-minor" placeholder="0.00">
                </div>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelMethod'))}</label>
                <select id="manualSettleMethod" class="glass-input stl-card-minor-bg">${methodOptions}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelNote'))} <span class="text-subtitle" style="font-weight:500;">${esc(t('settlement.labelNoteOptional'))}</span></label>
                <input type="text" id="manualSettleNote" class="glass-input" maxlength="240" placeholder="${esc(t('settlement.notePlaceholder'))}" class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelManualSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${esc(t('settlement.cancelBtn'))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${esc(t('settlement.recordPaymentBtn'))}</button>
                </div>
            </form>
        `,
    });
    (q(modalRoot, '#cancelManualSettleBtn') as HTMLButtonElement).onclick = () => close();
    // Audit MK5 P1: show the explicit €-value field only for a currency with no
    // live rate, so an exotic-currency settle stores a real euroValue instead of
    // a fabricated 1:1 one. Toggle it as the currency picker changes.
    const _euroRow = q(modalRoot, '#manualSettleEuroRow') as HTMLDivElement;
    const _curSel = q(modalRoot, '#manualSettleCurrency') as HTMLSelectElement | null;
    const _syncEuroRow = (): void => {
        const c = ((_curSel?.value) || home).toUpperCase();
        const show = c !== 'EUR' && !hasRate(c);
        if (_euroRow) _euroRow.style.display = show ? 'flex' : 'none';
        const lbl = q(modalRoot, '#manualSettleEuroLabel') as HTMLLabelElement | null;
        if (lbl) lbl.textContent = t('settlement.manualEuroLabel', { currency: c });
    };
    _curSel?.addEventListener('change', _syncEuroRow);
    _syncEuroRow();
    (q(modalRoot, '#manualSettleForm') as HTMLFormElement).onsubmit = (evt) => {
        evt.preventDefault();
        const from = (q(modalRoot, '#manualSettleFrom') as HTMLSelectElement).value;
        const to = (q(modalRoot, '#manualSettleTo') as HTMLSelectElement).value;
        const amount = parseFloat((q(modalRoot, '#manualSettleAmount') as HTMLInputElement).value);
        const cur = ((q(modalRoot, '#manualSettleCurrency') as HTMLSelectElement)?.value || home).toUpperCase();
        const method = (q(modalRoot, '#manualSettleMethod') as HTMLSelectElement).value;
        const note = (q(modalRoot, '#manualSettleNote') as HTMLInputElement).value.trim();
        if (from === to) {
            showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
            return;
        }
        // Audit MK5 P1: a no-rate currency must carry an explicit €value so the
        // ledger isn't poisoned by a fabricated 1:1 conversion. Read + validate
        // the field shown by _syncEuroRow.
        let manualEuro: number | undefined;
        if (cur !== 'EUR' && !hasRate(cur)) {
            const parsed = parseFloat((q(modalRoot, '#manualSettleEuro') as HTMLInputElement)?.value ?? '');
            if (!Number.isFinite(parsed) || parsed <= 0) {
                showLiquidAlert(t('settlement.toastEuroRequired', { currency: cur }));
                return;
            }
            manualEuro = parsed;
        }
        // 2026-05-26 (audit S5): warn when the entered amount exceeds
        // the actual outstanding debt from `from` → `to`. Without this
        // check, typing €60 when only €30 is owed silently flipped the
        // balance — Bob now owes Alice €30 — and the user thought
        // they'd settled the debt cleanly. Now we compute the
        // pairwise outstanding via simplifyDebts() on the current trip
        // balance map and pop a confirm if amount > owed (any positive
        // owed; the value-of-zero case is "settling a fictional debt"
        // which is also worth confirming). Confirms always settle as
        // requested — this is a UX nudge, not a hard gate.
        // MK3-8: overpay check is per-currency (owed in `cur`, no conversion).
        const owed = _pairwiseOwed(trip, from, to, cur);
        const proceed = () => {
            // The method + note flow into /api/settlements when both
            // parties have linkedUserIds (see settleDebt step 2). They
            // get dropped silently for the legacy companion-by-name path
            // since there's no server-side record to attach them to.
            void settleDebt(tripId, from, to, amount, cur, {
                method, note,
                ...(manualEuro !== undefined ? { euroValue: manualEuro } : {}),
            });
            close();
        };
        if (amount > owed + 0.005) {
            showConfirmModal({
                title: t('settlement.overpayConfirmTitle'),
                message: owed > 0.005
                    ? t('settlement.overpayConfirmBody', {
                        amount: formatCurrency(amount, cur),
                        owed: formatCurrency(owed, cur),
                        from,
                        to,
                    })
                    : t('settlement.overpayConfirmBodyNone', {
                        amount: formatCurrency(amount, cur),
                        from,
                        to,
                    }),
                confirmText: t('settlement.overpayConfirmBtn'),
                onConfirm: proceed,
            });
            return;
        }
        proceed();
    };
}


/** Compute how much `from` net-owes `to` on a trip, in the user's
 *  home currency. Drives the overpayment warning on the manual-settle
 *  modal (audit S5). Walks the simplified-debt graph since pairwise
 *  netting can hide behind a chain (Alice owes Bob via Charlie etc.);
 *  if the direct from→to edge exists, that's the answer, otherwise 0
 *  (no direct debt; the user is paying into a chain we can't simplify
 *  without re-running netting from scratch). */
function _pairwiseOwed(trip: Trip | undefined, from: string, to: string, currency: string): number {
    if (!trip) return 0;
    // MK3-8: per-currency. Net debts within the requested currency only and
    // return the direct from→to edge in that currency (no conversion), so the
    // overpay nudge compares like-for-like with the entered amount.
    const { byCurrency } = computeTripBalancesByCurrency(trip);
    const bal = byCurrency[(currency || 'EUR').toUpperCase()];
    if (!bal) return 0;
    const edge = simplifyDebts(bal).find((d) => d.from === from && d.to === to);
    return edge ? edge.amount : 0;
}

/** B5-B1: guarantee a settlement's recorded party name survives in the
 *  edit modal's <select>, even after that companion was removed from the
 *  trip roster. getTripCompanionNames only returns CURRENT companions, so a
 *  removed party's snapshot name has no matching <option> — the browser
 *  then silently selects the FIRST option, and an unrelated tweak + Update
 *  re-records the settlement to the wrong person. Append the missing name
 *  (case-insensitive, mirroring findTripCompanion's matching) so it stays a
 *  selectable, pre-selected option. */
function _peopleWith(names: string[], required: string | undefined): string[] {
    if (!required) return names;
    const lower = required.toLocaleLowerCase();
    if (names.some((n) => (n || '').toLocaleLowerCase() === lower)) return names;
    return [...names, required];
}

/** Edit a recorded settlement. Routes by which store the id lives in:
 *
 *    - legacy isSettlement EXPENSE row → the in-place edit below (mutates
 *      STATE.expenses directly; these rows are user-editable as expenses).
 *    - server SETTLEMENT row → MK4 SETL-3 guided "undo + re-record":
 *      server settlements have no PATCH endpoint, so editing one means
 *      deleting the old row and recording a new one with the edited
 *      values. This makes the History "Edit" affordance behave
 *      consistently for BOTH sources (pre-fix it silently no-op'd for
 *      server rows because this function only looked in STATE.expenses).
 *
 *  The shell wires onEditSettlement → openEditSettlementModal(id) with no
 *  `source` arg, so we resolve the store here by id rather than changing
 *  the SettlementView callback signature. */
export function openEditSettlementModal(id: string): void {
    const expenseRow = STATE.expenses.find((e) => e.id === id);
    if (!expenseRow) {
        const serverRow = (STATE.settlements || []).find((s) => s.id === id);
        if (serverRow) openEditServerSettlementModal(serverRow);
        return;
    }
    const s = expenseRow;
    const trip = STATE.trips.find((tr) => tr.id === s.tripId);
    const peopleSource = getTripCompanionNames(trip);
    const toPerson = Object.keys(s.splits || {})[0];
    // B5-B1: keep the recorded payer/recipient selectable even if their
    // companion row was removed from the trip, so Update can't reassign the
    // row to the first roster name.
    const fromOpts = _peopleWith(peopleSource, s.who)
        .map((p) => `<option value="${esc(p)}" ${s.who === p ? 'selected' : ''}>${esc(p)}</option>`)
        .join('');
    const toOpts = _peopleWith(peopleSource, toPerson)
        .map((p) => `<option value="${esc(p)}" ${toPerson === p ? 'selected' : ''}>${esc(p)}</option>`)
        .join('');
    const home = getHomeCurrency();
    // BUG-043: edit the settlement in its OWN currency, never force home.
    // The old code prefilled + saved in `home`, which moved the row to a
    // different per-currency bucket (computeTripBalancesByCurrency keys on
    // currency) and re-opened the original-currency debt.
    const cur = (s.currency || home).toUpperCase();
    const oldValue = Number.isFinite(s.value) ? (s.value as number) : 0;
    const oldEuro = s.euroValue || 0;
    const prefillAmount = oldValue > 0 ? oldValue : convertCurrency(oldEuro, 'EUR', cur);

    const { root: modalRoot, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">${t('settlement.editTitle')}</h2>
            <form id="editSettlementForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${esc(t('settlement.labelFrom'))}</label>
                <select id="editSettleFrom" class="glass-input stl-card-minor-bg">${fromOpts}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelTo'))}</label>
                <select id="editSettleTo" class="glass-input stl-card-minor-bg">${toOpts}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelAmount', { currency: cur }))}</label>
                <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${prefillAmount.toFixed(2)}" class="glass-input" required class="stl-card-minor">
                <label class="form-label stl-mt-6">${esc(t('settlement.labelDate'))}</label>
                <input type="date" id="editSettleDate" value="${esc(s.date || '')}" class="glass-input" required class="stl-card-minor">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditSettleBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${esc(t('settlement.cancelBtn'))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${esc(t('settlement.updateBtn'))}</button>
                </div>
            </form>
        `,
    });
    (q(modalRoot, '#cancelEditSettleBtn') as HTMLButtonElement).onclick = () => close();
    (q(modalRoot, '#editSettlementForm') as HTMLFormElement).onsubmit = (evt) => {
        evt.preventDefault();
        const from = (q(modalRoot, '#editSettleFrom') as HTMLSelectElement).value;
        const to = (q(modalRoot, '#editSettleTo') as HTMLSelectElement).value;
        const amount = parseFloat((q(modalRoot, '#editSettleAmount') as HTMLInputElement).value);
        const date = (q(modalRoot, '#editSettleDate') as HTMLInputElement).value;
        if (from === to) {
            showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
            return;
        }
        s.who = from;
        s.splits = { [to]: 100 };
        s.value = amount;
        // BUG-043: preserve the settlement's original currency. Recompute
        // euroValue at the live rate when one exists; for a no-rate currency,
        // scale the original euroValue proportionally so we never fabricate a
        // 1:1 rate (and stay consistent with the money invariant — no new
        // FX-over-time, just the original implied rate carried forward).
        s.currency = cur;
        s.euroValue = hasRate(cur)
            ? convertCurrency(amount, cur, 'EUR')
            : (oldValue > 0 ? oldEuro * (amount / oldValue) : oldEuro);
        s.date = date;
        s.label = t('settlement.settlementLabel', { from, to });
        emit(EVENTS.STATE_CHANGED);
        // R10-B1 P0-1: POST the edit to /api/expenses (these legacy
        // settlement rows live as is_settlement=1 expenses, so the
        // existing upsert path handles them — splits + is_settlement
        // persist server-side per R3-Fix #18). Pre-fix the mutation
        // landed ONLY in STATE and waited for the next /api/sync poll
        // to ship; a tab close before that poll lost the edit
        // entirely. upsertExpense is fire-and-forget — the offline
        // outbox (R7-F1) catches network failures.
        void upsertExpense(s);
        close();
    };
}

/** MK4 SETL-3: edit a SERVER settlement via a guided "undo + re-record".
 *  Server settlements have no PATCH endpoint, so an edit deletes the old
 *  row and records a fresh one with the edited values — reusing the
 *  battle-tested settleDebt path (user-id resolution, server cap, balance
 *  shift, notification, toast). The form pre-fills from the existing row;
 *  parties default to the companion names that resolve to the row's
 *  user_ids (snapshot names as fallback). Currency is the row's original
 *  currency (the per-currency settle path). Date isn't editable here —
 *  server settlements are stamped server-side on (re-)record.
 *
 *  Order: DELETE first, then settleDebt. Deleting first is safe and
 *  actually relaxes the cumulative cap (the old row's euro_value no longer
 *  counts toward already-paid), so a reasonable edit can't false-reject.
 *  If the re-record fails, settleDebt surfaces its own toast and the row
 *  is simply gone (recoverable: the user re-records from the Settle tab).*/
function openEditServerSettlementModal(s: Settlement): void {
    const trip = STATE.trips.find((tr) => tr.id === s.tripId);
    const peopleSource = getTripCompanionNames(trip);
    // Default party selections: companion name linked to each user id,
    // else the snapshot name the server stored on the row.
    const defaultFrom = findTripCompanionByLinkedUser(trip, s.fromUserId)?.name
        || s.fromName || '';
    const defaultTo = findTripCompanionByLinkedUser(trip, s.toUserId)?.name
        || s.toName || '';
    // B5-B1: when a party was removed from the roster its snapshot name is
    // absent from getTripCompanionNames, so no <option> matches and the
    // select falls back to its first entry — an unrelated tweak + Update
    // then silently re-records the settlement to the wrong person. Keep the
    // recorded name as a selectable, pre-selected option.
    const fromOpts = _peopleWith(peopleSource, defaultFrom)
        .map((p) => `<option value="${esc(p)}" ${p === defaultFrom ? 'selected' : ''}>${esc(p)}</option>`)
        .join('');
    const toOpts = _peopleWith(peopleSource, defaultTo)
        .map((p) => `<option value="${esc(p)}" ${p === defaultTo ? 'selected' : ''}>${esc(p)}</option>`)
        .join('');
    const cur = (s.currency || 'EUR').toUpperCase();
    const methodOptions = SETTLE_METHODS
        .map((m) => `<option value="${esc(m.value)}" ${m.value === (s.method || 'custom') ? 'selected' : ''}>${esc(t(m.labelKey))}</option>`)
        .join('');

    const { root: modalRoot, close } = showModal({
        variant: 'glass-light',
        cardStyle: 'width: 440px; max-width: calc(100vw - 32px);',
        innerHTML: `
            <h2 class="h2-display">${t('settlement.editTitle')}</h2>
            <p class="text-subtitle">${t('settlement.editServerSubtitle')}</p>
            <form id="editServerSettleForm" style="display:flex; flex-direction:column; gap: var(--space-3); margin-top: var(--space-4);">
                <label class="form-label">${esc(t('settlement.labelFrom'))}</label>
                <select id="editServerFrom" class="glass-input stl-card-minor-bg">${fromOpts}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelTo'))}</label>
                <select id="editServerTo" class="glass-input stl-card-minor-bg">${toOpts}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelAmount', { currency: cur }))}</label>
                <input type="number" step="0.01" min="0.01" id="editServerAmount" value="${(Number(s.amount) || 0).toFixed(2)}" class="glass-input stl-card-minor" required>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelMethod'))}</label>
                <select id="editServerMethod" class="glass-input stl-card-minor-bg">${methodOptions}</select>
                <label class="form-label stl-mt-6">${esc(t('settlement.labelNote'))} <span class="text-subtitle" style="font-weight:500;">${esc(t('settlement.labelNoteOptional'))}</span></label>
                <input type="text" id="editServerNote" class="glass-input" maxlength="240" value="${esc(s.note || '')}" placeholder="${esc(t('settlement.notePlaceholder'))}">
                <div style="display:flex; gap: var(--space-3); margin-top: var(--space-4);">
                    <button type="button" id="cancelEditServerBtn" class="btn-neutral" style="flex:1; border-radius: var(--radius-lg);">${esc(t('settlement.cancelBtn'))}</button>
                    <button type="submit" class="btn-primary" style="flex:2; border-radius: var(--radius-lg);">${esc(t('settlement.updateBtn'))}</button>
                </div>
            </form>
        `,
    });
    (q(modalRoot, '#cancelEditServerBtn') as HTMLButtonElement).onclick = () => close();
    (q(modalRoot, '#editServerSettleForm') as HTMLFormElement).onsubmit = (evt) => {
        evt.preventDefault();
        const from = (q(modalRoot, '#editServerFrom') as HTMLSelectElement).value;
        const to = (q(modalRoot, '#editServerTo') as HTMLSelectElement).value;
        const amount = parseFloat((q(modalRoot, '#editServerAmount') as HTMLInputElement).value);
        const method = (q(modalRoot, '#editServerMethod') as HTMLSelectElement).value;
        const note = (q(modalRoot, '#editServerNote') as HTMLInputElement).value.trim();
        if (from === to) {
            showLiquidAlert(t('settlement.toastSenderEqualsReceiver'));
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            showLiquidAlert(t('settlement.toastAmountInvalid'));
            return;
        }
        // Guided undo + re-record. Confirm so the user understands the
        // edit replaces the row (the recipient gets a revert + a new
        // settled-up notification, same as a manual undo then re-settle).
        showConfirmModal({
            title: t('settlement.editServerConfirmTitle'),
            message: t('settlement.editServerConfirmBody'),
            confirmText: t('settlement.updateBtn'),
            onConfirm: () => { void (async () => {
                // B5-B2: refuse the whole edit up front when offline. This is a
                // DELETE-then-re-record with no atomicity: settleDebt's own
                // offline guard returns silently, so if we delete first and the
                // re-record is skipped the settlement is permanently lost and
                // the cleared debt reappears. Gate the destructive delete on
                // connectivity so we never destroy the row we can't replace.
                if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                    showLiquidAlert(t('errors.offline'), 'info');
                    return;
                }
                // MK6 P1: work out the euroValue the re-record needs BEFORE we
                // delete anything. For a no-rate currency settleDebt refuses
                // without an explicit euroValue, so the old delete-then-record
                // order destroyed the settlement and never re-recorded it —
                // permanent data loss, and the cleared debt reappeared. Scale
                // the row's frozen euroValue by the amount change (same as the
                // legacy edit path above: carry the original implied rate, never
                // fabricate 1:1). If there's no basis to derive one, refuse
                // WITHOUT deleting so the settlement survives.
                const settleOpts: { method: string; note: string; euroValue?: number } =
                    { method, note };
                if (cur !== 'EUR' && !hasRate(cur)) {
                    const oldAmount = Number(s.amount) || 0;
                    const oldEuro = Number(s.euroValue) || 0;
                    const scaledEuro = oldAmount > 0 ? oldEuro * (amount / oldAmount) : oldEuro;
                    if (!(scaledEuro > 0)) {
                        showLiquidAlert(t('settlement.toastNoRateNeedEuro', { currency: cur }));
                        return;
                    }
                    settleOpts.euroValue = Math.round(scaledEuro * 10000) / 10000;
                }
                const del = await deleteSettlementOnServer(s.id);
                if (del.error) {
                    showLiquidAlert(t('settlement.toastSettlementFailed', {
                        error: del.error || t('settlement.toastSettlementFailedNetwork'),
                    }));
                    return;
                }
                // Drop the old row locally so the balance reflects the
                // delete immediately even before the re-record lands.
                STATE.settlements = STATE.settlements.filter((row) => row.id !== s.id);
                emit(EVENTS.STATE_CHANGED);
                // Re-record with the edited values via the standard path.
                await settleDebt(s.tripId, from, to, amount, cur, settleOpts);
            })(); },
        });
        close();
    };
}
