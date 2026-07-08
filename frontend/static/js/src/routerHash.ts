// routerHash.ts — pure hash <-> route serialization for the SPA router.
//
// Split out of router.ts (which has module-load side effects — it wires
// window.onhashchange) so these two pure functions can be unit-tested in
// isolation without dragging in React, page chunks, or the DOM.
//
// F3-I3: the hash used to be just the bare page name, and a foreign
// profile's userId lived only in-memory (navigate()'s params). That id was
// lost on refresh / Back-Forward — the deep link `#profile/<id>` couldn't
// survive. These helpers serialize the userId INTO the hash and parse it
// back out so the deep link is durable.

import { PAGES, type PageName } from './constants.js';

/** Build the `location.hash` value (no leading '#') for a nav target. Only
 *  the profile route carries a sub-segment today — a foreign profile is
 *  `profile/<userId>`; your own profile (no userId) stays a bare `profile`.
 *  Every other page is just its own name. The userId is percent-encoded so
 *  a reserved char (`/`, `#`, …) can't corrupt the hash structure. */
export function hashForTarget(page: PageName, userId?: string | null): string {
    if (page === PAGES.PROFILE && userId) {
        return `${PAGES.PROFILE}/${encodeURIComponent(userId)}`;
    }
    return page;
}

/** Inverse of hashForTarget — parse a raw hash (no leading '#') into a known
 *  page + optional userId. Unknown page names narrow down to home so a
 *  hand-edited / shared URL (e.g. `#profle`) lands on a working route rather
 *  than a stuck container. Only `profile/<id>` yields a userId. */
export function parseHash(raw: string): { page: PageName; userId?: string } {
    const [base = '', ...rest] = raw.split('/');
    const known: readonly string[] = Object.values(PAGES);
    const page = (known.includes(base) ? base : PAGES.HOME) as PageName;
    if (page === PAGES.PROFILE && rest.length > 0 && rest[0]) {
        return { page, userId: decodeURIComponent(rest.join('/')) };
    }
    return { page };
}
