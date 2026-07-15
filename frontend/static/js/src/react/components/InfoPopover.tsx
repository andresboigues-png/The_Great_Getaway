// react/components/InfoPopover.tsx — a non-blocking info "bubble".
//
// Replaces the blocking showModal() that the settings ⓘ buttons used to open
// (section headers + POI-pill rows). Clicking the ⓘ toggles a small
// speech-bubble panel anchored under the button; it does NOT overlay the page,
// so every other control stays clickable. Closes on outside-click, Escape, or
// a second click on the button.
//
// The bubble is rendered in a PORTAL at fixed coordinates computed from the
// button's rect — so no ancestor's `overflow:hidden` (e.g. .cat-row) can clip
// it, and it's not constrained by the card it lives in. It re-anchors on
// scroll/resize while open. Accent (an "R,G,B" triplet) tints the border,
// arrow and title to match the section.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iconSvg } from '../../icons.js';

export interface InfoPopoverProps {
    /** 'R,G,B' triplet — matches the section accent (SETTINGS_ACCENTS.*). */
    accent: string;
    ariaLabel: string;
    /** Bold heading inside the bubble (usually the section/pill title). */
    title?: string;
    /** Plain-text paragraphs (React-escaped). */
    paragraphs?: string[];
    /** Trusted locale HTML paragraphs (e.g. copy carrying <strong>). */
    paragraphsHtml?: string[];
    /** Titled sections — each `heading` renders as a blue column-header-style
     *  label above its `body`, so an explanation of a table maps 1:1 to its
     *  columns. Rendered after `paragraphs`. */
    sections?: { heading: string; body: string }[];
    /** Class for the ⓘ button so it matches its context (default the section
     *  header's `st-info-btn`; POI rows pass `poi-filter-row__info-btn`). */
    buttonClassName?: string;
    iconSize?: number;
}

interface Pos {
    top: number;
    left: number;
    arrow: number;
}

export function InfoPopover({
    accent,
    ariaLabel,
    title,
    paragraphs,
    paragraphsHtml,
    sections,
    buttonClassName = 'st-info-btn',
    iconSize = 14,
}: InfoPopoverProps) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<Pos | null>(null);
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const bubbleRef = useRef<HTMLDivElement | null>(null);

    const place = () => {
        const btn = btnRef.current;
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const vw = window.innerWidth;
        const bw = bubbleRef.current?.offsetWidth || Math.min(300, vw - 16);
        let left = r.left;
        if (left + bw > vw - 8) left = vw - 8 - bw;
        if (left < 8) left = 8;
        const arrow = Math.max(14, Math.min(bw - 14, r.left + r.width / 2 - left));
        setPos({ top: Math.round(r.bottom + 10), left: Math.round(left), arrow: Math.round(arrow) });
    };

    // Measure + place once the bubble is mounted (so offsetWidth is real).
    useLayoutEffect(() => {
        if (!open) {
            setPos(null);
            return;
        }
        place();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Re-anchor while open; close on outside-click / Escape.
    useEffect(() => {
        if (!open) return;
        const reflow = () => place();
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (btnRef.current?.contains(t) || bubbleRef.current?.contains(t)) return;
            setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('scroll', reflow, true);
        window.addEventListener('resize', reflow);
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('scroll', reflow, true);
            window.removeEventListener('resize', reflow);
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className={buttonClassName}
                style={{ ['--st-accent' as string]: accent }}
                aria-label={ariaLabel}
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                dangerouslySetInnerHTML={{ __html: iconSvg('info', { size: iconSize }) }}
            />
            {open
                ? createPortal(
                      <div
                          ref={bubbleRef}
                          className="st-info-bubble"
                          role="dialog"
                          aria-label={title || ariaLabel}
                          style={{
                              position: 'fixed',
                              top: pos ? pos.top : -9999,
                              left: pos ? pos.left : 0,
                              visibility: pos ? 'visible' : 'hidden',
                              ['--st-accent' as string]: accent,
                              ['--arrow-x' as string]: `${pos ? pos.arrow : 20}px`,
                          }}
                      >
                          {title ? <span className="st-info-bubble__title">{title}</span> : null}
                          {(paragraphs || []).map((p, i) => (
                              <span key={`p${i}`} className="st-info-bubble__p">
                                  {p}
                              </span>
                          ))}
                          {(paragraphsHtml || []).map((p, i) => (
                              <span
                                  key={`h${i}`}
                                  className="st-info-bubble__p"
                                  dangerouslySetInnerHTML={{ __html: p }}
                              />
                          ))}
                          {(sections || []).map((s, i) => (
                              <span key={`s${i}`} className="st-info-bubble__section">
                                  <span className="st-info-bubble__heading">{s.heading}</span>
                                  <span className="st-info-bubble__p">{s.body}</span>
                              </span>
                          ))}
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
}
