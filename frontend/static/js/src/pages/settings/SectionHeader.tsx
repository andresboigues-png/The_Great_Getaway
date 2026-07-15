// pages/settings/SectionHeader.tsx — the ONE settings section header.
//
// Every settings page header used to be ad-hoc (`st-card-title-indigo`,
// `st-card-title-amber`, bare `card-title`, the undefined
// `settings-section-title`…) with its explanation paragraph(s) inlined at the
// top of the card. This component standardizes all of them:
//
//   - ONE title font (the h2 base the General cards already used), coloured
//     per SECTION with the same accent its icon tile carries on the main
//     settings hub (`--mc-accent` triplet) — darkened via color-mix for
//     professional text contrast on light glass.
//   - The explanation moves into an ⓘ INFO POPUP (same modal pattern as the
//     POI pill ⓘ) instead of sitting "blatantly at the start of the page".
//     The popup header tints with the section accent; body carries the
//     original localized paragraphs.
//
// Accent triplets are centralised in SETTINGS_ACCENTS so the hub cards and
// these headers can never drift apart.

import { t } from '../../i18n.js';
import { InfoPopover } from '../../react/components/InfoPopover.js';

/** Per-section accent RGB triplets — the SINGLE source both the hub's
 *  `.management-card__icon` tiles and the in-page section titles use. */
export const SETTINGS_ACCENTS = {
    general: '0,113,227', // Apple blue — General (pills / appearance / language)
    format: '255,149,0', // orange — Format options (Excel mapping)
    personalization: '88,86,214', // indigo
    sessions: '52,199,89', // green
    blocks: '0,199,190', // teal
    creator: '175,82,222', // purple
    developer: '90,200,250', // sky
    danger: '255,59,48', // red — Data management / destructive
} as const;

export interface SettingsSectionHeaderProps {
    title: string;
    /** 'R,G,B' triplet (use SETTINGS_ACCENTS.*). */
    accent: string;
    /** GG icon key shown in the info-popup header tile. */
    icon: string;
    /** Localized plain-text explanation paragraphs (escaped into the popup). */
    info?: string[];
    /** Trusted locale HTML paragraphs (e.g. themePickerSubtitleV2's <strong>). */
    infoHtml?: string[];
    /** Render as a slightly smaller heading (sub-cards like Reset). */
    small?: boolean;
    /** Extra content pinned to the right of the header row (count chips,
     *  refresh buttons…) — keeps existing per-page affordances. */
    right?: React.ReactNode;
}

export function SettingsSectionHeader({
    title,
    accent,
    info,
    infoHtml,
    small = false,
    right,
}: SettingsSectionHeaderProps) {
    const hasInfo = Boolean(info?.length || infoHtml?.length);
    const Tag = small ? 'h3' : 'h2';
    return (
        <div className="st-section-head">
            <Tag
                className="st-section-title"
                style={{ ['--st-accent' as string]: accent }}
            >
                {title}
            </Tag>
            {hasInfo ? (
                <InfoPopover
                    accent={accent}
                    ariaLabel={t('settings.sectionInfoBtn')}
                    title={title}
                    {...(info ? { paragraphs: info } : {})}
                    {...(infoHtml ? { paragraphsHtml: infoHtml } : {})}
                />
            ) : null}
            {right ? <div className="st-section-head__right">{right}</div> : null}
        </div>
    );
}
