// pages/settings/Creator.tsx — Settings → Creator options.
//
// Visible only to "Creator" accounts (STATE.user.isCreator). Lets a creator
// publish FROZEN snapshots of their trips as code-addressable Trip Templates
// that anyone can turn into their own trip ("Create from template").
//
// A template is a snapshot taken at save time, pre-stripped server-side of
// all sensitive data — only the chosen {day plans, marked places, checklist}
// plus destination/structure are stored. Editing re-snapshots from a chosen
// trip but keeps the same code, so shared codes keep working.

import { useEffect, useState } from 'react';
import { useStore } from '../../react/store.js';
import { t } from '../../i18n.js';
import { showLiquidAlert } from '../../utils.js';
import {
    listTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    type TemplateSummary,
} from '../../api.js';

/** Human-readable code: 8 stored chars shown grouped as XXXX-XXXX. */
function formatCode(code: string): string {
    return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function Creator() {
    const trips = useStore((s) => s.trips) || [];

    const [templates, setTemplates] = useState<TemplateSummary[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state. editingId === null → create mode; otherwise edit that id.
    const [editingId, setEditingId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [sourceTripId, setSourceTripId] = useState('');
    const [inclPlans, setInclPlans] = useState(true);
    const [inclPlaces, setInclPlaces] = useState(true);
    const [inclChecklist, setInclChecklist] = useState(true);
    const [isPublic, setIsPublic] = useState(true);
    const [saving, setSaving] = useState(false);

    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        void (async () => {
            const list = await listTemplates();
            if (alive) {
                setTemplates(list);
                setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const resetForm = () => {
        setEditingId(null);
        setName('');
        setSourceTripId('');
        setInclPlans(true);
        setInclPlaces(true);
        setInclChecklist(true);
        setIsPublic(true);
    };

    const startEdit = (tmpl: TemplateSummary) => {
        setEditingId(tmpl.id);
        setName(tmpl.name);
        setSourceTripId(tmpl.sourceTripId || '');
        setInclPlans(tmpl.includePlans);
        setInclPlaces(tmpl.includePlaces);
        setInclChecklist(tmpl.includeChecklist);
        setIsPublic(tmpl.isPublic);
        setConfirmDeleteId(null);
    };

    // All toggles off → the snapshot carries only destination/structure and
    // publishes as a hollow card. Block that before the save round-trip.
    const contentEmpty = !inclPlans && !inclPlaces && !inclChecklist;

    const onSave = async () => {
        if (saving) return;
        const trimmed = name.trim();
        if (!trimmed || !sourceTripId) return;
        if (contentEmpty) {
            showLiquidAlert(t('settings.creatorEmptyWarn'));
            return;
        }
        setSaving(true);
        const input = {
            name: trimmed,
            sourceTripId,
            includePlans: inclPlans,
            includePlaces: inclPlaces,
            includeChecklist: inclChecklist,
            isPublic,
        };
        const result = editingId
            ? await updateTemplate(editingId, input)
            : await createTemplate(input);
        setSaving(false);
        if (!result) {
            // The server rejects an over-cap snapshot with 413; name that
            // reason so the failure isn't buried behind a generic retry toast.
            showLiquidAlert(t('settings.creatorSaveErrorSized'));
            return;
        }
        // Re-pull the list so the new/updated row (with code + counts) shows.
        setTemplates(await listTemplates());
        resetForm();
        showLiquidAlert(t('settings.creatorSavedToast'), 'success');
    };

    const onDelete = async (id: string) => {
        if (confirmDeleteId !== id) {
            setConfirmDeleteId(id);
            return;
        }
        setConfirmDeleteId(null);
        const ok = await deleteTemplate(id);
        if (!ok) {
            showLiquidAlert(t('settings.creatorSaveError'));
            return;
        }
        setTemplates((prev) => prev.filter((x) => x.id !== id));
        if (editingId === id) resetForm();
        showLiquidAlert(t('settings.creatorDeletedToast'), 'success');
    };

    const onCopy = async (tmpl: TemplateSummary) => {
        try {
            await navigator.clipboard.writeText(formatCode(tmpl.code));
            setCopiedId(tmpl.id);
            setTimeout(() => setCopiedId((c) => (c === tmpl.id ? null : c)), 1600);
        } catch {
            showLiquidAlert(formatCode(tmpl.code), 'info');
        }
    };

    const includesSummary = (tmpl: TemplateSummary): string => {
        const parts: string[] = [];
        if (tmpl.includePlans) parts.push(t('settings.creatorInclPlans'));
        if (tmpl.includePlaces) parts.push(t('settings.creatorInclPlaces'));
        if (tmpl.includeChecklist) parts.push(t('settings.creatorInclChecklist'));
        return parts.length ? parts.join(' · ') : '—';
    };

    return (
        <div className="card glass settings-section card-glow-blue">
            <h2 className="card-title m-0 mb-2">{t('settings.creatorTitle')}</h2>
            <p className="st-help-text mb-5">{t('settings.creatorIntro')}</p>

            {/* ── Create / edit form ─────────────────────────────────── */}
            <div className="section-divider">
                <h3 className="mb-3 text-[length:var(--font-lg)]">
                    {editingId ? t('settings.creatorEditHeading') : t('settings.creatorNewHeading')}
                </h3>

                {trips.length === 0 ? (
                    <p className="text-secondary text-[0.9rem]">{t('settings.creatorNoTrips')}</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        <input
                            type="text"
                            className="glass-input"
                            placeholder={t('settings.creatorNamePlaceholder')}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            aria-label={t('settings.creatorNameLabel')}
                        />
                        <select
                            className="glass-input"
                            value={sourceTripId}
                            onChange={(e) => setSourceTripId(e.target.value)}
                            aria-label={t('settings.creatorTripLabel')}
                        >
                            <option value="">{t('settings.creatorTripPlaceholder')}</option>
                            {trips.map((trip) => (
                                <option key={trip.id} value={trip.id}>
                                    {trip.name}
                                    {(trip.isArchived || trip.myArchived) ? ` ${t('settings.creatorArchivedTag')}` : ''}
                                </option>
                            ))}
                        </select>

                        <div className="flex flex-wrap gap-4 py-1">
                            <label className="flex items-center gap-2 text-[0.9rem] cursor-pointer">
                                <input type="checkbox" checked={inclPlans} onChange={(e) => setInclPlans(e.target.checked)} />
                                {t('settings.creatorInclPlans')}
                            </label>
                            <label className="flex items-center gap-2 text-[0.9rem] cursor-pointer">
                                <input type="checkbox" checked={inclPlaces} onChange={(e) => setInclPlaces(e.target.checked)} />
                                {t('settings.creatorInclPlaces')}
                            </label>
                            <label className="flex items-center gap-2 text-[0.9rem] cursor-pointer">
                                <input type="checkbox" checked={inclChecklist} onChange={(e) => setInclChecklist(e.target.checked)} />
                                {t('settings.creatorInclChecklist')}
                            </label>
                        </div>

                        {contentEmpty ? (
                            <p className="text-secondary text-[0.78rem]" role="status">
                                {t('settings.creatorEmptyWarn')}
                            </p>
                        ) : null}

                        <label className="flex items-center gap-2 text-[0.9rem] cursor-pointer">
                            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                            <span>
                                {t('settings.creatorListOnDiscover')}
                                <span className="block text-secondary text-[0.78rem]">{t('settings.creatorListOnDiscoverHint')}</span>
                            </span>
                        </label>

                        <div className="flex gap-2 flex-wrap">
                            <button
                                type="button"
                                className="btn-primary py-2.5 px-5"
                                disabled={saving || !name.trim() || !sourceTripId || contentEmpty}
                                onClick={() => void onSave()}
                            >
                                {editingId ? t('settings.creatorUpdateBtn') : t('settings.creatorSaveBtn')}
                            </button>
                            {editingId ? (
                                <button type="button" className="btn-neutral py-2.5 px-5" onClick={resetForm}>
                                    {t('settings.creatorCancelEdit')}
                                </button>
                            ) : null}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Existing templates ─────────────────────────────────── */}
            <div className="section-divider">
                <h3 className="mb-3 text-[length:var(--font-lg)]">{t('settings.creatorListHeading')}</h3>
                {loading ? (
                    <p className="text-secondary text-[0.9rem]">{t('settings.creatorLoading')}</p>
                ) : templates.length === 0 ? (
                    <p className="text-secondary text-[0.9rem]">{t('settings.creatorEmpty')}</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {templates.map((tmpl) => (
                            <div key={tmpl.id} className="tmpl-row">
                                <div className="tmpl-row__main">
                                    <div className="tmpl-row__name">
                                        {tmpl.name}
                                        {!tmpl.isPublic ? (
                                            <span className="tmpl-row__badge">{t('settings.creatorUnlisted')}</span>
                                        ) : null}
                                    </div>
                                    <div className="tmpl-row__meta">
                                        {includesSummary(tmpl)} · {t('settings.creatorUsedN', { n: tmpl.useCount })}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="tmpl-row__code"
                                    title={t('settings.creatorCopyCode')}
                                    onClick={() => void onCopy(tmpl)}
                                >
                                    <span className="tmpl-row__code-text">{formatCode(tmpl.code)}</span>
                                    <span className="tmpl-row__code-hint">
                                        {copiedId === tmpl.id ? t('settings.creatorCopied') : t('settings.creatorCopyCode')}
                                    </span>
                                </button>
                                <div className="tmpl-row__actions">
                                    <button type="button" className="btn-neutral btn-small py-1.5 px-3" onClick={() => startEdit(tmpl)}>
                                        {t('settings.creatorEdit')}
                                    </button>
                                    <button
                                        type="button"
                                        className={`btn-small py-1.5 px-3 ${confirmDeleteId === tmpl.id ? 'btn-danger' : 'btn-neutral'}`}
                                        onClick={() => void onDelete(tmpl.id)}
                                        onBlur={() => setConfirmDeleteId((c) => (c === tmpl.id ? null : c))}
                                    >
                                        {confirmDeleteId === tmpl.id ? t('settings.creatorConfirmDelete') : t('settings.creatorDelete')}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
