// pages/feed/CommentThread.tsx — extracted from Feed.tsx (decomposition).
//
// Comment thread (list + form) for a single event card. Static rows
// render via commentRowHtml (raw HTML) — their delete/edit buttons are
// caught by a delegated click listener on the list root and bridged
// back into React state. When a row is being edited it swaps to the
// CommentEditRow input. The new-comment form sits at the bottom.

import { useEffect, useRef, useState } from 'react';
import { STATE } from '../../state.js';
import { t } from '../../i18n.js';
import { commentRowHtml, type FeedComment } from './render.js';
import { CommentEditRow } from './CommentEditRow.js';


// E5-I4: the server hard-slices body[:500] on both create + edit, so
// a paste beyond this is silently truncated. The counter below appears
// only once the user nears the cap, mirroring the server's contract.
const MAX_COMMENT_LEN = 500;
// Show the counter only when it's actually informative — Apple-like
// restraint, no permanent chrome under an empty box.
const COUNTER_THRESHOLD = MAX_COMMENT_LEN - 50;

interface CommentThreadProps {
    eventId: string;
    comments: FeedComment[];
    onDelete: (commentId: number) => void;
    onEdit: (commentId: number, body: string) => void;
    onSubmit: (body: string, input: HTMLInputElement) => void;
    // E5-I1: true when the viewer owns the post (isMyOriginalShare),
    // so they may moderate — delete — any comment on their own share.
    // The matching server branch lives in delete_feed_comment.
    canModerate?: boolean;
}

export function CommentThread({ eventId, comments, onDelete, onEdit, onSubmit, canModerate = false }: CommentThreadProps) {
    const meId = STATE.user?.id;
    const inputRef = useRef<HTMLInputElement | null>(null);
    // E5-I4: live length of the new-comment input, for the counter.
    const [draftLen, setDraftLen] = useState(0);
    // Audit fix (2026-05-27, fix #60): edit-in-place state. When set,
    // the matching comment row renders an input + Save/Cancel instead
    // of the static commentRowHtml. Submit calls onEdit which is the
    // optimistic update path in the parent.
    const [editingId, setEditingId] = useState<number | null>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const input = inputRef.current;
        if (!input) return;
        const body = input.value.trim();
        if (!body) return;
        onSubmit(body, input);
        // Parent clears input.value synchronously — keep the counter in sync.
        setDraftLen(0);
    };

    const listRef = useRef<HTMLDivElement | null>(null);
    // Delete + edit-button delegation: commentRowHtml emits buttons
    // with .feed-comment-{delete,edit}-btn + data-comment-id. We catch
    // their clicks here to bridge back into React state.
    useEffect(() => {
        const root = listRef.current;
        if (!root) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            const delBtn = target?.closest('.feed-comment-delete-btn') as HTMLElement | null;
            if (delBtn) {
                const id = Number(delBtn.dataset.commentId);
                if (Number.isFinite(id)) onDelete(id);
                return;
            }
            const editBtn = target?.closest('.feed-comment-edit-btn') as HTMLElement | null;
            if (editBtn) {
                const id = Number(editBtn.dataset.commentId);
                if (Number.isFinite(id)) setEditingId(id);
            }
        };
        root.addEventListener('click', handler);
        return () => root.removeEventListener('click', handler);
    }, [onDelete]);

    const renderRow = (c: FeedComment) => {
        const isMine = c.author?.id === meId;
        // Edit is author-only (server PATCH 403s non-authors); delete is
        // author OR post owner (server delete_feed_comment moderation).
        const canEdit = isMine;
        const canDelete = isMine || canModerate;
        if (isMine && editingId === c.id) {
            return (
                <CommentEditRow
                    key={c.id}
                    comment={c}
                    onSave={(body) => {
                        setEditingId(null);
                        // E5-I2: clearing the box and saving used to
                        // silently no-op — the editor closed and the
                        // original reappeared with no feedback. Treat an
                        // empty save as intent-to-delete, routed through
                        // the same confirm dialog as the ✕ affordance.
                        if (!body) {
                            onDelete(c.id);
                            return;
                        }
                        if (body !== c.body) onEdit(c.id, body);
                    }}
                    onCancel={() => setEditingId(null)}
                />
            );
        }
        return (
            <div
                key={c.id}
                dangerouslySetInnerHTML={{ __html: commentRowHtml(c, canEdit, canDelete) }}
            />
        );
    };

    return (
        <>
            <div ref={listRef} className="feed-comment-list">
                {comments.length > 0 ? (
                    comments.map((c) => renderRow(c))
                ) : (
                    <div className="text-[0.82rem] text-secondary py-1.5 px-0">
                        {t('feed.commentsEmpty')}
                    </div>
                )}
            </div>
            <form
                data-event-id={eventId}
                onSubmit={handleSubmit}
                className="flex gap-2 mt-[10px]"
            >
                <input
                    ref={inputRef}
                    type="text"
                    name="body"
                    /* R6-B5: placeholder is not a label — screen
                     * readers announce "edit, blank" without an
                     * explicit aria-label. The placeholder also
                     * disappears on input. Route through t() so
                     * the announcement matches the user's locale. */
                    aria-label={t('feed.commentInputLabel')}
                    placeholder={t('feed.commentInputLabel')}
                    maxLength={MAX_COMMENT_LEN}
                    autoComplete="off"
                    onChange={(e) => setDraftLen(e.currentTarget.value.length)}
                    className="flex-1 min-w-0 py-2 px-3 border border-[rgba(0,45,91,0.12)] rounded-full text-[0.85rem] bg-[rgba(0,113,227,0.04)] text-brand-navy font-[inherit]"
                />
                <button
                    type="submit"
                    className="feed-comment-submit bg-accent-blue text-white border-0 py-2 px-4 rounded-full text-[0.82rem] font-extrabold cursor-pointer"
                    title={t('feed.commentPostAria')}
                    aria-label={t('feed.commentPostAria')}
                >
                    {t('feed.commentSubmit')}
                </button>
            </form>
            {/* E5-I4: counter appears only near the cap — no permanent
                chrome. It goes red at 0 so a paste that would be
                truncated is visible before the user hits Post. */}
            {draftLen >= COUNTER_THRESHOLD ? (
                <div
                    aria-live="polite"
                    className="text-[0.7rem] text-secondary text-right mt-1"
                    style={draftLen >= MAX_COMMENT_LEN ? { color: 'rgba(255,59,48,0.85)' } : undefined}
                >
                    {t('feed.commentCharsLeft', { n: MAX_COMMENT_LEN - draftLen })}
                </div>
            ) : null}
        </>
    );
}
