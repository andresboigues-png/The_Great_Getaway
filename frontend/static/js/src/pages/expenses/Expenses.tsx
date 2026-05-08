// pages/expenses/Expenses.tsx — Phase C3 wave 2 leaf migration.
//
// Expenses is the most imperative page in the app — three tabs with
// substantial inline event wiring (form-row interactions, batch
// upload preview, history filters). Rather than rewrite ~600 lines
// of mountTab + tab-internal handlers into JSX in one shot, we use
// the *thinnest-possible* React wrapper: the React component owns
// the mount slot and the lifecycle (so React's reactMount unmount
// runs cleanly when navigating away), and the legacy
// `renderExpenses()` function is called once on mount; its returned
// HTMLElement is appended to the React-managed div.
//
// Why this is still a meaningful migration:
//   - The page is now in the React tree (no more direct
//     `pageEl = renderExpenses()` append in router.ts).
//   - clearReactMount() runs on navigate, so any future React-only
//     pieces inside expenses get their effect cleanups.
//   - The architecture is ready for incremental conversion: future
//     work can swap the imperative renderExpenses for JSX section by
//     section without re-routing.
//
// The legacy code re-renders itself on mutations via navigate('expenses'),
// which now goes through mountReact → unmount → mount of this
// component. So this wrapper appears intentionally simple — that's
// the point.

import { useEffect, useRef } from 'react';
import { renderExpenses } from '../expenses.js';

export function Expenses() {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const host = ref.current;
        if (!host) return;
        // Single legacy render per mount. Mutations + tab switches
        // navigate('expenses') which triggers a full re-mount via the
        // router's clearReactMount() + mountExpenses() pair.
        host.innerHTML = '';
        host.appendChild(renderExpenses());
    }, []);

    return <div ref={ref} />;
}
