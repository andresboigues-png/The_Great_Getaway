// Unit tests for the honest-save policy predicate (Audit MK5 cluster #1).
//
// `isUnretryableRejection` is the single decision the four formerly-dishonest
// write flows (trip create / delete, budget create, member invite) now share:
// given an api result envelope, should the caller SURFACE an error + roll the
// optimistic UI back, or let it stand? Getting this wrong reintroduces either
// the "fake success then the row vanishes" bug (false negative) or rips out
// work that's about to land via the offline outbox (false positive on a network
// blip). Pin every branch.
import { describe, it, expect } from 'vitest';
import { isUnretryableRejection } from './honestSave.js';
import type { ApiJsonResult } from './core.js';

const envelope = (ok: boolean, status: number): ApiJsonResult => ({ ok, status, body: null });

describe('isUnretryableRejection — honest-save policy (Audit MK5 #1)', () => {
    it('is false for a successful write (nothing to surface)', () => {
        expect(isUnretryableRejection(envelope(true, 200))).toBe(false);
        expect(isUnretryableRejection(envelope(true, 201))).toBe(false);
    });

    it('is false for null/undefined (the !STATE.user early return)', () => {
        expect(isUnretryableRejection(null)).toBe(false);
        expect(isUnretryableRejection(undefined)).toBe(false);
    });

    it('is false for a network failure (status 0 — already queued in the outbox)', () => {
        // apiFetch catches the network error, enqueues the mutation for retry,
        // and the envelope helpers report status 0. The optimistic row must
        // stand so the retry can land — ripping it out here would lose work.
        expect(isUnretryableRejection(envelope(false, 0))).toBe(false);
    });

    it('is false for 401 (apiFetch already tore down the session + redirected)', () => {
        expect(isUnretryableRejection(envelope(false, 401))).toBe(false);
    });

    it('is true for server rejections that must surface + roll back', () => {
        expect(isUnretryableRejection(envelope(false, 400))).toBe(true); // bad request
        expect(isUnretryableRejection(envelope(false, 403))).toBe(true); // forbidden (ownership lost)
        expect(isUnretryableRejection(envelope(false, 404))).toBe(true); // blocked/unknown invite target
        expect(isUnretryableRejection(envelope(false, 409))).toBe(true); // dup-scope budget / role conflict
        expect(isUnretryableRejection(envelope(false, 429))).toBe(true); // daily new-trip cap
        expect(isUnretryableRejection(envelope(false, 500))).toBe(true); // server error
    });
});
