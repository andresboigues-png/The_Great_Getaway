// pages/feed/ExploreCard.tsx — §3.3 React migration (Feed wave 7).
//
// Single Explore-tab tile. Public-trip discovery card: cover image,
// trip name, country, owner first-name chip + avatar, view count
// badge. Anchor target is /share/<token> — the public share page —
// so middle-click / cmd-click opens in a new tab naturally.
//
// No state of its own; it's a pure presentational component.

import type { ExploreFeedItem } from '../../api.js';
import { Avatar } from '../../react/components/Avatar.js';


export function ExploreCard({ item }: { item: ExploreFeedItem }) {
    const coverStyle: React.CSSProperties = item.coverUrl
        ? {
              backgroundImage: `url('${item.coverUrl}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
          }
        : { background: 'linear-gradient(135deg, #00c7be 0%, #007aff 100%)' };

    return (
        <a
            className="card glass feed-explore-card block no-underline text-inherit p-0 rounded-lg overflow-hidden shadow-[0_4px_14px_rgba(0,45,91,0.06)] border border-[rgba(0,199,190,0.18)]"
            href={`/share/${item.shareToken}`}
        >
            <div style={{ ...coverStyle, height: 160, position: 'relative' }}>
                <div
                    className="absolute right-2.5 top-2.5 bg-[rgba(0,0,0,0.55)] text-white py-1 px-2.5 rounded-full text-[0.72rem] font-bold backdrop-blur"
                >
                    👁 {item.shareViews}
                </div>
            </div>
            <div className="py-3.5 px-4">
                <div
                    className="text-[1.05rem] font-extrabold text-primary tracking-[-0.02em] mb-1 overflow-hidden overflow-ellipsis whitespace-nowrap"
                >
                    {item.name}
                </div>
                <div
                    className="text-[0.82rem] text-secondary font-semibold mb-2.5 overflow-hidden overflow-ellipsis whitespace-nowrap"
                >
                    {item.country}
                </div>
                <div className="flex items-center gap-2">
                    <Avatar
                        user={{ name: item.owner.firstName, picture: item.owner.picture }}
                        size={24}
                    />
                    <span
                        className="text-[0.8rem] text-secondary font-semibold"
                    >
                        by {item.owner.firstName || 'Traveller'}
                    </span>
                </div>
            </div>
        </a>
    );
}
