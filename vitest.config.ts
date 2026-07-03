/// <reference types="vitest/config" />
//
// Vitest config for FAST frontend unit tests of pure logic. These exercise
// framework-free modules (the present-value + FX money math, the settlement
// balance engine, the trip-media merge) — no React/Tailwind plugins needed.
// Vite's resolver still maps the codebase's `.js` import specifiers onto their
// `.ts` sources, same as the build.
//
// Environment is `jsdom`, not `node`: although the functions under test are
// pure, importing them transitively pulls low-level modules (state → router →
// pages → bootstrap) that touch `window`/`document` at module-eval time (e.g.
// `window.onhashchange = …`). jsdom provides those globals so the import graph
// loads; the assertions themselves remain pure.
//
// Scope is narrow on purpose: only `*.test.ts` under the frontend src tree, so
// the Playwright e2e specs in tests/e2e (*.spec.js) are never picked up here.
//
// Run with `npm run test:unit`. Wired into the pre-push hook so the money math
// can't silently regress.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['frontend/static/js/src/**/*.test.ts'],
        // MK1 Wave D (T1-4): coverage measurement. Scoped to the app
        // source (excluding the locale tables — 8.5k lines of strings
        // would drown the signal, and the tsc parity check already
        // guards them). Run `npm run test:unit:coverage`; the summary
        // is the BASELINE to ratchet, not a gate yet — the SPA's
        // coverage story is young (13 test files when this landed).
        coverage: {
            provider: 'v8',
            include: ['frontend/static/js/src/**'],
            exclude: [
                'frontend/static/js/src/locales/**',
                'frontend/static/js/src/**/*.test.ts',
                'frontend/static/js/src/types.d.ts',
                'frontend/static/js/src/globals.d.ts',
            ],
            reporter: ['text-summary', 'text'],
        },
    },
});
