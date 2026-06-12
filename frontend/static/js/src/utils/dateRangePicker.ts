// utils/dateRangePicker.ts — wraps flatpickr's range mode behind a
// uniform interface so the trip modals (new + edit) get a single
// calendar with span selection instead of two separate native date
// inputs.
//
// USER-FEAT-3 (2026-05-28): pre-fix the new/edit-trip modals used two
// adjacent `<input type="date">` fields — user had to click each one
// separately and re-locate the same calendar. The Airbnb/Booking/
// Stripe pattern is a single combined input + single calendar with
// "click start, click end" range selection. flatpickr ships this for
// free with localization built in.
//
// Design choices:
//   - We KEEP the two original hidden `<input type="date">` fields
//     (`#tripStartDate`, `#tripEndDate`) as the source of truth. The
//     existing submit handlers read `startInput.value` / `endInput.value`
//     and the rest of the modal logic doesn't need to know flatpickr
//     exists. The visible range input is just a UX wrapper.
//   - flatpickr loads its locale dynamically only when needed (en is
//     bundled by default; es/fr/pt come from the l10n subpath).
//   - The CSS is imported once at module load so all callers share the
//     same stylesheet.
//
// Why flatpickr (not a custom widget)?
//   - Localization, keyboard nav, mobile sheet, accessibility, screen
//     reader hints — all free.
//   - ~14 KB gzipped, no React dependency, plain DOM API.

import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import { French } from 'flatpickr/dist/l10n/fr.js';
import { Portuguese } from 'flatpickr/dist/l10n/pt.js';
import { getIntlLocale } from '../i18n.js';
import { formatDateRange } from './dom-helpers.js';

interface MountOptions {
    /** The visible single-line input the user clicks to open the calendar. */
    visibleInput: HTMLInputElement;
    /** Hidden / pre-existing `<input type="date">` that the submit
     *  handler reads. The range picker writes the chosen `startDate`
     *  back to `.value` whenever the selection changes. */
    startMirror: HTMLInputElement;
    /** Hidden / pre-existing `<input type="date">` for the end date.
     *  Same contract as `startMirror`. */
    endMirror: HTMLInputElement;
    /** Pre-fill the picker with this start date when provided (ISO
     *  `YYYY-MM-DD`). The edit-trip flow passes the trip's existing
     *  first-day date; the new-trip flow leaves it blank. */
    initialStart?: string;
    /** Pre-fill the end date. Edit-trip flow passes the last day. */
    initialEnd?: string;
    /** Optional change hook — fires AFTER the mirrors are synced.
     *  Useful for the validity hint text. */
    onChange?: (start: string, end: string) => void;
}

/** Pick the right flatpickr locale object for the active app locale.
 *  Falls back to English when no match. */
function _localeFor(code: string) {
    const lc = (code || 'en').toLowerCase();
    if (lc.startsWith('es')) return Spanish;
    if (lc.startsWith('fr')) return French;
    if (lc.startsWith('pt')) return Portuguese;
    return undefined; // flatpickr default = English
}

/** Convert a flatpickr Date object to an ISO `YYYY-MM-DD` string in
 *  the LOCAL timezone — matches what `<input type="date">.value`
 *  produces, so the rest of the modal logic doesn't see a difference. */
function _formatISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Mount a flatpickr range calendar on `visibleInput` and wire it to
 *  the start/end mirror inputs. Returns the flatpickr instance in
 *  case the caller needs to destroy it (modal close path).
 *
 *  USE: call once after the modal's DOM is in place. The visible
 *  input should be a plain `<input>` with `readonly` so the user
 *  doesn't get a confusing edit-text caret in addition to the picker. */
export function mountDateRangePicker(opts: MountOptions): { destroy: () => void } {
    const { visibleInput, startMirror, endMirror, initialStart, initialEnd, onChange } = opts;

    // exactOptionalPropertyTypes refuses `undefined` for `defaultDate`;
    // build the config in two steps so we OMIT the key when no prefill.
    const baseConfig: Record<string, unknown> = {
        mode: 'range',
        dateFormat: 'Y-m-d',
        altInput: false,           // we own the visible input ourselves
        allowInput: false,         // readonly visible field
        locale: _localeFor(getIntlLocale()),
    };
    if (initialStart && initialEnd) {
        baseConfig.defaultDate = [initialStart, initialEnd];
    } else if (initialStart) {
        baseConfig.defaultDate = [initialStart];
    }
    // Paint the visible input with the Apple-style range ("Apr 6 to Apr 12")
    // instead of flatpickr's raw Y-m-d. Reads the mirrors so single-end +
    // both-ends + empty all render correctly.
    const paintVisible = () => {
        visibleInput.value = formatDateRange(startMirror.value || null, endMirror.value || null);
    };
    const fp = flatpickr(visibleInput, {
        ...baseConfig,
        onChange: (selectedDates: Date[]) => {
            // selectedDates is `[Date]` while the user has only picked
            // one end of the range. We only sync when both ends are
            // present so the submit handlers don't see a partial state.
            if (selectedDates.length >= 1 && selectedDates[0]) {
                startMirror.value = _formatISO(selectedDates[0]);
            }
            if (selectedDates.length >= 2 && selectedDates[1]) {
                endMirror.value = _formatISO(selectedDates[1]);
            } else if (selectedDates.length < 2) {
                // User clicked the input again to re-pick — clear end
                // until they finish.
                endMirror.value = '';
            }
            // Bubble `input` events so any existing change-listeners
            // (e.g. the validity hint wired by `_wireDateRangeValidation`)
            // see the mirror update without any extra plumbing.
            startMirror.dispatchEvent(new Event('input', { bubbles: true }));
            endMirror.dispatchEvent(new Event('input', { bubbles: true }));
            onChange?.(startMirror.value, endMirror.value);
            paintVisible();
        },
        // flatpickr rewrites the input with its own Y-m-d format on close;
        // re-apply ours afterwards.
        onClose: () => paintVisible(),
    });
    // Edit prefill: flatpickr wrote Y-m-d text for defaultDate on init —
    // override it with the Apple-style range straight away.
    paintVisible();

    return {
        destroy: () => {
            try {
                // flatpickr's destroy nukes the calendar + listeners.
                // Wrapped so a double-destroy from modal close races
                // doesn't throw.
                if (Array.isArray(fp)) {
                    fp.forEach((i) => i.destroy());
                } else {
                    fp.destroy();
                }
            } catch {
                // ignore
            }
        },
    };
}
