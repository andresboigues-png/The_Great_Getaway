// pages/profile/AchievementsStrip.tsx — §3.3 React migration.
//
// Earned-badge strip on the Profile page. Renders one pill per
// achievement (emoji + label + tooltip). Pre-migration the
// tap-to-pin tooltip behaviour was a delegated document click
// handler on the wrapper div that toggled an `.is-open` class —
// React replaces that with a single `openId` useState piece + a
// useEffect global listener that closes when the user clicks
// outside any pill.
//
// CSS expectations (injected once per page lifetime by Profile.tsx):
//   - .achievement-pill { … relative anchor for the tooltip }
//   - .achievement-tooltip { … hidden by default, shown on
//                              pill:hover / pill:focus-visible /
//                              pill.is-open }
//
// Empty-state rendering is decided by the caller — this component
// just paints the strip when there are 1+ achievements.

import { useEffect, useRef, useState } from 'react';


export interface ProfileAchievement {
    badgeId: string;
    emoji?: string;
    label?: string;
    description?: string;
    earnedAt?: string;
    context?: Record<string, unknown>;
}


function formatEarnedDate(iso?: string): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return isNaN(d.getTime())
            ? ''
            : d.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
              });
    } catch {
        return '';
    }
}


export function AchievementsStrip({ achievements }: { achievements: ProfileAchievement[] }) {
    const [openId, setOpenId] = useState<string | null>(null);
    const stripRef = useRef<HTMLDivElement | null>(null);

    // Close any open tooltip when the user clicks outside any pill.
    // CSS still drives hover + focus-visible reveals; this only
    // covers the tap-to-pin path (where the user tapped a pill to
    // open it without keyboard focus or mouse hover).
    useEffect(() => {
        if (openId === null) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target?.closest('.achievement-pill')) {
                setOpenId(null);
            }
        };
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openId]);

    return (
        <div ref={stripRef} className="achievements-strip flex flex-wrap gap-[10px]">
            {achievements.map((a) => {
                const earnedLabel = formatEarnedDate(a.earnedAt);
                const isOpen = openId === a.badgeId;
                const label = a.label || a.badgeId;
                return (
                    <button
                        key={a.badgeId}
                        type="button"
                        className={`achievement-pill${isOpen ? ' is-open' : ''}`}
                        aria-label={a.description ? `${label} — ${a.description}` : label}
                        style={{
                            position: 'relative',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '6px 12px',
                            borderRadius: 999,
                            background: 'white',
                            border: '1px solid rgba(0,113,227,0.18)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                        onClick={() => setOpenId((cur) => (cur === a.badgeId ? null : a.badgeId))}
                    >
                        <span className="text-[1.1rem] leading-none">{a.emoji || '🏅'}</span>
                        <span>{label}</span>
                        <span className="achievement-tooltip" role="tooltip">
                            <strong className="block mb-1">{label}</strong>
                            {a.description || ''}
                            {earnedLabel ? (
                                <span
                                    className="block mt-[6px] opacity-70 text-[0.72rem] font-medium"
                                >
                                    Earned {earnedLabel}
                                </span>
                            ) : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
