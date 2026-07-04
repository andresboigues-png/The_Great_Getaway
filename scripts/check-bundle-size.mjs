#!/usr/bin/env node
// scripts/check-bundle-size.mjs — D5 bundle-size CI gate.
//
// Walks the build output and asserts:
//   1. The entry chunk (app.bundle.js) gzips at or below ENTRY_GZIP_LIMIT.
//   2. The vendor-react chunk gzips at or below VENDOR_REACT_GZIP_LIMIT.
//   3. No individual page chunk gzips above PAGE_CHUNK_GZIP_LIMIT.
//   4. The total of all built JS gzips at or below TOTAL_GZIP_LIMIT.
//
// Limits are conservative — set 10-20% above the current shipping
// numbers so a one-off feature add doesn't immediately blow the gate,
// but a meaningful regression (a new dep, a fat unused-import sweep)
// trips it. When the budget tightens (e.g. via a future refactor or a
// dependency audit), tighten the limits too.
//
// Run via `npm run check:bundle-size` (after `npm run build`). CI
// chains: `npm run build && npm run check:bundle-size`.

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const JS_DIR = resolve(ROOT, 'frontend/static/js');
const CHUNKS_DIR = resolve(JS_DIR, 'chunks');

// Budgets in bytes (gzip). Adjust sparingly; bumping these is a
// signal that something heavy slipped in — confirm intentionally
// before raising. The headline budget is `firstPaintGzipMax`: what a
// fresh user actually downloads to render the home route on first
// load (entry + vendor-react + the home chunk + shared infra). The
// total of all built JS is incidental — chunks beyond first-paint
// load lazily on navigation and don't affect time-to-interactive on
// first visit.
const LIMITS = {
    // MK1 Wave F ratchet: the PERF-4 barrel fix (modal openers now
    // dynamic-import at click time) dropped the entry 111→81.5 KB and
    // first-paint 207→177 KB — the caps come DOWN with it, restoring
    // the original 184 KB first-paint budget and an 88 KB entry cap.
    entry: 88 * 1024, // 88 KB gzip — currently ~81.5 KB
    vendorReact: 65 * 1024, // 65 KB gzip — currently ~58 KB
    // MK1 Wave A re-baseline: the 15 KB page-chunk cap + 184 KB
    // first-paint cap had been failing SILENTLY for weeks — the CI
    // pytest job was dead (targeted a deleted file) so the whole run
    // was ambient-red and nobody saw this job fail with it. Reality
    // today: home mount chunk 37.5 KB gzip (it absorbed Trip Hub, day
    // accommodation, and the unified home search), first-paint
    // 206.5 KB. Caps re-set just above the real numbers so the gate
    // BITES again; Wave C (Best-in-class audit MK1.md T2-6/PERF-4:
    // barrel-import trimming + deferred CDN scripts) should ratchet
    // both back down — tighten these when it lands.
    pageChunkMax: 40 * 1024, // 40 KB gzip per page chunk — top (home) is ~37.5 KB
    firstPaintGzipMax: 184 * 1024, // 184 KB gzip first-paint — currently ~177 KB.
    // i18n session 4 sweep across collections /
    // ai / todo / search / insights / budgets /
    // settlement added ~3 KB of t() call sites
    // + the en.ts source-of-truth growth (every
    // new key ships its English copy in the
    // entry chunk, even though pt/es/fr load
    // lazily). Adding a 5th locale (if we ever
    // expand beyond EN/PT/ES/FR) costs ~0 KB at
    // first-paint thanks to the lazy-load
    // refactor in session 2 — only en.ts growth
    // moves this number.
};

function gzipSize(filePath) {
    return gzipSync(readFileSync(filePath)).byteLength;
}

function fmt(bytes) {
    return (bytes / 1024).toFixed(2) + ' KB';
}

const failures = [];
let totalGzip = 0;
let largestPageChunk = 0;

// 1. Entry chunk.
const entryPath = resolve(JS_DIR, 'app.bundle.js');
const entryGz = gzipSize(entryPath);
totalGzip += entryGz;
if (entryGz > LIMITS.entry) {
    failures.push(`Entry app.bundle.js gzip ${fmt(entryGz)} exceeds ${fmt(LIMITS.entry)}`);
}

// 2 + 3. Walk chunks.
const chunkFiles = readdirSync(CHUNKS_DIR).filter((f) => f.endsWith('.js'));
let vendorReactGz = 0;
const oversizedPages = [];

for (const f of chunkFiles) {
    const full = resolve(CHUNKS_DIR, f);
    const gz = gzipSize(full);
    totalGzip += gz;
    if (f.startsWith('vendor-react-')) {
        vendorReactGz = gz;
    } else if (
        f.startsWith('mount-') ||
        f.startsWith('Empty') ||
        f.startsWith('store-') ||
        f.startsWith('useNavigate-') ||
        f.startsWith('rolldown-runtime-')
    ) {
        // Per-page or shared infra chunk.
        if (gz > largestPageChunk) largestPageChunk = gz;
        if (gz > LIMITS.pageChunkMax) {
            oversizedPages.push({ file: f, size: gz });
        }
    }
}

if (vendorReactGz > LIMITS.vendorReact) {
    failures.push(`vendor-react gzip ${fmt(vendorReactGz)} exceeds ${fmt(LIMITS.vendorReact)}`);
}

if (oversizedPages.length > 0) {
    for (const o of oversizedPages) {
        failures.push(`Page chunk ${o.file} gzip ${fmt(o.size)} exceeds ${fmt(LIMITS.pageChunkMax)}`);
    }
}

// 4. First-paint estimate: entry + vendor-react + the largest single
// page chunk (a worst-case "user lands directly on the heaviest
// route"). This is the actually-downloaded payload on a cold visit.
const firstPaintGz = entryGz + vendorReactGz + largestPageChunk;
if (firstPaintGz > LIMITS.firstPaintGzipMax) {
    failures.push(
        `First-paint gzip ${fmt(firstPaintGz)} (entry + vendor-react + largest page chunk) exceeds ${fmt(LIMITS.firstPaintGzipMax)}`
    );
}

// Report.
console.log('Bundle size summary (gzip):');
console.log(`  Entry app.bundle.js:    ${fmt(entryGz).padStart(10)}  / ${fmt(LIMITS.entry)} budget`);
console.log(`  vendor-react chunk:     ${fmt(vendorReactGz).padStart(10)}  / ${fmt(LIMITS.vendorReact)} budget`);
console.log(`  Largest page chunk:     ${fmt(largestPageChunk).padStart(10)}  / ${fmt(LIMITS.pageChunkMax)} budget`);
console.log(`  First-paint estimate:   ${fmt(firstPaintGz).padStart(10)}  / ${fmt(LIMITS.firstPaintGzipMax)} budget`);
console.log(
    `  Total all chunks:       ${fmt(totalGzip).padStart(10)}  (informational; chunks beyond first-paint are lazy)`
);
console.log('');

if (failures.length > 0) {
    console.error('❌ Bundle size budget exceeded:');
    for (const f of failures) console.error('   - ' + f);
    process.exit(1);
}

console.log('✅ Bundle size within budget.');
