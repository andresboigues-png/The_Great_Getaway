import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
        // D5 (perf): disable Vite's modulepreload helper. By default it
        // adds `<link rel="modulepreload" href="chunks/X.js">` calls
        // for every dynamic-import dep so the chunk fetch overlaps the
        // entry's parse. The helper stamps the bare filename into the
        // href without applying `base`, so on this app's mount path
        // (`/static/js/app.bundle.js` served at `/`) the preload tries
        // `/chunks/X.js` (404) and the actual `import()` resolves the
        // chunk fine via relative-to-script-URL semantics. Real-world
        // we lose ~1 RTT per first-time chunk fetch; in exchange the
        // server logs are quiet and the rest of the bundle stays
        // correctly base-prefixed.
        modulePreload: false,
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
