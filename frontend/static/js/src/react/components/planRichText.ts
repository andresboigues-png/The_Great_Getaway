// react/components/planRichText.ts — the bridge between the day-plan's
// markdown-lite storage string and the live WYSIWYG contentEditable editor.
//
// The editor shows formatting AS formatting (type **Hey** → bold "Hey", no
// visible markers), but we still PERSIST the same plain markdown string the
// read-only PlanText renderer reads. That keeps storage, PDF export, and the
// R12 block model untouched — the editor is a pure view over the markdown.
//
//   mdToHtml(md)   markdown → HTML for the contentEditable (XSS-safe: user
//                  text is escaped; only <strong>/<em>/<u>/<ul>/<li>/<div>
//                  are ever emitted).
//   htmlToMd(el)   the contentEditable's live DOM → markdown, reversing the
//                  browser's editing artefacts (execCommand tags, <div>/<br>
//                  line breaks, <ul>/<li> bullets).
//
// The token set mirrors PlanText EXACTLY (**bold**, _italic_, ~underline~,
// "- "/"* " bullet lines) so what the author types is what a viewer sees.

import { iconSvg, emojiToIconKey } from '../../icons.js';

// Emoji-strip: legacy AI plans persisted meal/sight headers with a leading
// emoji ("🥐 Breakfast:", "🏛️ **Sightseeing**"). New saves emit plain text
// (no glyph), but already-saved trips still carry the emoji — so at RENDER a
// leading meal/sight emoji on a line is swapped for its GG line-icon, dropping
// the emoji from the display (and, once edited, from storage via htmlToMd).
// Restricted to the four planner header glyphs so arbitrary user emoji aren't
// silently rewritten.
const _PLAN_HEADER_ICON_KEYS = new Set(['croissant', 'salad', 'wine', 'landmark']);

/** If `line` starts with a planner meal/sight emoji, return the GG icon HTML
 *  plus the remaining line text (emoji + trailing spaces removed); else null. */
function leadingPlanIcon(line: string): { html: string; rest: string } | null {
    const m = /^\s*(\p{Extended_Pictographic}️?)/u.exec(line);
    if (!m) return null;
    const key = emojiToIconKey(m[1]);
    if (!key || !_PLAN_HEADER_ICON_KEYS.has(key)) return null;
    return { html: iconSvg(key, { size: 14 }), rest: line.slice(m[0].length).replace(/^\s+/, '') };
}

const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One line of markdown → inline HTML. Escapes first (so the markers survive
 *  but any real HTML in the text is inert), then rewrites the escaped
 *  bold / italic / underline runs — the captured groups are already-escaped
 *  text, so injecting them into tags stays safe. */
function inlineMdToHtml(line: string): string {
    const esc = escapeHtml(line);
    // The italic `_` only opens/closes at a word boundary (CommonMark's
    // intraword rule) so snake_case ids, IBANs and "3_00 pm" times aren't
    // spuriously italicised.
    const re = /\*\*(.+?)\*\*|(?<!\w)_(.+?)_(?!\w)|~(.+?)~/g;
    let out = '';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(esc)) !== null) {
        out += esc.slice(last, m.index);
        if (m[1] !== undefined) out += `<strong>${m[1]}</strong>`;
        else if (m[2] !== undefined) out += `<em>${m[2]}</em>`;
        else out += `<u>${m[3]}</u>`;
        last = m.index + m[0].length;
    }
    out += esc.slice(last);
    return out;
}

/** Markdown string → HTML for the editor. Bullet runs become a <ul>; every
 *  other line becomes a <div> (a blank line stays navigable as <div><br>).
 *  Empty input → '' so the contentEditable is truly :empty (placeholder). */
export function mdToHtml(md: string | null | undefined): string {
    if (!md || !md.trim()) return '';
    // Normalise CRLF/CR (pasted or Windows-authored notes) to LF so a stray
    // \r can't survive into the DOM and re-serialise as a phantom blank line.
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let inList = false;
    const closeList = (): void => {
        if (inList) {
            html += '</ul>';
            inList = false;
        }
    };
    for (const line of lines) {
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
            if (!inList) {
                html += '<ul class="plan-md__list">';
                inList = true;
            }
            html += `<li>${inlineMdToHtml(bullet[1] ?? '')}</li>`;
        } else {
            closeList();
            if (!line.trim()) {
                html += '<div><br></div>';
            } else {
                // Legacy meal/sight header: draw the GG icon in place of a
                // leading planner emoji, then the escaped remainder.
                const swap = leadingPlanIcon(line);
                html += swap
                    ? `<div>${swap.html}${inlineMdToHtml(swap.rest)}</div>`
                    : `<div>${inlineMdToHtml(line)}</div>`;
            }
        }
    }
    closeList();
    return html;
}

/** Inline element (or run of them) → markdown. Handles execCommand's semantic
 *  tags AND, defensively, the styled spans some engines emit when
 *  styleWithCSS is on. Unknown wrappers (span/font/a) pass their text
 *  through, so pasted junk collapses to plain text rather than surviving. */
function inlineMd(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const inner = (): string => {
        let s = '';
        el.childNodes.forEach((c) => {
            s += c.nodeName === 'BR' ? '\n' : inlineMd(c);
        });
        return s;
    };
    // Wrap each LINE of the run separately: a Shift+Enter inside a bold/italic
    // span would otherwise emit a marker spanning a newline (`**a\nb**`), which
    // PlanText renders per-line and can't reproduce (it'd show literal markers).
    const wrapPerLine = (marker: string): string =>
        inner()
            .split('\n')
            .map((seg) => (seg.trim() ? marker + seg + marker : seg))
            .join('\n');
    switch (el.tagName) {
        case 'STRONG':
        case 'B':
            return wrapPerLine('**');
        case 'EM':
        case 'I':
            return wrapPerLine('_');
        case 'U':
        case 'INS':
            return wrapPerLine('~');
        default: {
            let text = inner();
            const style = el.getAttribute('style') || '';
            if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(style)) text = `**${text}**`;
            if (/font-style\s*:\s*italic/i.test(style)) text = `_${text}_`;
            if (/text-decoration[^;]*underline/i.test(style)) text = `~${text}~`;
            return text;
        }
    }
}

/** The contentEditable's live DOM → markdown. Walks top-level nodes into
 *  lines: <div>/<p> and <br> are line breaks, <ul>/<ol> emit "- " bullets,
 *  inline nodes accumulate onto the current line. */
export function htmlToMd(root: HTMLElement): string {
    const lines: string[] = [];
    let current = '';
    const pushLine = (): void => {
        lines.push(current);
        current = '';
    };
    const walk = (nodes: NodeListOf<ChildNode>): void => {
        nodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                current += node.textContent || '';
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const el = node as HTMLElement;
            const tag = el.tagName;
            if (tag === 'BR') {
                pushLine();
            } else if (tag === 'DIV' || tag === 'P') {
                if (current) pushLine();
                const before = lines.length;
                walk(el.childNodes);
                if (current) pushLine();
                // An empty block (e.g. <div><br></div> already pushed, or a
                // bare empty <div>) still counts as a blank line.
                if (lines.length === before && !current) lines.push('');
            } else if (tag === 'UL' || tag === 'OL') {
                if (current) pushLine();
                el.querySelectorAll(':scope > li').forEach((li) => {
                    lines.push(`- ${inlineMd(li).trim()}`);
                });
            } else {
                current += inlineMd(el);
            }
        });
    };
    walk(root.childNodes);
    if (current) pushLine();
    // Preserve the author's blank lines (they may space sections), but drop a
    // trailing run — contentEditable leaves a "bogus" trailing <br>/<div> that
    // isn't user content, and a note shouldn't accumulate trailing whitespace.
    return lines.join('\n').replace(/\n+$/, '');
}
