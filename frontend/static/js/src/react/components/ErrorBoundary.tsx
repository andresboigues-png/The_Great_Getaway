// react/components/ErrorBoundary.tsx — top-level React error boundary.
//
// Without this, a single component crash (a useEffect that throws, a
// `null.someProp` access in JSX, anything React's render-phase doesn't
// catch) tears down the entire React tree → blank-white app. The user
// sees nothing, blames the page, refreshes, hopes it works. Sentry
// captures the stack trace but the user-facing recovery is "panic +
// refresh." That's the wrong default.
//
// The boundary catches the error one level above the page mount and
// renders a friendly "something broke — refresh, or report it" card.
// It also reports to Sentry (if loaded) so we still get the breadcrumb
// + stack trace in the dashboard. The reset button forces a full
// `window.location.reload()` because at this point React's reconciler
// is in a bad state and a soft re-render won't recover.
//
// ErrorBoundary is a class component because React 19 still has no
// hook equivalent for `componentDidCatch` / `getDerivedStateFromError`
// — these are render-phase lifecycles that hooks can't model. The
// component itself is small + the only class in the codebase, so the
// stylistic inconsistency is worth the resilience.

import { Component, type ReactNode } from 'react';
import { Icon } from './Icon.js';

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Optional name shown in the error report — useful when
     *  multiple boundaries cover different parts of the tree. */
    surface?: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
    /** Stored so the user-facing error card can show a short hint
     *  about what failed. We DON'T show the full stack to the user
     *  (it's noise to non-devs); just the error name + message. */
    error: Error | null;
}

interface SentryGlobal {
    captureException?: (e: unknown, opts?: { tags?: Record<string, string> }) => void;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        // Render-phase: flip into the error UI on the NEXT render.
        // Doesn't run side-effects (logging) — that's componentDidCatch.
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: { componentStack: string | null }): void {
        // Sentry capture — guarded so a Sentry-blocked / not-yet-loaded
        // session doesn't double-fault here. The optional `surface`
        // prop tags the report so we can tell which boundary fired
        // (currently only one, but the prop is forward-looking).
        const sentry = (window as unknown as { Sentry?: SentryGlobal }).Sentry;
        if (typeof sentry?.captureException === 'function') {
            try {
                sentry.captureException(error, {
                    tags: {
                        boundary: this.props.surface ?? 'app-root',
                        // componentStack truncated — full stacks are
                        // long and Sentry has its own truncation.
                        stack_preview: (info.componentStack || '').slice(0, 200),
                    },
                });
            } catch (_) { /* sentry SDK can throw — never let that escalate */ }
        }
        // Console for the dev / friend who hits "report a bug" — they
        // can paste this stack into the issue.
        // eslint-disable-next-line no-console
        console.error(`[ErrorBoundary:${this.props.surface ?? 'app-root'}]`, error, info.componentStack);
    }

    handleReload = (): void => {
        // Hard reload — React's reconciler is in an inconsistent state
        // after the error, so a soft setState({hasError:false}) often
        // re-throws on the next render. A real reload guarantees a
        // clean tree.
        window.location.reload();
    };

    handleHome = (): void => {
        // Soft escape — go to home and reload there. For users who
        // landed on a broken deep-link page, this gets them back to
        // a known-good surface.
        window.location.hash = 'home';
        window.location.reload();
    };

    render(): ReactNode {
        if (!this.state.hasError) return this.props.children;
        const errName = this.state.error?.name || 'Error';
        const errMsg = this.state.error?.message || 'Something unexpected happened.';
        return (
            <div
                role="alert"
                className="max-w-[520px] my-16 mx-auto py-8 px-7 bg-white border border-[rgba(0,_45,_91,_0.12)] rounded-[24px] shadow-[0_12px_36px_rgba(0,_45,_91,_0.08)] text-center font-sans"
            >
                <div className="mb-3 text-brand-navy" aria-hidden="true">
                    <Icon name="lifebuoy" size={48} />
                </div>
                <h2
                    className="mt-0 mx-0 mb-2 text-[1.4rem] font-extrabold text-brand-navy tracking-[-0.02em]"
                >
                    Something broke on this page
                </h2>
                <p
                    className="mt-0 mx-0 mb-1 text-secondary text-[0.92rem] leading-[1.5]"
                >
                    Don&rsquo;t worry — your trips are safe. The app hit an error it couldn&rsquo;t
                    recover from.
                </p>
                <p
                    className="mt-3 mx-0 mb-0 py-2.5 px-3.5 bg-[rgba(255,_59,_48,_0.06)] rounded-[10px] text-[0.78rem] text-[#a82424] font-mono text-left break-word"
                >
                    <strong>{errName}:</strong> {errMsg}
                </p>
                <div
                    className="mt-6 flex gap-2.5 justify-center flex-wrap"
                >
                    <button
                        type="button"
                        onClick={this.handleReload}
                        className="py-2.5 px-5 rounded-full border-0 bg-accent-blue text-white font-bold text-[0.88rem] cursor-pointer"
                    >
                        Reload page
                    </button>
                    <button
                        type="button"
                        onClick={this.handleHome}
                        className="py-2.5 px-5 rounded-full border-[1.5px] border-[rgba(0,_45,_91,_0.16)] bg-white text-brand-navy font-bold text-[0.88rem] cursor-pointer"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }
}
