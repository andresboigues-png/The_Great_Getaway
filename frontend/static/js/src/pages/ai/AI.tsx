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
import { STATE, emit } from '../../state.js';
import { showLiquidAlert, formatDayDate, q } from '../../utils.js';
import { apiFetch, upsertDay, deleteDayOnServer, upsertTrip } from '../../api.js';
import { applyMapTheme } from '../../theme.js';
import { mobileSafeGestureHandling } from '../../googleMapsServices.js';
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
import { renderSlotBody, flattenSlotForTextarea } from './slots.js';
import { t, tn } from '../../i18n.js';
import type { Trip } from '../../types';


// ── Top-level ──────────────────────────────────────────────────
export function AI() {
    // useStore subscription so add-trip / select-trip transitions
    // re-render in place without a full router navigate.
    const activeTripId = useStore((s) => s.activeTripId);
    const trips = useStore((s) => s.trips) || [];
    const activeTrip = activeTripId ? trips.find((tr) => tr.id === activeTripId) : null;

    if (!activeTrip) {
        return <EmptyTripView />;
    }
    return <ActiveTripView activeTrip={activeTrip} />;
}


// ── Empty state (no active trip) ───────────────────────────────
function EmptyTripView() {
    const mapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (typeof google === 'undefined' || !google.maps) return;
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
    }, []);

    const sf =
        "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif";

    return (
        <div>
            <div style={{ padding: '32px 0 24px', fontFamily: sf }}>
                <h1
                    style={{
                        margin: '0 0 6px',
                        fontSize: '2.8rem',
                        fontWeight: 800,
                        letterSpacing: '-0.04em',
                        background: 'var(--gradient-title)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    }}
                >
                    {t('ai.title')}
                </h1>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    Your AI-powered travel planner
                </p>
            </div>
            <div
                style={{
                    position: 'relative',
                    width: '100%',
                    height: 'calc(100vh - 200px)',
                    minHeight: 480,
                    borderRadius: 20,
                    overflow: 'hidden',
                    boxShadow: '0 40px 100px rgba(0,0,0,0.15)',
                }}
            >
                <div ref={mapRef} id="emptyMap" style={{ width: '100%', height: '100%' }} />
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.05)',
                        backdropFilter: 'blur(25px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(25px) saturate(180%)',
                        zIndex: 1000,
                    }}
                >
                    <div
                        className="premium-glass-card"
                        style={{
                            textAlign: 'center',
                            color: '#002d5b',
                            padding: 48,
                            maxWidth: 500,
                            background: 'rgba(255,255,255,0.6)',
                            borderRadius: 36,
                            border: '1px solid rgba(255,255,255,0.8)',
                            boxShadow:
                                '0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05)',
                        }}
                    >
                        <div
                            style={{
                                fontSize: '4.5rem',
                                marginBottom: 24,
                                filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.1))',
                            }}
                        >
                            🧭
                        </div>
                        <h2
                            style={{
                                fontSize: '2rem',
                                fontWeight: 800,
                                marginBottom: 16,
                                letterSpacing: '-0.03em',
                            }}
                        >
                            {t('ai.noTripTitle')}
                        </h2>
                        <p
                            style={{
                                fontSize: '1.15rem',
                                opacity: 0.85,
                                lineHeight: 1.6,
                                fontFamily:
                                    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                                marginBottom: 32,
                            }}
                        >
                            {t('ai.noTripBody')}
                        </p>
                        <button
                            type="button"
                            className="btn-primary btn-primary--lg"
                            onClick={() => openNewTripModal()}
                            style={{
                                maxWidth: 'none',
                                width: 'auto',
                                padding: '16px 36px',
                                fontSize: '1.15rem',
                            }}
                        >
                            + Start Your Journey
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
    const [context, setContext] = useState<string>(activeTrip.aiContext || '');
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

    // Google Map + markers — managed in a useEffect with refs.
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const googleMapRef = useRef<any>(null);
    const mapMarkersRef = useRef<any[]>([]);
    const dayRowsRef = useRef<HTMLDivElement[]>([]);

    // ── Initial map setup ────────────────────────────────────────
    useEffect(() => {
        if (typeof google === 'undefined' || !google.maps) return;
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Repaint map markers when itinerary changes ──────────────
    useEffect(() => {
        if (!googleMapRef.current || !itinerary) return;
        // Clear previous markers.
        mapMarkersRef.current.forEach((m) => m.setMap(null));
        mapMarkersRef.current = [];
        const map = googleMapRef.current;
        const bounds = new google.maps.LatLngBounds();
        const geocoder = new google.maps.Geocoder();

        itinerary.forEach((day: any, i: number) => {
            setTimeout(() => {
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
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [itinerary]);

    // ── Date validity ────────────────────────────────────────────
    const dateValidityErr =
        dateFrom && dateTo && dateTo < dateFrom
            ? 'End date must be on or after the start date.'
            : null;

    // ── Persist context to STATE on input ───────────────────────
    const onContextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const v = e.target.value;
        setContext(v);
        activeTrip.aiContext = v;
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
        const fullContext = context + markedSuffix;
        activeTrip.aiContext = context;
        activeTrip.aiNumDays = numDays;
        emit('state:changed');

        setGenerating(true);
        setGenerationError(null);
        try {
            const r = await apiFetch('/api/generate_itinerary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    destination: tripCountry,
                    numDays,
                    dateFrom,
                    dateTo,
                    context: fullContext,
                    gemini_key: (STATE.geminiApiKey || '').trim(),
                }),
            });
            const d = await r.json();
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
            if (/UNAVAILABLE|503|overloaded/i.test(rawMsg)) {
                msg = t('ai.errorOverloaded');
                hint = t('ai.errorOverloadedHint');
            } else if (/quota|limit|RESOURCE_EXHAUSTED|429/i.test(rawMsg)) {
                msg = t('ai.errorQuota');
                hint = t('ai.errorQuotaHint');
            } else if (/key|api[_ ]?key|UNAUTHENTICATED|401|403/i.test(rawMsg)) {
                msg = t('ai.errorBadKey');
                hint = t('ai.errorBadKeyHint');
            } else if (/network|fetch|timed?[\- ]?out|ECONN/i.test(rawMsg)) {
                msg = t('ai.errorNetwork');
                hint = t('ai.errorNetworkHint');
            }
            setGenerationError({ msg, hint, raw: rawMsg || t('ai.errorUnknown') });
            showLiquidAlert(msg);
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
            const newDay = {
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
                    morning: flattenSlotForTextarea(dayInfo.morning),
                    afternoon: flattenSlotForTextarea(dayInfo.afternoon),
                    evening: flattenSlotForTextarea(dayInfo.evening),
                },
            };
            STATE.tripDays.push(newDay);
            upsertDay(newDay);

            // Auto-push verified places to the to-do list.
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
            <div style={{ padding: '32px 0 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <h1
                        style={{
                            margin: 0,
                            fontSize: '2.8rem',
                            fontWeight: 800,
                            letterSpacing: '-0.04em',
                            background: 'var(--gradient-title)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}
                    >
                        {t('ai.title')}
                    </h1>
                </div>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    {t('ai.subtitlePlanning', { country: tripCountry })}
                </p>
            </div>

            <div
                className="ai-page-2col"
                style={{
                    display: 'grid',
                    gridTemplateColumns: '380px 1fr',
                    gap: 24,
                    marginBottom: 32,
                }}
            >
                {/* Left: Controls */}
                <div
                    id="aiControlsPanel"
                    style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 700 }}
                >
                    {/* AI Engine — Gemini key */}
                    <div
                        className="card glass"
                        style={{ padding: 18, borderColor: 'rgba(155,89,182,0.3)', flex: '0 0 auto' }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 6,
                            }}
                        >
                            <h2
                                className="card-title"
                                style={{
                                    fontSize: '0.85rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.07em',
                                    color: '#7c3a9e',
                                    margin: 0,
                                }}
                            >
                                {t('ai.sectionAiEngine')}
                            </h2>
                            <button
                                id="aiKeyHelpBtn"
                                type="button"
                                title={t('ai.keyHelpBtnTitle')}
                                aria-label={t('ai.keyHelpBtnTitle')}
                                onClick={onShowKeyHelp}
                                style={{
                                    background: 'rgba(155,89,182,0.12)',
                                    border: '1px solid rgba(155,89,182,0.35)',
                                    color: '#7c3a9e',
                                    width: 24,
                                    height: 24,
                                    borderRadius: '50%',
                                    cursor: 'pointer',
                                    fontWeight: 800,
                                    fontSize: '0.78rem',
                                    lineHeight: 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: 'Georgia, serif',
                                    fontStyle: 'italic',
                                }}
                            >
                                i
                            </button>
                        </div>
                        <p
                            style={{
                                color: 'var(--text-secondary)',
                                fontSize: '0.78rem',
                                margin: '0 0 10px',
                            }}
                        >
                            {t('ai.keyCardSubtitle')}
                        </p>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showKey ? 'text' : 'password'}
                                placeholder={t('ai.keyInputPlaceholder')}
                                autoComplete="off"
                                spellCheck={false}
                                value={geminiKey}
                                onChange={onKeyChange}
                                style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    padding: '10px 42px 10px 12px',
                                    border: '1px solid rgba(0,0,0,0.12)',
                                    borderRadius: 10,
                                    fontSize: '0.85rem',
                                    fontFamily: "'SF Mono', monospace",
                                    background: 'white',
                                    color: '#002d5b',
                                }}
                            />
                            <button
                                type="button"
                                title={showKey ? t('ai.keyToggleHide') : t('ai.keyToggleShow')}
                                aria-label={t('ai.keyToggleAriaLabel')}
                                onClick={() => setShowKey((s) => !s)}
                                style={{
                                    position: 'absolute',
                                    right: 6,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'transparent',
                                    border: 0,
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    color: 'rgba(0,0,0,0.5)',
                                    fontSize: '0.95rem',
                                    lineHeight: 1,
                                }}
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

                    {/* Dates */}
                    <div className="card glass" style={{ padding: 20, flex: '0 0 auto' }}>
                        <h2
                            className="card-title"
                            style={{
                                fontSize: '0.85rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.07em',
                                color: '#005bb8',
                                marginBottom: 14,
                            }}
                        >
                            {t('ai.sectionTravelDates')}
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                                <label
                                    htmlFor="aiDateFrom"
                                    style={{
                                        display: 'block',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        color: 'var(--text-secondary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        marginBottom: 5,
                                    }}
                                >
                                    {t('ai.dateFromLabel')}
                                </label>
                                <input
                                    id="aiDateFrom"
                                    type="date"
                                    className="glass-input"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="aiDateTo"
                                    style={{
                                        display: 'block',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        color: 'var(--text-secondary)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        marginBottom: 5,
                                    }}
                                >
                                    {t('ai.dateToLabel')}
                                </label>
                                <input
                                    id="aiDateTo"
                                    type="date"
                                    className="glass-input"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    min={dateFrom}
                                    style={{ width: '100%', boxSizing: 'border-box' }}
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

                    {/* Requirements / extra context */}
                    <div
                        className="card glass"
                        style={{
                            padding: 20,
                            flex: '1 1 auto',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                        }}
                    >
                        <h2
                            className="card-title"
                            style={{
                                fontSize: '0.85rem',
                                textTransform: 'uppercase',
                                color: '#005bb8',
                                marginBottom: 10,
                                letterSpacing: '0.05em',
                            }}
                        >
                            {t('ai.sectionRequirements')}
                        </h2>
                        <textarea
                            className="glass-input"
                            value={context}
                            onChange={onContextChange}
                            placeholder="e.g. Vegetarian friendly, no walking more than 2km..."
                            style={{
                                width: '100%',
                                resize: 'none',
                                fontSize: '0.9rem',
                                boxSizing: 'border-box',
                                flex: '1 1 auto',
                                minHeight: 120,
                            }}
                        />
                    </div>

                    {/* Generate button (or role notice) */}
                    {tripIsEditable ? (
                        <button
                            type="button"
                            className="ai-generate-btn"
                            onClick={runGenerate}
                            disabled={generating}
                            style={{
                                width: '100%',
                                borderRadius: 'var(--radius-lg)',
                                flex: '0 0 auto',
                            }}
                        >
                            {generating ? t('ai.generatingBtn') : t('ai.generateBtn')}
                        </button>
                    ) : (
                        <RoleNotice activeTrip={activeTrip} />
                    )}
                </div>

                {/* Right: Google Map (sticky) */}
                <div style={{ position: 'sticky', top: 80, height: 700 }}>
                    <div
                        className="card glass"
                        style={{
                            padding: 0,
                            overflow: 'hidden',
                            height: '100%',
                            borderRadius: 18,
                            position: 'relative',
                        }}
                    >
                        <div
                            ref={mapContainerRef}
                            id="aiGoogleMap"
                            style={{ width: '100%', height: '100%' }}
                        />
                        <div
                            id="aiZoomBadge"
                            onClick={onResetZoom}
                            style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 1000 }}
                        >
                            <span>📍</span> <span>{tripCountry}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* To-do list panel */}
            <TodoListPanel activeTrip={activeTrip} datesSet={!!(dateFrom && dateTo)} />

            {/* Itinerary output */}
            <div style={{ marginBottom: 60 }}>
                {generating ? (
                    <div style={{ textAlign: 'center', padding: 60 }}>
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
                        <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                            {t('ai.loadingTitle')}
                        </div>
                        <div
                            style={{
                                color: 'var(--text-secondary)',
                                fontSize: '0.82rem',
                                marginTop: 6,
                            }}
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
            className="card glass"
            style={{
                padding: 16,
                borderRadius: 'var(--radius-lg)',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                flex: '0 0 auto',
            }}
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
        <div className="card glass" style={{ textAlign: 'center', padding: '32px 28px' }}>
            <div style={{ fontSize: '2.4rem', marginBottom: 8 }}>😬</div>
            <h2 style={{ color: '#a82424', margin: '0 0 6px', fontSize: '1.2rem' }}>
                {error.msg}
            </h2>
            {error.hint ? (
                <p
                    style={{
                        margin: '0 0 18px',
                        color: 'var(--text-secondary)',
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                    }}
                >
                    {error.hint}
                </p>
            ) : null}
            <details
                style={{
                    margin: '0 0 18px',
                    textAlign: 'left',
                    background: 'rgba(255,59,48,0.04)',
                    border: '1px solid rgba(255,59,48,0.16)',
                    borderRadius: 10,
                    padding: '8px 12px',
                }}
            >
                <summary
                    style={{
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        color: '#7c3a9e',
                    }}
                >
                    {t('ai.errorTechnicalDetails')}
                </summary>
                <pre
                    style={{
                        margin: '8px 0 0',
                        fontSize: '0.72rem',
                        color: '#666',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
                >
                    {error.raw}
                </pre>
            </details>
            <button
                type="button"
                onClick={onRetry}
                style={{
                    padding: '10px 22px',
                    borderRadius: 999,
                    border: 0,
                    background: 'var(--accent-blue)',
                    color: 'white',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,113,227,0.28)',
                }}
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
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 24,
                }}
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
                        style={{
                            color: 'var(--text-secondary)',
                            margin: '6px 0 0',
                            fontSize: '0.9rem',
                        }}
                    >
                        {t('ai.resultGeneratedBy')}
                    </p>
                </div>
                <div
                    style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        padding: '5px 14px',
                        borderRadius: 980,
                    }}
                >
                    {t('ai.resultBadge')}
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                        <div className="ai-day-row" style={{ display: 'flex', alignItems: 'stretch' }}>
                            <div className="ai-day-chip">
                                <span
                                    style={{
                                        color: 'rgba(255,255,255,0.7)',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.1em',
                                    }}
                                >
                                    Day
                                </span>
                                <span
                                    style={{
                                        color: 'white',
                                        fontSize: '2rem',
                                        fontWeight: 800,
                                        lineHeight: 1,
                                    }}
                                >
                                    {day.day}
                                </span>
                            </div>
                            <div
                                className="ai-day-body"
                                style={{ flex: 1, padding: 'var(--space-6) 28px' }}
                            >
                                <div style={{ marginBottom: 'var(--space-5)' }}>
                                    <h3
                                        style={{
                                            margin: '0 0 var(--space-1)',
                                            fontSize: '1.2rem',
                                            fontWeight: 700,
                                            letterSpacing: '-0.02em',
                                            color: 'var(--text-primary)',
                                        }}
                                    >
                                        {day.title || 'Day ' + day.day}
                                    </h3>
                                    <span
                                        style={{
                                            fontSize: 'var(--font-base)',
                                            color: 'var(--text-secondary)',
                                        }}
                                    >
                                        {day.date || ''}
                                    </span>
                                </div>
                                <div
                                    className="ai-day-slots"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr 1fr',
                                        gap: 'var(--space-4)',
                                    }}
                                >
                                    <SlotBlock title="🌅 Morning" accent="0,113,227" slot={day.morning} />
                                    <SlotBlock
                                        title="☀️ Afternoon"
                                        accent="255,149,0"
                                        slot={day.afternoon}
                                    />
                                    <SlotBlock title="🌙 Evening" accent="155,89,182" slot={day.evening} />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {tripIsEditable ? (
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
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
                            ? '✓ Plan Accepted! (View in Home)'
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


// ── To-do list panel ───────────────────────────────────────────
interface TodoListPanelProps {
    activeTrip: Trip;
    datesSet: boolean;
}

function TodoListPanel({ activeTrip, datesSet }: TodoListPanelProps) {
    // useStore subscription so add/remove/tick from elsewhere repaints.
    useStore((s) => s.trips);

    const allTodo = getMarkedPlaces(activeTrip).filter((p) => p.forManual);
    const tickedItems = allTodo.filter((p) => p.forAI);

    const tripDays = (STATE.tripDays || [])
        .filter((d) => d.tripId === activeTrip.id && d.dayNumber > 0)
        .sort((a, b) => a.dayNumber - b.dayNumber);

    // Empty: no to-do items at all.
    if (allTodo.length === 0) {
        return (
            <div style={{ marginBottom: 32 }}>
                <div
                    className="card glass"
                    style={{
                        padding: 20,
                        borderRadius: 18,
                        border: '1.5px dashed rgba(155, 89, 182, 0.35)',
                        background: 'rgba(155, 89, 182, 0.04)',
                    }}
                >
                    <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}
                    >
                        <span style={{ fontSize: '1.2rem' }}>📋</span>
                        <h3
                            style={{
                                margin: 0,
                                color: '#7c3a9e',
                                fontWeight: 800,
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {t('ai.todoPanelEmptyTitle')}
                        </h3>
                    </div>
                    <p
                        style={{
                            margin: '0 0 12px',
                            color: 'var(--text-secondary)',
                            fontSize: '0.9rem',
                        }}
                    >
                        {t('ai.todoPanelEmptyBody')}
                    </p>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => navigate('todo')}
                        style={{ padding: '10px 18px', borderRadius: 999, fontSize: '0.85rem' }}
                    >
                        {t('ai.todoPanelEmptyCta')}
                    </button>
                </div>
            </div>
        );
    }

    // Items exist but none ticked.
    if (tickedItems.length === 0) {
        return (
            <div style={{ marginBottom: 32 }}>
                <div
                    className="card glass"
                    style={{
                        padding: 20,
                        borderRadius: 18,
                        border: '1.5px dashed rgba(155, 89, 182, 0.35)',
                        background: 'rgba(155, 89, 182, 0.04)',
                    }}
                >
                    <div
                        style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}
                    >
                        <span style={{ fontSize: '1.2rem' }}>📋</span>
                        <h3
                            style={{
                                margin: 0,
                                color: '#7c3a9e',
                                fontWeight: 800,
                                letterSpacing: '-0.01em',
                            }}
                        >
                            {tn('ai.todoPanelNoneTickedTitle', allTodo.length)}
                        </h3>
                    </div>
                    <p
                        style={{
                            margin: '0 0 12px',
                            color: 'var(--text-secondary)',
                            fontSize: '0.9rem',
                        }}
                    >
                        {t('ai.todoPanelNoneTickedBody')}
                    </p>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={() => navigate('todo')}
                        style={{ padding: '10px 18px', borderRadius: 999, fontSize: '0.85rem' }}
                    >
                        {t('ai.todoPanelNoneTickedCta')}
                    </button>
                </div>
            </div>
        );
    }

    // Ticked items — full card list.
    return (
        <div style={{ marginBottom: 32 }}>
            <div
                className="card glass"
                style={{
                    padding: 20,
                    borderRadius: 18,
                    border: '1.5px solid rgba(155, 89, 182, 0.25)',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 14,
                        flexWrap: 'wrap',
                    }}
                >
                    <span style={{ fontSize: '1.2rem' }}>📋</span>
                    <h3
                        style={{
                            margin: 0,
                            color: '#7c3a9e',
                            fontWeight: 800,
                            letterSpacing: '-0.01em',
                        }}
                    >
                        {t('ai.todoPanelTickedTitle')}{' '}
                        <span
                            style={{
                                background: 'rgba(155,89,182,0.12)',
                                color: '#7c3a9e',
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: 999,
                                marginLeft: 6,
                            }}
                        >
                            {tn('ai.todoPanelTickedCount', tickedItems.length)}
                        </span>
                    </h3>
                    <button
                        type="button"
                        onClick={() => navigate('todo')}
                        style={{
                            marginLeft: 'auto',
                            background: 'transparent',
                            border: 0,
                            color: '#005bb8',
                            fontWeight: 700,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                            padding: 0,
                        }}
                    >
                        {t('ai.todoPanelManageBtn')}
                    </button>
                </div>
                <p
                    style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        margin: '0 0 12px',
                        lineHeight: 1.5,
                    }}
                >
                    {datesSet
                        ? t('ai.todoPanelHintWithDates')
                        : t('ai.todoPanelHintNoDates')}
                </p>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                        gap: 12,
                    }}
                >
                    {tickedItems.map((p) => (
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

    return (
        <div
            className="ai-marked-card"
            data-place-id={place.placeId}
            style={{
                background: 'white',
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{place.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontWeight: 800,
                            color: '#002d5b',
                            fontSize: '0.95rem',
                            lineHeight: 1.25,
                        }}
                    >
                        {place.name}
                    </div>
                    {place.address ? (
                        <div
                            style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                marginTop: 2,
                            }}
                        >
                            {place.address}
                        </div>
                    ) : null}
                </div>
            </div>
            {datesSet ? (
                <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                    <select
                        className="marked-day-select"
                        value={place.dayId || ''}
                        onChange={onDayChange}
                        style={{
                            flex: '1 1 0',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: '1px solid rgba(0,0,0,0.1)',
                            fontSize: '0.78rem',
                            background: 'white',
                        }}
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
                        className="marked-time-select"
                        value={place.timeOfDay || ''}
                        onChange={onTimeChange}
                        style={{
                            flex: '1 1 0',
                            minWidth: 0,
                            maxWidth: '100%',
                            padding: '6px 8px',
                            borderRadius: 8,
                            border: '1px solid rgba(0,0,0,0.1)',
                            fontSize: '0.78rem',
                            background: 'white',
                        }}
                    >
                        <option value="">{t('ai.timeOptionAny')}</option>
                        <option value="morning">{t('ai.timeOptionMorning')}</option>
                        <option value="afternoon">{t('ai.timeOptionAfternoon')}</option>
                        <option value="evening">{t('ai.timeOptionEvening')}</option>
                    </select>
                </div>
            ) : (
                <div
                    style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                    }}
                >
                    {t('ai.todoPanelCardNoDates')}
                </div>
            )}
        </div>
    );
}

