// ESLint flat config — modern format (ESLint 9+).
// Lints frontend/static/js/src/** only; the vite-bundled output and one-off
// data files are ignored.
//
// TypeScript: the `.ts`/`.tsx` block below adds type-aware linting via
// typescript-eslint. It is intentionally SCOPED, not the full
// recommendedTypeChecked preset: the base `recommended` rules (low noise) plus
// the three type-aware bug-catchers that `tsc` genuinely cannot do
// (no-floating-promises / no-misused-promises / await-thenable). `no-explicit-any`
// stays a WARN so the ~200 existing anys surface as a worklist (the domain-model
// typing effort) without blocking. Type-aware lint is slower (it builds the TS
// program), so it runs at PRE-PUSH (`npm run lint`), not per-file at pre-commit.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: [
            'node_modules/**',
            'frontend/static/js/app.bundle.js',
            'frontend/static/js/app.bundle.js.map',
            // Vite-bundled output: content-hashed JS chunks + extracted CSS.
            // Generated, not authored — linting it produces only noise.
            'frontend/static/js/chunks/**',
            'frontend/static/js/assets/**',
            'facts_dict.js',
            'scratch/**',
            'tests/**',
            'src/**',
            '.claude/**',
            '.venv/**',
        ],
    },

    js.configs.recommended,

    // Node-side files (build config, scripts, playwright config) get Node globals.
    {
        files: ['vite.config.js', 'eslint.config.js', 'playwright.config.js', 'scripts/**/*.js', 'scripts/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node },
        },
    },

    // Playwright e2e tests run in Node + use the test runner's globals.
    {
        files: ['tests/e2e/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
        },
    },

    // The service worker runs in its own global scope (self, not window).
    {
        files: ['frontend/static/sw.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'script',
            globals: { ...globals.serviceworker },
        },
        rules: {
            // The unused `event` arg on install/activate is conventional;
            // it documents the listener signature.
            'no-unused-vars': ['warn', { args: 'none' }],
            // SW startup log is intentional debug aid.
            'no-console': 'off',
        },
    },

    {
        files: ['frontend/static/js/src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Third-party libs loaded via <script> tags in index.html
                google: 'readonly', // Google Maps + Identity SDK
                Chart: 'readonly', // chart.js
                XLSX: 'readonly', // sheetjs
            },
        },
        rules: {
            // Real-bug catchers
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'warn',
            'no-implicit-globals': 'error',
            'no-throw-literal': 'error',
            'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],

            // Tone down noise on a codebase that's never been linted
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrors: 'none', // empty catch (e) {} is everywhere; not worth fixing first
                },
            ],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-prototype-builtins': 'off',
            'no-inner-declarations': 'off',

            // console.error/warn are intentional; console.log is debug noise
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },

    // TypeScript source — type-aware lint (scoped; see header note). Runs at
    // pre-push, not pre-commit, because building the TS program is slow.
    {
        files: ['frontend/static/js/src/**/*.{ts,tsx}'],
        extends: [tseslint.configs.recommended],
        plugins: { 'react-hooks': reactHooks },
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            parserOptions: {
                // projectService auto-discovers the nearest tsconfig.json so the
                // type-aware rules below have type info.
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
            globals: {
                ...globals.browser,
                google: 'readonly', // Google Maps + Identity SDK
                Chart: 'readonly', // chart.js
                XLSX: 'readonly', // sheetjs
            },
        },
        rules: {
            // The reason for typed linting: catch unhandled async, which `tsc`
            // cannot. This app is fetch-heavy (rates, CPI, sync, saveState).
            // The ~144-site fire-and-forget worklist is cleared (every call
            // is `void`-marked or its handler wrapped), so these are now HARD
            // gates alongside await-thenable: a new unhandled async fails lint.
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',

            // React hooks. The codebase already carries exhaustive-deps disable
            // directives — the flat-config migration had silently dropped the
            // plugin. rules-of-hooks is a real-correctness gate; exhaustive-deps
            // is a warn worklist (lots of intentional manual dep arrays).
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // The domain-model typing effort cleared every `any` in src/**
            // (the ~200-any worklist is done). Now a HARD gate: a new bare
            // `any` fails lint. Genuine dynamic boundaries (the /api/data
            // shallow validator, Google Weather JSON, SheetJS rows) carry a
            // documented inline eslint-disable; external-SDK/CDN `any` stubs
            // live in .d.ts, which the override below exempts.
            '@typescript-eslint/no-explicit-any': 'error',
            // `!` is used deliberately (noUncheckedIndexedAccess makes it
            // ergonomic); @ts-ignore appears in a handful of spots — surface,
            // don't block.
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/ban-ts-comment': 'warn',
            // tsc's noUnusedLocals is the real gate; keep eslint's a warn so it
            // doesn't double-block, and honour the project's `_`-prefix opt-out.
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
            ],

            // Mirror the .js bug-catchers above.
            eqeqeq: ['error', 'always', { null: 'ignore' }],
            'no-var': 'error',
            'prefer-const': 'warn',
            'no-implicit-globals': 'error',
            'no-throw-literal': 'error',
            'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-prototype-builtins': 'off',
            'no-inner-declarations': 'off',
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },

    // Declaration files are the home for external-SDK / CDN type stubs
    // (the google.maps.* namespace, Chart, XLSX) which are intentionally `any` —
    // we don't model those APIs. Exempt .d.ts from no-explicit-any so the stubs
    // don't each report; real code references the typed alias names.
    {
        files: ['frontend/static/js/src/**/*.d.ts'],
        rules: { '@typescript-eslint/no-explicit-any': 'off' },
    },

    // Must be last: turns off any eslint rules that conflict with prettier.
    prettier
);
