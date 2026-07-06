// bootstrap/railScrubber.ts — right-edge "liquid glass" scrub line that
// mirrors the left nav rail, for right-thumb reach on phones.
//
// Holding a phone right-handed makes the left icon rail an uncomfortable
// stretch. This adds a translucent vertical line on the RIGHT edge, the
// same height as the rail's icons. Dragging a thumb up/down it moves a
// glass "selector" highlight along the rail (linear map: line-top → first
// icon, line-bottom → last), firing a short haptic tick each time the
// selector crosses to a new icon; releasing navigates to whatever icon
// the selector landed on. A normal rail tap also flashes the selector +
// haptic, so the two input paths feel the same.
//
// Scope: the line shows only on a phone-width viewport (≤720px, matching
// the rail's own mobile behaviour) while the rail island is OPEN — a
// desktop mouse user doesn't need a thumb aid. Haptics use the Web
// Vibration API, feature-detected, so it's a silent no-op where absent
// (e.g. iOS Safari) — matching the user's "if the phone has it".

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

    // Glass selector — a highlight that rides the rail BEHIND the icons.
    // Inserted first so the icons (later in DOM, same z-index) paint over it.
    const selector = document.createElement('div');
    selector.className = 'rail-selector';
    selector.setAttribute('aria-hidden', 'true');
    rail.insertBefore(selector, rail.firstChild);

    // Right-edge scrub line + thumb knob.
    const line = document.createElement('div');
    line.className = 'rail-scrubber';
    line.setAttribute('aria-hidden', 'true');
    const knob = document.createElement('div');
    knob.className = 'rail-scrubber__knob';
    line.appendChild(knob);
    document.body.appendChild(line);

    const items = (): HTMLElement[] =>
        Array.from(rail.querySelectorAll<HTMLElement>('.sidebar-rail__item'));

    /** Move the glass selector to sit over `item`. Uses offsetTop/Height
     *  (relative to the position:fixed rail, its offsetParent) so it stays
     *  correct through the rail's own scroll + slide transform. */
    const moveSelectorTo = (item: HTMLElement): void => {
        selector.style.top = `${item.offsetTop}px`;
        selector.style.height = `${item.offsetHeight}px`;
        selector.classList.add('is-visible');
    };
    const hideSelector = (): void => selector.classList.remove('is-visible');

    /** Index of the rail item whose vertical centre is nearest clientY. */
    const nearestIndex = (clientY: number): number => {
        const its = items();
        let best = 0;
        let bestDist = Infinity;
        its.forEach((it, i) => {
            const r = it.getBoundingClientRect();
            const cy = r.top + r.height / 2;
            const d = Math.abs(cy - clientY);
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        });
        return best;
    };

    // ── Drag on the scrub line ──────────────────────────────────────────
    let dragging = false;
    let lastIdx = -1;

    const applyDrag = (clientY: number): void => {
        const its = items();
        if (its.length === 0) return;
        const lineRect = line.getBoundingClientRect();
        const clampedY = Math.max(lineRect.top, Math.min(lineRect.bottom, clientY));
        knob.style.top = `${clampedY - lineRect.top}px`;
        const idx = nearestIndex(clampedY);
        if (idx !== lastIdx) {
            lastIdx = idx;
            const target = its[idx];
            if (target) moveSelectorTo(target);
            vibrate(); // one tick per crossed icon
        }
    };

    line.addEventListener('pointerdown', (e) => {
        dragging = true;
        lastIdx = -1;
        line.classList.add('is-active');
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
        try {
            line.releasePointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        const its = items();
        const target = lastIdx >= 0 ? (its[lastIdx] ?? null) : null;
        if (target) {
            // Navigate — reuses main.ts's delegated [data-page] click path.
            target.click();
            // Close the island now that the user has committed a choice.
            rail.classList.remove('is-open');
            document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
        }
        hideSelector();
    };
    line.addEventListener('pointerup', endDrag);
    line.addEventListener('pointercancel', endDrag);

    // ── Normal rail tap → flash the same selector + haptic ──────────────
    rail.addEventListener('click', (e) => {
        const item = (e.target as HTMLElement | null)?.closest<HTMLElement>('.sidebar-rail__item');
        if (!item) return;
        moveSelectorTo(item);
        vibrate();
        window.setTimeout(hideSelector, 650);
    });

    // ── Visibility: phone-width viewport + rail open ────────────────────
    const mq = window.matchMedia('(max-width: 720px)');
    const positionLine = (): void => {
        const its = items();
        if (its.length === 0) return;
        const first = its[0]!.getBoundingClientRect();
        const last = its[its.length - 1]!.getBoundingClientRect();
        line.style.top = `${first.top}px`;
        line.style.height = `${Math.max(0, last.bottom - first.top)}px`;
    };
    const sync = (): void => {
        const show = mq.matches && rail.classList.contains('is-open');
        if (show) positionLine();
        line.classList.toggle('is-shown', show);
        if (!show && !dragging) hideSelector();
    };
    // The rail toggles .is-open (nav-chrome) — react to it.
    new MutationObserver(sync).observe(rail, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', sync);
    mq.addEventListener?.('change', sync);
    sync();
}
