/// <reference types="google.maps" />
// ^ MK1: pull in @types/google.maps (devDep) so the `google.maps.*`
// namespace resolves project-wide as REAL types instead of the former
// hand-rolled all-`any` stub (~767 unchecked member accesses). An
// explicit reference — not auto-inclusion — because `include` scopes
// the program to frontend/src and the ambient namespace must be forced
// into global scope from here (this file is already the project's
// ambient-script anchor). The runtime global still arrives via the
// Maps <script>; @types/google.maps is type-only, nothing is bundled.

// Ambient global declarations.
//
// This file is INTENTIONALLY a "script" (no top-level `import` or
// `export`). That's how `declare module '*.css'` becomes a global
// declaration TypeScript applies across the project. If we put it in
// types.d.ts (which has `export interface ...`), TS treats that file
// as a module and the `declare module` inside no longer affects
// other files.

// Side-effect CSS imports — Vite handles these at build time. Each page
// module that does `import './foo.css'` gets that CSS chunked alongside
// its JS chunk. TypeScript needs the wildcard declaration to accept the
// import; otherwise it errors with TS2882.
//
// First slice landed with pages/settings/settings.css
// (FIXING_ROADMAP §3.1 CSS split, 2026-05-16). Future per-page CSS
// splits use the same declaration; no edits to this file needed.
declare module '*.css';
