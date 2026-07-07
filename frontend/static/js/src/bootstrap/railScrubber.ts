// bootstrap/railScrubber.ts — mobile "roulette" nav rail.
//
// On a phone the left nav rail is a SHORT 3-icon window and the nav icons
// form a vertical reel the user spins. Two ways to spin it:
//   • swipe the rail itself (native scroll-snap), or
//   • drag the translucent right-edge line (right-thumb reach) — its
//     position maps to the reel's scroll, so a left-rail spin and a
//     right-line spin do the same thing.
// Spinning only MOVES the selection (focus ring + haptic tick); it does NOT
// navigate on its own. Committing takes a deliberate TAP — either directly
// on the centred icon, or a simple tap on the right-edge line (which commits
// whatever's currently centred). This avoids the "scroll past and it jumps
// pages under you" surprise. It clamps at the ends (no wrap). Desktop
// (>720px) keeps the full static rail and never shows the line.
//
// The haptics + spin FEEL can only really be judged on a device; the
// structure (short window, spin → settle → navigate) is what's built here.

const HAPTIC_MS = 8;

function vibrate(): void {
    try {
        navigator.vibrate?.(HAPTIC_MS);
    } catch {
        /* vibration unsupported / blocked — silent no-op */
    }
}

export function initRailScrubber(): void {
    const rail = document.getElementById('sidebarRail');
    if (!rail) return;

    // Right-edge scrub line + thumb knob — the spinner for right-handed reach.
    const line = document.createElement('div');
    line.className = 'rail-scrubber';
    line.setAttribute('aria-hidden', 'true');
    const knob = document.createElement('div');
    knob.className = 'rail-scrubber__knob';
    line.appendChild(knob);
    document.body.appendChild(line);

    // Fixed "selection window" ring over the reel's centre slot — the picker
    // frame that makes it read as a spinnable wheel.
    const hub = document.createElement('div');
    hub.className = 'rail-hub';
    hub.setAttribute('aria-hidden', 'true');
    document.body.appendChild(hub);

    const mq = window.matchMedia('(max-width: 720px)');
    const items = (): HTMLElement[] =>
        Array.from(rail.querySelectorAll<HTMLElement>('.sidebar-rail__item'));

    // Reel behaviour is mobile-only AND only while the rail island is open.
    const isReel = (): boolean => mq.matches && rail.classList.contains('is-open');

    /** Index of the item whose centre is nearest the rail window's centre. */
    const centeredIndex = (): number => {
        const its = items();
        const rr = rail.getBoundingClientRect();
        const cy = rr.top + rr.height / 2;
        let best = 0;
        let bestD = Infinity;
        its.forEach((it, i) => {
            const r = it.getBoundingClientRect();
            const d = Math.abs(r.top + r.height / 2 - cy);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        });
        return best;
    };

    // Emphasise the icon in the centre slot + tick a haptic as it changes.
    let focusIdx = -1;
    const paintFocus = (): void => {
        const idx = centeredIndex();
        if (idx === focusIdx) return;
        items().forEach((it, i) => it.classList.toggle('is-focus', i === idx));
        if (focusIdx !== -1) vibrate(); // no tick on the initial paint
        focusIdx = idx;
    };

    let dragging = false;
    const centerOn = (idx: number, smooth: boolean): void => {
        const it = items()[idx];
        if (!it) return;
        // Scroll the RAIL only (offsetParent is the fixed rail) — never the
        // page — so opening the reel can't jump the whole view.
        const top = it.offsetTop - (rail.clientHeight - it.offsetHeight) / 2;
        rail.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
        window.setTimeout(() => {
            focusIdx = idx;
            items().forEach((el, i) => el.classList.toggle('is-focus', i === idx));
        }, smooth ? 420 : 60);
    };

    // Close the reel (collapse the roulette back to a short window). Called
    // after a commit so a selection dismisses the picker.
    const closeReel = (): void => {
        rail.classList.remove('is-open');
        document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
    };

    // ── Commit the centred item (tap-only; NEVER fired by scrolling) ─────
    // A deliberate tap on the line, or on the centred icon itself, lands
    // here. Scrolling just repaints the focus ring — it no longer navigates.
    const activateCentered = (): void => {
        if (!isReel()) return;
        const it = items()[centeredIndex()];
        if (!it) return;
        const active = rail.querySelector<HTMLElement>('.sidebar-rail__item.active');
        if (active !== it) it.click(); // delegated [data-page] path navigates
        closeReel();
    };

    // Spinning only moves the selection: keep the focus ring live during the
    // scroll + snap, but do NOT auto-navigate. `scrollend` is the crisp
    // "snap fully stopped" signal; both just repaint focus.
    rail.addEventListener('scroll', () => {
        if (!isReel()) return;
        paintFocus();
    });
    rail.addEventListener('scrollend', () => {
        if (!isReel()) return;
        paintFocus();
    });

    // A direct tap on an icon commits it: the delegated [data-page] handler
    // (nav-chrome) navigates; here we just collapse the reel so the picker
    // dismisses on selection, matching the line-tap commit.
    rail.addEventListener('click', (e) => {
        if (!isReel()) return;
        if ((e.target as HTMLElement | null)?.closest('.sidebar-rail__item')) closeReel();
    });

    // ── Right line: drag to scrub, simple tap to commit ─────────────────
    // Snap is disabled during a drag so setting scrollTop live doesn't fight
    // the snap engine; releasing re-enables it and snaps to the centred item
    // (WITHOUT navigating). A press that never moves past TAP_SLOP is a tap →
    // it commits the currently centred item.
    const TAP_SLOP = 6; // px of travel below which a press counts as a tap
    let downY = 0;
    let moved = false;
    const applyDrag = (clientY: number): void => {
        const lr = line.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (clientY - lr.top) / (lr.height || 1)));
        knob.style.top = `${frac * lr.height}px`;
        const max = rail.scrollHeight - rail.clientHeight;
        rail.scrollTop = frac * max;
        paintFocus();
    };
    line.addEventListener('pointerdown', (e) => {
        if (!isReel()) return;
        dragging = true;
        moved = false;
        downY = e.clientY;
        line.classList.add('is-active');
        rail.style.scrollSnapType = 'none';
        try {
            line.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        // Don't scroll on the initial press — wait to see if it's a scrub or
        // a tap. A tap must NOT reposition the reel (it commits what's centred).
        e.preventDefault();
    });
    line.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        if (!moved && Math.abs(e.clientY - downY) > TAP_SLOP) moved = true;
        if (moved) applyDrag(e.clientY);
        e.preventDefault();
    });
    const endDrag = (e: PointerEvent): void => {
        if (!dragging) return;
        dragging = false;
        line.classList.remove('is-active');
        knob.style.top = '';
        rail.style.scrollSnapType = '';
        try {
            line.releasePointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        if (moved) {
            // Was a scrub — snap to the centred item, but DON'T navigate.
            centerOn(centeredIndex(), true);
        } else {
            // A simple tap on the line commits whatever's currently centred.
            activateCentered();
        }
    };
    line.addEventListener('pointerup', endDrag);
    line.addEventListener('pointercancel', endDrag);

    // ── Visibility + open-centering ─────────────────────────────────────
    const HUB_W = 48;
    const HUB_H = 46;
    const positionOverlay = (): void => {
        const rr = rail.getBoundingClientRect();
        line.style.top = `${rr.top}px`;
        line.style.height = `${rr.height}px`;
        hub.style.width = `${HUB_W}px`;
        hub.style.height = `${HUB_H}px`;
        hub.style.left = `${rr.left + rr.width / 2 - HUB_W / 2}px`;
        hub.style.top = `${rr.top + rr.height / 2 - HUB_H / 2}px`;
    };
    let wasShown = false;
    const sync = (): void => {
        const show = isReel();
        line.classList.toggle('is-shown', show);
        hub.classList.toggle('is-shown', show);
        if (show) {
            positionOverlay();
            if (!wasShown) {
                // Just opened — centre the reel on the current page, no nav.
                const active = rail.querySelector<HTMLElement>('.sidebar-rail__item.active');
                const idx = active ? items().indexOf(active) : 0;
                centerOn(Math.max(0, idx), false);
            }
        }
        wasShown = show;
    };
    new MutationObserver(sync).observe(rail, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', sync);
    mq.addEventListener?.('change', sync);
    sync();
}
