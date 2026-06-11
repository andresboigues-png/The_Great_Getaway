// pages/templates-mount/Templates.tsx — the Templates "Discover" page.
//
// A browse surface for every creator's public template, modelled on the
// Collections page: group into albums by Continent / Year (released) /
// Creator, drill into an album, then "Use this template" to instantiate
// it into a fresh owned trip (the shared createFromTemplateAndOpen path,
// same as a /t/<code> share link). A collapsible "Have a code?" accordion
// keeps the manual-code entry that used to live in the new-trip modal.
//
// Unlike Collections (which reads archived trips from STATE), the public
// template feed isn't part of STATE — it's fetched on mount into local
// component state.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { t, tn } from '../../i18n.js';
import { esc } from '../../utils.js';
import { iconSvg } from '../../icons.js';
import { listPublicTemplates, type PublicTemplate } from '../../api/templates.js';
import { createFromTemplateAndOpen } from '../../bootstrap/template-intent.js';
import { countryCodeToFlag } from '../../utils/place-names.js';
import { CONTINENT_SILHOUETTES, CONTINENT_VIEWBOX } from '../../utils/continentSilhouettes.js';
import {
    applyTemplateView,
    groupTemplates,
    templateDestination,
    TEMPLATE_ALBUM_OTHER,
    type TemplateAlbum,
    type TemplateGroupBy,
    type TemplateSort,
} from './helpers.js';
import {
    getTemplatesView,
    setTemplatesGroupBy,
    setTemplatesSearchText,
    setTemplatesSort,
} from './state.js';

const GROUP_OPTIONS: Array<{ key: TemplateGroupBy; label: () => string }> = [
    { key: 'continent', label: () => t('templates.groupContinent') },
    { key: 'year', label: () => t('templates.groupYear') },
    { key: 'creator', label: () => t('templates.groupCreator') },
];

const SORT_OPTIONS: Array<{ key: TemplateSort; label: () => string }> = [
    { key: 'recent', label: () => t('templates.sortRecent') },
    { key: 'popular', label: () => t('templates.sortPopular') },
    { key: 'nameAsc', label: () => t('templates.sortName') },
];

export function Templates() {
    const initial = getTemplatesView();
    // null = still loading; [] = loaded-but-empty.
    const [templates, setTemplates] = useState<PublicTemplate[] | null>(null);
    const [groupBy, setGroupBy] = useState<TemplateGroupBy>(initial.groupBy);
    const [sort, setSort] = useState<TemplateSort>(initial.sort);
    const [search, setSearch] = useState(initial.searchText);
    const [openKey, setOpenKey] = useState<string | null>(null);
    const [codeOpen, setCodeOpen] = useState(false);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void listPublicTemplates().then((list) => {
            if (!cancelled) setTemplates(list);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const filtered = useMemo(
        () => applyTemplateView(templates || [], search, sort),
        [templates, search, sort],
    );
    const albums = useMemo(() => groupTemplates(filtered, groupBy), [filtered, groupBy]);
    const openAlbum = openKey ? albums.find((a) => a.key === openKey) || null : null;

    const onGroupBy = (g: TemplateGroupBy) => {
        setTemplatesGroupBy(g);
        setGroupBy(g);
        setOpenKey(null);
    };
    const onSort = (s: TemplateSort) => {
        setTemplatesSort(s);
        setSort(s);
    };
    const onSearch = (v: string) => {
        setTemplatesSearchText(v);
        setSearch(v);
        setOpenKey(null);
    };

    // Void-returning (not async) so it can be handed straight to JSX
    // handlers without tripping no-misused-promises. The async work runs
    // internally; createFromTemplateAndOpen navigates HOME + toasts on
    // success, or alerts + stays on failure.
    const instantiateTemplate = (tplCode: string): void => {
        if (busy || !tplCode) return;
        setBusy(true);
        void createFromTemplateAndOpen(tplCode).finally(() => setBusy(false));
    };

    const albumLabel = (album: TemplateAlbum): string =>
        album.key === TEMPLATE_ALBUM_OTHER || !album.label ? t('templates.albumOther') : album.label;

    return (
        <div>
            <h1 className="inline-block [background-image:var(--gradient-title)] [-webkit-background-clip:text] [-webkit-text-fill-color:transparent] bg-clip-text">
                {t('templates.title')}
            </h1>
            <p className="text-muted" style={{ marginTop: '4px' }}>{t('templates.subtitle')}</p>

            {/* Have-a-code accordion — the manual path that used to live in
                the new-trip modal. */}
            <div style={{ marginTop: '14px', marginBottom: '8px' }}>
                <button
                    type="button"
                    className="tmpl-code-pill"
                    onClick={() => setCodeOpen((v) => !v)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                    <span dangerouslySetInnerHTML={{ __html: iconSvg('tag', { size: 14 }) }} />
                    <span>{t('templates.haveCode')}</span>
                </button>
                {codeOpen && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', maxWidth: '420px' }}>
                        <input
                            type="text"
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            onKeyDown={(e) => { if (e.key === 'Enter') void instantiateTemplate(code.trim()); }}
                            placeholder={t('templates.codePlaceholder')}
                            aria-label={t('templates.codePlaceholder')}
                            autoComplete="off"
                            style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 12px', border: '1px solid rgba(0,45,91,0.14)', borderRadius: '12px', font: 'inherit', fontSize: '0.9rem', color: 'var(--text-brand-navy)', background: 'white' }}
                        />
                        <button
                            type="button"
                            className="btn-primary"
                            disabled={busy || !code.trim()}
                            onClick={() => void instantiateTemplate(code.trim())}
                        >
                            {t('templates.useBtn')}
                        </button>
                    </div>
                )}
            </div>

            {templates === null ? (
                <div className="card glass" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    {t('templates.loading')}
                </div>
            ) : templates.length === 0 ? (
                <div className="card glass" style={{ padding: '60px', textAlign: 'center' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '14px' }}>🧭</div>
                    <h2 style={{ margin: '0 0 6px' }}>{t('templates.emptyTitle')}</h2>
                    <p className="text-muted" style={{ margin: 0 }}>{t('templates.emptyBody')}</p>
                </div>
            ) : (
                <>
                    {/* Controls — groupBy + sort pills + search. */}
                    <div className="templates-controls">
                        <div className="templates-pillrow" role="group" aria-label={t('templates.groupAria')}>
                            {GROUP_OPTIONS.map((g) => (
                                <button
                                    key={g.key}
                                    type="button"
                                    className={`templates-pill${groupBy === g.key ? ' is-active' : ''}`}
                                    aria-pressed={groupBy === g.key}
                                    onClick={() => onGroupBy(g.key)}
                                >
                                    {g.label()}
                                </button>
                            ))}
                        </div>
                        <select
                            className="templates-select"
                            value={sort}
                            aria-label={t('templates.sortAria')}
                            onChange={(e) => onSort(e.target.value as TemplateSort)}
                        >
                            {SORT_OPTIONS.map((s) => (
                                <option key={s.key} value={s.key}>{s.label()}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            className="templates-search"
                            value={search}
                            onChange={(e) => onSearch(e.target.value)}
                            placeholder={t('templates.searchPlaceholder')}
                            aria-label={t('templates.searchPlaceholder')}
                            autoComplete="off"
                        />
                    </div>

                    {filtered.length === 0 ? (
                        <div className="card glass" style={{ padding: '48px', textAlign: 'center' }}>
                            <div
                                style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px', opacity: 0.6 }}
                                dangerouslySetInnerHTML={{ __html: iconSvg('search', { size: 40 }) }}
                            />
                            <h2 style={{ margin: '0 0 4px' }}>{t('templates.noMatchesTitle')}</h2>
                            <p className="text-muted" style={{ margin: 0 }}>{t('templates.noMatchesBody')}</p>
                        </div>
                    ) : openAlbum ? (
                        <div style={{ marginTop: '16px' }}>
                            <button type="button" className="templates-back" onClick={() => setOpenKey(null)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <polyline points="15 18 9 12 15 6"></polyline>
                                </svg>
                                {t('templates.back')}
                            </button>
                            <h2 style={{ margin: '10px 0 4px' }}>{albumLabel(openAlbum)}</h2>
                            <div className="grid-2" style={{ marginTop: '12px' }}>
                                {openAlbum.templates.map((tpl) => (
                                    <TemplateCard key={tpl.id} tpl={tpl} busy={busy} onUse={instantiateTemplate} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="templates-albums" style={{ marginTop: '16px' }}>
                            {albums.map((album) => (
                                <AlbumCard
                                    key={album.key}
                                    album={album}
                                    groupBy={groupBy}
                                    label={albumLabel(album)}
                                    onOpen={() => setOpenKey(album.key)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Album shelf card — continent silhouette / year / creator portrait ──
interface AlbumCardProps {
    album: TemplateAlbum;
    groupBy: TemplateGroupBy;
    label: string;
    onOpen: () => void;
}
function AlbumCard({ album, groupBy, label, onOpen }: AlbumCardProps) {
    const count = album.templates.length;
    let art: ReactNode;
    if (groupBy === 'continent' && CONTINENT_SILHOUETTES[album.key]) {
        art = (
            <svg viewBox={CONTINENT_VIEWBOX} className="templates-album__silhouette" aria-hidden="true">
                <path d={CONTINENT_SILHOUETTES[album.key]} fill="currentColor" />
            </svg>
        );
    } else if (groupBy === 'year') {
        art = <span className="templates-album__year">{album.key === TEMPLATE_ALBUM_OTHER ? '—' : album.key}</span>;
    } else if (groupBy === 'creator') {
        art = album.creatorPicture ? (
            <img className="templates-album__avatar" src={album.creatorPicture} alt="" referrerPolicy="no-referrer" />
        ) : (
            <span className="templates-album__avatar templates-album__avatar--fallback"
                  dangerouslySetInnerHTML={{ __html: iconSvg('user', { size: 34 }) }} />
        );
    } else {
        art = <span className="templates-album__year">🧭</span>;
    }

    return (
        <button type="button" className="card glass templates-album" onClick={onOpen}>
            <div className="templates-album__art">{art}</div>
            <div className="templates-album__meta">
                <span className="templates-album__label" dangerouslySetInnerHTML={{ __html: esc(label) }} />
                <span className="templates-album__count">{tn('templates.albumCount', count, { count })}</span>
            </div>
        </button>
    );
}

// ── Individual template card ───────────────────────────────────────────
interface TemplateCardProps {
    tpl: PublicTemplate;
    busy: boolean;
    onUse: (code: string) => void;
}
function TemplateCard({ tpl, busy, onUse }: TemplateCardProps) {
    const flag = countryCodeToFlag(tpl.countryCode);
    const dest = templateDestination(tpl);
    const creatorName = tpl.creator?.name || t('templates.unknownCreator');
    return (
        <div className="card glass templates-card">
            <div className="templates-card__banner">
                <span className="templates-card__flag">{flag || '🗺️'}</span>
                <span className="templates-card__days">{tn('templates.dayCount', tpl.dayCount, { count: tpl.dayCount })}</span>
            </div>
            <h3 className="templates-card__name" dangerouslySetInnerHTML={{ __html: esc(tpl.name) }} />
            {dest && <p className="templates-card__dest" dangerouslySetInnerHTML={{ __html: esc(dest) }} />}
            <div className="templates-card__creator">
                {tpl.creator?.picture ? (
                    <img className="templates-card__avatar" src={tpl.creator.picture} alt="" referrerPolicy="no-referrer" />
                ) : (
                    <span className="templates-card__avatar templates-card__avatar--fallback"
                          dangerouslySetInnerHTML={{ __html: iconSvg('user', { size: 14 }) }} />
                )}
                <span dangerouslySetInnerHTML={{ __html: esc(creatorName) }} />
            </div>
            <button
                type="button"
                className="btn-primary templates-card__use"
                disabled={busy}
                onClick={() => onUse(tpl.code)}
            >
                {t('templates.useThis')}
            </button>
        </div>
    );
}
