import { renderHome } from './pages/home.js';
import { renderExpenses } from './pages/expenses.js';
import { renderUpload } from './pages/upload.js';
import { renderInsights } from './pages/insights.js';
import { renderSettings, renderPersonalization } from './pages/settings.js';
import { renderBudgets } from './pages/budgets.js';
import { renderCollections } from './pages/collections.js';
import { renderAI } from './pages/ai.js';
import { renderSettlement } from './pages/settlement.js';
import { renderFriends } from './pages/friends.js';
import { renderProfile } from './pages/profile.js';

let dashboardInterval = null;
let isInternalNav = false;

export function navigate(page, params = null, preserveScroll = false) {
    const content = document.getElementById('app-container');
    if (!content) return;

    // Clear interval from home if we leave home
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    content.innerHTML = '';
    let pageEl = null;

    switch (page) {
        case 'home': pageEl = renderHome(); break;
        case 'expenses': pageEl = renderExpenses(); break;
        case 'upload': pageEl = renderUpload(); break;
        case 'insights': pageEl = renderInsights(); break;
        case 'settings': pageEl = renderSettings(); break;
        case 'personalization': pageEl = renderPersonalization(); break;
        case 'budgets': pageEl = renderBudgets(); break;
        case 'collections': pageEl = renderCollections(); break;
        case 'ai': pageEl = renderAI(); break;
        case 'settlement': pageEl = renderSettlement(); break;
        case 'friends': pageEl = renderFriends(); break;
        case 'profile': pageEl = renderProfile(params?.userId); break;
        default: pageEl = renderHome();
    }

    if (pageEl) {
        content.appendChild(pageEl);
    }

    // Update active nav state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('onclick')?.includes(`navigate('${page}')`)) {
            item.classList.add('active');
        }
    });

    // Update hash for deep linking / persistence on refresh
    isInternalNav = true;
    window.location.hash = page;
    
    if (!preserveScroll) {
        window.scrollTo(0, 0);
    }
}

window.navigate = navigate;

window.onhashchange = () => {
    if (isInternalNav) {
        isInternalNav = false;
        return;
    }
    const page = window.location.hash.replace('#', '') || 'home';
    navigate(page);
};
