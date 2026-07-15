// bootstrap/railLens.ts — the liquid-glass "magnifying lens" that marks the
// active page on the nav rail island.
//
// Replaces the flat blue-shade `.sidebar-rail__item.active` background with a
// physical-feeling glass square that GLIDES (springy transition) to whichever
// rail item is the current page, and can be DRAGGED: pick the lens up, slide
// it along the rail, drop it on an item → navigates there. A simple tap on
// the lens forwards the click to the item beneath it (so tap-affordances on
// the active item keep working).
//
// Positioning model: the lens is an absolutely-positioned child of the rail
// (the rail is its own scroller on mobile, so the lens scrolls WITH the reel
// and stays glued to its item). The router toggles `.active` on rail items
// after every navigation (router.ts _applyNavState); a MutationObserver on
// those class flips is the single "reposition" signal — no router coupling.
//
// The lens deliberately has NO backdrop blur: it sits ON TOP of the icon
// (z-index above, so it's grabbable), and a blur would smear the very icon
// it magnifies. The glass read comes from a white sheen gradient, a hairline
// double border, an inset specular highlight and a soft drop shadow —
// saturate() alone adds the liquid pop without hurting legibility.

const TAP_SLOP = 5; // px of travel below which a press counts as a tap

export function initRailLens(): void {
    const rail = document.getElementById('sidebarRail');
    if (!rail) return;

    const lens = document.createElement('div');
    lens.className = 'rail-lens';
    lens.setAttribute('aria-hidden', 'true');
    // Appended LAST: absolute (out of the flex flow), so the rail's
    // `> :first-child { margin-top: auto }` centering trick stays intact.
    rail.appendChild(lens);

    const items = (): HTMLElement[] =>
        Array.from(rail.querySelectorAll<HTMLElement>('.sidebar-rail__item'));

    let dragging = false;

    /** Snap the lens onto the active item (springy CSS transition does the
     *  glide). No active item / hidden rail → fade out. */
    const position = (): void => {
        if (dragging) return; // never fight the user's hand
        const active = rail.querySelector<HTMLElement>('.sidebar-rail__item.active');
        // IMPORTANT: only touch classList when the state actually CHANGES.
        // classList.add/remove re-serialize the class attribute even when
        // it's a no-op, which fires a mutation record — and this function
        // runs FROM a class MutationObserver, so an unconditional add()
        // would loop the observer forever and freeze the renderer.
        // Visibility test: the rail is position:fixed, so offsetParent is
        // ALWAYS null for it — use getClientRects() (empty when display:none).
        if (!active || rail.getClientRects().length === 0) {
            if (lens.classList.contains('is-on')) lens.classList.remove('is-on');
            return;
        }
        lens.style.top = `${active.offsetTop}px`;
        lens.style.left = `${active.offsetLeft}px`;
        lens.style.width = `${active.offsetWidth}px`;
        lens.style.height = `${active.offsetHeight}px`;
        if (!lens.classList.contains('is-on')) lens.classList.add('is-on');
    };

    /** The rail item whose centre is nearest the lens centre right now. */
    const nearestItem = (): HTMLElement | null => {
        const lr = lens.getBoundingClientRect();
        const cy = lr.top + lr.height / 2;
        let best: HTMLElement | null = null;
        let bestD = Infinity;
        for (const it of items()) {
            const r = it.getBoundingClientRect();
            const d = Math.abs(r.top + r.height / 2 - cy);
            if (d < bestD) {
                bestD = d;
                best = it;
            }
        }
        return best;
    };

    // ── Drag: pick up, slide along the rail, drop to navigate ───────────
    let downY = 0;
    let startTop = 0;
    let moved = false;
    let lastTarget: HTMLElement | null = null;

    const paintTarget = (): void => {
        const target = nearestItem();
        if (target === lastTarget) return;
        lastTarget?.classList.remove('lens-target');
        target?.classList.add('lens-target');
        lastTarget = target;
    };

    lens.addEventListener('pointerdown', (e) => {
        dragging = true;
        moved = false;
        downY = e.clientY;
        startTop = parseFloat(lens.style.top || '0');
        lens.classList.add('is-dragging');
        try {
            lens.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        e.preventDefault();
    });

    lens.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        if (!moved && Math.abs(e.clientY - downY) > TAP_SLOP) moved = true;
        if (!moved) return;
        const its = items();
        const first = its[0];
        const last = its[its.length - 1];
        if (!first || !last) return;
        const next = Math.max(
            first.offsetTop,
            Math.min(last.offsetTop, startTop + (e.clientY - downY)),
        );
        lens.style.top = `${next}px`;
        paintTarget();
        e.preventDefault();
    });

    const endDrag = (e: PointerEvent): void => {
        if (!dragging) return;
        dragging = false;
        lens.classList.remove('is-dragging');
        lastTarget?.classList.remove('lens-target');
        lastTarget = null;
        try {
            lens.releasePointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        if (!moved) {
            // A tap — forward it to the item under the lens so the active
            // item's own tap behaviour keeps working through the glass.
            position();
            nearestItem()?.click();
            return;
        }
        const target = nearestItem();
        const active = rail.querySelector<HTMLElement>('.sidebar-rail__item.active');
        if (target && target !== active) {
            // Drop on a new item → navigate. The router flips `.active`;
            // the observer then settles the lens exactly onto the item.
            target.click();
        }
        // Same item (or no target): glide home.
        position();
    };
    lens.addEventListener('pointerup', endDrag);
    lens.addEventListener('pointercancel', endDrag);

    // ── Reposition signals ───────────────────────────────────────────────
    // Router `.active` flips + the mobile island's `is-open` toggle both
    // arrive as class mutations; rail size changes (resize, reel scroll
    // window) via ResizeObserver; the island slide-in ends with a transform
    // transition whose end is the moment offsets are final.
    // Belt-and-suspenders vs the loop above: mutation batches that concern
    // ONLY the lens's own class flips never need a reposition.
    new MutationObserver((muts) => {
        if (muts.every((m) => m.target === lens)) return;
        position();
    }).observe(rail, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true,
    });
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(position).observe(rail);
    }
    window.addEventListener('resize', position);
    rail.addEventListener('transitionend', position);
    position();
}
