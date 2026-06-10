// pages/home-mount/TripBody.tsx — §3.3 React migration.
//
// Everything below the hero map: trip title row (with edit/silence/
// roster buttons + member chips), tab nav (Path / Companions), and
// the two tab contents (Companions card with chips + CTA, Path tab
// inner that hosts buildPathTabHtml output).
//
// What's React:
//   - The trip-title row, tab nav, companions card are all JSX.
//   - Tab state is component-local useState (activeHomeTab in
//     ./handlers carries the same value so external openers like
//     openDayDetail's setActiveHomeTab callback still work).
//   - JSX onClick handlers cover the React-rendered buttons
//     (Edit Trip, Silence, Companions panel, Tab nav, Reset Map View).
//
// What stays imperative:
//   - Path tab inner: buildPathTabHtml emits raw HTML for the day
//     wheel + chip strip + per-day options stack; chip clicks
//     repaint just the inner without re-rendering. We host a div +
//     useEffect call to buildPathTabHtml + a repaint callback
//     registered with pathSelection hooks.
//   - Per-day action buttons inside the path-tab inner
//     (.day-pin-save-btn, .day-detail-btn, .path-chip, etc.) are
//     plain HTML so we still need delegated click handling on the
//     wrapping container ref to dispatch them.

import { useEffect, useRef, useState } from 'react';
import { STATE, emit } from '../../state.js';
import { showLiquidAlert, esc } from '../../utils.js';
import { setTripActionsHidden, upsertDay } from '../../api.js';
import {
    openEditTripModal,
    openPdfExportModal,
    openCompanionPickerModal,
    openTripMembersModal,
    openAddDayModal,
} from '../../modals.js';
import { openTripChecklistModal } from '../home/tripChecklistModal.js';
import { openTripDocumentsModal, openTripPhotosModal } from '../home/tripMediaModals.js';
import { openJournalingModal } from '../home/journalingModal.js';
import { openDayDetail as _openDayDetailRaw, type HomeTab } from '../home/dayDetailModal.js';
import { applySilenceBtnVisual } from '../home/shareModal.js';
import { buildPathTabHtml, togglePathCardCollapsed } from '../home/pathTab.js';
import {
    registerPathSelectionHooks,
    resolveSelectedDayId,
    setSelectedDay,
} from '../home/pathSelection.js';
import { paintWeatherChips, loadAndPaintWeather, type WeatherForecast } from '../home/weather.js';
import { canEdit, canManageRoster, getMyRole, ROLE_PLANNER, ROLE_BUDGETEER } from '../../permissions.js';
import { findTripCompanionByLinkedUser } from '../../companions.js';
import {
    addDayPin,
    deleteDay,
    deleteDayPin,
    editDayPin,
    saveDayPin,
    setActiveHomeTab,
    editingDayId,
} from './handlers.js';
import type { Trip, TripDay } from '../../types';
import { t, tn } from '../../i18n.js';


export interface TripBodyProps {
    activeTrip: Trip;
}


/** MK2 UX: open a native date picker for a day and persist the chosen date.
 *  Pre-fix the day-card "Set date" was a dead control and there was NO way to
 *  date an existing day anywhere (only at Add-Day creation or via the whole-
 *  trip range). Uses a transient off-screen <input type="date"> + showPicker()
 *  so mobile gets the native wheel; writes day.date via upsertDay and re-renders
 *  (which updates the weather chip + "today" highlight). An empty value clears
 *  the date. */
function openDayDatePicker(dayId: string): void {
    const day = (STATE.tripDays || []).find((d) => d.id === dayId);
    if (!day) return;
    const input = document.createElement('input');
    input.type = 'date';
    input.value = day.date || '';
    input.style.cssText = 'position:fixed; left:50%; bottom:12px; transform:translateX(-50%); opacity:0; pointer-events:none; z-index:-1;';
    document.body.appendChild(input);
    let done = false;
    const finish = async (write: boolean) => {
        if (done) return;
        done = true;
        const newDate = input.value || '';
        input.remove();
        if (!write || newDate === (day.date || '')) return;
        day.date = newDate;
        emit('state:changed');
        try {
            await upsertDay(day);
        } catch {
            /* outbox + next /api/data pull reconcile a transient failure */
        }
    };
    input.addEventListener('change', () => { void finish(true); });
    // Dismissed without choosing → clean up (deferred so a `change` wins).
    input.addEventListener('blur', () => { setTimeout(() => { void finish(false); }, 50); });
    const picker = input as unknown as { showPicker?: () => void };
    if (typeof picker.showPicker === 'function') {
        try { picker.showPicker(); return; } catch { /* fall through */ }
    }
    // Fallback for browsers without showPicker(): reveal + focus the input.
    input.style.cssText = 'position:fixed; left:50%; bottom:12px; transform:translateX(-50%); z-index:10001;';
    input.focus();
}


// openDayDetail wraps the extracted module so we can pass our
// own setActiveHomeTab callback through. Hooks into the React
// activeTab state via the parent component's setter.
function makeOpenDayDetail(setActiveTab: (tab: HomeTab) => void) {
    return (dayId: string) =>
        _openDayDetailRaw(dayId, {
            setActiveHomeTab: (tab: HomeTab) => {
                setActiveHomeTab(tab);
                setActiveTab(tab);
            },
        });
}


export function TripBody({ activeTrip }: TripBodyProps) {
    const daysContainerRef = useRef<HTMLDivElement | null>(null);
    const pathTabInnerRef = useRef<HTMLDivElement | null>(null);

    const [activeTab, setActiveTab] = useState<HomeTab>('days');
    // Weather forecast — fetched async after first paint. Stored
    // in a ref so the path-tab repaint closure reads the latest
    // value without driving its own re-render.
    const weatherForecastRef = useRef<WeatherForecast>(null);

    const tripIsManageable = canManageRoster(activeTrip);
    const tripIsEditable = canEdit(activeTrip);

    // Filter + sort trip days fresh on each render so add/edit/
    // delete reflects on the next render through.
    const tripDays = (STATE.tripDays || [])
        .filter((d) => d.tripId === activeTrip.id)
        .sort((a, b) => a.dayNumber - b.dayNumber);

    const openDayDetail = makeOpenDayDetail(setActiveTab);

    // ── Path tab repaint ─────────────────────────────────────────
    // Build + paint #pathTabInner contents. Called on mount and on
    // every selected-day change (registered with pathSelection
    // hooks). Selected-chip is scrolled into view after each paint
    // so off-screen chips don't strand the user.
    const repaintPath = () => {
        const host = pathTabInnerRef.current;
        if (!host) return;
        host.innerHTML = buildPathTabHtml({
            activeTrip,
            tripDays,
            tripIsEditable,
            editingDayId,
        });
        const sel = host.querySelector('.path-chip.is-selected');
        if (sel) {
            (sel as HTMLElement).scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest',
            });
        }
        // Re-paint weather chips after every repaint (chip slots are
        // fresh DOM nodes and need re-populating from the cached
        // forecast).
        paintWeatherChips(weatherForecastRef.current, host);
    };

    useEffect(() => {
        registerPathSelectionHooks({ repaintPathTab: repaintPath });
        repaintPath();

        // Weather forecast — load async, repaint when it lands.
        if (typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
            void loadAndPaintWeather(activeTrip.lat, activeTrip.lng, pathTabInnerRef.current).then(
                (forecast) => {
                    weatherForecastRef.current = forecast;
                },
            );
        }

        // ── Step day helpers ────────────────────────────────────
        const stepSelectedDay = (delta: number) => {
            const sortedDays = [
                ...(STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id),
            ].sort((a, b) => a.dayNumber - b.dayNumber);
            const currentId = resolveSelectedDayId(activeTrip, sortedDays);
            const idx = sortedDays.findIndex((d) => d.id === currentId);
            const next = sortedDays[idx + delta];
            if (next) setSelectedDay(activeTrip.id, next.id);
        };

        // ── Swipe support ───────────────────────────────────────
        let swipeStartX: number | null = null;
        const onTouchStart = (e: TouchEvent) => {
            const t = e.touches?.[0];
            if (!t) return;
            const cardsRow =
                e.target instanceof Element ? e.target.closest('.path-cards-row') : null;
            if (!cardsRow) return;
            swipeStartX = t.clientX;
        };
        const onTouchEnd = (e: TouchEvent) => {
            if (swipeStartX == null) return;
            const t = e.changedTouches?.[0];
            const startX = swipeStartX;
            swipeStartX = null;
            if (!t) return;
            const dx = t.clientX - startX;
            if (Math.abs(dx) < 40) return;
            stepSelectedDay(dx < 0 ? +1 : -1);
        };
        const container = daysContainerRef.current;
        container?.addEventListener('touchstart', onTouchStart, { passive: true });
        container?.addEventListener('touchend', onTouchEnd, { passive: true });

        // ── Keyboard arrows ─────────────────────────────────────
        const onKeyDown = (e: KeyboardEvent) => {
            if (activeTab !== 'days') return;
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const tag = ((e.target as HTMLElement | null)?.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            stepSelectedDay(e.key === 'ArrowLeft' ? -1 : +1);
        };
        document.addEventListener('keydown', onKeyDown);

        return () => {
            container?.removeEventListener('touchstart', onTouchStart);
            container?.removeEventListener('touchend', onTouchEnd);
            document.removeEventListener('keydown', onKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    // ── Delegated click handler for path-tab inner DOM ─────────
    // Per-day buttons are still raw HTML emitted by buildPathTabHtml,
    // so we delegate clicks on the container to handle them.
    useEffect(() => {
        const container = daysContainerRef.current;
        if (!container) return;

        const dispatcher = (e: Event) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;

            // Reset map view — clicking the trip name fits the map
            // to all pins. (#resetMapViewBtn is a JSX <button> with
            // onClick, but path-card-collapse-btn etc. need delegation.)

            // Add-day chip
            if (target.closest('#pathAddDayChip')) {
                openAddDayModal();
                return;
            }
            // Prev/next nav
            if (target.closest('#pathPrevBtn')) {
                stepSelectedDay(-1);
                return;
            }
            if (target.closest('#pathNextBtn')) {
                stepSelectedDay(+1);
                return;
            }

            // Day-card collapse chevron — toggles options stack visibility.
            const collapseBtn = target.closest('.path-card-collapse-btn') as HTMLElement | null;
            if (collapseBtn?.dataset.dayId) {
                e.stopPropagation();
                e.preventDefault();
                const dayId = collapseBtn.dataset.dayId;
                const nowCollapsed = togglePathCardCollapsed(dayId);
                const column = collapseBtn.closest('.path-column');
                if (column) {
                    column.classList.toggle('is-collapsed', nowCollapsed);
                }
                return;
            }

            // Per-day pin / journal / delete buttons
            const saveBtn = target.closest('.day-pin-save-btn') as HTMLElement | null;
            if (saveBtn?.dataset.dayId) {
                void saveDayPin(saveBtn.dataset.dayId);
                return;
            }
            const delPinBtn = target.closest('.day-pin-delete-btn') as HTMLElement | null;
            if (delPinBtn?.dataset.dayId) {
                void deleteDayPin(delPinBtn.dataset.dayId);
                return;
            }
            const togglePinBtn = target.closest('.day-pin-toggle-btn') as HTMLElement | null;
            if (togglePinBtn?.dataset.dayId) {
                const dayId = togglePinBtn.dataset.dayId;
                const day = STATE.tripDays.find((d) => d.id === dayId);
                if (day?.lat) editDayPin(dayId);
                else addDayPin(dayId);
                return;
            }
            const journalBtn = target.closest('.day-journaling-btn') as HTMLElement | null;
            if (journalBtn?.dataset.dayId) {
                openJournalingModal(journalBtn.dataset.dayId);
                return;
            }
            if (target.closest('.path-checklist-btn')) {
                openTripChecklistModal(activeTrip);
                return;
            }
            if (target.closest('.path-documents-btn')) {
                openTripDocumentsModal(activeTrip);
                return;
            }
            if (target.closest('.path-photos-btn')) {
                openTripPhotosModal(activeTrip);
                return;
            }
            const delDayBtn = target.closest('.day-delete-btn') as HTMLElement | null;
            if (delDayBtn?.dataset.dayId) {
                deleteDay(delDayBtn.dataset.dayId);
                return;
            }
            const detailBtn = target.closest('.day-detail-btn') as HTMLElement | null;
            if (detailBtn?.dataset.dayId) {
                openDayDetail(detailBtn.dataset.dayId);
                return;
            }
            // MK2 UX: the day-card date is now a real picker (was a dead
            // control — no way to date an existing day). Checked BEFORE the
            // card-body select below so the tap opens the picker, not just
            // selecting the card.
            const dateBtn = target.closest('.day-card__date-btn') as HTMLElement | null;
            if (dateBtn?.dataset.dayId) {
                openDayDatePicker(dateBtn.dataset.dayId);
                return;
            }

            // Chip click — jump straight to that day.
            const chip = target.closest(
                '.path-chip[data-path-chip-day-id]',
            ) as HTMLElement | null;
            if (chip?.dataset.pathChipDayId) {
                setSelectedDay(activeTrip.id, chip.dataset.pathChipDayId);
                return;
            }
            // Card body click — selects that card.
            const pathCard = target.closest(
                '.path-card[data-day-id]',
            ) as HTMLElement | null;
            if (pathCard?.dataset.dayId) {
                setSelectedDay(activeTrip.id, pathCard.dataset.dayId);
                return;
            }
        };

        const stepSelectedDay = (delta: number) => {
            const sortedDays = [
                ...(STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id),
            ].sort((a, b) => a.dayNumber - b.dayNumber);
            const currentId = resolveSelectedDayId(activeTrip, sortedDays);
            const idx = sortedDays.findIndex((d) => d.id === currentId);
            const next = sortedDays[idx + delta];
            if (next) setSelectedDay(activeTrip.id, next.id);
        };

        container.addEventListener('click', dispatcher);
        return () => container.removeEventListener('click', dispatcher);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTrip.id]);

    // ── Tab swap helpers ────────────────────────────────────────
    const switchTab = (key: 'days' | 'companions') => {
        setActiveTab(key);
        setActiveHomeTab(key);
    };

    // ── Reset map view ─────────────────────────────────────────
    const onResetMapView = () => {
        const map = window.activeMap as google.maps.Map;
        if (!map) return;
        const _g = google;
        const bounds = new _g.maps.LatLngBounds();
        if (typeof activeTrip.lat === 'number' && typeof activeTrip.lng === 'number') {
            bounds.extend({ lat: activeTrip.lat, lng: activeTrip.lng });
        }
        const tripDaysHere = (STATE.tripDays || []).filter((d) => d.tripId === activeTrip.id);
        for (const day of tripDaysHere) {
            if (typeof day.lat === 'number') {
                bounds.extend({ lat: day.lat, lng: day.lon || day.lng });
            }
        }
        if (!bounds.isEmpty()) {
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();
            const latSpan = Math.abs(ne.lat() - sw.lat());
            const lngSpan = Math.abs(ne.lng() - sw.lng());
            const isEffectivelyPoint = latSpan < 0.001 && lngSpan < 0.001;
            if (isEffectivelyPoint && activeTrip.viewport) {
                const v = activeTrip.viewport;
                map.fitBounds(
                    new _g.maps.LatLngBounds(
                        { lat: v.south, lng: v.west },
                        { lat: v.north, lng: v.east },
                    ),
                );
            } else if (isEffectivelyPoint) {
                map.setCenter(ne);
                map.setZoom(12);
            } else {
                map.fitBounds(bounds, 80);
            }
        } else if (activeTrip.viewport) {
            const v = activeTrip.viewport;
            map.fitBounds(
                new _g.maps.LatLngBounds(
                    { lat: v.south, lng: v.west },
                    { lat: v.north, lng: v.east },
                ),
            );
        }
    };

    // ── Silence trip toggle ────────────────────────────────────
    const onSilenceTrip = async (e: React.MouseEvent<HTMLButtonElement>) => {
        const silenceBtn = e.currentTarget;
        const wasSilenced = silenceBtn.dataset.silenced === '1';
        const willSilence = !wasSilenced;
        // Optimistic local + visual flip.
        activeTrip.actionsHidden = willSilence;
        applySilenceBtnVisual(silenceBtn, willSilence);
        emit('state:changed');
        const result = await setTripActionsHidden(activeTrip.id, willSilence);
        if (!result || !result.ok) {
            activeTrip.actionsHidden = wasSilenced;
            applySilenceBtnVisual(silenceBtn, wasSilenced);
            emit('state:changed');
            // USER-BUG-2 (2026-05-28): 404 means the trip row isn't on the
            // server yet (race between trip-create POST and silence click).
            // The pre-fix wording always claimed "not the owner" even when
            // the user had just created the trip and clearly IS the owner.
            // 403 is the real not-owner case. 5xx / network → generic copy.
            let msg = "Couldn't update — try again in a moment.";
            if (result?.status === 404) {
                msg = "Trip is still saving — try again in a moment.";
            } else if (result?.status === 403) {
                msg = 'Only the trip owner can silence trip actions.';
            }
            showLiquidAlert(msg);
            return;
        }
        showLiquidAlert(
            willSilence
                ? "Trip actions silenced — hidden from friends' feeds."
                : 'Trip actions visible again.',
        );
    };

    const onCompanionsRoster = () => {
        if (canManageRoster(activeTrip)) {
            openCompanionPickerModal(activeTrip.id);
        } else {
            openTripMembersModal(activeTrip.id);
        }
    };

    const tripTitle = activeTrip.name || 'Your Journey';

    return (
        <div ref={daysContainerRef} className="mt-10">
            <div className="flex flex-col mb-6">
                <div className="flex items-center gap-3">
                    {/* 2026-05-21: mobile-only circular-arrow trip
                        switcher to the LEFT of the trip name. Replaces
                        the navbar compass (now hidden on mobile). Opens
                        the same #tripControlsPopover via the delegated
                        handler in nav-chrome.ts. */}
                    <button
                        type="button"
                        id="mobileTripSwitcherBtn"
                        className="mobile-trip-switcher"
                        aria-label={t('tripActions.switchTrip')}
                        title={t('tripActions.switchTrip')}
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <polyline points="1 20 1 14 7 14"></polyline>
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"></path>
                            <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"></path>
                        </svg>
                    </button>
                    <button
                        id="resetMapViewBtn"
                        title={t('tripActions.resetMapView')}
                        onClick={onResetMapView}
                    >
                        <h2
                            className="text-[length:var(--font-3xl)] tracking-[-0.03em] m-0 font-extrabold text-brand-navy"
                        >
                            {tripTitle}
                        </h2>
                    </button>
                    {tripIsManageable ? (
                        <button
                            id="editTripBtn"
                            className="icon-btn-square"
                            title={t('tripActions.editTrip')}
                            aria-label={t('tripActions.editTrip')}
                            onClick={() => openEditTripModal(activeTrip)}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                            >
                                <path d="M12 20h9"></path>
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                            </svg>
                        </button>
                    ) : null}
                    {/* PDF download — same shape + hover behavior as
                        Edit, just a different accent color. Setting
                        `--accent: 52,199,89` (green) on the button
                        makes the shared `.icon-btn-square` hover/focus
                        rules light up green on hover instead of blue.
                        Triangle clip-path retired 2026-05-18 — the
                        special-snowflake shape felt out of place
                        between the other two square buttons. */}
                    <button
                        id="downloadTripPdfBtn"
                        className="icon-btn-square"
                        title={t('tripActions.downloadPdf')}
                        aria-label={t('tripActions.downloadPdf')}
                        onClick={() => openPdfExportModal(activeTrip)}
                        style={{ ['--accent' as string]: '52,199,89' }}
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    {tripIsManageable ? (
                        <button
                            id="silenceTripBtn"
                            className="icon-btn-square"
                            data-silenced={activeTrip.actionsHidden ? '1' : '0'}
                            // 2026-05-18: same shape + hover model as Edit
                            // and Download — `--accent` drives the hover
                            // color. Always red here so the button reads
                            // as the "make this private" verb regardless
                            // of current state. When silence is ACTIVE
                            // (actionsHidden=1) we fill the baseline with
                            // a soft red wash so the on-state is visible
                            // without breaking the shared shape, instead
                            // of the old "solid red badge" treatment that
                            // visually shouted compared to the other two
                            // neutral-baseline buttons.
                            style={{
                                ['--accent' as string]: '255,59,48',
                                ...(activeTrip.actionsHidden
                                    ? {
                                          background: 'rgba(255,59,48,0.12)',
                                          borderColor: 'rgba(255,59,48,0.4)',
                                          color: '#ff3b30',
                                      }
                                    : {}),
                            }}
                            title={
                                activeTrip.actionsHidden
                                    ? t('tripActions.silenceOnTitle')
                                    : t('tripActions.silenceOffTitle')
                            }
                            aria-label={
                                activeTrip.actionsHidden
                                    ? t('tripActions.silenceOnAria')
                                    : t('tripActions.silenceOffAria')
                            }
                            aria-pressed={activeTrip.actionsHidden ? 'true' : 'false'}
                            onClick={(e) => void onSilenceTrip(e)}
                        >
                            {activeTrip.actionsHidden ? (
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                    <path d="M18.63 13A17.89 17.89 0 0 1 18 8"></path>
                                    <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"></path>
                                    <path d="M18 8a6 6 0 0 0-9.33-5"></path>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                            ) : (
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                >
                                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                                </svg>
                            )}
                        </button>
                    ) : null}
                    {!tripIsEditable ? (
                        // BUG-073: show the viewer's ACTUAL role. canEdit is
                        // planner-only, so BOTH relaxers and budgeteers land
                        // here — the old hardcoded "👁 Relaxer" badge
                        // mislabelled budgeteers, who can in fact edit expenses.
                        getMyRole(activeTrip) === ROLE_BUDGETEER ? (
                            <span
                                className="trip-role-badge trip-role-badge--relaxer"
                                title={t('companions.roleBudgeteer')}
                            >
                                💰 {t('companions.roleBudgeteer')}
                            </span>
                        ) : (
                            <span
                                className="trip-role-badge trip-role-badge--relaxer"
                                title={t('companions.relaxerBadgeTitle')}
                            >
                                👁 {t('companions.roleRelaxer')}
                            </span>
                        )
                    ) : null}
                </div>
                <p
                    className="text-[0.95rem] text-secondary mt-1.5 mx-0 mb-0 font-medium flex items-center gap-2.5 flex-wrap"
                >
                    {/* 2026-05-21: anchor (Hub, dayNumber=0) doesn't
                        count as a planned day — show only numbered
                        days. A brand-new trip with only the auto-stamped
                        Hub correctly reads "0 Days of adventure" now. */}
                    {/* 2026-05-24: i18n — was hardcoded
                        "N Day{s} of adventure". `tn()` picks the
                        correct plural/singular form per locale. */}
                    {(() => {
                        const plannedDayCount = tripDays.filter((d: TripDay) => (d.dayNumber || 0) > 0).length;
                        return (
                            <span>{tn('home.daysOfAdventure', plannedDayCount, { count: plannedDayCount })}</span>
                        );
                    })()}
                    <span
                        id="homeTripLocalTimeChip"
                        className="trip-local-time-chip hidden"
                    ></span>
                </p>
            </div>

            <div className="trip-tabnav-wrap">
                <nav className="trip-tabnav" role="tablist" aria-label="Trip view">
                    <button
                        className={`trip-tabnav__tab${activeTab === 'days' ? ' is-active' : ''}`}
                        role="tab"
                        aria-selected={activeTab === 'days'}
                        onClick={() => switchTab('days')}
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <span>{t('home.tabPath')}</span>
                    </button>
                    <button
                        className={`trip-tabnav__tab${activeTab === 'companions' ? ' is-active' : ''}`}
                        role="tab"
                        aria-selected={activeTab === 'companions'}
                        onClick={() => switchTab('companions')}
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span>{t('home.tabCompanions')}</span>
                    </button>
                </nav>
            </div>

            <CompanionsCard
                activeTrip={activeTrip}
                tripIsManageable={tripIsManageable}
                isActive={activeTab === 'companions'}
                onRoster={onCompanionsRoster}
            />

            <div
                className={`home-tab-content${activeTab === 'days' ? ' is-active' : ''} flex flex-col gap-1`}
                data-home-tab="days"
            >
                <div ref={pathTabInnerRef} id="pathTabInner" />
            </div>
        </div>
    );
}


// ── Roster chip model — single source of truth for the Companions
// card. Both the chip panel (render) and the header count badge derive
// from this ONE deduped list so they can never disagree.
//
// BUG-19 (MK2 audit): the count badge read `companions.length` while
// the chips rendered a deduped union (owner ∪ members ∪ companions not
// already linked to a member). So a trip where one person was both a
// member and a same-name companion (the "two Saras" case) showed e.g.
// "3 people" above 4 chips — or vice-versa. Deriving the count from the
// same builder makes the mismatch structurally impossible.
interface ChipShape {
    name: string;
    role: string | null;
    picture?: string | null;
    isOwner: boolean;
    isMember: boolean;
    isPending?: boolean;
}

function buildRosterChips(activeTrip: Trip): ChipShape[] {
    const members = activeTrip.members || [];
    const companions = activeTrip.companions || [];
    const chips: ChipShape[] = [];
    const seenMemberIds = new Set<string>();

    const owner = members.find((m) => m.userId === activeTrip.ownerId);
    if (owner) {
        chips.push({
            name:
                findTripCompanionByLinkedUser(activeTrip, owner.userId)?.name ||
                owner.name ||
                t('companions.fallbackOwnerName'),
            role: owner.role,
            picture: owner.picture ?? null,
            isOwner: true,
            isMember: true,
        });
        seenMemberIds.add(owner.userId);
    }
    for (const m of members) {
        if (seenMemberIds.has(m.userId)) continue;
        seenMemberIds.add(m.userId);
        chips.push({
            name:
                findTripCompanionByLinkedUser(activeTrip, m.userId)?.name ||
                m.name ||
                m.userId,
            role: m.role,
            picture: m.picture ?? null,
            isOwner: false,
            isMember: true,
        });
    }
    for (const c of companions) {
        if (c.linkedUserId && seenMemberIds.has(c.linkedUserId)) continue;
        chips.push({
            name: c.name,
            role: null,
            isOwner: false,
            isMember: false,
            isPending: !!c.linkedUserId,
        });
    }
    return chips;
}


// ── CompanionsCard — chip panel + roster CTA ───────────────────
interface CompanionsCardProps {
    activeTrip: Trip;
    tripIsManageable: boolean;
    isActive: boolean;
    onRoster: () => void;
}

function CompanionsCard({ activeTrip, tripIsManageable, isActive, onRoster }: CompanionsCardProps) {
    // BUG-19: count the SAME deduped roster the chips render, so the
    // header badge can't disagree with the visible chips. The CTA
    // wording still keys off whether there's anything to manage
    // (companions to edit / members to see) — unchanged behaviour.
    const companionCount = buildRosterChips(activeTrip).length;
    const hasManageTarget = tripIsManageable
        ? (activeTrip.companions || []).length > 0
        : (activeTrip.members || []).length > 0;
    const ctaLabel = tripIsManageable
        ? hasManageTarget
            ? t('companions.cardCtaEdit')
            : t('companions.cardCtaAdd')
        : t('companions.cardCtaSee');
    const ctaTitle = tripIsManageable
        ? t('companions.cardCtaManageTitle')
        : t('companions.cardCtaSeeTitle');

    return (
        <div
            className={`home-tab-content${isActive ? ' is-active' : ''}`}
            data-home-tab="companions"
        >
            <div className="trip-companions-card">
                <div className="trip-companions-card__header">
                    <div className="trip-companions-card__icon">
                        <svg
                            width="22"
                            height="22"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                    </div>
                    <div className="trip-companions-card__heading">
                        <h3 className="trip-companions-card__title">{t('companions.cardTitle')}</h3>
                        <p className="trip-companions-card__subtitle">
                            {companionCount === 1
                                ? t('companions.cardSubtitleOne', { count: companionCount })
                                : t('companions.cardSubtitleOther', { count: companionCount })}
                        </p>
                    </div>
                    <span className="trip-companions-card__count">{companionCount}</span>
                </div>

                <MemberChipsPanel activeTrip={activeTrip} tripIsManageable={tripIsManageable} onClick={onRoster} />

                <button
                    type="button"
                    className="trip-companions-card__cta"
                    title={ctaTitle}
                    onClick={onRoster}
                >
                    {ctaLabel}
                </button>
            </div>
        </div>
    );
}


// ── MemberChipsPanel — horizontal chip per participant ────────
function MemberChipsPanel({
    activeTrip,
    tripIsManageable,
    onClick,
}: {
    activeTrip: Trip;
    tripIsManageable: boolean;
    onClick: () => void;
}) {
    // BUG-19: render the SAME deduped roster the count badge reads.
    const chips = buildRosterChips(activeTrip);

    if (chips.length === 0) {
        return (
            <div className="trip-companions-card__chips">
                <div className="trip-companions-card__empty">
                    {tripIsManageable
                        ? t('companions.cardEmptyManager')
                        : t('companions.cardEmptyViewer')}
                </div>
            </div>
        );
    }

    const renderBadge = (chip: ChipShape) => {
        if (chip.isOwner) {
            return (
                <span className="member-chip__role member-chip__role--owner">{t('companions.membersOwnerBadge')}</span>
            );
        }
        if (chip.isMember) {
            const label =
                chip.role === ROLE_PLANNER
                    ? t('companions.rolePlanner')
                    : chip.role === ROLE_BUDGETEER
                      ? t('companions.roleBudgeteer')
                      : t('companions.roleRelaxer');
            const variant =
                chip.role === ROLE_PLANNER
                    ? 'planner'
                    : chip.role === ROLE_BUDGETEER
                      ? 'budgeteer'
                      : 'relaxer';
            return (
                <span className={`member-chip__role member-chip__role--${variant}`}>{label}</span>
            );
        }
        if (chip.isPending) {
            return (
                <span className="member-chip__role member-chip__role--companion">{t('companions.pillPendingText')}</span>
            );
        }
        return <span className="member-chip__role member-chip__role--relaxer">{t('companions.roleRelaxer')}</span>;
    };

    return (
        <div
            className="trip-companions-card__chips"
            id="tripMembersPanel"
            title={tripIsManageable ? t('companions.chipsManageTitle') : t('companions.chipsSeeTitle')}
            onClick={onClick}
        >
            {chips.map((chip, i) => {
                const safeName = chip.name || '·';
                const initial = safeName.charAt(0).toUpperCase() || '·';
                return (
                    <div
                        key={i}
                        className={`member-chip ${chip.isOwner ? 'member-chip--owner' : ''}`}
                    >
                        {chip.picture ? (
                            <img
                                className="member-chip__avatar"
                                src={chip.picture}
                                alt=""
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <span
                                className="member-chip__initial"
                                dangerouslySetInnerHTML={{ __html: esc(initial) }}
                            />
                        )}
                        <span
                            className="member-chip__name"
                            dangerouslySetInnerHTML={{ __html: esc(safeName) }}
                        />
                        {renderBadge(chip)}
                    </div>
                );
            })}
        </div>
    );
}
