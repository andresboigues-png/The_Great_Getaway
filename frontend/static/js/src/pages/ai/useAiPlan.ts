// pages/ai/useAiPlan.ts — extracted from AI.tsx (behavior-preserving).
//
// The state + business logic behind ActiveTripView: form inputs
// (dates / food + sights context / BYO key), the shared Gemini
// host-key pool status, the itinerary + generation-error state, and
// the two big flows — `runGenerate` (POST /api/generate_itinerary)
// and `onAcceptPlan` (write tripDays + auto-push verified places).
//
// Every MK2/MK3 AI fix is preserved verbatim:
//   - BUG-2: `toItineraryDays` coerces `{days:[…]}` / garbage to a
//     day-array or null so a variant response can't crash the page.
//   - BUG-3: 75s fetch timeout (generation takes ~30s).
//   - BUG-38: don't let the catch's last-ditch host-key re-fetch
//     overwrite a freshly-drained pool snapshot.
//   - R10-B6b MA2: explicit `userCapHit` / HTTP-429 signal wins over
//     regex-on-error-message quota detection.
//
// All hooks here are unconditional, so callers can use this hook at
// the top of a component without violating the rules of hooks.

import { useEffect, useState } from 'react';
import { STATE, emit } from '../../state.js';
import { showLiquidAlert, q } from '../../utils.js';
import {
    apiFetch,
    upsertDay,
    upsertTrip,
    fetchGeminiHostKeyStatus,
    type GeminiHostKeyStatus,
} from '../../api.js';
import { showModal } from '../../components/Modal.js';
import {
    getMarkedPlaces,
    addOrUpdatePlaceFromVerified,
    dropAITaggedPlaces,
    type VerifiedAIItem,
} from '../../markedPlaces.js';
import {
    flattenSlotForTextarea,
    flattenMealForTextarea,
    flattenSightsForTip,
    isFoodSightsSchema,
    type AiSlot,
    type AiPlanItem,
    type AiDayPlan,
} from './slots.js';
import { t } from '../../i18n.js';
import type { Trip, TripDay } from '../../types';


/** MK2 BUG-2: the AI itinerary MUST be a day-array before any
 *  `.map`/`.forEach`. Gemini sometimes wraps it as `{ days: [...] }` (the
 *  backend even detects this shape for telemetry but forwarded it raw), and a
 *  stale `activeTrip.aiPlan` persisted from an old session could be any shape.
 *  Feeding a non-array into the renderer threw `TypeError: e.map is not a
 *  function` straight into the page-mount ErrorBoundary — a full-page crash
 *  that lost the (paid) plan. Coerce to a day-array or null so a variant /
 *  garbage response can never crash the page. */
export function toItineraryDays(x: unknown): AiDayPlan[] | null {
    if (Array.isArray(x)) return x as AiDayPlan[];
    if (x && typeof x === 'object' && Array.isArray((x as { days?: unknown }).days)) {
        return (x as { days: AiDayPlan[] }).days;
    }
    return null;
}


// ── Initial-date derivation ────────────────────────────────────
export function deriveInitialDates(activeTrip: Trip): { from: string; to: string } {
    const tripDays = (STATE.tripDays || [])
        .filter(
            (d) => d.tripId === activeTrip.id && d.dayNumber > 0 && d.date,
        )
        .map((d) => d.date)
        .sort();
    const tripExps = STATE.expenses
        .filter((e) => e.tripId === activeTrip.id && e.date)
        .sort((a, b) => a.date.localeCompare(b.date));
    const expenseDates = tripExps.map((e) => e.date);
    const minDate = activeTrip.dateFrom || tripDays[0] || expenseDates[0] || '';
    const maxDate =
        activeTrip.dateTo ||
        tripDays[tripDays.length - 1] ||
        expenseDates[expenseDates.length - 1] ||
        '';
    return { from: minDate, to: maxDate };
}


export interface UseAiPlanResult {
    // Date inputs.
    dateFrom: string;
    dateTo: string;
    setDateFrom: (v: string) => void;
    setDateTo: (v: string) => void;
    dateValidityErr: string | null;
    // Context inputs.
    foodContext: string;
    sightseeingContext: string;
    onFoodContextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onSightseeingContextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    // BYO key.
    geminiKey: string;
    onKeyChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    showKey: boolean;
    setShowKey: React.Dispatch<React.SetStateAction<boolean>>;
    keyStatus: { text: string; color: string };
    onShowKeyHelp: () => void;
    // Host-key pool + BYO panel.
    hostPoolStatus: GeminiHostKeyStatus | null;
    showByoCard: boolean;
    setShowByoCard: React.Dispatch<React.SetStateAction<boolean>>;
    // Generation + itinerary.
    generating: boolean;
    itinerary: AiDayPlan[] | null;
    generationError: { msg: string; hint: string; raw: string } | null;
    setGenerationError: React.Dispatch<
        React.SetStateAction<{ msg: string; hint: string; raw: string } | null>
    >;
    runGenerate: () => Promise<void>;
    onAcceptPlan: () => void;
}

export function useAiPlan(activeTrip: Trip, tripCountry: string): UseAiPlanResult {
    // Date defaults — priority: trip.dateFrom/To → tripDays date range
    // → expenses date range → empty.
    const initialDates = useState(() => deriveInitialDates(activeTrip))[0];

    // React state for form inputs.
    const [dateFrom, setDateFrom] = useState(initialDates.from);
    const [dateTo, setDateTo] = useState(initialDates.to);
    // Food + sightseeing context — split into two boxes per the user's
    // request so the LLM gets a structured ask ("here's what I want to
    // eat" / "here's what I want to see") instead of one mixed blob.
    // Migrates any legacy single-blob `aiContext` into `aiFoodContext`
    // so the previous-session text isn't lost — that field is the
    // closest semantic fit (most legacy notes describe food + activity
    // mix, leaning food).
    const [foodContext, setFoodContext] = useState<string>(
        () => activeTrip.aiFoodContext ?? activeTrip.aiContext ?? '',
    );
    const [sightseeingContext, setSightseeingContext] = useState<string>(
        () => activeTrip.aiSightseeingContext ?? '',
    );
    const [geminiKey, setGeminiKey] = useState<string>(STATE.geminiApiKey || '');
    const [showKey, setShowKey] = useState(false);
    const [generating, setGenerating] = useState(false);

    // Itinerary state — null until generated. Initialised from
    // activeTrip.aiPlan so re-mounts paint the last accepted plan.
    const [itinerary, setItinerary] = useState<AiDayPlan[] | null>(toItineraryDays(activeTrip.aiPlan));
    const [generationError, setGenerationError] = useState<{
        msg: string;
        hint: string;
        raw: string;
    } | null>(null);

    // ── Shared Gemini host-key pool ─────────────────────────────
    // The backend rotates through up to 6 host keys before asking
    // the user to bring their own. We surface the pool state as a
    // "usage bar" so the user sees AT A GLANCE how much of today's
    // shared budget is left (filled = drained). State is GLOBAL —
    // every user shares the same key pool. Re-fetches after every
    // generation since `host_keys` rides in both the success and
    // 429 response bodies.
    //
    // The BYO panel starts collapsed — the bar is the first-class
    // path, and the input is the escape hatch.
    const [hostPoolStatus, setHostPoolStatus] = useState<GeminiHostKeyStatus | null>(null);
    const [showByoCard, setShowByoCard] = useState<boolean>(
        () => Boolean((STATE.geminiApiKey || '').trim()),
    );

    useEffect(() => {
        let cancelled = false;
        void fetchGeminiHostKeyStatus().then((s) => {
            if (!cancelled) setHostPoolStatus(s);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Date validity ────────────────────────────────────────────
    const dateValidityErr =
        dateFrom && dateTo && dateTo < dateFrom
            ? t('ai.dateValidityErr')
            : null;

    // ── Persist food / sights context to STATE on input ─────────
    // Two write paths now — one per textarea. Each stores onto the
    // active trip so a re-mount or app reload preserves the input,
    // matching the previous single-context persistence.
    const onFoodContextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value;
        setFoodContext(v);
        activeTrip.aiFoodContext = v;
        emit('state:changed');
    };
    const onSightseeingContextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value;
        setSightseeingContext(v);
        activeTrip.aiSightseeingContext = v;
        emit('state:changed');
    };

    // ── Gemini key plumbing ─────────────────────────────────────
    const onKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setGeminiKey(v);
        STATE.geminiApiKey = v;
        emit('state:changed');
    };

    const keyStatus = (() => {
        const v = (geminiKey || '').trim();
        if (!v) return { text: t('ai.keyStatusEmpty'), color: '#a85d00' };
        const looksLegit = v.startsWith('AIza') && v.length >= 30;
        return looksLegit
            ? { text: t('ai.keyStatusOk'), color: '#1a6b3c' }
            : {
                  text: t('ai.keyStatusBadFormat'),
                  color: '#a85d00',
              };
    })();

    const onShowKeyHelp = () => {
        const { root: helpRoot, close: closeHelp } = showModal({
            cardClass: 'card glass',
            cardStyle:
                'width: 520px; max-width: calc(100vw - 32px); max-height: 90vh; overflow-y: auto; padding: 28px 32px; border-radius: 28px; background: white;',
            innerHTML: `
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px;">
                    <h2 style="margin:0; font-size: 1.6rem; color:#7c3a9e; font-weight: 800; letter-spacing:-0.02em;">${t('ai.keyHelpModalTitle')}</h2>
                    <button id="aiKeyHelpClose" class="close-x-btn" aria-label="${t('common.close')}">✕</button>
                </div>
                <p style="margin:0 0 14px; color: var(--text-secondary); font-size: 0.92rem; line-height: 1.5;">
                    ${t('ai.keyHelpModalIntro')}
                </p>
                <ol style="margin: 0 0 16px 0; padding-left: 22px; color: #002d5b; font-size: 0.92rem; line-height: 1.7;">
                    <li>${t('ai.keyHelpStepOpenLink')}</li>
                    <li>${t('ai.keyHelpStepSignIn')}</li>
                    <li>${t('ai.keyHelpStepCreate')}</li>
                    <li>${t('ai.keyHelpStepProject')}</li>
                    <li>${t('ai.keyHelpStepCopy')}</li>
                    <li>${t('ai.keyHelpStepPaste')}</li>
                </ol>
                <div style="background: rgba(155,89,182,0.06); border:1px solid rgba(155,89,182,0.18); border-radius: 14px; padding: 12px 14px; font-size: 0.82rem; color: #002d5b; line-height: 1.55;">
                    <strong>${t('ai.keyHelpWhatForTitle')}</strong> ${t('ai.keyHelpWhatForBody')}
                </div>
                <div style="margin-top: 12px; background: rgba(52,199,89,0.06); border:1px solid rgba(52,199,89,0.22); border-radius: 14px; padding: 12px 14px; font-size: 0.82rem; color: #002d5b; line-height: 1.55;">
                    <strong style="color:#1a6b3c;">${t('ai.keyHelpHowManyTitle')}</strong>
                    <p style="margin:6px 0 0;">${t('ai.keyHelpHowManyBody')}</p>
                    <div style="margin-top:8px;"><strong style="color:#1a6b3c;">${t('ai.keyHelpBucketsTitle')}</strong>
                        <ul style="margin: 4px 0 0; padding-left: 18px;">
                            <li>${t('ai.keyHelpBucketMinute')}</li>
                            <li>${t('ai.keyHelpBucketDay')}</li>
                        </ul>
                    </div>
                    <div style="margin-top:8px;">${t('ai.keyHelpRateLimitTip')}</div>
                    <div style="margin-top:8px; font-size: 0.78rem;">${t('ai.keyHelpDashboardLink')}</div>
                </div>
                <div style="display:flex; justify-content:flex-end; margin-top:18px;">
                    <button id="aiKeyHelpDone" class="btn-primary" style="padding: 10px 22px; border-radius: 999px;">${t('ai.keyHelpDoneBtn')}</button>
                </div>
            `,
        });
        (q(helpRoot, '#aiKeyHelpClose') as HTMLButtonElement)?.addEventListener(
            'click',
            closeHelp,
        );
        (q(helpRoot, '#aiKeyHelpDone') as HTMLButtonElement)?.addEventListener(
            'click',
            closeHelp,
        );
    };

    // ── Generate flow ───────────────────────────────────────────
    const runGenerate = async () => {
        if (!dateFrom || !dateTo) {
            showLiquidAlert(t('ai.toastPickDates'));
            return;
        }
        if (dateTo < dateFrom) {
            showLiquidAlert(t('ai.toastEndBeforeStart'));
            return;
        }
        const from = new Date(dateFrom);
        const to = new Date(dateTo);
        const numDays = Math.max(
            1,
            Math.round((to.getTime() - from.getTime()) / 86400000) + 1,
        );

        // Build to-do suffix from forAI && forManual marked places.
        const markedForAI = getMarkedPlaces(activeTrip).filter(
            (p) => p.forAI && p.forManual,
        );
        let markedSuffix = '';
        if (markedForAI.length > 0) {
            const sortedTripDays = (STATE.tripDays || []).filter(
                (d) => d.tripId === activeTrip.id && d.dayNumber > 0,
            );
            const dayNumberOf = (id: string) =>
                sortedTripDays.find((d) => d.id === id)?.dayNumber;
            const lines = markedForAI
                .map((p) => {
                    const d = p.dayId ? dayNumberOf(p.dayId) : null;
                    const dayPart = d ? `, on Day ${d}` : '';
                    const timePart = p.timeOfDay ? `, ${p.timeOfDay}` : '';
                    const addrPart = p.address ? ` (${p.address})` : '';
                    return `- ${p.name}${addrPart}${dayPart}${timePart}`;
                })
                .join('\n');
            markedSuffix = `\n\nThe user has marked these specific places to include in the itinerary. Please incorporate them where they fit, respecting any day/time assignments where given:\n${lines}`;
        }
        // The "marked places" suffix carries the user's to-do list as
        // hints into the prompt. It applies to BOTH food + sightseeing
        // (a to-do entry can be either) so we append it to the sights
        // context — the LLM treats the suffix as places to incorporate
        // where they fit. Sticking to sights avoids the awkwardness of
        // having a marked restaurant suddenly land in the sightseeing
        // section AND the breakfast slot.
        const sightsContextWithMarked = sightseeingContext + markedSuffix;
        activeTrip.aiFoodContext = foodContext;
        activeTrip.aiSightseeingContext = sightseeingContext;
        activeTrip.aiNumDays = numDays;
        emit('state:changed');

        setGenerating(true);
        setGenerationError(null);
        // R10-B6b MA2: lift the per-user-cap signal into a closure
        // variable so the catch block can branch on the BACKEND'S
        // explicit `d.userCapHit` flag (and/or HTTP 429) before
        // falling back to regex-on-message detection. Pre-fix the
        // catch tested `/quota|...|429|.../i.test(rawMsg)` against
        // the thrown Error's message — fragile, miss-prone, and
        // ambiguous (an upstream Google "quota" error mixes with
        // our own per-user cap). The backend already ships
        // `{userCapHit: true}` on the per-user-cap 429 (see
        // src/routes/integrations.py:679). Source-of-truth wins.
        let serverUserCapHit = false;
        let serverStatus = 0;
        // BUG-38 (MK2 audit): track whether the bar was already updated
        // from the response's authoritative `host_keys` snapshot, so the
        // catch's last-ditch status re-fetch doesn't overwrite a freshly
        // drained pool with a (possibly stale) "0% used" reading.
        let poolUpdatedInline = false;
        try {
            const r = await apiFetch('/api/generate_itinerary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destination: tripCountry,
                    numDays,
                    dateFrom,
                    dateTo,
                    foodContext,
                    sightseeingContext: sightsContextWithMarked,
                    gemini_key: (STATE.geminiApiKey || '').trim(),
                }),
            }, 75_000);  // MK2 BUG-3: generation takes ~30s (Gemini + Places); the blanket 20s aborted every multi-day plan
            serverStatus = r.status;
            const d = await r.json();
            // R10-B6b MA2: capture the explicit per-user-cap signal
            // before we throw — the catch needs both this and
            // `serverStatus === 429` to make the routing decision
            // without depending on regex-against-error-string.
            if (d && d.userCapHit === true) serverUserCapHit = true;
            // Backend rides the latest pool snapshot in both success
            // and error responses (see src/routes/integrations.py).
            // Update the bar BEFORE the throw so the user sees the
            // freshly-drained slot count even on a 429.
            if (d && d.host_keys) {
                setHostPoolStatus(d.host_keys as GeminiHostKeyStatus);
                poolUpdatedInline = true;
            }
            if (d.error) throw new Error(d.error);
            // MK2 BUG-2: normalise to a day-array (unwrap `{days:[…]}`) before
            // it touches state/render; a bare string or un-unwrappable object
            // becomes null → friendly retry instead of a page crash.
            const generated = toItineraryDays(d.itinerary);
            if (generated != null) {
                // `aiPlan` is declared `string` in types.d.ts but in practice
                // holds the normalised day-array (the renderer + toItineraryDays
                // both read it back as AiDayPlan[]). Cast through `unknown`
                // since AiDayPlan[] isn't assignable to the declared `string`;
                // type-only, no runtime change.
                activeTrip.aiPlan = generated as unknown as string;
            } else {
                delete activeTrip.aiPlan;
                // Truthy-but-unreadable model output: surface an error rather
                // than rendering nothing as if generation never happened.
                if (d.itinerary != null) throw new Error(t('ai.errorGeneric'));
            }
            emit('state:changed');
            setItinerary(generated);
        } catch (e) {
            const rawMsg = (e as Error).message || '';
            let msg = t('ai.errorGeneric');
            let hint = '';
            // R10-B6b MA2: explicit-signal branch wins over the regex
            // tree. Backend tells us directly when the user has hit
            // their per-account daily cap (vs. a pool-wide drain, an
            // upstream Google overload, or a BYO-key auth issue); we
            // should not be regex-guessing that from the error text.
            if (serverUserCapHit || (serverStatus === 429 && /you've|cap|user/i.test(rawMsg))) {
                msg = t('ai.errorQuota');
                hint = t('ai.errorQuotaHint');
                setShowByoCard(true);
            } else if (/UNAVAILABLE|503|overloaded/i.test(rawMsg)) {
                msg = t('ai.errorOverloaded');
                hint = t('ai.errorOverloadedHint');
            } else if (/quota|limit|RESOURCE_EXHAUSTED|429|fully booked/i.test(rawMsg)) {
                msg = t('ai.errorQuota');
                hint = t('ai.errorQuotaHint');
                // Pool drained → auto-pop the BYO panel so the user
                // sees their escape hatch without hunting for it.
                setShowByoCard(true);
            } else if (/key|api[_ ]?key|UNAUTHENTICATED|401|403/i.test(rawMsg)) {
                msg = t('ai.errorBadKey');
                hint = t('ai.errorBadKeyHint');
            } else if (/network|fetch|timed?[- ]?out|ECONN/i.test(rawMsg)) {
                msg = t('ai.errorNetwork');
                hint = t('ai.errorNetworkHint');
            }
            setGenerationError({ msg, hint, raw: rawMsg || t('ai.errorUnknown') });
            showLiquidAlert(msg);
            // Last-ditch refresh — ONLY when the inline `d.host_keys`
            // update never fired (non-JSON response or network error).
            // BUG-38: firing this unconditionally overwrote the accurate
            // drained snapshot we just set on a 429 with a status
            // re-fetch that could read back "0% used" — the bar flipped
            // from "fully drained" to "empty" right after the quota error.
            if (!poolUpdatedInline) {
                void fetchGeminiHostKeyStatus().then((s) => {
                    if (s) setHostPoolStatus(s);
                });
            }
        } finally {
            setGenerating(false);
        }
    };

    // ── Accept plan: writes tripDays + auto-pushes verified places ─
    const onAcceptPlan = () => {
        if (!itinerary) return;
        // "Accept Plan & Add to Trip" MERGES the AI itinerary into the trip's
        // numbered days BY POSITION — it must never delete days the user has
        // already journaled. Pre-fix (Audit MK5 P0) this blanket-deleted EVERY
        // numbered day and the server delete-cascade permanently unlinked those
        // days' photos/documents from disk — so accepting a plan silently wiped
        // day notes + attached media. Now we reuse existing day rows in order,
        // overwriting only the plan text / date / coords the AI provides and
        // PRESERVING each day's id, notes, photos, documents and tickets.
        // Existing days beyond the AI plan's length are left fully intact.
        const existingNumbered = STATE.tripDays
            .filter((d) => d.tripId === activeTrip.id && d.dayNumber > 0)
            .sort((a, b) => a.dayNumber - b.dayNumber);

        // Drop the PREVIOUS AI run's to-do places. dropAITaggedPlaces only
        // removes source==='ai' items, so the user's manual picks survive.
        dropAITaggedPlaces(activeTrip);

        itinerary.forEach((dayInfo: AiDayPlan, idx: number) => {
            // `toISOString()` is RFC-guaranteed to contain a 'T', so the
            // split always yields index 0 — the `!` is sound and type-only
            // (satisfies noUncheckedIndexedAccess without a runtime branch).
            const dayDate: string = dayInfo.date || new Date().toISOString().split('T')[0]!;
            // Schema fork: the new food/sights split stores each meal
            // (one restaurant) as the morning/afternoon/evening plan
            // text, and the sights list as the day's `tip` field so the
            // home day card surfaces it under "Tip / Notes" without a
            // tripDays schema migration. Legacy schema keeps the
            // existing flatten-slot path so cached aiPlan blobs still
            // accept cleanly.
            const usesFoodSights = isFoodSightsSchema(dayInfo);
            // The meal/sights fields are `unknown` on AiDayPlan (LLM JSON);
            // the slot helpers below narrow defensively, so the casts to
            // their declared param types are safe (type-only).
            const planMorning = usesFoodSights
                ? flattenMealForTextarea(dayInfo.breakfast as AiPlanItem, '🥐 Breakfast')
                : flattenSlotForTextarea(dayInfo.morning);
            const planAfternoon = usesFoodSights
                ? flattenMealForTextarea(dayInfo.lunch as AiPlanItem, '🥗 Lunch')
                : flattenSlotForTextarea(dayInfo.afternoon);
            const planEvening = usesFoodSights
                ? flattenMealForTextarea(dayInfo.dinner as AiPlanItem, '🍷 Dinner')
                : flattenSlotForTextarea(dayInfo.evening);
            const tip = usesFoodSights ? flattenSightsForTip(dayInfo.sights as AiPlanItem[]) : '';

            // Reuse the existing day at this position if there is one (keeps its
            // id + user-authored content); otherwise append a fresh day.
            const prior = existingNumbered[idx];
            let dayId: string;
            if (prior) {
                dayId = prior.id;
                prior.date = dayDate;
                prior.name = dayInfo.title || prior.name || `Day ${idx + 1}`;
                prior.dayNumber = idx + 1;
                // Overwrite each slot with the AI's text, but keep the user's
                // own plan text where the AI left that slot empty.
                prior.plan = {
                    morning: planMorning || prior.plan?.morning || '',
                    afternoon: planAfternoon || prior.plan?.afternoon || '',
                    evening: planEvening || prior.plan?.evening || '',
                };
                if (tip) prior.tip = tip;
                if (typeof dayInfo.lat === 'number') prior.lat = dayInfo.lat;
                if (typeof dayInfo.lon === 'number') prior.lng = dayInfo.lon;
                void upsertDay(prior);
            } else {
                dayId = 'day_' + Date.now() + '_' + idx;
                const newDay: TripDay = {
                    id: dayId,
                    tripId: activeTrip.id,
                    date: dayDate,
                    name: dayInfo.title || `Day ${idx + 1}`,
                    dayNumber: idx + 1,
                    // `?? null`: AiDayPlan.lat/lon are `number | undefined`, but
                    // TripDay.lat/lng are `number | null` (exactOptionalPropertyTypes
                    // forbids an explicit `undefined`). Coalescing to null preserves
                    // the "no coords yet" meaning — the geocoder fills real values.
                    lat: dayInfo.lat ?? null,
                    lng: dayInfo.lon ?? null,
                    photos: [],
                    tickets: [],
                    notes: '',
                    plan: {
                        morning: planMorning,
                        afternoon: planAfternoon,
                        evening: planEvening,
                    },
                };
                if (tip) newDay.tip = tip;
                STATE.tripDays.push(newDay);
                void upsertDay(newDay);
            }

            // Auto-push verified places to the to-do list.
            if (usesFoodSights) {
                // New schema — one restaurant per meal slot + the
                // sights list. Tag each restaurant to its meal's
                // time-of-day; sights get a neutral tag (no specific
                // time-of-day) so the to-do list shows them as
                // open-slot items the user can later assign.
                const meals: Array<['morning' | 'afternoon' | 'evening', unknown]> = [
                    ['morning', dayInfo.breakfast],
                    ['afternoon', dayInfo.lunch],
                    ['evening', dayInfo.dinner],
                ];
                for (const [timeOfDay, raw] of meals) {
                    // The meal field is `unknown` (LLM JSON); narrow to the
                    // verified-item shape before the guard reads its fields.
                    // `name` isn't on VerifiedAIItem but some LLM payloads
                    // use it, so widen with `{ name?: string }` — type-only.
                    const place = raw as (VerifiedAIItem & { name?: string }) | null;
                    if (place && typeof place === 'object' && (place.text || place.name)) {
                        addOrUpdatePlaceFromVerified(activeTrip, place, dayId, timeOfDay);
                    }
                }
                const sights: VerifiedAIItem[] = Array.isArray(dayInfo.sights)
                    ? (dayInfo.sights as VerifiedAIItem[])
                    : [];
                for (const sight of sights) {
                    // Sights don't have a fixed time-of-day in the
                    // new schema — they're a separate cluster. Pass
                    // null so the to-do entry stays day-tagged but
                    // not slot-tagged; the user can later assign one.
                    addOrUpdatePlaceFromVerified(activeTrip, sight, dayId, null);
                }
            } else {
                // Legacy schema — items[] under each time-of-day.
                const slots: Array<['morning' | 'afternoon' | 'evening', AiSlot | undefined]> = [
                    ['morning', dayInfo.morning],
                    ['afternoon', dayInfo.afternoon],
                    ['evening', dayInfo.evening],
                ];
                for (const [timeOfDay, slot] of slots) {
                    const items: AiPlanItem[] = Array.isArray(slot?.items) ? slot.items : [];
                    for (const item of items) {
                        // `item` is `string | Partial<VerifiedSlotItem>`; the
                        // callee guards on `verified`/`placeId` and bails on a
                        // legacy string, so the cast is safe (type-only).
                        addOrUpdatePlaceFromVerified(activeTrip, item as VerifiedAIItem, dayId, timeOfDay);
                    }
                }
            }
        });
        void upsertTrip(activeTrip);
        emit('state:changed');
        // Don't reset itinerary — keep showing the accepted plan.
    };

    return {
        dateFrom,
        dateTo,
        setDateFrom,
        setDateTo,
        dateValidityErr,
        foodContext,
        sightseeingContext,
        onFoodContextChange,
        onSightseeingContextChange,
        geminiKey,
        onKeyChange,
        showKey,
        setShowKey,
        keyStatus,
        onShowKeyHelp,
        hostPoolStatus,
        showByoCard,
        setShowByoCard,
        generating,
        itinerary,
        generationError,
        setGenerationError,
        runGenerate,
        onAcceptPlan,
    };
}
