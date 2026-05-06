// @ts-check
import { STATE, emit } from '../state.js';
import { CONVERSION_RATES } from '../constants.js';
import { fetchHistoricalRates } from '../api.js';
import { navigate } from '../router.js';
import { getHomeCurrency, currencySymbol } from '../utils.js';

export function renderInsights() {
    const div = document.createElement('div');

    if (!STATE.activeTripId) {
        div.innerHTML = `<h1 style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Insights</h1><div class="card glass"><p>Please select a trip.</p></div>`;
        return div;
    }

    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId && !e.isSettlement);

    // Trigger historical rate fetch in background
    const uniqueDates = [...new Set(tripExps.map(e => e.date).filter(d => !!d))];
    fetchHistoricalRates(uniqueDates).then(() => { });

    if (tripExps.length === 0) {
        div.innerHTML = `
            <h1 style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Insights</h1>
            <div style="height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 5rem; margin-bottom: 20px; opacity: 0.5;">📊</div>
                <h2 style="color: var(--text-primary); margin-bottom: 10px;">No Data to Analyze Yet</h2>
                <p style="max-width: 400px; line-height: 1.5;">Add your travel expenses in the <b>Expenses</b> tab or upload an Excel sheet to see your spending breakdown and analytics.</p>
                <button id="goToExpensesBtn" class="btn" style="margin-top: 24px;">Add Your First Expense</button>
            </div>
        `;
        setTimeout(() => {
            div.querySelector('#goToExpensesBtn')?.addEventListener('click', () => navigate('expenses'));
        }, 0);
        return div;
    }

    // Helper for conversion based on current insightCurrency and rateMode.
    // Defaults to the user's home currency when the per-page toggle is unset
    // — first-time visit shows totals in their familiar currency, but they
    // can still switch to compare in other currencies via the dropdown.
    const targetCurr = STATE.insightCurrency || getHomeCurrency();
    const targetSym = currencySymbol(targetCurr);
    const mode = STATE.rateMode || 'at_trip';

    const convertedExps = tripExps.map(e => {
        // Step 1: Get value in EUR
        let rateToEur = CONVERSION_RATES[e.currency] || 1;

        if (mode === 'at_trip') {
            const cacheKey = `${e.date}_${e.currency}_EUR`;
            if (STATE.rateCache && STATE.rateCache[cacheKey]) {
                rateToEur = STATE.rateCache[cacheKey];
            }
        }

        const euroVal = e.euroValue || (e.value * rateToEur);

        // Step 2: Convert EUR to target insightCurrency
        let targetVal = euroVal;
        if (targetCurr !== 'EUR') {
            let eurToTargetRate = 1 / (CONVERSION_RATES[targetCurr] || 1);

            if (mode === 'at_trip') {
                const targetCacheKeyInv = `${e.date}_${targetCurr}_EUR`;
                if (STATE.rateCache && STATE.rateCache[targetCacheKeyInv]) {
                    eurToTargetRate = 1 / STATE.rateCache[targetCacheKeyInv];
                }
            }

            targetVal = euroVal * eurToTargetRate;
        }

        return { ...e, displayValue: targetVal };
    });

    const totalDisplay = convertedExps.reduce((sum, e) => sum + e.displayValue, 0);
    const totalCount = convertedExps.length;

    let highestExpense = null;
    if (convertedExps.length > 0) {
        highestExpense = convertedExps.reduce((max, e) => e.displayValue > max.displayValue ? e : max, convertedExps[0]);
    }

    const spenderTotals = {};
    const catTotals = {};
    const dateTotals = {};

    convertedExps.forEach(e => {
        if (!catTotals[e.categoryId]) catTotals[e.categoryId] = 0;
        catTotals[e.categoryId] += e.displayValue;

        if (!spenderTotals[e.who]) spenderTotals[e.who] = 0;
        spenderTotals[e.who] += e.displayValue;

        const d = e.date || 'Unknown';
        if (!dateTotals[d]) dateTotals[d] = 0;
        dateTotals[d] += e.displayValue;
    });

    const sortedSpenders = Object.entries(spenderTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const topSpender = sortedSpenders.length > 0 ? sortedSpenders[0][0] : "N/A";
    const topSpenderAmount = sortedSpenders.length > 0 ? sortedSpenders[0][1] : 0;

    const spenderRankingHtml = sortedSpenders.slice(1).map(([who, amount], index) => `
        <div class="ranking-row">
            <span class="ranking-row__label">${index + 2}. ${who}</span>
            <span class="ranking-row__value">${targetSym}${amount.toFixed(2)}</span>
        </div>
    `).join('');

    // Category Frequencies
    const catCounts = {};
    tripExps.forEach(e => {
        catCounts[e.categoryId] = (catCounts[e.categoryId] || 0) + 1;
    });
    const sortedCats = Object.entries(catCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const topCatId = sortedCats.length > 0 ? sortedCats[0][0] : null;
    const topCat = topCatId ? STATE.categories.find(c => c.id === topCatId) : null;
    const topCatName = topCat ? topCat.icon + " " + topCat.name : "N/A";

    const catRankingHtml = sortedCats.slice(1).map(([catId, count], index) => {
        const cat = STATE.categories.find(c => c.id === catId);
        return `
            <div class="ranking-row">
                <span class="ranking-row__label">${index + 2}. ${cat ? cat.icon + ' ' + cat.name : 'Unknown'}</span>
                <span class="ranking-row__value">${count} trans.</span>
            </div>
        `;
    }).join('');

    const pieLabels = [];
    const pieData = [];
    const pieColors = [];
    Object.keys(catTotals).forEach(catId => {
        const cat = STATE.categories.find(c => c.id === catId);
        if (cat) {
            pieLabels.push(cat.icon + ' ' + cat.name);
            pieColors.push(cat.color);
        } else {
            pieLabels.push('Unknown');
            pieColors.push('#ccc');
        }
        pieData.push(catTotals[catId]);
    });

    div.innerHTML = `
        <!-- Header Section -->
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid var(--glass-border);">
            <div>
                <h1 style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0; font-size: 3.5rem; letter-spacing: -0.04em;">Insights</h1>
                <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: 1.1rem;">Your travel spending at a glance.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 24px;">
                <div class="glass" style="display: flex; padding: 4px; border-radius: 14px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-sm);">
                    <button class="toggle-btn rate-mode-btn ${mode === 'at_trip' ? 'active' : ''}" data-mode="at_trip">
                        At Trip
                    </button>
                    <button class="toggle-btn rate-mode-btn ${mode === 'today' ? 'active' : ''}" data-mode="today">
                        Today
                    </button>
                </div>

                <div style="display: flex; align-items: center; gap: 12px;">
                    <select id="insightCurrencySelector" class="glass-input" style="width: 110px; padding: 8px 12px; font-weight: 500; font-size: 0.9rem; background: var(--glass-bg);">
                        ${Object.keys(CONVERSION_RATES).map(c => `<option value="${c}" ${targetCurr === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </div>
            </div>
        </div>

        <!-- Hero Row: Totals -->
        <div style="margin-bottom: var(--space-8);">
            <div class="card glass hero-stat-card">
                <h2 class="card-title hero-stat-card__title">Total Spent on your trip</h2>
                <div style="display: flex; align-items: baseline; gap: var(--space-3);">
                    <h1 class="hero-stat-card__value">${targetSym}${totalDisplay.toFixed(2)}</h1>
                    <span class="hero-stat-card__currency">${targetCurr}</span>
                </div>
                <p class="hero-stat-card__sub">Spent across <strong>${totalCount}</strong> transactions during your travels.</p>
            </div>
        </div>

        <!-- Summary Grid -->
        <div class="grid-2" style="grid-template-columns: 1fr 1fr; margin-bottom: var(--space-8);">
            <div class="card glass">
                <h2 class="card-title metric-label">Avg. Daily Spend</h2>
                <h1 class="metric-value">${targetSym}${(totalDisplay / (Object.keys(dateTotals).length || 1)).toFixed(2)}<small style="font-size: var(--font-lg); font-weight: 400; color: var(--text-secondary); margin-left: var(--space-2);">/ day</small></h1>
            </div>
            ${highestExpense ? `
            <div class="card glass">
                <h2 class="card-title metric-label">Single Peak</h2>
                <h1 class="metric-value" style="color: #ff3b30;">${targetSym}${highestExpense.displayValue.toFixed(2)}</h1>
                <p class="metric-label" style="margin: var(--space-1) 0 0 0;">${highestExpense.label} • ${highestExpense.who}</p>
            </div>
            ` : ''}
        </div>

        <!-- Rankings Grid -->
        <div class="grid-2" style="margin-bottom: 32px;">
            <div class="card glass" style="padding: 28px;">
                <h2 class="card-title">Top Spenders</h2>
                <div style="margin-bottom: 20px;">
                    <h1 style="margin: 0; font-size: 2rem; color: var(--text-primary);">${topSpender}</h1>
                    <span style="color: var(--accent-blue); font-weight: 700; font-size: 1.1rem;">${totalDisplay > 0 ? targetSym + topSpenderAmount.toFixed(2) : '0'}</span>
                </div>
                <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 4px;">
                    ${spenderRankingHtml}
                </div>
            </div>

            <div class="card glass" style="padding: 28px;">
                <h2 class="card-title">Category Breakdown</h2>
                <div style="position: relative; height:200px; width:100%; margin-bottom: 20px;">
                    <canvas id="categoryChart"></canvas>
                </div>
                <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 4px;">
                    ${catRankingHtml}
                </div>
            </div>
        </div>

        <!-- Timeline Section (Full Width) -->
        <div class="card glass" style="margin-bottom: 0; padding: 32px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2 class="card-title" style="margin: 0;">Spending Timeline</h2>
                <div style="color: var(--text-secondary); font-size: 0.9rem;">Chronological flow of your expenses</div>
            </div>
            <div style="position: relative; height:350px; width:100%;">
                <canvas id="timelineChart"></canvas>
            </div>
        </div>
    `;

    setTimeout(() => {
        div.querySelectorAll('.rate-mode-btn').forEach((btn) => {
            const b = /** @type {HTMLElement} */ (btn);
            b.addEventListener('click', () => {
                const mode = b.dataset.mode;
                if (mode === 'at_trip' || mode === 'today') STATE.rateMode = mode;
                emit('state:changed');
                navigate('insights');
            });
        });

        div.querySelector('#insightCurrencySelector')?.addEventListener('change', (e) => {
            STATE.insightCurrency = /** @type {HTMLSelectElement} */ (e.target).value;
            emit('state:changed');
            navigate('insights');
        });

        const ctxPie = div.querySelector('#categoryChart');
        if (ctxPie && pieData.length > 0) {
            new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: pieLabels,
                    datasets: [{
                        data: pieData,
                        backgroundColor: pieColors,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'right' } }
                }
            });
        }

        const ctxTime = div.querySelector('#timelineChart');
        if (ctxTime && tripExps.length > 0) {
            const sortedDates = Object.keys(dateTotals).sort();
            const timeData = sortedDates.map(d => dateTotals[d]);

            // Aesthetically format labels (e.g., "Oct 12")
            const chartLabels = sortedDates.map(d => {
                try {
                    const dateObj = new Date(d);
                    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                } catch (e) {
                    return d;
                }
            });

            new Chart(ctxTime, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: targetCurr + ' Spent',
                        data: timeData,
                        borderColor: '#0071e3',
                        backgroundColor: 'rgba(0, 113, 227, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#0071e3',
                        borderWidth: 3
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                maxRotation: 0,
                                autoSkip: true,
                                maxTicksLimit: 7
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: {
                                maxTicksLimit: 5,
                                callback: value => targetSym + value
                            }
                        }
                    }
                }
            });
        }
    }, 0);

    return div;
}

