// Precisely emulate the api.ts pullFromServer cursor/full-pull control flow
// to measure the worst-case window during which a newly-visible trip is
// invisible. Mirrors frontend/static/js/src/api.ts lines 122-141 + 367-371.

const PULLS_BEFORE_FULL = 20;

// Worst case: the trip becomes visible to U at poll N, RIGHT AFTER U's most
// recent FULL pull. So _pullsSinceFull was just reset to 0 at that full pull.
// Every subsequent poll is a `?since=` delta that omits the old rows
// (proven by sync_repro2.py). The trip stays invisible until _pullsSinceFull
// hits 20 → a full pull.

let _expenseCursor = 12345;   // non-null after boot (never reset w/o reload)
let _pullsSinceFull = 0;       // just did a full pull

// Trip becomes visible NOW (between this full pull and the next poll).
let pollsUntilVisible = 0;
for (let poll = 1; poll <= 100; poll++) {
  _pullsSinceFull += 1;
  const _forceFull = _expenseCursor === null || _pullsSinceFull >= PULLS_BEFORE_FULL;
  if (_forceFull) _pullsSinceFull = 0;
  // a `?since=` delta omits the trip's pre-cursor rows → still invisible
  // a full pull delivers them → visible
  if (_forceFull) { pollsUntilVisible = poll; break; }
}

const cadenceSec = 15;
console.log(`Worst-case polls until full pull heals it: ${pollsUntilVisible}`);
console.log(`At ${cadenceSec}s poll cadence => ${pollsUntilVisible * cadenceSec}s = ${(pollsUntilVisible*cadenceSec/60).toFixed(1)} min`);
console.log(`(Best case: trip becomes visible right before a scheduled full pull => ~1 poll = 15s)`);
console.log(`Note: cursor is module-level and only resets to null on FULL PAGE RELOAD,`);
console.log(`so navigating within the SPA does NOT trigger an early full pull.`);
