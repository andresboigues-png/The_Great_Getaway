// pages/templates-mount/state.ts — module-level view state for the
// Templates page (sort + search + groupBy). Survives unmount/remount so
// navigating away and back preserves the user's picks, mirroring
// collections-mount/state.ts. groupBy persists to localStorage (it's a
// durable view preference); sort + search reset per session.

import type { TemplateGroupBy, TemplateSort } from './helpers.js';

const _GROUPBY_KEY = 'gg_templates_groupby';

function _initialGroupBy(): TemplateGroupBy {
    try {
        const raw = localStorage.getItem(_GROUPBY_KEY);
        if (raw === 'continent' || raw === 'year' || raw === 'creator') return raw;
    } catch (_) {
        /* localStorage unavailable */
    }
    return 'continent';
}

interface TemplatesViewState {
    sort: TemplateSort;
    searchText: string;
    groupBy: TemplateGroupBy;
}

const _state: TemplatesViewState = {
    sort: 'recent',
    searchText: '',
    groupBy: _initialGroupBy(),
};

export function getTemplatesView(): TemplatesViewState {
    return { ..._state };
}

export function setTemplatesSort(sort: TemplateSort): void {
    _state.sort = sort;
}

export function setTemplatesSearchText(text: string): void {
    _state.searchText = text;
}

export function setTemplatesGroupBy(groupBy: TemplateGroupBy): void {
    _state.groupBy = groupBy;
    try {
        localStorage.setItem(_GROUPBY_KEY, groupBy);
    } catch (_) {
        /* localStorage full / disabled — fine, just won't persist */
    }
}
