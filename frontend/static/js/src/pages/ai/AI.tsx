// pages/ai/AI.tsx — §3.3 React migration (AI wave 8, final).
//
// Was a thin wrapper that mounted the legacy renderAI() into a
// React tree. This commit replaces the wrapper with a full JSX
// implementation — the legacy 947-line imperative renderAI in
// pages/ai.ts is now retired. AI is the eighth and final
// thin-wrapper page to graduate. §3.3 is complete.
//
// Architecture
//   - One component (this file). Active-trip view + empty-trip view
//     both live here since they don't share a lot — empty is just
//     a welcome card + Google Map placeholder.
//   - Active trip:
//       * Header (title + subtitle)
//       * 2-col layout: Controls (key + dates + requirements +
//         Generate button) | Sticky Google Map
//       * To-do list panel (full-width below)
//       * Itinerary output (full-width below)
//   - Google Map setup + marker drop lives in a useEffect with refs
//     (matches the HeroMap pattern from §3.3 wave 6 Home migration).
//   - Generated itinerary lives in React state; flipping it
//     triggers a re-render that geocodes + drops markers for each
//     day.
//
// External surface preserved
//   - The route still mounts /ai via pages/ai/mount.ts. That
//     wiring is unchanged.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../react/store.js';
import { useActiveTrip } from '../../react/TripContext.js';
import { STATE, emit } from '../../state.js';
import { showLiquidAlert, formatDayDate, q } from '../../utils.js';
import {
    apiFetch,
    upsertDay,
    deleteDayOnServer,
    upsertTrip,
    fetchGeminiHostKeyStatus,
    type GeminiHostKeyStatus,
} from '../../api.js';
import { applyMapTheme } from '../../theme.js';
import { mobileSafeGestureHandling, whenGoogleMapsReady } from '../../googleMapsServices.js';
import { showModal } from '../../components/Modal.js';
import { openNewTripModal } from '../../modals.js';
import { navigate } from '../../router.js';
import {
    canEdit,
    getMyRole,
    ROLE_BUDGETEER,
    ROLE_RELAXER,
} from '../../permissions.js';
import {
    getMarkedPlaces,
    setMarkedPlaceAssignment,
    addOrUpdatePlaceFromVerified,
    dropAITaggedPlaces,
} from '../../markedPlaces.js';
import {
    renderSlotBody,
    flattenSlotForTextarea,
    renderRestaurantCard,
    renderSightsList,
    flattenMealForTextarea,
    flattenSightsForTip,
    isFoodSightsSchema,
} from './slots.js';
import { t, tn } from '../../i18n.js';
import { stripEmoji, iconSvg } from '../../icons.js';
import type { Trip } from '../../types';
// Shared category helpers — same source-of-truth as Todo.tsx so the
// AI plan's marked-place list groups + filters by the canonical
// category order. See `todoCategories.ts`.
import {
    iconToLabel,
    groupingIcon,
    groupByCategory,
    placeMapsUrl,
} from '../../todoCategories.js';
import { FilterSelect } from '../../react/components/FilterSelect.js';
// Page-scoped CSS — AI plan blocks, place cards, generate button,
// + mobile day-card stacking. FIXING_ROADMAP §3.1 second slice (after
// settings.css): same pattern, Vite emits this as a CSS chunk alongside
// the AI JS bundle so users who never visit /ai don't pay for these
// ~250 lines.
import './ai.css';


// ── Top-level ──────────────────────────────────────────────────
export function AI() {
    // §3.4 — `useActiveTrip` is the single canonical resolver of
    // "what trip is the user looking at" + the derived fields the
    // sub-views care about. Pre-§3.4 this was a hand-rolled
    // `STATE.trips.find(...)` chain that re-ran on every state
    // change (notification poll, expense edit, etc.). The hook
    // memoizes on the right slices so this top-level only re-renders
    // when the trip identity actually changes.
    const { trip: activeTrip } = useActiveTrip();

    if (!activeTrip) {
        return <EmptyTripView />;
    }
    return <ActiveTripView activeTrip={activeTrip} />;
}


// ── Empty state (no active trip) ───────────────────────────────
function EmptyTripView() {
    const mapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        // Wait for the async Google Maps script to finish loading
        // before initialising. Without the gate, a direct landing on
        // /ai (or a hard-refresh) often arrived before the SDK was
        // ready and left the container blank forever. See
        // `whenGoogleMapsReady` in googleMapsServices.ts.
        let cancelled = false;
        whenGoogleMapsReady()
            .then(() => {
                if (cancelled) return;
                const mapEl = mapRef.current;
                if (!mapEl) return;
                const emptyMap = new google.maps.Map(mapEl, {
                    center: { lat: 20, lng: 0 },
                    zoom: 2,
                    minZoom: 2,
                    gestureHandling: mobileSafeGestureHandling(),
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
                    styles: [] as any,
                });
                applyMapTheme(emptyMap, []);
            })
            .catch((err) => {
                // Log but don't surface — the empty-trip view is a
                // welcome screen, missing map there is degraded but
                // not blocking.
                console.warn('[AI empty map] Google Maps failed to load:', err);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const sf =
        "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif";

    return (
        <div>
            <div style={{ padding: '32px 0 24px', fontFamily: sf }}>
                <h1
                    className="mt-0 mx-0 mb-1.5 text-[2.8rem] font-extrabold tracking-[-0.04em] [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
                >
                    {stripEmoji(t('ai.title'))}
                </h1>
                <p className="ai-subtitle">
                    Your AI-powered travel planner
                </p>
            </div>
            <div
                className="relative w-full h-[calc(100vh_-_200px)] min-h-[480px] rounded-[20px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.15)]"
            >
                <div ref={mapRef} id="emptyMap" className="w-full h-full" />
                <div
                    className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(255,255,255,0.05)] backdrop-filter-[blur(25px)_saturate(180%)] [-webkit-backdrop-filter:blur(25px)_saturate(180%)] z-[1000]"
                >
                    <div
                        className="premium-glass-card text-center text-brand-navy p-12 max-w-[500px] bg-[rgba(255,255,255,0.6)] rounded-[36px] border border-[rgba(255,255,255,0.8)] shadow-[0_30px_60px_rgba(0,0,0,0.1),_0_10px_20px_rgba(0,0,0,0.05)]"
                    >
                        <div
                            className="mb-6 flex justify-center text-accent-blue [filter:drop-shadow(0_10px_15px_rgba(0,0,0,0.1))]"
                            dangerouslySetInnerHTML={{ __html: iconSvg('compass', { size: 64 }) }}
                        />
                        <h2
                            className="text-[2rem] font-extrabold mb-4 tracking-[-0.03em]"
                        >
                            {t('ai.noTripTitle')}
                        </h2>
                        <p
                            className="text-[1.15rem] opacity-85 leading-[1.6] font-sans mb-8"
                        >
                            {t('ai.noTripBody')}
                        </p>
                        <button
                            type="button"
                            className="btn-primary btn-primary--lg max-w-none w-auto py-4 px-9 text-[1.15rem]"
                            onClick={() => openNewTripModal()}
                        >
                            {t('ai.noTripCta')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}


// ── Active trip view ───────────────────────────────────────────
interface ActiveTripViewProps {
    activeTrip: Trip;
}

function ActiveTripView({ activeTrip }: ActiveTripViewProps) {
    const tripCountry = activeTrip.country || '';

    // Date defaults — priority: trip.dateFrom/To → tripDays date range
    // → expenses date range → empty.
    const initialDates = useState(() => deriveInitialDates(activeTrip))[0];

    const tripIsEditable = canEdit(activeTrip);
    const savedNumDays = activeTrip.aiNumDays || 1;

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
    const [itinerary, setItinerary] = useState<any>(activeTrip.aiPlan || null);
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
        fetchGeminiHostKeyStatus().then((s) => {
            if (!cancelled) setHostPoolStatus(s);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Google Map + markers — managed in a useEffect with refs.
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const googleMapRef = useRef<any>(null);
    const mapMarkersRef = useRef<any[]>([]);
    const dayRowsRef = useRef<HTMLDivElement[]>([]);

    // ── Initial map setup ────────────────────────────────────────
    useEffect(() => {
        // Wait for the async Google Maps script — see the empty-trip
        // effect above for the rationale.
        let cancelled = false;
        whenGoogleMapsReady()
            .then(() => {
                if (cancelled) return;
                const mapEl = mapContainerRef.current;
                if (!mapEl) return;
                const map = new google.maps.Map(mapEl, {
                    center: { lat: 20, lng: 0 },
                    zoom: 2,
                    minZoom: 2,
                    mapTypeId: 'roadmap',
                    disableDefaultUI: true,
                    gestureHandling: mobileSafeGestureHandling(),
                    restriction: {
                        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
                        strictBounds: true,
                    },
                    styles: [] as any,
                });
                applyMapTheme(map, []);
                googleMapRef.current = map;

                zoomToLocation(map, tripCountry, activeTrip);

                map.addListener('idle', () => {
                    const aiTripMapKey = activeTrip.id + '_ai';
                    if (!STATE.mapViews) STATE.mapViews = {};
                    const c = map.getCenter();
                    STATE.mapViews[aiTripMapKey] = {
                        lat: c.lat(),
                        lng: c.lng(),
                        zoom: map.getZoom(),
                    };
                    emit('state:changed');
                });
            })
            .catch((err) => {
                console.warn('[AI active map] Google Maps failed to load:', err);
            });
        return () => {
            cancelled = true;
        };
        // 2026-05-18 audit fix: include activeTrip.id so switching trips
        // tears down + rebuilds the map against the new trip. The
        // previous `[]` dep relied on the parent `navigate('home')`
        // remount to repaint, which doesn't happen on every trip
        // switch. The `idle` listener also captured `activeTrip` via
        // closure — it now reads the current trip via the latest
        // effect run.
    }, [activeTrip.id]);

    // ── Repaint map markers when itinerary changes ──────────────
    useEffect(() => {
        if (!googleMapRef.current || !itinerary) return;
        // 2026-05-18 audit fix: the previous loop scheduled N setTimeouts
        // with no unmount guard, so switching trips or regenerating the
        // itinerary left orphan geocoder callbacks mutating discarded
        // `day` objects and pushing markers to a destroyed map. The
        // `cancelled` flag below short-circuits every async callback
        // (timer + geocoder + click listener) once the effect re-runs.
        let cancelled = false;
        const timers: number[] = [];
        // Clear previous markers.
        mapMarkersRef.current.forEach((m) => m.setMap(null));
        mapMarkersRef.current = [];
        const map = googleMapRef.current;
        const bounds = new google.maps.LatLngBounds();
        const geocoder = new google.maps.Geocoder();

        itinerary.forEach((day: any, i: number) => {
            const handle = window.setTimeout(() => {
                if (cancelled) return;
                let loc = day.mainLocation || day.title || tripCountry;
                if (!day.mainLocation && day.title) {
                    loc = day.title
                        .replace(
                            /Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi,
                            '',
                        )
                        .trim();
                }
                geocoder.geocode(
                    { address: loc + ', ' + tripCountry },
                    (results: any, status: string) => {
                        // Bail if the effect re-ran (trip switch or
                        // itinerary regen) — don't mutate the day or
                        // create a stranded marker.
                        if (cancelled) return;
                        if (status === 'OK' && results[0]) {
                            const pos = results[0].geometry.location;
                            day.lat = pos.lat();
                            day.lon = pos.lng();
                            const marker = new google.maps.Marker({
                                position: pos,
                                map,
                                label: { text: String(day.day), color: 'white', fontWeight: '800' },
                                icon: {
                                    path: google.maps.SymbolPath.CIRCLE,
                                    scale: 16,
                                    fillColor: '#0071e3',
                                    fillOpacity: 1,
                                    strokeWeight: 2,
                                    strokeColor: 'white',
                                },
                            });
                            marker.addListener('click', () => {
                                if (cancelled) return;
                                dayRowsRef.current.forEach((d) => {
                                    if (!d) return;
                                    d.style.boxShadow = '';
                                    d.style.borderColor = '';
                                });
                                const target = dayRowsRef.current[i];
                                if (target) {
                                    target.style.boxShadow =
                                        '0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)';
                                    target.style.borderColor = 'var(--accent-blue)';
                                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }
                            });
                            mapMarkersRef.current.push(marker);
                            bounds.extend(pos);
                            if (mapMarkersRef.current.length > 0) map.fitBounds(bounds);
                        }
                    },
                );
            }, i * 500);
            timers.push(handle);
        });
        return () => {
            cancelled = true;
            timers.forEach((h) => window.clearTimeout(h));
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itinerary]);

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
            ? { text: '✓ Key saved on this device.', color: '#1a6b3c' }
            : {
                  text: '⚠ Saved, but the format looks off (Gemini keys usually start with "AIza"). Click i for help.',
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
            });
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
            }
            if (d.error) throw new Error(d.error);
            const generated = d.itinerary;
            if (generated != null) {
                activeTrip.aiPlan = generated;
            } else {
                delete activeTrip.aiPlan;
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
            } else if (/network|fetch|timed?[\- ]?out|ECONN/i.test(rawMsg)) {
                msg = t('ai.errorNetwork');
                hint = t('ai.errorNetworkHint');
            }
            setGenerationError({ msg, hint, raw: rawMsg || t('ai.errorUnknown') });
            showLiquidAlert(msg);
            // Last-ditch refresh — if the throw came from a non-JSON
            // response or a network error, the inline `d.host_keys`
            // update above never fired. Fall back to a status fetch
            // so the bar isn't stuck on a stale snapshot.
            fetchGeminiHostKeyStatus().then((s) => {
                if (s) setHostPoolStatus(s);
            });
        } finally {
            setGenerating(false);
        }
    };

    // ── Accept plan: writes tripDays + auto-pushes verified places ─
    const onAcceptPlan = () => {
        if (!itinerary) return;
        // Replace existing numbered days (dayNumber > 0).
        const existingNumbered = STATE.tripDays.filter(
            (d) => d.tripId === activeTrip.id && d.dayNumber > 0,
        );
        STATE.tripDays = STATE.tripDays.filter(
            (d) => !(d.tripId === activeTrip.id && d.dayNumber > 0),
        );
        existingNumbered.forEach((d) => deleteDayOnServer(d.id));

        // Drop AI-tagged places from previous run.
        dropAITaggedPlaces(activeTrip);

        itinerary.forEach((dayInfo: any, idx: number) => {
            const dayDate = dayInfo.date || new Date().toISOString().split('T')[0];
            const dayId = 'day_' + Date.now() + '_' + idx;
            // Schema fork: the new food/sights split stores each meal
            // (one restaurant) as the morning/afternoon/evening plan
            // text, and the sights list as the day's `tip` field so the
            // home day card surfaces it under "Tip / Notes" without a
            // tripDays schema migration. Legacy schema keeps the
            // existing flatten-slot path so cached aiPlan blobs still
            // accept cleanly.
            const usesFoodSights = isFoodSightsSchema(dayInfo);
            const planMorning = usesFoodSights
                ? flattenMealForTextarea(dayInfo.breakfast, '🥐 Breakfast')
                : flattenSlotForTextarea(dayInfo.morning);
            const planAfternoon = usesFoodSights
                ? flattenMealForTextarea(dayInfo.lunch, '🥗 Lunch')
                : flattenSlotForTextarea(dayInfo.afternoon);
            const planEvening = usesFoodSights
                ? flattenMealForTextarea(dayInfo.dinner, '🍷 Dinner')
                : flattenSlotForTextarea(dayInfo.evening);
            const tip = usesFoodSights ? flattenSightsForTip(dayInfo.sights) : '';
            const newDay: any = {
                id: dayId,
                tripId: activeTrip.id,
                date: dayDate,
                name: dayInfo.title || `Day ${idx + 1}`,
                dayNumber: idx + 1,
                lat: dayInfo.lat,
                lng: dayInfo.lon,
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
            upsertDay(newDay);

            // Auto-push verified places to the to-do list.
            if (usesFoodSights) {
                // New schema — one restaurant per meal slot + the
                // sights list. Tag each restaurant to its meal's
                // time-of-day; sights get a neutral tag (no specific
                // time-of-day) so the to-do list shows them as
                // open-slot items the user can later assign.
                const meals: Array<['morning' | 'afternoon' | 'evening', any]> = [
                    ['morning', dayInfo.breakfast],
                    ['afternoon', dayInfo.lunch],
                    ['evening', dayInfo.dinner],
                ];
                for (const [timeOfDay, place] of meals) {
                    if (place && typeof place === 'object' && (place.text || place.name)) {
                        addOrUpdatePlaceFromVerified(activeTrip, place, dayId, timeOfDay);
                    }
                }
                const sights = Array.isArray(dayInfo.sights) ? dayInfo.sights : [];
                for (const sight of sights) {
                    // Sights don't have a fixed time-of-day in the
                    // new schema — they're a separate cluster. Pass
                    // null so the to-do entry stays day-tagged but
                    // not slot-tagged; the user can later assign one.
                    addOrUpdatePlaceFromVerified(activeTrip, sight, dayId, null);
                }
            } else {
                // Legacy schema — items[] under each time-of-day.
                const slots: Array<['morning' | 'afternoon' | 'evening', any]> = [
                    ['morning', dayInfo.morning],
                    ['afternoon', dayInfo.afternoon],
                    ['evening', dayInfo.evening],
                ];
                for (const [timeOfDay, slot] of slots) {
                    const items = Array.isArray(slot?.items) ? slot.items : [];
                    for (const item of items) {
                        addOrUpdatePlaceFromVerified(activeTrip, item, dayId, timeOfDay);
                    }
                }
            }
        });
        upsertTrip(activeTrip);
        emit('state:changed');
        // Don't reset itinerary — keep showing the accepted plan.
    };

    const onResetZoom = () => {
        const aiTripMapKey = activeTrip.id + '_ai';
        if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) {
            delete STATE.mapViews[aiTripMapKey];
        }
        if (googleMapRef.current) {
            zoomToLocation(googleMapRef.current, tripCountry, activeTrip);
        }
    };

    const sf =
        "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif";

    return (
        <div style={{ fontFamily: sf }}>
            {/* Header */}
            <div className="pt-8 px-0 pb-6">
                <div className="flex items-center gap-3 mb-[6px]">
                    <h1
                        className="m-0 text-[2.8rem] font-extrabold tracking-[-0.04em] [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text"
                    >
                        {stripEmoji(t('ai.title'))}
                    </h1>
                </div>
                <p
                    className="ai-subtitle"
                    // The translation string contains <strong>{country}</strong> so
                    // the country name renders bold. Passing it through React's
                    // text path escaped the tags — set them as innerHTML instead.
                    // Safe because: (a) the surrounding template is a hard-coded
                    // translation string, not user input, and (b) tripCountry is
                    // server-validated when set on the trip.
                    dangerouslySetInnerHTML={{
                        __html: t('ai.subtitlePlanning', { country: tripCountry }),
                    }}
                />
            </div>

            <div
                className="ai-page-2col grid grid-cols-[380px_1fr] gap-6 mb-8"
            >
                {/* Left: Controls */}
                <div
                    id="aiControlsPanel"
                    className="flex flex-col gap-4 min-h-[700px]"
                >
                    {/* AI usage — shared host-key pool + BYO escape hatch */}
                    <AIUsageCard
                        hostPoolStatus={hostPoolStatus}
                        showByoCard={showByoCard}
                        onToggleByo={() => setShowByoCard((v) => !v)}
                        geminiKey={geminiKey}
                        onKeyChange={onKeyChange}
                        showKey={showKey}
                        onToggleShowKey={() => setShowKey((s) => !s)}
                        keyStatus={keyStatus}
                        onShowKeyHelp={onShowKeyHelp}
                    />

                    {/* Dates */}
                    <div className="card glass p-5 flex-none">
                        <h2
                            className="card-title text-[0.85rem] uppercase tracking-[0.07em] text-accent-blue-deep mb-3.5"
                        >
                            {t('ai.sectionTravelDates')}
                        </h2>
                        <div className="flex flex-col gap-3">
                            <div>
                                <label
                                    htmlFor="aiDateFrom"
                                    className="block text-xs font-semibold text-secondary uppercase tracking-[0.06em] mb-[5px]"
                                >
                                    {t('ai.dateFromLabel')}
                                </label>
                                <input
                                    id="aiDateFrom"
                                    type="date"
                                    className="glass-input w-full box-border"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="aiDateTo"
                                    className="block text-xs font-semibold text-secondary uppercase tracking-[0.06em] mb-[5px]"
                                >
                                    {t('ai.dateToLabel')}
                                </label>
                                <input
                                    id="aiDateTo"
                                    type="date"
                                    className="glass-input w-full box-border"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    min={dateFrom}
                                />
                            </div>
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: '0.74rem',
                                    color: dateValidityErr ? '#a82424' : 'var(--text-secondary)',
                                    lineHeight: 1.45,
                                }}
                            >
                                {dateValidityErr || t('ai.dateHint')}
                            </p>
                        </div>
                    </div>

                    {/* Requirements / extra context — split into Food
                        + Sightseeing per the user's request so the LLM
                        gets a structured ask instead of one mixed blob.
                        The split makes the result much cleaner: each
                        meal slot gets ONE restaurant honouring the food
                        prefs, and the sights list is built off the
                        sightseeing prefs separately. */}
                    <div
                        className="card glass p-5 flex-auto flex flex-col min-h-0 gap-[14px]"
                    >
                        <h2
                            className="card-title text-[0.85rem] uppercase text-accent-blue-deep mb-0 tracking-wider"
                        >
                            {t('ai.sectionRequirements')}
                        </h2>
                        <div className="ai-col-gap-6">
                            <label
                                htmlFor="aiFoodContext"
                                className="text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-secondary"
                            >
                                🍽️ {t('ai.foodReqLabel')}
                            </label>
                            <textarea
                                id="aiFoodContext"
                                className="glass-input w-full resize-none text-[0.9rem] box-border min-h-[72px]"
                                value={foodContext}
                                onChange={onFoodContextChange}
                                placeholder={t('ai.foodReqPlaceholder')}
                            />
                        </div>
                        <div className="ai-col-gap-6">
                            <label
                                htmlFor="aiSightseeingContext"
                                className="text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-secondary"
                            >
                                🏛️ {t('ai.sightsReqLabel')}
                            </label>
                            <textarea
                                id="aiSightseeingContext"
                                className="glass-input w-full resize-none text-[0.9rem] box-border min-h-[72px]"
                                value={sightseeingContext}
                                onChange={onSightseeingContextChange}
                                placeholder={t('ai.sightsReqPlaceholder')}
                            />
                        </div>
                    </div>

                    {/* Generate button (or role notice) */}
                    {tripIsEditable ? (
                        <button
                            type="button"
                            className="ai-generate-btn w-full rounded-[var(--radius-lg)] flex-none"
                            onClick={runGenerate}
                            disabled={generating}
                        >
                            {generating ? t('ai.generatingBtn') : t('ai.generateBtn')}
                        </button>
                    ) : (
                        <RoleNotice activeTrip={activeTrip} />
                    )}
                </div>

                {/* Right: Google Map (sticky) */}
                <div className="sticky top-20 h-[700px]">
                    {/* Inline `height` + `padding` overrides defeat the
                        unlayered `.card { height: auto; padding: 24px }`
                        rules in index.css — Tailwind v4 utilities live in
                        `@layer utilities`, which loses to unlayered rules,
                        so `h-full` / `p-0` here would collapse the card to
                        its padding and the map renders as a blank ~50px
                        sliver. The 2026-05-17 inline→Tailwind sweep dropped
                        these inline styles; restoring them is the minimal
                        fix. */}
                    <div
                        className="card glass overflow-hidden rounded-lg relative"
                        style={{ height: '100%', padding: 0 }}
                    >
                        <div
                            ref={mapContainerRef}
                            id="aiGoogleMap"
                            className="w-full h-full"
                        />
                        <div
                            id="aiZoomBadge"
                            onClick={onResetZoom}
                            className="absolute bottom-[14px] left-[14px] z-[1000]"
                        >
                            <span className="inline-flex align-[-2px]" dangerouslySetInnerHTML={{ __html: iconSvg('pin', { size: 13 }) }} /> <span>{tripCountry}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* To-do list panel */}
            <TodoListPanel activeTrip={activeTrip} datesSet={!!(dateFrom && dateTo)} />

            {/* Itinerary output */}
            <div className="mb-[60px]">
                {generating ? (
                    <div className="text-center p-[60px]">
                        <div
                            className="spinner-ring"
                            style={{
                                width: 40,
                                height: 40,
                                border: '3px solid rgba(0,113,227,0.15)',
                                borderTopColor: '#005bb8',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                                margin: '0 auto 20px',
                            }}
                        />
                        <div className="text-primary font-semibold">
                            {t('ai.loadingTitle')}
                        </div>
                        <div
                            className="text-secondary text-[0.82rem] mt-1.5"
                        >
                            {t('ai.loadingBody')}
                        </div>
                    </div>
                ) : generationError ? (
                    <GenerationErrorCard
                        error={generationError}
                        onRetry={() => {
                            setGenerationError(null);
                            runGenerate();
                        }}
                    />
                ) : itinerary ? (
                    <ItineraryOutput
                        itinerary={itinerary}
                        numDays={savedNumDays}
                        country={tripCountry}
                        tripIsEditable={tripIsEditable}
                        dayRowsRef={dayRowsRef}
                        onAccept={onAcceptPlan}
                    />
                ) : null}
            </div>
        </div>
    );
}


// ── Initial-date derivation ────────────────────────────────────
function deriveInitialDates(activeTrip: Trip): { from: string; to: string } {
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


// ── zoomToLocation: prefer saved view, then viewport, then geocode ──
function zoomToLocation(map: any, location: string, activeTrip: Trip) {
    if (!map) return;
    const aiTripMapKey = activeTrip.id + '_ai';
    if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) {
        const saved = STATE.mapViews[aiTripMapKey];
        map.setCenter({ lat: saved.lat, lng: saved.lng });
        map.setZoom(saved.zoom);
        return;
    }
    if (activeTrip.viewport) {
        const v = activeTrip.viewport;
        map.fitBounds(
            new google.maps.LatLngBounds(
                { lat: v.south, lng: v.west },
                { lat: v.north, lng: v.east },
            ),
        );
        return;
    }
    let query = location.replace(/\(USA\)/g, '').trim();
    const isUSState = query.includes(' - ');
    if (isUSState) {
        query = query.split(' - ')[1] + ', USA';
    }
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results: any, status: string) => {
        if (status === 'OK' && results[0]) {
            map.fitBounds(results[0].geometry.viewport);
        }
    });
}


// ── AI usage card ──────────────────────────────────────────────
//
// Replaces the old "AI Engine" key-input card. The first-class
// surface is now a horizontal usage bar showing how drained the
// shared host-key pool is for the day. The BYO key form is
// tucked behind a "Use my own key" expander — still one click
// away for power users / when the pool is dry, but no longer
// the first thing the user sees.
//
// Pool semantics (see src/routes/integrations.py):
//   - total      : number of host keys configured in env
//   - exhausted  : keys currently in 24h cooldown after a quota hit
//   - available  : total - exhausted
//   - fillRatio  : exhausted / total  (0 → empty bar, 1 → full bar)
//
// On a self-hosted instance with 0 host keys configured we skip
// the bar entirely — there's no pool to display — and the BYO
// expander defaults open since that's the only working path.

interface AIUsageCardProps {
    hostPoolStatus: GeminiHostKeyStatus | null;
    showByoCard: boolean;
    onToggleByo: () => void;
    geminiKey: string;
    onKeyChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    showKey: boolean;
    onToggleShowKey: () => void;
    keyStatus: { text: string; color: string };
    onShowKeyHelp: () => void;
}

function AIUsageCard({
    hostPoolStatus,
    showByoCard,
    onToggleByo,
    geminiKey,
    onKeyChange,
    showKey,
    onToggleShowKey,
    keyStatus,
    onShowKeyHelp,
}: AIUsageCardProps) {
    const hasPool = hostPoolStatus != null && hostPoolStatus.total > 0;
    const ratio = hasPool && hostPoolStatus
        ? Math.max(0, Math.min(1, hostPoolStatus.exhausted / hostPoolStatus.total))
        : 0;
    const pct = Math.round(ratio * 100);
    const drained = hasPool && hostPoolStatus
        ? hostPoolStatus.available === 0
        : false;

    return (
        <div
            className="card glass p-[18px] border-[rgba(155,89,182,0.3)] flex-none"
        >
            <div
                className="flex items-center justify-between mb-2"
            >
                <h2
                    className="card-title text-[0.85rem] uppercase tracking-[0.07em] text-accent-purple-deep m-0"
                >
                    {t('ai.usageCardTitle')}
                </h2>
                {hasPool && hostPoolStatus ? (
                    <span
                        style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: drained ? '#a82424' : '#5b3a7e',
                            background: drained
                                ? 'rgba(168,36,36,0.10)'
                                : 'rgba(155,89,182,0.10)',
                            padding: '3px 8px',
                            borderRadius: 999,
                            letterSpacing: '0.02em',
                        }}
                    >
                        {t('ai.usagePctPill', { pct: String(pct) })}
                    </span>
                ) : null}
            </div>

            {hasPool && hostPoolStatus ? (
                <>
                    {/* The bar. Filled portion = drained portion of the pool.
                        Empty bar = pool fully available, full bar = every host
                        key is in cooldown for the day. */}
                    <div
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="AI usage today"
                        className="relative h-2.5 rounded-full bg-[rgba(155,89,182,0.10)] border border-[rgba(155,89,182,0.18)] overflow-hidden mt-0.5"
                    >
                        <div
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${pct}%`,
                                background: drained
                                    ? 'linear-gradient(90deg, #ff9500 0%, #ff3b30 100%)'
                                    : 'linear-gradient(90deg, #7c3a9e 0%, #c084ee 100%)',
                                transition: 'width 0.4s ease',
                            }}
                        />
                    </div>
                    <p
                        style={{
                            margin: '8px 0 0',
                            fontSize: '0.78rem',
                            color: drained ? '#a82424' : 'var(--text-secondary)',
                            lineHeight: 1.45,
                        }}
                    >
                        {drained
                            ? t('ai.usageDrained')
                            : t('ai.usageQuotaUsed', { pct: String(pct) })}
                    </p>
                </>
            ) : (
                <p
                    className="m-0 text-[0.78rem] text-secondary leading-[1.45]"
                >
                    {t('ai.usageNoPool')}
                </p>
            )}

            <button
                type="button"
                onClick={onToggleByo}
                aria-expanded={showByoCard}
                className="mt-3 w-full bg-transparent border border-dashed border-[rgba(155,89,182,0.35)] text-accent-purple-deep font-bold text-[0.82rem] py-2 px-3 rounded-[10px] cursor-pointer flex items-center justify-center gap-1.5"
            >
                <span className="text-[0.7rem]">{showByoCard ? '▾' : '▸'}</span>
                {t('ai.usageUseMyKeyBtn')}
            </button>

            {showByoCard ? (
                <div
                    className="mt-3 bg-[rgba(155,89,182,0.04)] border border-[rgba(155,89,182,0.18)] rounded-md p-3"
                >
                    <div
                        className="flex items-center justify-between mb-[6px]"
                    >
                        <span
                            className="text-[0.72rem] font-bold uppercase tracking-[0.06em] text-accent-purple-deep"
                        >
                            {t('ai.usageByoSectionTitle')}
                        </span>
                        <button
                            id="aiKeyHelpBtn"
                            type="button"
                            title={t('ai.keyHelpBtnTitle')}
                            aria-label={t('ai.keyHelpBtnTitle')}
                            onClick={onShowKeyHelp}
                            className="bg-[rgba(155,89,182,0.12)] border border-[rgba(155,89,182,0.35)] text-accent-purple-deep w-[22px] h-[22px] rounded-full cursor-pointer font-extrabold text-[0.72rem] leading-none inline-flex items-center justify-center font-serif italic"
                        >
                            i
                        </button>
                    </div>
                    <p
                        className="text-secondary text-[0.76rem] mt-0 mx-0 mb-2 leading-[1.5]"
                    >
                        {t('ai.keyCardSubtitle')}
                    </p>
                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            placeholder={t('ai.keyInputPlaceholder')}
                            autoComplete="off"
                            spellCheck={false}
                            value={geminiKey}
                            onChange={onKeyChange}
                            className="w-full box-border pt-[9px] pr-10 pb-[9px] pl-[11px] border border-[rgba(0,0,0,0.12)] rounded-[10px] text-[0.85rem] font-mono bg-card text-brand-navy"
                        />
                        <button
                            type="button"
                            title={showKey ? t('ai.keyToggleHide') : t('ai.keyToggleShow')}
                            aria-label={t('ai.keyToggleAriaLabel')}
                            onClick={onToggleShowKey}
                            className="absolute right-1.5 top-[50%] translate-y-[-50%] bg-transparent border-0 cursor-pointer py-1 px-2 text-[rgba(0,0,0,0.5)] text-[0.95rem] leading-none"
                        >
                            {showKey ? '🙈' : '👁'}
                        </button>
                    </div>
                    <div
                        style={{
                            marginTop: 6,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            minHeight: '1em',
                            color: keyStatus.color,
                        }}
                    >
                        {keyStatus.text}
                    </div>
                </div>
            ) : null}
        </div>
    );
}


// ── Role notice (for non-editors) ──────────────────────────────
function RoleNotice({ activeTrip }: { activeTrip: Trip }) {
    const role = getMyRole(activeTrip);
    const roleLabel =
        role === ROLE_BUDGETEER
            ? t('ai.roleBudgeteer')
            : role === ROLE_RELAXER
              ? t('ai.roleRelaxer')
              : t('ai.roleObserver');
    const note =
        role === ROLE_BUDGETEER ? t('ai.roleNoteBudgeteer') : t('ai.roleNoteOther');
    return (
        <div
            className="card glass p-4 rounded-[var(--radius-lg)] text-center text-secondary text-[0.85rem] flex-none"
        >
            {t('ai.roleNotice', { role: roleLabel, note })}
        </div>
    );
}


// ── Generation error card ──────────────────────────────────────
function GenerationErrorCard({
    error,
    onRetry,
}: {
    error: { msg: string; hint: string; raw: string };
    onRetry: () => void;
}) {
    return (
        <div className="card glass text-center py-8 px-7">
            <div className="text-[2.4rem] mb-2">😬</div>
            <h2 className="text-[#a82424] mt-0 mx-0 mb-1.5 text-[1.2rem]">
                {error.msg}
            </h2>
            {error.hint ? (
                <p
                    className="mt-0 mx-0 mb-[18px] text-secondary text-[0.9rem] leading-[1.5]"
                >
                    {error.hint}
                </p>
            ) : null}
            <details
                className="mt-0 mx-0 mb-[18px] text-left bg-[rgba(255,59,48,0.04)] border border-[rgba(255,59,48,0.16)] rounded-[10px] py-2 px-3"
            >
                <summary
                    className="cursor-pointer text-[0.78rem] font-bold text-accent-purple-deep"
                >
                    {t('ai.errorTechnicalDetails')}
                </summary>
                <pre
                    className="mt-2 mx-0 mb-0 text-[0.72rem] text-[#666] font-mono whitespace-pre-wrap break-word"
                >
                    {error.raw}
                </pre>
            </details>
            <button
                type="button"
                onClick={onRetry}
                className="py-2.5 px-[22px] rounded-full border-0 bg-accent-blue text-white text-[0.92rem] font-bold cursor-pointer shadow-[0_4px_12px_rgba(0,113,227,0.28)]"
            >
                {t('ai.errorRetryBtn')}
            </button>
        </div>
    );
}


// ── Itinerary output: day cards + accept button ────────────────
interface ItineraryOutputProps {
    itinerary: any[];
    numDays: number | string;
    country: string;
    tripIsEditable: boolean;
    dayRowsRef: React.MutableRefObject<HTMLDivElement[]>;
    onAccept: () => void;
}

function ItineraryOutput({
    itinerary,
    numDays,
    country,
    tripIsEditable,
    dayRowsRef,
    onAccept,
}: ItineraryOutputProps) {
    const [accepted, setAccepted] = useState(false);

    const handleAccept = () => {
        onAccept();
        setAccepted(true);
    };

    const sf =
        "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif";

    return (
        <>
            <div
                className="flex justify-between items-center mb-6"
            >
                <div>
                    <h2
                        style={{
                            margin: 0,
                            fontSize: '2rem',
                            fontWeight: 800,
                            letterSpacing: '-0.03em',
                            background: 'var(--gradient-title)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            fontFamily: sf,
                        }}
                    >
                        {t('ai.resultHeading', { numDays, country })}
                    </h2>
                    <p
                        className="text-secondary mt-1.5 mx-0 mb-0 text-[0.9rem]"
                    >
                        {t('ai.resultGeneratedBy')}
                    </p>
                </div>
                <div
                    className="text-[0.78rem] text-secondary bg-[var(--glass-bg)] border border-[var(--glass-border)] py-[5px] px-3.5 rounded-[980px]"
                >
                    {t('ai.resultBadge')}
                </div>
            </div>
            <div className="flex flex-col gap-4">
                {itinerary.map((day: any, i: number) => (
                    <div
                        key={i}
                        ref={(el) => {
                            if (el) dayRowsRef.current[i] = el;
                        }}
                        className="card glass"
                        style={{
                            borderRadius: 18,
                            overflow: 'hidden',
                            transition: 'box-shadow 0.3s, border-color 0.3s',
                            fontFamily: sf,
                        }}
                    >
                        <div className="ai-day-row flex items-stretch">
                            <div className="ai-day-chip">
                                <span
                                    className="text-[rgba(255,255,255,0.7)] text-[0.65rem] font-bold uppercase tracking-widest"
                                >
                                    Day
                                </span>
                                <span
                                    className="text-white text-[2rem] font-extrabold leading-none"
                                >
                                    {day.day}
                                </span>
                            </div>
                            <div
                                className="ai-day-body flex-1 py-6 px-7"
                            >
                                <div className="mb-5">
                                    <h3
                                        className="mt-0 mx-0 mb-1 text-[1.2rem] font-bold tracking-[-0.02em] text-primary"
                                    >
                                        {day.title || 'Day ' + day.day}
                                    </h3>
                                    <span
                                        className="text-[length:var(--font-base)] text-secondary"
                                    >
                                        {day.date || ''}
                                    </span>
                                </div>
                                {isFoodSightsSchema(day) ? (
                                    <>
                                        {/* New food/sights split — 3 meal cards
                                            on top + a wide sights card below.
                                            Each meal slot holds ONE restaurant
                                            (breakfast/lunch/dinner) per the
                                            user's request; sightseeing is a
                                            separate cluster underneath. */}
                                        <div
                                            className="ai-day-slots grid grid-cols-3 gap-4 mb-4"
                                        >
                                            <MealBlock
                                                title={t('ai.slotBreakfast')}
                                                accent="0,113,227"
                                                place={day.breakfast}
                                            />
                                            <MealBlock
                                                title={t('ai.slotLunch')}
                                                accent="255,149,0"
                                                place={day.lunch}
                                            />
                                            <MealBlock
                                                title={t('ai.slotDinner')}
                                                accent="155,89,182"
                                                place={day.dinner}
                                            />
                                        </div>
                                        <SightsBlock sights={day.sights} />
                                    </>
                                ) : (
                                    <div
                                        className="ai-day-slots grid grid-cols-3 gap-4"
                                    >
                                        <SlotBlock title={t('ai.slotMorning')} accent="0,113,227" slot={day.morning} />
                                        <SlotBlock
                                            title={t('ai.slotAfternoon')}
                                            accent="255,149,0"
                                            slot={day.afternoon}
                                        />
                                        <SlotBlock title={t('ai.slotEvening')} accent="155,89,182" slot={day.evening} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {tripIsEditable ? (
                <div className="flex gap-3 mt-6">
                    <button
                        type="button"
                        className="btn"
                        onClick={handleAccept}
                        disabled={accepted}
                        style={{
                            flex: 2,
                            background: accepted ? '#34c759' : 'var(--accent-blue)',
                            color: 'white',
                            padding: 16,
                            fontSize: '1.1rem',
                            borderRadius: 16,
                            fontWeight: 700,
                            boxShadow: '0 10px 20px rgba(0,122,255,0.2)',
                            cursor: accepted ? 'default' : 'pointer',
                        }}
                    >
                        {accepted
                            ? t('ai.acceptPlanBtnAccepted')
                            : t('ai.acceptPlanBtn')}
                    </button>
                </div>
            ) : null}
        </>
    );
}


function SlotBlock({ title, accent, slot }: { title: string; accent: string; slot: any }) {
    return (
        <div className="ai-plan-block" style={{ ['--accent' as any]: accent }}>
            <div className="ai-plan-block__tag">{title}</div>
            <div className="ai-plan-block__title">{slot?.activity || ''}</div>
            <div dangerouslySetInnerHTML={{ __html: renderSlotBody(slot) }} />
        </div>
    );
}


// ── New-schema rendering ──────────────────────────────────────────
//
// MealBlock renders ONE restaurant per time-of-day card; SightsBlock
// renders a wide card with the day's sightseeing list. Together they
// replace the three mixed-bag SlotBlock columns when the day uses the
// new food/sights schema (post-split). Visual style mirrors SlotBlock
// (same .ai-plan-block class + accent variable) so the rest of the
// page chrome stays untouched.

function MealBlock({ title, accent, place }: { title: string; accent: string; place: any }) {
    const hasPlace = !!(place && typeof place === 'object' && (place.text || place.name));
    return (
        <div className="ai-plan-block" style={{ ['--accent' as any]: accent }}>
            <div className="ai-plan-block__tag">{title}</div>
            {hasPlace ? (
                <div dangerouslySetInnerHTML={{ __html: renderRestaurantCard(place) }} />
            ) : (
                <div
                    className="text-secondary text-[0.82rem] py-1.5 px-0.5"
                >
                    {/* Defensive: an LLM glitch could omit a meal.
                        Render a small dash so the column doesn't
                        collapse and the user knows what's missing. */}
                    —
                </div>
            )}
        </div>
    );
}

function SightsBlock({ sights }: { sights: any }) {
    const list = Array.isArray(sights) ? sights.filter(Boolean) : [];
    return (
        <div className="ai-plan-block" style={{ ['--accent' as any]: '52,199,89' }}>
            <div className="ai-plan-block__tag">{t('ai.slotSightseeing')}</div>
            {list.length > 0 ? (
                <div dangerouslySetInnerHTML={{ __html: renderSightsList(list) }} />
            ) : (
                <div
                    className="text-secondary text-[0.82rem] py-1.5 px-0.5"
                >
                    {t('ai.sightseeingEmpty')}
                </div>
            )}
        </div>
    );
}


// ── To-do list panel ───────────────────────────────────────────
interface TodoListPanelProps {
    activeTrip: Trip;
    datesSet: boolean;
}

/** Sort modes for the AI plan's marked-place panel. Mirrors the
 *  Todo page's SortMode but with one fewer option — `ai-first` is
 *  redundant here because EVERYTHING in this panel is already
 *  AI-ticked (forAI === true). */
type AiPanelSort = 'category' | 'name-asc' | 'name-desc' | 'recent';

function TodoListPanel({ activeTrip, datesSet }: TodoListPanelProps) {
    // useStore subscription so add/remove/tick from elsewhere repaints.
    useStore((s) => s.trips);

    /** Category filter — empty string = "All types" (no filter); any
     *  non-empty emoji shows only items whose normalised icon matches.
     *  Symmetric with the Todo page's filterIcon. */
    const [filterIcon, setFilterIcon] = useState<string>('');
    /** Sort mode for the visible cards. Defaults to `category` so the
     *  panel reads as "your AI-marked places, grouped by what they
     *  are" — same mental model as the Todo page. */
    const [sortMode, setSortMode] = useState<AiPanelSort>('category');

    const allTodo = getMarkedPlaces(activeTrip).filter((p) => p.forManual);
    const tickedItems = allTodo.filter((p) => p.forAI);

    const tripDays = (STATE.tripDays || [])
        .filter((d) => d.tripId === activeTrip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);

    // Build the count-per-category map BEFORE filtering so the dropdown
    // labels can show "(N)" for each category as a glance-able hint.
    const iconCounts = new Map<string, number>();
    for (const p of tickedItems) {
        const k = groupingIcon(p.icon);
        iconCounts.set(k, (iconCounts.get(k) || 0) + 1);
    }
    /** Distinct category icons present in the ticked set, in
     *  insertion-into-iconCounts order. This drives the filter dropdown
     *  so we don't show categories with zero items. */
    const presentIcons = [...iconCounts.keys()];

    // Apply category filter, then sort.
    let visibleItems = tickedItems;
    if (filterIcon !== '') {
        visibleItems = visibleItems.filter(
            (p) => groupingIcon(p.icon) === filterIcon,
        );
    }
    if (sortMode === 'name-asc') {
        visibleItems = visibleItems
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'name-desc') {
        visibleItems = visibleItems
            .slice()
            .sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortMode === 'recent') {
        // markedPlaces is append-order — reversing gives newest-first.
        visibleItems = visibleItems.slice().reverse();
    }
    // sortMode === 'category' is the default and is handled by the
    // groupByCategory() call below (which orders sections by the
    // canonical CATEGORY_ORDER, not insertion order).

    // Build the grouped Map for the category sort mode. Empty buckets
    // are stripped inside groupByCategory; '*' key flags the flat
    // branch used by every other sort mode.
    const groups = new Map<string, typeof visibleItems>();
    if (sortMode === 'category') {
        const built = groupByCategory(visibleItems);
        for (const [k, v] of built) groups.set(k, v);
    } else if (visibleItems.length > 0) {
        groups.set('*', visibleItems);
    }

    // Empty: no to-do items at all.
    if (allTodo.length === 0) {
        return (
            <div className="ai-mb-32">
                <div
                    className="card glass p-5 rounded-lg border-[1.5px] border-dashed border-[rgba(155,_89,_182,_0.35)] bg-[rgba(155,_89,_182,_0.04)]"
                >
                    <div
                        className="ai-row-icon-label"
                    >
                        <span className="ai-fs-12 inline-flex text-accent-purple-deep" dangerouslySetInnerHTML={{ __html: iconSvg('checklist', { size: 16 }) }} />
                        <h3
                            className="m-0 text-accent-purple-deep font-extrabold tracking-[-0.01em]"
                        >
                            {t('ai.todoPanelEmptyTitle')}
                        </h3>
                    </div>
                    <p
                        className="mt-0 mx-0 mb-3 text-secondary text-[0.9rem]"
                    >
                        {t('ai.todoPanelEmptyBody')}
                    </p>
                    <button
                        type="button"
                        className="btn-primary ai-pill-btn"
                        onClick={() => navigate('todo')}
                    >
                        {stripEmoji(t('ai.todoPanelEmptyCta'))}
                    </button>
                </div>
            </div>
        );
    }

    // Items exist but none ticked.
    if (tickedItems.length === 0) {
        return (
            <div className="ai-mb-32">
                <div
                    className="card glass p-5 rounded-lg border-[1.5px] border-dashed border-[rgba(155,_89,_182,_0.35)] bg-[rgba(155,_89,_182,_0.04)]"
                >
                    <div
                        className="ai-row-icon-label"
                    >
                        <span className="ai-fs-12 inline-flex text-accent-purple-deep" dangerouslySetInnerHTML={{ __html: iconSvg('checklist', { size: 16 }) }} />
                        <h3
                            className="m-0 text-accent-purple-deep font-extrabold tracking-[-0.01em]"
                        >
                            {tn('ai.todoPanelNoneTickedTitle', allTodo.length)}
                        </h3>
                    </div>
                    {/* todoPanelNoneTickedBody contains an inline <strong>
                        tag highlighting "To do list" — render as HTML so
                        the markup actually formats instead of leaking as
                        visible <strong>…</strong> text. */}
                    <p
                        className="mt-0 mx-0 mb-3 text-secondary text-[0.9rem]"
                        dangerouslySetInnerHTML={{ __html: t('ai.todoPanelNoneTickedBody') }}
                    />
                    <button
                        type="button"
                        className="btn-primary ai-pill-btn"
                        onClick={() => navigate('todo')}
                    >
                        {stripEmoji(t('ai.todoPanelNoneTickedCta'))}
                    </button>
                </div>
            </div>
        );
    }

    // Ticked items — full card list with sort + filter controls.
    return (
        <div className="ai-mb-32">
            <div
                className="card glass p-5 rounded-lg border-[1.5px] border-[rgba(155,_89,_182,_0.25)]"
            >
                <div
                    className="flex items-center gap-[10px] mb-[14px] flex-wrap"
                >
                    <span className="ai-fs-12 inline-flex text-accent-purple-deep" dangerouslySetInnerHTML={{ __html: iconSvg('checklist', { size: 16 }) }} />
                    <h3
                        className="m-0 text-accent-purple-deep font-extrabold tracking-[-0.01em]"
                    >
                        {t('ai.todoPanelTickedTitle')}{' '}
                        <span
                            className="bg-[rgba(155,89,182,0.12)] text-accent-purple-deep text-[0.7rem] py-0.5 px-2 rounded-full ml-1.5"
                        >
                            {tn('ai.todoPanelTickedCount', tickedItems.length)}
                        </span>
                    </h3>
                    <button
                        type="button"
                        onClick={() => navigate('todo')}
                        className="ml-auto bg-transparent border-0 text-accent-blue-deep font-bold text-[0.82rem] cursor-pointer p-0"
                    >
                        {t('ai.todoPanelManageBtn')}
                    </button>
                </div>
                <p
                    className="text-[0.82rem] text-secondary mt-0 mx-0 mb-3 leading-[1.5]"
                >
                    {datesSet
                        ? t('ai.todoPanelHintWithDates')
                        : t('ai.todoPanelHintNoDates')}
                </p>

                {/* Sort + filter dropdowns — only render when there are
                    enough items to be worth filtering (more than one
                    category present, or 5+ items overall). For a small
                    panel with a single category the controls would be
                    visual noise without adding utility. */}
                {(presentIcons.length > 1 || tickedItems.length >= 5) && (
                    <div className="flex items-center gap-3 flex-wrap mb-3">
                        <FilterSelect
                            label={t('todo.categoryFilterLabel')}
                            value={filterIcon}
                            onChange={setFilterIcon}
                            options={[
                                { value: '', label: t('todo.categoryAll') },
                                ...presentIcons.map((icon) => ({
                                    value: icon,
                                    label: `${icon} ${iconToLabel(icon)} (${iconCounts.get(icon) || 0})`,
                                })),
                            ]}
                        />
                        <FilterSelect
                            label={t('todo.sortLabel')}
                            value={sortMode}
                            onChange={(v) => setSortMode(v as AiPanelSort)}
                            className="ml-auto"
                            options={[
                                { value: 'category', label: t('todo.sortCategory') },
                                { value: 'name-asc', label: t('todo.sortNameAsc') },
                                { value: 'name-desc', label: t('todo.sortNameDesc') },
                                { value: 'recent', label: t('todo.sortRecent') },
                            ]}
                        />
                    </div>
                )}

                {/* Empty-filter hint — when filterIcon wipes out every
                    visible item. Reset clears the filter. */}
                {groups.size === 0 && filterIcon !== '' && (
                    <div
                        className="text-center text-secondary text-[0.85rem] py-3"
                    >
                        {t('todo.noFilterMatch')}{' '}
                        <button
                            type="button"
                            onClick={() => setFilterIcon('')}
                            className="bg-transparent border-0 text-accent-blue font-bold cursor-pointer p-0"
                        >
                            {t('todo.noFilterMatchReset')}
                        </button>
                    </div>
                )}

                {/* Render groups — section header per category in the
                    `category` sort mode; flat (no header) for every
                    other sort mode. */}
                {[...groups.entries()].map(([icon, items]) => (
                    <div key={icon} className="mb-4">
                        {icon !== '*' && (
                            <div
                                className="flex items-center gap-2.5 pt-0 px-1 pb-2 border-b border-[rgba(155,89,182,0.18)] mb-2.5"
                            >
                                <span className="text-[1.1rem] leading-none">{icon}</span>
                                <span
                                    className="font-extrabold text-accent-purple-deep text-[0.78rem] tracking-[0.04em] uppercase"
                                >
                                    {iconToLabel(icon)}
                                </span>
                                <span
                                    className="text-[0.7rem] font-bold text-secondary bg-[rgba(155,89,182,0.08)] py-0.5 px-2 rounded-full"
                                >
                                    {items.length}
                                </span>
                            </div>
                        )}
                        <div
                            className="grid grid-cols-[repeat(auto-fill,_minmax(260px,_1fr))] gap-3"
                        >
                            {items.map((p) => (
                                <MarkedCard
                                    key={p.placeId}
                                    place={p}
                                    tripDays={tripDays}
                                    datesSet={datesSet}
                                    activeTrip={activeTrip}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}


function MarkedCard({
    place,
    tripDays,
    datesSet,
    activeTrip,
}: {
    place: any;
    tripDays: any[];
    datesSet: boolean;
    activeTrip: Trip;
}) {
    const onDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const dayId = e.target.value || null;
        setMarkedPlaceAssignment(activeTrip, place.placeId, dayId, place.timeOfDay || null);
        emit('state:changed');
        upsertTrip(activeTrip);
    };
    const onTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const timeOfDay = (e.target.value as any) || null;
        setMarkedPlaceAssignment(activeTrip, place.placeId, place.dayId || null, timeOfDay);
        emit('state:changed');
        upsertTrip(activeTrip);
    };

    // Per-user request 2026-05-18: name + icon are a Maps link so the
    // user can click any place card to see it on Google Maps. We
    // wrap the icon+name in a single <a> so the whole "left column"
    // is a hit target. The day/time selects stay outside the anchor
    // so changing them doesn't trigger a navigation. mapsUrl is null
    // for pre-Phase-G items added without Maps grounding — those
    // still render but as plain text, not a link.
    const mapsUrl = placeMapsUrl(place);

    return (
        <div
            className="ai-marked-card"
            data-place-id={place.placeId}
            style={{
                background: 'var(--card-bg)',
                border: `1.5px solid ${place.color}`,
                borderRadius: 14,
                padding: 14,
                boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                minHeight: 0,
            }}
        >
            {mapsUrl ? (
                <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Open ${place.name} on Google Maps`}
                    aria-label={`Open ${place.name} on Google Maps`}
                    className="flex items-start gap-[10px] no-underline text-inherit hover:opacity-80 transition-[opacity_0.15s]"
                >
                    <span className="text-[1.4rem] leading-none">{place.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div
                            className="font-extrabold text-brand-navy text-[0.95rem] leading-[1.25] inline-flex items-center gap-1"
                        >
                            {place.name}
                            <span
                                aria-hidden="true"
                                className="text-[0.7rem] text-accent-blue opacity-70"
                            >
                                ↗
                            </span>
                        </div>
                        {place.address ? (
                            <div
                                className="text-xs text-secondary mt-0.5"
                            >
                                {place.address}
                            </div>
                        ) : null}
                    </div>
                </a>
            ) : (
                <div className="flex items-start gap-[10px]">
                    <span className="text-[1.4rem] leading-none">{place.icon}</span>
                    <div className="flex-1 min-w-0">
                        <div
                            className="font-extrabold text-brand-navy text-[0.95rem] leading-[1.25]"
                        >
                            {place.name}
                        </div>
                        {place.address ? (
                            <div
                                className="text-xs text-secondary mt-0.5"
                            >
                                {place.address}
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
            {datesSet ? (
                <div className="flex gap-2 min-w-0">
                    <select
                        className="marked-day-select flex-1 min-w-0 max-w-full py-1.5 px-2 rounded-lg border border-[rgba(0,0,0,0.1)] text-[0.78rem] bg-card"
                        value={place.dayId || ''}
                        onChange={onDayChange}
                    >
                        <option value="">{t('ai.dayOptionAny')}</option>
                        {tripDays.map((d) => (
                            <option key={d.id} value={d.id}>
                                {t('ai.dayOptionDay', { num: d.dayNumber })}
                                {d.date ? ` — ${formatDayDate(d.date) || d.date}` : ''}
                            </option>
                        ))}
                    </select>
                    <select
                        className="marked-time-select flex-1 min-w-0 max-w-full py-1.5 px-2 rounded-lg border border-[rgba(0,0,0,0.1)] text-[0.78rem] bg-card"
                        value={place.timeOfDay || ''}
                        onChange={onTimeChange}
                    >
                        <option value="">{t('ai.timeOptionAny')}</option>
                        <option value="morning">{t('ai.timeOptionMorning')}</option>
                        <option value="afternoon">{t('ai.timeOptionAfternoon')}</option>
                        <option value="evening">{t('ai.timeOptionEvening')}</option>
                    </select>
                </div>
            ) : (
                <div
                    className="text-xs text-secondary italic"
                >
                    {t('ai.todoPanelCardNoDates')}
                </div>
            )}
        </div>
    );
}

