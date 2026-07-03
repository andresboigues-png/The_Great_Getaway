"""Entity write services — the SINGLE implementation each write path calls.

MK1 Wave B (T1-1, `Best-in-class audit MK1.md` ARCH-1): every entity used
to have its upsert logic copy-pasted across the per-row route AND one or
two /api/sync bulk loops (expenses ×3, trips ×3, days ×2). Six audit
campaigns showed the same failure over and over: a validation / authz /
euro-freeze rule fixed on one path shipped weeks later — or never — on
its siblings (MM-1/MM-5, R2 IDOR gates, R3-Fix #11, R10-B6a, BUG-37,
MK6 tombstones…; data.py carried 31 "mirror the sibling" comments).

Each module here exposes `apply_<entity>_upsert(cursor, user_id, payload,
…, policy)` returning an `UpsertResult`. The documented BEHAVIORAL
differences between paths (strict 400/403/409 vs the bulk silent-skip
contract, splits strictness, the archived-trip write gate, concurrency
handling) are encoded in a frozen policy object per path — so a NEW rule
lands in exactly one place and every path inherits it, with the policy
diff spelling out precisely how the paths are allowed to differ.
"""
