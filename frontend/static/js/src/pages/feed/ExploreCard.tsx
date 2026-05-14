// pages/feed/ExploreCard.tsx — §3.3 React migration (Feed wave 7).
//
// Single Explore-tab tile. Public-trip discovery card: cover image,
// trip name, country, owner first-name chip + avatar, view count
// badge. Anchor target is /share/<token> — the public share page —
// so middle-click / cmd-click opens in a new tab naturally.
//
// No state of its own; it's a pure presentational component.

import type { ExploreFeedItem } from '../../api.js';


export function ExploreCard({ item }: { item: ExploreFeedItem }) {
    const coverStyle: React.CSSProperties = item.coverUrl
        ? {
              backgroundImage: `url('${item.coverUrl}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
          }
        : { background: 'linear-gradient(135deg, #00c7be 0%, #007aff 100%)' };

    const firstInitial = (item.owner.firstName || '?').slice(0, 1).toUpperCase();

    return (
        <a
            className="card glass feed-explore-card"
            href={`/share/${item.shareToken}`}
            style={{
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
                padding: 0,
                borderRadius: 18,
                overflow: 'hidden',
                boxShadow: '0 4px 14px rgba(0,45,91,0.06)',
                border: '1px solid rgba(0,199,190,0.18)',
            }}
        >
            <div style={{ ...coverStyle, height: 160, position: 'relative' }}>
                <div
                    style={{
                        position: 'absolute',
                        right: 10,
                        top: 10,
                        background: 'rgba(0,0,0,0.55)',
                        color: 'white',
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    👁 {item.shareViews}
                </div>
            </div>
            <div style={{ padding: '14px 16px' }}>
                <div
                    style={{
                        fontSize: '1.05rem',
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.02em',
                        marginBottom: 4,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {item.name}
                </div>
                <div
                    style={{
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        marginBottom: 10,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {item.country}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {item.owner.picture ? (
                        <img
                            src={item.owner.picture}
                            alt=""
                            referrerPolicy="no-referrer"
                            style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                        />
                    ) : (
                        <div
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: 'rgba(0,113,227,0.18)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#005bb8',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                            }}
                        >
                            {firstInitial}
                        </div>
                    )}
                    <span
                        style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            fontWeight: 600,
                        }}
                    >
                        by {item.owner.firstName || 'Traveller'}
                    </span>
                </div>
            </div>
        </a>
    );
}
