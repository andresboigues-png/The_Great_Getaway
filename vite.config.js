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

export default defineConfig({
    plugins: [
        react({
            // Automatic JSX runtime so .tsx files don't need an
            // explicit `import React`. Matches @types/react v19's
            // expectation + tsconfig "jsx": "react-jsx".
            jsxRuntime: 'automatic',
        }),
    ],
    build: {
        rollupOptions: {
            input: path.resolve(__dirname, 'frontend/static/js/src/main.ts'),
            output: {
                dir: path.resolve(__dirname, 'frontend/static/js'),
                entryFileNames: 'app.bundle.js',
                format: 'iife', // Single self-executing file — no imports needed in browser
                inlineDynamicImports: true,
            },
        },
        outDir: path.resolve(__dirname, 'frontend/static/js'),
        emptyOutDir: false, // Don't wipe the whole js/ folder
        sourcemap: true,
    },
});
