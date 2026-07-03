// MK1 Wave F (T2-6 / PERF-2): on-demand CDN script loading.
//
// chart.js (~200KB) and xlsx.full.min.js (~1MB!) used to sit as
// parser-BLOCKING <script> tags in the <head> of every page load —
// paid by every visitor on every cold load, although Chart is used
// only by the Insights page and XLSX only by two rare import flows
// (expense batch upload + the settings rates-table import). They now
// load on first use. The URLs are unchanged (cdn.jsdelivr.net is
// domain-allowlisted in the CSP — main.py script-src — so injected
// tags pass the same policy the head tags did).
//
// The promise is memoized per URL so concurrent callers share one
// in-flight load; a FAILED load clears the memo so a retry (e.g. the
// user re-clicks import after a network blip) re-attempts instead of
// returning the cached rejection forever.

const _inflight = new Map<string, Promise<void>>();

function loadCdnScript(src: string, alreadyLoaded: () => boolean): Promise<void> {
    if (alreadyLoaded()) return Promise.resolve();
    let p = _inflight.get(src);
    if (!p) {
        p = new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => {
                _inflight.delete(src);
                s.remove();
                reject(new Error(`CDN script failed to load: ${src}`));
            };
            document.head.appendChild(s);
        });
        _inflight.set(src, p);
    }
    return p;
}

/** Ensure the global `Chart` (chart.js) is available. */
export function loadChartJs(): Promise<void> {
    return loadCdnScript(
        'https://cdn.jsdelivr.net/npm/chart.js',
        () => typeof (window as { Chart?: unknown }).Chart !== 'undefined'
    );
}

/** Ensure the global `XLSX` (SheetJS) is available. */
export function loadXlsx(): Promise<void> {
    return loadCdnScript(
        'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
        () => typeof (window as { XLSX?: unknown }).XLSX !== 'undefined'
    );
}
