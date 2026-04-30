// The Great Getaway — service worker (Phase A stub).
//
// Right now this is a minimal pass-through worker. It registers with root
// scope so it can intercept any request later, claims clients on activate,
// and skips the install wait so updates roll out fast in development.
//
// No caching strategies are wired up yet — Phase L (PWA polish) layers
// those in: cache-first for static assets, network-first for /api/*,
// offline fallback page, etc. Until then, every fetch goes to the network
// untouched, which is fine for development and gives us a known-good
// baseline to compare future cache logic against.

const SW_VERSION = 'v0-stub';

self.addEventListener('install', (event) => {
    // Skip the "waiting" phase — new SW activates immediately on next load.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Take control of any existing clients (open tabs) without requiring
    // a reload. Pairs with skipWaiting() above.
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass-through. Phase L will replace this with real caching strategies.
});

// Tagged log so the version is visible in DevTools' service-worker pane.
console.log(`[sw] The Great Getaway service worker registered (${SW_VERSION})`);
