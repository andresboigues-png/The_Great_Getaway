// pages/feed/CommentEditRow.tsx — extracted from Feed.tsx (decomposition).
//
// Audit fix (2026-05-27, fix #60): renders inside CommentThread in
// place of the static commentRowHtml when the user taps the pencil
// affordance. Submit closes the editor + fires the optimistic edit
// in the parent. ESC cancels. Body capped at 500 to mirror the
// create + server-side limits.

import { useEffect, useRef } from 'react';
import { t } from '../../i18n.js';
import type { FeedComment } from './render.js';


interface CommentEditRowProps {
    comment: FeedComment;
    onSave: (body: string) => void;
    onCancel: () => void;
}

export function CommentEditRow({ comment, onSave, onCancel }: CommentEditRowProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        // Place caret at end so the user can append without
        // re-positioning. Pre-fix the input selected-all on focus
        // which made appends require a click-to-deselect first.
        const len = el.value.length;
        try { el.setSelectionRange(len, len); } catch { /* old browsers */ }
    }, []);

    const submit = () => {
        const v = (inputRef.current?.value || '').trim().slice(0, 500);
        onSave(v);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            submit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
        }
    };

    return (
        <div
            className="feed-comment-row"
            data-comment-id={comment.id}
            style={{
                display: 'flex',
                gap: '10px',
                padding: '8px 0',
                borderBottom: '1px dashed rgba(0,45,91,0.06)',
                alignItems: 'center',
            }}
        >
            <input
                ref={inputRef}
                type="text"
                defaultValue={comment.body || ''}
                maxLength={500}
                onKeyDown={onKeyDown}
                style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '6px 10px',
                    border: '1px solid rgba(0,45,91,0.12)',
                    borderRadius: '999px',
                    fontSize: '0.85rem',
                    background: 'rgba(0,113,227,0.04)',
                    color: 'var(--text-brand-navy)',
                    fontFamily: 'inherit',
                }}
            />
            <button
                type="button"
                onClick={submit}
                style={{
                    background: 'var(--accent-blue, #0071e3)',
                    color: '#fff',
                    border: 0,
                    borderRadius: '999px',
                    padding: '6px 14px',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    flexShrink: 0,
                }}
            >
                {t('feed.commentEditSave')}
            </button>
            <button
                type="button"
                onClick={onCancel}
                style={{
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    border: 0,
                    padding: '6px 8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    flexShrink: 0,
                }}
            >
                {t('feed.commentEditCancel')}
            </button>
        </div>
    );
}
