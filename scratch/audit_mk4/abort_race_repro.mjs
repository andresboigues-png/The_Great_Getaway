// Repro: does `void writeOnServer(); navigate()` abort the in-flight
// write before it reaches the server?  Mirrors api/core.ts apiFetch
// (signal = options.signal ?? currentNavSignal()) + router.navigate()
// (abort previous controller synchronously).

let _currentNavController = null;
function currentNavSignal() { return _currentNavController?.signal; }

// Mirror of apiFetch's signal selection + fetch call.
let realFetchCalls = 0;
let abortedBeforeSend = 0;
let abortedInFlight = 0;
// Realistic fetch: invoked SYNCHRONOUSLY when apiFetch runs (before
// navigate). Resolves on a later tick. If the signal aborts while
// in-flight, it rejects with AbortError and the request is cancelled.
function fakeFetch(url, { signal }) {
    realFetchCalls++; // the call itself happened synchronously
    return new Promise((resolve, reject) => {
        if (signal) {
            signal.addEventListener('abort', () => {
                abortedInFlight++;
                const e = new Error('aborted'); e.name = 'AbortError';
                reject(e);
            });
        }
        // network latency — resolves after the current microtask drain
        setTimeout(() => resolve({ ok: true }), 5);
    });
}
async function apiFetch(url) {
    const signal = currentNavSignal();
    const res = await fakeFetch(url, { signal });
    return res;
}

// Mirror of _post → apiFetch (no explicit signal => inherits nav signal)
function _post(url) {
    return apiFetch(url).catch(e => ({ aborted: e.name === 'AbortError' }));
}

// Mirror of router.navigate(): abort previous, make a fresh controller.
function navigate() {
    if (_currentNavController) _currentNavController.abort();
    _currentNavController = new AbortController();
}

// ---- Scenario A: the modals/trip.ts createTrip sequence ----
// boot: first navigate established a controller (user is on some page)
navigate();
// createTrip handler body:
const p = _post('/api/trips');   // void upsertTrip(newTrip)
navigate();                       // navigate('home')  <-- aborts p's signal
const resultA = await p;

console.log('Scenario A (void write; navigate):');
console.log('  fetch() invoked?', realFetchCalls > 0);
console.log('  aborted WHILE IN-FLIGHT (request cancelled)?', abortedInFlight > 0);
console.log('  _post result:', JSON.stringify(resultA));

// ---- Scenario B: the modals/day.ts sequence (await BEFORE navigate) ----
realFetchCalls = 0; abortedInFlight = 0;
navigate();
const r = await _post('/api/days');  // await upsertDay(newDay)
navigate();                          // navigate('home') AFTER the await
console.log('\nScenario B (await write; THEN navigate):');
console.log('  fetch() invoked?', realFetchCalls > 0);
console.log('  aborted WHILE IN-FLIGHT?', abortedInFlight > 0);
console.log('  _post result:', JSON.stringify(r));
