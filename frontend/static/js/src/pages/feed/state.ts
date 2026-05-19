// pages/feed/state.ts — §3.3 React migration support.
//
// Module-level cache for the Feed page. Lives outside any React
// component so that navigating away from /feed and back paints
// instantly from cache (second visit feels instant), with a
// background re-fetch reconciling against the server.
//
// What's cached:
//   - cachedEvents: FeedEvent[] from /api/feed (Posts + Actions)
//   - cachedThreads: per-event comment arrays, lazy-fetched on
//     first thread expand
//   - cachedExplore: ExploreFeedItem[] from /api/feed/explore, the
//     third tab's discovery surface. `null` means "not loaded
//     yet"; `[]` means "loaded, server returned empty".
//   - expandedBundles: which Action bundles are currently open
//     (Set of bundle ids). Survives tab/filter toggles.
//   - openThreads: which event-card threads are currently
//     expanded (Set of event ids). Survives optimistic-UI
//     repaints.
//   - activeFeedTab + bookmarkedOnly: persisted user preferences
//     (so a tab-leave + come-back lands the user where they
//     were).
//
// Wraps the mutation surface in setters so the React component's
// hydrate-from-store / write-back-on-change pattern stays
// grep-able and the cache invariants are enforced in one place.

import { fetchExploreFeed, type ExploreFeedItem } from '../../api.js';
import type { FeedEvent, FeedComment } from './render.js';

export type FeedTab = 'posts' | 'actions' | 'explore';


// ── Module-level mutable cache ─────────────────────────────────
let _events: FeedEvent[] = [];
let _explore: ExploreFeedItem[] | null = null;
let _activeTab: FeedTab = 'posts';
let _bookmarkedOnly = false;
const _threads: Record<string, FeedComment[]> = {};
const _expandedBundles: Set<string> = new Set();
const _openThreads: Set<string> = new Set();
let _exploreFetchInFlight: Promise<void> | null = null;


// ── Getters ────────────────────────────────────────────────────
export function getCachedEvents(): FeedEvent[] {
    return _events;
}

export function getCachedExplore(): ExploreFeedItem[] | null {
    return _explore;
}

export function getActiveFeedTab(): FeedTab {
    return _activeTab;
}

export function getBookmarkedOnly(): boolean {
    return _bookmarkedOnly;
}

export function getCachedThread(eventId: string): FeedComment[] | undefined {
    return _threads[eventId];
}

export function isBundleExpanded(bundleId: string): boolean {
    return _expandedBundles.has(bundleId);
}

export function isThreadOpen(eventId: string): boolean {
    return _openThreads.has(eventId);
}


// ── Setters ────────────────────────────────────────────────────
export function setCachedEvents(events: FeedEvent[]): void {
    _events = events;
}

export function setActiveFeedTab(tab: FeedTab): void {
    _activeTab = tab;
}

export function setBookmarkedOnly(value: boolean): void {
    _bookmarkedOnly = value;
}

export function setCachedThread(eventId: string, comments: FeedComment[]): void {
    _threads[eventId] = comments;
}

export function toggleBundleExpanded(bundleId: string): boolean {
    if (_expandedBundles.has(bundleId)) {
        _expandedBundles.delete(bundleId);
        return false;
    }
    _expandedBundles.add(bundleId);
    return true;
}

export function toggleThreadOpen(eventId: string): boolean {
    if (_openThreads.has(eventId)) {
        _openThreads.delete(eventId);
        return false;
    }
    _openThreads.add(eventId);
    return true;
}


/** Lazy + dedup fetch for the Explore tab. Idempotent — calling
 *  while a fetch is already in flight returns the same promise so
 *  we never double-fire. On success, mutates `_explore` AND
 *  invokes the passed `onResolve` so the React caller can
 *  re-render. On failure, leaves `_explore` null (so the next
 *  tab switch retries) and quietly logs — Explore is a nice-to-
 *  have, not a crash-worthy surface. */
export function ensureExploreLoaded(onResolve: () => void): Promise<void> {
    // Already loaded — synchronous re-paint via the caller's
    // onResolve. Background stale-revalidate is left for a future
    // iteration.
    if (_explore !== null && _exploreFetchInFlight === null) {
        onResolve();
        return Promise.resolve();
    }
    if (_exploreFetchInFlight) {
        return _exploreFetchInFlight.then(onResolve);
    }
    _exploreFetchInFlight = (async () => {
        try {
            const res = await fetchExploreFeed();
            if (res.error) {
                console.warn('explore fetch failed:', res.error);
                // 2026-05-19: leave `_explore` at its current value
                // (null on first load) so the next tab-switch retries
                // the fetch instead of caching the failure as []. The
                // old behaviour locked the user into an empty Explore
                // until full page reload.
            } else {
                _explore = res.items || [];
            }
        } finally {
            _exploreFetchInFlight = null;
            onResolve();
        }
    })();
    return _exploreFetchInFlight;
}


/** D4 motion: trigger the `actionPop` keyframe (CSS `.tap-pop`) on
 *  a button so it scale-pops in response to a tap. Self-cleaning —
 *  the class drops on `animationend` so it's free to re-arm on the
 *  next tap. */
export function playTapPop(el: HTMLElement): void {
    el.classList.remove('tap-pop');
    void el.offsetWidth; // force reflow
    el.classList.add('tap-pop');
    el.addEventListener(
        'animationend',
        () => {
            el.classList.remove('tap-pop');
        },
        { once: true },
    );
}
