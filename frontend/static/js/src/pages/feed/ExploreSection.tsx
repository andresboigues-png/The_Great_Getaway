// pages/feed/ExploreSection.tsx — extracted from Feed.tsx (decomposition).
//
// The Explore tab's render path: loader → empty → country-filter
// strip + card grid. Was the `activeTab === 'explore'` branch inside
// FeedListBody; pulled out unchanged so the list-body file only deals
// with the Posts/Actions stream.
//
// §4.2 — derives country chips from the loaded explore items and
// applies the active filter. Chips: one per distinct countryCode,
// ordered by frequency (most-common first) so popular destinations
// land where the eye looks first. "All" chip resets the filter.

import type { ExploreFeedItem } from '../../api.js';
import { buildEmptyCardHtml } from '../../utils.js';
import { countryCodeToFlag } from '../../utils/place-names.js';
import { t } from '../../i18n.js';
import { ExploreCard } from './ExploreCard.js';
import { ExploreCountryChip } from './ExploreCountryChip.js';


interface ExploreSectionProps {
    explore: ExploreFeedItem[] | null;
    /** §4.2 country chip filter — null = no filter, 2-letter ISO
     *  code = restrict to that country. */
    exploreCountry: string | null;
    onPickExploreCountry: (code: string | null) => void;
}

export function ExploreSection({ explore, exploreCountry, onPickExploreCountry }: ExploreSectionProps) {
    if (explore === null) {
        return (
            <div
                className="card glass p-8 rounded-xl text-center"
            >
                <div
                    className="spinner-ring"
                    style={{
                        width: 32,
                        height: 32,
                        border: '3px solid rgba(0,199,190,0.18)',
                        borderTopColor: '#00a39d',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 14px',
                    }}
                />
                <div
                    className="text-secondary text-[0.88rem] font-semibold"
                >
                    {t('feed.exploreLoading')}
                </div>
            </div>
        );
    }
    if (explore.length === 0) {
        return (
            <div
                dangerouslySetInnerHTML={{
                    __html: buildEmptyCardHtml({
                        accent: 'blue',
                        emoji: '🌍',
                        title: t('feed.exploreEmptyTitle'),
                        body: t('feed.exploreEmptyBody'),
                    }),
                }}
            />
        );
    }
    // §4.2 — derive country chips from the loaded explore items
    // and apply the active filter. Chips: one per distinct
    // countryCode, ordered by frequency (most-common first) so
    // popular destinations land where the eye looks first.
    // "All" chip resets the filter. Filter shows only items
    // whose countryCode matches.
    const countryCounts = new Map<string, { code: string; name: string; count: number }>();
    for (const item of explore) {
        const code = (item.countryCode || '').toUpperCase();
        if (!code) continue;
        const existing = countryCounts.get(code);
        if (existing) {
            existing.count += 1;
        } else {
            countryCounts.set(code, {
                code,
                name: item.country || code,
                count: 1,
            });
        }
    }
    const chips = Array.from(countryCounts.values()).sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
    const filteredExplore = exploreCountry
        ? explore.filter((it) => (it.countryCode || '').toUpperCase() === exploreCountry)
        : explore;

    return (
        <div className="flex flex-col gap-[14px]">
            {/* Country filter strip — shown only when we have ≥2
                distinct countries (with 1 country a filter is
                redundant). Horizontally scrollable on narrow
                viewports. */}
            {chips.length >= 2 && (
                <div
                    className="explore-country-chips"
                    role="tablist"
                    aria-label={t('feed.exploreFilterAria')}
                    style={{
                        display: 'flex',
                        gap: 8,
                        overflowX: 'auto',
                        paddingBottom: 4,
                        scrollbarWidth: 'thin',
                    }}
                >
                    <ExploreCountryChip
                        label={t('feed.exploreFilterAll')}
                        count={explore.length}
                        isSelected={exploreCountry === null}
                        onClick={() => onPickExploreCountry(null)}
                    />
                    {chips.map((c) => (
                        <ExploreCountryChip
                            key={c.code}
                            flag={countryCodeToFlag(c.code)}
                            label={c.name}
                            count={c.count}
                            isSelected={exploreCountry === c.code}
                            onClick={() => onPickExploreCountry(c.code)}
                        />
                    ))}
                </div>
            )}

            {/* Filtered-empty state: chip filter picked a country
                that — between cache + a poll — now has zero items.
                Edge case; surfacing a clear "no matches" + a Clear
                button beats showing a silent empty grid. */}
            {filteredExplore.length === 0 ? (
                <div
                    className="card glass p-6 rounded-xl text-center"
                >
                    <div className="text-[1.6rem] mb-[6px]">🔎</div>
                    <div
                        className="font-extrabold text-primary mb-1"
                    >
                        {t('feed.exploreCountryEmptyTitle')}
                    </div>
                    <div
                        className="text-[0.85rem] text-secondary mb-3"
                    >
                        {t('feed.exploreCountryEmptyBody')}
                    </div>
                    <button
                        type="button"
                        onClick={() => onPickExploreCountry(null)}
                        className="py-2 px-[18px] rounded-full bg-accent-blue text-white font-bold text-[0.85rem] border-0 cursor-pointer"
                    >
                        {t('feed.exploreShowAll')}
                    </button>
                </div>
            ) : (
                <div
                    className="grid grid-cols-[repeat(auto-fill,_minmax(260px,_1fr))] gap-3.5"
                >
                    {filteredExplore.map((item) => (
                        <ExploreCard key={item.shareToken} item={item} />
                    ))}
                </div>
            )}
        </div>
    );
}
