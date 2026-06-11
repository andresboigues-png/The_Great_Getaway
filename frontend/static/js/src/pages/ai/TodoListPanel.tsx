// pages/ai/TodoListPanel.tsx — extracted from AI.tsx (behavior-preserving).
//
// The full-width "your AI-marked places" panel below the controls/map
// row: empty states, sort + category filter, grouped card list, and
// the per-place MarkedCard (with day/time assignment selects). Pulled
// out of AI.tsx unchanged — same DOM, classNames, sort/filter logic,
// and the prompt-injection-safe `dangerouslySetInnerHTML` on the
// hard-coded translation strings only.

import { useState } from 'react';
import { useStore } from '../../react/store.js';
import { STATE, emit } from '../../state.js';
import { formatDayDate } from '../../utils.js';
import { upsertTrip } from '../../api.js';
import { navigate } from '../../router.js';
import {
    getMarkedPlaces,
    setMarkedPlaceAssignment,
} from '../../markedPlaces.js';
import { t, tn } from '../../i18n.js';
import { stripEmoji, iconSvg } from '../../icons.js';
import type { Trip, TripDay, MarkedPlace } from '../../types';
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

export function TodoListPanel({ activeTrip, datesSet }: TodoListPanelProps) {
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
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortMode === 'name-desc') {
        visibleItems = visibleItems
            .slice()
            .sort((a, b) => (b.name || '').localeCompare(a.name || ''));
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
    place: MarkedPlace;
    tripDays: TripDay[];
    datesSet: boolean;
    activeTrip: Trip;
}) {
    // Cards are only built for marked places that carry a placeId
    // (the list key is `place.placeId`), so the non-null assertions
    // below are sound — type-only.
    const onDayChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const dayId = e.target.value || null;
        setMarkedPlaceAssignment(activeTrip, place.placeId!, dayId, place.timeOfDay || null);
        emit('state:changed');
        void upsertTrip(activeTrip);
    };
    const onTimeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        // The <select> options are exactly '' / morning / afternoon /
        // evening, so this cast is safe; `|| null` maps '' → null.
        const timeOfDay = (e.target.value as 'morning' | 'afternoon' | 'evening' | '') || null;
        setMarkedPlaceAssignment(activeTrip, place.placeId!, place.dayId || null, timeOfDay);
        emit('state:changed');
        void upsertTrip(activeTrip);
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
                    title={t('todo.openInMapsTitle', { place: place.name ?? '' })}
                    aria-label={t('todo.openInMapsTitle', { place: place.name ?? '' })}
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
