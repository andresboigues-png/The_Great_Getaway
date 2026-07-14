// react/components/TransportModeIcon.tsx — the transport-mode line icon in
// React surfaces. transportModeIcon() returns an SVG *string* (built for
// vanilla/innerHTML), so React consumers render it through this wrapper
// instead of dropping the markup into {…} (which would escape it). Inherits
// GG blue by default; pass `color` to override (e.g. white on a selected
// blue button).

import { transportModeIcon } from '../../pages/home/transportModal.js';
import { iconSvg } from '../../icons.js';
import type { TransportMode } from '../../types';

export function TransportModeIcon({
    mode,
    size = 18,
    color = 'var(--accent-blue)',
}: {
    mode: TransportMode | null | undefined;
    size?: number;
    color?: string;
}) {
    // null/undefined mode → the neutral "route" glyph (transport not set).
    const html = mode ? transportModeIcon(mode, size) : iconSvg('route', { size });
    return (
        <span
            aria-hidden="true"
            style={{ display: 'inline-flex', alignItems: 'center', color, flexShrink: 0 }}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
