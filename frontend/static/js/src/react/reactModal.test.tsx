// MK1 Wave M — contract tests for the openReactModal bridge, the
// template every migrated modal rides on. What must stay true:
//
//   1. React content renders inside showModal's card (so cardClass /
//      cardStyle keep applying) and is interactive.
//   2. `close` handed to render() dismisses: overlay leaves the DOM,
//      onClose fires, and the React tree unmounts (deferred — effect
//      cleanups must run).
//   3. Modal.ts plumbing still owns dismissal: Escape and backdrop
//      click close the React modal exactly like an imperative one.
//   4. React-owned initial focus survives showModal's autofocus
//      microtask (the Modal.ts focus-steal guard this wave added).
//   5. A crashing component degrades to the ErrorBoundary card, not a
//      frozen overlay.
//
// Same jsdom + React `act` setup as react/store.test.ts — no extra
// test libraries.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect, useState } from 'react';
import { openReactModal } from './reactModal.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const overlay = () => document.querySelector('.modal-overlay') as HTMLElement | null;

/** Flush the bridge's deferred (setTimeout 0) unmount. The braces keep
 *  the callback void — act's void overload returns void (nothing to
 *  await), while a value-returning callback flips it to a Thenable the
 *  no-floating-promises rule then (rightly) flags. */
const flushUnmount = () => {
    act(() => {
        vi.runOnlyPendingTimers();
    });
};

afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.modal-overlay').forEach((el) => el.remove());
    document.body.innerHTML = '';
});

function Counter({ close }: { close: () => void }) {
    const [n, setN] = useState(0);
    return createElement(
        'div',
        null,
        createElement('span', { id: 'count' }, String(n)),
        createElement('button', { id: 'inc', onClick: () => setN(n + 1) }, '+'),
        createElement('button', { id: 'done', onClick: close }, 'done'),
    );
}

describe('openReactModal', () => {
    it('renders interactive React content inside the modal card', () => {
        act(() => {
            openReactModal({
                ariaLabel: 'Counter',
                cardStyle: 'width: 100px;',
                render: (close) => createElement(Counter, { close }),
            });
        });
        const card = overlay()?.firstElementChild as HTMLElement;
        expect(card.getAttribute('role')).toBe('dialog');
        expect(card.getAttribute('aria-label')).toBe('Counter');
        expect(card.getAttribute('style')).toContain('width: 100px');
        expect(card.querySelector('#count')?.textContent).toBe('0');
        act(() => {
            (card.querySelector('#inc') as HTMLButtonElement).click();
        });
        expect(card.querySelector('#count')?.textContent).toBe('1');
    });

    it('close from inside the tree removes the overlay, fires onClose, and unmounts (effect cleanups run)', () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        const cleanup = vi.fn();
        function WithCleanup({ close }: { close: () => void }) {
            useEffect(() => cleanup, []);
            return createElement('button', { id: 'done', onClick: close }, 'done');
        }
        act(() => {
            openReactModal({
                ariaLabel: 'x',
                onClose,
                render: (close) => createElement(WithCleanup, { close }),
            });
        });
        act(() => {
            (document.querySelector('#done') as HTMLButtonElement).click();
        });
        expect(overlay()).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(cleanup).not.toHaveBeenCalled(); // unmount is deferred…
        flushUnmount();
        expect(cleanup).toHaveBeenCalledTimes(1); // …but must happen.
    });

    it('Escape and backdrop click still close (Modal.ts owns dismissal)', () => {
        act(() => {
            openReactModal({ ariaLabel: 'x', render: () => createElement('p', null, 'hi') });
        });
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(overlay()).toBeNull();

        act(() => {
            openReactModal({ ariaLabel: 'y', render: () => createElement('p', null, 'again') });
        });
        act(() => {
            overlay()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(overlay()).toBeNull();
    });

    it("React autoFocus wins over showModal's microtask focus", async () => {
        act(() => {
            openReactModal({
                ariaLabel: 'x',
                render: () =>
                    createElement(
                        'div',
                        null,
                        createElement('button', { id: 'first' }, 'first focusable'),
                        createElement('input', { id: 'wanted', autoFocus: true }),
                    ),
            });
        });
        // flushSync committed synchronously → React focused #wanted. Let
        // showModal's queueMicrotask run; the focus-steal guard must see
        // focus already inside the overlay and leave it alone.
        await act(async () => {
            await Promise.resolve();
        });
        expect((document.activeElement as HTMLElement | null)?.id).toBe('wanted');
    });

    it('a crashing component renders the ErrorBoundary card, not a dead overlay', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        function Bomb(): never {
            throw new Error('boom');
        }
        act(() => {
            openReactModal({ ariaLabel: 'x', render: () => createElement(Bomb) });
        });
        const card = overlay()?.firstElementChild as HTMLElement;
        // The boundary's friendly card renders (with its recovery
        // affordances) instead of a blank overlay whose focus trap has
        // nothing to trap. It deliberately includes the error message —
        // that's ErrorBoundary's documented bug-report design.
        expect(card.textContent).toContain('Something broke');
        expect(card.textContent).toContain('Reload page');
        spy.mockRestore();
    });
});
