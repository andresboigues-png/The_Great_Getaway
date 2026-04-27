// pages/settlement.js

import { STATE, saveState } from '../state.js';
import { generateId, showConfirmModal } from '../utils.js';

export function renderSettlement() {
    const div = document.createElement('div');
    if (!STATE.user) {
        div.innerHTML = `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                <p>Track who owes who and keep your travel groups balanced</p>
            </div>
            <div style="text-align: center; padding: 60px 20px; background: rgba(255,255,255,0.02); border-radius: 16px; border: 1px solid var(--glass-border); max-width: 500px; margin: 40px auto;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 20px; opacity: 0.8;">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h3 style="margin-bottom: 12px; font-weight: 600;">Login Required</h3>
                <p style="color: var(--text-secondary); line-height: 1.5; font-size: 0.95rem;">
                    Settlements involve tracking financial balances across your travel companions. 
                    Please sign in using the Google button in the menu to access this feature safely.
                </p>
            </div>
        `;
        return div;
    }

    let currentTripId = STATE.activeTripId || (STATE.trips.length > 0 ? STATE.trips[0].id : null);

    function buildSettlementUI(tripId) {
        const trip = STATE.trips.find(t => t.id === tripId);

        const tripsGridHtml = `
            <div style="margin-bottom: 32px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                    <h2 style="font-size: 1.2rem; letter-spacing: -0.02em; margin: 0;">Select a Trip</h2>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">${STATE.trips.length} Adventures</span>
                </div>
                <div style="display: flex; gap: 16px; overflow-x: auto; padding-bottom: 12px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;">
                    ${STATE.trips.map(t => {
            const total = (STATE.expenses.filter(e => e.tripId === t.id && e.isSettlement).reduce((sum, e) => sum + (parseFloat(e.euroValue) || 0), 0)).toFixed(0);
            const isActive = t.id === tripId;
            return `
                            <div class="card glass ${isActive ? 'card-glow-blue' : ''}" 
                                 onclick="window.switchSettlementTrip('${t.id}')"
                                 style="min-width: 200px; padding: 20px; cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); border: 2px solid ${isActive ? 'var(--accent-blue)' : 'transparent'}; transform: ${isActive ? 'scale(1.02)' : 'scale(1)'}; opacity: ${isActive ? '1' : '0.8'};">
                                <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.05em;">Adventure</div>
                                <div style="font-weight: 700; font-size: 1.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 12px;">${t.name}</div>
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div style="font-size: 1.3rem; font-weight: 800; color: ${isActive ? 'var(--accent-blue)' : 'white'};">€${total}</div>
                                    ${isActive ? '<div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-blue);"></div>' : ''}
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;

        if (!trip) {
            return `
                <div class="ai-page-header">
                    <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                    <p>Calculate who owes what across your adventures.</p>
                </div>
                <div class="card glass card-glow-teal" style="text-align: center; padding: 60px; margin-top: 24px;">
                    <div style="font-size: 4rem; margin-bottom: 20px;">⚖️</div>
                    <h2>No trips found</h2>
                    <p style="color: var(--text-secondary);">Create a trip and add expenses to see settlement calculations.</p>
                </div>
            `;
        }

        const tripExps = STATE.expenses.filter(e => e.tripId === tripId);
        const balances = {};
        STATE.groups.forEach(person => balances[person] = 0);

        tripExps.forEach(exp => {
            const amount = parseFloat(exp.euroValue || exp.value || 0);
            const paidBy = exp.who;
            if (balances[paidBy] !== undefined) balances[paidBy] += amount;
            if (exp.splits && Object.keys(exp.splits).length > 0) {
                for (const [person, pct] of Object.entries(exp.splits)) {
                    if (balances[person] !== undefined) balances[person] -= amount * (pct / 100);
                }
            } else {
                const splitAmt = amount / Math.max(STATE.groups.length, 1);
                STATE.groups.forEach(person => balances[person] -= splitAmt);
            }
        });

        const debts = [];
        const creditors = [];
        const debtors = [];
        for (const [person, balance] of Object.entries(balances)) {
            if (balance > 0.01) creditors.push({ person, amount: balance });
            else if (balance < -0.01) debtors.push({ person, amount: Math.abs(balance) });
        }

        const creditorsCopy = creditors.map(c => ({ ...c }));
        const debtorsCopy = debtors.map(d => ({ ...d }));
        creditorsCopy.sort((a, b) => b.amount - a.amount);
        debtorsCopy.sort((a, b) => b.amount - a.amount);

        let i = 0, j = 0;
        while (i < debtorsCopy.length && j < creditorsCopy.length) {
            const pay = Math.min(debtorsCopy[i].amount, creditorsCopy[j].amount);
            debts.push({ from: debtorsCopy[i].person, to: creditorsCopy[j].person, amount: pay });
            debtorsCopy[i].amount -= pay;
            creditorsCopy[j].amount -= pay;
            if (debtorsCopy[i].amount < 0.01) i++;
            if (creditorsCopy[j].amount < 0.01) j++;
        }

        // Global balances: include ALL expenses across all trips (active + completed)
        const globalBalances = {};
        STATE.groups.forEach(p => globalBalances[p] = 0);
        const archivedExps = (STATE.archivedTrips || []).flatMap(t => t.expenses || []);
        const allExpenses = [...STATE.expenses, ...archivedExps];
        allExpenses.forEach(exp => {
            const amount = parseFloat(exp.euroValue || exp.euro_value || exp.value || 0);
            const payer = exp.who;
            if (globalBalances[payer] !== undefined) globalBalances[payer] += amount;
            if (exp.splits && Object.keys(exp.splits).length > 0) {
                for (const [person, pct] of Object.entries(exp.splits)) {
                    if (globalBalances[person] !== undefined) globalBalances[person] -= amount * (pct / 100);
                }
            } else {
                const splitAmt = amount / Math.max(STATE.groups.length, 1);
                STATE.groups.forEach(person => globalBalances[person] -= splitAmt);
            }
        });

        const maxGlobalBalance = Math.max(...Object.values(globalBalances).map(Math.abs), 1);

        return `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                <p>Calculate who owes what and settle up fairly.</p>
            </div>

            ${tripsGridHtml}

            <div class="card glass" style="margin-bottom: 24px; padding: 20px; border-radius: 20px; border-left: 4px solid var(--accent-blue); background: rgba(0, 113, 227, 0.03);">
                <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="const el = document.getElementById('globalBalancesContainer'); el.style.display = el.style.display === 'none' ? 'block' : 'none';">
                    <h2 class="card-title" style="margin: 0; font-size: 1.1rem; color: var(--text-primary);">🌍 Global Net Balances</h2>
                    <span style="font-size: 0.8rem; color: var(--accent-blue); font-weight: 700;">Show / Hide</span>
                </div>
                <div id="globalBalancesContainer" style="display: none; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${(() => {
                            const globalVals = Object.values(globalBalances).map(Math.abs);
                            const hasBalances = globalVals.some(v => v > 0.01);
                            return Object.entries(globalBalances).map(([person, bal]) => {
                                const pct = hasBalances ? (Math.abs(bal) / maxGlobalBalance) * 100 : 0;
                                const isPos = bal >= 0;
                                const color = isPos ? 'linear-gradient(90deg, #34c759, #4cd964)' : 'linear-gradient(90deg, #ff3b30, #ff453a)';
                                return `
                                    <div style="display: grid; grid-template-columns: 100px ${hasBalances ? '1fr' : ''} 80px; align-items: center; gap: 16px;">
                                        <div style="font-weight: 700; font-size: 0.9rem;">${person}</div>
                                        ${hasBalances ? `
                                            <div style="height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; position: relative;">
                                                <div style="position: absolute; height: 100%; width: ${pct}%; background: ${color}; border-radius: 6px; transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);"></div>
                                            </div>
                                        ` : ''}
                                        <div style="text-align: right; font-weight: 800; font-size: 1rem; color: ${bal > 0.01 ? '#34c759' : (bal < -0.01 ? '#ff3b30' : 'var(--text-secondary)')};">
                                            ${bal > 0.01 ? '+' : ''}${bal.toFixed(0)}€
                                        </div>
                                    </div>
                                `;
                            }).join('');
                        })()}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 24px;">
                <div style="display: inline-block; padding: 8px 16px; background: rgba(0, 113, 227, 0.1); border-radius: 100px; border: 1px solid var(--accent-blue); font-size: 0.8rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 12px;">
                    Active View: ${trip.name}
                </div>
            </div>

            <div class="grid-2">
                <div class="card glass card-glow-teal">
                    <h2 class="card-title">Trip Balances</h2>
                    <table class="liquid-table" style="width: 100%;">
                        <thead>
                            <tr><th style="text-align: left;">Person</th><th style="text-align: right;">Balance</th></tr>
                        </thead>
                        <tbody>
                            ${Object.entries(balances).map(([person, bal]) => `
                                <tr>
                                    <td style="font-weight: 500;">${person}</td>
                                    <td style="text-align: right; color: ${bal >= 0 ? '#34c759' : '#ff3b30'}; font-weight: 700;">
                                        ${bal >= 0 ? '+' : ''}${bal.toFixed(2)}€
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="card glass card-glow-blue">
                    <h2 class="card-title">Suggested Payments</h2>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${debts.length > 0 ? debts.map(d => `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0, 113, 227, 0.05); border-radius: 12px; border: 1px solid rgba(0, 113, 227, 0.1);">
                                <div style="display: flex; align-items: center; gap: 16px;">
                                    <div>
                                        <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">${d.from} pays</span>
                                        <div style="font-weight: 700; font-size: 1.1rem;">${d.to}</div>
                                    </div>
                                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">€${d.amount.toFixed(2)}</div>
                                </div>
                                <button class="btn btn-small" style="background: var(--accent-blue); padding: 8px 16px; border-radius: 12px;" onclick="window.settleDebt('${tripId}', '${d.from}', '${d.to}', ${d.amount})">Settle</button>
                            </div>
                        `).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 20px; font-weight: 600;">All settled for this trip! 🥂</p>'}
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 16px; margin-top: 32px; justify-content: center; flex-wrap: wrap;">
                <button class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.2); padding: 16px 32px; border-radius: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px;" onclick="window.openManualSettleModal('${tripId}')">
                    <span>➕</span> Manual Settlement
                </button>
                <button class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.2); padding: 16px 32px; border-radius: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px;" onclick="window.openPastSettlementsModal('${tripId}')">
                    <span>📜</span> Past Settlements
                </button>
            </div>
        `;
    }

    window.switchSettlementTrip = (tripId) => {
        currentTripId = tripId;
        div.innerHTML = buildSettlementUI(tripId);
    };

    window.settleDebt = (tripId, from, to, amount) => {
        const settlementExp = {
            id: generateId(),
            tripId: tripId,
            label: `Settlement: ${from} → ${to}`,
            value: amount,
            euroValue: amount,
            currency: 'EUR',
            who: from,
            date: new Date().toISOString().split('T')[0],
            splits: { [to]: 100 },
            isSettlement: true
        };
        STATE.expenses.push(settlementExp);
        saveState();
        div.innerHTML = buildSettlementUI(tripId);
    };

    window.openManualSettleModal = (tripId) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.backdropFilter = 'blur(25px)';

        const peopleOptions = STATE.groups.map(p => `<option value="${p}">${p}</option>`).join('');

        modal.innerHTML = `
            <div class="card glass" style="width: 400px; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <h2 style="margin: 0 0 20px; font-size: 1.5rem; text-align: center; color: white;">Manual Settlement</h2>
                
                <form id="manualSettleForm" style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">From</label>
                        <select id="manualSettleFrom" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${peopleOptions}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">To</label>
                        <select id="manualSettleTo" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${peopleOptions}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">Amount (€)</label>
                        <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);" placeholder="0.00" required>
                    </div>

                    <div style="margin-top: 12px; display: flex; gap: 10px;">
                        <button type="submit" class="btn" style="flex: 1; background: var(--accent-blue); padding: 14px; border-radius: 12px;">Record Payment</button>
                        <button type="button" id="cancelManualSettleBtn" class="btn" style="padding: 14px; background: rgba(255,255,255,0.1); border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); color: white;">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#cancelManualSettleBtn').onclick = () => modal.remove();
        modal.querySelector('#manualSettleForm').onsubmit = (evt) => {
            evt.preventDefault();
            const from = modal.querySelector('#manualSettleFrom').value;
            const to = modal.querySelector('#manualSettleTo').value;
            const amount = parseFloat(modal.querySelector('#manualSettleAmount').value);
            
            if (from === to) {
                alert('Sender and receiver must be different.');
                return;
            }
            window.settleDebt(tripId, from, to, amount);
            modal.remove();
        };
    };

    window.openPastSettlementsModal = (tripId) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.backdropFilter = 'blur(25px)';

        const pastSettlements = STATE.expenses.filter(e => e.tripId === tripId && e.isSettlement).sort((a, b) => new Date(b.date) - new Date(a.date));
        
        const listHtml = pastSettlements.length === 0 
            ? '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No past settlements recorded for this trip.</p>'
            : pastSettlements.map(s => `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 12px;">
                    <div>
                        <div style="font-weight: 700; font-size: 1.1rem; color: white;">${s.label}</div>
                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-top: 4px;">${s.date}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="font-size: 1.2rem; font-weight: 800; color: #34c759;">€${s.euroValue.toFixed(2)}</div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-small" style="background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 8px; color: white; border: 1px solid rgba(255,255,255,0.2);" onclick="window.openEditSettlementModal('${s.id}'); document.getElementById('pastSettlementsModal').remove();">Edit</button>
                            <button class="btn btn-small" style="background: rgba(255,59,48,0.1); padding: 8px 12px; border-radius: 8px; color: #ff3b30; border: 1px solid rgba(255,59,48,0.2);" onclick="window.deleteSettlement('${s.id}', '${tripId}'); document.getElementById('pastSettlementsModal').remove();">Unsettle</button>
                        </div>
                    </div>
                </div>
            `).join('');

        modal.id = 'pastSettlementsModal';
        modal.innerHTML = `
            <div class="card glass" style="width: 500px; max-height: 80vh; overflow-y: auto; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; font-size: 1.5rem; color: white;">Past Settlements</h2>
                    <button class="btn btn-small" id="closePastSettleBtn" style="background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); color: white;">Close</button>
                </div>
                
                <div style="display: flex; flex-direction: column;">
                    ${listHtml}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector('#closePastSettleBtn').onclick = () => modal.remove();
    };

    window.deleteSettlement = (id, tripId) => {
        window.showConfirmModal({
            title: "Unsettle Payment?",
            message: "This will remove the settlement and revert the balances. Are you sure?",
            confirmText: "Unsettle",
            onConfirm: () => {
                STATE.expenses = STATE.expenses.filter(e => e.id !== id);
                saveState();
                div.innerHTML = buildSettlementUI(tripId);
            }
        });
    };

    window.openEditSettlementModal = (id) => {
        const s = STATE.expenses.find(e => e.id === id);
        if (!s) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.style.backdropFilter = 'blur(25px)';

        const peopleOptionsFrom = STATE.groups.map(p => `<option value="${p}" ${s.who === p ? 'selected' : ''}>${p}</option>`).join('');
        // To find the "to" person, we look at splits
        let toPerson = Object.keys(s.splits || {})[0];
        const peopleOptionsTo = STATE.groups.map(p => `<option value="${p}" ${toPerson === p ? 'selected' : ''}>${p}</option>`).join('');

        modal.innerHTML = `
            <div class="card glass" style="width: 400px; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <h2 style="margin: 0 0 20px; font-size: 1.5rem; text-align: center; color: white;">Edit Settlement</h2>
                
                <form id="editSettlementForm" style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">From</label>
                        <select id="editSettleFrom" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${peopleOptionsFrom}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">To</label>
                        <select id="editSettleTo" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${peopleOptionsTo}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">Amount (€)</label>
                        <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${s.euroValue}" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);" required>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">Date</label>
                        <input type="date" id="editSettleDate" value="${s.date}" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);" required>
                    </div>

                    <div style="margin-top: 12px; display: flex; gap: 10px;">
                        <button type="submit" class="btn" style="flex: 1; background: var(--accent-blue); padding: 14px; border-radius: 12px;">Update</button>
                        <button type="button" id="cancelEditSettleBtn" class="btn" style="padding: 14px; background: rgba(255,255,255,0.1); border-radius: 12px; border: 1px solid rgba(255,255,255,0.2);">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#cancelEditSettleBtn').onclick = () => modal.remove();
        modal.querySelector('#editSettlementForm').onsubmit = (evt) => {
            evt.preventDefault();
            const from = modal.querySelector('#editSettleFrom').value;
            const to = modal.querySelector('#editSettleTo').value;
            const amount = parseFloat(modal.querySelector('#editSettleAmount').value);
            const date = modal.querySelector('#editSettleDate').value;
            
            if (from === to) {
                alert('Sender and receiver must be different.');
                return;
            }

            s.who = from;
            s.splits = { [to]: 100 };
            s.value = amount;
            s.euroValue = amount;
            s.date = date;
            s.label = `Settlement: ${from} → ${to}`;
            
            saveState();
            modal.remove();
            div.innerHTML = buildSettlementUI(currentTripId);
        };
    };

    div.innerHTML = buildSettlementUI(currentTripId);
    return div;
}

