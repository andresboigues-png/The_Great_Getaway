import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Phase C1 wires up @vitejs/plugin-react so the bundle can consume
// .tsx files as the React migration progresses. Existing .ts pages
// keep compiling unchanged — the plugin's JSX transform only fires
// on files that contain JSX. Until C2 ships its first React leaf,
// React is in node_modules but unused at runtime, so the IIFE
// output is functionally identical to pre-C1 (modulo the React
// runtime once any .tsx file is imported into the entry tree).
//
// D5 (perf, 2026-05-08): pull in rollup-plugin-visualizer so
// `ANALYZE=1 npm run build` emits `bundle-stats.html` showing what's
// eating the bundle (treemap by gzip + brotli size). The default build
// path is unchanged so CI doesn't pay the extra emit cost; only manual
// performance audits opt in.
//
// 2026-05-10: switched from a static `import { visualizer } from
// 'rollup-plugin-visualizer'` to a lazy dynamic import inside the
// ANALYZE-only branch. The static form crashed every build on
// machines that didn't have the analyzer dev-dep installed, even
// when ANALYZE was unset. Now the dep is truly optional — install
// only when you actually run an audit.

const ANALYZE = process.env.ANALYZE === '1';

// Resolve the visualizer plugin only when needed. Top-level await is
// supported in ESM (Vite loads this config as ESM), so no defineConfig
// async form needed.
let visualizerPlugin = null;
if (ANALYZE) {
    try {
        const { visualizer } = await import('rollup-plugin-visualizer');
        visualizerPlugin = visualizer({
            filename: path.resolve(__dirname, 'bundle-stats.html'),
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            open: false,
        });
    } catch {
        console.warn(
            '[vite.config] ANALYZE=1 but rollup-plugin-visualizer is not installed. ' +
                'Run `npm install --save-dev rollup-plugin-visualizer` to enable bundle audits. ' +
                'Continuing build without it.'
        );
    }
}

export default defineConfig({
    plugins: [
        react({
            // Automatic JSX runtime so .tsx files don't need an
            // explicit `import React`. Matches @types/react v19's
            // expectation + tsconfig "jsx": "react-jsx".
            jsxRuntime: 'automatic',
        }),
        // §0.4 follow-up Tailwind adoption (2026-05-17): @tailwindcss/vite
        // scans every TSX/TS/HTML/CSS file in the build graph for class
        // names and emits ONLY the rules that are actually used. The
        // generated CSS gets injected into the file that contains
        // `@import "tailwindcss";` — for this project, that's
        // frontend/static/css/index.css, which is `<link>`-loaded
        // directly from the Flask template. Zero runtime cost; pure
        // build-time extraction.
        tailwindcss(),
        visualizerPlugin,
    ].filter(Boolean),
    // D5 (perf): code-split chunks live at /static/js/chunks/...
    // The bundle's `import("chunks/mount-X.js")` calls resolve
    // relative to the document URL by default — without this `base`,
    // a navigation from `/` would 404 on `/chunks/mount-X.js`. Setting
    // it to the static-asset prefix makes Vite emit
    // `import("/static/js/chunks/mount-X.js")` with an absolute URL,
    // which the Flask static handler serves directly.
    base: '/static/js/',
    build: {
        // MK1 Wave F (PERF-8): RE-ENABLED. The original D5 disable was
        // for a real bug — the old helper stamped bare `chunks/X.js`
        // hrefs without applying `base`, 404ing every preload on this
        // app's mount path. The current rolldown-vite emits a runtime
        // preload-helper that resolves deps relative to the MODULE URL
        // (import.meta.url), so the base prefix is honoured. Verified
        // empirically 2026-07-04: full pages.spec run with preload on →
        // 0 × 404, 582 healthy chunk fetches. Buys back the ~1 RTT per
        // first-time chunk navigation the disable traded away.
        modulePreload: true,
        rollupOptions: {
            input: path.resolve(__dirname, 'frontend/static/js/src/main.ts'),
            output: {
                dir: path.resolve(__dirname, 'frontend/static/js'),
                entryFileNames: 'app.bundle.js',
                // D5 (perf): switched from `format: 'iife' +
                // inlineDynamicImports: true` to `format: 'es' +
                // multi-chunk` so dynamic `import()` in the router
                // produces real per-page chunks. Initial bundle now
                // contains only the entry + main-page code; other
                // pages lazy-load on navigation. The Flask template
                // loads the entry as `<script type="module">`.
                //
                // Chunk file names live alongside app.bundle.js and
                // get the same v=mtime cache-buster as the entry —
                // see `app_bundle_version` in src/main.py for the
                // version helper that the template uses.
                format: 'es',
                chunkFileNames: 'chunks/[name]-[hash].js',
                // §0.4 follow-up Tailwind adoption: side-effect CSS
                // imports from the entry bundle (notably src/tailwind.css)
                // get emitted as assets/<name>-<hash>.css with content-
                // hashing by default. Hashed names rule out a stable
                // <link> in the Flask template (we don't run Vite's HTML
                // transform), so emit the entry CSS at a STABLE name:
                // `assets/main.css`. Cache-bust via Flask's
                // `_asset_version` (mtime → ?v=...) same way we do for
                // app.bundle.js. Chunked page CSS (mount-*.css) keeps
                // its hashed names because those load lazily via Vite's
                // chunk-CSS-link auto-injection, which DOES work for
                // dynamic imports.
                assetFileNames: (info) => {
                    // Vite/Rollup names the entry bundle's CSS asset
                    // after the entry chunk ('main' from main.ts), so
                    // the side-effect CSS from `import './tailwind.css'`
                    // arrives here as name === 'main.css'. Pin it to
                    // a stable filename so the Flask template can
                    // <link> it without a manifest indirection.
                    if (info.name === 'main.css' || info.names?.includes('main.css')) {
                        return 'assets/main.css';
                    }
                    return 'assets/[name]-[hash][extname]';
                },
                // Vendor manual-chunk: pull React + ReactDOM into a
                // long-lived chunk so app code changes don't bust the
                // React cache (and vice-versa).
                //
                // Note: the page chunks emitted by Rolldown statically
                // import some symbols from the entry (e.g. shared
                // utilities, state, api) — `import { ... } from
                // "../app.bundle.js"`. For that to resolve to the
                // already-loaded entry module rather than re-fetch
                // (and re-execute) it, the script tag's URL must
                // match the chunks' URL. We drop the `?v=` query
                // string from the entry's script tag below (see
                // index.html) and rely on Flask's ETag /
                // Last-Modified cache validators for staleness.
                manualChunks: (id) => {
                    if (
                        id.includes('node_modules/react/') ||
                        id.includes('node_modules/react-dom/') ||
                        id.includes('node_modules/scheduler/')
                    ) {
                        return 'vendor-react';
                    }
                },
            },
        },
        outDir: path.resolve(__dirname, 'frontend/static/js'),
        emptyOutDir: false, // Don't wipe the whole js/ folder
        sourcemap: true,
    },
});
