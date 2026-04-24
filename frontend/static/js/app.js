// State Management
const STATE = {
    trips: [],
    activeTripId: null,
    categories: [
        { id: 'c1', name: 'Food', icon: '🍔', color: '#ff3b30' },
        { id: 'c2', name: 'Transport', icon: '✈️', color: '#007aff' },
        { id: 'c3', name: 'Accommodation', icon: '🏨', color: '#5856d6' }
    ],
    expenses: [],
    groups: [], // List of people names
    draftExpense: {
        who: '',
        categoryId: '',
        label: '',
        date: '',
        country: '',
        value: '',
        currency: 'EUR',
        euroValue: ''
    },
    insightCurrency: 'EUR',
    rateMode: 'at_trip', // 'at_trip' or 'today'
    rateCache: {}, // { 'YYYY-MM-DD_FROM_TO': rate }
    user: null, // Stores { id, name, email, picture }
    excelMapping: {
        who: 'Who',
        categoryId: 'Category',
        label: 'Label',
        date: 'Date',
        country: 'Country',
        value: 'Value',
        currency: 'Currency',
        euroValue: 'Euro Value'
    },
    activities: [],
    photos: [],
    budgets: [],
    savedFormats: [],    // Array of {id, name, mappings:[{variable,column}]} — max 5
    tripDays: [],        // Array of {id, tripId, name, dayNumber, photos: []}
    activeDetailId: null // Store ID for detail views (e.g. archived trip detail)
};

const COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria", 
    "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", 
    "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", 
    "Cameroon", "Canada", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", 
    "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", 
    "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", 
    "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", 
    "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", 
    "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kosovo", 
    "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", 
    "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", 
    "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", 
    "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", "Norway", "Oman", 
    "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", 
    "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent", "Samoa", "San Marino", "Sao Tome and Principe", 
    "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", 
    "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", 
    "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", 
    "Tuvalu", "Uganda", "Ukraine", "UAE", "UK", "USA", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", 
    "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
].sort();

// Quotes & Images Dictionary — curated per-country pairs (image always matches quote)
const TRAVEL_DATA = {};
(() => {
    // Each entry: image matches the vibe of the quote
    const CURATED = {
        'France':        { i: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34', q: 'France: where every cobblestone tells a love story.' },
        'Italy':         { i: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9', q: 'Italy is a dream that keeps returning for the rest of your life.' },
        'Japan':         { i: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186', q: 'Japan: a thousand years of beauty distilled into one perfect moment.' },
        'Spain':         { i: 'https://images.unsplash.com/photo-1543783207-ec64e4d95325', q: 'In Spain, life is lived at full volume under a blazing sun.' },
        'Greece':        { i: 'https://images.unsplash.com/photo-1533105079780-92b9be482077', q: 'Greece: where the sea meets legend and every sunset is eternal.' },
        'Thailand':      { i: 'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a', q: 'Thailand smiles at you from every golden temple and turquoise shore.' },
        'Indonesia':     { i: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4', q: 'Indonesia: a thousand islands, a thousand ways to lose yourself.' },
        'Australia':     { i: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9', q: 'Australia: where the outback whispers ancient stories and the ocean roars.' },
        'Brazil':        { i: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325', q: 'Brazil beats with a rhythm the whole world can feel.' },
        'Mexico':        { i: 'https://images.unsplash.com/photo-1512813195386-6cf811ad3542', q: 'Mexico: color, heat, and history woven into one glorious tapestry.' },
        'India':         { i: 'https://images.unsplash.com/photo-1524492412937-b28074a5d7da', q: 'India: a civilization so vast and vivid it transforms every traveler.' },
        'Morocco':       { i: 'https://images.unsplash.com/photo-1489749798305-4fea3ae63d43', q: 'Morocco is a fever dream of color, spice, and desert gold.' },
        'Turkey':        { i: 'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b', q: 'Turkey: where East meets West in a swirl of minarets and bazaars.' },
        'Egypt':         { i: 'https://images.unsplash.com/photo-1539650116574-8efeb43e2750', q: 'Egypt: the cradle of civilization, still cradling your wonder.' },
        'Portugal':      { i: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b', q: 'Portugal whispers of explorers and fado on every Atlantic breeze.' },
        'Peru':          { i: 'https://images.unsplash.com/photo-1526392060635-9d6019884377', q: 'Peru: ancient mountains rise to meet the clouds that touch the stars.' },
        'New Zealand':   { i: 'https://images.unsplash.com/photo-1507699622108-4be3abd695ad', q: 'New Zealand: where the land looks like it was sculpted by the gods.' },
        'Iceland':       { i: 'https://images.unsplash.com/photo-1476610182048-b716b8518aae', q: 'Iceland: fire, ice, and auroras that make you believe in magic.' },
        'Norway':        { i: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4', q: 'Norway: fjords carved from the earth as if the planet was proud of itself.' },
        'Switzerland':   { i: 'https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99', q: 'Switzerland: peaks so perfect you wonder if they are painted on.' },
        'Canada':        { i: 'https://images.unsplash.com/photo-1501854140801-50d01698950b', q: 'Canada: wilderness so vast and pure, silence becomes the loudest sound.' },
        'USA':           { i: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000', q: 'America: a landscape so diverse, every road trip is its own epic.' },
        'UK':            { i: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad', q: 'Britain: history, green hills, and the smell of rain on old stone.' },
        'Germany':       { i: 'https://images.unsplash.com/photo-1467269204594-9661b134dd2b', q: 'Germany: fairy-tale castles rising above misty autumn forests.' },
        'Netherlands':   { i: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5902', q: 'The Netherlands: tulip fields, canals, and a quiet beautiful life.' },
        'Austria':       { i: 'https://images.unsplash.com/photo-1516550135131-d1d84e1f48c8', q: 'Austria: where the Alps frame every view like a masterpiece.' },
        'Croatia':       { i: 'https://images.unsplash.com/photo-1555990538-1860574b1d2e', q: 'Croatia: Adriatic blue and ancient walls glowing gold in the dusk.' },
        'Vietnam':       { i: 'https://images.unsplash.com/photo-1528127269322-539801943592', q: 'Vietnam: a thousand shades of green and a culture built on resilience.' },
        'Nepal':         { i: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa', q: 'Nepal: the Himalayas remind you how small and how free you are.' },
        'UAE':           { i: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c', q: 'Dubai dreams in glass and gold against the amber desert sky.' },
        'South Africa':  { i: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5', q: 'South Africa: safari sunrises, ocean cliffs, and the wildest sky.' },
        'Kenya':         { i: 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e', q: 'Kenya: the savannah stretches to the horizon, wild and alive.' },
        'Argentina':     { i: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0', q: 'Argentina: Patagonian peaks, tango, and a passion for life.' },
        'Colombia':      { i: 'https://images.unsplash.com/photo-1536599018102-9f803c140fc1', q: 'Colombia: flowers, coffee mountains, and a warmth that never fades.' },
        'Cuba':          { i: 'https://images.unsplash.com/photo-1501683978810-81a7e5c98fb3', q: 'Cuba: salsa music and classic cars on streets that time forgot.' },
        'Singapore':     { i: 'https://images.unsplash.com/photo-1525625293386-3f8f99389edd', q: 'Singapore: a garden city merging the ultramodern with the lush.' },
        'Philippines':   { i: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86', q: 'The Philippines: islands of crystal water and pure joy.' },
        'Jordan':        { i: 'https://images.unsplash.com/photo-1548786811-dd6e453ccca7', q: 'Petra rises from the rose-red cliffs: a wonder you must see to believe.' },
        'Sri Lanka':     { i: 'https://images.unsplash.com/photo-1586774601099-f7b5f8ba5e70', q: 'Sri Lanka: emerald tea hills and lotus temples by turquoise shores.' },
        'Maldives':      { i: 'https://images.unsplash.com/photo-1514282401047-d79a71a590e8', q: 'The Maldives: floating above the clearest water on earth.' },
        'Barbados':      { i: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5', q: 'Barbados: coral-pink sands and waves warm enough to stay forever.' },
        'Jamaica':       { i: 'https://images.unsplash.com/photo-1518509562904-e7ef99cdcc86', q: 'Jamaica: reggae on the breeze and sea as blue as a dream.' },
        'Iceland':       { i: 'https://images.unsplash.com/photo-1476610182048-b716b8518aae', q: 'Iceland: fire and ice and auroras that make you believe in magic.' },
        'Mongolia':      { i: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e', q: 'Mongolia: endless steppe and sky, where freedom has no edges.' },
        'Namibia':       { i: 'https://images.unsplash.com/photo-1509773896068-7fd415d91e2e', q: 'Namibia: dunes the color of fire beneath a star-drenched sky.' },
        'Bhutan':        { i: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa', q: 'Bhutan: the last Himalayan kingdom, where happiness is policy.' },
        'Kuwait':        { i: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c', q: 'Kuwait: a modern oasis where the desert meets ambition.' },
        'Saudi Arabia':  { i: 'https://images.unsplash.com/photo-1509773896068-7fd415d91e2e', q: 'Saudi Arabia: ancient dunes hiding a world on the cusp of wonder.' },
        'Chile':         { i: 'https://images.unsplash.com/photo-1467278661495-cd27b3d08b97', q: 'Chile: from the driest desert to glaciers at the end of the world.' },
        'Cambodia':      { i: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365', q: 'Angkor Wat rises from the jungle like a prayer carved in stone.' },
        'Czech Republic':{ i: 'https://images.unsplash.com/photo-1519677100203-a0e668c92439', q: 'Prague rises from its cobblestones like a city from a storybook.' },
        'Malaysia':      { i: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07', q: 'Malaysia: where jungle canopy meets glittering city skylines.' },
    };

    // Fallback pool for unlisted countries — image and quote are always paired together
    const fallbackPairs = [
        { i: 'https://images.unsplash.com/photo-1470071131384-001b85755536', q: 'To lose yourself here is to find yourself.' },
        { i: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b', q: 'A place where every path leads somewhere beautiful.' },
        { i: 'https://images.unsplash.com/photo-1501854140801-50d01698950b', q: 'Finding peace in the untamed beauty of this land.' },
        { i: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e', q: 'Every sunrise here tells a different story.' },
        { i: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d', q: 'A canvas where your journey becomes the art.' },
        { i: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716', q: 'Wandering roads that feel ancient and alive.' },
        { i: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07', q: 'Discovering a hidden soul in every corner.' },
        { i: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e', q: 'Where the ocean meets the horizon and time stands still.' },
        { i: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8', q: 'Memories painted in vivid, unforgettable colors.' },
        { i: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e', q: 'Embracing the breathtaking spirit of this place.' },
        { i: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb', q: 'The soul of this place beats in every traveler\'s heart.' },
        { i: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606', q: 'Adventure is not a destination — it\'s a way of seeing.' },
    ].map(p => ({ i: p.i + '?auto=format&fit=crop&w=1600&q=80', q: p.q }));

    COUNTRIES.forEach((country) => {
        const key = country.toLowerCase().split(' ')[0];
        if (CURATED[country]) {
            const c = CURATED[country];
            TRAVEL_DATA[key] = {
                quotes: [c.q],
                images: [c.i + '?auto=format&fit=crop&w=1600&q=80']
            };
        } else {
            // Hash to a fallback PAIR — same index ensures image always matches quote
            let hash = 0;
            for (let i = 0; i < country.length; i++) hash = country.charCodeAt(i) + ((hash << 5) - hash);
            const pair = fallbackPairs[Math.abs(hash) % fallbackPairs.length];
            TRAVEL_DATA[key] = { quotes: [pair.q], images: [pair.i] };
        }
    });

    TRAVEL_DATA['default'] = {
        quotes: ['The world is a book, and those who do not travel read only one page.'],
        images: ['https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80']
    };
})();

let dashboardInterval = null;

const CONVERSION_RATES = {
    'EUR': 1,
    'USD': 0.92,
    'GBP': 1.17,
    'JPY': 0.0062,
    'CHF': 1.04,
    'CAD': 0.68,
    'AUD': 0.61,
    'CNY': 0.13,
    'BRL': 0.18,
    'MXN': 0.055,
    'INR': 0.011,
    'IDR': 0.000058,
    'SGD': 0.69,
    'NZD': 0.56,
    'HKD': 0.12,
    'KRW': 0.00069,
    'ZAR': 0.049
};

// Load state from LocalStorage
function loadState() {
    const saved = localStorage.getItem('theGreatEscapeState');
    if (saved) {
        Object.assign(STATE, JSON.parse(saved));
    }
    // Ensure new fields exist
    if (!STATE.savedFormats) STATE.savedFormats = [];
    if (!STATE.tripDays) STATE.tripDays = [];
    STATE.tripDays.forEach(d => {
        if (!d.tickets) d.tickets = [];
        if (d.notes === undefined) d.notes = '';
        if (!d.plan) d.plan = { morning: '', afternoon: '', evening: '' };
    });

    // Ensure activeTripId is valid
    if (STATE.trips.length > 0 && (!STATE.activeTripId || !STATE.trips.find(t => t.id === STATE.activeTripId))) {
        STATE.activeTripId = STATE.trips[0].id;
    }
}

// Frankfurter API Helper
async function fetchHistoricalRates(dates) {
    if (dates.length === 0) return;
    
    // Sort dates to find range
    const sorted = [...dates].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    
    if (!start || !end) return;

    try {
        // We fetch conversion from EUR to others for the range
        // Frankfurter range limit is 1 year, we'll just fetch for the trip range
        const url = `https://api.frankfurter.app/${start}..${end}`;
        const resp = await fetch(url);
        if (resp.ok) {
            const data = await resp.json();
            // data.rates is { "YYYY-MM-DD": { "USD": 1.1, ... } }
            Object.entries(data.rates).forEach(([date, rates]) => {
                Object.entries(rates).forEach(([curr, rate]) => {
                    STATE.rateCache[`${date}_${curr}_EUR`] = 1 / rate; // Store as curr -> EUR
                });
            });
            saveState();
        }
    } catch (e) {
        console.error("Failed to fetch historical rates:", e);
    }
}

// Save state to LocalStorage
function saveState() {
    // Ensure all days have tickets array
    if (STATE.tripDays) {
        STATE.tripDays.forEach(d => { if (!d.tickets) d.tickets = []; });
    }
    localStorage.setItem('theGreatEscapeState', JSON.stringify(STATE));
    updateTripSelector();
    if (STATE.user) {
        syncWithServer();
    }
}

async function syncWithServer() {
    if (!STATE.user) return;
    try {
        await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: STATE.user.id,
                trips: STATE.trips,
                expenses: STATE.expenses,
                activities: STATE.activities,
                photos: STATE.photos
            })
        });
    } catch (e) {
        console.error("Sync failed:", e);
    }
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// --- Routing & Rendering ---
const pages = {
    home: renderHome,
    expenses: renderExpenses,
    upload: renderUpload,
    insights: renderInsights,
    friends: renderFriends,
    personalization: renderPersonalization,
    settings: renderSettings,
    ai: renderAI,
    budgets: renderBudgets,
    collections: renderCollections,
    settlement: renderSettlement,
    'archived-detail': () => renderArchivedTripDetail(STATE.activeDetailId)
};

function navigate(pageId, data = null) {
    if (data && data.id) STATE.activeDetailId = data.id;
    
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
    }

    STATE.currentPage = pageId;

    // Update global nav active state (both Navbar and Sidebar)
    document.querySelectorAll('.nav-item, .sidebar-item').forEach(el => {
        el.classList.remove('active');
        if (el.dataset.page === pageId) el.classList.add('active');
    });

    const container = document.getElementById('app-container');
    container.innerHTML = ''; 

    if(pages[pageId]) {
        container.appendChild(pages[pageId]());
    } else {
        container.innerHTML = `<h1>404 - Page Not Found</h1>`;
    }
}
window.navigate = navigate;

// --- Page: Home (Dashboard) ---
function renderHome() {
    const div = document.createElement('div');
    const activeTrip = (STATE.trips && STATE.activeTripId) ? STATE.trips.find(t => t.id === STATE.activeTripId) : null;
    let currentPhotoIdx = 0;

    // Determine data based on activeTrip or default
    let displayImages = [];
    let displayQuotes = [];

    if (!activeTrip) {
        // Shuffled slideshow for when NO trip is selected
        const pairs = Object.values(TRAVEL_DATA)
            .filter(d => d.images && d.images[0] && d.quotes && d.quotes[0])
            .map(d => ({ image: d.images[0], quote: d.quotes[0] }));
        pairs.sort(() => Math.random() - 0.5);
        displayImages = pairs.map(p => p.image);
        displayQuotes = pairs.map(p => p.quote);
        if (displayImages.length === 0) {
            displayImages = ['https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80'];
            displayQuotes = ['The world is a book, and those who do not travel read only one page.'];
        }
    } else {
        // STATIC single image and quote for the ACTIVE country
        const tripCountry = activeTrip.country || '';
        const countryKey = tripCountry.toLowerCase().split(' ')[0] || 'default';
        const data = TRAVEL_DATA[countryKey] || TRAVEL_DATA['default'];
        displayImages = [data.images[0]];
        displayQuotes = [data.quotes[0]];
    }

    const showNextImageAndQuote = () => {
        if (displayImages.length <= 1) return; // No need to cycle if only 1 image
        currentPhotoIdx = (currentPhotoIdx + 1) % displayImages.length;
        const imgEl = div.querySelector('#homeHeroImg');
        const quoteEl = div.querySelector('#homeQuote');
        if (imgEl) {
            imgEl.style.opacity = '0';
            setTimeout(() => {
                imgEl.src = displayImages[currentPhotoIdx];
                imgEl.style.opacity = '1';
            }, 800);
        }
        if (quoteEl) {
            quoteEl.style.opacity = '0';
            setTimeout(() => {
                quoteEl.innerText = displayQuotes[currentPhotoIdx % displayQuotes.length] || "";
                quoteEl.style.opacity = '1';
            }, 800);
        }
    };

    if (!activeTrip) {
        div.innerHTML = `
            <div class="ai-page-header" style="padding: 40px; text-align: center; border-radius: 28px;">
                <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; font-size: 3.5rem;">Let's travel.</h1>
                <p style="color: var(--text-secondary); max-width: 440px; margin: 10px auto 0; font-size: 1.1rem;">Your next big adventure is waiting. Create a trip to start tracking expenses and planning days.</p>
            </div>
            
            <div class="card glass" style="padding: 0; overflow: hidden; height: 450px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
                <img id="homeHeroImg" src="${displayImages[0] || ''}" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%);"></div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; display: flex; align-items: flex-end; justify-content: space-between;">
                    <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out; max-width: 60%;">
                        ${displayQuotes[0] || ''}
                    </p>
                    <button class="btn" style="background: var(--accent-blue); padding: 16px 32px; border-radius: 100px; box-shadow: 0 10px 20px rgba(0,113,227,0.3); font-weight: 700;" onclick="window.openNewTripModal()">Create First Trip</button>
                </div>
            </div>
        `;
        dashboardInterval = setInterval(showNextImageAndQuote, 6000);
        return div;
    }

    const tripExpenses = (STATE.expenses || []).filter(e => e && e.tripId === activeTrip.id);
    const tripDays = (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id);
    const isFresh = tripExpenses.length === 0 && tripDays.length === 0;
    
    let greeting = "Welcome back, traveler";
    if (isFresh && activeTrip.country) {
        const greetings = [
            `${activeTrip.country} is a phenomenal choice!`,
            `Ready to conquer ${activeTrip.country}?`,
            `Let's make memories in ${activeTrip.country}.`,
            `${activeTrip.country} awaits your arrival.`,
            `A blank canvas in ${activeTrip.country}. Let's plan!`,
            `Your ${activeTrip.country} adventure starts here.`,
            `Time to write your ${activeTrip.country} story.`
        ];
        greeting = greetings[Math.floor(Math.random() * greetings.length)];
    }

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${greeting}</h1>
            <p>You have <strong>${tripExpenses.length}</strong> expenses recorded for ${activeTrip.name}.</p>
        </div>
        
        <div class="card glass" style="padding: 0; overflow: hidden; height: 400px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
            <img id="homeHeroImg" src="${displayImages[0] || ''}" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
            <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%);"></div>
            <div style="position: absolute; bottom: 40px; left: 40px; right: 40px;">
                <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out;">
                    ${displayQuotes[0] || ''}
                </p>
            </div>
        </div>
    `;

    // No interval for active trips - keep it simple and aesthetic


    // Trip Days Section
    const daysContainer = document.createElement('div');
    daysContainer.style.marginTop = '40px';
    
    tripDays.sort((a,b) => a.dayNumber - b.dayNumber);
    
    daysContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h2 style="font-size: 1.5rem; letter-spacing: -0.02em;">Your Journey</h2>
            <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600;">${tripDays.length} Days Planned</span>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px;">
            ${tripDays.map(day => `
                <div class="card glass card-glow-blue day-card" style="padding: 20px; min-height: 180px; display: flex; flex-direction: column; cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);" onclick="window.openDayDetail('${day.id}')">
                    <div style="flex: 1;">
                        <h3 style="margin: 0; font-size: 1.2rem;">${day.name || `Day ${day.dayNumber}`}</h3>
                        <div style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-top: 4px;">Day ${day.dayNumber}</div>
                    </div>
                    
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px;">
                        <div style="display: flex; -webkit-mask-image: linear-gradient(to right, black 70%, transparent 100%);">
                            ${(day.photos || []).slice(0, 3).map((p, i) => `
                                <div style="width: 32px; height: 32px; border-radius: 8px; border: 2px solid var(--glass-border); overflow: hidden; margin-left: ${i === 0 ? '0' : '-12px'}; background: var(--glass-bg);">
                                    <img src="${p}" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                            `).join('')}
                            ${(day.photos || []).length > 3 ? `<div style="width: 32px; height: 32px; border-radius: 8px; border: 2px solid var(--glass-border); background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; margin-left: -12px;">+${day.photos.length - 3}</div>` : ''}
                        </div>
                        <div style="color: var(--accent-blue); font-size: 0.8rem; font-weight: 700;">Explore &rarr;</div>
                    </div>
                </div>
            `).join('')}
            
            <div class="card glass" id="addDayBtn" style="border: 2px dashed rgba(255,255,255,0.1); background: transparent; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 180px; cursor: pointer; transition: all 0.3s; opacity: 0.7;" onmouseover="this.style.opacity='1'; this.style.borderColor='var(--accent-blue)';" onmouseout="this.style.opacity='0.7'; this.style.borderColor='rgba(255,255,255,0.1)';">
                <div style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-secondary);"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </div>
                <span style="font-weight: 600; color: var(--text-secondary); font-size: 0.9rem;">Add days to your trip</span>
            </div>
        </div>
    `;
    
    div.appendChild(daysContainer);
    
    setTimeout(() => {
        const addBtn = div.querySelector('#addDayBtn');
        if (addBtn) addBtn.onclick = () => window.openAddDayModal(activeTrip.id);
    }, 0);

    return div;
}

// --- Page: Expenses ---
function renderExpenses() {
    const div = document.createElement('div');
    
    if (!STATE.activeTripId) {
        div.innerHTML = `<h1>Expenses</h1><div class="card glass"><p>Please select a trip first.</p></div>`;
        return div;
    }

    // Build People Options
    let peopleOptions = STATE.groups.map(p => `<option value="${p}">${p}</option>`).join('');
    if (!peopleOptions) peopleOptions = `<option value="">Add companions in the personalisation section</option>`;

    // Build Category Options
    let categoryOptions = STATE.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

    div.innerHTML = `
        <h1>Expenses</h1>
        <div class="grid-2">
            <div class="card glass">
                <h2 class="card-title">Add Expense</h2>
                <form id="expenseForm">
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Who Paid</label>
                        <select id="expWho" class="glass-input" style="width: 100%;" required>
                            ${peopleOptions}
                        </select>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Category</label>
                        <select id="expCategory" class="glass-input" style="width: 100%;" required>
                            ${categoryOptions}
                        </select>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Label</label>
                        <input type="text" id="expLabel" class="glass-input" style="width: 100%;" placeholder="e.g. Dinner at Mario's" required>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Date</label>
                        <input type="date" id="expDate" class="glass-input" style="width: 100%;" required>
                    </div>
                    <div style="margin-bottom: 16px; position: relative;" id="countrySearchContainer">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Country</label>
                        <div class="custom-select-wrapper">
                            <input type="text" id="expCountry" class="glass-input" style="width: 100%;" placeholder="Search or select country..." autocomplete="off">
                            <div id="countryDropdownList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 250px; overflow-y: auto; margin-top: 4px; border-radius: 16px; border: 1.5px solid #002d5b; background: rgba(255,255,255,0.95);">
                                ${COUNTRIES.sort().map(c => `<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #1a3a5f; font-weight: 600; transition: background 0.2s;" data-value="${c}">${c}</div>`).join('')}
                                <div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #1a3a5f; font-weight: 600; transition: background 0.2s;" data-value="Other">Other</div>
                            </div>
                        </div>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Value</label>
                        <input type="number" step="0.01" id="expValue" class="glass-input" style="width: 100%;" required>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Currency</label>
                        <select id="expCurrency" class="glass-input" style="width: 100%;" required>
                            <option value="">Select Currency...</option>
                            ${Object.keys(CONVERSION_RATES).map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Split Between (%)</label>
                        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                            <select id="addSplitSelect" class="glass-input" style="flex: 1;">
                                <option value="">Add person to split...</option>
                                ${STATE.groups.map(p => `<option value="${p}">${p}</option>`).join('')}
                            </select>
                            <button type="button" id="addSplitBtn" class="btn btn-small" style="padding: 0 16px;">+ Add</button>
                        </div>
                        <div id="splitContainer" style="display: flex; flex-direction: column; gap: 8px;">
                            <!-- Dynamic splitters appear here -->
                        </div>
                    </div>
                    <button type="submit" class="btn">Save Expense</button>
                </form>
            </div>
            <div class="card glass">
                <h2 class="card-title">Recent Expenses</h2>
                <div id="recentExpensesList"></div>
            </div>
        </div>
    `;

    // Handle Form Submit & Draft Saving
    setTimeout(() => {
        const form = div.querySelector('#expenseForm');
        const splitContainer = div.querySelector('#splitContainer');
        const addSplitSelect = div.querySelector('#addSplitSelect');
        const addSplitBtn = div.querySelector('#addSplitBtn');

        let activeSplitters = []; // Array of names currently in the split

        function updateSplitUI() {
            if (activeSplitters.length === 0) {
                splitContainer.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; padding:10px; border:1px dashed var(--glass-border); border-radius:8px; text-align:center;">100% will be attributed to the payer.</p>';
                return;
            }

            const defaultPct = (100 / activeSplitters.length).toFixed(1);
            splitContainer.innerHTML = activeSplitters.map(p => `
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <span style="font-weight: 500;">${p}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="number" class="glass-input split-input" data-person="${p}" value="${defaultPct}" step="0.1" style="width: 70px; padding: 4px 8px; text-align: center;" required>
                        <span style="color: var(--text-secondary); font-size: 0.9rem;">%</span>
                        <button type="button" class="remove-splitter" data-person="${p}" style="background:none; border:none; color:#ff3b30; cursor:pointer; font-weight:700; margin-left:8px;">&times;</button>
                    </div>
                </div>
            `).join('');

            // Attach remove listeners
            splitContainer.querySelectorAll('.remove-splitter').forEach(btn => {
                btn.onclick = () => {
                    const person = btn.getAttribute('data-person');
                    activeSplitters = activeSplitters.filter(p => p !== person);
                    updateSplitUI();
                };
            });
        }

        addSplitBtn.onclick = () => {
            const person = addSplitSelect.value;
            if (person && !activeSplitters.includes(person)) {
                activeSplitters.push(person);
                updateSplitUI();
            }
        };

        // Populate from draft
        if (STATE.draftExpense) {
            const d = STATE.draftExpense;
            if (d.who) div.querySelector('#expWho').value = d.who;
            if (d.categoryId) div.querySelector('#expCategory').value = d.categoryId;
            if (d.label) div.querySelector('#expLabel').value = d.label;
            if (d.date) div.querySelector('#expDate').value = d.date;
            if (d.country) div.querySelector('#expCountry').value = d.country;
            if (d.value) div.querySelector('#expValue').value = d.value;
            if (d.currency) div.querySelector('#expCurrency').value = d.currency;
        }

        // Live Save Draft
        form.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', (e) => {
                const id = e.target.id;
                if (!id) return;
                const val = e.target.value;
                if (id === 'expWho') STATE.draftExpense.who = val;
                if (id === 'expCategory') STATE.draftExpense.categoryId = val;
                if (id === 'expLabel') STATE.draftExpense.label = val;
                if (id === 'expDate') STATE.draftExpense.date = val;
                if (id === 'expCountry') STATE.draftExpense.country = val;
                if (id === 'expValue') STATE.draftExpense.value = val;
                if (id === 'expCurrency') STATE.draftExpense.currency = val;
                
                saveState(); // Persist draft too
            });
        });

        // Custom Searchable Dropdown Logic
        const countryInput = div.querySelector('#expCountry');
        const countryList = div.querySelector('#countryDropdownList');
        const countryItems = countryList.querySelectorAll('.dropdown-item');

        countryInput.onfocus = () => {
            countryList.style.display = 'block';
        };

        countryInput.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            countryItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(val) ? 'block' : 'none';
            });
            countryList.style.display = 'block';
        };

        countryItems.forEach(item => {
            item.onclick = (e) => {
                countryInput.value = item.getAttribute('data-value');
                countryList.style.display = 'none';
                e.stopPropagation();
                
                // Trigger draft save manually since we set value programmatically
                STATE.draftExpense.country = countryInput.value;
                saveState();
            };
            item.onmouseover = () => item.style.background = 'rgba(0, 122, 255, 0.1)';
            item.onmouseout = () => item.style.background = 'transparent';
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!div.querySelector('#countrySearchContainer').contains(e.target)) {
                countryList.style.display = 'none';
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const payer = div.querySelector('#expWho').value;
            const splits = {};
            let totalSplit = 0;
            
            const splitInputs = div.querySelectorAll('.split-input');
            if (splitInputs.length > 0) {
                splitInputs.forEach(input => {
                    const val = parseFloat(input.value) || 0;
                    splits[input.getAttribute('data-person')] = val;
                    totalSplit += val;
                });

                if (Math.abs(totalSplit - 100) > 0.5) {
                    alert("Percentages must add up to exactly 100%");
                    return;
                }
            } else {
                // Default: 100% to payer
                splits[payer] = 100;
            }

            const val = parseFloat(div.querySelector('#expValue').value);
            const curr = div.querySelector('#expCurrency').value.toUpperCase();
            
            const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
            const countryVal = div.querySelector('#expCountry').value || (activeTrip ? activeTrip.country : '');

            const expense = {
                id: generateId(),
                tripId: STATE.activeTripId,
                who: payer,
                categoryId: div.querySelector('#expCategory').value,
                label: div.querySelector('#expLabel').value,
                date: div.querySelector('#expDate').value,
                country: countryVal,
                value: val,
                currency: curr,
                euroValue: val * (CONVERSION_RATES[curr] || 1),
                splits: splits
            };
            STATE.expenses.push(expense);
            
            // Clear draft
            STATE.draftExpense = { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR' };
            
            saveState();
            renderRecentExpenses(div.querySelector('#recentExpensesList'));
            form.reset();
            activeSplitters = [];
            updateSplitUI();
        });
        
        renderRecentExpenses(div.querySelector('#recentExpensesList'));
        updateSplitUI();
    }, 0);

    return div;
}

function renderRecentExpenses(container) {
    if (!container) return;
    const tripExpenses = STATE.expenses.filter(e => e.tripId === STATE.activeTripId).reverse().slice(0, 5);
    
    if (tripExpenses.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-secondary); padding:20px;">No recent expenses.</p>';
        return;
    }

    container.innerHTML = tripExpenses.map(e => {
        const cat = STATE.categories.find(c => c.id === e.categoryId);
        const displayEuro = e.euroValue;
        
        return `
            <div style="padding: 16px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 1.05rem;">${cat ? cat.icon : ''} ${e.label}</strong>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
                        <span>📍 ${e.country || 'Unknown'}</span> • <span>${e.date}</span> • <span>Paid by ${e.who}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="text-align: right;">
                        <div style="font-weight: 600; font-size: 1.1rem; color: var(--text-primary);">${e.value.toFixed(2)} ${e.currency}</div>
                        <div style="font-size: 0.9rem; color: var(--accent-blue); font-weight: 500; margin-top: 2px;">≈ €${displayEuro.toFixed(2)}</div>
                    </div>
                    <button onclick="window.deleteExpense('${e.id}')" style="background:rgba(255,59,48,0.1); border:none; color:#ff3b30; width:32px; height:32px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.deleteExpense = (id) => {
    window.showConfirmModal({
        title: "Delete Expense?",
        message: "This will remove this record from your trip history.",
        confirmText: "Delete",
        onConfirm: () => {
            STATE.expenses = STATE.expenses.filter(e => e.id !== id);
            saveState();
            navigate('expenses');
        }
    });
};

// --- Page: Upload ---
function renderUpload() {
    const div = document.createElement('div');
    div.innerHTML = `
        <h1>Upload Data</h1>
        <div class="card glass" style="border-color: rgba(33, 115, 70, 0.3); box-shadow: 0 0 15px rgba(33, 115, 70, 0.1);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <h2 class="card-title" style="color: #217346; margin: 0;">Excel Upload</h2>
            </div>

            <!-- Format Selector -->
            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:8px;">Import Format</label>
                <select id="formatSelect" class="glass-input" style="width:100%;">
                    ${(() => {
                        const sf = STATE.savedFormats || [];
                        const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);
                        const activeId = activeTrip?.activeFormatId;
                        const activeType = activeTrip?.activeFormatType || 'popular';

                        const populars = [
                            { id: 'tricount', name: 'Tricount Export (CSV/XLSX)' },
                            { id: 'splitwise', name: 'Splitwise Export' },
                            { id: 'revolut', name: 'Revolut Monthly Statement' }
                        ];

                        const popOpts = populars.map(p => 
                            `<option value="popular:${p.id}" ${activeType === 'popular' && activeId === p.id ? 'selected' : ''}>${p.name}</option>`
                        ).join('');

                        const custOpts = sf.length === 0 
                            ? '<option disabled>No saved custom formats yet</option>'
                            : sf.map(f => 
                                `<option value="custom:${f.id}" ${activeType === 'custom' && activeId === f.id ? 'selected' : ''}>${f.name}</option>`
                            ).join('');

                        return `
                            <optgroup label="Popular Formats">${popOpts}</optgroup>
                            <optgroup label="Custom Formats">${custOpts}</optgroup>
                        `;
                    })()}
                </select>
                <p id="formatNote" style="font-size:0.8rem; color:var(--text-secondary); margin-top:8px;"></p>
            </div>

            <!-- Column reference for custom formats -->
            <div id="customFormatPreview" style="display:none; margin-bottom:16px; padding:12px 16px; background:rgba(255,149,0,0.07); border:1px solid rgba(255,149,0,0.2); border-radius:10px;">
                <p style="font-size:0.82rem; font-weight:600; margin-bottom:8px; color:#ff9500;">Active Format Mapping</p>
                <div id="customFormatTable"></div>
            </div>

            <!-- Popular format note -->
            <div id="popularNote" style="padding: 16px; background: rgba(0,113,227,0.05); border-radius: 12px; border: 1px solid rgba(0,113,227,0.1); margin-bottom: 20px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent-blue);">💡 FORMAT PREVIEW</span>
                <p style="margin: 5px 0 0; font-size: 0.85rem; color: var(--text-secondary);">Ensure your file contains these columns. We will try to auto-detect categories.</p>
                <div id="popularFormatTableContainer" style="margin-top: 16px; overflow-x: auto; background: white; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);"></div>
            </div>

            <input type="file" id="excelFile" accept=".xlsx, .xls, .csv" class="glass-input" style="margin-bottom: 15px; width: 100%;">
            
            <div id="previewContainer" style="display: none; margin-bottom: 15px;">
                <h3 style="margin-bottom: 10px;">Preview (First 3 Rows)</h3>
                <div style="overflow-x: auto;">
                    <table class="liquid-table" id="previewTable">
                        <thead></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>

            <br>
            <button class="btn" id="uploadBtn">Upload and Process</button>
            <div id="uploadStatus" style="margin-top: 15px; font-weight: bold;"></div>
        </div>
    `;

    setTimeout(() => {
        let parsedRows = null;
        let currentHeader = [];

        const formatSelect = div.querySelector('#formatSelect');
        const popularNote = div.querySelector('#popularNote');
        const customFormatPreview = div.querySelector('#customFormatPreview');
        const customFormatTable = div.querySelector('#customFormatTable');

        const updateUI = () => {
            const val = formatSelect.value;
            const isPopular = val.startsWith('popular:');
            popularNote.style.display = isPopular ? 'block' : 'none';
            
            if (!isPopular) {
                const formatId = val.split(':')[1];
                const format = (STATE.savedFormats || []).find(f => f.id === formatId);
                if (format) {
                    customFormatPreview.style.display = 'block';
                    customFormatTable.innerHTML = `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:8px;">
                        ${format.mappings.map(m => `<div style="font-size:0.75rem;"><span style="color:var(--text-secondary);">${m.variable}:</span> <strong>${m.column}</strong></div>`).join('')}
                    </div>`;
                    
                    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
                    if (trip) {
                        trip.activeFormatId = formatId;
                        trip.activeFormatType = 'custom';
                        saveState();
                    }
                } else {
                    customFormatPreview.style.display = 'none';
                }
            } else {
                customFormatPreview.style.display = 'none';
                
                const popId = val.split(':')[1];
                const popContainer = div.querySelector('#popularFormatTableContainer');
                
                let headers = [];
                let row = [];
                if (popId === 'tricount') {
                    headers = ['Title', 'Amount', 'Currency', 'Date', 'Paid by'];
                    row = ['Dinner', '45.00', 'EUR', '2023-10-12', 'Alice'];
                } else if (popId === 'splitwise') {
                    headers = ['Date', 'Description', 'Category', 'Cost', 'Currency'];
                    row = ['2023-10-12', 'Taxi', 'Transportation', '20.00', 'EUR'];
                } else if (popId === 'revolut') {
                    headers = ['Type', 'Product', 'Started Date', 'Description', 'Amount', 'Currency', 'State'];
                    row = ['CARD_PAYMENT', 'Current', '2023-10-12', 'Restaurant', '-45.00', 'EUR', 'COMPLETED'];
                }
                
                if (headers.length > 0) {
                    popContainer.innerHTML = `
                        <table class="liquid-table" style="font-size: 0.75rem; margin: 0;">
                            <thead>
                                <tr>${headers.map(h => `<th style="padding: 8px 12px;">${h}</th>`).join('')}</tr>
                            </thead>
                            <tbody>
                                <tr>${row.map(d => `<td style="padding: 8px 12px; color: var(--text-secondary);">${d}</td>`).join('')}</tr>
                            </tbody>
                        </table>
                    `;
                } else {
                    popContainer.innerHTML = '';
                }

                const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
                if (trip) {
                    trip.activeFormatId = popId;
                    trip.activeFormatType = 'popular';
                    saveState();
                }
            }
        };

        formatSelect.addEventListener('change', updateUI);
        updateUI();

        div.querySelector('#excelFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(evt) {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});
                    
                    if (json.length < 2) return;
                    
                    const header = json[0];
                    currentHeader = header;
                    parsedRows = json.slice(1).filter(r => r.length > 0 && r[0]);

                    const previewContainer = div.querySelector('#previewContainer');
                    const thead = div.querySelector('#previewTable thead');
                    const tbody = div.querySelector('#previewTable tbody');
                    
                    thead.innerHTML = '<tr>' + header.map(h => `<th>${h || ''}</th>`).join('') + '</tr>';
                    
                    const previewRows = parsedRows.slice(0, 3);
                    tbody.innerHTML = previewRows.map(row => {
                        return '<tr>' + header.map((_, i) => `<td>${row[i] || ''}</td>`).join('') + '</tr>';
                    }).join('');

                    previewContainer.style.display = 'block';
                } catch (err) {
                    console.error("Preview error", err);
                }
            };
            reader.readAsArrayBuffer(file);
        });

        div.querySelector('#uploadBtn').addEventListener('click', () => {
            if (!STATE.activeTripId) {
                alert("Please select or create a trip first!");
                return;
            }
            const statusDiv = div.querySelector('#uploadStatus');
            const formatVal = formatSelect.value;
            const isPopular = formatVal.startsWith('popular:');
            const popularFormat = formatVal.split(':')[1];
            
            if (!parsedRows) {
                statusDiv.innerText = "Please select a valid file to process.";
                statusDiv.style.color = "red";
                return;
            }

            try {
                let added = 0;
                let mappings = [];
                
                if (!isPopular) {
                    const formatId = formatVal.split(':')[1];
                    const format = STATE.savedFormats.find(f => f.id === formatId);
                    if (!format) throw new Error("Format not found");
                    mappings = format.mappings;
                }

                parsedRows.forEach(row => {
                    let who, catName, label, date, country, value, currency;

                    if (isPopular) {
                        if (popularFormat === 'tricount') {
                            label = String(row[0] || '').trim();
                            value = parseFloat(row[1]) || 0;
                            currency = String(row[2] || 'EUR').trim().toUpperCase();
                            date = String(row[3] || '').trim();
                            catName = String(row[4] || '').trim();
                            who = String(row[5] || '').trim();
                            country = 'Unknown';
                        } else if (popularFormat === 'splitwise') {
                            date = String(row[0] || '').trim();
                            label = String(row[1] || '').trim();
                            catName = String(row[2] || '').trim();
                            value = parseFloat(row[3]) || 0;
                            currency = String(row[4] || 'EUR').trim().toUpperCase();
                            who = 'Me';
                            country = 'Unknown';
                        }
                    } else {
                        const colToIdx = (letter) => letter ? letter.toUpperCase().charCodeAt(0) - 65 : -1;
                        const get = (varName) => {
                            const mapping = mappings.find(m => m.variable === varName);
                            if (!mapping) return '';
                            return String(row[colToIdx(mapping.column)] || '').trim();
                        };

                        who       = get('who');
                        catName   = get('categoryId');
                        label     = get('label');
                        date      = get('date');
                        country   = get('country') || 'Unknown';
                        value     = parseFloat(get('value')) || 0;
                        currency  = get('currency').toUpperCase() || 'EUR';
                    }

                    if (who && !STATE.groups.includes(who)) {
                        STATE.groups.push(who);
                    }

                    let category = STATE.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
                    if (!category && catName) {
                        category = { id: generateId(), name: catName, icon: '📌', color: '#8e8e93' };
                        STATE.categories.push(category);
                    }
                    const categoryId = category ? category.id : STATE.categories[0].id;

                    const expense = {
                        id: generateId(),
                        tripId: STATE.activeTripId,
                        who,
                        categoryId,
                        label,
                        date,
                        country,
                        value,
                        currency,
                        euroValue: value * (CONVERSION_RATES[currency] || 1)
                    };
                    STATE.expenses.push(expense);
                    added++;
                });

                saveState();
                statusDiv.innerText = `Successfully imported ${added} expenses!`;
                statusDiv.style.color = "green";
                parsedRows = null; 
                div.querySelector('#previewContainer').style.display = 'none';
            } catch (error) {
                console.error(error);
                statusDiv.innerText = "Error parsing file. Check the format.";
                statusDiv.style.color = "red";
            }
        });
    }, 0);

    return div;
}

// --- Page: Insights ---
function renderInsights() {
    const div = document.createElement('div');
    
    if (!STATE.activeTripId) {
        div.innerHTML = `<h1>Insights</h1><div class="card glass"><p>Please select a trip.</p></div>`;
        return div;
    }

    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId);
    
    // Trigger historical rate fetch in background
    const uniqueDates = [...new Set(tripExps.map(e => e.date).filter(d => !!d))];
    fetchHistoricalRates(uniqueDates).then(() => {});

    if (tripExps.length === 0) {
        div.innerHTML = `
            <h1>Insights</h1>
            <div style="height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 5rem; margin-bottom: 20px; opacity: 0.5;">📊</div>
                <h2 style="color: var(--text-primary); margin-bottom: 10px;">No Data to Analyze Yet</h2>
                <p style="max-width: 400px; line-height: 1.5;">Add your travel expenses in the <b>Expenses</b> tab or upload an Excel sheet to see your spending breakdown and analytics.</p>
                <button id="goToExpensesBtn" class="btn" style="margin-top: 24px;">Add Your First Expense</button>
            </div>
        `;
        setTimeout(() => {
            div.querySelector('#goToExpensesBtn').addEventListener('click', () => navigate('expenses'));
        }, 0);
        return div;
    }

    // Helper for conversion based on current insightCurrency and rateMode
    const targetCurr = STATE.insightCurrency || 'EUR';
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
        if(!catTotals[e.categoryId]) catTotals[e.categoryId] = 0;
        catTotals[e.categoryId] += e.displayValue;
        
        if(!spenderTotals[e.who]) spenderTotals[e.who] = 0;
        spenderTotals[e.who] += e.displayValue;

        const d = e.date || 'Unknown';
        if(!dateTotals[d]) dateTotals[d] = 0;
        dateTotals[d] += e.displayValue;
    });

    const sortedSpenders = Object.entries(spenderTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    let topSpender = sortedSpenders.length > 0 ? sortedSpenders[0][0] : "N/A";
    let topSpenderAmount = sortedSpenders.length > 0 ? sortedSpenders[0][1] : 0;

    const spenderRankingHtml = sortedSpenders.slice(1).map(([who, amount], index) => `
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
            <span style="font-weight: 500;">${index + 2}. ${who}</span>
            <span style="color: var(--accent-blue); font-weight: 600;">${targetCurr === 'EUR' ? '€' : ''}${amount.toFixed(2)}${targetCurr !== 'EUR' ? ' ' + targetCurr : ''}</span>
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
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
                <span style="font-weight: 500;">${index + 2}. ${cat ? cat.icon + ' ' + cat.name : 'Unknown'}</span>
                <span style="color: var(--accent-blue); font-weight: 600;">${count} trans.</span>
            </div>
        `;
    }).join('');

    const pieLabels = [];
    const pieData = [];
    const pieColors = [];
    Object.keys(catTotals).forEach(catId => {
        const cat = STATE.categories.find(c => c.id === catId);
        if(cat) {
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
                <h1 style="margin: 0; font-size: 3.5rem; letter-spacing: -0.04em;">Insights</h1>
                <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: 1.1rem;">Your travel spending at a glance.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 24px;">
                <div class="glass" style="display: flex; padding: 4px; border-radius: 14px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-sm);">
                    <button class="rate-mode-btn ${mode === 'at_trip' ? 'active' : ''}" data-mode="at_trip" style="padding: 8px 18px; border-radius: 11px; border: none; background: ${mode === 'at_trip' ? 'var(--accent-blue)' : 'transparent'}; color: ${mode === 'at_trip' ? 'white' : 'var(--text-secondary)'}; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                        At Trip
                    </button>
                    <button class="rate-mode-btn ${mode === 'today' ? 'active' : ''}" data-mode="today" style="padding: 8px 18px; border-radius: 11px; border: none; background: ${mode === 'today' ? 'var(--accent-blue)' : 'transparent'}; color: ${mode === 'today' ? 'white' : 'var(--text-secondary)'}; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
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
        <div style="margin-bottom: 32px;">
            <div class="card glass" style="background: linear-gradient(135deg, var(--glass-bg), rgba(0,113,227,0.03)); border-left: 4px solid var(--accent-blue);">
                <h2 class="card-title" style="font-size: 1rem; color: var(--accent-blue); text-transform: uppercase; letter-spacing: 0.1em;">Total Spent on your trip</h2>
                <div style="display: flex; align-items: baseline; gap: 10px;">
                    <h1 style="margin: 0; font-size: 4.5rem; font-weight: 800; letter-spacing: -0.05em;">${targetCurr === 'EUR' ? '€' : ''}${totalDisplay.toFixed(2)}</h1>
                    <span style="font-size: 1.5rem; color: var(--text-secondary); font-weight: 400;">${targetCurr !== 'EUR' ? targetCurr : ''}</span>
                </div>
                <p style="color: var(--text-secondary); margin-top: 10px; font-size: 1.1rem;">Spent across <strong>${totalCount}</strong> transactions during your travels.</p>
            </div>
        </div>

        <!-- Summary Grid -->
        <div class="grid-2" style="grid-template-columns: 1fr 1fr; margin-bottom: 32px;">
            <div class="card glass">
                <h2 class="card-title" style="font-size: 0.9rem; color: var(--text-secondary);">Avg. Daily Spend</h2>
                <h1 style="margin: 0; font-size: 2.5rem;">${targetCurr === 'EUR' ? '€' : ''}${(totalDisplay / (Object.keys(dateTotals).length || 1)).toFixed(2)}<small style="font-size: 1rem; font-weight: 400; color: var(--text-secondary); margin-left: 8px;">/ day</small></h1>
            </div>
            ${highestExpense ? `
            <div class="card glass">
                <h2 class="card-title" style="font-size: 0.9rem; color: var(--text-secondary);">Single Peak</h2>
                <h1 style="margin: 0; font-size: 2.5rem; color: #ff3b30;">${targetCurr === 'EUR' ? '€' : ''}${highestExpense.displayValue.toFixed(2)}</h1>
                <p style="margin: 4px 0 0 0; font-size: 0.9rem; color: var(--text-secondary);">${highestExpense.label} • ${highestExpense.who}</p>
            </div>
            ` : ''}
        </div>

        <!-- Rankings Grid -->
        <div class="grid-2" style="margin-bottom: 32px;">
            <div class="card glass" style="padding: 28px;">
                <h2 class="card-title">Top Spenders</h2>
                <div style="margin-bottom: 20px;">
                    <h1 style="margin: 0; font-size: 2rem; color: var(--text-primary);">${topSpender}</h1>
                    <span style="color: var(--accent-blue); font-weight: 700; font-size: 1.1rem;">${totalDisplay > 0 ? (targetCurr === 'EUR' ? '€' : '') + topSpenderAmount.toFixed(2) : '0'}</span>
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
        div.querySelectorAll('.rate-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                STATE.rateMode = btn.dataset.mode;
                saveState();
                navigate('insights');
            });
        });

        div.querySelector('#insightCurrencySelector').addEventListener('change', (e) => {
            STATE.insightCurrency = e.target.value;
            saveState();
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
                } catch(e) {
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
                                callback: value => (targetCurr === 'EUR' ? '€' : '') + value
                            }
                        }
                    }
                }
            });
        }
    }, 0);

    return div;
}

// --- Page: Personalization ---
function renderPersonalization() {
    const div = document.createElement('div');
    
    let catsHtml = STATE.categories.map(c => `
        <tr style="border-bottom: 1px solid var(--glass-border)">
            <td style="padding: 12px; font-weight: 500;">${c.icon} ${c.name}</td>
            <td style="padding: 12px; text-align: right;"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background: ${c.color}"></span></td>
            <td style="padding: 12px; text-align: right;">
                <button class="btn-small" style="background:none; color:#ff3b30; border:none; cursor:pointer;" onclick="window.deleteCategory('${c.id}')">✕</button>
            </td>
        </tr>
    `).join('');

    let groupsHtml = STATE.groups.map(g => `
        <tr style="border-bottom: 1px solid var(--glass-border)">
            <td style="padding: 12px; font-weight: 500;">${g}</td>
            <td style="padding: 12px; text-align: right;">
                <button class="btn-small" style="background:none; color:#ff3b30; border:none; cursor:pointer;" onclick="window.deleteCompanion('${g}')">✕</button>
            </td>
        </tr>
    `).join('');

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #5ac8fa, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Personalization</h1>
            <p>Customize your experience, categories, and travel companions.</p>
        </div>

        <div id="persMenu" class="grid-2">
            <div class="card glass card-glow-blue" style="cursor: pointer;" onclick="window.showPersTab('categories')">
                <h2 class="card-title" style="color: var(--accent-blue);">Manage Categories</h2>
                <p style="color: var(--text-secondary);">Customize expense categories, icons, and colors.</p>
            </div>
            <div class="card glass card-glow-purple" style="cursor: pointer;" onclick="window.showPersTab('companions')">
                <h2 class="card-title" style="color: #5856d6;">Manage Companions</h2>
                <p style="color: var(--text-secondary);">Add the people who usually travel and split expenses with you.</p>
            </div>
        </div>

        <div id="persContent" style="display: none;">
            <button class="btn btn-small btn-liquid-glass" style="margin-bottom: 20px;" onclick="window.showPersTab('menu')">&larr; Back to Personalization</button>
            
            <div id="persCategories" style="display: none;">
                <div class="card glass card-glow-blue">
                    <h2 class="card-title" style="color: var(--accent-blue);">Categories</h2>
                    <table class="liquid-table" style="width: 100%; margin-bottom: 20px;">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Name</th>
                                <th style="text-align: right;">Color</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${catsHtml}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--glass-border);">
                        <h3 style="margin-bottom: 12px; font-size: 1rem;">Add New Category</h3>
                        <div style="display:flex; gap: 12px; flex-wrap: wrap;">
                            <select id="catIcon" class="glass-input" style="width: 80px;">
                                <option value="🍷">🍷</option><option value="🏨">🏨</option><option value="✈️">✈️</option><option value="🚕">🚕</option><option value="🍕">🍕</option>
                                <option value="🎟️">🎟️</option><option value="🛍️">🛍️</option><option value="🍦">🍦</option><option value="🥐">🥐</option><option value="🏛️">🏛️</option>
                                <option value="🏖️">🏖️</option><option value="🎢">🎢</option><option value="🚠">🚠</option><option value="🚌">🚌</option><option value="🚆">🚆</option>
                                <option value="🌍">🌍</option><option value="🗺️">🗺️</option><option value="🎒">🎒</option><option value="📸">📸</option><option value="☕">☕</option>
                            </select>
                            <input type="text" id="catName" class="glass-input" placeholder="Category Name" style="flex:1; min-width: 150px;">
                            <input type="color" id="catColor" class="glass-input" value="#ff3b30" style="width: 50px; padding: 2px;">
                            <button id="addCatBtn" class="btn">Add</button>
                        </div>
                    </div>
                </div>
            </div>

            <div id="persCompanions" style="display: none;">
                <div class="card glass card-glow-purple">
                    <h2 class="card-title" style="color: #5856d6;">Travel Companions</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">The people who usually pay for or share expenses with you.</p>
                    <table class="liquid-table" style="width: 100%; margin-bottom: 20px;">
                        <thead>
                            <tr>
                                <th style="text-align: left;">Name</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${groupsHtml || '<tr><td colspan="2" style="text-align:center; padding: 20px; color: var(--text-secondary);">No companions added yet.</td></tr>'}
                        </tbody>
                    </table>
                    
                    <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--glass-border);">
                        <h3 style="margin-bottom: 12px; font-size: 1rem;">Add Companion</h3>
                        <div style="display: flex; gap: 12px;">
                            <input type="text" id="newPerson" class="glass-input" style="flex: 1;" placeholder="Enter name...">
                            <button id="addPersonBtn" class="btn" style="background: #5856d6;">Add Person</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        const addCatBtn = div.querySelector('#addCatBtn');
        if (addCatBtn) addCatBtn.addEventListener('click', () => {
            const icon = div.querySelector('#catIcon').value;
            const name = div.querySelector('#catName').value.trim();
            const color = div.querySelector('#catColor').value;
            if(name) {
                STATE.categories.push({ id: generateId(), name, icon, color });
                saveState();
                navigate('personalization');
                setTimeout(() => window.showPersTab('categories'), 50);
            }
        });

        const addPersonBtn = div.querySelector('#addPersonBtn');
        if (addPersonBtn) addPersonBtn.addEventListener('click', () => {
            const name = div.querySelector('#newPerson').value.trim();
            if (name && !STATE.groups.includes(name)) {
                STATE.groups.push(name);
                saveState();
                navigate('personalization');
                setTimeout(() => window.showPersTab('companions'), 50);
            }
        });
    }, 0);

    return div;
}

window.deleteCategory = (id) => {
    if (!confirm('Delete this category?')) return;
    STATE.categories = STATE.categories.filter(c => c.id !== id);
    saveState();
    navigate('personalization');
    setTimeout(() => window.showPersTab('categories'), 50);
};

window.deleteCompanion = (name) => {
    if (!confirm(`Remove ${name} from companions?`)) return;
    STATE.groups = STATE.groups.filter(g => g !== name);
    saveState();
    navigate('personalization');
    setTimeout(() => window.showPersTab('companions'), 50);
};

window.showPersTab = (tab) => {
    const menu = document.getElementById('persMenu');
    const content = document.getElementById('persContent');
    const cats = document.getElementById('persCategories');
    const comps = document.getElementById('persCompanions');
    
    if (!menu || !content) return;

    menu.style.display = tab === 'menu' ? 'grid' : 'none';
    content.style.display = tab === 'menu' ? 'none' : 'block';
    
    if (tab !== 'menu') {
        cats.style.display = tab === 'categories' ? 'block' : 'none';
        comps.style.display = tab === 'companions' ? 'block' : 'none';
    }
};

// --- Page: Settings ---
function renderSettings() {
    const div = document.createElement('div');
    
    function renderMappingContent() {
        const MANDATORY = ['label','date','value','who'];
        const OPTIONAL = ['country','categoryId','currency'];
        const used = new Set((STATE.customFormat || []).map(m => m.variable));
        const sf = STATE.savedFormats || [];

        return `
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px;">
                ${MANDATORY.map(v => {
                    const done = used.has(v);
                    return `<span style="padding:6px 14px; border-radius:20px; font-size:0.75rem; font-weight:700; border:1px solid ${done ? 'rgba(52,199,89,0.3)' : 'rgba(255,59,48,0.3)'}; background:${done ? 'rgba(52,199,89,0.05)' : 'rgba(255,59,48,0.05)'}; color:${done ? '#34c759' : '#ff3b30'};">
                        ${done ? '✓' : '★'} ${v.toUpperCase()}
                    </span>`;
                }).join('')}
            </div>

            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--glass-border); border-radius: 20px; overflow: hidden; margin-bottom: 24px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="background: rgba(255,149,0,0.05);">
                        <tr>
                            <th style="text-align:left; padding:16px; font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary);">Variable</th>
                            <th style="text-align:left; padding:16px; font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary);">Excel Column</th>
                            <th style="text-align:center; padding:16px; font-size:0.7rem; text-transform:uppercase; color:var(--text-secondary);">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(STATE.customFormat || []).length === 0 ? '<tr><td colspan="3" style="padding:32px; text-align:center; color:var(--text-secondary); font-style:italic;">No mappings yet.</td></tr>' : (STATE.customFormat || []).map(m => `
                            <tr style="border-bottom: 1px solid var(--glass-border);">
                                <td style="padding:16px; font-weight:700;">${m.variable}</td>
                                <td style="padding:16px;"><span style="background:#ff9500; color:white; padding:4px 10px; border-radius:8px; font-weight:800; font-size:0.8rem;">${m.column}</span></td>
                                <td style="padding:16px; text-align:center;">
                                    <button onclick="window.removeFormatMapping('${m.variable}')" style="background:rgba(255,59,48,0.1); border:none; color:#ff3b30; width:32px; height:32px; border-radius:50%; cursor:pointer;">&times;</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div style="display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap; margin-bottom:32px;">
                <div style="flex:1; min-width:150px;">
                    <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--text-secondary);">VARIABLE</label>
                    <select id="mapVarSelect" class="glass-input" style="width:100%;">
                        <option value="">Select...</option>
                        ${MANDATORY.concat(OPTIONAL).filter(v => !used.has(v)).map(v => `<option value="${v}">${MANDATORY.includes(v) ? '★ ' : ''}${v}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1; min-width:120px;">
                    <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--text-secondary);">COLUMN</label>
                    <select id="mapColSelect" class="glass-input" style="width:100%;">
                        <option value="">Col...</option>
                        ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <button class="btn btn-liquid-glass" style="padding: 12px 24px;" onclick="window.addFormatMapping()">Map Field</button>
            </div>

            <div style="border-top: 1px solid var(--glass-border); padding-top: 32px;">
                <h3 style="margin-top:0;">Saved Formats (${sf.length}/5)</h3>
                <div style="display:grid; gap:12px;">
                    ${sf.map(f => `
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:16px; border-radius:16px; border:1px solid var(--glass-border);">
                            <div style="font-weight:700;">${f.name}</div>
                            <button class="btn btn-small" style="background:rgba(255,59,48,0.1); color:#ff3b30; border:none; padding:8px 16px; border-radius:12px;" onclick="window.deleteSavedFormat('${f.id}')">Delete</button>
                        </div>
                    `).join('')}
                    ${sf.length < 5 ? `
                        <div style="display:flex; gap:12px; margin-top:12px;">
                            <input type="text" id="formatNameInput" class="glass-input" placeholder="Name this format..." style="flex:1;">
                            <button class="btn" onclick="window.saveCustomFormat()" style="background:var(--accent-blue);">Save Format</button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    const buildSettingsUI = (activeTab = 'menu') => {
        const isMenu = activeTab === 'menu';
        const isReset = activeTab === 'reset';
        const isFormat = activeTab === 'format';

        return `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #ff3b30, #ff9500); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">System Control</h1>
                <p>Manage your travel data, custom formats, and core preferences.</p>
            </div>

            ${isMenu ? `
                <div class="settings-grid">
                    <div class="card glass management-card" style="cursor: pointer;" onclick="window.switchSettingsTab('format')">
                        <h2 class="card-title" style="color: #ff9500; margin: 0;">Format Options</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Configure Excel import mappings and global data formats.</p>
                        <div style="margin-top: 20px; color: #ff9500; font-weight: 700; font-size: 0.85rem;">Configure &rarr;</div>
                    </div>

                    <div class="card glass management-card danger-card" style="cursor: pointer;" onclick="window.switchSettingsTab('reset')">
                        <div class="danger-glow pulse-red"></div>
                        <h2 class="card-title" style="color: #ff3b30; margin: 0;">Data Management</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Wipe specific data categories or perform a factory reset.</p>
                        <div style="margin-top: 20px; color: #ff3b30; font-weight: 700; font-size: 0.85rem;">Manage Data &rarr;</div>
                    </div>
                </div>
            ` : `
                <button class="btn btn-small btn-liquid-glass" style="margin-bottom: 24px; padding: 10px 20px; border-radius: 14px;" onclick="window.switchSettingsTab('menu')">&larr; Back to Control Center</button>
                
                ${isReset ? `
                    <div class="settings-grid">
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #007aff; margin-top: 0;">Companions</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Delete your travel companions and groups.</p>
                            <button class="btn btn-small" style="background: rgba(0, 113, 227, 0.1); color: #007aff; border: 1px solid rgba(0, 113, 227, 0.2); width: 100%;" onclick="window.confirmReset('groups')">Clear Groups</button>
                        </div>
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #ff9500; margin-top: 0;">Trips & Days</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Remove all trips, itineraries, and daily logs.</p>
                            <button class="btn btn-small" style="background: rgba(255, 149, 0, 0.1); color: #ff9500; border: 1px solid rgba(255, 149, 0, 0.2); width: 100%;" onclick="window.confirmReset('trips')">Delete All Trips</button>
                        </div>
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #5856d6; margin-top: 0;">Categories</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Reset custom expense categories to defaults.</p>
                            <button class="btn btn-small" style="background: rgba(88, 86, 214, 0.1); color: #5856d6; border: 1px solid rgba(88, 86, 214, 0.2); width: 100%;" onclick="window.confirmReset('categories')">Restore Defaults</button>
                        </div>
                        <div class="card glass danger-card" style="padding: 24px; border-color: rgba(255, 59, 48, 0.3);">
                            <h3 style="color: #ff3b30; margin-top: 0;">Factory Reset</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Permanently wipe every trace of data from the app.</p>
                            <button class="btn-confirm-danger" style="font-size: 0.85rem; padding: 12px;" onclick="window.confirmReset('app')">Erase Everything</button>
                        </div>
                    </div>
                ` : ''}

                ${isFormat ? `
                    <div class="card glass" style="padding: 32px; border-radius: 28px;">
                        <h2 style="color: #ff9500; margin-top: 0;">Custom Excel Mapping</h2>
                        <p style="color: var(--text-secondary); margin-bottom: 24px;">Define how internal app fields map to Excel columns for seamless imports.</p>
                        
                        <div id="mappingTableContainer">
                            ${renderMappingContent()}
                        </div>
                    </div>
                ` : ''}
            `}
        `;
    };

    window.switchSettingsTab = (tab) => {
        div.innerHTML = buildSettingsUI(tab);
    };

    window.confirmReset = (type) => {
        const configs = {
            groups: { 
                title: "Clear Companions?", 
                message: "This will remove all travel companions and group lists.", 
                confirmText: "Clear All", 
                onConfirm: () => { STATE.groups = []; saveState(); window.switchSettingsTab('reset'); }
            },
            trips: { 
                title: "Wipe All Trips?", 
                message: "This permanently deletes every trip, day log, and itinerary.", 
                confirmText: "Delete Trips", 
                onConfirm: () => { STATE.trips = []; STATE.tripDays = []; STATE.expenses = []; STATE.activeTripId = null; saveState(); window.switchSettingsTab('reset'); }
            },
            categories: { 
                title: "Reset Categories?", 
                message: "Reverts all expense categories to the system defaults.", 
                confirmText: "Restore Defaults", 
                onConfirm: () => { 
                    STATE.categories = [
                        { id: 'c1', name: 'Food', icon: '🍔', color: '#ff3b30' },
                        { id: 'c2', name: 'Transport', icon: '✈️', color: '#007aff' },
                        { id: 'c3', name: 'Accommodation', icon: '🏨', color: '#5856d6' }
                    ]; 
                    saveState(); 
                    window.switchSettingsTab('reset'); 
                }
            },
            app: { 
                title: "Factory Reset", 
                message: "Absolute destruction. This wipes EVERY bit of data from the application.", 
                confirmText: "ERASE EVERYTHING", 
                requireInput: "ERASE", 
                onConfirm: () => { localStorage.clear(); location.reload(); }
            }
        };
        window.showConfirmModal(configs[type]);
    };

    window.addFormatMapping = () => {
        const variable = document.getElementById('mapVarSelect')?.value;
        const column   = document.getElementById('mapColSelect')?.value;
        if (!variable || !column) return;
        STATE.customFormat = STATE.customFormat || [];
        if (STATE.customFormat.some(m => m.variable === variable)) return;
        STATE.customFormat.push({ variable, column });
        saveState();
        window.switchSettingsTab('format');
    };

    window.removeFormatMapping = (variable) => {
        STATE.customFormat = (STATE.customFormat || []).filter(m => m.variable !== variable);
        saveState();
        window.switchSettingsTab('format');
    };

    window.saveCustomFormat = () => {
        const MANDATORY = ['label', 'date', 'value', 'who'];
        const fmt = STATE.customFormat || [];
        const mapped = new Set(fmt.map(m => m.variable));
        const missing = MANDATORY.filter(v => !mapped.has(v));
        if (missing.length > 0) return alert(`Missing required fields: ${missing.join(', ')}`);
        const name = (document.getElementById('formatNameInput')?.value || '').trim();
        if (!name) return;
        STATE.savedFormats = STATE.savedFormats || [];
        STATE.savedFormats.push({ id: generateId(), name, mappings: [...fmt] });
        STATE.customFormat = []; 
        saveState();
        window.switchSettingsTab('format');
    };

    window.deleteSavedFormat = (id) => {
        window.showConfirmModal({
            title: "Delete Format?",
            message: "This mapping will no longer be available for imports.",
            confirmText: "Delete",
            onConfirm: () => {
                STATE.savedFormats = (STATE.savedFormats || []).filter(f => f.id !== id);
                saveState();
                window.switchSettingsTab('format');
            }
        });
    };

    div.innerHTML = buildSettingsUI('menu');
    return div;
}

window.showSettingsTab = (tab) => {
    // Legacy support for other parts of the app
    navigate('settings');
    setTimeout(() => {
        if (window.switchSettingsTab) window.switchSettingsTab(tab);
    }, 50);
};

// --- Trip Management & Topbar ---
function updateTripSelector() {
    const selector = document.getElementById('tripSelector');
    if (!selector) return;
    
    const hasTrips = STATE.trips.length > 0;
    
    if (!hasTrips) {
        selector.innerHTML = '<option value="">Create your first trip...</option>';
    } else {
        selector.innerHTML = '<option value="">Your active trips</option>' + 
            STATE.trips.map(t => `<option value="${t.id}" ${STATE.activeTripId === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
    }

    document.querySelectorAll('.sidebar-item').forEach(item => {
        const page = item.dataset.page;
        const tripDependent = ['expenses', 'upload', 'insights', 'ai']; 
        
        if (!hasTrips && tripDependent.includes(page)) {
            item.classList.add('disabled');
        } else {
            item.classList.remove('disabled');
        }
    });
}
function archiveActiveTrip() {
    if (!STATE.activeTripId) return;
    const tripIndex = STATE.trips.findIndex(t => t.id === STATE.activeTripId);
    if (tripIndex === -1) return;

    if (confirm("Archive this trip? It will be moved to Collections.")) {
        const trip = STATE.trips.splice(tripIndex, 1)[0];
        
        trip.expenses = (STATE.expenses || []).filter(e => e.tripId === trip.id);
        trip.itinerary = (STATE.activities || []).filter(a => a.tripId === trip.id);
        trip.photos = (STATE.photos || []).filter(p => p.tripId === trip.id);
        trip.tripDays = (STATE.tripDays || []).filter(d => d.tripId === trip.id);

        STATE.expenses = (STATE.expenses || []).filter(e => e.tripId !== trip.id);
        STATE.activities = (STATE.activities || []).filter(a => a.tripId !== trip.id);
        STATE.photos = (STATE.photos || []).filter(p => p.tripId !== trip.id);
        STATE.tripDays = (STATE.tripDays || []).filter(d => d.tripId !== trip.id);

        if (!STATE.archivedTrips) STATE.archivedTrips = [];
        STATE.archivedTrips.push(trip);
        STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0].id : null;
        saveState();
        updateTripSelector();
        navigate('home');
    }
}

// --- Page: Budgets ---
function renderBudgets() {
    const div = document.createElement('div');
    STATE.budgets = STATE.budgets || [];

    const tripOpts = STATE.trips.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    const catOpts = STATE.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const userOpts = STATE.groups.map(g => `<option value="${g}">${g}</option>`).join('');

    const activeBudgetsHtml = STATE.budgets.length > 0 ? STATE.budgets.map(b => {
        let spent = 0;
        STATE.expenses.forEach(e => {
            if (b.tripId && b.tripId !== 'all' && e.tripId !== b.tripId) return;
            if (b.categoryId && b.categoryId !== 'all' && e.categoryId !== b.categoryId) return;
            if (b.user && b.user !== 'all' && e.who !== b.user) return;
            spent += parseFloat(e.euroValue || 0);
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
        if (b.tripId && b.tripId !== 'all') titleParts.push(STATE.trips.find(t=>t.id===b.tripId)?.name || 'Trip');
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
                        ${spent.toFixed(0)}€ <span style="color: var(--text-secondary); opacity: 0.6;">/ ${b.amount.toFixed(0)}€</span>
                    </div>
                    <button class="btn-small" style="background: none; border: none; color: #ff3b30; font-size: 0.7rem; font-weight: 700; cursor: pointer; padding: 0;" onclick="window.deleteBudget('${b.id}')">Delete</button>
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
            <h1 style="background: linear-gradient(135deg, #34c759, #007aff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Budgets</h1>
            <p>Set spending limits and track them across trips.</p>
        </div>
        
        <div class="grid-2" style="margin-top: 24px;">
            <div class="card glass card-glow-green">
                <h2 class="card-title" style="color: #34c759;">Create New Budget</h2>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Trip</label>
                    <select id="budTrip" class="glass-input" style="width:100%;"><option value="all">All Trips</option>${tripOpts}</select>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Category</label>
                    <select id="budCat" class="glass-input" style="width:100%;"><option value="all">All Categories</option>${catOpts}</select>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Person</label>
                    <select id="budUser" class="glass-input" style="width:100%;"><option value="all">Everyone</option>${userOpts}</select>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Target Amount (€)</label>
                    <input type="number" id="budAmt" class="glass-input" style="width:100%;" placeholder="e.g. 1000">
                </div>
                <button id="saveBudgetBtn" class="btn" style="width:100%; background: #34c759;">Save Budget</button>
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
        const btn = div.querySelector('#saveBudgetBtn');
        if (btn) btn.addEventListener('click', () => {
            const amt = parseFloat(div.querySelector('#budAmt').value);
            if (!amt || amt <= 0) return alert('Enter a valid amount.');
            
            STATE.budgets.push({
                id: generateId(),
                tripId: div.querySelector('#budTrip').value,
                categoryId: div.querySelector('#budCat').value,
                user: div.querySelector('#budUser').value,
                amount: amt
            });
            saveState();
            navigate('budgets');
        });
    }, 0);

    return div;
}

window.deleteBudget = (id) => {
    STATE.budgets = STATE.budgets.filter(b => b.id !== id);
    saveState();
    navigate('budgets');
};

// --- Page: Collections ---
function renderCollections() {
    const div = document.createElement('div');
    const archived = STATE.archivedTrips || [];

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
            <p>Your archived travel memories and trip photos.</p>
        </div>
        
        <div class="trip-nav glass" style="margin-top: 24px; display: none;">
            <button class="trip-tab active" id="tabArchived">Archived Trips</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${archived.length > 0 ? archived.map(t => `
                    <div class="card glass card-glow-blue" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
                        <div style="cursor: pointer; flex: 1;" onclick="window.viewArchivedDetails('${t.id}')">
                            <h3 style="margin: 0;">${t.name}</h3>
                            <p style="color: var(--text-secondary); margin: 4px 0 0 0;">${t.country} · ${t.expenses?.length || 0} expenses</p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-liquid-glass btn-small" onclick="window.viewArchivedDetails('${t.id}')">View</button>
                            <button class="btn btn-small" onclick="window.restoreTrip('${t.id}')" style="background: var(--accent-blue);">Restore</button>
                            <button class="btn btn-small" onclick="window.deleteArchivedTrip('${t.id}')" style="background: rgba(255,59,48,0.1); color: #ff3b30; border: 1px solid rgba(255,59,48,0.3);">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </div>
                    </div>
                `).join('') : `
                    <div class="card glass" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">📚</div>
                        <h2>No archived trips</h2>
                        <p style="color: var(--text-secondary);">Your travel history will appear here once you archive a trip.</p>
                    </div>
                `}
            </div>
        </div>
    `;

    setTimeout(() => {
        div.querySelector('#tabArchived').onclick = () => {
            // Keep active
        };
    }, 0);

    return div;
}

window.deletePhoto = (id) => {
    if (!confirm("Delete this photo?")) return;
    STATE.photos = STATE.photos.filter(p => p.id !== id);
    saveState();
    navigate('collections');
    setTimeout(() => {
        const btn = document.getElementById('tabPhotos');
        if (btn) btn.click();
    }, 50);
};

window.viewArchivedDetails = (id) => {
    navigate('archived-detail', { id });
};

function renderArchivedTripDetail(tripId) {
    const trip = STATE.archivedTrips.find(t => t.id === tripId);
    const div = document.createElement('div');
    if (!trip) {
        div.innerHTML = `<p style="padding: 40px; text-align: center;">Trip not found.</p>`;
        return div;
    }

    let totalSpent = 0;
    (trip.expenses || []).forEach(e => totalSpent += parseFloat(e.euroValue || 0));

    div.innerHTML = `
        <div class="trip-banner" style="background: rgba(255,255,255,0.9); border: 1.5px solid var(--accent-blue);">
            <div style="font-size: 0.9rem; color: rgba(0, 45, 91, 0.5); font-weight: 800; text-transform: uppercase; letter-spacing: 0.25em; margin-bottom: 12px;">Memories of</div>
            <h1 class="trip-banner-title" style="font-size: 4rem; margin: 0; letter-spacing: -0.06em; color: var(--accent-blue); font-weight: 800; line-height: 0.95;">${trip.name}</h1>
            <div style="display: flex; gap: 24px; margin-top: 20px; color: #1a3a5f; font-weight: 700;">
                <span style="display: flex; align-items: center; gap: 8px;">📍 ${trip.country}</span>
                <span style="display: flex; align-items: center; gap: 8px;">📅 ${trip.tripDays?.length || 0} Days</span>
                <span style="display: flex; align-items: center; gap: 8px;">💰 €${totalSpent.toFixed(0)} spent</span>
            </div>
            <div style="position: absolute; right: 40px; bottom: 40px; display: flex; gap: 12px;">
                <button class="btn" style="background: #002d5b; color: #ffffff; padding: 12px 24px; border-radius: 16px; font-weight: 800;" onclick="window.restoreTrip('${trip.id}')">Restore Trip</button>
                <button class="btn" style="background: rgba(0,0,0,0.05); color: #002d5b; padding: 12px 24px; border-radius: 16px; font-weight: 800; border: 1px solid rgba(0,0,0,0.1);" onclick="navigate('collections')">Back</button>
            </div>
        </div>

        <div class="day-blocks-grid">
            ${(trip.tripDays || []).sort((a,b) => a.dayNumber - b.dayNumber).map(day => {
                const dayPhotos = day.photos || [];
                const dayDocs = day.tickets || [];
                
                return `
                    <div class="day-block" onclick="window.openDayDetailView('${trip.id}', '${day.id}', true)">
                        <div class="day-block-header">
                            <span class="day-block-number" style="color: #007aff;">Day ${day.dayNumber}</span>
                            <div style="display: flex; gap: 8px;">
                                ${dayPhotos.length > 0 ? `<span style="font-size: 0.8rem; color: rgba(0, 45, 91, 0.4);">📸 ${dayPhotos.length}</span>` : ''}
                                ${dayDocs.length > 0 ? `<span style="font-size: 0.8rem; color: rgba(0, 45, 91, 0.4);">🎫 ${dayDocs.length}</span>` : ''}
                            </div>
                        </div>
                        <h3 class="day-block-name" style="color: var(--accent-blue); font-size: 1.6rem; font-weight: 800;">${day.name || `Day ${day.dayNumber}`}</h3>
                        
                        <div class="mini-gallery-grid">
                            ${dayPhotos.slice(0, 3).map(p => `
                                <div class="mini-gallery-item" style="border: 1px solid rgba(0,0,0,0.05);">
                                    <img src="${p}">
                                </div>
                            `).join('')}
                            ${dayPhotos.length === 0 ? `
                                <div style="grid-column: 1/-1; height: 60px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.02); border-radius: 12px; border: 1px dashed rgba(0,0,0,0.1); color: rgba(0, 45, 91, 0.3); font-size: 0.8rem;">
                                    No memories captured
                                </div>
                            ` : ''}
                        </div>
                        
                        ${dayDocs.length > 0 ? `
                            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                ${dayDocs.slice(0, 2).map(d => `
                                    <div class="mini-doc-tag" style="background: rgba(255,255,255,0.4); border: 1px solid rgba(0,0,0,0.05); color: #1a3a5f;">📄 ${d.name}</div>
                                `).join('')}
                                ${dayDocs.length > 2 ? `<div class="mini-doc-tag" style="background: rgba(255,255,255,0.4); border: 1px solid rgba(0,0,0,0.05); color: #1a3a5f;">+${dayDocs.length - 2}</div>` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;

    return div;
}

window.openDayDetailView = (tripId, dayId, isArchived = false) => {
    const trip = isArchived 
        ? STATE.archivedTrips.find(t => t.id === tripId)
        : STATE.trips.find(t => t.id === tripId);
        
    if (!trip) return;
    const day = (trip.tripDays || (STATE.tripDays || []).filter(d => d.tripId === trip.id)).find(d => d.id === dayId);
    if (!day) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(20px)';

    modal.innerHTML = `
        <div class="card glass" style="width: 550px; height: 550px; overflow-y: auto; padding: 40px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1.5px solid #002d5b; background: rgba(255,255,255,0.9); box-shadow: 0 40px 100px rgba(0,0,0,0.3); box-sizing: border-box; display: flex; flex-direction: column;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-shrink: 0;">
                <div>
                    <div style="font-size: 0.8rem; color: #007aff; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px;">${isArchived ? 'Archived' : 'Trip'} Day ${day.dayNumber}</div>
                    <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #002d5b; font-weight: 800;">${day.name || `Day ${day.dayNumber}`}</h2>
                </div>
                <button onclick="this.closest('.modal-overlay').remove()" style="background: rgba(0,0,0,0.05); border: none; font-size: 1.2rem; cursor: pointer; color: #002d5b; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s; border: 1px solid rgba(0,0,0,0.1);">&times;</button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 24px; flex: 1; overflow-y: auto; padding-right: 8px; margin-bottom: 24px;" class="custom-scrollbar">
                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1px solid rgba(0,0,0,0.05);">
                    <h3 style="margin: 0 0 20px 0; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">📸 Memories</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 14px;">
                        ${(day.photos || []).map(p => `
                            <div style="aspect-ratio: 1; border-radius: 16px; overflow: hidden; border: 1.5px solid rgba(0,0,0,0.05);">
                                <img src="${p}" style="width: 100%; height: 100%; object-fit: cover;">
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1px solid rgba(0,0,0,0.05);">
                    <h3 style="margin: 0 0 20px 0; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">🎫 Documents</h3>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${(day.tickets || []).map(t => `
                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.4); padding: 16px 20px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.05);">
                                <div style="display: flex; align-items: center; gap: 16px;">
                                    <div style="font-size: 1.5rem;">📄</div>
                                    <div>
                                        <div style="font-weight: 700; font-size: 1rem; color: #002d5b;">${t.name}</div>
                                        <div style="font-size: 0.8rem; color: rgba(0, 45, 91, 0.5); font-weight: 600;">Saved on ${new Date(t.date).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Notes Section (Archived View) -->
                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                    <h3 style="margin: 0 0 14px; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">📝 Notes</h3>
                    <div style="background: rgba(255,255,255,0.8); border-radius: 16px; padding: 14px; font-size: 0.95rem; color: #002d5b; line-height: 1.5; min-height: 40px;">
                        ${day.notes || '<span style="color: rgba(0,45,91,0.3);">No notes recorded.</span>'}
                    </div>
                </div>

                <!-- Plans Section (Archived View) -->
                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                    <h3 style="margin: 0 0 14px; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">🗓️ Plans</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div style="padding: 14px; background: rgba(0,113,227,0.05); border-radius: 14px; border: 1px solid rgba(0,113,227,0.12);">
                            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #007aff; margin-bottom: 6px;">🌅 Morning</div>
                            <div style="font-size: 0.9rem; color: #002d5b;">${(day.plan && day.plan.morning) || '---'}</div>
                        </div>
                        <div style="padding: 14px; background: rgba(255,149,0,0.05); border-radius: 14px; border: 1px solid rgba(255,149,0,0.12);">
                            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ff9500; margin-bottom: 6px;">☀️ Afternoon</div>
                            <div style="font-size: 0.9rem; color: #002d5b;">${(day.plan && day.plan.afternoon) || '---'}</div>
                        </div>
                        <div style="padding: 14px; background: rgba(88,86,214,0.05); border-radius: 14px; border: 1px solid rgba(88,86,214,0.12);">
                            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #5856d6; margin-bottom: 6px;">🌙 Evening</div>
                            <div style="font-size: 0.9rem; color: #002d5b;">${(day.plan && day.plan.evening) || '---'}</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <button class="btn" style="width: 100%; background: #002d5b; padding: 16px; border-radius: 20px; font-weight: 800; color: #ffffff;" onclick="this.closest('.modal-overlay').remove()">Dismiss</button>
        </div>
    `;
    document.body.appendChild(modal);
};

window.restoreTrip = (id) => {
    const tripIndex = STATE.archivedTrips.findIndex(t => t.id === id);
    if (tripIndex === -1) return;

    window.showConfirmModal({
        title: "Restore Trip?",
        message: "This will move the trip and all its memories back to your active trips.",
        confirmText: "Restore",
        onConfirm: () => {
            const trip = STATE.archivedTrips.splice(tripIndex, 1)[0];
            
            // Restore related data
            if (trip.expenses) STATE.expenses = [...(STATE.expenses || []), ...trip.expenses];
            if (trip.itinerary) STATE.activities = [...(STATE.activities || []), ...trip.itinerary];
            if (trip.photos) STATE.photos = [...(STATE.photos || []), ...trip.photos];
            if (trip.tripDays) STATE.tripDays = [...(STATE.tripDays || []), ...trip.tripDays];

            // Restore trip object (preserving all properties)
            const restoredTrip = { ...trip };
            delete restoredTrip.expenses;
            delete restoredTrip.itinerary;
            delete restoredTrip.photos;
            delete restoredTrip.tripDays;
            
            STATE.trips.push(restoredTrip);
            STATE.activeTripId = trip.id;
            
            saveState();
            updateTripSelector();
            navigate('home');
        }
    });
};

window.deleteArchivedTrip = (id) => {
    window.showConfirmModal({
        title: "Delete Archived Trip?",
        message: "Permanently delete this archived trip and all its data? This cannot be undone.",
        confirmText: "Delete Trip",
        requireInput: "DELETE",
        onConfirm: () => {
            STATE.archivedTrips = (STATE.archivedTrips || []).filter(t => t.id !== id);
            saveState();
            navigate('collections');
        }
    });
};

// --- Page: Plan with AI ---
let leafletMap = null;
function renderAI() {
    const div = document.createElement('div');
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);

    // ── EMPTY STATE ──────────────────────────────────────────
    if (!activeTrip) {
        div.innerHTML = `
            <div style="padding:32px 0 24px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Your AI-powered travel planner</p>
            </div>
            <div style="position: relative; width: 100%; height: calc(100vh - 200px); min-height: 480px; border-radius: 20px; overflow: hidden;">
                <div id="emptyMap" style="width:100%; height:100%;"></div>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.38);backdrop-filter:blur(6px);">
                    <div style="text-align:center;color:white;padding:40px;max-width:480px;">
                        <div style="font-size:4rem;margin-bottom:20px;">✈️</div>
                        <p style="font-size:1.1rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;">Create a trip first to start planning your perfect itinerary with the help of Gemini.</p>
                        <button onclick="document.getElementById('newTripBtn').click()" style="margin-top:24px;background:white;color:#0071e3;border:none;border-radius:980px;padding:14px 32px;font-size:1rem;font-weight:700;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;">+ Create a Trip</button>
                    </div>
                </div>
            </div>`;
        setTimeout(() => {
            if (typeof L !== 'undefined') {
                const m = L.map('emptyMap', { zoomControl: false, attributionControl: false }).setView([20, 0], 2);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
            }
        }, 0);
        return div;
    }

    // ── ACTIVE TRIP STATE ────────────────────────────────────
    const tripCountry = activeTrip.country || '';
    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId && e.date).sort((a,b) => a.date.localeCompare(b.date));
    const dates = tripExps.map(e => e.date);
    const minDate = dates[0] || '';
    const maxDate = dates[dates.length - 1] || '';

    const tourismTypes = [
        { icon: '🏛️', label: 'Culture & History' }, { icon: '🍽️', label: 'Food & Dining' },
        { icon: '🌿', label: 'Nature & Outdoors' }, { icon: '🏄', label: 'Adventure & Sports' },
        { icon: '🌙', label: 'Nightlife' },          { icon: '💎', label: 'Luxury' },
        { icon: '👨‍👩‍👧', label: 'Family-Friendly' },  { icon: '🎒', label: 'Budget Travel' },
        { icon: '🛍️', label: 'Shopping' },           { icon: '🧘', label: 'Wellness & Spa' },
    ];

    const sf = `font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;

    div.innerHTML = `
        <div style="${sf}">
            <!-- Header -->
            <div style="padding:32px 0 24px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <h1 style="margin:0;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Planning your trip to <strong>${tripCountry}</strong></p>
            </div>

            <!-- Top 2-col: Controls | Map -->
            <div style="display:grid;grid-template-columns:380px 1fr;gap:24px;margin-bottom:32px;">

                <!-- Left: Controls -->
                <div id="aiControlsPanel" style="display:flex;flex-direction:column;gap:16px;">
                    <!-- AI Engine badge -->
                    <div class="card glass" style="padding:18px;border-color:rgba(155,89,182,0.3);">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#9b59b6;margin-bottom:8px;">✦ AI Engine</h2>
                        <p style="color:var(--text-secondary);font-size:0.82rem;margin:0;">Secure server-side Gemini integration.</p>
                    </div>
                    <!-- Dates -->
                    <div class="card glass" style="padding:20px;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--accent-blue);margin-bottom:14px;">📅 Travel Dates</h2>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">From</label>
                                <input id="aiDateFrom" type="date" class="glass-input" value="${minDate}" style="width:100%;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">To</label>
                                <input id="aiDateTo" type="date" class="glass-input" value="${maxDate}" style="width:100%;">
                            </div>
                        </div>
                    </div>

                    <div class="card glass" style="padding:20px;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.05em;">📝 Requirements</h2>
                        <textarea id="aiExtraContext" class="glass-input" rows="3" style="width:100%; resize:none; font-size:0.9rem;" placeholder="e.g. Vegetarian friendly, no walking more than 2km..."></textarea>
                    </div>
                    <!-- Generate -->
                    <button id="generateBtn" class="btn ai-generate-btn" style="width:100%; padding: 16px; border-radius: 16px; font-weight: 800; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; border: none; cursor: pointer;">✦ Generate My Itinerary</button>
                </div>

                <!-- Right: Leaflet Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiLeafletMap" style="width:100%;height:100%;"></div>
                        <div style="position:absolute;bottom:14px;left:14px;background:var(--glass-bg);backdrop-filter:blur(12px);padding:6px 14px;border-radius:980px;border:1px solid var(--glass-border);font-size:0.82rem;font-weight:600;z-index:1000;color:white;">
                            📍 ${tripCountry}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput" style="margin-bottom: 60px;"></div>
        </div>`;

    setTimeout(() => {
        // Tourism tags
        div.querySelectorAll('.tourism-tag').forEach(btn => btn.addEventListener('click', () => btn.classList.toggle('selected')));

        // Init Leaflet map
        if (typeof L !== 'undefined') {
            if (leafletMap) { leafletMap.remove(); leafletMap = null; }
            leafletMap = L.map('aiLeafletMap', { zoomControl: true, attributionControl: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(leafletMap);
            // Geocode the country to center the map
            fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(tripCountry)}&format=json&limit=1`)
                .then(r => r.json()).then(data => {
                    if (data[0]) leafletMap.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 6);
                }).catch(() => {});
        }

        let generatedItinerary = null;

        // Generate button
        div.querySelector('#generateBtn').addEventListener('click', async () => {
            const outputEl = div.querySelector('#itineraryOutput');
            const dateFrom = div.querySelector('#aiDateFrom').value;
            const dateTo   = div.querySelector('#aiDateTo').value;
            const context = document.getElementById('aiExtraContext').value;
            const country = tripCountry;

            if (!dateFrom || !dateTo) { alert('Please select your travel dates.'); return; }

            const from  = new Date(dateFrom), to = new Date(dateTo);
            const numDays = Math.max(1, Math.round((to - from) / 86400000) + 1);

            outputEl.innerHTML = `<div class="ai-loading-spinner" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px;"><div class="spinner-ring" style="width:40px; height:40px; border:3px solid rgba(255,255,255,0.1); border-top-color:var(--accent-blue); border-radius:50%; animation:spin 1s linear infinite;"></div><div style="font-weight:600; margin-top: 24px; font-size: 1.2rem; color: white;">Consulting Gemini AI...</div><div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">Building your ${numDays}-day itinerary for ${country}</div></div>`;

            try {
                const r = await fetch('/api/generate_itinerary', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({ destination: country, numDays: numDays, dateFrom: dateFrom, dateTo: dateTo, context: context })
                });
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                generatedItinerary = d.itinerary;
            } catch(e) { 
                outputEl.innerHTML = `<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p style="color:var(--text-secondary);">${e.message}</p></div>`;
                return;
            }

            if (!generatedItinerary || !generatedItinerary.length) {
                outputEl.innerHTML = `<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p style="color:var(--text-secondary);">Empty response received.</p></div>`;
                return;
            }

            // ── Render day blocks ─────────────────────────────
            outputEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;color:white;${sf}">${numDays}-Day ${country} Itinerary</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">Generated by Gemini AI</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">✦ AI-Generated</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>
                <div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">Accept Plan & Add to Trip</button><button id="regenerateBtn" class="btn" style="flex:1;background:rgba(255,255,255,0.08);color:white;padding:16px;font-size:1rem;border-radius:16px;font-weight:700;border:1px solid var(--glass-border);cursor:pointer;">✦ Regenerate</button></div>`;

            const daysContainer = outputEl.querySelector('#itineraryDays');
            const dayDivs = [];

            generatedItinerary.forEach((day, i) => {
                const dayDiv = document.createElement('div');
                dayDiv.id = `day-block-${i}`;
                dayDiv.className = 'card glass';
                dayDiv.style.cssText = `border-radius:18px;overflow:hidden;transition:box-shadow 0.3s,border-color 0.3s;${sf}`;
                dayDiv.innerHTML = `
                    <div style="display:flex;align-items:stretch;">
                        <!-- Day number sidebar -->
                        <div style="width:72px;min-width:72px;background:linear-gradient(180deg,var(--accent-blue),#9b59b6);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 0;gap:4px;">
                            <span style="color:rgba(255,255,255,0.7);font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Day</span>
                            <span style="color:white;font-size:2rem;font-weight:800;line-height:1;">${day.day}</span>
                        </div>
                        <!-- Content -->
                        <div style="flex:1;padding:24px 28px;">
                            <div style="margin-bottom:20px;">
                                <h3 style="margin:0 0 4px;font-size:1.2rem;font-weight:700;letter-spacing:-0.02em;color:white;">${day.title || 'Day ' + day.day}</h3>
                                <span style="font-size:0.8rem;color:var(--text-secondary);">${day.date || ''}</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:${day.tip ? '20px' : '0'};">
                                <div style="padding:16px;background:rgba(0,113,227,0.05);border-radius:12px;border:1px solid rgba(0,113,227,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);margin-bottom:8px;">🌅 Morning</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${day.morning?.activity || ''}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${day.morning?.description || ''}</div>
                                </div>
                                <div style="padding:16px;background:rgba(255,149,0,0.05);border-radius:12px;border:1px solid rgba(255,149,0,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ff9500;margin-bottom:8px;">☀️ Afternoon</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${day.afternoon?.activity || ''}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${day.afternoon?.description || ''}</div>
                                </div>
                                <div style="padding:16px;background:rgba(155,89,182,0.05);border-radius:12px;border:1px solid rgba(155,89,182,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9b59b6;margin-bottom:8px;">🌙 Evening</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${day.evening?.activity || ''}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${day.evening?.description || ''}</div>
                                </div>
                            </div>
                            ${day.tip ? `<div style="padding:12px 16px;background:rgba(0,113,227,0.05);border-left:3px solid var(--accent-blue);border-radius:0 10px 10px 0;"><span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);">💡 Pro Tip</span><p style="margin:5px 0 0;font-size:0.85rem;color:var(--text-secondary);">${day.tip}</p></div>` : ''}
                        </div>
                    </div>`;
                daysContainer.appendChild(dayDiv);
                dayDivs.push(dayDiv);
            });

            // ── Add Leaflet markers for each day ─────────────
            if (leafletMap) {
                // Clear existing markers
                leafletMap.eachLayer(l => { if (l instanceof L.Marker) leafletMap.removeLayer(l); });

                const markerCoords = [];
                const geocodeAndMark = async (day, i) => {
                    const loc = day.mainLocation || day.title || country;
                    try {
                        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc + ', ' + country)}&format=json&limit=1`);
                        const data = await r.json();
                        if (!data[0]) return;
                        const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
                        markerCoords.push([lat, lon]);

                        // Custom numbered marker
                        const icon = L.divIcon({
                            className: '',
                            html: `<div style="width:32px;height:32px;background:linear-gradient(135deg,#0071e3,#9b59b6);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:0.85rem;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);cursor:pointer;font-family:-apple-system,sans-serif;">${day.day}</div>`,
                            iconSize: [32, 32], iconAnchor: [16, 16]
                        });

                        const marker = L.marker([lat, lon], { icon }).addTo(leafletMap);
                        marker.bindPopup(`<strong style="font-family:-apple-system,sans-serif;">Day ${day.day}</strong><br><span style="font-size:0.85rem;">${day.title}</span>`);

                        // Click marker → highlight day block
                        marker.on('click', () => {
                            dayDivs.forEach(d => {
                                d.style.boxShadow = '';
                                d.style.borderColor = '';
                            });
                            const target = dayDivs[i];
                            if (target) {
                                target.style.boxShadow = '0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)';
                                target.style.borderColor = 'var(--accent-blue)';
                                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        });

                        // Click day block → pan map to marker
                        dayDivs[i].style.cursor = 'pointer';
                        dayDivs[i].addEventListener('click', () => {
                            leafletMap.setView([lat, lon], 10, { animate: true });
                            marker.openPopup();
                            dayDivs.forEach(d => { d.style.boxShadow = ''; d.style.borderColor = ''; });
                            dayDivs[i].style.boxShadow = '0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)';
                            dayDivs[i].style.borderColor = 'var(--accent-blue)';
                        });

                        // After all: fit map to all markers
                        if (markerCoords.length === generatedItinerary.length) {
                            leafletMap.fitBounds(markerCoords, { padding: [40, 40] });
                        }
                    } catch(e) { console.warn('Geocode failed for', loc, e); }
                };

                // Stagger geocode calls to respect Nominatim rate limit
                generatedItinerary.forEach((day, i) => {
                    setTimeout(() => geocodeAndMark(day, i), i * 1100);
                });
            }

            // Accept Plan logic
            document.getElementById('acceptPlanBtn').onclick = () => {
                if (!generatedItinerary) return;
                
                if (!STATE.tripDays) STATE.tripDays = [];
                if (!STATE.activities) STATE.activities = [];
                
                generatedItinerary.forEach((dayInfo, idx) => {
                    const dayDate = dayInfo.date || (new Date().toISOString().split('T')[0]);
                    
                    // Create Day with plan pre-filled from AI
                    const dayId = 'day_' + Date.now() + '_' + idx;
                    STATE.tripDays.push({
                        id: dayId,
                        tripId: activeTrip.id,
                        date: dayDate,
                        name: dayInfo.title || `Day ${idx + 1}`,
                        dayNumber: idx + 1,
                        photos: [],
                        tickets: [],
                        notes: '',
                        plan: {
                            morning:   dayInfo.morning   ? `${dayInfo.morning.activity}: ${dayInfo.morning.description}`   : '',
                            afternoon: dayInfo.afternoon ? `${dayInfo.afternoon.activity}: ${dayInfo.afternoon.description}` : '',
                            evening:   dayInfo.evening   ? `${dayInfo.evening.activity}: ${dayInfo.evening.description}`   : ''
                        }
                    });
                    
                    // Create Activities
                    const acts = [
                        { time: 'Morning', ...dayInfo.morning, type: 'Activity' },
                        { time: 'Afternoon', ...dayInfo.afternoon, type: 'Activity' },
                        { time: 'Evening', ...dayInfo.evening, type: 'Activity' }
                    ];

                    acts.forEach((act, aIdx) => {
                        if (act.activity) {
                            STATE.activities.push({
                                id: 'act_' + Date.now() + '_' + idx + '_' + aIdx,
                                tripId: activeTrip.id,
                                dayId: dayId,
                                title: act.activity,
                                description: act.description,
                                type: act.type,
                                isBooked: false
                            });
                        }
                    });
                });
                
                saveState();
                
                const btn = document.getElementById('acceptPlanBtn');
                btn.innerHTML = '✓ Plan Accepted! (View in Home)';
                btn.style.background = '#34c759';
                btn.style.boxShadow = '0 10px 20px rgba(52,199,89,0.2)';
                btn.disabled = true;
            };

            document.getElementById('regenerateBtn').onclick = () => {
                outputEl.innerHTML = '';
                const controls = div.querySelector('#aiControlsPanel');
                if (controls) controls.scrollIntoView({ behavior: 'smooth' });
                else window.scrollTo({ top: 0, behavior: 'smooth' });
            };

        });
    }, 0);

    return div;
}



// --- Page: Settlements ---
function renderSettlement() {
    const div = document.createElement('div');
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
                        const total = (STATE.expenses.filter(e => e.tripId === t.id).reduce((sum, e) => sum + (parseFloat(e.euroValue) || 0), 0)).toFixed(0);
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
                    <h1 style="background: linear-gradient(135deg, #48d1e8, #007aff); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
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
        creditorsCopy.sort((a,b) => b.amount - a.amount);
        debtorsCopy.sort((a,b) => b.amount - a.amount);

        let i = 0, j = 0;
        while (i < debtorsCopy.length && j < creditorsCopy.length) {
            const pay = Math.min(debtorsCopy[i].amount, creditorsCopy[j].amount);
            debts.push({ from: debtorsCopy[i].person, to: creditorsCopy[j].person, amount: pay });
            debtorsCopy[i].amount -= pay;
            creditorsCopy[j].amount -= pay;
            if (debtorsCopy[i].amount < 0.01) i++;
            if (creditorsCopy[j].amount < 0.01) j++;
        }

        const globalBalances = {};
        STATE.groups.forEach(p => globalBalances[p] = 0);
        STATE.expenses.forEach(exp => {
            const amount = parseFloat(exp.euroValue || exp.value || 0);
            if (globalBalances[exp.who] !== undefined) globalBalances[exp.who] += amount;
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
                <h1 style="background: linear-gradient(135deg, #48d1e8, #007aff); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                <p>Calculate who owes what and settle up fairly.</p>
            </div>

            ${tripsGridHtml}

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
                                <div>
                                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">${d.from} pays</span>
                                    <div style="font-weight: 700; font-size: 1.1rem;">${d.to}</div>
                                </div>
                                <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-blue);">€${d.amount.toFixed(2)}</div>
                            </div>
                        `).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">All settled for this trip! 🥂</p>'}
                    </div>
                </div>
            </div>

            <div class="card glass" style="margin-top: 32px; padding: 32px; border-radius: 28px;">
                <h2 class="card-title" style="margin-bottom: 24px;">Global Net Balances</h2>
                <div style="display: flex; flex-direction: column; gap: 24px;">
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
        `;
    }

    window.switchSettlementTrip = (id) => {
        div.innerHTML = buildSettlementUI(id);
    };

    div.innerHTML = buildSettlementUI(currentTripId);

    return div;
}

// --- Social & Friends (Simplified) ---
function renderFriends() {
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #5856d6, #ff2d55); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Friends</h1>
            <p>Connect with other travelers and share your itineraries</p>
        </div>
        <div class="grid-2" style="margin-top: 24px;">
            <div class="card glass card-glow-blue">
                <h3 style="margin-bottom: 16px; font-weight: 700;">Find Friends</h3>
                <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                    <input type="text" class="glass-input" placeholder="Search by email..." style="flex: 1;">
                    <button class="btn btn-small">Search</button>
                </div>
            </div>
            <div class="card glass card-glow-purple">
                <h3 style="margin-bottom: 16px; font-weight: 700;">Your Friends</h3>
                <div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No friends added yet.</div>
            </div>
        </div>
    `;
    return div;
}

// --- Trip Journey Helpers ---


// --- Confirmation & Safety UI ---
window.showConfirmModal = (options = {}) => {
    const { 
        title = "Are you sure?", 
        message = "This action cannot be undone.", 
        confirmText = "Delete", 
        requireInput = false, 
        onConfirm = () => {} 
    } = options;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(15px)';

    modal.innerHTML = `
        <div class="card glass shadow-2xl animation-pop" style="width: 400px; padding: 40px; border-radius: 40px; border: 1.5px solid #002d5b; background: rgba(255,255,255,0.95); display: flex; flex-direction: column; align-items: center; text-align: center;">
            <h2 style="margin: 0 0 12px 0; font-size: 2rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em;">${title}</h2>
            <p style="color: #1a3a5f; margin: 0 0 24px 0; font-size: 1rem; font-weight: 600; line-height: 1.5;">${message}</p>
            
            ${requireInput ? `
                <div style="width: 100%; margin-bottom: 24px;">
                    <p style="font-size: 0.75rem; color: #ff3b30; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.1em;">Type "${requireInput}" to confirm</p>
                    <input type="text" id="safetyInput" class="glass-input" placeholder="Type here..." style="width: 100%; text-align: center; border: 1.5px solid rgba(0, 45, 91, 0.1); background: rgba(0,0,0,0.03); color: #002d5b; font-weight: 700;">
                </div>
            ` : ''}

            <div style="width: 100%; display: flex; flex-direction: column; gap: 12px;">
                <button class="btn" id="modalConfirmBtn" style="width: 100%; background: #ff3b30; color: #ffffff; padding: 16px; border-radius: 20px; font-weight: 800; transition: all 0.3s; ${requireInput ? 'opacity: 0.3; cursor: not-allowed;' : ''}" ${requireInput ? 'disabled' : ''}>${confirmText}</button>
                <button class="btn" style="width: 100%; background: rgba(0,0,0,0.05); color: #002d5b; padding: 16px; border-radius: 20px; font-weight: 700;" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const confirmBtn = modal.querySelector('#modalConfirmBtn');
    const input = modal.querySelector('#safetyInput');

    if (requireInput && input) {
        input.focus();
        input.oninput = (e) => {
            const isMatch = e.target.value.trim().toUpperCase() === requireInput.toUpperCase();
            confirmBtn.disabled = !isMatch;
            if (isMatch) {
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
                confirmBtn.style.boxShadow = '0 15px 35px rgba(255, 59, 48, 0.4)';
            } else {
                confirmBtn.style.opacity = '0.3';
                confirmBtn.style.cursor = 'not-allowed';
                confirmBtn.style.boxShadow = 'none';
            }
        };
    }

    confirmBtn.onclick = () => {
        onConfirm();
        modal.remove();
    };
};

window.deleteDay = (dayId) => {
    window.showConfirmModal({
        title: "Delete Day?",
        message: "This will permanently remove this day and all its captured memories.",
        confirmText: "Delete Day",
        onConfirm: () => {
            STATE.tripDays = STATE.tripDays.filter(d => d.id !== dayId);
            saveState();
            const modal = document.querySelector('.modal-overlay');
            if (modal) modal.remove();
            navigate('home');
        }
    });
};

window.openAddDayModal = (tripId) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    
    const tripDays = (STATE.tripDays || []).filter(d => d.tripId === tripId);
    const nextDayNum = tripDays.length + 1;
    let selectedPhoto = null;

    modal.innerHTML = `
        <div class="card glass" style="width: 440px; height: auto; min-height: 460px; padding: 40px; border-radius: 44px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.05); box-shadow: 0 40px 100px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; box-sizing: border-box; overflow: hidden;">
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff; background: linear-gradient(135deg, #ffffff, #a2a2a2); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Day ${nextDayNum}</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 1rem; font-weight: 500;">Capture the beginning.</p>
            </div>
            
            <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
                <input type="text" id="dayNameInput" class="glass-input" placeholder="Title (e.g. Tropical Morning 🏝️)" style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                
                <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
                    <div id="addPhotoDuringDay" style="width: 100%; height: 140px; border-radius: 24px; border: 2px dashed rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.03); overflow: hidden; cursor: pointer;">
                        <span style="color: rgba(255,255,255,0.5); font-weight: 500; font-size: 0.9rem;">+ Add Cover Photo</span>
                    </div>
                    <input type="file" id="photoInputDuringDay" style="display: none;" accept="image/*">
                </div>
            </div>
            
            <div style="width: 100%; display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
                <button id="confirmAddDay" class="btn" style="width: 100%; background: var(--accent-blue); padding: 16px; border-radius: 20px; font-weight: 800; color: #ffffff;">Launch Day</button>
                <button class="btn" style="width: 100%; background: transparent; color: rgba(255,255,255,0.5); font-weight: 600;" onclick="this.closest('.modal-overlay').remove()">Discard</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#dayNameInput').focus();
    
    const photoBtn = modal.querySelector('#addPhotoDuringDay');
    const photoInput = modal.querySelector('#photoInputDuringDay');
    const photoStatus = modal.querySelector('#photoStatus');

    photoBtn.onclick = () => photoInput.click();
    
    photoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            selectedPhoto = evt.target.result;
            photoStatus.style.opacity = '1';
            photoBtn.textContent = "Photo Selected ✓";
            photoBtn.style.background = "rgba(52, 199, 89, 0.1)";
            photoBtn.style.borderColor = "rgba(52, 199, 89, 0.4)";
            photoBtn.style.color = "#34c759";
        };
        reader.readAsDataURL(file);
    };

    modal.querySelector('#confirmAddDay').onclick = () => {
        const name = modal.querySelector('#dayNameInput').value.trim();
        const newDay = {
            id: generateId(),
            tripId: tripId,
            name: name,
            dayNumber: nextDayNum,
            photos: selectedPhoto ? [selectedPhoto] : [],
            tickets: [],
            notes: '',
            plan: { morning: '', afternoon: '', evening: '' }
        };
        STATE.tripDays.push(newDay);
        saveState();
        modal.remove();
        navigate('home');
    };
};

window.openDayDetail = (dayId) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(20px)';
    
    const refreshModal = () => {
        const currentModal = document.querySelector('.modal-overlay');
        if (currentModal) currentModal.remove();
        window.openDayDetail(dayId);
    };

    modal.innerHTML = `
        <div class="card glass shadow-2xl animation-pop" style="width: 550px; height: 550px; overflow-y: auto; padding: 40px; border-radius: 40px; border: 1.5px solid #002d5b; background: rgba(255,255,255,0.95); display: flex; flex-direction: column; box-sizing: border-box;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-shrink: 0;">
                <div>
                    <div style="font-size: 0.8rem; color: #007aff; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px;">Adventure Day ${day.dayNumber}</div>
                    <input type="text" id="editDayName" value="${day.name || `Day ${day.dayNumber}`}" 
                        style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #002d5b; font-weight: 800; background: transparent; border: none; border-bottom: 1.5px solid rgba(0, 45, 91, 0.1); width: 100%; outline: none; padding: 4px 0;"
                        onchange="window.updateDayName('${day.id}', this.value)">
                </div>
                <button onclick="this.closest('.modal-overlay').remove()" style="background: rgba(0,0,0,0.05); border: none; font-size: 1.2rem; cursor: pointer; color: #002d5b; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s; border: 1px solid rgba(0,0,0,0.1);">&times;</button>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 24px; flex: 1; overflow-y: auto; padding-right: 8px; margin-bottom: 24px;" class="custom-scrollbar">
                <!-- Photos Section -->
                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">📸 Memories</h3>
                        <button class="btn btn-small" style="background: #002d5b; color: #ffffff; padding: 10px 20px; border-radius: 14px; font-weight: 700;" onclick="document.getElementById('dayPhotoInput').click()">Upload Photo</button>
                        <input type="file" id="dayPhotoInput" style="display: none;" accept="image/*">
                    </div>
                    
                    <div id="dayGallery" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 14px;">
                        ${day.photos.length > 0 ? day.photos.map((p, i) => `
                            <div style="aspect-ratio: 1; border-radius: 16px; overflow: hidden; position: relative; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                                <img src="${p}" style="width: 100%; height: 100%; object-fit: cover;">
                                <button onclick="window.deleteDayPhoto('${day.id}', ${i})" style="position: absolute; top: 8px; right: 8px; background: rgba(255,255,255,0.8); backdrop-filter: blur(8px); color: #ff3b30; border: none; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1rem; border: 1px solid rgba(255,59,48,0.2);">&times;</button>
                            </div>
                        `).join('') : `
                            <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; border: 2px dashed rgba(0, 45, 91, 0.1); border-radius: 20px; color: #1a3a5f;">
                                <p style="margin: 0; font-size: 0.95rem; font-weight: 500;">No photos yet.</p>
                            </div>
                        `}
                    </div>
                </div>

                <!-- Tickets Section -->
                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">🎫 Documents</h3>
                        <button class="btn btn-small" style="background: #002d5b; color: #ffffff; padding: 10px 20px; border-radius: 14px; font-weight: 700;" id="addTicketBtn">+ Add</button>
                    </div>
                    <div id="ticketList" style="display: flex; flex-direction: column; gap: 12px;">
                        ${(day.tickets || []).map((t, i) => `
                            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.8); padding: 16px 20px; border-radius: 20px; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                                <div style="display: flex; align-items: center; gap: 16px;">
                                    <div style="font-size: 1.5rem;">📄</div>
                                    <div>
                                        <div style="font-weight: 700; font-size: 1rem; color: #002d5b;">${t.name}</div>
                                        <div style="font-size: 0.8rem; color: #1a3a5f; font-weight: 600;">Saved on ${new Date(t.date).toLocaleDateString()}</div>
                                    </div>
                                </div>
                                <button onclick="window.deleteTicket('${day.id}', ${i})" style="background:rgba(255,59,48,0.1); border:none; color:#ff3b30; width: 36px; height: 36px; border-radius: 50%; cursor:pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,59,48,0.2); transition: all 0.2s;">&times;</button>
                            </div>
                        `).join('')}
                        ${!day.tickets || day.tickets.length === 0 ? '<p style="color: #1a3a5f; text-align: center; font-size: 0.95rem; padding: 30px; border: 2px dashed rgba(0, 45, 91, 0.1); border-radius: 20px; font-weight: 500;">No documents stored.</p>' : ''}
                    </div>
                </div>

                <!-- Notes Section -->
                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                    <h3 style="margin: 0 0 14px; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">📝 Notes</h3>
                    <textarea id="dayNotesInput" style="width: 100%; min-height: 90px; background: rgba(255,255,255,0.8); border: 1.5px solid rgba(0,45,91,0.1); border-radius: 16px; padding: 14px; font-size: 0.95rem; color: #002d5b; resize: vertical; font-family: inherit; outline: none; box-sizing: border-box; line-height: 1.5;" placeholder="Write what happened today…">${day.notes || ''}</textarea>
                    <button id="saveNotesBtn" class="btn btn-small" style="margin-top: 10px; background: #002d5b; color: #ffffff; padding: 10px 20px; border-radius: 14px; font-weight: 700;">Save Notes</button>
                </div>

                <!-- Plans Section -->
                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                    <h3 style="margin: 0 0 14px; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">🗓️ Plans</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div style="padding: 14px; background: rgba(0,113,227,0.05); border-radius: 14px; border: 1px solid rgba(0,113,227,0.12);">
                            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #007aff; margin-bottom: 6px;">🌅 Morning</div>
                            <textarea id="planMorning" style="width: 100%; background: transparent; border: none; outline: none; font-size: 0.9rem; color: #002d5b; resize: none; font-family: inherit; box-sizing: border-box;" rows="2" placeholder="Morning plans…">${(day.plan && day.plan.morning) || ''}</textarea>
                        </div>
                        <div style="padding: 14px; background: rgba(255,149,0,0.05); border-radius: 14px; border: 1px solid rgba(255,149,0,0.12);">
                            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ff9500; margin-bottom: 6px;">☀️ Afternoon</div>
                            <textarea id="planAfternoon" style="width: 100%; background: transparent; border: none; outline: none; font-size: 0.9rem; color: #002d5b; resize: none; font-family: inherit; box-sizing: border-box;" rows="2" placeholder="Afternoon plans…">${(day.plan && day.plan.afternoon) || ''}</textarea>
                        </div>
                        <div style="padding: 14px; background: rgba(88,86,214,0.05); border-radius: 14px; border: 1px solid rgba(88,86,214,0.12);">
                            <div style="font-size: 0.72rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #5856d6; margin-bottom: 6px;">🌙 Evening</div>
                            <textarea id="planEvening" style="width: 100%; background: transparent; border: none; outline: none; font-size: 0.9rem; color: #002d5b; resize: none; font-family: inherit; box-sizing: border-box;" rows="2" placeholder="Evening plans…">${(day.plan && day.plan.evening) || ''}</textarea>
                        </div>
                    </div>
                    <button id="savePlanBtn" class="btn btn-small" style="margin-top: 10px; background: #5856d6; color: #ffffff; padding: 10px 20px; border-radius: 14px; font-weight: 700;">Save Plans</button>
                </div>
            </div>
            
            <div style="display: flex; gap: 16px; border-top: 1.5px solid rgba(0, 45, 91, 0.1); padding-top: 24px; flex-shrink: 0;">
                <button class="btn" style="flex: 1; padding: 16px; border-radius: 20px; color: #ff3b30; font-weight: 700; background: rgba(255,59,48,0.1); border: 1px solid rgba(255,59,48,0.2);" onclick="window.deleteDay('${day.id}')">Delete Day</button>
                <button class="btn" style="flex: 2; background: #002d5b; padding: 16px; border-radius: 20px; font-weight: 800; color: #ffffff;" onclick="this.closest('.modal-overlay').remove()">Dismiss</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#addTicketBtn').onclick = () => {
        const ticketName = prompt("Enter ticket or document name (e.g. Louvre Ticket, Hotel Reservation):");
        if (ticketName) {
            if (!day.tickets) day.tickets = [];
            day.tickets.push({ name: ticketName, date: new Date().toISOString() });
            saveState();
            refreshModal();
        }
    };

    modal.querySelector('#saveNotesBtn').onclick = () => {
        day.notes = modal.querySelector('#dayNotesInput').value;
        saveState();
        const btn = modal.querySelector('#saveNotesBtn');
        btn.textContent = 'Saved ✓'; btn.style.background = '#34c759';
        setTimeout(() => { btn.textContent = 'Save Notes'; btn.style.background = '#002d5b'; }, 2000);
    };

    modal.querySelector('#savePlanBtn').onclick = () => {
        if (!day.plan) day.plan = {};
        day.plan.morning   = modal.querySelector('#planMorning').value;
        day.plan.afternoon = modal.querySelector('#planAfternoon').value;
        day.plan.evening   = modal.querySelector('#planEvening').value;
        saveState();
        const btn = modal.querySelector('#savePlanBtn');
        btn.textContent = 'Saved ✓'; btn.style.background = '#34c759';
        setTimeout(() => { btn.textContent = 'Save Plans'; btn.style.background = '#5856d6'; }, 2000);
    };

    modal.querySelector('#dayPhotoInput').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            day.photos.push(evt.target.result);
            saveState();
            refreshModal();
            if (STATE.currentPage === 'home') navigate('home');
        };
        reader.readAsDataURL(file);
    };
};

window.deleteTicket = (dayId, index) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (day && day.tickets) {
        day.tickets.splice(index, 1);
        saveState();
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.remove();
        window.openDayDetail(dayId);
    }
};

window.updateDayName = (dayId, newName) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (day) {
        day.name = newName;
        saveState();
        if (STATE.currentPage === 'home') navigate('home');
    }
};

window.deleteDayPhoto = (dayId, photoIndex) => {
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day) return;
    day.photos.splice(photoIndex, 1);
    saveState();
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
    window.openDayDetail(dayId);
    if (STATE.currentPage === 'home') navigate('home');
};

// --- Trip Creation ---
window.openNewTripModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';
    
    modal.innerHTML = `
        <div class="card glass" style="width: 420px; height: 420px; padding: 40px; border-radius: 44px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.05); box-shadow: 0 40px 100px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; box-sizing: border-box; overflow: hidden;">
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff;">New Trip 🌎</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 1rem; font-weight: 500;">Adventure awaits.</p>
            </div>
            
            <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
                <input type="text" id="modalTripName" class="glass-input" placeholder="Trip Name (e.g. Bali Dreams)" style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                <input type="text" id="modalTripCountry" class="glass-input" placeholder="Country (e.g. Indonesia)" style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                
                <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
                    <button id="modalCreateBtn" class="btn" style="width: 100%; background: var(--accent-blue); color: #ffffff; padding: 18px; font-weight: 800; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,113,227,0.4); font-size: 1.1rem; box-sizing: border-box;">Launch Adventure</button>
                    <button id="modalCancelBtn" class="btn" style="width: 100%; padding: 8px; font-weight: 600; background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: 0.9rem;">Discard</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const nameInput = modal.querySelector('#modalTripName');
    nameInput.focus();
    modal.querySelector('#modalCancelBtn').onclick = () => modal.remove();
    modal.querySelector('#modalCreateBtn').onclick = () => {
        const name = nameInput.value.trim();
        const country = modal.querySelector('#modalTripCountry').value.trim();
        if (name && country) {
            const id = generateId();
            STATE.trips.push({ id, name, country });
            STATE.activeTripId = id;
            saveState();
            modal.remove();
            navigate('home');
            updateTripSelector();
        } else {
            alert("Please fill in both fields!");
        }
    };
};

// --- Initialization ---
function init() {
    loadState();
    updateTripSelector();
    
    // Sidebar Logic
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const openSidebar = () => {
        if (sidebar) sidebar.classList.add('open');
        if (overlay) overlay.classList.add('open');
    };
    const closeSidebar = () => {
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
    };

    // Nav Listeners
    document.querySelectorAll('.nav-item, .sidebar-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            if (e.currentTarget.classList.contains('disabled')) {
                alert("Please create or select a trip first.");
                return;
            }
            if (page) {
                closeSidebar();
                navigate(page);
            }
        });
    });

    const hamBtn = document.getElementById('hamburgerBtn');
    if (hamBtn) hamBtn.onclick = openSidebar;
    
    const closeBtn = document.getElementById('sidebarClose');
    if (closeBtn) closeBtn.onclick = closeSidebar;
    
    if (overlay) overlay.onclick = closeSidebar;

    // Trip Selector
    const selector = document.getElementById('tripSelector');
    if (selector) {
        selector.onchange = (e) => {
            STATE.activeTripId = e.target.value;
            saveState();
            const activeLink = document.querySelector('.nav-item.active');
            navigate(activeLink ? activeLink.dataset.page : 'home');
        };
    }

    // New Trip
    const newTripBtn = document.getElementById('newTripBtn');
    if (newTripBtn) newTripBtn.onclick = openNewTripModal;

    // Archive Trip Injection
    if (!document.getElementById('archiveTripBtn')) {
        const archiveBtn = document.createElement('button');
        archiveBtn.id = 'archiveTripBtn';
        archiveBtn.className = 'btn-archive';
        archiveBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="21 8 21 21 3 21 3 8"></polyline>
                <rect x="1" y="3" width="22" height="5"></rect>
                <line x1="10" y1="12" x2="14" y2="12"></line>
            </svg>`;
        archiveBtn.title = 'Archive active trip';
        const navTrips = document.querySelector('.nav-trips');
        if (navTrips) {
            navTrips.appendChild(archiveBtn);
            archiveBtn.onclick = archiveActiveTrip;
        }
    }

    // Google Login
    initGoogleLogin();

    // Initial Nav
    const urlParams = new URLSearchParams(window.location.search);
    navigate(urlParams.get('page') || 'home', false);
}

async function initGoogleLogin() {
    try {
        const resp = await fetch('/api/config');
        const config = await resp.json();
        if (!config.google_client_id) return;

        window.google.accounts.id.initialize({
            client_id: config.google_client_id,
            callback: handleGoogleLogin
        });
        window.google.accounts.id.renderButton(
            document.getElementById("googleLoginBtn"),
            { theme: "outline", size: "large", width: 250 }
        );
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.onclick = () => {
                STATE.user = null;
                saveState();
                location.reload();
            };
        }
        if (STATE.user) updateUserUI();
    } catch (e) { console.error("Google Init Failed", e); }
}

async function handleGoogleLogin(response) {
    const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential })
    });
    const data = await res.json();
    if (data.status === 'success') {
        STATE.user = data.user;
        saveState();
        updateUserUI();
        navigate('home');
    }
}

function updateUserUI() {
    if (!STATE.user) return;
    const loginBtn = document.getElementById('googleLoginBtn');
    const profile = document.getElementById('userProfile');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (loginBtn) loginBtn.style.display = 'none';
    if (profile) profile.style.display = 'flex';
    if (logoutBtn) logoutBtn.style.display = 'block';
    
    const nameEl = document.getElementById('userName');
    const emailEl = document.getElementById('userEmail');
    const picEl = document.getElementById('userPicture');
    
    if (nameEl) nameEl.innerText = STATE.user.name;
    if (emailEl) emailEl.innerText = STATE.user.email;
    if (picEl) picEl.src = STATE.user.picture;
}

document.addEventListener('DOMContentLoaded', init);

