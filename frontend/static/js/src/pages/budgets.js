// @ts-check
import { STATE, emit } from '../state.js';
import { CONVERSION_RATES } from '../constants.js';
import { generateId, q, formatHome, getHomeCurrency } from '../utils.js';
import { upsertBudget, deleteBudgetOnServer } from '../api.js';
import { navigate } from '../router.js';

const deleteBudget = (id) => {
    STATE.budgets = STATE.budgets.filter(b => b.id !== id);
    emit('state:changed');
    deleteBudgetOnServer(id); // Delta: delete budget on server
    navigate('budgets');
};

export function renderBudgets() {
    const div = document.createElement('div');
    if (!STATE.user) {
        div.innerHTML = `
            <div class="ai-page-header">
                <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">Budgets</h1>
                <p>Set limits and track spending across trips, categories, and travelers</p>
            </div>
            <div style="text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px solid var(--glass-border); max-width: 500px; margin: 40px auto;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px; opacity: 0.8;">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h3 style="margin-bottom: 12px; font-weight: 600;">Login Required</h3>
                <p style="color: var(--text-secondary); line-height: 1.5; font-size: 0.95rem;">
                    Budgets are a powerful feature that needs to be attached to your account to sync properly across devices. 
                    Please sign in using the Google button in the menu to continue.
                </p>
            </div>
        `;
        return div;
    }

    STATE.budgets = STATE.budgets || [];

    const tripOpts = STATE.trips.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    const catOpts = STATE.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const userOpts = STATE.groups.map(g => `<option value="${g}">${g}</option>`).join('');

    const activeBudgetsHtml = STATE.budgets.length > 0 ? STATE.budgets.map(b => {
        let spent = 0;
        STATE.expenses.forEach(e => {
            if (e.isSettlement) return; // Settlements don't count towards budget
            if (b.tripId && b.tripId !== 'all' && e.tripId !== b.tripId) return;
            if (b.categoryId && b.categoryId !== 'all' && e.categoryId !== b.categoryId) return;
            if (b.user && b.user !== 'all' && e.who !== b.user) return;
            spent += e.euroValue || 0;
        });

        const pct = Math.min((spent / b.amount) * 100, 100);
        const isOver = spent > b.amount;
        const isNear = !isOver && pct > 80;

        let statusLabel = "On Track";
        let statusColor = "#34c759";

        if (isOver) {
            statusLabel = "Over Budget";
            statusColor = "#ff3b30";
        } else if (isNear) {
            statusLabel = "Near Limit";
            statusColor = "#ff9500";
        }

        const category = STATE.categories.find(c => c.id === b.categoryId);
        const icon = category ? category.icon : '💰';

        const titleParts = [];
        if (b.tripId && b.tripId !== 'all') titleParts.push(STATE.trips.find(t => t.id === b.tripId)?.name || 'Trip');
        if (b.categoryId && b.categoryId !== 'all') titleParts.push(category?.name || 'Category');
        if (b.user && b.user !== 'all') titleParts.push(b.user);

        const title = titleParts.length > 0 ? titleParts.join(' · ') : 'General Budget';

        return `
            <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid var(--glass-border); margin-bottom: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.1rem;">${icon}</span>
                        <div style="font-weight: 700; font-size: 0.95rem;">${title}</div>
                    </div>
                    <div style="font-size: 0.7rem; font-weight: 800; color: ${statusColor}; text-transform: uppercase; letter-spacing: 0.05em;">${statusLabel}</div>
                </div>

                <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                    <div style="height: 100%; width: ${pct}%; background: ${statusColor}; border-radius: 3px; transition: width 1s;"></div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 0.8rem; font-weight: 600;">
                        ${formatHome(spent, 'EUR')} <span style="color: var(--text-secondary); opacity: 0.6;">/ ${formatHome(b.amount, 'EUR')}</span>
                    </div>
                    <button class="btn-small delete-budget-btn" data-budget-id="${b.id}" style="background: none; border: none; color: #ff3b30; font-size: 0.7rem; font-weight: 700; cursor: pointer; padding: 0;">Delete</button>
                </div>
            </div>
        `;
    }).join('') : `
        <div style="text-align: center; padding: 32px; border: 2px dashed var(--glass-border); border-radius: 16px; color: var(--text-secondary); font-size: 0.9rem;">
            No active budgets yet.
        </div>
    `;

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 class="gradient-text" style="--g-from: #ffd60a; --g-to: #ff9f0a;">Budgets</h1>
            <p>Set spending limits and track them across trips.</p>
        </div>
        
        <div class="grid-2" style="margin-top: 24px;">
            <div class="card glass card-glow-blue">
                <h2 class="card-title" style="color: var(--accent-blue);">Create New Budget</h2>
                <div class="compact-form-row">
                    <label class="compact-form-label">Trip</label>
                    <select id="budTrip" class="glass-input" style="width:100%;"><option value="all">All Trips</option>${tripOpts}</select>
                </div>
                <div class="compact-form-row">
                    <label class="compact-form-label">Category</label>
                    <select id="budCat" class="glass-input" style="width:100%;"><option value="all">All Categories</option>${catOpts}</select>
                </div>
                <div class="compact-form-row">
                    <label class="compact-form-label">Person</label>
                    <select id="budUser" class="glass-input" style="width:100%;"><option value="all">Everyone</option>${userOpts}</select>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 100px; gap: var(--space-3); margin-bottom: var(--space-4);">
                    <div>
                        <label class="compact-form-label">Target Amount</label>
                        <input type="number" id="budAmt" class="glass-input" style="width:100%;" placeholder="e.g. 1000">
                    </div>
                    <div>
                        <label class="compact-form-label">Currency</label>
                        <select id="budCurr" class="glass-input" style="width:100%;">
                            ${Object.keys(CONVERSION_RATES).map(c => `<option value="${c}" ${getHomeCurrency() === c ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <button id="saveBudgetBtn" class="btn-primary" style="width:100%;">Save Budget</button>
            </div>
            
            <div class="card glass card-glow-blue">
                <h2 class="card-title">Active Tracking</h2>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${activeBudgetsHtml}
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        div.addEventListener('click', (e) => {
            const delBtn = /** @type {HTMLElement | null} */ (
                /** @type {HTMLElement | null} */ (e.target)?.closest('.delete-budget-btn')
            );
            if (delBtn?.dataset.budgetId) deleteBudget(delBtn.dataset.budgetId);
        });

        const btn = div.querySelector('#saveBudgetBtn');
        if (btn) btn.addEventListener('click', () => {
            const amt = parseFloat(/** @type {HTMLInputElement} */ (q(div, '#budAmt')).value);
            const curr = /** @type {HTMLSelectElement} */ (q(div, '#budCurr')).value;
            if (!amt || amt <= 0) return alert('Enter a valid amount.');

            // Convert to EUR for consistent tracking if needed
            let eurAmt = amt;
            if (curr !== 'EUR') {
                const rate = CONVERSION_RATES[curr] || 1;
                eurAmt = amt * rate;
            }

            /** @type {import('../types').Budget} */
            const budget = {
                id: generateId(),
                tripId: /** @type {HTMLSelectElement} */ (q(div, '#budTrip')).value,
                categoryId: /** @type {HTMLSelectElement} */ (q(div, '#budCat')).value,
                user: /** @type {HTMLSelectElement} */ (q(div, '#budUser')).value,
                amount: eurAmt,
                originalAmount: amt,
                originalCurrency: curr
            };
            STATE.budgets.push(budget);
            emit('state:changed');
            upsertBudget(budget); // Delta: persist budget to server
            navigate('budgets');
        });
    }, 0);

    return div;
}

