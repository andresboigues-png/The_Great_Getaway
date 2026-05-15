// pages/profile/Profile.tsx — §3.3 React migration.
//
// Was a thin wrapper that mounted the legacy renderProfile() into a
// React tree. This commit replaces the wrapper with a full JSX
// implementation — the legacy 864-line imperative renderer in
// pages/profile.ts is now retired.
//
// Two paths
//   - Own profile (targetUserId === null OR matches STATE.user.id):
//     Reads from STATE via useStore. Achievements come from
//     STATE.achievements. Follower/following counts are fetched
//     async post-render from /api/follows/<my_id>; placeholder 0
//     stays visible briefly.
//   - Foreign profile (other userId): fetches /api/public-profile/
//     <id> once on mount, shows a loading placeholder, then renders
//     the same JSX with the fetched user + trips + achievements +
//     follow snapshot.
//
// Sub-components extracted to keep this file legible:
//   - FootprintMap — Google Maps + country fill + trip pins
//   - AchievementsStrip — badge row with tap-to-pin tooltip
//   - FollowButton — optimistic follow toggle for foreign profiles
//
// The achievement-tooltip CSS used to be appended to document.head
// on every renderData() call (with an id guard). We move that into
// a top-level useEffect so the injection happens once per page
// lifetime regardless of how many times the Profile component
// remounts.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../react/store.js';
import { STATE, emit } from '../../state.js';
import { apiFetch, uploadMedia } from '../../api.js';
import { showLiquidAlert, getHomeCurrency } from '../../utils.js';
import { CONVERSION_RATES, CURRENCY_SYMBOLS, COUNTRIES } from '../../constants.js';
import { navigate } from '../../router.js';
import { t, tn } from '../../i18n.js';
import {
    logout,
    renderLoginWall,
    openFriendsListModal,
    type ProfileFriend,
} from '../profile.js';
import { FootprintMap } from './FootprintMap.js';
import { AchievementsStrip, type ProfileAchievement } from './AchievementsStrip.js';
import { FollowButton } from './FollowButton.js';
import type { Trip, User } from '../../types';


export interface ProfileProps {
    // Required (no `?`) so `exactOptionalPropertyTypes` lets the
    // router pass through `params?.userId` which is `string | undefined`.
    // Callers explicitly pass null when there's no target.
    targetUserId: string | null | undefined;
}

interface FollowSnapshot {
    followers: number;
    following: number;
    isFollowing: boolean;
}

interface PublicProfileData {
    user: User & { bio?: string; status?: string };
    trips: Trip[];
    achievements: ProfileAchievement[];
    follow: FollowSnapshot;
}


// ── achievement tooltip CSS — injected once per page lifetime ──────
// Inline styles cover the pill itself; a stylesheet is needed for
// the :hover + :focus-visible pseudo-class state because inline
// styles can't express those.
const ACHIEVEMENT_STYLES_ID = 'ggAchievementsStyles';
const ACHIEVEMENT_STYLES = `
.achievement-tooltip {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    background: #002d5b;
    color: white;
    padding: 10px 14px;
    border-radius: 12px;
    font-size: 0.78rem;
    line-height: 1.4;
    text-align: left;
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
    white-space: normal;
    word-wrap: break-word;
    width: max-content;
    max-width: min(260px, calc(100vw - 32px));
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 120ms ease, visibility 120ms ease;
    z-index: 50;
}
.achievement-tooltip strong { color: white; font-weight: 800; font-size: 0.85rem; }
.achievement-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    width: 0; height: 0;
    border: 6px solid transparent;
    border-top-color: #002d5b;
}
.achievement-pill:hover .achievement-tooltip,
.achievement-pill:focus-visible .achievement-tooltip,
.achievement-pill.is-open .achievement-tooltip {
    opacity: 1;
    visibility: visible;
}
`;

function useAchievementStyles(): void {
    useEffect(() => {
        if (document.getElementById(ACHIEVEMENT_STYLES_ID)) return;
        const style = document.createElement('style');
        style.id = ACHIEVEMENT_STYLES_ID;
        style.textContent = ACHIEVEMENT_STYLES;
        document.head.appendChild(style);
    }, []);
}


// ── helper: imperative login wall ──────────────────────────────────
// renderLoginWall returns an HTMLElement (kept imperative because
// Google's GIS button needs a real DOM target). Bridge it into the
// React tree via a ref + appendChild on mount.
function LoginWallHost() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        host.innerHTML = '';
        host.appendChild(renderLoginWall());
    }, []);
    return <div ref={hostRef} />;
}


// ── derived helper: unique country names from a trips array ───────
function deriveUniqueCountries(trips: Trip[]): string[] {
    return [...new Set(trips.map((tr) => tr.country).filter(Boolean) as string[])];
}


// ────────────────────────────────────────────────────────────────────
// Top-level component
// ────────────────────────────────────────────────────────────────────
export function Profile({ targetUserId }: ProfileProps) {
    useAchievementStyles();
    const user = useStore((s) => s.user);

    // isOwnProfile: missing target or target matches signed-in user.
    const isOwnProfile = !targetUserId || (user && targetUserId === user.id);

    // Logged-out callers never reach this branch — the router renders
    // the app-wide login wall instead. Kept defensive in case a stale
    // link routes here without a session.
    if (!user && isOwnProfile) {
        return <LoginWallHost />;
    }

    return isOwnProfile ? (
        <OwnProfileView />
    ) : (
        <ForeignProfileView targetUserId={targetUserId!} />
    );
}


// ── own profile (data from STATE, follow counts fetched post-render) ─
function OwnProfileView() {
    const user = useStore((s) => s.user)!;
    const trips = useStore((s) => s.trips) || [];
    const archivedTrips = useStore((s) => s.archivedTrips) || [];
    const achievements = useStore((s) => (s as any).achievements as ProfileAchievement[]) || [];

    // "Completed trips" = archived OR past dateTo. Drives the
    // trip-count stat and the map's pin set.
    const allTrips = [...trips, ...archivedTrips];
    const now = new Date();
    const completedTrips = allTrips.filter(
        (tr) => tr.isArchived || (tr.dateTo && new Date(tr.dateTo) < now),
    );

    // Followers/following: fetched async on mount, kept in state.
    const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
    useEffect(() => {
        if (!user.id) return;
        let alive = true;
        apiFetch(`/api/follows/${encodeURIComponent(user.id)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (!alive || !data) return;
                setFollowCounts({
                    followers: Number(data.followers ?? 0),
                    following: Number(data.following ?? 0),
                });
            })
            .catch(() => {
                /* leave the rendered defaults */
            });
        return () => {
            alive = false;
        };
    }, [user.id]);

    return (
        <ProfileContent
            isOwnProfile={true}
            user={user}
            trips={completedTrips}
            achievements={achievements}
            followSnap={{ ...followCounts, isFollowing: false }}
            targetUserId={undefined}
        />
    );
}


// ── foreign profile (fetched from /api/public-profile) ─────────────
function ForeignProfileView({ targetUserId }: { targetUserId: string }) {
    const [data, setData] = useState<PublicProfileData | null>(null);
    const [error, setError] = useState<'not-found' | 'network' | null>(null);

    useEffect(() => {
        let alive = true;
        setData(null);
        setError(null);
        apiFetch(`/api/public-profile/${targetUserId}`)
            .then((res) => res.json())
            .then((json) => {
                if (!alive) return;
                if (json.error) {
                    setError('not-found');
                    return;
                }
                setData({
                    user: json.user,
                    trips: json.trips || [],
                    achievements: json.achievements || [],
                    follow: {
                        followers: Number(json.followers || 0),
                        following: Number(json.following || 0),
                        isFollowing: Boolean(json.isFollowing),
                    },
                });
            })
            .catch(() => {
                if (alive) setError('network');
            });
        return () => {
            alive = false;
        };
    }, [targetUserId]);

    if (error === 'not-found') {
        return <p style={{ textAlign: 'center', padding: 50 }}>User not found.</p>;
    }
    if (error === 'network') {
        return <p style={{ textAlign: 'center', padding: 50 }}>Error loading profile.</p>;
    }
    if (!data) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                <p
                    style={{
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                        animation: 'pulse 1.5s infinite',
                    }}
                >
                    Fetching profile...
                </p>
            </div>
        );
    }

    return (
        <ProfileContent
            isOwnProfile={false}
            user={data.user}
            trips={data.trips}
            achievements={data.achievements}
            followSnap={data.follow}
            targetUserId={targetUserId}
        />
    );
}


// ── ProfileContent — shared JSX for both own and foreign profile ──
interface ProfileContentProps {
    isOwnProfile: boolean;
    user: User & { bio?: string; status?: string };
    trips: Trip[];
    achievements: ProfileAchievement[];
    followSnap: FollowSnapshot;
    // Required-with-undefined rather than optional so callers can
    // pass through a possibly-undefined value under
    // exactOptionalPropertyTypes. Foreign profile passes a string,
    // own profile passes undefined.
    targetUserId: string | undefined;
}

function ProfileContent({
    isOwnProfile,
    user,
    trips,
    achievements,
    followSnap,
    targetUserId,
}: ProfileContentProps) {
    const uniqueCountries = deriveUniqueCountries(trips);

    return (
        <div className="profile-page" style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>
            {!isOwnProfile ? (
                <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => navigate('friends')}
                    style={{
                        marginBottom: 20,
                        background: 'rgba(0,0,0,0.05)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--glass-border)',
                        padding: '8px 16px',
                        borderRadius: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    Back to Friends
                </button>
            ) : null}

            {/* Profile Header */}
            <div
                className="profile-header"
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 40,
                    padding: '30px 20px',
                    borderBottom: '1px solid var(--glass-border)',
                    marginBottom: 30,
                }}
            >
                <ProfilePicSection isOwnProfile={isOwnProfile} user={user} />
                <ProfileInfoSection
                    isOwnProfile={isOwnProfile}
                    user={user}
                    trips={trips}
                    uniqueCountries={uniqueCountries}
                    followSnap={followSnap}
                    targetUserId={targetUserId}
                />
            </div>

            {/* Footprint label */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: 'var(--accent-blue)',
                    }}
                >
                    {/* Literal footprint glyph (sole + 5 toes). */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <ellipse cx="12" cy="14" rx="4.2" ry="6" />
                        <ellipse cx="6.5" cy="6" rx="1.4" ry="1.7" />
                        <ellipse cx="9.6" cy="3.7" rx="1.3" ry="1.6" />
                        <ellipse cx="13.1" cy="3.4" rx="1.3" ry="1.6" />
                        <ellipse cx="16.3" cy="4.5" rx="1.3" ry="1.6" />
                        <ellipse cx="18.4" cy="7.4" rx="1.3" ry="1.6" />
                    </svg>
                    {isOwnProfile ? 'Your footprint' : `${user.name.split(' ')[0]}'s footprint`}
                </div>
            </div>

            {/* Achievements — visible on own profile even when empty
                (so the surface is discoverable). Hidden entirely on a
                friend's profile when there's nothing earned. */}
            {(achievements.length > 0 || isOwnProfile) ? (
                <div
                    style={{
                        marginTop: 30,
                        padding: 20,
                        borderRadius: 16,
                        background: 'rgba(0,113,227,0.04)',
                        border: '1px solid var(--glass-border)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            marginBottom: 14,
                        }}
                    >
                        <h3
                            style={{
                                margin: 0,
                                fontSize: '1rem',
                                fontWeight: 800,
                                letterSpacing: '-0.02em',
                                color: 'var(--text-primary)',
                            }}
                        >
                            🏅 Achievements
                        </h3>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {achievements.length} earned
                        </span>
                    </div>
                    {achievements.length === 0 ? (
                        <p
                            style={{
                                margin: 0,
                                color: 'var(--text-secondary)',
                                fontSize: '0.85rem',
                                textAlign: 'center',
                                padding: '12px 0',
                            }}
                        >
                            Earn your first badge by creating a trip, completing one, or settling up with a friend.
                        </p>
                    ) : (
                        <AchievementsStrip achievements={achievements} />
                    )}
                </div>
            ) : null}

            {/* Footprint section */}
            <div style={{ marginTop: 20 }}>
                <p
                    style={{
                        color: 'var(--text-secondary)',
                        textAlign: 'center',
                        marginTop: 0,
                        marginBottom: 24,
                        fontSize: '0.9rem',
                    }}
                >
                    {isOwnProfile
                        ? "Every country you've been to, lit up."
                        : `Explore where ${user.name.split(' ')[0]} has been.`}
                </p>
                <FootprintMap trips={trips} uniqueCountries={uniqueCountries} />
            </div>
        </div>
    );
}


// ── Avatar section ────────────────────────────────────────────────
function ProfilePicSection({
    isOwnProfile,
    user,
}: {
    isOwnProfile: boolean;
    user: User & { picture?: string };
}) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    // displaySrc is local state so the optimistic preview (FileReader
    // dataURL) renders the moment the user picks a file, before the
    // network upload + /api/profile/update round-trip lands.
    const [displaySrc, setDisplaySrc] = useState<string>(user.picture || '');
    const [fallbackVisible, setFallbackVisible] = useState<boolean>(!user.picture);

    // Sync local preview state with parent prop changes (e.g. when
    // user.picture updates after the upload reconciles).
    useEffect(() => {
        setDisplaySrc(user.picture || '');
        setFallbackVisible(!user.picture);
    }, [user.picture]);

    const onPickFile = () => fileInputRef.current?.click();

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !STATE.user) return;

        // 1) Optimistic preview while the upload runs.
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = typeof ev.target?.result === 'string' ? ev.target.result : null;
            if (result) {
                setDisplaySrc(result);
                setFallbackVisible(false);
            }
        };
        reader.readAsDataURL(file);

        // 2) Real upload.
        const uploaded = await uploadMedia(file);
        if (!uploaded?.url) {
            const msg = uploaded?.error || t('profile.photoUploadFailed');
            showLiquidAlert(msg);
            setDisplaySrc(STATE.user.picture || '');
            setFallbackVisible(!STATE.user.picture);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        // 3) Persist URL on the user's row.
        try {
            const res = await apiFetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ picture: uploaded.url }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const msg =
                    body?.error ||
                    (res.status === 401
                        ? t('profile.photoSessionExpired')
                        : t('profile.photoSaveFailed', { status: res.status }));
                showLiquidAlert(msg);
                setDisplaySrc(STATE.user.picture || '');
                setFallbackVisible(!STATE.user.picture);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
            // Success: write back to STATE so every render site (nav
            // avatar, feed cards, companion chips) picks up the new
            // URL on the next state-change emit.
            STATE.user.picture = uploaded.url;
            emit('state:changed');
            showLiquidAlert(t('profile.photoUploaded'));
        } catch (err) {
            console.error('profile/update picture failed:', err);
            showLiquidAlert(t('profile.photoSaveNetwork'));
            setDisplaySrc(STATE.user.picture || '');
            setFallbackVisible(!STATE.user.picture);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const initial = (user.name || '?').slice(0, 1).toUpperCase();

    return (
        <div
            style={{
                position: 'relative',
                flexShrink: 0,
                cursor: isOwnProfile ? 'pointer' : 'default',
                borderRadius: '50%',
            }}
            title={isOwnProfile ? 'Change profile photo' : ''}
            onClick={isOwnProfile ? onPickFile : undefined}
        >
            <div
                style={{
                    padding: 4,
                    background:
                        'linear-gradient(135deg, #4da3ff 0%, var(--accent-blue) 50%, #004080 100%)',
                    borderRadius: '50%',
                }}
            >
                <img
                    id="profilePicDisplay"
                    src={displaySrc}
                    alt="Profile Picture"
                    referrerPolicy="no-referrer"
                    onError={() => setFallbackVisible(true)}
                    style={{
                        width: 140,
                        height: 140,
                        borderRadius: '50%',
                        border: '4px solid var(--bg-color)',
                        objectFit: 'cover',
                        display: fallbackVisible ? 'none' : 'block',
                        transition: 'opacity 0.2s',
                        background: 'var(--bg-color)',
                    }}
                />
                {/* Fallback initials avatar — shown when picture URL is
                    empty OR the image fails to load. */}
                <div
                    style={{
                        display: fallbackVisible ? 'flex' : 'none',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 140,
                        height: 140,
                        borderRadius: '50%',
                        border: '4px solid var(--bg-color)',
                        background: 'var(--gradient-day)',
                        color: 'white',
                        fontSize: '3rem',
                        fontWeight: 800,
                        letterSpacing: '-0.04em',
                    }}
                >
                    {initial}
                </div>
            </div>
            {isOwnProfile ? (
                <>
                    {/* Persistent camera badge — visible on touch
                        devices that don't have hover. */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            right: 2,
                            bottom: 2,
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: 'var(--accent-blue, #007aff)',
                            border: '3px solid var(--bg-color, #fff)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                            pointerEvents: 'none',
                        }}
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                            <circle cx="12" cy="13" r="4"></circle>
                        </svg>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={onFileChange}
                    />
                </>
            ) : null}
        </div>
    );
}


// ── Info section: name, stats, bio block ──────────────────────────
interface ProfileInfoSectionProps {
    isOwnProfile: boolean;
    user: User & { bio?: string; status?: string };
    trips: Trip[];
    uniqueCountries: string[];
    followSnap: FollowSnapshot;
    targetUserId: string | undefined;
}

function ProfileInfoSection({
    isOwnProfile,
    user,
    trips,
    uniqueCountries,
    followSnap,
    targetUserId,
}: ProfileInfoSectionProps) {
    const [followers, setFollowers] = useState(followSnap.followers);
    useEffect(() => setFollowers(followSnap.followers), [followSnap.followers]);

    return (
        <div className="profile-info" style={{ flex: 1, paddingTop: 10, minWidth: 0 }}>
            <div
                className="profile-name-row"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 24,
                    gap: 12,
                }}
            >
                <h2
                    style={{
                        margin: 0,
                        fontSize: '1.6rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.02em',
                        minWidth: 0,
                        overflowWrap: 'anywhere',
                    }}
                >
                    {user.name}
                </h2>
                {isOwnProfile ? (
                    <button
                        type="button"
                        className="btn-logout"
                        onClick={() => {
                            void logout();
                        }}
                    >
                        Log Out
                    </button>
                ) : targetUserId ? (
                    <FollowButton
                        targetUserId={targetUserId}
                        initialIsFollowing={followSnap.isFollowing}
                        onFollowersChange={setFollowers}
                    />
                ) : null}
            </div>

            {/* Profile stats — visual identity shared across all 4
                values. Each row reads `{count}  {accent-blue label}`.
                The blue label colour comes from --accent-blue-deep
                so it pops on both light + dark. Friends is an extra
                button (interactive); the other three are read-only
                spans but adopt the same visual rhythm. */}
            <div
                className="profile-stats"
                style={{ display: 'flex', gap: 32, marginBottom: 24, flexWrap: 'wrap' }}
            >
                <ProfileStat
                    count={trips.length}
                    label={tn('profile.publicTripsLabel', trips.length)}
                />
                <ProfileStat
                    count={uniqueCountries.length}
                    label={tn('profile.countriesLabel', uniqueCountries.length)}
                />
                <ProfileStat count={followers} label="followers" />
                <ProfileStat count={followSnap.following} label="following" />
                {isOwnProfile ? <FriendsStat /> : null}
            </div>

            <BioBlock isOwnProfile={isOwnProfile} user={user} />
        </div>
    );
}


// ── Shared stat row component — `{number} {accent-blue label}`. ───
// Used by trips / countries / followers / following. Friends stat
// is a separate component because it's a clickable button (opens
// the friends modal) — but it adopts the same visual rhythm via
// the same inner span styles.
function ProfileStat({ count, label }: { count: number; label: string }) {
    return (
        <div style={{ textAlign: 'left', display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {count}
            </span>
            <span
                style={{
                    fontSize: '1.1rem',
                    color: 'var(--accent-blue-deep)',
                    fontWeight: 600,
                }}
            >
                {label}
            </span>
        </div>
    );
}


// ── Friends stat (own profile only) — async list + modal ──────────
function FriendsStat() {
    const [friendsCache, setFriendsCache] = useState<ProfileFriend[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let alive = true;
        apiFetch('/api/friends/list')
            .then((r) => (r.ok ? r.json() : []))
            .then((list) => {
                if (!alive || !Array.isArray(list)) return;
                setFriendsCache(list);
                setLoaded(true);
            })
            .catch(() => {
                /* leave the "—" placeholder */
            });
        return () => {
            alive = false;
        };
    }, []);

    const count = loaded ? friendsCache.length : null;

    const onClick = () => {
        if (friendsCache.length === 0) {
            // Either no friends yet, or the fetch is still in flight.
            // Either way, push the user to /friends where they can
            // either add friends or see their list once it loads.
            navigate('friends');
            return;
        }
        openFriendsListModal(friendsCache);
    };

    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                background: 'none',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 4,
                fontFamily: 'inherit',
            }}
        >
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {count === null ? '—' : String(count)}
            </span>
            <span
                style={{
                    fontSize: '1.1rem',
                    color: 'var(--accent-blue-deep)',
                    fontWeight: 600,
                    textDecoration: 'underline',
                    textDecorationColor: 'rgba(0,113,227,0.32)',
                    textUnderlineOffset: 3,
                }}
            >
                {tn('profile.friendsLabel', count ?? 0)}
            </span>
        </button>
    );
}


// ── Bio block: email + status + bio + (own only) save controls ───
function BioBlock({
    isOwnProfile,
    user,
}: {
    isOwnProfile: boolean;
    user: User & { bio?: string; status?: string };
}) {
    // Uncontrolled inputs with refs — match the legacy pattern. Save
    // button reads values on click. We track dirty state via a single
    // boolean that flips on the first change of any field.
    const statusRef = useRef<HTMLSelectElement | null>(null);
    const bioRef = useRef<HTMLTextAreaElement | null>(null);
    const homeCurrencyRef = useRef<HTMLSelectElement | null>(null);
    const homeCountryRef = useRef<HTMLSelectElement | null>(null);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    const onSave = async () => {
        if (!STATE.user) return;
        const newStatus = statusRef.current?.value || '';
        const newBio = bioRef.current?.value || '';
        const newHomeCurrency = homeCurrencyRef.current
            ? homeCurrencyRef.current.value
            : STATE.user.homeCurrency || null;
        // Empty string = "Not set" sentinel from the dropdown — store
        // as null so downstream readers (AI page default destination,
        // country-stats) can distinguish "user actively cleared" from
        // "never picked" without two states.
        const newHomeCountry = homeCountryRef.current
            ? homeCountryRef.current.value || null
            : STATE.user.homeCountry || null;
        setSaving(true);
        try {
            const res = await apiFetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bio: newBio,
                    status: newStatus,
                    homeCurrency: newHomeCurrency,
                    homeCountry: newHomeCountry,
                }),
            });
            if (res.ok) {
                STATE.user.bio = newBio;
                STATE.user.status = newStatus;
                STATE.user.homeCurrency = newHomeCurrency;
                STATE.user.homeCountry = newHomeCountry;
                emit('state:changed');
                setDirty(false);
                showLiquidAlert(t('profile.updated'));
            } else {
                showLiquidAlert(
                    res.status === 401
                        ? t('profile.photoSessionExpired')
                        : t('profile.saveFailed', { status: res.status }),
                );
            }
        } catch (e) {
            console.error('Profile update failed:', e);
            showLiquidAlert(t('profile.saveNetwork'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="profile-bio-block">
            <div
                className="profile-email"
                style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    marginBottom: 4,
                    overflowWrap: 'anywhere',
                }}
            >
                {user.email}
            </div>

            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 8 }}>
                {isOwnProfile ? (
                    <>
                        <select
                            ref={statusRef}
                            className="brand-select"
                            aria-label="Set your travel status"
                            defaultValue={user.status || ''}
                            onChange={() => setDirty(true)}
                            style={{ padding: '2px 24px 2px 10px', fontSize: 'var(--font-base)' }}
                        >
                            <option value="" disabled>
                                Set status...
                            </option>
                            <option value="Deliberating next trip">🤔 Deliberating next trip</option>
                            <option value="Preparing a trip right now">🎒 Preparing a trip right now</option>
                            <option value="Exploring the world">🌍 Exploring the world</option>
                            <option value="Resting at home base">🏠 Resting at home base</option>
                            <option value="Hunting for flight deals">✈️ Hunting for flight deals</option>
                        </select>
                        <div className="brand-select-chevron" style={{ right: 8 }}>
                            ▼
                        </div>
                    </>
                ) : (
                    <div
                        style={{
                            background: 'rgba(0, 113, 227, 0.05)',
                            color: '#005bb8',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--space-1) var(--space-3)',
                            fontSize: 'var(--font-base)',
                            fontWeight: 700,
                            display: 'inline-block',
                        }}
                    >
                        {user.status || 'Active Traveler'}
                    </div>
                )}
            </div>

            {isOwnProfile ? (
                <>
                    <textarea
                        ref={bioRef}
                        className="bio-input"
                        placeholder="Add a bio..."
                        defaultValue={user.bio || ''}
                        onInput={() => setDirty(true)}
                    />

                    <div style={{ marginTop: 14, maxWidth: 500 }}>
                        <label
                            style={{
                                display: 'block',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: 'var(--text-secondary)',
                                marginBottom: 6,
                                letterSpacing: '0.04em',
                            }}
                        >
                            Home country — where you call "home base"
                        </label>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <select
                                ref={homeCountryRef}
                                className="brand-select"
                                defaultValue={user.homeCountry || ''}
                                onChange={() => setDirty(true)}
                                style={{ padding: '6px 28px 6px 12px', fontSize: 'var(--font-sm)' }}
                            >
                                {/* Empty option = "not set" sentinel.
                                    Picking it clears the home country
                                    server-side (we send null). */}
                                <option value="">— Not set —</option>
                                {COUNTRIES.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                            <div className="brand-select-chevron" style={{ right: 10 }}>
                                ▼
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 14, maxWidth: 500 }}>
                        <label
                            style={{
                                display: 'block',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                color: 'var(--text-secondary)',
                                marginBottom: 6,
                                letterSpacing: '0.04em',
                            }}
                        >
                            Home currency — what you'll see totals and insights in
                        </label>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <select
                                ref={homeCurrencyRef}
                                className="brand-select"
                                defaultValue={getHomeCurrency()}
                                onChange={() => setDirty(true)}
                                style={{ padding: '6px 28px 6px 12px', fontSize: 'var(--font-sm)' }}
                            >
                                {Object.keys(CONVERSION_RATES).map((code) => (
                                    <option key={code} value={code}>
                                        {CURRENCY_SYMBOLS[code] || code}&nbsp;&nbsp;{code}
                                    </option>
                                ))}
                            </select>
                            <div className="brand-select-chevron" style={{ right: 10 }}>
                                ▼
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                        <button
                            type="button"
                            className="btn btn-small"
                            onClick={onSave}
                            disabled={saving || !dirty}
                            style={{
                                background: 'var(--text-primary)',
                                color: 'var(--bg-color)',
                                padding: '10px 18px',
                                minHeight: 'var(--tap-min)',
                                borderRadius: 999,
                                border: 0,
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                opacity: dirty ? 1 : 0,
                                transition: 'opacity 0.3s',
                                pointerEvents: dirty ? 'auto' : 'none',
                                cursor: dirty ? 'pointer' : 'default',
                            }}
                        >
                            {saving ? 'Saving…' : 'Save Profile'}
                        </button>
                    </div>
                </>
            ) : (
                <p
                    style={{
                        fontSize: '0.95rem',
                        color: 'var(--text-primary)',
                        lineHeight: 1.5,
                        margin: '4px 0',
                    }}
                >
                    {user.bio || 'No bio yet.'}
                </p>
            )}
        </div>
    );
}
