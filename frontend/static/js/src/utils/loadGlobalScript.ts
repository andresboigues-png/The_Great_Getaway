// utils/loadGlobalScript.ts — on-demand CDN-script injector.
//
// R11-B2 P1: chart.js + xlsx.full.min.js used to ride synchronously in
// index.html, ~1.1 MB of parser-blocking JS on every cold paint even
// though Chart is only used on /insights and XLSX only on /upload.
// Pulling them out of the head and lazy-loading on first use removes
// that LCP regression on every other route.
//
// The pattern: each consumer (Insights.tsx, upload.ts) `await`s the
// loader before touching the global. The loader caches the in-flight
// Promise so concurrent callers share one network request, and the
// resolved global so subsequent calls are zero-cost.
//
// Why CDN globals + lazy <script> injection instead of `import` from
// npm bundles? Chart.js and SheetJS are both ~hundreds of KB; bundling
// them would bloat every chunk that imports them transitively. Lazy
// CDN injection keeps the main bundle lean AND avoids the route-level
// chunking dance React.lazy would require for a sub-component that
// imports them.

interface InflightSlot {
    promise: Promise<unknown>;
}

const _inflight = new Map<string, InflightSlot>();

/** Load an external script and resolve when `globalName` becomes
 *  available on `window`. Idempotent — repeat calls with the same
 *  `globalName` return the already-resolved value. The script tag is
 *  injected once per global; subsequent calls await the cached promise.
 *
 *  Rejects after a 15s timeout if the CDN is unreachable so callers
 *  don't hang the UI on a transport failure. The caller should catch
 *  + surface a "couldn't load" message; this helper doesn't toast or
 *  log itself.
 */
export function loadGlobalScript<T = unknown>(
    src: string,
    globalName: string,
): Promise<T> {
    const w = window as unknown as Record<string, unknown>;
    // Already loaded? Resolve immediately — zero-cost re-call.
    if (w[globalName] != null) {
        return Promise.resolve(w[globalName] as T);
    }
    // In-flight? Share the existing promise.
    const cached = _inflight.get(globalName);
    if (cached) return cached.promise as Promise<T>;

    const promise = new Promise<T>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        let timed = false;
        const timer = window.setTimeout(() => {
            timed = true;
            reject(new Error(`loadGlobalScript timeout: ${globalName}`));
        }, 15000);
        script.onload = () => {
            if (timed) return;
            window.clearTimeout(timer);
            const value = w[globalName];
            if (value == null) {
                reject(new Error(
                    `loadGlobalScript: ${globalName} not on window after ${src} loaded`,
                ));
                return;
            }
            resolve(value as T);
        };
        script.onerror = () => {
            window.clearTimeout(timer);
            // Drop the cache slot so a retry can re-inject (the cached
            // rejection would otherwise stick forever).
            _inflight.delete(globalName);
            reject(new Error(`loadGlobalScript: ${src} failed to load`));
        };
        document.head.appendChild(script);
    });
    _inflight.set(globalName, { promise });
    return promise;
}

/** Chart.js loader — used by pages/insights/Insights.tsx. */
export function loadChart(): Promise<unknown> {
    return loadGlobalScript(
        'https://cdn.jsdelivr.net/npm/chart.js',
        'Chart',
    );
}

/** SheetJS (xlsx) loader — used by pages/upload.ts. */
export function loadXLSX(): Promise<unknown> {
    return loadGlobalScript(
        'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
        'XLSX',
    );
}
