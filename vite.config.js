import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    build: {
        rollupOptions: {
            input: path.resolve(__dirname, 'frontend/static/js/src/main.js'),
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
