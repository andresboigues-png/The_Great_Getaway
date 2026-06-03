// pages/ai/AIUsageCard.tsx — extracted from AI.tsx (behavior-preserving).
//
// Replaces the old "AI Engine" key-input card. The first-class
// surface is now a horizontal usage bar showing how drained the
// shared host-key pool is for the day. The BYO key form is
// tucked behind a "Use my own key" expander — still one click
// away for power users / when the pool is dry, but no longer
// the first thing the user sees.
//
// Pool semantics (see src/routes/integrations.py):
//   - total      : number of host keys configured in env
//   - exhausted  : keys currently in 24h cooldown after a quota hit
//   - available  : total - exhausted
//   - fillRatio  : exhausted / total  (0 → empty bar, 1 → full bar)
//
// On a self-hosted instance with 0 host keys configured we skip
// the bar entirely — there's no pool to display — and the BYO
// expander defaults open since that's the only working path.

import { t } from '../../i18n.js';
import type { GeminiHostKeyStatus } from '../../api.js';

interface AIUsageCardProps {
    hostPoolStatus: GeminiHostKeyStatus | null;
    showByoCard: boolean;
    onToggleByo: () => void;
    geminiKey: string;
    onKeyChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    showKey: boolean;
    onToggleShowKey: () => void;
    keyStatus: { text: string; color: string };
    onShowKeyHelp: () => void;
}

export function AIUsageCard({
    hostPoolStatus,
    showByoCard,
    onToggleByo,
    geminiKey,
    onKeyChange,
    showKey,
    onToggleShowKey,
    keyStatus,
    onShowKeyHelp,
}: AIUsageCardProps) {
    const hasPool = hostPoolStatus != null && hostPoolStatus.total > 0;
    const ratio = hasPool && hostPoolStatus
        ? Math.max(0, Math.min(1, hostPoolStatus.exhausted / hostPoolStatus.total))
        : 0;
    const pct = Math.round(ratio * 100);
    const drained = hasPool && hostPoolStatus
        ? hostPoolStatus.available === 0
        : false;

    return (
        <div
            className="card glass p-[18px] border-[rgba(155,89,182,0.3)] flex-none"
        >
            <div
                className="flex items-center justify-between mb-2"
            >
                <h2
                    className="card-title text-[0.85rem] uppercase tracking-[0.07em] text-accent-purple-deep m-0"
                >
                    {t('ai.usageCardTitle')}
                </h2>
                {hasPool && hostPoolStatus ? (
                    <span
                        style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: drained ? '#a82424' : '#5b3a7e',
                            background: drained
                                ? 'rgba(168,36,36,0.10)'
                                : 'rgba(155,89,182,0.10)',
                            padding: '3px 8px',
                            borderRadius: 999,
                            letterSpacing: '0.02em',
                        }}
                    >
                        {t('ai.usagePctPill', { pct: String(pct) })}
                    </span>
                ) : null}
            </div>

            {hasPool && hostPoolStatus ? (
                <>
                    {/* The bar. Filled portion = drained portion of the pool.
                        Empty bar = pool fully available, full bar = every host
                        key is in cooldown for the day. */}
                    <div
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="AI usage today"
                        className="relative h-2.5 rounded-full bg-[rgba(155,89,182,0.10)] border border-[rgba(155,89,182,0.18)] overflow-hidden mt-0.5"
                    >
                        <div
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                bottom: 0,
                                width: `${pct}%`,
                                background: drained
                                    ? 'linear-gradient(90deg, #ff9500 0%, #ff3b30 100%)'
                                    : 'linear-gradient(90deg, #7c3a9e 0%, #c084ee 100%)',
                                transition: 'width 0.4s ease',
                            }}
                        />
                    </div>
                    <p
                        style={{
                            margin: '8px 0 0',
                            fontSize: '0.78rem',
                            color: drained ? '#a82424' : 'var(--text-secondary)',
                            lineHeight: 1.45,
                        }}
                    >
                        {drained
                            ? t('ai.usageDrained')
                            : t('ai.usageQuotaUsed', { pct: String(pct) })}
                    </p>
                </>
            ) : (
                <p
                    className="m-0 text-[0.78rem] text-secondary leading-[1.45]"
                >
                    {t('ai.usageNoPool')}
                </p>
            )}

            <button
                type="button"
                onClick={onToggleByo}
                aria-expanded={showByoCard}
                className="mt-3 w-full bg-transparent border border-dashed border-[rgba(155,89,182,0.35)] text-accent-purple-deep font-bold text-[0.82rem] py-2 px-3 rounded-[10px] cursor-pointer flex items-center justify-center gap-1.5"
            >
                <span className="text-[0.7rem]">{showByoCard ? '▾' : '▸'}</span>
                {t('ai.usageUseMyKeyBtn')}
            </button>

            {showByoCard ? (
                <div
                    className="mt-3 bg-[rgba(155,89,182,0.04)] border border-[rgba(155,89,182,0.18)] rounded-md p-3"
                >
                    <div
                        className="flex items-center justify-between mb-[6px]"
                    >
                        <span
                            className="text-[0.72rem] font-bold uppercase tracking-[0.06em] text-accent-purple-deep"
                        >
                            {t('ai.usageByoSectionTitle')}
                        </span>
                        <button
                            id="aiKeyHelpBtn"
                            type="button"
                            title={t('ai.keyHelpBtnTitle')}
                            aria-label={t('ai.keyHelpBtnTitle')}
                            onClick={onShowKeyHelp}
                            className="bg-[rgba(155,89,182,0.12)] border border-[rgba(155,89,182,0.35)] text-accent-purple-deep w-[22px] h-[22px] rounded-full cursor-pointer font-extrabold text-[0.72rem] leading-none inline-flex items-center justify-center font-serif italic"
                        >
                            i
                        </button>
                    </div>
                    <p
                        className="text-secondary text-[0.76rem] mt-0 mx-0 mb-2 leading-[1.5]"
                    >
                        {t('ai.keyCardSubtitle')}
                    </p>
                    <div className="relative">
                        <input
                            type={showKey ? 'text' : 'password'}
                            placeholder={t('ai.keyInputPlaceholder')}
                            autoComplete="off"
                            spellCheck={false}
                            value={geminiKey}
                            onChange={onKeyChange}
                            className="w-full box-border pt-[9px] pr-10 pb-[9px] pl-[11px] border border-[rgba(0,0,0,0.12)] rounded-[10px] text-[0.85rem] font-mono bg-card text-brand-navy"
                        />
                        <button
                            type="button"
                            title={showKey ? t('ai.keyToggleHide') : t('ai.keyToggleShow')}
                            aria-label={t('ai.keyToggleAriaLabel')}
                            onClick={onToggleShowKey}
                            className="absolute right-1.5 top-[50%] translate-y-[-50%] bg-transparent border-0 cursor-pointer py-1 px-2 text-[rgba(0,0,0,0.5)] text-[0.95rem] leading-none"
                        >
                            {showKey ? '🙈' : '👁'}
                        </button>
                    </div>
                    <div
                        style={{
                            marginTop: 6,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            minHeight: '1em',
                            color: keyStatus.color,
                        }}
                    >
                        {keyStatus.text}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
