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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
    ReactNode,
    PointerEvent as ReactPointerEvent,
    MouseEvent as ReactMouseEvent,
    WheelEvent as ReactWheelEvent,
} from 'react';
import { useStore } from '../../react/store.js';
import { STATE, emit } from '../../state.js';
import { apiFetch, uploadMedia, blockUser, unblockUser, fetchBlockedUsers } from '../../api.js';
import { showLiquidAlert, getHomeCurrency, showConfirmModal } from '../../utils.js';
import { CURRENCY_SYMBOLS } from '../../constants.js';
import { getSupportedCurrencies } from '../../utils/currency.js';
import { navigate } from '../../router.js';
import { clearAllManualFx } from '../../utils/manualRates.js';
import { clearAllFxOverrides } from '../../utils/fxOverrides.js';
import { countryCodeToContinent, countryNameToContinent, getCountryOptions } from '../../utils/place-names.js';
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
type ProfileSection = 'info' | 'footprint' | 'quotes';
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
    quotes: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
    ),
};
function ProfileSectionToggle({
    value,
    onChange,
    infoLabel,
    footprintLabel,
    quotesLabel,
}: {
    value: ProfileSection;
    onChange: (v: ProfileSection) => void;
    infoLabel: string;
    footprintLabel: string;
    quotesLabel: string;
}) {
    const opts: Array<{ v: ProfileSection; label: string }> = [
        { v: 'info', label: infoLabel },
        { v: 'footprint', label: footprintLabel },
        { v: 'quotes', label: quotesLabel },
    ];
    return (
        <div className="pf-bookmarks" role="tablist" aria-label="Profile section">
            {opts.map((o) => {
                const active = o.v === value;
                return (
                    <div className="pf-bookmark-slot" key={o.v}>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-label={o.label}
                            data-active={active}
                            onClick={() => onChange(o.v)}
                            className="pf-bookmark-btn"
                        >
                            {SECTION_ICONS[o.v]}
                        </button>
                        {/* Web-only hover label — the notch clip-path would clip a
                            child, so the tip lives in the (unclipped) slot. */}
                        <span className="pf-bookmark-tip" aria-hidden="true">
                            {o.label}
                        </span>
                    </div>
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
    const firstName = user.name.split(' ')[0] ?? '';
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
                    quotesLabel={t('profile.quotesTab', { name: firstName })}
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
            ) : section === 'footprint' ? (
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
            ) : (
                <div className="pf-card">
                    <QuotesSection
                        profileUserId={targetUserId ?? user.id}
                        isOwnProfile={isOwnProfile}
                        firstName={firstName}
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
    // E8-I2: reflect an existing block relationship. A profile the caller is
    // currently blocking 404s server-side (public.py), so a rendered foreign
    // profile normally means "not blocked" — but a block placed THIS session
    // stays on-screen (we no longer navigate away), so the affordance must
    // flip to "Blocked · Unblock" to avoid a dead-end. Seeded from the blocks
    // list on mount so a still-cached nav lands on the honest state too.
    const [isBlocked, setIsBlocked] = useState(false);
    useEffect(() => {
        if (isOwnProfile || !targetUserId) return;
        let alive = true;
        void (async () => {
            const blocked = await fetchBlockedUsers();
            if (alive) setIsBlocked(blocked.some((b) => b.id === targetUserId));
        })();
        return () => {
            alive = false;
        };
    }, [isOwnProfile, targetUserId]);

    // Travel stats derived from the (completed) trips.
    const dayCount = (tp: Trip): number => {
        if (!tp.dateFrom || !tp.dateTo) return 0;
        const a = Date.parse(tp.dateFrom);
        const b = Date.parse(tp.dateTo);
        if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
        return Math.round((b - a) / 86400000) + 1; // inclusive of both ends
    };
    const daysTravelled = trips.reduce((s, tp) => s + dayCount(tp), 0);
    const continents: string[] = (() => {
        const set = new Set<string>();
        for (const tp of trips) {
            const c = countryCodeToContinent(tp.countryCode) || countryNameToContinent(tp.country);
            if (c) set.add(c);
        }
        return [...set];
    })();
    const topCountry = (() => {
        const counts = new Map<string, number>();
        for (const tp of trips) {
            if (tp.country) counts.set(tp.country, (counts.get(tp.country) || 0) + 1);
        }
        let name = '';
        let count = 0;
        counts.forEach((c, n) => {
            if (c > count) {
                count = c;
                name = n;
            }
        });
        return { name, count };
    })();
    // Best companion: the person on the most trips (excluding the profile
    // owner's own self-companion). Keyed by linkedUserId when present, else
    // by name, and counted once per trip.
    const bestCompanion = (() => {
        const profileId = targetUserId ?? user.id;
        const firstName = (user.name.split(' ')[0] || '').toLowerCase();
        const counts = new Map<string, { name: string; trips: number }>();
        for (const tp of trips) {
            const seen = new Set<string>();
            for (const c of tp.companions || []) {
                if (!c.name) continue;
                const isOwner = (c.linkedUserId && c.linkedUserId === profileId) || c.name.toLowerCase() === firstName;
                if (isOwner) continue;
                const key = c.linkedUserId || c.name.toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                const cur = counts.get(key) || { name: c.name, trips: 0 };
                cur.trips += 1;
                cur.name = c.name;
                counts.set(key, cur);
            }
        }
        let name = '';
        let count = 0;
        counts.forEach((v) => {
            if (v.trips > count) {
                count = v.trips;
                name = v.name;
            }
        });
        return { name, count };
    })();

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
            num: String(daysTravelled),
            label: tn('profile.daysLabel', daysTravelled),
            onClick: openList(
                tn('profile.daysLabel', daysTravelled),
                trips.map((tp) => ({
                    primary: tp.name || 'Trip',
                    secondary: dayCount(tp)
                        ? `${dayCount(tp)} ${tn('profile.daysLabel', dayCount(tp))}`
                        : tp.country || undefined,
                })),
            ),
        },
        {
            num: String(continents.length),
            label: tn('profile.continentsLabel', continents.length),
            onClick: openList(
                tn('profile.continentsLabel', continents.length),
                continents.map((c) => ({ primary: c })),
            ),
        },
        {
            num: topCountry.count ? String(topCountry.count) : '—',
            label: topCountry.name || t('profile.topCountryLabel'),
            onClick: openList(
                topCountry.name || t('profile.topCountryLabel'),
                trips.filter((tp) => tp.country === topCountry.name).map((tp) => ({ primary: tp.name || 'Trip', secondary: tp.country || undefined })),
            ),
        },
        {
            num: bestCompanion.count ? String(bestCompanion.count) : '—',
            label: bestCompanion.name || t('profile.bestCompanionLabel'),
            onClick: openList(
                bestCompanion.name || t('profile.bestCompanionLabel'),
                trips
                    .filter((tp) =>
                        (tp.companions || []).some((c) => (c.name || '').toLowerCase() === bestCompanion.name.toLowerCase()),
                    )
                    .map((tp) => ({ primary: tp.name || 'Trip', secondary: tp.country || undefined })),
            ),
        },
        {
            num: String(followers),
            label: tn('profile.followersLabel', followers),
            // The follow lists (?include=lists) are server-gated to self, so on a
            // foreign profile they resolve to [] while the count is real. Only wire
            // the tap-through when we actually have the list, else it opens an
            // empty "Nothing here yet" modal that contradicts the count.
            onClick: isOwnProfile ? openList(tn('profile.followersLabel', followers), peopleItems(follow.followers)) : undefined,
        },
        {
            num: String(following),
            label: tn('profile.followingLabel', following),
            onClick: isOwnProfile ? openList(tn('profile.followingLabel', following), peopleItems(follow.following)) : undefined,
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
                    isBlocked ? (
                        // E8-I2: blocked relationship made explicit — a plain
                        // "Blocked · Unblock" control instead of a Follow button,
                        // so the state is honest and the block is reversible in
                        // place (no dead-end back to a now-404 profile).
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[0.85rem] text-secondary font-semibold">
                                {t('profile.blockedRelLabel')}
                            </span>
                            <button
                                type="button"
                                className="btn-small bg-[rgba(0,0,0,0.05)] text-primary border border-[var(--glass-border)] rounded-md py-1.5 px-3 font-bold shrink-0"
                                onClick={() => {
                                    void (async () => {
                                        const ok = await unblockUser(targetUserId);
                                        if (ok) {
                                            setIsBlocked(false);
                                            showLiquidAlert(t('profile.unblockedToast', { name: user.name }), 'success');
                                        } else {
                                            showLiquidAlert(t('profile.blockFailed'));
                                        }
                                    })();
                                }}
                            >
                                {t('profile.unblockBtn')}
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 mt-1">
                            <FollowButton
                                targetUserId={targetUserId}
                                initialIsFollowing={followSnap.isFollowing}
                                onFollowersChange={onFollowersChange}
                            />
                            {/* E8-I1: the '⋯' overflow now opens a real menu (a
                                labelled action list) instead of firing the block
                                confirm directly — three dots signals "open a menu",
                                and a single destructive action shouldn't hide behind
                                that gesture. */}
                            <button
                                type="button"
                                className="btn-small bg-[rgba(0,0,0,0.05)] text-primary border border-[var(--glass-border)] rounded-md w-8 h-8 flex items-center justify-center font-bold leading-none shrink-0"
                                title={t('profile.moreMenuLabel')}
                                aria-label={t('profile.moreMenuLabel')}
                                onClick={() => {
                                    openStatListModal({
                                        title: t('profile.moreMenuLabel'),
                                        items: [
                                            {
                                                primary: t('profile.blockBtnLabel'),
                                                onClick: () => {
                                                    showConfirmModal({
                                                        title: t('profile.blockConfirmTitle', { name: user.name }),
                                                        message: t('profile.blockConfirmBody', { name: user.name }),
                                                        confirmText: t('profile.blockConfirmBtn'),
                                                        onConfirm: () => {
                                                            void (async () => {
                                                                const ok = await blockUser(targetUserId);
                                                                if (ok) {
                                                                    setIsBlocked(true);
                                                                    showLiquidAlert(t('profile.blockedToast', { name: user.name }), 'info');
                                                                } else {
                                                                    showLiquidAlert(t('profile.blockFailed'));
                                                                }
                                                            })();
                                                        },
                                                    });
                                                },
                                            },
                                        ],
                                    });
                                }}
                            >
                                ⋯
                            </button>
                        </div>
                    )
                ) : null}
            </div>

            {/* Stats — a swipeable row of tappable chips (each opens its
                list modal). Scrolls horizontally on a phone; fits inline on
                desktop. */}
            <StatStrip stats={stats} />

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

// Swipeable stat strip — a horizontally-scrollable row of tappable stat
// chips (each opens its list modal). When one set overflows the width it
// renders THREE copies and wraps the scroll position, so swiping loops
// around endlessly; when it fits it renders one, centred.
function StatStrip({ stats }: { stats: Stat[] }) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const setRef = useRef<HTMLDivElement | null>(null);
    const unitRef = useRef(0); // one set's width + the gap to the next
    const [loop, setLoop] = useState(false);

    // Loop only when one set overflows the scroller (a phone); otherwise fit.
    useEffect(() => {
        const scroller = scrollerRef.current;
        const set = setRef.current;
        if (!scroller || !set) return;
        const check = () => {
            const w = set.getBoundingClientRect().width;
            const cs = getComputedStyle(scroller);
            const gap = parseFloat(cs.columnGap || cs.gap || '0') || 0;
            unitRef.current = w + gap;
            setLoop(w > scroller.clientWidth + 4);
        };
        check();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(check);
        ro.observe(scroller);
        ro.observe(set);
        return () => ro.disconnect();
    }, [stats.length]);

    // Mouse drag-to-scroll (so it's "swipeable" with a mouse on the web —
    // touch/pen already scroll natively). Incremental deltas so the loop's
    // scrollLeft wraps don't jolt the drag. A drag past a few px suppresses
    // the chip click so dragging never opens a modal.
    const dragRef = useRef({ active: false, lastX: 0, moved: 0 });
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.pointerType !== 'mouse') return;
        if (!scrollerRef.current) return;
        // No setPointerCapture — it would redirect the follow-up click away
        // from the chip and swallow taps. onPointerLeave ends a stray drag.
        dragRef.current = { active: true, lastX: e.clientX, moved: 0 };
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const d = dragRef.current;
        const el = scrollerRef.current;
        if (!d.active || !el) return;
        const dx = e.clientX - d.lastX;
        d.lastX = e.clientX;
        d.moved += Math.abs(dx);
        el.scrollLeft -= dx;
    };
    const endDrag = () => {
        dragRef.current.active = false;
    };
    const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
        if (dragRef.current.moved > 6) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    // Park the scroll on the middle (real) set and wrap it back whenever it
    // drifts into a clone, so a swipe carries on around forever.
    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller || !loop || unitRef.current <= 0) return;
        scroller.scrollLeft = unitRef.current;
        let raf = 0;
        const onScroll = () => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                raf = 0;
                const u = unitRef.current;
                if (u <= 0) return;
                if (scroller.scrollLeft < u * 0.5) scroller.scrollLeft += u;
                else if (scroller.scrollLeft >= u * 1.5) scroller.scrollLeft -= u;
            });
        };
        scroller.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            scroller.removeEventListener('scroll', onScroll);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [loop, stats.length]);

    const renderSet = (key: string, real: boolean) => (
        <div className="pf-statstrip__set" key={key} ref={real ? setRef : undefined} aria-hidden={real ? undefined : true}>
            {stats.map((s, i) => (
                <button
                    key={`${key}-${i}`}
                    type="button"
                    className="pf-statchip"
                    tabIndex={real ? undefined : -1}
                    onClick={() => s.onClick?.()}
                >
                    <span className="pf-statchip__num">{s.num}</span>
                    <span className="pf-statchip__label">{s.label}</span>
                </button>
            ))}
        </div>
    );

    return (
        <div
            className={`pf-statstrip${loop ? ' pf-statstrip--loop' : ''}`}
            ref={scrollerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={endDrag}
            onClickCapture={onClickCapture}
        >
            {loop ? renderSet('clone-a', false) : null}
            {renderSet('real', true)}
            {loop ? renderSet('clone-b', false) : null}
        </div>
    );
}


// ── Bio block: email + status + bio + (own only) save controls ───
// English country name → ISO 3166-1 alpha-2 code, built once from the
// same Intl-backed list the picker uses, so a stored home country always
// resolves back to its flag.
const _homeCountryToCode: Record<string, string> = (() => {
    const m: Record<string, string> = {};
    for (const { code, name } of getCountryOptions()) m[name.trim().toLowerCase()] = code;
    return m;
})();

/** ISO alpha-2 code for a stored country name, '' if unknown. */
function countryCodeFromName(name: string | null | undefined): string {
    if (!name) return '';
    return _homeCountryToCode[name.trim().toLowerCase()] || '';
}

/** Served path to a country's flag image (vendored flag-icons, 4:3 SVG).
 *  Local + same-origin, so it works offline and leaks nothing to a flag
 *  CDN. '' when there's no ISO code, so callers can fall back cleanly. */
/** Stable colour per author id — used for the zoomed-out memory dots so
 *  the same person's memories read as one colour across the canvas. */
// Stable, evenly-spread colour from any string key (hash → hue). Used for the
// secondary-dimension node tint + connection lines so the same author / year /
// trip always gets the same colour across the whole canvas.
function keyColor(key: string): string {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
    return `hsl(${h}, 68%, 55%)`;
}

function flagUrl(code: string | null | undefined): string {
    if (!code || !/^[a-zA-Z]{2}$/.test(code)) return '';
    return `/static/flags/${code.toLowerCase()}.svg`;
}

interface QuoteItem {
    id: number;
    text: string;
    isVisible: boolean;
    createdAt: string;
    year: number | null;
    trip: { id: string; name: string; countryCode: string | null } | null;
    author: { id: string; name: string; picture?: string };
}

// Quotes tab: other users leave short quotes on this profile; new ones
// arrive hidden and the owner curates which become publicly visible.
// All text renders as JSX children (auto-escaped) — never innerHTML.
function QuotesSection({
    profileUserId,
    isOwnProfile,
    firstName,
}: {
    profileUserId: string;
    isOwnProfile: boolean;
    firstName: string;
}) {
    const [quotes, setQuotes] = useState<QuoteItem[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [draft, setDraft] = useState('');
    const [draftYear, setDraftYear] = useState('');
    const [draftTripId, setDraftTripId] = useState('');
    const [draftTripName, setDraftTripName] = useState('');
    const [posting, setPosting] = useState(false);
    // Common trips (shared between the viewer and this profile's owner),
    // fetched lazily the first time the trip picker opens.
    const commonTripsRef = useRef<Array<{ id: string; name: string; countryCode: string | null }> | null>(null);
    // F4-I4: mounted flag so a late-landing load() (invoked from post() /
    // setVisibility() / remove(), not just the mount effect) can't flip the
    // view to the error state or overwrite quotes after unmount — mirroring
    // ForeignProfileView's `let alive` guard.
    const aliveRef = useRef(true);

    // Trip picker — link the memory to a trip you BOTH took. Opens a
    // searchable modal of only your shared trips.
    const openTripPicker = async () => {
        if (!profileUserId) return;
        if (!commonTripsRef.current) {
            try {
                const res = await apiFetch(`/api/quotes/${encodeURIComponent(profileUserId)}/common-trips`);
                const data = res.ok ? await res.json() : { trips: [] };
                commonTripsRef.current = Array.isArray(data.trips) ? data.trips : [];
            } catch {
                commonTripsRef.current = [];
            }
        }
        const trips = commonTripsRef.current ?? [];
        if (trips.length === 0) {
            showLiquidAlert(t('profile.memNoCommonTrips'));
            return;
        }
        const items: StatListItem[] = [
            {
                primary: t('profile.memNoTrip'),
                avatarInitial: '—',
                onClick: () => {
                    setDraftTripId('');
                    setDraftTripName('');
                },
            },
            ...trips.map((tp) => ({
                primary: tp.name,
                avatarUrl: tp.countryCode ? flagUrl(tp.countryCode) : undefined,
                avatarInitial: (tp.name || '?').charAt(0).toUpperCase(),
                onClick: () => {
                    setDraftTripId(tp.id);
                    setDraftTripName(tp.name);
                },
            })),
        ];
        openStatListModal({ title: t('profile.memCommonTripsTitle'), items });
    };

    const load = useCallback(async () => {
        if (!profileUserId) {
            setQuotes([]);
            return;
        }
        setFailed(false);
        try {
            const res = await apiFetch(`/api/quotes/${encodeURIComponent(profileUserId)}`);
            if (!aliveRef.current) return;
            if (!res.ok) {
                setFailed(true);
                setQuotes([]);
                return;
            }
            const data = await res.json();
            if (!aliveRef.current) return;
            setQuotes(Array.isArray(data.quotes) ? data.quotes : []);
        } catch {
            if (!aliveRef.current) return;
            setFailed(true);
            setQuotes([]);
        }
    }, [profileUserId]);

    useEffect(() => {
        aliveRef.current = true;
        // F4-I3: the shared-trips list is cached per component instance; if this
        // section is reused across a profile navigation, invalidate the cache so
        // a previous profile's trips never appear or cause a 400 on POST. The
        // list re-fetches lazily the next time the trip picker opens.
        commonTripsRef.current = null;
        void load();
        return () => {
            aliveRef.current = false;
        };
    }, [load]);

    const post = async () => {
        const text = draft.trim();
        if (!text || posting || !profileUserId) return;
        const body: { text: string; year?: number; tripId?: string } = { text };
        if (draftYear.trim()) {
            const yr = parseInt(draftYear, 10);
            // F4-I1: validate against the input's own min/max BEFORE the POST.
            // The backend rejects out-of-range years with a 400 the client used
            // to surface only as the opaque "save failed (400)"; catch it here so
            // a typo like 2500 (or "2e3" → parsed as 2) gets a clear message.
            if (Number.isNaN(yr) || yr < 1900 || yr > 2100) {
                showLiquidAlert(t('profile.memYearRange'));
                return;
            }
            body.year = yr;
        }
        if (draftTripId) body.tripId = draftTripId;
        setPosting(true);
        try {
            const res = await apiFetch(`/api/quotes/${encodeURIComponent(profileUserId)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                setDraft('');
                setDraftYear('');
                setDraftTripId('');
                setDraftTripName('');
                showLiquidAlert(t('profile.quotesPosted', { name: firstName }), 'success');
                void load();
            } else {
                showLiquidAlert(t('profile.saveFailed', { status: res.status }));
            }
        } catch {
            showLiquidAlert(t('profile.saveNetwork'));
        } finally {
            setPosting(false);
        }
    };

    const setVisibility = async (id: number, visible: boolean) => {
        // Optimistic — reload on failure so the UI never lies.
        setQuotes((qs) => (qs ? qs.map((q) => (q.id === id ? { ...q, isVisible: visible } : q)) : qs));
        try {
            const res = await apiFetch(`/api/quotes/item/${id}/visibility`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visible }),
            });
            if (!res.ok) {
                showLiquidAlert(t('profile.saveFailed', { status: res.status }));
                void load();
            }
        } catch {
            showLiquidAlert(t('profile.saveNetwork'));
            void load();
        }
    };

    const remove = (id: number) => {
        showConfirmModal({
            title: t('profile.quotesDeleteTitle'),
            message: t('profile.quotesDeleteBody'),
            confirmText: t('profile.quotesDelete'),
            onConfirm: () => {
                setQuotes((qs) => (qs ? qs.filter((q) => q.id !== id) : qs));
                // apiFetch resolves (doesn't throw) on a non-2xx response, so
                // reconcile on BOTH an HTTP error and a network rejection —
                // otherwise a rejected delete stays gone from the UI only.
                void (async () => {
                    try {
                        const res = await apiFetch(`/api/quotes/item/${id}`, { method: 'DELETE' });
                        if (!res.ok) {
                            showLiquidAlert(t('profile.saveFailed', { status: res.status }));
                            void load();
                        }
                    } catch {
                        void load();
                    }
                })();
            },
        });
    };

    return (
        <div className="pf-quotes">
            {!isOwnProfile ? (
                <div className="pf-quote-composer">
                    <textarea
                        className="pf-quote-input"
                        placeholder={t('profile.quotesPlaceholder', { name: firstName })}
                        maxLength={280}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="pf-quote-meta">
                        <input
                            className="pf-quote-year"
                            type="number"
                            inputMode="numeric"
                            min={1900}
                            max={2100}
                            placeholder={t('profile.memYearField')}
                            value={draftYear}
                            onChange={(e) => setDraftYear(e.target.value)}
                        />
                        <button type="button" className="pf-quote-place" onClick={() => void openTripPicker()}>
                            {draftTripName || t('profile.memLinkTrip')}
                        </button>
                    </div>
                    <button
                        type="button"
                        className="pf-save-btn pf-quote-post"
                        onClick={() => void post()}
                        disabled={posting || !draft.trim()}
                    >
                        {t('profile.quotesPost')}
                    </button>
                </div>
            ) : null}

            {quotes === null ? (
                <p className="pf-quotes-note">{t('common.loading')}</p>
            ) : failed ? (
                <p className="pf-quotes-note">{t('profile.quotesError')}</p>
            ) : quotes.length === 0 ? (
                <p className="pf-quotes-note">
                    {isOwnProfile ? t('profile.quotesEmptyOwn') : t('profile.quotesEmptyVisitor', { name: firstName })}
                </p>
            ) : (
                <MemoryCanvas
                    memories={quotes}
                    isOwnProfile={isOwnProfile}
                    onToggle={(id, visible) => void setVisibility(id, visible)}
                    onRemove={remove}
                />
            )}
        </div>
    );
}

// ── Best-of memory canvas ─────────────────────────────────────────
// A big pannable / zoomable plane of memory cards. "Arrange" clusters
// them (by year / place / who) into labelled groups; cards can also be
// dragged freely. Positions are EPHEMERAL — never persisted. Pan =
// 1-finger drag on the background; zoom = pinch / wheel / buttons.
type MemGroup = 'none' | 'year' | 'trip' | 'author';

const MEM_CARD_W = 210;
const MEM_CARD_H = 140;
// Tight WITHIN a cluster (memories clump like a neuron), roomy BETWEEN
// clusters (each group reads as a distinct node in the network).
const MEM_GAP = 10;
const MEM_LABEL_H = 40;
const MEM_CLUSTER_GAP_X = 190;
const MEM_CLUSTER_GAP_Y = 150;
// Deterministic per-card scatter + a per-cluster vertical stagger break the
// rigid grid so it reads organic ("neural") rather than spreadsheet-y.
const MEM_JITTER = 18;
const MEM_STAGGER = 64;
const MEM_ROW_MAX_W = 1500;
const MEM_MIN_SCALE = 0.35;
const MEM_MAX_SCALE = 2.2;

const memClamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Stable pseudo-random in [-1, 1] from an integer seed (GLSL-style hash), so a
// card's jitter / a cluster's stagger is organic but fixed across re-renders.
function memHash(seed: number): number {
    const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
}

const EYE_ICON = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);
const EYE_OFF_ICON = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);
const TRASH_ICON = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
);

interface MemCluster {
    key: string;
    label: string;
    x: number;
    y: number;
    w: number;
}
interface MemLayoutResult {
    positions: Record<number, { x: number; y: number }>;
    clusters: MemCluster[];
    width: number;
    height: number;
}

function memClusterOf(m: QuoteItem, group: MemGroup): { key: string; label: string; sort: string } {
    if (group === 'year') {
        return m.year
            ? { key: `y${m.year}`, label: String(m.year), sort: `0_${9999 - m.year}` }
            : { key: 'y_none', label: t('profile.memNoYear'), sort: '9' };
    }
    if (group === 'trip') {
        return m.trip
            ? { key: `t${m.trip.id}`, label: m.trip.name, sort: `0_${m.trip.name.toLowerCase()}` }
            : { key: 't_none', label: t('profile.memNoTrip'), sort: '9' };
    }
    if (group === 'author') {
        return { key: `a${m.author.id}`, label: m.author.name, sort: `0_${(m.author.name || '').toLowerCase()}` };
    }
    return { key: 'all', label: '', sort: '0' };
}

// Key for the SECONDARY ("Connect by") dimension that drives node colour +
// the hover constellation. Returns null for the missing-value buckets (no
// year / no trip) and for `none` — "both lack a trip" is not a relationship,
// so those cards stay neutral and never link. Reuses the cluster keys so a
// colour is consistent whether the dimension is the primary or the secondary.
function memLinkKey(m: QuoteItem, linkBy: MemGroup): string | null {
    if (linkBy === 'author') return m.author.id ? `a${m.author.id}` : null;
    if (linkBy === 'year') return m.year ? `y${m.year}` : null;
    if (linkBy === 'trip') return m.trip ? `t${m.trip.id}` : null;
    return null;
}

// Fixed colour per relationship dimension for the connection rays + legend
// (distinct from the per-author node hues). Blue = who, green = trip, amber
// = when. Order = ray draw + legend order.
type MemLinkDim = 'author' | 'year' | 'trip';
const MEM_LINK_DIMS: { k: MemLinkDim; color: string }[] = [
    { k: 'author', color: '#0a84ff' },
    { k: 'trip', color: '#30b46b' },
    { k: 'year', color: '#f5a623' },
];

// Which connection dimensions to draw. User-tunable in Settings → General;
// all on by default. Stored client-side (a view preference, like the menu
// handle) under `gg_mem_connect`.
const MEM_CONNECT_KEY = 'gg_mem_connect';
function readMemConnectPrefs(): Record<MemLinkDim, boolean> {
    try {
        const raw = localStorage.getItem(MEM_CONNECT_KEY);
        if (raw) {
            const p = JSON.parse(raw) as Partial<Record<MemLinkDim, boolean>>;
            return { author: p.author !== false, year: p.year !== false, trip: p.trip !== false };
        }
    } catch {
        /* malformed / unavailable → defaults */
    }
    return { author: true, year: true, trip: true };
}

function memComputeLayout(memories: QuoteItem[], group: MemGroup): MemLayoutResult {
    const groups = new Map<string, { label: string; sort: string; items: QuoteItem[] }>();
    for (const m of memories) {
        const c = memClusterOf(m, group);
        const cur = groups.get(c.key);
        if (cur) cur.items.push(m);
        else groups.set(c.key, { label: c.label, sort: c.sort, items: [m] });
    }
    const entries = [...groups.values()].sort((a, b) => a.sort.localeCompare(b.sort));

    const positions: Record<number, { x: number; y: number }> = {};
    const clusters: MemCluster[] = [];
    let cx = 0;
    let cy = 0;
    let rowH = 0;
    let width = 0;
    entries.forEach((grp, ci) => {
        const n = grp.items.length;
        // Squarish packing → a compact blob, not a wide row.
        const cols = memClamp(Math.ceil(Math.sqrt(n)), 1, 4);
        const rows = Math.ceil(n / cols);
        const w = cols * MEM_CARD_W + (cols - 1) * MEM_GAP;
        const labelH = group === 'none' ? 0 : MEM_LABEL_H;
        const h = labelH + rows * MEM_CARD_H + (rows - 1) * MEM_GAP;
        if (cx > 0 && cx + w > MEM_ROW_MAX_W) {
            cx = 0;
            cy += rowH + MEM_CLUSTER_GAP_Y;
            rowH = 0;
        }
        // Alternate clusters drop by a stagger (+ a little jitter) so their
        // baseline isn't a rigid line — reads as scattered nodes, not a table.
        const stag = Math.max(0, (ci % 2) * MEM_STAGGER + memHash(ci * 7 + 3) * 22);
        const clusterY = cy + stag;
        clusters.push({ key: `${grp.label}@${cx},${clusterY}`, label: grp.label, x: cx, y: clusterY, w });
        grp.items.forEach((m, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            positions[m.id] = {
                x: cx + col * (MEM_CARD_W + MEM_GAP) + memHash(m.id) * MEM_JITTER,
                y: clusterY + labelH + row * (MEM_CARD_H + MEM_GAP) + memHash(m.id + 9973) * MEM_JITTER,
            };
        });
        cx += w + MEM_CLUSTER_GAP_X;
        rowH = Math.max(rowH, stag + h);
        width = Math.max(width, cx - MEM_CLUSTER_GAP_X);
    });
    // Pad for the jitter / stagger overhang so fit-view doesn't clip edge cards.
    return {
        positions,
        clusters,
        width: width + MEM_JITTER,
        height: cy + rowH + MEM_JITTER,
    };
}

function MemoryCanvas({
    memories,
    isOwnProfile,
    onToggle,
    onRemove,
}: {
    memories: QuoteItem[];
    isOwnProfile: boolean;
    onToggle: (id: number, visible: boolean) => void;
    onRemove: (id: number) => void;
}) {
    const [group, setGroup] = useState<MemGroup>('none');
    const layout = useMemo(() => memComputeLayout(memories, group), [memories, group]);
    // Manual drag overrides, keyed by memory id. Effective position =
    // override ?? auto-layout. Kept SEPARATE from the auto-layout so a
    // visibility toggle / delete (which changes `memories`) re-packs the
    // base grid WITHOUT wiping the user's drags or resetting the view.
    const [overrides, setOverrides] = useState<Record<number, { x: number; y: number }>>({});
    const posOf = (id: number) => overrides[id] ?? layout.positions[id] ?? { x: 0, y: 0 };

    // ── Connection network. Every card is tinted by its AUTHOR (its identity
    // colour, shown at all zoom tiers). Hovering / tapping a card fires
    // colour-coded rays to EVERY memory it relates to — same author, same trip,
    // same year — each dimension a fixed colour (see the legend). No picker: the
    // network reveals itself. Only the ACTIVE card's relatives are drawn, so
    // it's O(relatives), never an N² mesh. Which dimensions show is user-tunable
    // in Settings (read once on mount; the canvas re-mounts on the next visit).
    const [pinnedId, setPinnedId] = useState<number | null>(null);
    const [hoverId, setHoverId] = useState<number | null>(null);
    const [connectDims] = useState(readMemConnectPrefs);
    const activeDims = MEM_LINK_DIMS.filter((d) => connectDims[d.k]);

    const activeId = pinnedId ?? hoverId;
    const activeMem = activeId != null ? memories.find((m) => m.id === activeId) ?? null : null;
    // Rays out of the active card: one per (relative, dimension) pair, coloured
    // by the dimension. A pair sharing two dimensions gets two parallel rays
    // (a small perpendicular offset keeps them from overlapping).
    const constellation = useMemo(() => {
        if (!activeMem) return null;
        const dims = MEM_LINK_DIMS.filter((d) => connectDims[d.k]);
        const rays: { id: number; color: string; offset: number }[] = [];
        const lit = new Set<number>([activeMem.id]);
        dims.forEach((d, di) => {
            const key = memLinkKey(activeMem, d.k);
            if (!key) return;
            const off = (di - (dims.length - 1) / 2) * 4;
            for (const m of memories) {
                if (m.id === activeMem.id) continue;
                if (memLinkKey(m, d.k) === key) {
                    rays.push({ id: m.id, color: d.color, offset: off });
                    lit.add(m.id);
                }
            }
        });
        return { rays, lit };
    }, [activeMem, memories, connectDims]);
    const litSet = constellation && constellation.rays.length > 0 ? constellation.lit : null;

    const [view, setView] = useState({ x: 40, y: 40, scale: 1 });
    const [interacting, setInteracting] = useState(false);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    // Live mirror of `view` so gesture handlers (which re-baseline mid-pinch)
    // always read the current scale, not a render-closure snapshot.
    const viewRef = useRef(view);
    viewRef.current = view;

    const g = useRef({
        mode: 'none' as 'none' | 'pan' | 'card' | 'pinch',
        pointers: new Map<number, { x: number; y: number }>(),
        cardId: -1,
        cardStart: { x: 0, y: 0 },
        pointerStart: { x: 0, y: 0 },
        scaleAtDown: 1,
        last: { x: 0, y: 0 },
        pinchDist: 1,
        pinchScale: 1,
        // Tap detection (a press that doesn't move) → toggle the constellation:
        // on a card = pin it, on empty space = clear the pin.
        downPt: { x: 0, y: 0 },
        moved: false,
    });

    const fitView = useCallback(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        const vw = vp.clientWidth;
        const vh = vp.clientHeight;
        if (!vw || !vh) return; // hidden / pre-layout — keep the default view
        const pad = 44;
        const w = layout.width || MEM_CARD_W;
        const h = layout.height || MEM_CARD_H;
        const scale = memClamp(Math.min((vw - pad * 2) / w, (vh - pad * 2) / h), MEM_MIN_SCALE, 1);
        setView({ scale, x: (vw - w * scale) / 2, y: Math.max(pad, (vh - h * scale) / 2) });
    }, [layout]);

    // Changing the grouping drops manual drags + refits the view. Runs on
    // first mount too (group starts 'none'). Intentionally keyed on `group`
    // only — refitting on every `memories` change would yank the view back
    // on each visibility toggle.
    useEffect(() => {
        setOverrides({});
        setPinnedId(null);
        setHoverId(null);
        fitView();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [group]);

    const localXY = (e: ReactPointerEvent) => {
        const r = viewportRef.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onPointerDown = (e: ReactPointerEvent) => {
        const vp = viewportRef.current;
        if (!vp) return;
        const targetEl = e.target as HTMLElement;
        // Let the card controls + zoom buttons handle their own clicks.
        if (targetEl.closest('.pf-mem-ctrl') || targetEl.closest('.pf-canvas-zoom')) return;
        // Recover from any leaked pointer (a missed up/cancel or lost capture):
        // a brand-new interaction must never think fingers are already down,
        // or the next tap would be misread as a 2-finger pinch.
        if (g.current.mode === 'none' && g.current.pointers.size > 0) {
            g.current.pointers.clear();
        }
        const pt = localXY(e);
        g.current.pointers.set(e.pointerId, pt);
        vp.setPointerCapture(e.pointerId);
        setInteracting(true);
        if (g.current.pointers.size >= 2) {
            const pts = [...g.current.pointers.values()];
            const a = pts[0];
            const b = pts[1];
            if (a && b) {
                g.current.mode = 'pinch';
                g.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                g.current.pinchScale = viewRef.current.scale;
            }
            return;
        }
        g.current.downPt = pt;
        g.current.moved = false;
        const cardEl = targetEl.closest('[data-card]') as HTMLElement | null;
        if (cardEl) {
            const id = Number(cardEl.dataset.card);
            g.current.mode = 'card';
            g.current.cardId = id;
            g.current.cardStart = posOf(id);
            g.current.pointerStart = pt;
            g.current.scaleAtDown = viewRef.current.scale;
        } else {
            g.current.mode = 'pan';
            g.current.last = pt;
        }
    };

    const onPointerMove = (e: ReactPointerEvent) => {
        if (!g.current.pointers.has(e.pointerId)) return;
        const pt = localXY(e);
        g.current.pointers.set(e.pointerId, pt);
        if (!g.current.moved && Math.hypot(pt.x - g.current.downPt.x, pt.y - g.current.downPt.y) > 5) {
            g.current.moved = true;
        }
        const mode = g.current.mode;
        if (mode === 'pinch' && g.current.pointers.size >= 2) {
            const pts = [...g.current.pointers.values()];
            const a = pts[0];
            const b = pts[1];
            if (!a || !b) return;
            const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const scale = memClamp((g.current.pinchScale * dist) / g.current.pinchDist, MEM_MIN_SCALE, MEM_MAX_SCALE);
            setView((v) => {
                const wx = (mid.x - v.x) / v.scale;
                const wy = (mid.y - v.y) / v.scale;
                return { scale, x: mid.x - wx * scale, y: mid.y - wy * scale };
            });
        } else if (mode === 'card') {
            const id = g.current.cardId;
            const nx = g.current.cardStart.x + (pt.x - g.current.pointerStart.x) / g.current.scaleAtDown;
            const ny = g.current.cardStart.y + (pt.y - g.current.pointerStart.y) / g.current.scaleAtDown;
            setOverrides((prev) => ({ ...prev, [id]: { x: nx, y: ny } }));
        } else if (mode === 'pan') {
            const dx = pt.x - g.current.last.x;
            const dy = pt.y - g.current.last.y;
            g.current.last = pt;
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
        }
    };

    const endPointer = (e: ReactPointerEvent) => {
        if (!g.current.pointers.delete(e.pointerId)) return;
        const endedMode = g.current.mode;
        const endedCardId = g.current.cardId;
        const wasTap = !g.current.moved;
        try {
            viewportRef.current?.releasePointerCapture(e.pointerId);
        } catch {
            /* already released */
        }
        if (g.current.pointers.size === 0) {
            g.current.mode = 'none';
            setInteracting(false);
            // A tap (press with no drag): on a card pin/unpin its constellation;
            // on empty canvas clear the pinned constellation.
            if (wasTap) {
                if (endedMode === 'card') setPinnedId((p) => (p === endedCardId ? null : endedCardId));
                else if (endedMode === 'pan') setPinnedId(null);
            }
        } else if (g.current.pointers.size === 1) {
            // pinch released one finger → keep panning with the remaining one
            const only = [...g.current.pointers.values()][0];
            if (only) {
                g.current.mode = 'pan';
                g.current.last = only;
            }
        } else {
            // Still ≥2 fingers (e.g. 3→2) → re-baseline the pinch on the
            // surviving pair so the next move isn't measured against a stale
            // distance/scale and teleport the view.
            const pts = [...g.current.pointers.values()];
            const a = pts[0];
            const b = pts[1];
            if (a && b) {
                g.current.mode = 'pinch';
                g.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
                g.current.pinchScale = viewRef.current.scale;
            }
        }
    };

    const onWheel = (e: ReactWheelEvent) => {
        e.preventDefault();
        const r = viewportRef.current!.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        setView((v) => {
            const scale = memClamp(v.scale * (1 - e.deltaY * 0.0016), MEM_MIN_SCALE, MEM_MAX_SCALE);
            const wx = (cx - v.x) / v.scale;
            const wy = (cy - v.y) / v.scale;
            return { scale, x: cx - wx * scale, y: cy - wy * scale };
        });
    };

    const zoomBy = (factor: number) => {
        const vp = viewportRef.current;
        if (!vp) return;
        const cx = vp.clientWidth / 2;
        const cy = vp.clientHeight / 2;
        setView((v) => {
            const scale = memClamp(v.scale * factor, MEM_MIN_SCALE, MEM_MAX_SCALE);
            const wx = (cx - v.x) / v.scale;
            const wy = (cy - v.y) / v.scale;
            return { scale, x: cx - wx * scale, y: cy - wy * scale };
        });
    };

    const groupOpts: { k: MemGroup; label: string }[] = [
        { k: 'none', label: t('profile.memGroupNone') },
        { k: 'year', label: t('profile.memGroupYear') },
        { k: 'trip', label: t('profile.memGroupTrip') },
        { k: 'author', label: t('profile.memGroupAuthor') },
    ];

    return (
        <div className="pf-canvas">
            <div className="pf-canvas-bar">
                <span className="pf-canvas-bar__label">{t('profile.memArrangeBy')}</span>
                <div className="pf-canvas-seg">
                    {groupOpts.map((o) => (
                        <button
                            key={o.k}
                            type="button"
                            className="pf-canvas-seg__btn"
                            data-active={group === o.k}
                            onClick={() => setGroup(o.k)}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                {/* Passive legend for the connection rays (no picker — hovering a
                    card links it to everything it shares an author / trip / year
                    with, each dimension its own colour). Only lists the
                    dimensions enabled in Settings. */}
                {activeDims.length > 0 ? (
                    <div className="pf-canvas-legend">
                        <span className="pf-canvas-bar__label pf-canvas-bar__label--link">
                            {t('profile.memConnectBy')}
                        </span>
                        {activeDims.map((d) => (
                            <span key={d.k} className="pf-canvas-legend__item">
                                <span
                                    className="pf-canvas-legend__dot"
                                    style={{ background: d.color }}
                                    aria-hidden="true"
                                />
                                {d.k === 'author'
                                    ? t('profile.memGroupAuthor')
                                    : d.k === 'trip'
                                      ? t('profile.memGroupTrip')
                                      : t('profile.memGroupYear')}
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>
            <div
                ref={viewportRef}
                className={`pf-canvas-viewport${interacting ? ' is-interacting' : ''}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
                onLostPointerCapture={endPointer}
                onWheel={onWheel}
            >
                <div
                    className="pf-canvas-plane"
                    data-lod={view.scale >= 0.66 ? 'full' : view.scale >= 0.38 ? 'avatar' : 'dot'}
                    style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
                >
                    {/* Constellation overlay — only the ACTIVE (hovered/pinned)
                        card's same-secondary-key siblings, drawn as a star from
                        that card (a hub), so the edge count is O(group size). In
                        the plane's coordinate space so it pans/zooms with the
                        cards; non-scaling-stroke keeps the lines crisp at any
                        zoom. Behind the cards (first child). */}
                    {litSet && activeMem && constellation && constellation.rays.length > 0 ? (
                        <svg
                            className="pf-mem-edges"
                            aria-hidden="true"
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: layout.width || 1,
                                height: layout.height || 1,
                                overflow: 'visible',
                                pointerEvents: 'none',
                            }}
                        >
                            {(() => {
                                const a = posOf(activeMem.id);
                                const ax = a.x + MEM_CARD_W / 2;
                                const ay = a.y + MEM_CARD_H / 2;
                                return constellation.rays.map((ray, i) => {
                                    const q = posOf(ray.id);
                                    const bx = q.x + MEM_CARD_W / 2;
                                    const by = q.y + MEM_CARD_H / 2;
                                    // Offset the whole ray perpendicular to itself so
                                    // multiple dimensions between the same pair read as
                                    // parallel coloured lines instead of overlapping.
                                    const len = Math.hypot(bx - ax, by - ay) || 1;
                                    const ox = (-(by - ay) / len) * ray.offset;
                                    const oy = ((bx - ax) / len) * ray.offset;
                                    return (
                                        <line
                                            key={i}
                                            className="pf-mem-edge"
                                            x1={ax + ox}
                                            y1={ay + oy}
                                            x2={bx + ox}
                                            y2={by + oy}
                                            style={{ stroke: ray.color, color: ray.color }}
                                        />
                                    );
                                });
                            })()}
                        </svg>
                    ) : null}
                    {group !== 'none'
                        ? layout.clusters.map((c) => (
                              <div
                                  key={c.key}
                                  className="pf-cluster-label"
                                  style={{ transform: `translate(${c.x}px, ${c.y}px)`, width: c.w }}
                              >
                                  {c.label}
                              </div>
                          ))
                        : null}
                    {memories.map((m) => {
                        const p = posOf(m.id);
                        const hidden = isOwnProfile && !m.isVisible;
                        // Node identity colour = its author (stable per person).
                        const lk = memLinkKey(m, 'author');
                        const lit = litSet ? litSet.has(m.id) : false;
                        const hub = activeId === m.id && !!litSet;
                        return (
                            <div
                                key={m.id}
                                data-card={m.id}
                                className={`pf-mem-card${hidden ? ' pf-mem-card--hidden' : ''}${
                                    litSet ? (lit ? ' pf-mem-card--lit' : ' pf-mem-card--dim') : ''
                                }${hub ? ' pf-mem-card--hub' : ''}`}
                                style={{
                                    transform: `translate(${p.x}px, ${p.y}px)`,
                                    // Neutral grey for the no-year / no-trip buckets so they read
                                    // as "unlinked" rather than sharing a colour.
                                    ['--link-color' as string]: lk ? keyColor(lk) : '#c4c4cc',
                                }}
                                onMouseEnter={() => setHoverId(m.id)}
                                onMouseLeave={() => setHoverId((h) => (h === m.id ? null : h))}
                            >
                                {/* Zoom level-of-detail: as you zoom out, the plane's
                                    data-lod flips full → avatar → dot (CSS picks one). */}
                                <div className="pf-mem-card__lod-ava" aria-hidden="true">
                                    {m.author.picture ? (
                                        <img
                                            src={m.author.picture}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <span>{(m.author.name || '?').charAt(0).toUpperCase()}</span>
                                    )}
                                </div>
                                <span
                                    className="pf-mem-card__lod-dot"
                                    aria-hidden="true"
                                    style={{ background: 'var(--link-color)' }}
                                />
                                <div className="pf-mem-card__text">{m.text}</div>
                                <div className="pf-mem-card__foot">
                                    {m.author.picture ? (
                                        <img
                                            className="pf-mem-card__ava"
                                            src={m.author.picture}
                                            alt=""
                                            referrerPolicy="no-referrer"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <div className="pf-mem-card__ava pf-mem-card__ava--fb">
                                            {(m.author.name || '?').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <span className="pf-mem-card__author">{m.author.name}</span>
                                    {m.trip || m.year ? (
                                        <span className="pf-mem-card__tags">
                                            {m.trip ? (
                                                <span className="pf-mem-chip">
                                                    {/* F4-I5: only render the flag when flagUrl()
                                                        resolves to a real path — a malformed /
                                                        3-letter stored country_code returns '' and
                                                        would otherwise paint a broken-image glyph. */}
                                                    {flagUrl(m.trip.countryCode) ? (
                                                        <img
                                                            className="pf-mem-chip__flag"
                                                            src={flagUrl(m.trip.countryCode)}
                                                            alt=""
                                                            loading="lazy"
                                                        />
                                                    ) : null}
                                                    {m.trip.name}
                                                </span>
                                            ) : null}
                                            {m.year ? <span className="pf-mem-chip">{m.year}</span> : null}
                                        </span>
                                    ) : null}
                                </div>
                                {hidden ? (
                                    <span className="pf-mem-card__badge">{t('profile.quotesHiddenBadge')}</span>
                                ) : null}
                                {isOwnProfile ? (
                                    <div className="pf-mem-card__ctrl">
                                        <button
                                            type="button"
                                            className="pf-mem-ctrl"
                                            title={m.isVisible ? t('profile.quotesHide') : t('profile.quotesShow')}
                                            aria-label={m.isVisible ? t('profile.quotesHide') : t('profile.quotesShow')}
                                            onClick={() => onToggle(m.id, !m.isVisible)}
                                        >
                                            {m.isVisible ? EYE_OFF_ICON : EYE_ICON}
                                        </button>
                                        <button
                                            type="button"
                                            className="pf-mem-ctrl pf-mem-ctrl--del"
                                            title={t('profile.quotesDelete')}
                                            aria-label={t('profile.quotesDelete')}
                                            onClick={() => onRemove(m.id)}
                                        >
                                            {TRASH_ICON}
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
                <div className="pf-canvas-zoom">
                    <button type="button" onClick={() => zoomBy(1.25)} aria-label="Zoom in">
                        +
                    </button>
                    <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom out">
                        −
                    </button>
                    <button type="button" onClick={fitView} aria-label={t('profile.memResetView')}>
                        ⤢
                    </button>
                </div>
            </div>
        </div>
    );
}

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
    const statusRef = useRef<HTMLInputElement | null>(null);
    const bioRef = useRef<HTMLTextAreaElement | null>(null);
    // Home country + currency are now tappable tiles backed by searchable
    // picker modals (openStatListModal), so they're controlled React state
    // rather than <select> refs. Currency still auto-saves on pick.
    const [homeCountry, setHomeCountry] = useState<string>(user.homeCountry || '');
    const [homeCurrency, setHomeCurrency] = useState<string>(getHomeCurrency());
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    const onSave = async () => {
        if (!STATE.user) return;
        const newStatus = statusRef.current?.value || '';
        const newBio = bioRef.current?.value || '';
        // Currency auto-saves on pick (applyHomeCurrency), so the source of truth
        // is STATE.user, NOT the `homeCurrency` display state — that's seeded from
        // getHomeCurrency() which never returns empty, so OR-ing through it would
        // resurrect a concrete currency for a user whose home_currency is still
        // NULL ("never picked") when they only edit their bio.
        const newHomeCurrency = STATE.user.homeCurrency || null;
        // E7-I1: home country now auto-saves on pick too (applyHomeCountry), so
        // like currency the source of truth is STATE.user — the bio/status save
        // must not re-send stale display state and clobber the persisted value.
        const newHomeCountry = STATE.user.homeCountry || null;
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

    // Home currency applies IMMEDIATELY on pick — it's a setting, not a form
    // field. Previously it only persisted via the "Save profile" button (hidden
    // until a field went dirty), so a user who just picked a currency saw it
    // silently not stick and Insights stayed on the EUR default. Auto-save fixes
    // that: POST → update STATE.user → emit so every surface re-reads the new
    // home currency. On failure we revert the tile so it never lies.
    const applyHomeCurrency = async (code: string) => {
        if (!STATE.user) return;
        const old = STATE.user.homeCurrency || null;
        if (code === old) {
            setHomeCurrency(code);
            return;
        }
        setHomeCurrency(code); // optimistic — revert below if the POST fails
        try {
            const res = await apiFetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homeCurrency: code }),
            });
            if (!res.ok) {
                showLiquidAlert(t('profile.saveFailed', { status: res.status }));
                setHomeCurrency(old || getHomeCurrency());
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
            setHomeCurrency(old || getHomeCurrency());
        }
    };

    // Home country applies IMMEDIATELY on pick, mirroring home currency.
    // E7-I1: the two tiles sit side by side, so a country that only persisted
    // via the (conditionally-shown) "Save profile" button while currency saved
    // instantly was an inconsistency — users picked a country, left, and lost
    // it. Auto-save both. Empty string = "Not set" sentinel → stored as null so
    // downstream readers distinguish "actively cleared" from "never picked".
    // On failure we revert the tile so it never lies.
    const applyHomeCountry = async (name: string) => {
        if (!STATE.user) return;
        const old = STATE.user.homeCountry || null;
        const next = name || null;
        if (next === old) {
            setHomeCountry(name);
            return;
        }
        setHomeCountry(name); // optimistic — revert below if the POST fails
        try {
            const res = await apiFetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homeCountry: next }),
            });
            if (!res.ok) {
                showLiquidAlert(t('profile.saveFailed', { status: res.status }));
                setHomeCountry(old || '');
                return;
            }
            STATE.user.homeCountry = next;
            emit('state:changed');
            showLiquidAlert(t('profile.updated'), 'success');
        } catch (e) {
            console.error('Home country update failed:', e);
            showLiquidAlert(t('profile.saveNetwork'));
            setHomeCountry(old || '');
        }
    };

    // Country tile → searchable picker (flag + name rows). Picking auto-saves
    // immediately (see applyHomeCountry).
    const openCountryPicker = () => {
        const items: StatListItem[] = [
            {
                primary: t('profile.homeCountryNotSet'),
                avatarInitial: '—',
                onClick: () => void applyHomeCountry(''),
            },
            ...getCountryOptions().map(({ code, name }) => ({
                primary: name,
                avatarUrl: flagUrl(code),
                onClick: () => void applyHomeCountry(name),
            })),
        ];
        openStatListModal({ title: t('profile.homeCountryAria'), items });
    };

    // Currency tile → searchable picker (symbol + code rows). Picking
    // auto-saves immediately (see applyHomeCurrency).
    const openCurrencyPicker = () => {
        // E7-B1: union of rate-backed currencies (EUR + static table + live FX
        // cache) with every symbol-known = server-allowed code, matching the
        // expense / budget / rates pickers. Pre-fix this listed only the 17
        // keys of CONVERSION_RATES, so a user already on SEK/NOK/DKK/THB/… had
        // no row for their own currency and tapping any of the 17 silently
        // downgraded them.
        const items: StatListItem[] = Array.from(
            new Set([...getSupportedCurrencies(), ...Object.keys(CURRENCY_SYMBOLS)]),
        )
            .sort((a, b) => (a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b)))
            .map((code) => ({
                primary: code,
                avatarInitial: CURRENCY_SYMBOLS[code] || code.slice(0, 1),
                onClick: () => void applyHomeCurrency(code),
            }));
        openStatListModal({ title: t('profile.homeCurrencyAria'), items });
    };

    if (!isOwnProfile) {
        // Foreign profile — status pill + read-only bio.
        // E7-I2: status is free text authored in the viewer's own language and
        // shown verbatim — it is NOT localized per-viewer. The only special case
        // is a legacy row that stored one of the five English preset strings
        // before free-text; translate those so old presets still read in the
        // viewer's locale, otherwise display the stored text as-is.
        const _legacyPresetLabels: Record<string, string> = {
            'Deliberating next trip': t('profile.statusDeliberating'),
            'Preparing a trip right now': t('profile.statusPreparing'),
            'Exploring the world': t('profile.statusExploring'),
            'Resting at home base': t('profile.statusResting'),
            'Hunting for flight deals': t('profile.statusHunting'),
        };
        const statusLabel = !user.status
            ? t('profile.statusDefault')
            : _legacyPresetLabels[user.status] || user.status;
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

            {/* Status — free text the user authors themselves. The chips are
                just tappable suggestions (no emoji, deliberately plain); the
                stored value is whatever's in the input, so any language /
                wording works. */}
            <div className="pf-setting-row">
                <div className="pf-setting-row__text">
                    <div className="pf-setting-row__label">{t('profile.statusRowLabel')}</div>
                </div>
                <input
                    ref={statusRef}
                    type="text"
                    className="pf-status-input"
                    aria-label={t('profile.statusAriaLabel')}
                    placeholder={t('profile.statusSet')}
                    defaultValue={user.status || ''}
                    maxLength={70}
                    onInput={() => setDirty(true)}
                />
                <div className="pf-status-suggest">
                    {[
                        t('profile.statusExploring'),
                        t('profile.statusPreparing'),
                        t('profile.statusResting'),
                        t('profile.statusDeliberating'),
                        t('profile.statusHunting'),
                    ].map((s) => (
                        <button
                            key={s}
                            type="button"
                            className="pf-status-chip"
                            onClick={() => {
                                if (statusRef.current) statusRef.current.value = s;
                                setDirty(true);
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            {/* Home country + currency — tappable tiles that open a searchable
                picker. Country = flag field + name; currency = coin + code. */}
            <div className="pf-tiles">
                <div className="pf-tile-wrap">
                    <button
                        type="button"
                        className={`pf-tile pf-tile--country${homeCountry && countryCodeFromName(homeCountry) ? '' : ' pf-tile--empty'}`}
                        onClick={openCountryPicker}
                        aria-label={t('profile.homeCountryAria')}
                    >
                        {homeCountry && countryCodeFromName(homeCountry) ? (
                            <img
                                className="pf-tile__flag-img"
                                src={flagUrl(countryCodeFromName(homeCountry))}
                                alt=""
                                aria-hidden="true"
                                loading="lazy"
                                decoding="async"
                                onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                            />
                        ) : null}
                        <span className="pf-tile__scrim" aria-hidden="true" />
                        <span className="pf-tile__label">
                            {homeCountry || t('profile.homeCountryNotSet')}
                        </span>
                    </button>
                    <span className="pf-tile__caption">{t('profile.homeCountryAria')}</span>
                </div>

                <div className="pf-tile-wrap">
                    <button
                        type="button"
                        className="pf-tile pf-tile--currency"
                        onClick={openCurrencyPicker}
                        aria-label={t('profile.homeCurrencyAria')}
                    >
                        <span className="pf-tile__coin" aria-hidden="true">
                            {/* E7-I4: fall back to a single character (not the
                                bare 3-letter code) so a symbol-less currency
                                never overflows the circular coin — matches the
                                currency-picker rows. */}
                            {CURRENCY_SYMBOLS[homeCurrency] || homeCurrency.slice(0, 1)}
                        </span>
                        <span className="pf-tile__label">{homeCurrency}</span>
                    </button>
                    <span className="pf-tile__caption">{t('profile.homeCurrencyAria')}</span>
                </div>
            </div>

            <div className="pf-divider" />

            {/* Save (only while there are unsaved edits) + Log out — both
                centered, stacked. */}
            <div className="pf-actions">
                {dirty && (
                    <button
                        type="button"
                        className="pf-save-btn"
                        onClick={() => void onSave()}
                        disabled={saving}
                    >
                        {saving ? 'Saving…' : 'Save Profile'}
                    </button>
                )}
                <button type="button" className="btn-logout" onClick={onLogout}>
                    {t('profile.logOut')}
                </button>
            </div>
        </div>
    );
}
