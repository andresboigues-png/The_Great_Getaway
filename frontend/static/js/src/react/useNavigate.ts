// react/useNavigate.ts — React adapter for the legacy router.
//
// The existing router.ts owns hashchange handling, route param parsing,
// scroll-restoration, and the page-render switch. Phase C uses the
// strangler pattern — both worlds coexist — so React components reach
// the router through this thin adapter rather than re-implementing
// any of it.
//
// API: `const navigate = useNavigate();` returns the same `navigate`
// function the rest of the app uses. Wrapped as a hook so future
// migrations to React Router or TanStack Router (per ROADMAP C1)
// only need to change THIS file, not every call site.

import { useCallback } from 'react';
import { navigate as legacyNavigate, type NavigateParams } from '../router.js';
import type { PageName } from '../constants.js';

export type NavigateFn = (
    page: PageName,
    params?: NavigateParams | null,
    preserveScroll?: boolean,
) => void;

/** Returns a stable reference to the legacy navigate function. The
 *  returned identity is preserved across renders so child components
 *  taking it as a prop don't re-render unnecessarily. */
export function useNavigate(): NavigateFn {
    return useCallback(
        (page, params = null, preserveScroll = false) =>
            legacyNavigate(page, params, preserveScroll),
        [],
    );
}
