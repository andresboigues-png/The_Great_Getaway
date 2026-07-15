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

import { showModal } from '../../components/Modal.js';
import { esc } from '../../utils.js';
import { t } from '../../i18n.js';
import { iconSvg } from '../../icons.js';

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

/** Open the explanation popup for one settings section. Mirrors the POI ⓘ
 *  modal (gradient header + body + close), tinted with the section accent. */
function openSectionInfoModal(opts: {
    title: string;
    accent: string;
    icon: string;
    info?: string[];
    infoHtml?: string[];
}): void {
    const { title, accent, icon } = opts;
    const paragraphs = [
        ...(opts.info || []).map((p) => `<p style="margin:0 0 12px;">${esc(p)}</p>`),
        ...(opts.infoHtml || []).map((p) => `<p style="margin:0 0 12px;">${p}</p>`),
    ].join('');
    const innerHTML = `
        <div style="text-align:left;">
            <div style="display:flex; align-items:center; gap:14px; padding:18px 22px; background:linear-gradient(135deg, rgb(${accent}) 0%, color-mix(in srgb, rgb(${accent}) 62%, #1a1a2e) 100%); color:white; border-top-left-radius: var(--radius-3xl); border-top-right-radius: var(--radius-3xl);">
                <div style="width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.18); border:1px solid rgba(255,255,255,0.28); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${iconSvg(icon, { size: 24 })}</div>
                <h2 style="margin:0; font-size:1.15rem; color:white; font-weight:800; letter-spacing:-0.02em; line-height:1.2; flex:1; min-width:0;">${esc(title)}</h2>
            </div>
            <div style="padding:20px 22px 6px; color:var(--text-primary); font-size:0.92rem; line-height:1.55;">
                ${paragraphs}
            </div>
            <div style="padding:12px 22px 22px;">
                <button type="button" id="stSectionInfoCloseBtn" style="width:100%; padding:11px 18px; border-radius:12px; border:0; background:linear-gradient(135deg, rgb(${accent}), color-mix(in srgb, rgb(${accent}) 62%, #1a1a2e)); color:white; font-weight:800; font-size:0.9rem; cursor:pointer; box-shadow:0 4px 12px rgba(${accent},0.28);">${esc(t('settings.poiInfoModalClose'))}</button>
            </div>
        </div>
    `;
    const { root, close } = showModal({
        innerHTML,
        cardStyle:
            'max-width: 480px; width: min(480px, calc(100vw - 24px)); padding: 0; overflow: hidden; background: white;',
    });
    const closeBtn = root.querySelector('#stSectionInfoCloseBtn') as HTMLButtonElement | null;
    if (closeBtn) closeBtn.onclick = () => close();
}

export function SettingsSectionHeader({
    title,
    accent,
    icon,
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
                <button
                    type="button"
                    className="st-info-btn"
                    style={{ ['--st-accent' as string]: accent }}
                    aria-label={t('settings.sectionInfoBtn')}
                    title={t('settings.sectionInfoBtn')}
                    onClick={() =>
                        openSectionInfoModal({
                            title,
                            accent,
                            icon,
                            ...(info ? { info } : {}),
                            ...(infoHtml ? { infoHtml } : {}),
                        })
                    }
                    dangerouslySetInnerHTML={{ __html: iconSvg('info', { size: 14 }) }}
                />
            ) : null}
            {right ? <div className="st-section-head__right">{right}</div> : null}
        </div>
    );
}
