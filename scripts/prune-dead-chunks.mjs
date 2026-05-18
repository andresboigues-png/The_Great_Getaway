#!/usr/bin/env node
// scripts/prune-dead-chunks.mjs
//
// Remove orphaned files under frontend/static/js/chunks/ and
// frontend/static/js/assets/ — code-split artifacts from previous
// builds that the current app.bundle.js no longer reaches.
//
// Vite is configured with `emptyOutDir: false` (see vite.config.js)
// because the entry bundle, page chunks, and CSS assets all share
// the same `frontend/static/js/` tree alongside source files. That
// flag protects the source tree but also means dead chunks
// accumulate every build. Over time they bloat the repo and the
// deploy payload (PA pulls them on `git pull`).
//
// This script computes the transitive closure of files reachable
// from `app.bundle.js`, then deletes everything else under
// chunks/ and assets/. Source maps (`*.js.map`, `*.css.map`) follow
// their parent — kept iff the parent is live, deleted iff orphan.
//
// Dry-run by default. Pass `--apply` to actually delete.
//
// Usage:
//   node scripts/prune-dead-chunks.mjs           # list what would go
//   node scripts/prune-dead-chunks.mjs --apply   # actually remove
//
// Audit 2026-05-18 LOW-tier hygiene item.

import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = join(ROOT, 'frontend', 'static', 'js');
const CHUNKS_DIR = join(JS_DIR, 'chunks');
const ASSETS_DIR = join(JS_DIR, 'assets');
const ENTRY = 'app.bundle.js';

const APPLY = process.argv.includes('--apply');

// Match a reference to chunks/foo-X.js, assets/foo-X.css, or
// ./foo-X.js (relative import between chunks).
const REF_RE = /(?:chunks\/|assets\/|\.\/)([A-Za-z][A-Za-z0-9_.-]+\.(?:js|css))/g;

function readSafe(path) {
    try {
        return readFileSync(path, 'utf-8');
    } catch {
        return '';
    }
}

function resolveFile(name) {
    // Try the entry's own dir first (app.bundle.js sits at JS_DIR root),
    // then chunks/, then assets/.
    for (const dir of [JS_DIR, CHUNKS_DIR, ASSETS_DIR]) {
        const p = join(dir, name);
        try {
            statSync(p);
            return p;
        } catch {
            // continue
        }
    }
    return null;
}

// Transitive closure from the entry.
const live = new Set([ENTRY]);
const queue = [ENTRY];
while (queue.length) {
    const name = queue.pop();
    const path = resolveFile(name);
    if (!path) continue;
    const content = readSafe(path);
    for (const match of content.matchAll(REF_RE)) {
        const ref = match[1];
        if (!live.has(ref)) {
            live.add(ref);
            queue.push(ref);
        }
    }
}

// Enumerate everything under chunks/ and assets/.
function listDir(dir) {
    try {
        return readdirSync(dir);
    } catch {
        return [];
    }
}

const dead = [];
for (const dir of [CHUNKS_DIR, ASSETS_DIR]) {
    for (const file of listDir(dir)) {
        // Source maps tag along with their parent's life status.
        const parent = file.endsWith('.map') ? file.slice(0, -4) : file;
        if (!live.has(parent)) {
            dead.push(join(dir, file));
        }
    }
}

dead.sort();
console.log(`Live (transitive from ${ENTRY}): ${live.size}`);
console.log(`Dead (orphaned chunks/assets): ${dead.length}`);
if (!dead.length) {
    console.log('Nothing to do.');
    process.exit(0);
}
for (const path of dead) {
    console.log(`  ${APPLY ? 'DELETE' : 'would delete'}  ${relative(ROOT, path)}`);
    if (APPLY) {
        try {
            unlinkSync(path);
        } catch (e) {
            console.error(`    failed: ${e.message}`);
        }
    }
}
if (!APPLY) {
    console.log('\nRun with --apply to actually remove these files.');
}
