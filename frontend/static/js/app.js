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
    savedFormats: []    // Array of {id, name, mappings:[{variable,column}]} — max 5
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

// Quotes & Images Dictionary
const TRAVEL_DATA = {
    france: {
        quotes: ["“Paris is always a good idea.” - Audrey Hepburn", "“To err is human. To loaf is Parisian.”", "“France has the only two things toward which we drift as we grow older - intelligence and good manners.”"],
        images: ["https://images.unsplash.com/photo-1502602898657-3e91760cbb34", "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f", "https://images.unsplash.com/photo-1499856871958-5b9627545d1a"]
    },
    spain: {
        quotes: ["“Spain, the beautiful country of wine and songs.”", "“I would rather be in Spain than anywhere else in the world.” - Hemingway", "“In Spain, the dead are more alive than anywhere else.”"],
        images: ["https://images.unsplash.com/photo-1543722530-d2c4cf99b518", "https://images.unsplash.com/photo-1504019347908-b45f9b0b3dd2", "https://images.unsplash.com/photo-1539037116277-4db20889f2d4"]
    },
    usa: {
        quotes: ["“There are no rules of architecture for a castle in the clouds.”", "“The United States themselves are essentially the greatest poem.”", "“I love America more than any other country.”"],
        images: ["https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9", "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b", "https://images.unsplash.com/photo-1501594907352-04cda38ebc29"]
    },
    turkey: {
        quotes: ["“Istanbul is a city of layers.”", "“Turkey is a cradle of civilizations.”", "“To visit Turkey is to travel through time.”"],
        images: ["https://images.unsplash.com/photo-1524231757912-21f4fe3a7200", "https://images.unsplash.com/photo-1527838832702-585f23df463f", "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b"]
    },
    italy: {
        quotes: ["“You may have the universe if I may have Italy.”", "“Rome is the city of echoes, the city of illusions.”", "“Venice is like eating an entire box of chocolate liqueurs.”"],
        images: ["https://images.unsplash.com/photo-1516483638261-f40af5ff1f25", "https://images.unsplash.com/photo-1525874684015-58379d421a52", "https://images.unsplash.com/photo-1552832230-c0197dd311b5"]
    },
    mexico: {
        quotes: ["“Mexico is a mosaic of different worlds and times.”", "“My heart belongs to Mexico.”", "“To be in Mexico is to be where the sun is always shining.”"],
        images: ["https://images.unsplash.com/photo-1512813583141-b921d016e1d6", "https://images.unsplash.com/photo-1518105779142-d975f22f1b0a", "https://images.unsplash.com/photo-1518633391217-09f193f350c3"]
    },
    uk: {
        quotes: ["“When a man is tired of London, he is tired of life.”", "“London is a riddle. Paris is an explanation.”", "“England is a nation of shopkeepers.”"],
        images: ["https://images.unsplash.com/photo-1513635269975-59663e0ac1ad", "https://images.unsplash.com/photo-1486299267070-83823f5448dd", "https://images.unsplash.com/photo-1529655683826-aba9b3e77383"]
    },
    germany: {
        quotes: ["“Germany is a land of poets and thinkers.”", "“Everything is simple in Germany, but everything is difficult too.”", "“Berlin is a city that never is, but is always becoming.”"],
        images: ["https://images.unsplash.com/photo-1467269204594-9661b134dd2b", "https://images.unsplash.com/photo-1506744038136-46273834b3fb", "https://images.unsplash.com/photo-1527668752968-14dc70a27c95"]
    },
    japan: {
        quotes: ["“Japan is the only country where a flower can bring a nation to a standstill.”", "“Tokyo would be the most challenging city to be a tourist in.”", "“You can get lost in Tokyo and still be where you need to be.”"],
        images: ["https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e", "https://images.unsplash.com/photo-1528360983277-13d401cdc186", "https://images.unsplash.com/photo-1542051842920-c7ba71115e4d"]
    },
    greece: {
        quotes: ["“Greece is the cradle of Western civilization.”", "“The light of Greece opened my eyes.”", "“In Greece, we are all children of the sun.”"],
        images: ["https://images.unsplash.com/photo-1533105079780-92b9be482077", "https://images.unsplash.com/photo-1503152394-c571994fd383", "https://images.unsplash.com/photo-1469796466635-455ede028ca1"]
    },
    thailand: {
        quotes: ["“Thailand is a land of smiles.”", "“Bangkok is a sensory overload.”", "“The beauty of Thailand is in its diversity.”"],
        images: ["https://images.unsplash.com/photo-1528181304800-2f140819898f", "https://images.unsplash.com/photo-1552465011-b4e21bf6e79a", "https://images.unsplash.com/photo-1504214208698-ea191f03f192"]
    },
    austria: {
        quotes: ["“In Austria, the mountains are our cathedrals.”", "“Vienna is a city that dances.”", "“Music is in the air in Austria.”"],
        images: ["https://images.unsplash.com/photo-1516550893923-42d28e5677af", "https://images.unsplash.com/photo-1527613463702-861f1c7d248d", "https://images.unsplash.com/photo-1520116468816-95b69f847357"]
    },
    saudi: {
        quotes: ["“Saudi Arabia is a land of hospitality.”", "“The desert has its own magic.”", "“A bridge between past and future.”"],
        images: ["https://images.unsplash.com/photo-1586724237569-f3d021dd4c37", "https://images.unsplash.com/photo-1551041777-ed07c469273c", "https://images.unsplash.com/photo-1518112166137-85899e90072b"]
    },
    uae: {
        quotes: ["“Dubai is a city of dreams.”", "“Innovation is in our DNA.”", "“The desert meets the future.”"],
        images: ["https://images.unsplash.com/photo-1512453979798-5ea266f8880c", "https://images.unsplash.com/photo-1518684079-3c830dcef090", "https://images.unsplash.com/photo-1512632578888-159bd082276e"]
    },
    malaysia: {
        quotes: ["“Malaysia, truly Asia.”", "“A melting pot of cultures.”", "“The beauty of Malaysia lies in its harmony.”"],
        images: ["https://images.unsplash.com/photo-1524514587686-826a7a4be03c", "https://images.unsplash.com/photo-1533051016668-36034177e685", "https://images.unsplash.com/photo-1494459942733-149d632560cc"]
    },
    portugal: {
        quotes: ["“Portugal is a land of explorers.”", "“Lisbon is a city of light.”", "“The soul of Portugal is in its Fado.”"],
        images: ["https://images.unsplash.com/photo-1555881400-74d7acaacd8b", "https://images.unsplash.com/photo-1536751048178-14106afcb46d", "https://images.unsplash.com/photo-1534351590666-13e3e96b5017"]
    },
    hong: {
        quotes: ["“Hong Kong is where East meets West.”", "“The skyline of Hong Kong is incomparable.”", "“A city that never sleeps.”"],
        images: ["https://images.unsplash.com/photo-1506351421178-63b52a2d25a2", "https://images.unsplash.com/photo-1536700503339-1e4b06520771", "https://images.unsplash.com/photo-1516893842880-5d8aada7ac05"]
    },
    poland: {
        quotes: ["“Poland is a land of resilience.”", "“Krakow is the heart of Poland.”", "“History is alive in Poland.”"],
        images: ["https://images.unsplash.com/photo-1519197924294-4ba991a11128", "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91", "https://images.unsplash.com/photo-1512470876302-972faa2aa9a4"]
    },
    'italy': {
        images: [
            'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1514890547357-a9ee288728e0?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1498502102253-b09230526081?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1600&q=80'
        ],
        quotes: [
            "Italy is a dream that keeps returning for the rest of your life.",
            "Life is a combination of magic and pasta.",
            "You may have the universe if I may have Italy.",
            "A man who has not been in Italy, is always conscious of an inferiority.",
            "Italy is the only country where the distance between the possible and the real is infinite."
        ]
    },
    'france': {
        images: [
            'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1431274172761-fca41d93e114?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1503917988258-f19a78767e99?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1541944743827-e04aa6427c33?auto=format&fit=crop&w=1600&q=80'
        ],
        quotes: [
            "To err is human. To loaf is Parisian.",
            "France is the most beautiful country in the world; the problem is that it is full of French people.",
            "Paris is always a good idea.",
            "Life is short, buy the baguette.",
            "Every man has two countries: his own and France."
        ]
    },
    'japan': {
        images: [
            'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1480796275473-a13da7f2356f?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1475938476655-814eb991b12e?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1528164344705-47542687990d?auto=format&fit=crop&w=1600&q=80'
        ],
        quotes: [
            "Japan is a world of its own, a beautiful enigma.",
            "The journey of a thousand miles begins with a single step.",
            "Even a fool has one talent.",
            "When you bow, bow as deeply as you can.",
            "One kind word can warm three winter months."
        ]
    },
    'portugal': {
        images: [
            'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1536751048178-14106afcb46d?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1440778303588-435521a205bc?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80'
        ],
        quotes: [
            "Portugal is a high hill with a white house on top.",
            "Portugal is the best place to be in the world.",
            "Saudade: a deep emotional state of melancholic longing.",
            "The Portuguese are a people of water and nostalgia."
        ]
    },
    'spain': {
        images: [
            'https://images.unsplash.com/photo-1543722530-d2c3201371e7?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1509840144521-95080401d808?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1512753360413-a44e4fa16640?auto=format&fit=crop&w=1600&q=80'
        ],
        quotes: [
            "Spain is a beautiful country with very nice people.",
            "In Spain, the dead are more alive than the dead of any other country in the world.",
            "The Spaniards are always at least a hundred years behind the rest of Europe.",
            "Any reasonable, sentient person who looks at Spain, comes to Spain, eats in Spain, drinks in Spain, they're going to fall in love."
        ]
    },
    'usa': {
        images: [
            'https://images.unsplash.com/photo-1485738422979-f5c462d49f74?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1600&q=80'
        ],
        quotes: [
            "America is a land of opportunity.",
            "The United States is the only country where you can get a hot dog at a baseball game.",
            "The beauty of America is that it is a land of immigrants.",
            "America is a place where you can be whatever you want to be."
        ]
    },
    'thailand': {
        images: [
            'https://images.unsplash.com/photo-1528181304800-2f140819898c?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1506665531195-3566af2b4dfa?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1563492065599-3520f775eeed?auto=format&fit=crop&w=1600&q=80'
        ],
        quotes: [
            "Thailand is the land of smiles.",
            "In Thailand, we say 'Mai Pen Rai' – it means don't worry about it.",
            "The food in Thailand is some of the best in the world.",
            "The beaches of Thailand are like a dream come true."
        ]
    },
    'default': {
        images: [
            'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1503220317375-aaad61436b1b?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1530789253388-582c481c54b0?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80',
            'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=80'
        ],
        quotes: [
            "The world is a book and those who do not travel read only one page.",
            "Travel is the only thing you buy that makes you richer.",
            "Not all those who wander are lost.",
            "Better to see something once than to hear about it a thousand times.",
            "Jobs fill your pocket, adventures fill your soul.",
            "Travel far enough, you meet yourself.",
            "Travel makes one modest. You see what a tiny place you occupy in the world.",
            "To travel is to live.",
            "Travel far, travel wide, and travel with an open heart.",
            "The journey not the arrival matters.",
            "Adventure is worthwhile in itself.",
            "Life is either a daring adventure or nothing at all.",
            "We travel not to escape life, but for life not to escape us.",
            "Investment in travel is an investment in yourself.",
            "Take only memories, leave only footprints."
        ]
    }
};

let dashboardInterval = null;

const CONVERSION_RATES = {
    EUR: 1,
    USD: 0.92,
    GBP: 1.17,
    JPY: 0.0061,
    CHF: 1.04,
    CAD: 0.68,
    AUD: 0.61,
    CNY: 0.13,
    BRL: 0.18,
    MXN: 0.054,
    INR: 0.011
};

// Load state from LocalStorage
function loadState() {
    const saved = localStorage.getItem('theGreatEscapeState');
    if (saved) {
        Object.assign(STATE, JSON.parse(saved));
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
    settlement: renderSettlement
};

function navigate(pageId) {
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
    const activeTrip = STATE.activeTripId ? STATE.trips.find(t => t.id === STATE.activeTripId) : null;
    
    let allQuotes = [];
    let allImages = [];

    if (activeTrip) {
        const c = (activeTrip.country || '').toLowerCase();
        const key = Object.keys(TRAVEL_DATA).find(k => c.includes(k) || k.includes(c));
        if (key && key !== 'default') {
            allQuotes.push(...TRAVEL_DATA[key].quotes);
            allImages.push(...TRAVEL_DATA[key].images);
        } else {
            allQuotes = TRAVEL_DATA.default.quotes;
            allImages = TRAVEL_DATA.default.images;
        }
    } else {
        allQuotes = TRAVEL_DATA.default.quotes;
        allImages = TRAVEL_DATA.default.images;
    }

    div.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div>
                <h1>${activeTrip ? `Dashboard - ${activeTrip.name}` : "Let's travel."}</h1>
                <p style="color: var(--text-secondary);">${activeTrip ? "Welcome back. Let's get inspired." : "Create a trip to start your adventure."}</p>
            </div>
            ${activeTrip ? `
            <button class="btn btn-liquid-glass" id="shareTripBtn" style="display: flex; align-items: center; gap: 8px; padding: 10px 16px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                Share Trip
            </button>` : ''}
        </div>



        <div id="dashboard-container" class="glass" style="height: ${activeTrip ? '300px' : '70vh'};">
            <div id="bg-layer"></div>
            <div id="quote-layer" style="position: absolute; width: 100%; height: 100%;"></div>
        </div>
    `;

    setTimeout(() => {


        const shareBtn = div.querySelector('#shareTripBtn');
        if (shareBtn && activeTrip) {
            shareBtn.onclick = () => openShareModal(STATE.activeTripId);
        }
        const bgLayer = div.querySelector('#bg-layer');
        const quoteLayer = div.querySelector('#quote-layer');
        let imgIndex = 0;

        function showNextImageAndQuote() {
            if (!document.body.contains(div)) return; // Cleanup if navigated away

            const oldImages = bgLayer.querySelectorAll('.bg-image');
            oldImages.forEach(img => img.classList.remove('active'));

            const img = document.createElement('div');
            img.className = 'bg-image';
            img.style.backgroundImage = `url('${allImages[imgIndex % allImages.length]}')`;
            bgLayer.appendChild(img);
            
            void img.offsetWidth;
            img.classList.add('active');
            
            setTimeout(() => {
                oldImages.forEach(oldImg => {
                    if (bgLayer.contains(oldImg)) bgLayer.removeChild(oldImg);
                });
            }, 2000);

            const quoteText = allQuotes[Math.floor(Math.random() * allQuotes.length)];
            const quoteEl = document.createElement('div');
            quoteEl.className = 'floating-quote';
            quoteEl.innerText = quoteText;
            
            // Random but Safe Floating Logic
            const sizes = activeTrip ? ['1.2rem', '1.4rem', '1.6rem'] : ['1.8rem', '2.2rem', '2.6rem'];
            quoteEl.style.fontSize = sizes[Math.floor(Math.random() * sizes.length)];
            quoteEl.style.fontWeight = '400';
            quoteEl.style.width = 'fit-content';
            quoteEl.style.maxWidth = '50%';
            quoteEl.style.textShadow = '0 2px 15px rgba(0,0,0,0.8)';
            quoteEl.style.lineHeight = '1.4';
            quoteEl.style.position = 'absolute';

            // Randomly pick a side and a vertical position
            const side = Math.random() > 0.5 ? 'left' : 'right';
            const horizontalPos = Math.floor(Math.random() * 15) + 5; // 5% to 20% from edge
            const verticalPos = Math.floor(Math.random() * 60) + 10; // 10% to 70% from top
            
            quoteEl.style[side] = `${horizontalPos}%`;
            quoteEl.style.top = `${verticalPos}%`;
            quoteEl.style.textAlign = side;
            
            // Ensure flexbox doesn't interfere
            quoteLayer.style.display = 'block';
            
            quoteLayer.innerHTML = ''; 
            quoteLayer.appendChild(quoteEl);

            imgIndex++;
        }

        showNextImageAndQuote();
        dashboardInterval = setInterval(showNextImageAndQuote, 6000);
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
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Country</label>
                        <select id="expCountry" class="glass-input" style="width: 100%;" required>
                            <option value="">Select Country...</option>
                            ${COUNTRIES.map(c => `<option value="${c}">${c}</option>`).join('')}
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Value</label>
                        <input type="number" step="0.01" id="expValue" class="glass-input" style="width: 100%;" required>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Currency</label>
                        <select id="expCurrency" class="glass-input" style="width: 100%;" required>
                            <option value="">Select Currency...</option>
                            <option value="EUR">EUR (€)</option>
                            <option value="USD">USD ($)</option>
                            <option value="GBP">GBP (£)</option>
                            <option value="JPY">JPY (¥)</option>
                            <option value="CHF">CHF</option>
                            <option value="CAD">CAD ($)</option>
                            <option value="AUD">AUD ($)</option>
                            <option value="CNY">CNY (¥)</option>
                            <option value="BRL">BRL (R$)</option>
                            <option value="MXN">MXN ($)</option>
                            <option value="INR">INR (₹)</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Value in Euros (€)</label>
                        <input type="number" step="0.01" id="expEuroValue" class="glass-input" style="width: 100%;">
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 500;">Split Between (%)</label>
                        <div id="splitContainer" style="display: flex; flex-direction: column; gap: 8px;">
                            ${STATE.groups.map(p => `
                                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                                    <span style="font-weight: 500;">${p}</span>
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <input type="number" class="glass-input split-input" data-person="${p}" value="${(100/Math.max(1, STATE.groups.length)).toFixed(1)}" step="0.1" style="width: 70px; padding: 4px 8px; text-align: center;" required>
                                        <span style="color: var(--text-secondary); font-size: 0.9rem;">%</span>
                                    </div>
                                </div>
                            `).join('')}
                            ${STATE.groups.length === 0 ? '<span style="color: var(--text-secondary); font-size: 0.85rem;">Add companions in the personalisation section</span>' : ''}
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
            if (d.euroValue) div.querySelector('#expEuroValue').value = d.euroValue;
        }

        // Live Save Draft
        form.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('input', (e) => {
                const id = e.target.id;
                const val = e.target.value;
                if (id === 'expWho') STATE.draftExpense.who = val;
                if (id === 'expCategory') STATE.draftExpense.categoryId = val;
                if (id === 'expLabel') STATE.draftExpense.label = val;
                if (id === 'expDate') STATE.draftExpense.date = val;
                if (id === 'expCountry') STATE.draftExpense.country = val;
                if (id === 'expValue') STATE.draftExpense.value = val;
                if (id === 'expCurrency') STATE.draftExpense.currency = val;
                if (id === 'expEuroValue') STATE.draftExpense.euroValue = val;
                
                // Automatic Euro Conversion
                if (id === 'expValue' || id === 'expCurrency') {
                    const amount = parseFloat(div.querySelector('#expValue').value) || 0;
                    const currency = div.querySelector('#expCurrency').value;
                    const rate = CONVERSION_RATES[currency] || 1;
                    const euroVal = (amount * rate).toFixed(2);
                    div.querySelector('#expEuroValue').value = euroVal;
                    STATE.draftExpense.euroValue = euroVal;
                }
                
                saveState(); // Persist draft too
            });
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const splits = {};
            let totalSplit = 0;
            div.querySelectorAll('.split-input').forEach(input => {
                const val = parseFloat(input.value) || 0;
                splits[input.getAttribute('data-person')] = val;
                totalSplit += val;
            });
            
            if (STATE.groups.length > 0 && Math.abs(totalSplit - 100) > 0.5) {
                alert("Percentages must add up to exactly 100%");
                return;
            }

            const expense = {
                id: generateId(),
                tripId: STATE.activeTripId,
                who: div.querySelector('#expWho').value,
                categoryId: div.querySelector('#expCategory').value,
                label: div.querySelector('#expLabel').value,
                date: div.querySelector('#expDate').value,
                country: div.querySelector('#expCountry').value,
                value: parseFloat(div.querySelector('#expValue').value),
                currency: div.querySelector('#expCurrency').value.toUpperCase(),
                euroValue: parseFloat(div.querySelector('#expEuroValue').value) || 0,
                splits: splits
            };
            STATE.expenses.push(expense);
            
            // Clear draft
            STATE.draftExpense = { who: '', categoryId: '', label: '', date: '', country: '', value: '', currency: 'EUR', euroValue: '' };
            
            saveState();
            renderRecentExpenses(div.querySelector('#recentExpensesList'));
            form.reset();
        });
        
        renderRecentExpenses(div.querySelector('#recentExpensesList'));
    }, 0);

    return div;
}

function renderRecentExpenses(container) {
    if (!container) return;
    const tripExpenses = STATE.expenses.filter(e => e.tripId === STATE.activeTripId).reverse().slice(0, 5);
    
    if (tripExpenses.length === 0) {
        container.innerHTML = '<p>No recent expenses.</p>';
        return;
    }

    container.innerHTML = tripExpenses.map(e => {
        const cat = STATE.categories.find(c => c.id === e.categoryId);
        // Fallback for older data or missing euroValue
        const displayEuro = e.euroValue || (e.value * (CONVERSION_RATES[e.currency] || 1));
        
        return `
            <div style="padding: 12px; border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 1.05rem;">${cat ? cat.icon : ''} ${e.label}</strong>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">
                        <span>📍 ${e.country || 'Unknown'}</span> • <span>${e.date}</span> • <span>Paid by ${e.who}</span>
                    </div>
                </div>
                <div style="text-align: right; min-width: 100px;">
                    <div style="font-weight: 600; font-size: 1.1rem; color: var(--text-primary);">${e.value.toFixed(2)} ${e.currency}</div>
                    <div style="font-size: 0.9rem; color: var(--accent-blue); font-weight: 500; margin-top: 2px;">≈ €${displayEuro.toFixed(2)}</div>
                </div>
            </div>
        `;
    }).join('');
}

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
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent-blue);">💡 NOTE</span>
                <p style="margin: 5px 0 0; font-size: 0.85rem; color: var(--text-secondary);">We will try to auto-detect categories based on transaction names.</p>
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
                const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
                if (trip) {
                    trip.activeFormatId = val.split(':')[1];
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
                    let who, catName, label, date, country, value, currency, euroValue;

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
                        euroValue = parseFloat(get('euroValue')) || 0;
                    }

                    if (!euroValue || euroValue === 0) {
                        const rate = CONVERSION_RATES[currency] || 1;
                        euroValue = value * rate;
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
                        euroValue
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
    fetchHistoricalRates(uniqueDates).then(() => {
        // We don't force re-render here to avoid loops, 
        // but next time they open the tab it will be more accurate
    });

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
                const targetCacheKey = `${e.date}_EUR_${targetCurr}`;
                // We use the same cache logic for the target currency if available
                // (Note: Frankfurter fetchHistoricalRates stores curr -> EUR)
                // So if target is USD, we look for date_USD_EUR and take 1/rate
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
                        <option value="EUR" ${targetCurr === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                        <option value="USD" ${targetCurr === 'USD' ? 'selected' : ''}>USD ($)</option>
                        <option value="GBP" ${targetCurr === 'GBP' ? 'selected' : ''}>GBP (£)</option>
                        <option value="JPY" ${targetCurr === 'JPY' ? 'selected' : ''}>JPY (¥)</option>
                        <option value="CHF" ${targetCurr === 'CHF' ? 'selected' : ''}>CHF</option>
                        <option value="CAD" ${targetCurr === 'CAD' ? 'selected' : ''}>CAD ($)</option>
                        <option value="AUD" ${targetCurr === 'AUD' ? 'selected' : ''}>AUD ($)</option>
                        <option value="CNY" ${targetCurr === 'CNY' ? 'selected' : ''}>CNY (¥)</option>
                        <option value="BRL" ${targetCurr === 'BRL' ? 'selected' : ''}>BRL (R$)</option>
                        <option value="MXN" ${targetCurr === 'MXN' ? 'selected' : ''}>MXN ($)</option>
                        <option value="INR" ${targetCurr === 'INR' ? 'selected' : ''}>INR (₹)</option>
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
            <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Personalization</h1>
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
    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #ff3b30, #ff9500); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Settings</h1>
            <p>System configuration, data management, and import preferences.</p>
        </div>

        <div id="settingsMenu" class="grid-2" style="margin-bottom: 24px;">
            <div class="card glass card-glow-red" style="cursor: pointer;" onclick="window.showSettingsTab('reset')">
                <h2 class="card-title" style="color: #ff3b30;">Reset Data</h2>
                <p style="color: var(--text-secondary);">Wipe companions, trips, expenses, or factory reset the app.</p>
            </div>
            <div class="card glass card-glow-orange" style="cursor: pointer;" onclick="window.showSettingsTab('format')">
                <h2 class="card-title" style="color: #ff9500;">Format Options</h2>
                <p style="color: var(--text-secondary);">Configure Excel import mappings and global formats.</p>
            </div>
        </div>

        <div id="settingsContent" style="display: none;">
            <button class="btn btn-small btn-liquid-glass" style="margin-bottom: 20px;" onclick="window.showSettingsTab('menu')">&larr; Back to Settings</button>
            
            <div id="settingsReset" style="display: none;">
                <div class="grid-2" style="margin-bottom: 24px;">
                    <div class="card glass card-glow-blue">
                        <h2 class="card-title" style="color: #007aff;">Reset Companions</h2>
                        <p style="color: var(--text-secondary);">Delete all your travel companions and groups.</p>
                        <button id="resetGroupsBtn" class="btn-liquid-glass" style="margin-top: 10px; width: 100%;">Clear Companions</button>
                    </div>

                    <div class="card glass card-glow-orange">
                        <h2 class="card-title" style="color: #ff9500;">Reset Trips</h2>
                        <p style="color: var(--text-secondary);">Delete all your trips and their associated expenses.</p>
                        <button id="resetTripsBtn" class="btn-liquid-glass" style="margin-top: 10px;">Delete All Trips</button>
                    </div>

                    <div class="card glass" style="border-color: rgba(88, 86, 214, 0.3);">
                        <h2 class="card-title" style="color: #5856d6;">Reset Categories</h2>
                        <p style="color: var(--text-secondary);">Revert all custom categories to the default set.</p>
                        <button id="resetCatsBtn" class="btn-liquid-glass" style="margin-top: 10px;">Restore Defaults</button>
                    </div>

                    <div class="card glass" style="border-color: rgba(255, 204, 0, 0.3);">
                        <h2 class="card-title" style="color: #ffcc00;">Reset Expenses</h2>
                        <p style="color: var(--text-secondary);">Delete all expenses while keeping your trips and companions.</p>
                        <button id="resetExpensesBtn" class="btn-liquid-glass" style="margin-top: 10px;">Clear All Expenses</button>
                    </div>
                </div>

                <div class="card glass" style="border-color: rgba(255, 59, 48, 0.3); box-shadow: 0 0 20px rgba(255, 59, 48, 0.15);">
                    <h2 class="card-title" style="color: #ff3b30;">Danger Zone</h2>
                    <p>Blank slate. Permanently delete EVERYTHING and revert to original state.</p>
                    <button id="resetAppBtn" class="btn" style="background-color: #ff3b30; margin-top: 10px;">Erase All Data</button>
                </div>
            </div>

            <div id="settingsFormat" style="display: none;">
                <div class="card glass" style="border-left: 4px solid #ff9500; box-shadow: 0 0 15px rgba(255, 149, 0, 0.1);">
                    <h2 class="card-title" style="color: #ff9500;">Custom Excel Format Mapping</h2>
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">Build a custom format by assigning each app variable to an Excel column (A, B, C…). <strong>Required fields</strong> are marked with <span style="color:#ff3b30;">★</span>.</p>
                    
                    <!-- Mandatory field checklist -->
                    <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;">
                        ${(() => {
                            const MANDATORY = ['label','date','value','who'];
                            const mapped = new Set((STATE.customFormat || []).map(m => m.variable));
                            return MANDATORY.map(v => {
                                const done = mapped.has(v);
                                return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:0.8rem;font-weight:600;border:1px solid ${done ? 'rgba(52,199,89,0.4)' : 'rgba(255,59,48,0.4)'};background:${done ? 'rgba(52,199,89,0.08)' : 'rgba(255,59,48,0.08)'};color:${done ? '#34c759' : '#ff3b30'};">
                                    ${done ? '✅' : '★'} ${v}
                                </span>`;
                            }).join('');
                        })()}
                    </div>
                    
                    <!-- Current mappings table -->
                    <div style="margin-bottom: 20px;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                            <thead>
                                <tr style="border-bottom:1px solid var(--glass-border);">
                                    <th style="text-align:left; padding:8px 12px; color:var(--text-secondary); font-weight:600; font-size:0.8rem; text-transform:uppercase;">Variable</th>
                                    <th style="text-align:left; padding:8px 12px; color:var(--text-secondary); font-weight:600; font-size:0.8rem; text-transform:uppercase;">Column</th>
                                    <th style="width:40px;"></th>
                                </tr>
                            </thead>
                            <tbody id="mappingTableBody">
                                ${(() => {
                                    const MANDATORY = new Set(['label','date','value','who']);
                                    const fm = STATE.customFormat || [];
                                    if (fm.length === 0) return '<tr><td colspan="3" style="padding:16px 12px; color:var(--text-secondary); text-align:center;">No mappings yet. Add one below.</td></tr>';
                                    return [...fm].sort((a,b) => a.variable.localeCompare(b.variable)).map(m => `
                                        <tr style="border-bottom:1px solid var(--glass-border);">
                                            <td style="padding:10px 12px; font-weight:600;">${MANDATORY.has(m.variable) ? '<span style="color:#ff3b30;">★</span> ' : ''}${m.variable}</td>
                                            <td style="padding:10px 12px; color:var(--accent-blue); font-weight:700;">${m.column}</td>
                                            <td style="padding:10px 12px; text-align:center;">
                                                <button onclick="window.removeFormatMapping('${m.variable}')" style="background:none;border:none;color:#ff3b30;cursor:pointer;font-size:1.1rem;font-weight:700;" title="Remove">✕</button>
                                            </td>
                                        </tr>
                                    `).join('');
                                })()}
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Add new mapping -->
                    <div style="display:flex; gap:12px; align-items:flex-end; margin-bottom:24px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:180px;">
                            <label style="display:block; font-size:0.8rem; margin-bottom:6px; font-weight:600;">App Variable</label>
                            <select id="mapVarSelect" class="glass-input" style="width:100%;">
                                <option value="">Select variable…</option>
                                ${(() => {
                                    const MANDATORY = ['label','date','value','who'];
                                    const OPTIONAL = ['country','categoryId','currency','euroValue'];
                                    const used = new Set((STATE.customFormat || []).map(m => m.variable));
                                    const mandOpts = MANDATORY.filter(v => !used.has(v)).map(v => `<option value="${v}">★ ${v} (required)</option>`).join('');
                                    const optOpts = OPTIONAL.filter(v => !used.has(v)).map(v => `<option value="${v}">${v}</option>`).join('');
                                    return mandOpts + (mandOpts && optOpts ? '' : '') + optOpts;
                                })()}
                            </select>
                        </div>
                        <div style="flex:1; min-width:120px;">
                            <label style="display:block; font-size:0.8rem; margin-bottom:6px; font-weight:600;">Excel Column</label>
                            <select id="mapColSelect" class="glass-input" style="width:100%;">
                                <option value="">Select column…</option>
                                ${(() => {
                                    const usedCols = new Set((STATE.customFormat || []).map(m => m.column));
                                    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
                                        .filter(c => !usedCols.has(c))
                                        .map(c => `<option value="${c}">${c}</option>`).join('');
                                })()}
                            </select>
                        </div>
                        <button class="btn" onclick="window.addFormatMapping()" style="white-space:nowrap;">+ Add</button>
                    </div>
                    
                    <!-- Save Format -->
                    <div style="border-top:1px solid var(--glass-border); padding-top:20px;">
                        <h3 style="font-size:0.95rem; margin-bottom:12px;">Save This Format</h3>
                        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:12px;">Once all <span style="color:#ff3b30;">★ required fields</span> are mapped, give this format a name and save it. It will appear in the Upload section. Max 5 saved formats.</p>
                        <div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
                            <div style="flex:1; min-width:200px;">
                                <label style="display:block; font-size:0.8rem; margin-bottom:6px; font-weight:600;">Format Name</label>
                                <input type="text" id="formatNameInput" class="glass-input" placeholder="e.g. My Bank Export" style="width:100%;">
                            </div>
                            <button class="btn" onclick="window.saveCustomFormat()" style="background:linear-gradient(135deg,#ff9500,#ff3b30); white-space:nowrap;">💾 Save Format</button>
                        </div>
                    </div>
                    
                    <!-- Existing saved formats -->
                    ${(() => {
                        const sf = STATE.savedFormats || [];
                        if (sf.length === 0) return '';
                        return `
                        <div style="border-top:1px solid var(--glass-border); padding-top:20px; margin-top:20px;">
                            <h3 style="font-size:0.95rem; margin-bottom:12px;">Saved Formats (${sf.length}/5)</h3>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${sf.map(f => `
                                    <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:rgba(255,149,0,0.06); border:1px solid rgba(255,149,0,0.2); border-radius:10px;">
                                        <div>
                                            <strong>${f.name}</strong>
                                            <span style="font-size:0.78rem; color:var(--text-secondary); margin-left:8px;">${f.mappings.length} fields</span>
                                        </div>
                                        <button onclick="window.deleteSavedFormat('${f.id}')" style="background:none;border:none;color:#ff3b30;cursor:pointer;font-size:1rem;font-weight:700;" title="Delete">✕</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>`;
                    })()}
                </div>
            </div>
        </div>
    `;

    setTimeout(() => {
        const rGrp = div.querySelector('#resetGroupsBtn');
        if (rGrp) rGrp.addEventListener('click', () => {
            if (confirm("Clear all travel companions?")) {
                STATE.groups = [];
                saveState();
                navigate('settings');
            }
        });

        const rExp = div.querySelector('#resetExpensesBtn');
        if (rExp) rExp.addEventListener('click', () => {
            if (confirm("Delete all expenses across all trips?")) {
                STATE.expenses = [];
                STATE.draftExpense = {
                    who: '', categoryId: '', label: '', date: '', country: '', value: 0, currency: 'EUR', euroValue: ''
                };
                saveState();
                navigate('settings');
            }
        });

        div.querySelector('#resetTripsBtn').addEventListener('click', () => {
            if (confirm("Delete all trips and expenses?")) {
                STATE.trips = [];
                STATE.activeTripId = null;
                STATE.expenses = [];
                saveState();
                navigate('home');
            }
        });

        div.querySelector('#resetCatsBtn').addEventListener('click', () => {
            if (confirm("Revert categories to defaults?")) {
                STATE.categories = [
                    { id: '1', name: 'Hotel', icon: '🏨', color: '#ff9500' },
                    { id: '2', name: 'Food', icon: '🍷', color: '#ff3b30' },
                    { id: '3', name: 'Flight', icon: '✈️', color: '#007aff' },
                    { id: '4', name: 'Transport', icon: '🚕', color: '#5856d6' },
                    { id: '5', name: 'Activities', icon: '🎟️', color: '#34c759' }
                ];
                saveState();
                navigate('settings');
            }
        });

        div.querySelector('#resetAppBtn').addEventListener('click', () => {
            if (confirm("Are you ABSOLUTELY sure? This will reset EVERYTHING (Trips, Expenses, Companions, Categories).")) {
                STATE.trips = [];
                STATE.activeTripId = null;
                STATE.expenses = [];
                STATE.groups = [];
                STATE.categories = [
                    { id: '1', name: 'Hotel', icon: '🏨', color: '#ff9500' },
                    { id: '2', name: 'Food', icon: '🍷', color: '#ff3b30' },
                    { id: '3', name: 'Flight', icon: '✈️', color: '#007aff' },
                    { id: '4', name: 'Transport', icon: '🚕', color: '#5856d6' },
                    { id: '5', name: 'Activities', icon: '🎟️', color: '#34c759' }
                ];
                saveState();
                navigate('home');
            }
        });

        // No save button needed — mappings are saved immediately on add/remove
    }, 0);

    return div;
}

window.showSettingsTab = (tab) => {
    document.getElementById('settingsMenu').style.display = tab === 'menu' ? 'grid' : 'none';
    document.getElementById('settingsContent').style.display = tab === 'menu' ? 'none' : 'block';
    
    if (tab !== 'menu') {
        document.getElementById('settingsReset').style.display = tab === 'reset' ? 'block' : 'none';
        document.getElementById('settingsFormat').style.display = tab === 'format' ? 'block' : 'none';
    }
};

window.addFormatMapping = () => {
    const variable = document.getElementById('mapVarSelect')?.value;
    const column   = document.getElementById('mapColSelect')?.value;
    if (!variable || !column) return alert('Please select both a variable and a column.');
    STATE.customFormat = STATE.customFormat || [];
    // Prevent duplicates
    if (STATE.customFormat.some(m => m.variable === variable)) return alert(`"${variable}" is already mapped. Delete it first.`);
    if (STATE.customFormat.some(m => m.column === column)) return alert(`Column "${column}" is already assigned to another variable. Choose a different column.`);
    STATE.customFormat.push({ variable, column });
    STATE.customFormat.sort((a, b) => a.variable.localeCompare(b.variable));
    saveState();
    navigate('settings');
    setTimeout(() => window.showSettingsTab('format'), 50);
};

window.removeFormatMapping = (variable) => {
    STATE.customFormat = (STATE.customFormat || []).filter(m => m.variable !== variable);
    saveState();
    navigate('settings');
    setTimeout(() => window.showSettingsTab('format'), 50);
};

window.saveCustomFormat = () => {
    const MANDATORY = ['label', 'date', 'value', 'who'];
    const fmt = STATE.customFormat || [];
    const mapped = new Set(fmt.map(m => m.variable));
    const missing = MANDATORY.filter(v => !mapped.has(v));
    if (missing.length > 0) {
        alert(`Please map all required fields first:\n• ${missing.join('\n• ')}`);
        return;
    }
    const name = (document.getElementById('formatNameInput')?.value || '').trim();
    if (!name) { alert('Please give this format a name.'); return; }
    STATE.savedFormats = STATE.savedFormats || [];
    if (STATE.savedFormats.length >= 5) { alert('Maximum 5 saved formats reached. Delete one first.'); return; }
    if (STATE.savedFormats.some(f => f.name.toLowerCase() === name.toLowerCase())) { alert('A format with that name already exists.'); return; }
    STATE.savedFormats.push({ id: generateId(), name, mappings: [...fmt] });
    STATE.customFormat = []; // Clear the draft
    saveState();
    navigate('settings');
    setTimeout(() => window.showSettingsTab('format'), 50);
};

window.deleteSavedFormat = (id) => {
    if (!confirm('Delete this saved format?')) return;
    STATE.savedFormats = (STATE.savedFormats || []).filter(f => f.id !== id);
    // Remove from any trip that had it active
    STATE.trips.forEach(t => { if (t.activeFormatId === id) delete t.activeFormatId; });
    saveState();
    navigate('settings');
    setTimeout(() => window.showSettingsTab('format'), 50);
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

    // Grey out sidebar items if no trips exist
    document.querySelectorAll('.sidebar-item').forEach(item => {
        const page = item.dataset.page;
        const allowed = ['home', 'settings', 'personalization', 'friends']; 
        // User said "all other tabs (just tabs, not the menu sections) are greyed out"
        // I'll interpret "tabs" as specific trip-related tools: Budgets, Collections, Settlements, Upload
        const tripDependent = ['budgets', 'collections', 'settlement', 'upload']; 
        
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
        
        // Capture related data for deep viewing in archives
        trip.expenses = (STATE.expenses || []).filter(e => e.tripId === trip.id);
        trip.itinerary = (STATE.activities || []).filter(a => a.tripId === trip.id);
        trip.photos = (STATE.photos || []).filter(p => p.tripId === trip.id);

        // Remove from active state
        STATE.expenses = (STATE.expenses || []).filter(e => e.tripId !== trip.id);
        STATE.activities = (STATE.activities || []).filter(a => a.tripId !== trip.id);
        STATE.photos = (STATE.photos || []).filter(p => p.tripId !== trip.id);

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
        const color = pct >= 100 ? '#ff3b30' : (pct > 80 ? '#ff9500' : '#34c759');
        const titleParts = [];
        if (b.tripId && b.tripId !== 'all') titleParts.push(STATE.trips.find(t=>t.id===b.tripId)?.name || 'Trip');
        if (b.categoryId && b.categoryId !== 'all') titleParts.push(STATE.categories.find(c=>c.id===b.categoryId)?.name || 'Category');
        if (b.user && b.user !== 'all') titleParts.push(b.user);
        
        const title = titleParts.length > 0 ? titleParts.join(' · ') : 'General Budget';

        return `
            <div class="card glass card-glow-blue" style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <strong style="font-size:1.1rem;">${title}</strong>
                    <button class="btn-small" style="background:none;color:#ff3b30;padding:0;min-width:auto;border:none;cursor:pointer;font-weight:600;" onclick="window.deleteBudget('${b.id}')">Delete</button>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.9rem;">
                    <span>Spent: <strong>${spent.toFixed(2)}€</strong></span>
                    <span style="color:var(--text-secondary);">Target: ${b.amount.toFixed(2)}€</span>
                </div>
                <div style="height:10px; background:var(--glass-border); border-radius:5px; overflow:hidden;">
                    <div style="height:100%; width:${pct}%; background:${color}; transition:width 0.3s;"></div>
                </div>
            </div>
        `;
    }).join('') : '<p style="color:var(--text-secondary); text-align:center;">No budgets set yet.</p>';

    div.innerHTML = `
        <div class="ai-page-header" style="background: linear-gradient(135deg, rgba(52, 199, 89, 0.1), rgba(0, 113, 227, 0.1));">
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
            
            <div>
                <h2 class="card-title" style="margin-bottom:16px;">Active Tracking</h2>
                ${activeBudgetsHtml}
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
        <div class="ai-page-header" style="background: linear-gradient(135deg, rgba(255, 149, 0, 0.1), rgba(255, 59, 48, 0.1));">
            <h1 style="background: linear-gradient(135deg, #ff9500, #ff3b30); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
            <p>Your archived travel memories and trip photos.</p>
        </div>
        
        <div class="trip-nav glass" style="margin-top: 24px;">
            <button class="trip-tab active" id="tabArchived">Archived Trips</button>
            <button class="trip-tab" id="tabPhotos">Trip Photos</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${archived.length > 0 ? archived.map(t => `
                    <div class="card glass card-glow-orange" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
                        <div style="cursor: pointer; flex: 1;" onclick="window.viewArchivedDetails('${t.id}')">
                            <h3 style="margin: 0;">${t.name}</h3>
                            <p style="color: var(--text-secondary); margin: 4px 0 0 0;">${t.country} · ${t.expenses?.length || 0} expenses</p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn-liquid-glass btn-small" onclick="window.viewArchivedDetails('${t.id}')">View</button>
                            <button class="btn btn-small" onclick="window.restoreTrip('${t.id}')" style="background: var(--accent-blue);">Restore</button>
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

        <div id="colPhotos" class="col-tab-content" style="display: none;">
            <div class="card glass card-glow-purple" style="margin-top: 16px; padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 class="card-title" style="margin: 0;">Photo Gallery</h2>
                    <select id="photoFilter" class="glass-input" style="width: 200px;">
                        <option value="">All Trips</option>
                        ${STATE.trips.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                    </select>
                </div>
                <div id="galleryGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px;"></div>
            </div>
        </div>
    `;

    setTimeout(() => {
        const tabArchived = div.querySelector('#tabArchived');
        const tabPhotos = div.querySelector('#tabPhotos');
        const contentArchived = div.querySelector('#colArchived');
        const contentPhotos = div.querySelector('#colPhotos');

        tabArchived.onclick = () => {
            tabArchived.classList.add('active');
            tabPhotos.classList.remove('active');
            contentArchived.style.display = 'block';
            contentPhotos.style.display = 'none';
        };

        tabPhotos.onclick = () => {
            tabPhotos.classList.add('active');
            tabArchived.classList.remove('active');
            contentArchived.style.display = 'none';
            contentPhotos.style.display = 'block';
            renderGallery();
        };

        function renderGallery() {
            const grid = div.querySelector('#galleryGrid');
            const filterId = div.querySelector('#photoFilter').value;
            const photos = (STATE.photos || []).filter(p => !filterId || p.tripId === filterId);
            
            grid.innerHTML = photos.length > 0 ? photos.map(p => `
                <div style="position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; border: 1px solid var(--glass-border);">
                    <img src="${p.url}" style="width: 100%; height: 100%; object-fit: cover;">
                    <button onclick="window.deletePhoto('${p.id}')" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.5); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 12px;">&times;</button>
                </div>
            `).join('') : '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px;">No photos found for this trip.</p>';
        }

        div.querySelector('#photoFilter').onchange = renderGallery;
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
    const trip = STATE.archivedTrips.find(t => t.id === id);
    if (!trip) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    
    let totalSpent = 0;
    (trip.expenses || []).forEach(e => totalSpent += parseFloat(e.euroValue || 0));

    modal.innerHTML = `
        <div class="card glass card-glow-orange" style="width: 600px; max-height: 80vh; overflow-y: auto; padding: 32px; border-radius: 24px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                <div>
                    <h2 style="margin: 0; font-size: 1.8rem; background: linear-gradient(135deg, #ff9500, #ff3b30); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${trip.name}</h2>
                    <p style="color: var(--text-secondary); margin-top: 4px;">Archived Adventure · ${trip.country}</p>
                </div>
                <button onclick="this.closest('.modal-overlay').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">&times;</button>
            </div>

            <div class="grid-2" style="margin-bottom: 24px;">
                <div class="card glass card-glow-green" style="padding: 16px; text-align: center; border-radius: 16px;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 4px;">Total Spent</div>
                    <div style="font-size: 1.5rem; font-weight: 800; color: #34c759;">€${totalSpent.toFixed(2)}</div>
                </div>
                <div class="card glass card-glow-blue" style="padding: 16px; text-align: center; border-radius: 16px;">
                    <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 800; letter-spacing: 0.05em; margin-bottom: 4px;">Expenses</div>
                    <div style="font-size: 1.5rem; font-weight: 800; color: var(--accent-blue);">${trip.expenses?.length || 0}</div>
                </div>
            </div>

            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 1.1rem; margin-bottom: 12px; font-weight: 700;">Itinerary Summary</h3>
                ${trip.itinerary?.length > 0 ? `
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        ${trip.itinerary.map(a => `
                            <div style="display: flex; justify-content: space-between; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px solid var(--glass-border);">
                                <span style="font-weight: 600;">📍 ${a.name || 'Activity'}</span>
                                <span style="color: var(--text-secondary); font-size: 0.85rem;">${a.date || ''}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : '<p style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No itinerary saved for this trip.</p>'}
            </div>

            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 1.1rem; margin-bottom: 12px; font-weight: 700;">Recent Expenses</h3>
                <table class="liquid-table" style="width: 100%;">
                    <thead>
                        <tr>
                            <th style="text-align: left;">Label</th>
                            <th style="text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(trip.expenses || []).slice(0, 5).map(e => `
                            <tr>
                                <td style="font-weight: 500;">${e.label}</td>
                                <td style="text-align: right; font-weight: 700;">€${parseFloat(e.euroValue || 0).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <button class="btn btn-liquid-glass" style="width: 100%;" onclick="this.closest('.modal-overlay').remove()">Close Overview</button>
        </div>
    `;
    document.body.appendChild(modal);
};

window.restoreTrip = (id) => {
    const index = STATE.archivedTrips.findIndex(t => t.id === id);
    if (index !== -1) {
        const trip = STATE.archivedTrips.splice(index, 1)[0];
        if (trip.expenses) STATE.expenses.push(...trip.expenses);
        if (trip.itinerary) STATE.activities.push(...trip.itinerary);
        if (trip.photos) STATE.photos.push(...trip.photos);
        
        STATE.trips.push(trip);
        STATE.activeTripId = trip.id;
        saveState();
        updateTripSelector();
        navigate('home');
    }
};

// --- Page: Plan with AI ---
let leafletMap = null;
function renderAI() {
    const div = document.createElement('div');
    const activeTrip = STATE.trips.find(t => t.id === STATE.activeTripId);

    if (!activeTrip) {
        div.innerHTML = `
            <div class="ai-page-header" style="background: linear-gradient(135deg, rgba(0, 113, 227, 0.1), rgba(155, 89, 182, 0.1));">
                <h1 style="background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                <p>Your AI-powered travel planner</p>
            </div>
            <div style="position: relative; width: 100%; height: calc(100vh - 200px); min-height: 480px; border-radius: 24px; overflow: hidden; border: 1px solid var(--glass-border); margin-top: 24px;">
                <div id="emptyMap" style="width:100%; height:100%;"></div>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);backdrop-filter:blur(8px);">
                    <div style="text-align:center;color:white;padding:40px;max-width:480px;">
                        <div style="font-size:4rem;margin-bottom:24px;">🌍</div>
                        <h2 style="margin-bottom:12px;">Start your adventure</h2>
                        <p style="font-size:1.1rem;opacity:0.9;line-height:1.6;">Create a trip first to start planning your perfect itinerary with AI.</p>
                        <button onclick="document.getElementById('newTripBtn').click()" class="btn" style="margin-top:24px; background:white; color:var(--accent-blue);">+ Create a Trip</button>
                    </div>
                </div>
            </div>`;
        return div;
    }

    const tripCountry = activeTrip.country || '';
    const tourismTypes = [
        { icon: '🏛️', label: 'Culture' }, { icon: '🍽️', label: 'Food' },
        { icon: '🌿', label: 'Nature' }, { icon: '🏄', label: 'Adventure' },
        { icon: '🌙', label: 'Nightlife' }, { icon: '🎒', label: 'Budget' }
    ];

    div.innerHTML = `
        <div class="ai-page-header" style="background: linear-gradient(135deg, rgba(0, 113, 227, 0.1), rgba(155, 89, 182, 0.1));">
            <h1 style="background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
            <p>Planning your trip to <strong>${tripCountry}</strong></p>
        </div>

        <div style="display:grid;grid-template-columns:360px 1fr;gap:24px;margin-top:24px;margin-bottom:32px;">
            <div style="display:flex;flex-direction:column;gap:16px;">
                <div class="card glass card-glow-blue" style="padding:20px;">
                    <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:14px;letter-spacing:0.05em;">🧭 Travel Style</h2>
                    <div style="display:flex;flex-wrap:wrap;gap:8px;">
                        ${tourismTypes.map(t => `<button class="tourism-tag" data-type="${t.label}" style="padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: white; cursor: pointer; font-size: 0.85rem;">${t.icon} ${t.label}</button>`).join('')}
                    </div>
                </div>
                <div class="card glass card-glow-blue" style="padding:20px;">
                    <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.05em;">📝 Requirements</h2>
                    <textarea id="aiExtraContext" class="glass-input" rows="3" style="width:100%; resize:none; font-size:0.9rem;" placeholder="e.g. Vegetarian friendly, no walking more than 2km..."></textarea>
                </div>
                <button id="generateBtn" class="ai-generate-btn" style="width:100%; padding: 16px; border-radius: 16px; font-weight: 800;">✦ Generate Itinerary</button>
            </div>

            <div style="position:sticky;top:80px;height:500px;">
                <div class="card glass card-glow-blue" style="padding:0;overflow:hidden;height:100%;border-radius:24px;position:relative;border:1px solid var(--glass-border);">
                    <div id="aiLeafletMap" style="width:100%;height:100%;"></div>
                </div>
            </div>
        </div>
        <div id="itineraryOutput"></div>`;

    setTimeout(() => {
        div.querySelectorAll('.tourism-tag').forEach(btn => btn.onclick = () => btn.classList.toggle('selected'));
        if (typeof L !== 'undefined') {
            if (leafletMap) { leafletMap.remove(); leafletMap = null; }
            leafletMap = L.map('aiLeafletMap', { zoomControl: true, attributionControl: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(leafletMap);
        }

        div.querySelector('#generateBtn').onclick = () => {
            const outputEl = div.querySelector('#itineraryOutput');
            outputEl.innerHTML = `<div class="ai-loading-spinner"><div class="spinner-ring"></div><div style="font-weight:600; margin-top: 16px;">Consulting AI...</div></div>`;
            setTimeout(() => {
                outputEl.innerHTML = `<div class="card glass card-glow-purple" style="padding:40px; text-align:center; border-radius: 24px;">
                    <h3 style="margin-bottom: 12px;">Itinerary Generation</h3>
                    <p style="color: var(--text-secondary); line-height: 1.6;">Full itinerary for ${tripCountry} would be generated here using Gemini API.</p>
                </div>`;
            }, 1500);
        };
    }, 0);

    return div;
}

// --- Page: Settlements ---
function renderSettlement() {
    const div = document.createElement('div');
    const activeTrip = STATE.activeTripId ? STATE.trips.find(t => t.id === STATE.activeTripId) : null;
    
    if (!activeTrip) {
        div.innerHTML = `
            <div class="ai-page-header" style="background: linear-gradient(135deg, rgba(72, 209, 232, 0.1), rgba(0, 113, 227, 0.1));">
                <h1 style="background: linear-gradient(135deg, #48d1e8, #007aff); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                <p>Calculate who owes what and settle up fairly.</p>
            </div>
            <div class="card glass card-glow-teal" style="text-align: center; padding: 60px; margin-top: 24px;">
                <div style="font-size: 4rem; margin-bottom: 20px;">⚖️</div>
                <h2>No active trip selected</h2>
                <p style="color: var(--text-secondary);">Select a trip to calculate smart settlements and balances.</p>
            </div>
        `;
        return div;
    }

    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId);
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

    div.innerHTML = `
        <div class="ai-page-header" style="background: linear-gradient(135deg, rgba(72, 209, 232, 0.1), rgba(0, 113, 227, 0.1));">
            <h1 style="background: linear-gradient(135deg, #48d1e8, #007aff); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
            <p>Balanced settlements for <strong>${activeTrip.name}</strong></p>
        </div>

        <div class="grid-2" style="margin-top: 24px;">
            <div class="card glass card-glow-teal">
                <h2 class="card-title">Net Balances</h2>
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
                                <span style="font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">${d.from} owes</span>
                                <div style="font-weight: 700; font-size: 1.1rem;">${d.to}</div>
                            </div>
                            <div style="font-size: 1.2rem; font-weight: 700; color: var(--accent-blue);">€${d.amount.toFixed(2)}</div>
                        </div>
                    `).join('') : '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">All settled up! 🥂</p>'}
                </div>
            </div>
        </div>
    `;
    return div;
}

// --- Social & Friends (Simplified) ---
function renderFriends() {
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="ai-page-header" style="background: linear-gradient(135deg, rgba(0, 122, 255, 0.1), rgba(88, 86, 214, 0.1));">
            <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Friends</h1>
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

function openShareModal() {
    alert("Sharing feature is being optimized. Check back soon!");
}

// --- Trip Creation ---
function openNewTripModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="card glass" style="width: 450px; padding: 32px; border-radius: 24px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
            <h2 style="margin-top: 0; font-size: 1.8rem; letter-spacing: -0.03em;">Create New Adventure 🌍</h2>
            <p style="color: var(--text-secondary); margin-bottom: 24px;">Where are we heading next?</p>
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 6px;">Trip Name</label>
                    <input type="text" id="modalTripName" class="glass-input" placeholder="e.g. Summer in Tuscany" style="width: 100%;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin-bottom: 6px;">Country</label>
                    <input type="text" id="modalTripCountry" class="glass-input" placeholder="e.g. Italy" style="width: 100%;">
                </div>
                <div style="display: flex; gap: 12px; margin-top: 12px;">
                    <button id="modalCancelBtn" class="btn btn-liquid-glass" style="flex: 1;">Cancel</button>
                    <button id="modalCreateBtn" class="btn" style="flex: 2; background: var(--accent-blue); color: white;">Create Trip</button>
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
}

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

