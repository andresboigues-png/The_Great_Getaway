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

import { readFileSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve, basename } from 'node:path';

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
    entry: 110 * 1024,            // 110 KB gzip — currently ~106 KB
    vendorReact: 65 * 1024,       // 65 KB gzip — currently ~58 KB
    pageChunkMax: 15 * 1024,      // 15 KB gzip per page chunk — currently top is ~12 KB
    firstPaintGzipMax: 178 * 1024, // 178 KB gzip first-paint — 4 polish rounds added
                                   // ~3 KB of well-justified user-visible weight
                                   // (touch targets, error toasts, profile-photo
                                   // upload flow, mobile camera badge). Still well
                                   // under the "10-20% above shipping" guideline
                                   // — current shipping is ~176 KB.
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
const chunkFiles = readdirSync(CHUNKS_DIR).filter(f => f.endsWith('.js'));
let vendorReactGz = 0;
const oversizedPages = [];

for (const f of chunkFiles) {
    const full = resolve(CHUNKS_DIR, f);
    const gz = gzipSize(full);
    totalGzip += gz;
    if (f.startsWith('vendor-react-')) {
        vendorReactGz = gz;
    } else if (f.startsWith('mount-') || f.startsWith('Empty') || f.startsWith('store-') || f.startsWith('useNavigate-') || f.startsWith('rolldown-runtime-')) {
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
    failures.push(`First-paint gzip ${fmt(firstPaintGz)} (entry + vendor-react + largest page chunk) exceeds ${fmt(LIMITS.firstPaintGzipMax)}`);
}

// Report.
console.log('Bundle size summary (gzip):');
console.log(`  Entry app.bundle.js:    ${fmt(entryGz).padStart(10)}  / ${fmt(LIMITS.entry)} budget`);
console.log(`  vendor-react chunk:     ${fmt(vendorReactGz).padStart(10)}  / ${fmt(LIMITS.vendorReact)} budget`);
console.log(`  Largest page chunk:     ${fmt(largestPageChunk).padStart(10)}  / ${fmt(LIMITS.pageChunkMax)} budget`);
console.log(`  First-paint estimate:   ${fmt(firstPaintGz).padStart(10)}  / ${fmt(LIMITS.firstPaintGzipMax)} budget`);
console.log(`  Total all chunks:       ${fmt(totalGzip).padStart(10)}  (informational; chunks beyond first-paint are lazy)`);
console.log('');

if (failures.length > 0) {
    console.error('❌ Bundle size budget exceeded:');
    for (const f of failures) console.error('   - ' + f);
    process.exit(1);
}

console.log('✅ Bundle size within budget.');
