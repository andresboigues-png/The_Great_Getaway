// bootstrap/railScrubber.ts — mobile "roulette" nav rail.
//
// On a phone the left nav rail is a SHORT 3-icon window and the nav icons
// form a vertical reel the user spins. Two ways to spin it:
//   • swipe the rail itself (native scroll-snap), or
//   • drag the translucent right-edge line (right-thumb reach) — its
//     position maps to the reel's scroll, so a left-rail spin and a
//     right-line spin do the same thing.
// When the reel SETTLES on an icon it navigates there (auto-go on settle);
// it clamps at the ends (no wrap). Desktop (>720px) keeps the full static
// rail and never shows the line.
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

    // While we programmatically recentre (on open), don't auto-navigate.
    let suppress = false;
    let dragging = false;
    const centerOn = (idx: number, smooth: boolean): void => {
        const it = items()[idx];
        if (!it) return;
        suppress = true;
        // Scroll the RAIL only (offsetParent is the fixed rail) — never the
        // page — so opening the reel can't jump the whole view.
        const top = it.offsetTop - (rail.clientHeight - it.offsetHeight) / 2;
        rail.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
        window.setTimeout(() => {
            suppress = false;
            focusIdx = idx;
            items().forEach((el, i) => el.classList.toggle('is-focus', i === idx));
        }, smooth ? 420 : 60);
    };

    // ── Settle → navigate (auto-go on settle) ───────────────────────────
    const settle = (): void => {
        if (!isReel() || suppress || dragging) return;
        const it = items()[centeredIndex()];
        if (!it) return;
        const active = rail.querySelector<HTMLElement>('.sidebar-rail__item.active');
        if (active === it) return; // already on this page — nothing to do
        it.click(); // delegated [data-page] click path in main.ts navigates
        rail.classList.remove('is-open');
        document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
    };

    // `scrollend` is the crisp signal (fires once the spin + snap fully
    // stop); a debounce covers browsers without it. Both funnel to settle().
    let settleT = 0;
    rail.addEventListener('scroll', () => {
        if (!isReel()) return;
        paintFocus();
        window.clearTimeout(settleT);
        settleT = window.setTimeout(settle, 150);
    });
    rail.addEventListener('scrollend', () => {
        window.clearTimeout(settleT);
        settle();
    });

    // ── Right line drag → drive the reel's scroll ───────────────────────
    // Snap is disabled during the drag so setting scrollTop live doesn't
    // fight the snap engine; releasing re-enables it and the reel snaps +
    // settles → navigates.
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
        line.classList.add('is-active');
        rail.style.scrollSnapType = 'none';
        try {
            line.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        applyDrag(e.clientY);
        e.preventDefault();
    });
    line.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        applyDrag(e.clientY);
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
        // Snap to the centred item; its scroll + scrollend fire settle→navigate.
        centerOn(centeredIndex(), true);
        suppress = false; // we DO want this settle to navigate
        window.setTimeout(settle, 60);
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
