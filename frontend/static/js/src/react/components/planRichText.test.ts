// Unit tests for the day-plan WYSIWYG bridge: markdown ⇄ contentEditable HTML.
// The round-trip is the contract that keeps storage (markdown) stable while
// the editor shows live formatting — so we assert both directions AND that
// md → html → (as DOM) → md is a fixed point for every supported construct.
import { describe, it, expect } from 'vitest';
import { mdToHtml, htmlToMd } from './planRichText.js';

/** Simulate the editor: render markdown into a real contentEditable-shaped
 *  DOM node, then read it back — the exact path the component takes. */
function roundTrip(md: string): string {
    const el = document.createElement('div');
    el.innerHTML = mdToHtml(md);
    return htmlToMd(el);
}

/** Read markdown out of a hand-authored DOM (mimicking what a browser's
 *  execCommand / Enter / paste leaves behind). */
function fromHtml(html: string): string {
    const el = document.createElement('div');
    el.innerHTML = html;
    return htmlToMd(el);
}

describe('mdToHtml', () => {
    it('renders bold/italic/underline as semantic tags, not markers', () => {
        expect(mdToHtml('**Hey**')).toContain('<strong>Hey</strong>');
        expect(mdToHtml('_soft_')).toContain('<em>soft</em>');
        expect(mdToHtml('~line~')).toContain('<u>line</u>');
        expect(mdToHtml('**Hey**')).not.toContain('**');
    });

    it('groups "- " / "* " lines into a <ul>', () => {
        const html = mdToHtml('- a\n- b');
        expect(html).toContain('<ul');
        expect(html).toContain('<li>a</li>');
        expect(html).toContain('<li>b</li>');
    });

    it('escapes HTML so pasted/typed markup is inert (XSS-safe)', () => {
        const html = mdToHtml('<script>alert(1)</script> & <b>x</b>');
        expect(html).not.toContain('<script>');
        expect(html).not.toContain('<b>x</b>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&amp;');
    });

    it('is empty for blank input (so the editable stays :empty for the placeholder)', () => {
        expect(mdToHtml('')).toBe('');
        expect(mdToHtml('   \n  ')).toBe('');
        expect(mdToHtml(null)).toBe('');
    });
});

describe('htmlToMd', () => {
    it('reads execCommand bold/italic/underline back to markers', () => {
        expect(fromHtml('<div>go <strong>bold</strong> now</div>')).toBe('go **bold** now');
        expect(fromHtml('<div><i>tilt</i></div>')).toBe('_tilt_');
        expect(fromHtml('<div><u>under</u></div>')).toBe('~under~');
    });

    it('reads a <ul> back to "- " bullet lines', () => {
        expect(fromHtml('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b');
    });

    it('treats <div> and <br> as line breaks', () => {
        expect(fromHtml('first<div>second</div>')).toBe('first\nsecond');
        expect(fromHtml('a<br>b')).toBe('a\nb');
    });

    it('falls back to styled-span detection (styleWithCSS engines)', () => {
        expect(fromHtml('<div><span style="font-weight:700">x</span></div>')).toBe('**x**');
        expect(fromHtml('<div><span style="font-style:italic">y</span></div>')).toBe('_y_');
        expect(fromHtml('<div><span style="text-decoration: underline">z</span></div>')).toBe('~z~');
    });

    it('drops only the trailing bogus <br>, keeping leading + inner blanks', () => {
        // A trailing contentEditable <br> is not user content → dropped.
        expect(fromHtml('<div>hi</div><div><br></div>')).toBe('hi');
        // A LEADING blank line is intentional → preserved.
        expect(fromHtml('<div><br></div><div>hi</div>')).toBe('\nhi');
        // Inner blank lines (section spacing) survive verbatim.
        expect(fromHtml('<div>a</div><div><br></div><div><br></div><div>b</div>')).toBe('a\n\n\nb');
    });

    it('splits a bold run that spans a <br> into per-line markers (PlanText-safe)', () => {
        // Shift+Enter inside bold: emit **a**\n**b**, never **a\nb** which the
        // read-only renderer can't reproduce.
        expect(fromHtml('<div><strong>a<br>b</strong></div>')).toBe('**a**\n**b**');
    });

    it('normalises CRLF so pasted Windows text gains no phantom blank lines', () => {
        // mdToHtml strips \r before it can reach the DOM as a stray line.
        const el = document.createElement('div');
        el.innerHTML = mdToHtml('a\r\nb');
        expect(htmlToMd(el)).toBe('a\nb');
    });
});

describe('AI planner output renders + round-trips through the editor', () => {
    // The exact shape flattenMealForTextarea (pages/ai/slots.ts) writes into
    // day.plan.{morning,afternoon,evening} — header line + bullet + indented
    // why/fact lines. After the AI-run clears planBlocks, buildSlotBlocks
    // seeds ONE text block from this string, so it flows through mdToHtml.
    // Post emoji-strip new saves have NO leading glyph; LEGACY trips still
    // carry the meal emoji, which the renderer swaps for a GG icon.
    const MEAL = 'Breakfast:\n- Manteigaria Café\n  Why: best pastéis in Lisbon\n  Fun fact: opened in 1990';
    const LEGACY_MEAL = '🥐 Breakfast:\n- Manteigaria Café\n  Why: best pastéis in Lisbon\n  Fun fact: opened in 1990';
    // The legacy items[] schema (flattenSlotForTextarea): "activity:" + bullets.
    const LEGACY_SLOT = 'Explore Alfama:\n- São Jorge Castle\n- Fado museum';

    it('renders the meal string as a header + real bullet, no broken markup', () => {
        const html = mdToHtml(MEAL);
        expect(html).toContain('<div>Breakfast:</div>');
        expect(html).toContain('<li>Manteigaria Café</li>');
        // The indented why/fact lines survive as their own lines (not bullets).
        expect(html).toContain('Why: best pastéis in Lisbon');
        expect(html).not.toContain('<script');
    });

    it('swaps a legacy leading meal emoji for a GG icon, dropping the emoji', () => {
        const html = mdToHtml(LEGACY_MEAL);
        // Icon drawn before the header text; the raw emoji is gone.
        expect(html).toContain('<svg');
        expect(html).toContain('Breakfast:');
        expect(html).not.toContain('🥐');
    });

    it('round-trips the meal string unchanged (editing an AI note is lossless)', () => {
        expect(roundTrip(MEAL)).toBe(MEAL);
    });

    it('editing a legacy emoji header persists the emoji-free text', () => {
        // The icon has no text content, so reading the edited DOM back drops the
        // legacy glyph — the note settles on the new emoji-free header.
        expect(roundTrip(LEGACY_MEAL)).toBe(MEAL);
    });

    it('round-trips the legacy activity+bullets slot unchanged', () => {
        expect(roundTrip(LEGACY_SLOT)).toBe(LEGACY_SLOT);
        expect(mdToHtml(LEGACY_SLOT)).toContain('<li>São Jorge Castle</li>');
    });
});

describe('round-trip (md → html → md is a fixed point)', () => {
    const cases = [
        'plain text',
        '**bold**',
        '_italic_',
        '~underline~',
        'lead **bold** and _italic_ tail',
        '- one\n- two\n- three',
        'intro line\n- a\n- b',
        'para one\n\npara two',
        'mix\n- bullet **bold**\nafter',
    ];
    for (const md of cases) {
        it(`preserves: ${JSON.stringify(md)}`, () => {
            expect(roundTrip(md)).toBe(md);
        });
    }
});
