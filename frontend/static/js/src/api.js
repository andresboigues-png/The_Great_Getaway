// api.js — Backend fetch helpers

import { STATE, emit } from './state.js';
import { navigate } from './router.js';

export async function syncWithServer() {
    if (!STATE.user) return;
    try {
        await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: STATE.user.id,
                trips: STATE.trips,
                archived_trips: STATE.archivedTrips || [],
                expenses: STATE.expenses,
                activities: STATE.activities,
                photos: STATE.photos,
                groups: STATE.groups,
                categories: STATE.categories || [],
                budgets: STATE.budgets || []
            })
        });
    } catch (e) {
        console.error("Sync failed:", e);
    }
}

export async function pullFromServer() {
    if (!STATE.user) return;
    try {
        const res = await fetch(`/api/data?user_id=${encodeURIComponent(STATE.user.id)}`);
        const data = await res.json();
        if (data) {
            // Split trips into active and archived
            const allTrips = data.trips || [];
            STATE.trips = allTrips.filter(t => !t.isArchived);
            STATE.archivedTrips = allTrips.filter(t => t.isArchived);
            
            STATE.expenses = data.expenses || [];
            STATE.groups = data.companions || [];
            STATE.categories = data.categories || [];
            STATE.budgets = data.budgets || [];
            STATE.tripDays = data.tripDays || [];
            
            emit('state:changed');               // saveState + updateTripSelector via subscriber

            await fetchNotifications(); // Fetch notifications during pull
            window.updateNotificationUI?.();
            
            // Re-render current page to show new data
            const currentPage = window.location.hash.replace('#', '') || 'home';
            navigate(currentPage);
        }
    } catch (e) {
        console.error("Pull from server failed:", e);
    }
}

// ── DELTA SYNC HELPERS ────────────────────────────────────────────────────────
// These make targeted calls instead of sending the entire STATE each time.

const _post = (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
}).catch(e => console.error(`POST ${url} failed:`, e));

const _delete = (url, body) => fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
}).catch(e => console.error(`DELETE ${url} failed:`, e));

/** Upsert a single trip to the server. */
export function upsertTrip(trip) {
    if (!STATE.user) return;
    return _post('/api/trips', { user_id: STATE.user.id, trip });
}

/** Permanently delete a trip and its expenses from the server. */
export function deleteTrip(tripId) {
    if (!STATE.user) return;
    return _delete(`/api/trips/${tripId}`, { user_id: STATE.user.id });
}

/** Mark a trip as archived (completed) on the server. */
export function archiveTripOnServer(tripId) {
    if (!STATE.user) return;
    return _post(`/api/trips/${tripId}/archive`, { user_id: STATE.user.id });
}

/** Upsert a single expense to the server. */
export function upsertExpense(expense) {
    if (!STATE.user) return;
    return _post('/api/expenses', { user_id: STATE.user.id, expense });
}

/** Delete a single expense from the server. */
export function deleteExpenseOnServer(expenseId) {
    if (!STATE.user) return;
    return _delete(`/api/expenses/${expenseId}`, { user_id: STATE.user.id });
}

/** Replace the full companion list on the server. */
export function syncCompanions() {
    if (!STATE.user) return;
    return _post('/api/companions', { user_id: STATE.user.id, companions: STATE.groups });
}

/** Replace the full category list on the server. */
export function syncCategories() {
    if (!STATE.user) return;
    return _post('/api/categories', { user_id: STATE.user.id, categories: STATE.categories });
}

/** Upsert a single budget to the server. */
export function upsertBudget(budget) {
    if (!STATE.user) return;
    return _post('/api/budgets', { user_id: STATE.user.id, budget });
}

/** Delete a single budget from the server. */
export function deleteBudgetOnServer(budgetId) {
    if (!STATE.user) return;
    return _delete(`/api/budgets/${budgetId}`, { user_id: STATE.user.id });
}

/** Upsert a single trip day to the server. */
export function upsertDay(day) {
    if (!STATE.user) return;
    return _post('/api/days', { user_id: STATE.user.id, day });
}

/** Delete a single trip day from the server. */
export function deleteDayOnServer(dayId) {
    if (!STATE.user) return;
    return _delete(`/api/days/${dayId}`, { user_id: STATE.user.id });
}
// ── END DELTA SYNC HELPERS ────────────────────────────────────────────────────

export async function fetchNotifications() {
    if (!STATE.user) return;
    try {
        const res = await fetch(`/api/notifications/list?user_id=${encodeURIComponent(STATE.user.id)}`);
        const notifications = await res.json();
        STATE.notifications = notifications;
        window.updateNotificationUI?.();
    } catch (e) {
        console.error("Failed to fetch notifications:", e);
    }
}

export async function markNotificationsRead() {
    if (!STATE.user) return;
    try {
        await fetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: STATE.user.id })
        });
        STATE.notifications.forEach(n => n.is_read = 1);
        window.updateNotificationUI?.();
    } catch (e) {
        console.error("Failed to mark notifications read:", e);
    }
}

export async function fetchHistoricalRates(dates) {
    if (dates.length === 0) return;

    // Sort dates to find range
    const sorted = [...dates].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];

    if (!start || !end) return;

    try {
        // We fetch conversion from EUR to others for the range
        // Frankfurter range limit is 1 year, we'll just fetch for the trip range
        const url = `https://api.frankfurter.app/${start}..${end}`;
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            // data.rates is { "YYYY-MM-DD": { "USD": 1.1, ... } }
            Object.entries(data.rates).forEach(([date, rates]) => {
                Object.entries(rates).forEach(([curr, rate]) => {
                    STATE.rateCache[`${date}_${curr}_EUR`] = 1 / rate; // Store as curr -> EUR
                });
            });
            emit('state:changed');
        }
    } catch (e) {
        console.error("Failed to fetch historical rates:", e);
    }
}

