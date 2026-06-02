// ESLint flat config — modern format (ESLint 9+).
// Lints frontend/static/js/src/** only; the vite-bundled output and one-off
// data files are ignored.

import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
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

    // Must be last: turns off any eslint rules that conflict with prettier.
    prettier,
];
