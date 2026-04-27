// state.js — Global STATE object and persistence helpers

// api.js helpers are imported at call-site, not here.

export const STATE = {
    trips: [],
    activeTripId: null,
    categories: [
        { id: 'c1', name: 'Food', icon: '🍔', color: '#ff3b30' },
        { id: 'c2', name: 'Transport', icon: '✈️', color: '#007aff' },
        { id: 'c3', name: 'Accommodation', icon: '🏨', color: '#5856d6' }
    ],
    expenses: [],
    groups: [], // List of people names
    draftExpense: {
        who: '',
        categoryId: '',
        label: '',
        date: '',
        country: '',
        value: '',
        currency: 'EUR',
        euroValue: ''
    },
    insightCurrency: 'EUR',
    rateMode: 'at_trip', // 'at_trip' or 'today'
    rateCache: {}, // { 'YYYY-MM-DD_FROM_TO': rate }
    user: null, // Stores { id, name, email, picture }
    hasLoggedInBefore: false, // Tracks if user has ever signed in
    excelMapping: {
        who: 'Who',
        categoryId: 'Category',
        label: 'Label',
        date: 'Date',
        country: 'Country',
        value: 'Value',
        currency: 'Currency',
        euroValue: 'Euro Value'
    },
    activities: [],
    photos: [],
    budgets: [],
    savedFormats: [],    // Array of {id, name, mappings:[{variable,column}]} — max 5
    tripDays: [],        // Array of {id, tripId, name, dayNumber, photos: []}
    archivedTrips: [],   // Array of completed trips
    activeDetailId: null, // Store ID for detail views (e.g. archived trip detail)
    notifications: []
};

export function loadState() {
    const saved = localStorage.getItem('theGreatEscapeState');
    if (saved) {
        Object.assign(STATE, JSON.parse(saved));
    }
    // Ensure new fields exist
    if (!STATE.savedFormats) STATE.savedFormats = [];
    if (!STATE.tripDays) STATE.tripDays = [];
    if (!STATE.archivedTrips) STATE.archivedTrips = [];
    STATE.tripDays.forEach(d => {
        if (!d.tickets) d.tickets = [];
        if (d.notes === undefined) d.notes = '';
        if (!d.plan) d.plan = { morning: '', afternoon: '', evening: '' };
    });

    // Ensure activeTripId is valid
    if (STATE.trips.length > 0 && (!STATE.activeTripId || !STATE.trips.find(t => t.id === STATE.activeTripId))) {
        STATE.activeTripId = STATE.trips[0].id;
    }
}

export function saveState() {
    // Ensure all days have tickets array
    if (STATE.tripDays) {
        STATE.tripDays.forEach(d => { if (!d.tickets) d.tickets = []; });
    }
    localStorage.setItem('theGreatEscapeState', JSON.stringify(STATE));
    window.updateTripSelector?.();
    // NOTE: Delta sync helpers are called explicitly at each action site.
    // saveState() no longer triggers a full server sync automatically.
}

// ── Tiny event bus ─────────────────────────────────────────────────────────────
// emit('state:changed') from any mutation site to fan out to subscribers.
// Existing call sites that call saveState() directly continue to work; the bus
// is purely additive until callers opt in.
const _subscribers = new Map();

export function subscribe(event, fn) {
    if (!_subscribers.has(event)) _subscribers.set(event, new Set());
    _subscribers.get(event).add(fn);
    return () => _subscribers.get(event)?.delete(fn);
}

export function emit(event, payload) {
    _subscribers.get(event)?.forEach(fn => {
        try { fn(payload); }
        catch (e) { console.error(`Subscriber for "${event}" threw:`, e); }
    });
}

// Default subscriber: persistence happens whenever state changes.
subscribe('state:changed', saveState);
