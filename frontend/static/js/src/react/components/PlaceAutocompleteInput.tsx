// react/components/PlaceAutocompleteInput.tsx — a text input with Google
// Places Autocomplete wired on, React-native and reusable.
//
// The same picker the New/Edit Trip destination field uses (see
// modals/_shared.ts _wirePlacePicker), but as a self-contained controlled-ish
// React component so it can live inside JSX (e.g. the Transport tab's car
// "where are you coming from?" box). Picking a real suggestion reports
// {label, placeId, coords} so the caller can build an EXACT Maps route
// (origin_place_id / lat,lng) instead of geocoding ambiguous free text.
//
// Degrades gracefully: if google.maps.places is unavailable (ad-blocker,
// quota, regional block) it's just a plain text input and the typed label is
// still reported on blur — nothing breaks, the route link simply geocodes the
// text like before.

import { useEffect, useRef } from 'react';

/** A picked place. `placeId`/`coords` are present ONLY for a real suggestion
 *  (a rich pick); free-typed text reports just `label`. */
export interface PlacePick {
    label: string;
    placeId?: string;
    /** "lat,lng" */
    coords?: string;
}

export interface PlaceAutocompleteInputProps {
    initialValue?: string;
    placeholder?: string;
    className?: string;
    maxLength?: number;
    'aria-label'?: string;
    /** A real suggestion was chosen (has placeId + coords). Fires immediately
     *  on selection so the pick sticks without waiting for blur. */
    onSelect: (pick: PlacePick) => void;
    /** The field was committed (blur). `pick` is the rich pick when the text
     *  still matches the last selection, else a free-text {label} — or null
     *  when the field is empty. */
    onCommit: (pick: PlacePick | null) => void;
}

export function PlaceAutocompleteInput({
    initialValue = '',
    placeholder,
    className,
    maxLength = 160,
    'aria-label': ariaLabel,
    onSelect,
    onCommit,
}: PlaceAutocompleteInputProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    // The last RICH pick, kept so blur can tell "unchanged rich selection" from
    // "typed away into free text". Seeded from initialValue only as a label
    // (we have no placeId/coords for a persisted string — those re-arrive if
    // the user re-picks; the label alone still geocodes fine).
    const richRef = useRef<PlacePick | null>(null);
    // Latest callbacks without re-running the (one-shot) autocomplete effect.
    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        // google is injected globally by the Maps loader; guard for ad-blocker /
        // quota / regional block, where it's simply absent (degraded plain input).
        if (typeof google === 'undefined' || !google.maps || !google.maps.places) {
            return; // Degraded: plain input; free text handled by onBlur below.
        }
        const ac = new google.maps.places.Autocomplete(el, {
            fields: ['place_id', 'name', 'formatted_address', 'geometry'],
        });
        const listener = ac.addListener('place_changed', () => {
            const place = ac.getPlace();
            const loc = place?.geometry?.location;
            const label = (place?.formatted_address || place?.name || el.value || '').trim();
            if (loc && label) {
                const pick: PlacePick = {
                    label,
                    ...(place.place_id ? { placeId: place.place_id } : {}),
                    coords: `${loc.lat()},${loc.lng()}`,
                };
                richRef.current = pick;
                el.value = label;
                onSelectRef.current(pick);
            } else {
                // A suggestion with no geometry — treat as free text on blur.
                richRef.current = null;
            }
        });
        return () => {
            if (typeof google !== 'undefined' && google.maps?.event && listener) {
                google.maps.event.removeListener(listener);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleBlur = () => {
        const el = inputRef.current;
        if (!el) return;
        const val = el.value.trim().slice(0, maxLength);
        const rich = richRef.current;
        if (rich && val === rich.label) {
            onCommit(rich);
        } else {
            richRef.current = null; // typed away from the rich pick
            onCommit(val ? { label: val } : null);
        }
    };

    const handleInput = () => {
        const el = inputRef.current;
        if (!el) return;
        // Any keystroke that diverges from the rich pick invalidates it.
        if (richRef.current && el.value.trim() !== richRef.current.label) {
            richRef.current = null;
        }
    };

    return (
        <input
            ref={inputRef}
            type="text"
            className={className}
            placeholder={placeholder}
            maxLength={maxLength}
            defaultValue={initialValue}
            aria-label={ariaLabel}
            onInput={handleInput}
            onBlur={handleBlur}
            // A stray Enter in the Places dropdown would otherwise submit an
            // enclosing form / reload; keep it inside the picker.
            onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
            }}
        />
    );
}
