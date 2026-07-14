// pages/ai/ItineraryOutput.tsx — extracted from AI.tsx (behavior-preserving).
//
// Renders the generated itinerary: a per-day card list + the accept
// button, plus the slot/meal/sights renderers and the generation-error
// card. Pulled out of AI.tsx so the page component stays focused on
// state + wiring. DOM structure, classNames, and behavior are
// unchanged — this is pure extraction.

import { useState } from 'react';
import { t } from '../../i18n.js';
import { showLiquidAlert } from '../../utils.js';
import { transportModeLabel } from '../home/transportModal.js';
import { TransportModeIcon } from '../../react/components/TransportModeIcon.js';
import type { TransportMode } from '../../types';

// Transportation P2 (review fix): the preview must SHOW the per-day transport
// the accept will write — otherwise the user reviews meals/sights carefully,
// accepts, and days silently gain recommendations they never saw. Narrow the
// LLM's opaque field with the same allowlist the accept path uses.
const _PREVIEW_MODES = new Set<string>([
    'walk', 'metro', 'bus', 'train', 'tram', 'car', 'taxi', 'bike', 'ferry', 'flight', 'mixed',
]);
function previewTransport(raw: unknown): { mode: TransportMode; note?: string } | null {
    const tr = raw as { mode?: unknown; note?: unknown } | null;
    if (!tr || typeof tr !== 'object' || typeof tr.mode !== 'string' || !_PREVIEW_MODES.has(tr.mode)) {
        return null;
    }
    const note = typeof tr.note === 'string' ? tr.note.trim() : '';
    return { mode: tr.mode as TransportMode, ...(note ? { note } : {}) };
}
import {
    renderSlotBody,
    renderRestaurantCard,
    renderSightsList,
    isFoodSightsSchema,
    type AiSlot,
    type AiPlanItem,
    type AiDayPlan,
} from './slots.js';


// ── Generation error card ──────────────────────────────────────
export function GenerationErrorCard({
    error,
    onRetry,
}: {
    error: { msg: string; hint: string; raw: string };
    onRetry: () => void;
}) {
    return (
        <div className="card glass text-center py-8 px-7">
            <div className="text-[2.4rem] mb-2">😬</div>
            <h2 className="text-[color:var(--ai-warn)] mt-0 mx-0 mb-1.5 text-[1.2rem]">
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
    itinerary: AiDayPlan[];
    numDays: number | string;
    country: string;
    tripIsEditable: boolean;
    dayRowsRef: React.MutableRefObject<HTMLDivElement[]>;
    // C2-I4: the day coords are filled asynchronously by the map hook's
    // staggered geocoder. onAccept reads those coords at click time, so
    // while this is true we defer accept (and show a "locating places…"
    // cue) rather than silently persist days with null coordinates.
    geocodingPending: boolean;
    onAccept: () => { updatedDays: number; addedDays: number; clearedDays: number };
}

export function ItineraryOutput({
    itinerary,
    numDays,
    country,
    tripIsEditable,
    dayRowsRef,
    geocodingPending,
    onAccept,
}: ItineraryOutputProps) {
    const [accepted, setAccepted] = useState(false);

    const handleAccept = () => {
        const s = onAccept();
        setAccepted(true);
        // C2-I5: an honest one-line summary of what Accept did (days updated /
        // added / cleared) — the button flip alone gave no cue that existing
        // days were overwritten or trailing days cleared.
        showLiquidAlert(
            t('ai.acceptSummary', {
                updated: s.updatedDays,
                added: s.addedDays,
                cleared: s.clearedDays,
            }),
            'success',
        );
    };

    const sf =
        "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', sans-serif";

    // C2-B2: the heading count must match the day cards actually
    // rendered below, not the requested date-range span. `numDays` is
    // derived from the trip dates (clamped to 30) at generate time, but
    // Gemini can return fewer days — so a 7-day request with a 4-day
    // response would otherwise render a "7-Day Itinerary" over 4 cards.
    // Use the real card count; fall back to `numDays` only when the
    // response isn't a usable array (avoids a "0-Day" heading).
    const dayCount =
        Array.isArray(itinerary) && itinerary.length > 0
            ? itinerary.length
            : numDays;

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
                        {t('ai.resultHeading', { numDays: dayCount, country })}
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
                {(Array.isArray(itinerary) ? itinerary : []).map((day: AiDayPlan, i: number) => (
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
                                    {(() => {
                                        const tr = previewTransport(day.transport);
                                        if (!tr) return null;
                                        return (
                                            <div className="mt-1 text-[0.82rem] font-semibold text-secondary flex items-center gap-1.5 flex-wrap">
                                                <TransportModeIcon mode={tr.mode} size={16} /> {transportModeLabel(tr.mode)}
                                                {tr.note ? (
                                                    <span className="font-normal opacity-80"> · {tr.note}</span>
                                                ) : null}
                                            </div>
                                        );
                                    })()}
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
                        // C2-I4: block accept while day coords are still being
                        // geocoded — onAccept reads day.lat/lon at click time,
                        // so accepting now would persist days with null coords
                        // (missing map pins until a later geocode). The label
                        // below tells the user why the button is briefly held.
                        disabled={accepted || geocodingPending}
                        aria-busy={geocodingPending && !accepted}
                        style={{
                            flex: 2,
                            background: accepted ? '#34c759' : 'var(--accent-blue)',
                            color: 'white',
                            padding: 16,
                            fontSize: '1.1rem',
                            borderRadius: 16,
                            fontWeight: 700,
                            boxShadow: '0 10px 20px rgba(0,122,255,0.2)',
                            cursor: accepted || geocodingPending ? 'default' : 'pointer',
                            opacity: geocodingPending && !accepted ? 0.75 : 1,
                        }}
                    >
                        {accepted
                            ? t('ai.acceptPlanBtnAccepted')
                            : geocodingPending
                                ? t('ai.acceptPlanBtnLocating')
                                : t('ai.acceptPlanBtn')}
                    </button>
                </div>
            ) : null}
        </>
    );
}


function SlotBlock({
    title,
    accent,
    slot,
}: {
    title: string;
    accent: string;
    slot: AiSlot | null | undefined;
}) {
    return (
        <div className="ai-plan-block" style={{ ['--accent' as string]: accent }}>
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

function MealBlock({
    title,
    accent,
    place,
}: {
    title: string;
    accent: string;
    // The meal field arrives as `unknown` from the LLM day plan; the
    // body narrows before rendering. Widen to `{ text?, name? }` for the
    // has-content guard — type-only.
    place: unknown;
}) {
    const p = place as { text?: string; name?: string } | null | undefined;
    const hasPlace = !!(p && typeof p === 'object' && (p.text || p.name));
    return (
        <div className="ai-plan-block" style={{ ['--accent' as string]: accent }}>
            <div className="ai-plan-block__tag">{title}</div>
            {hasPlace ? (
                <div dangerouslySetInnerHTML={{ __html: renderRestaurantCard(place as AiPlanItem) }} />
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

function SightsBlock({ sights }: { sights: unknown }) {
    const list: AiPlanItem[] = Array.isArray(sights)
        ? (sights.filter(Boolean) as AiPlanItem[])
        : [];
    return (
        <div className="ai-plan-block" style={{ ['--accent' as string]: '52,199,89' }}>
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
