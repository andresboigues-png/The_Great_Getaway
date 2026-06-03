/// <reference types="vitest/config" />
//
// Vitest config for FAST frontend unit tests of pure logic (no browser).
// Deliberately standalone (not the production vite.config.js): these tests
// exercise framework-free modules — currently the present-value money math in
// utils/presentValue — so they need no React/Tailwind plugins and run in the
// Node environment. Vite's resolver still maps the codebase's `.js` import
// specifiers onto their `.ts` sources, same as the build.
//
// Scope is narrow on purpose: only `*.test.ts` under the frontend src tree, so
// the Playwright e2e specs in tests/e2e (*.spec.js) are never picked up here.
//
// Run with `npm run test:unit`. Wired into the pre-push hook so the money math
// can't silently regress.
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['frontend/static/js/src/**/*.test.ts'],
    },
});
