// @ts-check
// Rows — repeated list-row patterns. Returns HTML strings to fit the
// existing template-literal innerHTML pipeline.
//
// Currently shipped:
//   friendRow() — the avatar+name+email block used by the friends page in
//     three flavors (accepted, pending, search-result). Each flavor varies
//     the user-row variant class and the right-side action; the avatar +
//     identity block is identical across all three.
//
// Not yet here (single-site, helper would be premature abstraction):
//   - dayCard, expenseRow, notificationItem (1 site each)
//   - companion picker friend rows in modals.js (use companion-row, not friend-row)
//
// `esc` is imported from utils.js to keep XSS prevention in one place — every
// user-controlled string we splice into a template (name, email, picture URL)
// gets HTML-escaped at the boundary.

import { esc } from '../utils.js';

/**
 * @typedef {object} FriendUser
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string} [picture]
 */

/**
 * One row in a friend / user list. The rightSide slot lets callers inject
 * a button (Accept, Add, Send Request) or a chevron (clickable-to-profile).
 *
 * @param {object} opts
 * @param {FriendUser} opts.user
 * @param {'neutral'|'warn'|'brand'} [opts.variant='neutral'] - maps to user-row--<variant>
 * @param {string} [opts.extraClass] - additional row classes (e.g. 'friend-row' to wire delegated profile-navigation)
 * @param {string} [opts.rightSide=''] - raw HTML inserted to the right of the identity block
 * @returns {string}
 */
export function friendRow(opts) {
    const { user, variant = 'neutral', extraClass = '', rightSide = '' } = opts;
    const cls = `user-row user-row--${variant}${extraClass ? ' ' + extraClass : ''}`;
    return `
        <div class="${cls}" data-user-id="${esc(user.id)}">
            <div style="display: flex; align-items: center; gap: var(--space-3);">
                <img src="${esc(user.picture || '')}" style="width: 32px; height: 32px; border-radius: 50%;">
                <div>
                    <div style="font-weight: 600; font-size: var(--font-base);">${esc(user.name)}</div>
                    <div style="font-size: var(--font-xs); color: var(--text-secondary);">${esc(user.email)}</div>
                </div>
            </div>
            ${rightSide}
        </div>
    `;
}
