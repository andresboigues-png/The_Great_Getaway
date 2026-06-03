// pages/ai/RoleNotice.tsx — extracted from AI.tsx (behavior-preserving).
//
// Shown in place of the Generate button when the viewer can't edit
// the active trip. Spells out the viewer's role + why generation is
// gated. Pure presentation off the active trip's role.

import { t } from '../../i18n.js';
import {
    getMyRole,
    ROLE_BUDGETEER,
    ROLE_RELAXER,
} from '../../permissions.js';
import type { Trip } from '../../types';

export function RoleNotice({ activeTrip }: { activeTrip: Trip }) {
    const role = getMyRole(activeTrip);
    const roleLabel =
        role === ROLE_BUDGETEER
            ? t('ai.roleBudgeteer')
            : role === ROLE_RELAXER
              ? t('ai.roleRelaxer')
              : t('ai.roleObserver');
    const note =
        role === ROLE_BUDGETEER ? t('ai.roleNoteBudgeteer') : t('ai.roleNoteOther');
    return (
        <div
            className="card glass p-4 rounded-[var(--radius-lg)] text-center text-secondary text-[0.85rem] flex-none"
        >
            {t('ai.roleNotice', { role: roleLabel, note })}
        </div>
    );
}
