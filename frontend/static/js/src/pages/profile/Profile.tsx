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
import type { ReactNode, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useStore } from '../../react/store.js';
import { STATE, emit } from '../../state.js';
import { apiFetch, uploadMedia, blockUser } from '../../api.js';
import { showLiquidAlert, getHomeCurrency, showConfirmModal } from '../../utils.js';
import { CONVERSION_RATES, CURRENCY_SYMBOLS, COUNTRIES } from '../../constants.js';
import { navigate } from '../../router.js';
import { clearAllManualFx } from '../../utils/manualRates.js';
import { clearAllFxOverrides } from '../../utils/fxOverrides.js';
import { t, tn } from '../../i18n.js';
import {
    logout,
    openStatListModal,
    type ProfileFriend,
    type StatListItem,
} from '../profile.js';
import { LoginWall } from './LoginWall.js';
import { FootprintMap } from './FootprintMap.js';
import { AchievementsStrip, type ProfileAchievement } from './AchievementsStrip.js';
import { FollowButton } from './FollowButton.js';
import type { Trip, User } from '../../types';
// Page-scoped CSS — Google Maps InfoWindow chrome (.profile-iw*).
// FIXING_ROADMAP §3.1 fourth slice. Vite chunks this alongside the
// Profile JS bundle so users who never view a profile don't pay for
// these ~95 lines in the initial CSS payload.
import './profile.css';


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


// ── derived helper: unique country names from a trips array ───────
//
// §4.3 follow-up (2026-05-17): pre-§4.3 this returned one entry per
// trip from the scalar `tr.country` field. Post-§4.3, trips carry a
// `tr.countries` array of ISO codes for every country the trip
// touches (built by HeroMap's reverse-geocode loop on day pins). The
// chip-strip + footprint map should reflect ALL of them — a single
// Iberian trip should now light up BOTH Portugal AND Spain, not just
// the primary.
//
// We return both shapes so call sites that need names (display
// label, fuzzy match for the GeoJSON) still get them, and call sites
// that need codes (set lookup against feature.ISO_A2) get those too.
// Names fall back to the trip's primary `country` when no per-code
// label is locally derivable.
function deriveUniqueCountries(trips: Trip[]): string[] {
    const names = new Set<string>();
    for (const tr of trips) {
        // Always include the primary scalar — that's the legacy
        // display label and it's the field the natural-earth GeoJSON
        // fuzzy match still relies on.
        if (tr.country) names.add(tr.country);
    }
    return [...names];
}


/** §4.3: ALL country codes any of the given trips touches, deduped +
 *  upper-cased. Used by the footprint map to drive the country-fill
 *  highlight: a multi-country trip lights every leg, not just the
 *  primary. Also used by the country-count chip on the profile
 *  header. */
function deriveUniqueCountryCodes(trips: Trip[]): string[] {
    const codes = new Set<string>();
    for (const tr of trips) {
        if (tr.countryCode) codes.add(tr.countryCode.toUpperCase());
        for (const c of tr.countries || []) {
            const up = (c || '').trim().toUpperCase();
            if (up.length === 2) codes.add(up);
        }
    }
    return [...codes];
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
        return <LoginWall />;
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
    const achievements = useStore((s) => s.achievements as ProfileAchievement[]) || [];

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
        return <p className="pf-empty-state">User not found.</p>;
    }
    if (error === 'network') {
        return <p className="pf-empty-state">Error loading profile.</p>;
    }
    if (!data) {
        return (
            <div className="flex justify-center items-center h-[300px]">
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

// ── Top icon toggle for the Info ⇆ Footprint sections.
// Reuses the app-wide .seg-control pill + sliding lens; the buttons carry
// just an icon (a circled "i" for Info, a globe for Footprint) with the
// text label kept as the accessible name / tooltip.
type ProfileSection = 'info' | 'footprint';
const SECTION_ICONS: Record<ProfileSection, ReactNode> = {
    info: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
    ),
    footprint: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
    ),
};
function ProfileSectionToggle({
    value,
    onChange,
    infoLabel,
    footprintLabel,
}: {
    value: ProfileSection;
    onChange: (v: ProfileSection) => void;
    infoLabel: string;
    footprintLabel: string;
}) {
    const opts: Array<{ v: ProfileSection; label: string }> = [
        { v: 'info', label: infoLabel },
        { v: 'footprint', label: footprintLabel },
    ];
    return (
        <div className="pf-bookmarks" role="tablist" aria-label="Profile section">
            {opts.map((o) => {
                const active = o.v === value;
                return (
                    <button
                        key={o.v}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        aria-label={o.label}
                        title={o.label}
                        data-active={active}
                        onClick={() => onChange(o.v)}
                        className="pf-bookmark-btn"
                    >
                        {SECTION_ICONS[o.v]}
                    </button>
                );
            })}
        </div>
    );
}


function ProfileContent({
    isOwnProfile,
    user,
    trips,
    achievements,
    followSnap,
    targetUserId,
}: ProfileContentProps) {
    const [section, setSection] = useState<ProfileSection>('info');
    // Follower count lifted here so BOTH the top stats tiles and the
    // FollowButton inside the Info card share one source of truth (the
    // button updates it optimistically on a friend's profile).
    const [followers, setFollowers] = useState(followSnap.followers);
    useEffect(() => setFollowers(followSnap.followers), [followSnap.followers]);
    const firstName = user.name.split(' ')[0];
    const uniqueCountries = deriveUniqueCountries(trips);
    // §4.3: separate ISO-code list so the footprint map's fast-path
    // ISO match + the country-count chip both cover multi-country
    // trips. Falls back to `uniqueCountries.length` (name-based) when
    // no codes are available (legacy trips before the Places
    // migration), so the count never silently drops to zero on a user
    // who hasn't logged in since pre-2026.
    const uniqueCountryCodes = deriveUniqueCountryCodes(trips);
    const countryCountForChip = Math.max(uniqueCountryCodes.length, uniqueCountries.length);

    return (
        <div className="profile-page max-w-[800px] my-0 mx-auto pb-[60px]">
            {!isOwnProfile ? (
                <button
                    type="button"
                    className="btn btn-small mb-5 bg-[rgba(0,0,0,0.05)] text-primary border border-[var(--glass-border)] py-2 px-4 rounded-md font-bold flex items-center gap-2"
                    onClick={() => navigate('friends')}
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

            {/* Bookmark tabs on top — Info ⇆ Footprint (one shows at a time).
                Flat edge sits toward the card just below. */}
            <div className="flex justify-center mb-2">
                <ProfileSectionToggle
                    value={section}
                    onChange={setSection}
                    infoLabel={isOwnProfile ? 'Info' : `${firstName}'s info`}
                    footprintLabel="Footprint"
                />
            </div>

            {section === 'info' ? (
                <div className="pf-card">
                    <ProfileInfoSection
                        isOwnProfile={isOwnProfile}
                        user={user}
                        trips={trips}
                        uniqueCountries={uniqueCountries}
                        tripCount={trips.length}
                        countryCount={countryCountForChip}
                        followers={followers}
                        following={followSnap.following}
                        followSnap={followSnap}
                        targetUserId={targetUserId}
                        onFollowersChange={setFollowers}
                    />
                </div>
            ) : (
                <div className="pf-card">
                        {/* Achievements — shown on own profile even when empty so the
                            surface is discoverable; hidden on a friend's profile when
                            nothing's earned. */}
                        {(achievements.length > 0 || isOwnProfile) ? (
                        <>
                            <div className="flex items-baseline justify-between mb-[14px]">
                                <h3 className="m-0 text-base font-extrabold tracking-[-0.02em] text-primary">
                                    🏅 Achievements
                                </h3>
                                <span className="text-[0.8rem] text-secondary font-semibold">
                                    {achievements.length} earned
                                </span>
                            </div>
                            {achievements.length === 0 ? (
                                <p className="m-0 text-secondary text-[0.85rem] text-center py-3 px-0">
                                    Earn your first badge by creating a trip, completing one, or settling up with a friend.
                                </p>
                            ) : (
                                <AchievementsStrip achievements={achievements} />
                            )}
                            <div className="pf-divider" />
                        </>
                    ) : null}

                    <p className="text-secondary text-center mt-0 mb-5 text-[0.88rem]">
                        {isOwnProfile
                            ? "Every country you've been to, lit up."
                            : `Explore where ${firstName} has been.`}
                    </p>
                    <FootprintMap
                        trips={trips}
                        uniqueCountries={uniqueCountries}
                        uniqueCountryCodes={uniqueCountryCodes}
                    />
                </div>
            )}
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
            showLiquidAlert(t('profile.photoUploaded'), 'success');
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
                    alt={t('profile.avatarAlt')}
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
                        className="hidden"
                        onChange={(e) => void onFileChange(e)}
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
    /** Backing data for the Trips / Countries list modals. */
    trips: Trip[];
    uniqueCountries: string[];
    tripCount: number;
    countryCount: number;
    followers: number;
    following: number;
    followSnap: FollowSnapshot;
    targetUserId: string | undefined;
    /** Lifted to ProfileContent so the stat bar + the FollowButton here
     *  share one follower count. */
    onFollowersChange: (n: number) => void;
}

function ProfileInfoSection({
    isOwnProfile,
    user,
    trips,
    uniqueCountries,
    tripCount,
    countryCount,
    followers,
    following,
    followSnap,
    targetUserId,
    onFollowersChange,
}: ProfileInfoSectionProps) {
    const follow = useFollowLists(targetUserId ?? user.id);
    // Each stat's caption opens its own searchable list modal of that data.
    // The caption is ALWAYS a live link (opens the modal even when the list
    // is empty → "Nothing here yet"), so it never greys out.
    const searchPh = t('common.search');
    const openList = (title: string, items: StatListItem[]) => () =>
        openStatListModal({ title, searchPlaceholder: searchPh, items });
    const stats: Stat[] = [
        {
            num: String(tripCount),
            label: tn('profile.publicTripsLabel', tripCount),
            onClick: openList(
                tn('profile.publicTripsLabel', tripCount),
                trips.map((tp) => ({ primary: tp.name || 'Trip', secondary: tp.country || undefined })),
            ),
        },
        {
            num: String(countryCount),
            label: tn('profile.countriesLabel', countryCount),
            onClick: openList(
                tn('profile.countriesLabel', countryCount),
                uniqueCountries.map((c) => ({ primary: c })),
            ),
        },
        {
            num: String(followers),
            label: tn('profile.followersLabel', followers),
            onClick: openList(tn('profile.followersLabel', followers), peopleItems(follow.followers)),
        },
        {
            num: String(following),
            label: tn('profile.followingLabel', following),
            onClick: openList(tn('profile.followingLabel', following), peopleItems(follow.following)),
        },
    ];
    if (isOwnProfile) {
        const friendsCount = follow.loaded ? follow.friends.length : null;
        stats.push({
            num: friendsCount === null ? '—' : String(friendsCount),
            label: tn('profile.friendsLabel', friendsCount ?? 0),
            onClick: openList(tn('profile.friendsLabel', friendsCount ?? 0), peopleItems(follow.friends)),
        });
    }
    return (
        <>
            {/* Identity — avatar + name + email + status/follow, centred. */}
            <div className="pf-identity">
                <ProfilePicSection isOwnProfile={isOwnProfile} user={user} />
                <h2 className="pf-identity__name">{user.name}</h2>
                <span className="pf-identity__email">{user.email}</span>
                {!isOwnProfile && targetUserId ? (
                    <div className="flex items-center gap-2 mt-1">
                        <FollowButton
                            targetUserId={targetUserId}
                            initialIsFollowing={followSnap.isFollowing}
                            onFollowersChange={onFollowersChange}
                        />
                        {/* Audit MK5 P1: Block was server-enforced but had NO UI
                            entry — overflow next to Follow → confirm → blockUser.
                            Unblock lives in Settings → Blocked. */}
                        <button
                            type="button"
                            className="btn-small bg-[rgba(0,0,0,0.05)] text-primary border border-[var(--glass-border)] rounded-md w-8 h-8 flex items-center justify-center font-bold leading-none shrink-0"
                            title={t('profile.blockBtnLabel')}
                            aria-label={t('profile.blockBtnLabel')}
                            onClick={() => {
                                showConfirmModal({
                                    title: t('profile.blockConfirmTitle', { name: user.name }),
                                    message: t('profile.blockConfirmBody', { name: user.name }),
                                    confirmText: t('profile.blockConfirmBtn'),
                                    onConfirm: () => {
                                        void (async () => {
                                            const ok = await blockUser(targetUserId);
                                            if (ok) {
                                                showLiquidAlert(t('profile.blockedToast', { name: user.name }), 'info');
                                                navigate('friends');
                                            } else {
                                                showLiquidAlert(t('profile.blockFailed'));
                                            }
                                        })();
                                    },
                                });
                            }}
                        >
                            ⋯
                        </button>
                    </div>
                ) : null}
            </div>

            {/* Stats — tiny numbers on a slab, with a draggable liquid-glass
                loupe you slide across to zoom in on them. */}
            <StatMagnifier stats={stats} />

            <div className="pf-divider" />

            <BioBlock isOwnProfile={isOwnProfile} user={user} onLogout={() => void logout()} />
        </>
    );
}


// ── Stats + draggable magnifier ───────────────────────────────────
interface Stat {
    num: string;
    label: string;
    /** Present → the blue caption taps through to the related surface.
     *  Explicit `| undefined` so a stat can opt out under
     *  exactOptionalPropertyTypes (e.g. followers on a friend's profile). */
    onClick?: (() => void) | undefined;
}

// The viewed profile's follow graph — one /api/follows/<id>?include=lists
// call gives followersOnly / followingOnly / mutuals, which back BOTH the
// slab friends count AND the Followers / Following / Friends list modals.
interface FollowLists {
    followers: ProfileFriend[]; // full followers = followersOnly + mutuals
    following: ProfileFriend[]; // full following = followingOnly + mutuals
    friends: ProfileFriend[]; // mutuals
    loaded: boolean;
}
function useFollowLists(profileUserId: string | undefined): FollowLists {
    const [state, setState] = useState<FollowLists>({ followers: [], following: [], friends: [], loaded: false });
    useEffect(() => {
        if (!profileUserId) return;
        let alive = true;
        apiFetch(`/api/follows/${encodeURIComponent(profileUserId)}?include=lists`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { followersOnly?: ProfileFriend[]; followingOnly?: ProfileFriend[]; mutuals?: ProfileFriend[] } | null) => {
                if (!alive || !data) return;
                const followersOnly = Array.isArray(data.followersOnly) ? data.followersOnly : [];
                const followingOnly = Array.isArray(data.followingOnly) ? data.followingOnly : [];
                const mutuals = Array.isArray(data.mutuals) ? data.mutuals : [];
                setState({
                    followers: [...followersOnly, ...mutuals],
                    following: [...followingOnly, ...mutuals],
                    friends: mutuals,
                    loaded: true,
                });
            })
            .catch(() => {
                /* leave the empty defaults */
            });
        return () => {
            alive = false;
        };
    }, [profileUserId]);
    return state;
}

/** Build the people rows for a follows list modal (→ each taps to profile). */
function peopleItems(people: ProfileFriend[]): StatListItem[] {
    return people.map((p) => ({
        id: p.id,
        primary: p.name || 'Someone',
        secondary: p.email || undefined,
        avatarUrl: p.picture || undefined,
        avatarInitial: (p.name || p.email || '?').charAt(0).toUpperCase(),
        onClick: () => navigate('profile', { userId: p.id }),
    }));
}

// Plain (non-interactive) cell — the numbers are read through the loupe;
// the clickable navigation lives in the blue caption below it.
function StatCell({ num, label }: { num: string; label: string }) {
    return (
        <div className="pf-statcell">
            <span className="pf-statcell__num">{num}</span>
            <span className="pf-statcell__label">{label}</span>
        </div>
    );
}

// A slab of tiny stat numbers with a draggable circular liquid-glass loupe
// that magnifies whatever it sits over. The loupe renders a second, scaled
// copy of the same slab, offset so the point under the lens centre lands at
// the lens centre (classic magnifier maths), clipped to a circle.
function StatMagnifier({ stats }: { stats: Stat[] }) {
    const barRef = useRef<HTMLDivElement | null>(null);
    // numY = vertical centre of the NUMBERS row (measured), so the loupe
    // zooms the numbers rather than the labels below them.
    const [dims, setDims] = useState<{ w: number; h: number; numY: number }>({ w: 0, h: 0, numY: 0 });
    const [lensX, setLensX] = useState<number | null>(null);
    const draggingRef = useRef(false);

    const R = 27; // lens radius (54px loupe)
    const Z = 2.4; // zoom factor
    const PAD_TOP = 16; // space above the slab for the loupe overflow

    useEffect(() => {
        const el = barRef.current;
        if (!el) return;
        const measure = () => {
            const r = el.getBoundingClientRect();
            const numEl = el.querySelector<HTMLElement>('.pf-statcell__num');
            const numRect = numEl?.getBoundingClientRect();
            const numY = numRect ? numRect.top - r.top + numRect.height / 2 : r.height * 0.34;
            setDims({ w: r.width, h: r.height, numY });
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const clamp = (x: number) => Math.max(R, Math.min(Math.max(dims.w - R, R), x));
    const cx = clamp(lensX ?? dims.w / 2);

    const moveTo = (clientX: number) => {
        const el = barRef.current;
        if (!el) return;
        setLensX(clamp(clientX - el.getBoundingClientRect().left));
    };
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        draggingRef.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        moveTo(e.clientX);
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (draggingRef.current) moveTo(e.clientX);
    };
    const endDrag = () => {
        draggingRef.current = false;
    };
    const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowLeft') {
            setLensX(clamp(cx - 14));
            e.preventDefault();
        } else if (e.key === 'ArrowRight') {
            setLensX(clamp(cx + 14));
            e.preventDefault();
        }
    };

    // Offset the scaled copy so bar point (cx, numY) lands at the lens
    // centre — i.e. the numbers row is what gets magnified.
    const contentLeft = R - cx * Z;
    const contentTop = R - dims.numY * Z;
    // Loupe centred on the slab (which sits PAD_TOP below the wrapper top).
    const lensTop = PAD_TOP + dims.h / 2 - R;
    // Which stat is under the loupe → drives the caption below it.
    const n = stats.length;
    const activeIdx = n > 0 && dims.w > 0 ? Math.min(n - 1, Math.max(0, Math.floor(cx / (dims.w / n)))) : 0;
    const active = stats[activeIdx];
    const captionTop = PAD_TOP + dims.h + 5;
    const captionLeft = Math.max(46, Math.min(Math.max(dims.w - 46, 46), cx));

    return (
        <div className="pf-statmag">
            {/* The whole slab is the slider surface: tap anywhere to jump the
                loupe there, or drag it. The loupe itself is visual-only
                (pointer-events:none) so it never eats these events. */}
            <div
                className="pf-statbar pf-statbar--interactive"
                ref={barRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={onKeyDown}
                tabIndex={0}
                role="slider"
                aria-label="Drag or tap to zoom the stats"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={dims.w ? Math.round((cx / dims.w) * 100) : 50}
            >
                {stats.map((s, i) => (
                    <StatCell key={i} num={s.num} label={s.label} />
                ))}
            </div>
            {dims.w > R * 2 ? (
                <>
                    <div className="pf-lens" style={{ left: cx - R, top: lensTop, width: R * 2, height: R * 2 }}>
                        <div
                            className="pf-statbar pf-statbar--mag"
                            style={{
                                left: contentLeft,
                                top: contentTop,
                                width: dims.w,
                                transform: `scale(${Z})`,
                                transformOrigin: 'top left',
                            }}
                        >
                            {stats.map((s, i) => (
                                <StatCell key={i} num={s.num} label={s.label} />
                            ))}
                        </div>
                    </div>
                    {/* GG-blue caption naming the number under the loupe; taps
                        through to that stat's list modal. Always a live link. */}
                    {active ? (
                        <button
                            type="button"
                            className="pf-statcaption"
                            style={{ left: captionLeft, top: captionTop }}
                            onClick={() => active.onClick?.()}
                        >
                            {active.label}
                        </button>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}


// ── Bio block: email + status + bio + (own only) save controls ───
function BioBlock({
    isOwnProfile,
    user,
    onLogout,
}: {
    isOwnProfile: boolean;
    user: User & { bio?: string; status?: string };
    onLogout: () => void;
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
                const oldHomeCurrency = STATE.user.homeCurrency || null;
                STATE.user.bio = newBio;
                STATE.user.status = newStatus;
                STATE.user.homeCurrency = newHomeCurrency;
                STATE.user.homeCountry = newHomeCountry;
                // PV-6: manual exchange rates + per-trip overrides are stored
                // against the OLD home currency (foreign→home). On a home change
                // they'd be silently misread, so reset them (manual inflation %,
                // being home-independent, is kept). Tell the user if any existed.
                let ratesReset = false;
                if (newHomeCurrency !== oldHomeCurrency) {
                    const a = clearAllManualFx();
                    const b = clearAllFxOverrides();
                    ratesReset = a || b;
                }
                emit('state:changed');
                setDirty(false);
                showLiquidAlert(ratesReset ? t('profile.updatedRatesReset') : t('profile.updated'), 'success');
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

    // Home currency applies IMMEDIATELY on change — it's a setting, not a form
    // field. Previously it only persisted via the "Save profile" button (hidden
    // until a field went dirty), so a user who just picked a currency saw it
    // silently not stick and Insights stayed on the EUR default. Auto-save fixes
    // that: POST → update STATE.user → emit so every surface re-reads the new
    // home currency. On failure we revert the dropdown so it never lies.
    const onHomeCurrencyChange = async () => {
        if (!STATE.user) return;
        const code = homeCurrencyRef.current?.value || null;
        const old = STATE.user.homeCurrency || null;
        if (code === old) return;
        const revert = () => {
            if (homeCurrencyRef.current) homeCurrencyRef.current.value = old || getHomeCurrency();
        };
        try {
            const res = await apiFetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homeCurrency: code }),
            });
            if (!res.ok) {
                showLiquidAlert(t('profile.saveFailed', { status: res.status }));
                revert();
                return;
            }
            STATE.user.homeCurrency = code;
            // PV-6: manual FX + per-trip overrides are stored against the OLD home
            // currency (foreign→home), so reset them on a home change — exactly as
            // the full save does. Call BOTH before OR-ing (no short-circuit).
            const a = clearAllManualFx();
            const b = clearAllFxOverrides();
            emit('state:changed');
            showLiquidAlert(a || b ? t('profile.updatedRatesReset') : t('profile.updated'), 'success');
        } catch (e) {
            console.error('Home currency update failed:', e);
            showLiquidAlert(t('profile.saveNetwork'));
            revert();
        }
    };

    // Chevron for a settings-row <select> (the brand-select is styled
    // appearance:none, so it needs an explicit glyph).
    const chevron = <div className="brand-select-chevron pf-right-10">▼</div>;

    if (!isOwnProfile) {
        // Foreign profile — status pill + read-only bio.
        const statusLabel = (() => {
            if (!user.status) return t('profile.statusDefault');
            const lookup: Record<string, string> = {
                'Deliberating next trip': t('profile.statusDeliberating'),
                'Preparing a trip right now': t('profile.statusPreparing'),
                'Exploring the world': t('profile.statusExploring'),
                'Resting at home base': t('profile.statusResting'),
                'Hunting for flight deals': t('profile.statusHunting'),
            };
            return lookup[user.status] || user.status;
        })();
        return (
            <div className="profile-bio-block">
                <div className="flex justify-center mb-3">
                    <div className="bg-[rgba(0,113,227,0.06)] text-[#005bb8] rounded-full py-1.5 px-4 text-[0.85rem] font-bold">
                        {statusLabel}
                    </div>
                </div>
                <p className="text-[0.95rem] text-primary leading-[1.55] text-center m-0">
                    {user.bio || t('profile.noBioYet')}
                </p>
            </div>
        );
    }

    // Own profile — editable bio + settings rows + save/logout.
    return (
        <div className="profile-bio-block">
            <textarea
                ref={bioRef}
                className="bio-input"
                placeholder={t('profile.bioPlaceholder')}
                defaultValue={user.bio || ''}
                onInput={() => setDirty(true)}
            />

            {/* Status */}
            <div className="pf-setting-row">
                <div className="pf-setting-row__text">
                    <div className="pf-setting-row__label">{t('profile.statusRowLabel')}</div>
                </div>
                <div className="pf-setting-row__control relative inline-block">
                    <select
                        ref={statusRef}
                        className="brand-select pf-pill-sm"
                        aria-label={t('profile.statusAriaLabel')}
                        defaultValue={user.status || ''}
                        onChange={() => setDirty(true)}
                    >
                        <option value="" disabled>
                            {t('profile.statusSet')}
                        </option>
                        {/* value stays English (stored in users.status);
                            display labels are translated (R11-B4). */}
                        <option value="Deliberating next trip">{t('profile.statusDeliberating')}</option>
                        <option value="Preparing a trip right now">{t('profile.statusPreparing')}</option>
                        <option value="Exploring the world">{t('profile.statusExploring')}</option>
                        <option value="Resting at home base">{t('profile.statusResting')}</option>
                        <option value="Hunting for flight deals">{t('profile.statusHunting')}</option>
                    </select>
                    {chevron}
                </div>
            </div>

            {/* Home country */}
            <div className="pf-setting-row">
                <div className="pf-setting-row__text">
                    <div className="pf-setting-row__label">{t('profile.homeCountryAria')}</div>
                </div>
                <div className="pf-setting-row__control relative inline-block">
                    <select
                        ref={homeCountryRef}
                        className="brand-select pf-pill-sm"
                        aria-label={t('profile.homeCountryAria')}
                        defaultValue={user.homeCountry || ''}
                        onChange={() => setDirty(true)}
                    >
                        {/* Empty = "not set" sentinel → cleared server-side (null). */}
                        <option value="">{t('profile.homeCountryNotSet')}</option>
                        {COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                    {chevron}
                </div>
            </div>

            {/* Home currency */}
            <div className="pf-setting-row">
                <div className="pf-setting-row__text">
                    <div className="pf-setting-row__label">{t('profile.homeCurrencyAria')}</div>
                </div>
                <div className="pf-setting-row__control relative inline-block">
                    <select
                        ref={homeCurrencyRef}
                        className="brand-select pf-pill-sm"
                        aria-label={t('profile.homeCurrencyAria')}
                        defaultValue={getHomeCurrency()}
                        onChange={() => void onHomeCurrencyChange()}
                    >
                        {Object.keys(CONVERSION_RATES).map((code) => (
                            <option key={code} value={code}>
                                {CURRENCY_SYMBOLS[code] || code}&nbsp;&nbsp;{code}
                            </option>
                        ))}
                    </select>
                    {chevron}
                </div>
            </div>

            <div className="pf-divider" />

            {/* Save (appears when dirty) + Log out. */}
            <div className="flex items-center justify-between gap-3">
                <button type="button" className="btn-logout" onClick={onLogout}>
                    {t('profile.logOut')}
                </button>
                <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => void onSave()}
                    disabled={saving || !dirty}
                    style={{
                        background: 'var(--text-primary)',
                        color: 'var(--bg-color)',
                        padding: '10px 20px',
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
        </div>
    );
}
