// pages/ai/AI.tsx — §3.3 React migration (AI wave 8, final).
//
// Was a thin wrapper that mounted the legacy renderAI() into a
// React tree. This commit replaces the wrapper with a full JSX
// implementation — the legacy 947-line imperative renderAI in
// pages/ai.ts is now retired. AI is the eighth and final
// thin-wrapper page to graduate. §3.3 is complete.
//
// Architecture
//   - Top-level dispatcher (this file): active-trip view vs empty-trip
//     view (the latter now lives in EmptyTripView.tsx).
//   - Active trip (ActiveTripView, this file): the page shell + layout.
//     The heavy lifting is decomposed into focused modules under
//     pages/ai/ so this file stays a thin orchestrator:
//       * useAiPlan.ts   — form state, host-key pool, generate +
//                          accept-plan flows (incl. all MK2/MK3 fixes).
//       * useAiMap.ts    — Google Map setup + per-day marker geocoding.
//       * AiMap.tsx      — the sticky map column.
//       * AIUsageCard.tsx — shared host-key usage bar + BYO-key panel.
//       * ItineraryOutput.tsx — generated day cards + accept button +
//                          the slot/meal/sights renderers + error card.
//       * TodoListPanel.tsx — the marked-place to-do panel.
//       * RoleNotice.tsx — the non-editor generate-gate notice.
//   - Layout: Header → 2-col (Controls | sticky Map) → To-do panel →
//     Itinerary output.
//
// External surface preserved
//   - The route still mounts /ai via pages/ai/mount.ts. That
//     wiring is unchanged.

import { useState, useRef, useLayoutEffect } from 'react';
import { useActiveTrip } from '../../react/TripContext.js';
import { useStore } from '../../react/store.js';
import { canEdit } from '../../permissions.js';
import { t } from '../../i18n.js';
import { esc } from '../../utils/dom-helpers.js';
import { stripEmoji } from '../../icons.js';
import type { Trip } from '../../types';
// Page-scoped CSS — AI plan blocks, place cards, generate button,
// + mobile day-card stacking. FIXING_ROADMAP §3.1 second slice (after
// settings.css): same pattern, Vite emits this as a CSS chunk alongside
// the AI JS bundle so users who never visit /ai don't pay for these
// ~250 lines.
import './ai.css';
import { EmptyTripView } from './EmptyTripView.js';
import { AIUsageCard } from './AIUsageCard.js';
import { RoleNotice } from './RoleNotice.js';
import { ItineraryOutput, GenerationErrorCard } from './ItineraryOutput.js';
import { TodoListPanel } from './TodoListPanel.js';
import { AiMap } from './AiMap.js';
import { useAiPlan } from './useAiPlan.js';
import { VibeSelect } from './VibeSelect.js';
import { useAiMap } from './useAiMap.js';
import { navigate } from '../../router.js';
import { setActiveHomeTab } from '../home-mount/handlers.js';
import { requestAccommodationModalOnHome } from '../home/accommodationModal.js';


// ── Plan-section toggle ────────────────────────────────────────
// Segmented switch letting the user flip the left controls column
// between the "Trip info" (dates) card and the "Requisitos"
// (food + sightseeing prefs) card, showing one at a time. Reuses the
// app-wide .seg-control pill + sliding lens, same as the Profile page.
type PlanSection = 'info' | 'requisitos';
function PlanSectionToggle({
    value,
    onChange,
}: {
    value: PlanSection;
    onChange: (v: PlanSection) => void;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [lens, setLens] = useState<{ left: number; width: number } | null>(null);
    useLayoutEffect(() => {
        const measure = () => {
            const el = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
            if (el) setLens({ left: el.offsetLeft, width: el.offsetWidth });
        };
        measure();
        const node = ref.current;
        if (!node || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(node);
        return () => ro.disconnect();
    }, [value]);
    const opts: Array<{ v: PlanSection; label: string }> = [
        { v: 'info', label: t('ai.planToggleInfo') },
        { v: 'requisitos', label: t('ai.planToggleReqs') },
    ];
    return (
        <div ref={ref} role="tablist" aria-label={t('ai.planToggleAria')} className="seg-control">
            {lens ? <div aria-hidden="true" className="seg-lens" style={{ left: lens.left, width: lens.width }} /> : null}
            {opts.map((o) => {
                const active = o.v === value;
                return (
                    <button
                        key={o.v}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-active={active}
                        onClick={() => onChange(o.v)}
                        className="seg-btn"
                        style={{
                            fontWeight: active ? 700 : 500,
                            color: active ? 'var(--text-brand-navy)' : 'var(--text-secondary)',
                        }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}


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


// ── Active trip view ───────────────────────────────────────────
interface ActiveTripViewProps {
    activeTrip: Trip;
}

function ActiveTripView({ activeTrip }: ActiveTripViewProps) {
    const tripCountry = activeTrip.country || '';
    const tripIsEditable = canEdit(activeTrip);
    // Only nudge for accommodation when none is set yet — once any day of this
    // trip has accommodation, the planner already has the anchor it needs, so
    // the banner is just noise. Reactive so it disappears the moment the user
    // adds accommodation (e.g. returning from the Trip Hub).
    const hasAccommodation = useStore((s) =>
        (s.tripDays || []).some((d) => d.tripId === activeTrip.id && !!d.accommodation),
    );
    const savedNumDays = activeTrip.aiNumDays || 1;

    // Form state + host-key pool + generate/accept flows.
    const plan = useAiPlan(activeTrip, tripCountry);

    // Which controls card is visible: "Trip info" (dates) or
    // "Requisitos" (food + sightseeing prefs). The other card stays
    // mounted in state via useAiPlan, so switching never loses input.
    const [planSection, setPlanSection] = useState<PlanSection>('info');

    // Google Map + per-day markers. Repaints markers when the
    // itinerary changes; exposes the container ref + day-row refs the
    // map's click-to-scroll wiring needs.
    const { mapContainerRef, dayRowsRef, onResetZoom, geocodingPending } = useAiMap(
        activeTrip,
        tripCountry,
        plan.itinerary,
    );

    // No font override here on purpose — the page inherits the site body
    // stack (index.css `body`: SF Pro **Text** + Segoe/Roboto/Helvetica/Arial
    // fallbacks). The old inline override forced SF Pro **Display** and
    // dropped every non-Apple fallback, which is why the planner's type read
    // differently from the rest of the app.
    return (
        <div>
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
                    // the country name renders bold — hence dangerouslySetInnerHTML.
                    // esc() the interpolated country: t() does a raw String()
                    // substitution and country is user free-text (import writes it
                    // verbatim). The nonce CSP blocks script execution, but esc()
                    // still closes stored markup/phishing injection. (MK6)
                    dangerouslySetInnerHTML={{
                        __html: t('ai.subtitlePlanning', { country: esc(tripCountry) }),
                    }}
                />
            </div>

            {/* Accommodation nudge — the AI plan tailors itself to where
                you're staying (see integrations.py). Links straight to the
                Trip Hub accommodation manager. Only shown until accommodation
                is set. */}
            {tripIsEditable && !hasAccommodation ? (
                <button
                    type="button"
                    className="ai-accommodation-banner"
                    onClick={() => {
                        setActiveHomeTab('hub');
                        requestAccommodationModalOnHome();
                        navigate('home');
                    }}
                >
                    <span className="ai-accommodation-banner__text">{t('ai.accommodationBanner')}</span>
                    <span className="ai-accommodation-banner__arrow" aria-hidden="true">→</span>
                </button>
            ) : null}

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
                        hostPoolStatus={plan.hostPoolStatus}
                        showByoCard={plan.showByoCard}
                        onToggleByo={() => plan.setShowByoCard((v) => !v)}
                        geminiKey={plan.geminiKey}
                        onKeyChange={plan.onKeyChange}
                        showKey={plan.showKey}
                        onToggleShowKey={() => plan.setShowKey((s) => !s)}
                        keyStatus={plan.keyStatus}
                        onShowKeyHelp={plan.onShowKeyHelp}
                    />

                    {/* Section toggle: Trip info (dates) ⇆ Requisitos */}
                    <div className="flex justify-center flex-none">
                        <PlanSectionToggle value={planSection} onChange={setPlanSection} />
                    </div>

                    {/* Dates — hidden via inline display so the .flex class
                        can't override [hidden]; stays mounted to keep input. */}
                    <div
                        className="ai-form-card flex-auto min-h-0"
                        style={{ display: planSection === 'info' ? undefined : 'none' }}
                    >
                        <h2 className="ai-form-heading">
                            {t('ai.sectionTravelDates')}
                        </h2>
                        <div className="flex flex-col gap-3.5">
                            <div className="ai-field">
                                <label htmlFor="aiDateFrom" className="ai-field__label">
                                    {t('ai.dateFromLabel')}
                                </label>
                                <input
                                    id="aiDateFrom"
                                    type="date"
                                    className="ai-input"
                                    value={plan.dateFrom}
                                    onChange={(e) => plan.setDateFrom(e.target.value)}
                                />
                            </div>
                            <div className="ai-field">
                                <label htmlFor="aiDateTo" className="ai-field__label">
                                    {t('ai.dateToLabel')}
                                </label>
                                <input
                                    id="aiDateTo"
                                    type="date"
                                    className="ai-input"
                                    value={plan.dateTo}
                                    onChange={(e) => plan.setDateTo(e.target.value)}
                                    min={plan.dateFrom}
                                />
                            </div>
                            <p
                                className="ai-field__hint"
                                style={plan.dateValidityErr ? { color: 'var(--ai-warn)' } : undefined}
                            >
                                {plan.dateValidityErr || t('ai.dateHint')}
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
                        className="ai-form-card flex-auto min-h-0"
                        style={{ display: planSection === 'requisitos' ? undefined : 'none' }}
                    >
                        <h2 className="ai-form-heading">
                            {t('ai.sectionRequirements')}
                        </h2>
                        <div className="flex flex-col gap-[18px]">
                            {/* Vibe — steers the whole plan (places, pace, food,
                                ordering). Multi-select fancy dropdown; persists
                                per-trip. The label is intentionally the literal
                                word "Vibe" in every language (per request). */}
                            <div className="ai-field">
                                <span className="ai-field__label">Vibe</span>
                                <VibeSelect
                                    selected={plan.vibe}
                                    onToggle={plan.toggleVibe}
                                    disabled={!tripIsEditable}
                                />
                            </div>
                            <div className="ai-field">
                                <label htmlFor="aiFoodContext" className="ai-field__label">
                                    {t('ai.foodReqLabel')}
                                </label>
                                <textarea
                                    id="aiFoodContext"
                                    className="ai-input"
                                    value={plan.foodContext}
                                    onChange={plan.onFoodContextChange}
                                    placeholder={t('ai.foodReqPlaceholder')}
                                />
                            </div>
                            <div className="ai-field">
                                <label htmlFor="aiSightseeingContext" className="ai-field__label">
                                    {t('ai.sightsReqLabel')}
                                </label>
                                <textarea
                                    id="aiSightseeingContext"
                                    className="ai-input"
                                    value={plan.sightseeingContext}
                                    onChange={plan.onSightseeingContextChange}
                                    placeholder={t('ai.sightsReqPlaceholder')}
                                />
                            </div>
                            {/* The prompt persists per-trip until cleared here, so
                                users can iterate instead of retyping from scratch.
                                Only shown when there's something to clear. */}
                            {tripIsEditable && plan.hasPrompt ? (
                                <button
                                    type="button"
                                    onClick={plan.onResetPrompt}
                                    className="ai-reset-prompt"
                                >
                                    {t('ai.resetPrompt')}
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {/* Generate button (or role notice) */}
                    {tripIsEditable ? (
                        <button
                            type="button"
                            className="ai-generate-btn w-full rounded-[var(--radius-lg)] flex-none"
                            onClick={() => void plan.runGenerate()}
                            disabled={plan.generating}
                        >
                            {plan.generating ? t('ai.generatingBtn') : t('ai.generateBtn')}
                        </button>
                    ) : (
                        <RoleNotice activeTrip={activeTrip} />
                    )}
                </div>

                {/* Right: Google Map (sticky) */}
                <AiMap
                    mapContainerRef={mapContainerRef}
                    country={tripCountry}
                    onResetZoom={onResetZoom}
                />
            </div>

            {/* To-do list panel */}
            <TodoListPanel activeTrip={activeTrip} datesSet={!!(plan.dateFrom && plan.dateTo)} />

            {/* Itinerary output */}
            <div className="mb-[60px]">
                {plan.generating ? (
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
                ) : plan.generationError ? (
                    <GenerationErrorCard
                        error={plan.generationError}
                        onRetry={() => {
                            plan.setGenerationError(null);
                            void plan.runGenerate();
                        }}
                    />
                ) : plan.itinerary ? (
                    <ItineraryOutput
                        itinerary={plan.itinerary}
                        numDays={savedNumDays}
                        country={tripCountry}
                        tripIsEditable={tripIsEditable}
                        dayRowsRef={dayRowsRef}
                        geocodingPending={geocodingPending}
                        onAccept={plan.onAcceptPlan}
                    />
                ) : null}
            </div>
        </div>
    );
}
