// react/components/PlanText.tsx — markdown-lite renderer for day-plan
// notes. Turns the free-form textarea strings into organised output so a
// day's plan reads as a tidy list instead of one run-on blob:
//   - lines beginning "- " or "* " group into a bullet list
//   - "**bold**" spans render bold
//   - blank lines separate paragraphs; every other line is a paragraph
//
// XSS-safe by construction: all user text is rendered as React children
// (which React escapes), and we only ever emit <ul>/<li>/<p>/<strong> —
// never dangerouslySetInnerHTML. Used by both the read-only DayViewModal
// and the live preview under the DayDetailModal editor textareas, so the
// author sees exactly what a viewer will.

import type { ReactNode } from 'react';
import { t } from '../../i18n.js';

/** Split one line into plain-text + **bold** runs. Non-greedy, no nesting
 *  — a stray unmatched `**` is left as literal text. */
function inlineRuns(line: string): ReactNode[] {
    const out: ReactNode[] = [];
    const re = /\*\*(.+?)\*\*/g;
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
        if (m.index > last) out.push(line.slice(last, m.index));
        out.push(<strong key={`b-${key++}`}>{m[1]}</strong>);
        last = m.index + m[0].length;
    }
    if (last < line.length) out.push(line.slice(last));
    return out;
}

/** True when the notes hold any non-whitespace content. */
export function planTextHasContent(text?: string | null): boolean {
    return !!text && !!text.trim();
}

/** True when the notes actually USE markdown-lite formatting — a **bold**
 *  span or a "- "/"* " bullet line. Used to show the editor preview only
 *  when it's meaningful (never for plain text). */
export function planTextHasFormatting(text?: string | null): boolean {
    if (!text) return false;
    return /\*\*[^*\n]+\*\*/.test(text) || /(^|\n)[ \t]*[-*][ \t]+\S/.test(text);
}

export function PlanText({
    text,
    emptyText,
}: {
    text?: string | null;
    /** Placeholder when empty. Omit to hide entirely (editor preview). */
    emptyText?: string;
}) {
    if (!planTextHasContent(text)) {
        if (emptyText === undefined) return null;
        return <p className="dvm-italic-muted">{emptyText}</p>;
    }
    const lines = (text as string).split('\n');
    const blocks: ReactNode[] = [];
    let bullets: ReactNode[] = [];
    let listKey = 0;
    const flush = () => {
        if (bullets.length) {
            blocks.push(
                <ul className="plan-md__list" key={`ul-${listKey++}`}>
                    {bullets}
                </ul>,
            );
            bullets = [];
        }
    };
    lines.forEach((line, i) => {
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
            bullets.push(<li key={`li-${i}`}>{inlineRuns(bullet[1] ?? '')}</li>);
        } else if (line.trim()) {
            flush();
            blocks.push(
                <p className="plan-md__p" key={`p-${i}`}>
                    {inlineRuns(line)}
                </p>,
            );
        } else {
            // Blank line → paragraph break; close any open list.
            flush();
        }
    });
    flush();
    return <div className="plan-md">{blocks}</div>;
}

/** Convenience for the read-only view — shows the "nothing planned yet"
 *  italic placeholder when empty. */
export function PlanTextOrEmpty({ text }: { text?: string | null }) {
    return <PlanText text={text ?? null} emptyText={t('dayView.nothingPlanned')} />;
}
