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
    photos: []
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
    collections: renderCollections
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
    if (!peopleOptions) peopleOptions = `<option value="">No people added (Go to Groups)</option>`;

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
                euroValue: parseFloat(div.querySelector('#expEuroValue').value) || 0
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
                <div class="switch-container">
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Custom Template</span>
                    <label class="switch">
                        <input type="checkbox" id="formatSwitch">
                        <span class="slider"></span>
                    </label>
                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">Popular Formats</span>
                </div>
            </div>

            <div id="templateSection">
                <p>Upload your .xlsx file here. Ensure it matches the 8-column template:</p>
                <table class="liquid-table" style="margin-bottom: 12px;">
                    <thead>
                        <tr><th>Who Paid</th><th>Category</th><th>Label</th><th>Date</th><th>Country</th><th>Value</th><th>Currency</th><th>Euros (€)</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Alice</td><td>Food</td><td>Sushi</td><td>2024-05-12</td><td>Japan</td><td>5000</td><td>JPY</td><td>31.50</td></tr>
                    </tbody>
                </table>
                <button id="editMappingBtn" class="btn btn-small btn-liquid-glass">⚙️ Edit Column Mapping</button>
            </div>

            <!-- Mapping Editor Modal (Hidden by default) -->
            <div id="mappingEditor" style="display: none; padding: 20px; background: rgba(0,0,0,0.05); border-radius: 12px; margin-top: 20px; border: 1px dashed var(--accent-blue);">
                <h3 style="margin-bottom: 15px;">Edit Column Mapping</h3>
                <div class="grid-2" id="mappingInputs"></div>
                <div style="margin-top: 15px; display: flex; gap: 10px;">
                    <button id="saveMappingBtn" class="btn btn-small">Save Mapping</button>
                    <button id="cancelMappingBtn" class="btn btn-small btn-liquid-glass">Cancel</button>
                </div>
            </div>

            <div id="popularSection" style="display: none;">
                <p>Select your export source to automatically map columns:</p>
                <select id="popularFormat" class="glass-input" style="width: 100%; margin-bottom: 20px;">
                    <option value="tricount">Tricount Export (CSV/XLSX)</option>
                    <option value="splitwise">Splitwise Export</option>
                    <option value="revolut">Revolut Monthly Statement</option>
                </select>
                <div style="padding: 16px; background: rgba(0,113,227,0.05); border-radius: 12px; border: 1px solid rgba(0,113,227,0.1); margin-bottom: 20px;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--accent-blue);">💡 NOTE</span>
                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: var(--text-secondary);">We will try to auto-detect categories based on transaction names.</p>
                </div>
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

        const formatSwitch = div.querySelector('#formatSwitch');
        const popularSection = div.querySelector('#popularSection');

        formatSwitch.addEventListener('change', (e) => {
            if (e.target.checked) {
                popularSection.style.display = 'block';
            } else {
                popularSection.style.display = 'none';
            }
        });


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

                    // Generate preview
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
            const isPopular = div.querySelector('#formatSwitch').checked;
            const popularFormat = div.querySelector('#popularFormat').value;
            
            if (!parsedRows) {
                statusDiv.innerText = "Please select a valid file to process.";
                statusDiv.style.color = "red";
                return;
            }

            try {
                let added = 0;
                
                // Helper to get index from header
                const getIdx = (name) => currentHeader.findIndex(h => String(h || '').toLowerCase() === String(name || '').toLowerCase());

                parsedRows.forEach(row => {
                    let who, catName, label, date, country, value, currency, euroValue;

                    if (isPopular) {
                        if (popularFormat === 'tricount') {
                            // Mapping: Title(0), Amount(1), Currency(2), Date(3), Category(4), Paid by(5)
                            label = String(row[0] || '').trim();
                            value = parseFloat(row[1]) || 0;
                            currency = String(row[2] || 'EUR').trim().toUpperCase();
                            date = String(row[3] || '').trim();
                            catName = String(row[4] || '').trim();
                            who = String(row[5] || '').trim();
                            country = 'Unknown';
                        } else if (popularFormat === 'splitwise') {
                            // Date(0), Description(1), Category(2), Cost(3), Currency(4)
                            date = String(row[0] || '').trim();
                            label = String(row[1] || '').trim();
                            catName = String(row[2] || '').trim();
                            value = parseFloat(row[3]) || 0;
                            currency = String(row[4] || 'EUR').trim().toUpperCase();
                            who = 'Me'; // Placeholder
                            country = 'Unknown';
                        }
                    } else {
                        // Dynamic Custom Mapping
                        const m = STATE.excelMapping;
                        who = String(row[getIdx(m.who)] || '').trim();
                        catName = String(row[getIdx(m.categoryId)] || '').trim();
                        label = String(row[getIdx(m.label)] || '').trim();
                        date = String(row[getIdx(m.date)] || '').trim();
                        country = String(row[getIdx(m.country)] || 'Unknown').trim();
                        value = parseFloat(row[getIdx(m.value)]) || 0;
                        currency = String(row[getIdx(m.currency)] || 'EUR').trim().toUpperCase();
                        euroValue = parseFloat(row[getIdx(m.euroValue)]) || 0;
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
// --- Page: Personalization ---
function renderPersonalization() {
    const div = document.createElement('div');
    
    let catsHtml = STATE.categories.map(c => `
        <div style="display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px solid var(--glass-border)">
            <span>${c.icon} ${c.name}</span>
            <span style="color: ${c.color}">●</span>
        </div>
    `).join('');

    let groupsHtml = STATE.groups.map(g => `
        <div style="padding: 8px 0; border-bottom: 1px solid var(--glass-border)">
            ${g}
        </div>
    `).join('');

    div.innerHTML = `
        <h1>Personalization</h1>
        <div class="grid-2">
            <!-- Existing Categories & Companions Cards -->
            <div class="card glass" style="border-left: 4px solid var(--accent-blue); box-shadow: 0 0 15px rgba(0, 113, 227, 0.1);">
                <h2 class="card-title" style="color: var(--accent-blue);">Manage Categories</h2>
                ${catsHtml}
                <div style="margin-top: 20px;">
                    <p style="margin-bottom: 8px;">Add New Category:</p>
                    <div style="display:flex; gap: 10px;">
                        <select id="catIcon" class="glass-input" style="width: 80px;">
                            <option value="🍷">🍷</option><option value="🏨">🏨</option><option value="✈️">✈️</option><option value="🚕">🚕</option><option value="🍕">🍕</option>
                            <option value="🎟️">🎟️</option><option value="🛍️">🛍️</option><option value="🍦">🍦</option><option value="🥐">🥐</option><option value="🏛️">🏛️</option>
                            <option value="🏖️">🏖️</option><option value="🎢">🎢</option><option value="🚠">🚠</option><option value="🚌">🚌</option><option value="🚆">🚆</option>
                            <option value="🌍">🌍</option><option value="🗺️">🗺️</option><option value="🎒">🎒</option><option value="📸">📸</option><option value="☕">☕</option>
                        </select>
                        <input type="text" id="catName" class="glass-input" placeholder="Name" style="flex:1;">
                        <input type="color" id="catColor" class="glass-input" value="#ff3b30">
                        <button id="addCatBtn" class="btn btn-small">Add</button>
                    </div>
                </div>
            </div>

            <div class="card glass" style="border-left: 4px solid var(--accent-blue); box-shadow: 0 0 15px rgba(0, 113, 227, 0.1);">
                <h2 class="card-title" style="color: var(--accent-blue);">Manage Companions</h2>
                <p style="color: var(--text-secondary); margin-bottom: 16px;">Add the people who usually pay for expenses.</p>
                <div style="max-height: 300px; overflow-y: auto; margin-bottom: 16px;">
                    ${groupsHtml || '<p>No people added yet.</p>'}
                </div>
                <div style="margin-top: 20px;">
                    <p style="margin-bottom: 8px;">Add New Person:</p>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="newPerson" class="glass-input" style="flex: 1;" placeholder="Enter name...">
                        <button id="addPersonBtn" class="btn btn-small">Add</button>
                    </div>
                </div>
            </div>
        </div>

        <div class="card glass" style="margin-top: 24px; border-left: 4px solid #ff9500; box-shadow: 0 0 15px rgba(255, 149, 0, 0.1);">
            <h2 class="card-title" style="color: #ff9500;">Excel Import Mapping</h2>
            <p style="color: var(--text-secondary); margin-bottom: 20px;">Define how your Excel columns map to our internal data structure. This applies globally to all imports.</p>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        div.querySelector('#addCatBtn').addEventListener('click', () => {
            const icon = div.querySelector('#catIcon').value;
            const name = div.querySelector('#catName').value;
            const color = div.querySelector('#catColor').value;
            if(name) {
                STATE.categories.push({ id: generateId(), name, icon, color });
                saveState();
                navigate('personalization'); // Re-render
            }
        });

        div.querySelector('#addPersonBtn').addEventListener('click', () => {
            const name = div.querySelector('#newPerson').value.trim();
            if (name && !STATE.groups.includes(name)) {
                STATE.groups.push(name);
                saveState();
                navigate('personalization');
            }
        });
    }, 0);

    return div;
}

// --- Page: Settings ---
function renderSettings() {
    const div = document.createElement('div');
    div.innerHTML = `
        <h1>Settings</h1>
        <div class="grid-2" style="margin-bottom: 24px;">
            <!-- Reset Companions -->
            <div class="card glass" style="border-color: rgba(0, 113, 227, 0.3); box-shadow: 0 0 15px rgba(0, 113, 227, 0.1);">
                <h2 class="card-title" style="color: #007aff;">Reset Companions</h2>
                <p style="color: var(--text-secondary);">Delete all your travel companions and groups.</p>
                <button id="resetGroupsBtn" class="btn-liquid-glass" style="margin-top: 10px;">Clear Companions</button>
            </div>

            <!-- Reset Trips -->
            <div class="card glass" style="border-color: rgba(255, 149, 0, 0.3); box-shadow: 0 0 15px rgba(255, 149, 0, 0.1);">
                <h2 class="card-title" style="color: #ff9500;">Reset Trips</h2>
                <p style="color: var(--text-secondary);">Delete all your trips and their associated expenses.</p>
                <button id="resetTripsBtn" class="btn-liquid-glass" style="margin-top: 10px;">Delete All Trips</button>
            </div>

            <!-- Reset Categories -->
            <div class="card glass" style="border-color: rgba(88, 86, 214, 0.3); box-shadow: 0 0 15px rgba(88, 86, 214, 0.1);">
                <h2 class="card-title" style="color: #5856d6;">Reset Categories</h2>
                <p style="color: var(--text-secondary);">Revert all custom categories to the default set.</p>
                <button id="resetCatsBtn" class="btn-liquid-glass" style="margin-top: 10px;">Restore Defaults</button>
            </div>

            <!-- Reset Expenses -->
            <div class="card glass" style="border-color: rgba(255, 204, 0, 0.3); box-shadow: 0 0 15px rgba(255, 204, 0, 0.1);">
                <h2 class="card-title" style="color: #ffcc00;">Reset Expenses</h2>
                <p style="color: var(--text-secondary);">Delete all expenses while keeping your trips and companions.</p>
                <button id="resetExpensesBtn" class="btn-liquid-glass" style="margin-top: 10px;">Clear All Expenses</button>
            </div>
        </div>

        <!-- Danger Zone (Full Width) -->
        <div class="card glass" style="border-color: rgba(255, 59, 48, 0.3); box-shadow: 0 0 20px rgba(255, 59, 48, 0.15);">
            <h2 class="card-title" style="color: #ff3b30;">Danger Zone</h2>
            <p>Blank slate. Permanently delete EVERYTHING and revert to original state.</p>
            <button id="resetAppBtn" class="btn" style="background-color: #ff3b30; margin-top: 10px;">Erase All Data</button>
        </div>
    `;

    setTimeout(() => {
        div.querySelector('#resetGroupsBtn').addEventListener('click', () => {
            if (confirm("Clear all travel companions?")) {
                STATE.groups = [];
                saveState();
                navigate('settings');
            }
        });

        div.querySelector('#resetExpensesBtn').addEventListener('click', () => {
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
    }, 0);

    return div;
}

// --- Trip Management & Topbar ---
function updateTripSelector() {
    const selector = document.getElementById('tripSelector');
    if (!selector) return;
    
    if (STATE.trips.length === 0) {
        selector.innerHTML = '<option value="">Create your first trip...</option>';
    } else {
        selector.innerHTML = '<option value="">Active Trips...</option>' + 
            STATE.trips.map(t => `<option value="${t.id}" ${STATE.activeTripId === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
    }
}

function archiveActiveTrip() {
    if (!STATE.activeTripId) return;
    const tripIndex = STATE.trips.findIndex(t => t.id === STATE.activeTripId);
    if (tripIndex === -1) return;

    if (confirm("Archive this trip? It will be moved to Collections.")) {
        const trip = STATE.trips.splice(tripIndex, 1)[0];
        if (!STATE.archivedTrips) STATE.archivedTrips = [];
        STATE.archivedTrips.push(trip);
        STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0].id : null;
        saveState();
        updateTripSelector();
        navigate('home');
    }
}

// --- Initialization ---
function init() {
    loadState();
    updateTripSelector();
    
    // Nav Listeners (both navbar and sidebar)
    document.querySelectorAll('.nav-item, .sidebar-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            if (page) {
                closeSidebar();
                navigate(page);
            }
        });
    });

    // Hamburger & Sidebar
    function openSidebar() {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('sidebarOverlay').classList.add('open');
    }
    function closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarOverlay').classList.remove('open');
    }
    document.getElementById('hamburgerBtn').addEventListener('click', openSidebar);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
    document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });

    // Trip Selector Listener
    document.getElementById('tripSelector').addEventListener('change', (e) => {
        STATE.activeTripId = e.target.value;
        saveState();
        const activeLink = document.querySelector('.nav-item.active');
        const currentPage = activeLink ? activeLink.dataset.page : 'home';
        navigate(currentPage);
    });

    // New Trip Listener
    document.getElementById('newTripBtn').addEventListener('click', openNewTripModal);

    // Archive Trip Listener
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
        document.querySelector('.nav-trips').appendChild(archiveBtn);
        archiveBtn.addEventListener('click', archiveActiveTrip);
    }

    // Initial navigation
    navigate('home');

    // Initialize Google Login
    console.log("Initializing Google Login...");
    initGoogleLogin();
    console.log("Init sequence complete.");
}

async function initGoogleLogin() {
    const config = await (await fetch('/api/config')).json();
    if (!config.google_client_id) {
        console.warn("Google Client ID not found in .env");
        return;
    }

    window.google.accounts.id.initialize({
        client_id: config.google_client_id,
        callback: handleGoogleLogin
    });

    window.google.accounts.id.renderButton(
        document.getElementById("googleLoginBtn"),
        { theme: "outline", size: "large", width: 250 }
    );

    // Logout listener
    document.getElementById('logoutBtn').addEventListener('click', () => {
        STATE.user = null;
        saveState();
        location.reload(); // Hard reset for security
    });

    // Check if we have a saved user
    if (STATE.user) {
        updateUserUI();
    }
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
        await fetchUserData(); // Load cloud data after login
        navigate('home');
    }
}

async function fetchUserData() {
    if (!STATE.user) return;
    try {
        const res = await fetch(`/api/data?user_id=${STATE.user.id}`);
        const data = await res.json();
        if (data.trips) {
            STATE.trips = data.trips;
            STATE.expenses = data.expenses;
            STATE.activities = data.activities || [];
            STATE.photos = data.photos || [];
            saveState();
        }
    } catch (e) {
        console.error("Failed to fetch user data:", e);
    }
}

function updateUserUI() {
    if (!STATE.user) return;
    document.getElementById('googleLoginBtn').style.display = 'none';
    document.getElementById('userProfile').style.display = 'flex';
    document.getElementById('logoutBtn').style.display = 'block';
    document.getElementById('userName').innerText = STATE.user.name;
    document.getElementById('userEmail').innerText = STATE.user.email;
    document.getElementById('userPicture').src = STATE.user.picture;
}

function openNewTripModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="card glass" style="width: 450px; padding: 32px; border-radius: 24px; position: relative; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
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
    const countryInput = modal.querySelector('#modalTripCountry');
    nameInput.focus();

    modal.querySelector('#modalCancelBtn').onclick = () => modal.remove();
    modal.querySelector('#modalCreateBtn').onclick = () => {
        const name = nameInput.value.trim();
        const country = countryInput.value.trim();
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

// ============================================================
// --- Page: Budgets (Placeholder) ---
// ============================================================
function renderBudgets() {
    const div = document.createElement('div');
    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #34c759, #007aff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Budgets</h1>
            <p>Set spending limits and track them across trips.</p>
        </div>
        <div class="card glass" style="text-align: center; padding: 60px; max-width: 500px; margin: 0 auto;">
            <div style="font-size: 4rem; margin-bottom: 20px;">💰</div>
            <h2 style="margin-bottom: 12px;">Coming Soon</h2>
            <p style="color: var(--text-secondary); line-height: 1.6;">Budget tracking will let you set per-trip or per-category spending limits and get alerts when you're close to them.</p>
        </div>
    `;
    return div;
}

// ============================================================
// --- Page: Collections (Placeholder) ---
// ============================================================
function renderCollections() {
    const div = document.createElement('div');
    const archived = STATE.archivedTrips || [];

    let archivedHtml = archived.length > 0 ? archived.map(t => `
        <div class="card glass" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
            <div>
                <h3 style="margin: 0;">${t.name}</h3>
                <p style="color: var(--text-secondary); margin: 4px 0 0 0;">${t.country}</p>
            </div>
            <button class="btn-liquid-glass" onclick="restoreTrip('${t.id}')">Restore</button>
        </div>
    `).join('') : `
        <div class="card glass" style="text-align: center; padding: 60px;">
            <div style="font-size: 4rem; margin-bottom: 20px;">📚</div>
            <h2 style="margin-bottom: 12px;">No archived trips</h2>
            <p style="color: var(--text-secondary); line-height: 1.6;">Your archived trips will appear here.</p>
        </div>
    `;

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #ff9500, #ff3b30); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
            <p>Your archived travel memories.</p>
        </div>
        <div style="display: flex; flex-direction: column; gap: 16px;">
            ${archivedHtml}
        </div>
    `;
    return div;
}

// Global scope for restore button
window.restoreTrip = (id) => {
    const index = STATE.archivedTrips.findIndex(t => t.id === id);
    if (index !== -1) {
        const trip = STATE.archivedTrips.splice(index, 1)[0];
        STATE.trips.push(trip);
        STATE.activeTripId = trip.id;
        saveState();
        updateTripSelector();
        navigate('collections');
    }
};

// ============================================================
// --- Page: Plan with AI ---
// ============================================================
const AI_KEYS = { openai: '', gemini: '' };
let leafletMap = null; // singleton reference

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
                        <p style="font-size:1.1rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;">Create a trip first to start planning your perfect itinerary with the help of Gemini &amp; ChatGPT.</p>
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
                    <div id="aiKeyStatus" style="display:flex;gap:6px;flex-wrap:wrap;margin-left:8px;"></div>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Planning your trip to <strong>${tripCountry}</strong></p>
            </div>

            <!-- Top 2-col: Controls | Map -->
            <div style="display:grid;grid-template-columns:380px 1fr;gap:24px;margin-bottom:32px;">

                <!-- Left: Controls -->
                <div style="display:flex;flex-direction:column;gap:16px;">
                    <!-- AI Engine badge -->
                    <div class="card glass" style="padding:18px;border-color:rgba(155,89,182,0.3);">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:#9b59b6;margin-bottom:8px;">✦ AI Engine</h2>
                        <p style="color:var(--text-secondary);font-size:0.82rem;margin:0;">Keys loaded securely from server.</p>
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
                    <!-- Travel style -->
                    <div class="card glass" style="padding:20px;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;letter-spacing:0.07em;color:var(--accent-blue);margin-bottom:10px;">🧭 Travel Style</h2>
                        <div style="display:flex;flex-wrap:wrap;gap:7px;">
                            ${tourismTypes.map(t => `<button class="tourism-tag" data-type="${t.label}">${t.icon} ${t.label}</button>`).join('')}
                        </div>
                    </div>
                    <!-- Generate -->
                    <button id="generateBtn" class="ai-generate-btn" style="width:100%;">✦ Generate My Itinerary</button>
                </div>

                <!-- Right: Leaflet Map (sticky) -->
                <div style="position:sticky;top:80px;height:520px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiLeafletMap" style="width:100%;height:100%;"></div>
                        <div style="position:absolute;bottom:14px;left:14px;background:var(--glass-bg);backdrop-filter:blur(12px);padding:6px 14px;border-radius:980px;border:1px solid var(--glass-border);font-size:0.82rem;font-weight:600;z-index:1000;">
                            📍 ${tripCountry}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput"></div>
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

        // Generate button
        div.querySelector('#generateBtn').addEventListener('click', async () => {
            const outputEl = div.querySelector('#itineraryOutput');
            const statusEl = div.querySelector('#aiKeyStatus');
            const dateFrom = div.querySelector('#aiDateFrom').value;
            const dateTo   = div.querySelector('#aiDateTo').value;
            const selectedTypes = [...div.querySelectorAll('.tourism-tag.selected')].map(b => b.dataset.type);
            const country = tripCountry;

            if (!dateFrom || !dateTo) { alert('Please select your travel dates.'); return; }

            outputEl.innerHTML = `<div class="ai-loading-spinner"><div class="spinner-ring"></div><div style="font-weight:600;">Loading configuration...</div></div>`;

            let openaiKey = '', geminiKey = '';
            try {
                const cfg = await fetch('/api/config').then(r => r.json());
                openaiKey = cfg.openai_key || '';
                geminiKey = cfg.gemini_key || '';
            } catch(e) { console.warn('Config fetch failed', e); }

            // Update status badges
            statusEl.innerHTML = [
                geminiKey  ? `<span style="font-size:0.75rem;padding:3px 10px;border-radius:980px;background:rgba(52,199,89,0.12);color:#34c759;border:1px solid rgba(52,199,89,0.3);">⬤ Gemini</span>`  : `<span style="font-size:0.75rem;padding:3px 10px;border-radius:980px;background:rgba(255,59,48,0.1);color:#ff3b30;border:1px solid rgba(255,59,48,0.25);">⬤ Gemini</span>`,
                openaiKey  ? `<span style="font-size:0.75rem;padding:3px 10px;border-radius:980px;background:rgba(52,199,89,0.12);color:#34c759;border:1px solid rgba(52,199,89,0.3);">⬤ ChatGPT</span>` : `<span style="font-size:0.75rem;padding:3px 10px;border-radius:980px;background:rgba(255,59,48,0.1);color:#ff3b30;border:1px solid rgba(255,59,48,0.25);">⬤ ChatGPT</span>`
            ].join('');

            if (!openaiKey && !geminiKey) {
                outputEl.innerHTML = `
                    <div class="card glass" style="padding:32px;border-color:rgba(255,59,48,0.3);">
                        <h2 style="color:#ff3b30;margin:0 0 12px;">🔑 API Keys Not Found</h2>
                        <p style="color:var(--text-secondary);margin:0 0 16px;line-height:1.6;">The server could not find your API keys. Please make sure you have added them to your <code style="background:rgba(0,0,0,0.06);padding:2px 6px;border-radius:4px;">.env</code> file:</p>
                        <pre style="background:rgba(0,0,0,0.05);border:1px solid var(--glass-border);border-radius:10px;padding:16px;font-size:0.85rem;line-height:1.8;overflow-x:auto;">OPENAI_API_KEY=sk-your-key-here
GEMINI_API_KEY=AIza-your-key-here</pre>
                        <p style="color:var(--text-secondary);margin:12px 0 0;font-size:0.85rem;">After editing the file, <strong>restart the server</strong> for the changes to take effect.</p>
                    </div>`;
                return;
            }

            const styles = selectedTypes.length > 0 ? selectedTypes.join(', ') : 'general tourism';
            const from  = new Date(dateFrom), to = new Date(dateTo);
            const numDays = Math.max(1, Math.round((to - from) / 86400000) + 1);

            const prompt = `You are an expert travel planner. Create a detailed ${numDays}-day itinerary for ${country} from ${dateFrom} to ${dateTo}.
Travel style preferences: ${styles}.
For EACH day provide morning, afternoon, evening activities with REAL specific place names in ${country}, plus a practical tip.
Also include a "mainLocation" field with the name of the most iconic place visited that day (used for map geocoding).
Respond ONLY with a valid JSON array, no markdown, no extra text:
[{"day":1,"date":"${dateFrom}","title":"Day title","mainLocation":"Specific place name","morning":{"activity":"name","description":"details"},"afternoon":{"activity":"name","description":"details"},"evening":{"activity":"name","description":"details"},"tip":"Practical tip"}]`;

            outputEl.innerHTML = `<div class="ai-loading-spinner"><div class="spinner-ring"></div><div style="font-weight:600;${sf}">Consulting Gemini & ChatGPT...</div><div style="font-size:0.85rem;color:var(--text-secondary);">Building your ${numDays}-day itinerary for ${country}</div></div>`;

            let geminiResult = null, openaiResult = null;

            if (geminiKey) {
                try {
                    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{temperature:0.7,maxOutputTokens:8000} })
                    });
                    const d = await r.json();
                    if (d.error) console.error('Gemini Error:', d.error);
                    geminiResult = JSON.parse((d?.candidates?.[0]?.content?.parts?.[0]?.text||'').replace(/```json/g,'').replace(/```/g,'').trim());
                } catch(e) { console.error('Gemini Fetch Failed:', e); }
            }

            if (openaiKey) {
                try {
                    const r = await fetch('https://api.openai.com/v1/chat/completions', {
                        method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${openaiKey}`},
                        body: JSON.stringify({ model:'gpt-4o', messages:[{role:'user',content:prompt}], temperature:0.7 })
                    });
                    const d = await r.json();
                    if (d.error) console.error('OpenAI Error:', d.error);
                    openaiResult = JSON.parse((d?.choices?.[0]?.message?.content||'').replace(/```json/g,'').replace(/```/g,'').trim());
                } catch(e) { console.error('OpenAI Fetch Failed:', e); }
            }

            let finalItinerary = null;
            if (geminiResult && openaiResult) {
                outputEl.innerHTML = `<div class="ai-loading-spinner"><div class="spinner-ring"></div><div style="font-weight:600;">Merging both itineraries...</div></div>`;
                const mergePrompt = `Merge these two ${numDays}-day itineraries for ${country} into one superior plan combining the best of both. Return ONLY valid JSON array, no markdown.\nA:${JSON.stringify(geminiResult)}\nB:${JSON.stringify(openaiResult)}`;
                try {
                    if (geminiKey) {
                        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
                            method:'POST', headers:{'Content-Type':'application/json'},
                            body: JSON.stringify({ contents:[{parts:[{text:mergePrompt}]}], generationConfig:{temperature:0.5,maxOutputTokens:8000} })
                        });
                        const d = await r.json();
                        finalItinerary = JSON.parse((d?.candidates?.[0]?.content?.parts?.[0]?.text||'').replace(/```json/g,'').replace(/```/g,'').trim());
                    } else { finalItinerary = geminiResult; }
                } catch(e) { finalItinerary = geminiResult || openaiResult; }
            } else {
                finalItinerary = geminiResult || openaiResult;
            }

            if (!finalItinerary || !finalItinerary.length) {
                outputEl.innerHTML = `<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p style="color:var(--text-secondary);">Check your API keys and try again.</p></div>`;
                return;
            }

            // ── Render day blocks ─────────────────────────────
            const source = geminiResult && openaiResult ? 'Gemini + ChatGPT' : (geminiResult ? 'Gemini' : 'ChatGPT');
            outputEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;${sf}">${numDays}-Day ${country} Itinerary</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">Generated by ${source} · ${styles}</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">✦ AI-Generated</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>`;

            const daysContainer = outputEl.querySelector('#itineraryDays');
            const dayDivs = [];

            finalItinerary.forEach((day, i) => {
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
                                <h3 style="margin:0 0 4px;font-size:1.2rem;font-weight:700;letter-spacing:-0.02em;">${day.title || 'Day ' + day.day}</h3>
                                <span style="font-size:0.8rem;color:var(--text-secondary);">${day.date || ''}</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:${day.tip ? '20px' : '0'};">
                                <div style="padding:16px;background:rgba(0,113,227,0.05);border-radius:12px;border:1px solid rgba(0,113,227,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);margin-bottom:8px;">🌅 Morning</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;">${day.morning?.activity || ''}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${day.morning?.description || ''}</div>
                                </div>
                                <div style="padding:16px;background:rgba(255,149,0,0.05);border-radius:12px;border:1px solid rgba(255,149,0,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ff9500;margin-bottom:8px;">☀️ Afternoon</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;">${day.afternoon?.activity || ''}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${day.afternoon?.description || ''}</div>
                                </div>
                                <div style="padding:16px;background:rgba(155,89,182,0.05);border-radius:12px;border:1px solid rgba(155,89,182,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9b59b6;margin-bottom:8px;">🌙 Evening</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;">${day.evening?.activity || ''}</div>
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
                        if (markerCoords.length === finalItinerary.length) {
                            leafletMap.fitBounds(markerCoords, { padding: [40, 40] });
                        }
                    } catch(e) { console.warn('Geocode failed for', loc, e); }
                };

                // Stagger geocode calls to respect Nominatim rate limit
                finalItinerary.forEach((day, i) => {
                    setTimeout(() => geocodeAndMark(day, i), i * 1100);
                });
            }
        });
    }, 0);

    return div;
}

// Since type="module" scripts are deferred, the DOM is already ready


// --- Social & Friends Rendering ---

async function renderFriends(container) {
    if (!STATE.user) {
        container.innerHTML = `
            <div class="glass-card" style="text-align: center; padding: 40px;">
                <h2 style="margin-bottom: 16px;">Friends & Social</h2>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">Sign in with Google to find friends and share trips!</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="page-header">
            <h1 class="page-title">Friends</h1>
            <p class="page-subtitle">Connect with other travelers and share your itineraries</p>
        </div>

        <div class="grid-2">
            <div class="glass-card">
                <h3 style="margin-bottom: 16px;">Find Friends</h3>
                <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                    <input type="text" id="friendSearchInput" class="glass-input" placeholder="Search by email..." style="flex: 1;">
                    <button id="friendSearchBtn" class="btn">Search</button>
                </div>
                <div id="friendSearchResults" style="display: flex; flex-direction: column; gap: 12px;"></div>
            </div>

            <div class="glass-card">
                <h3 style="margin-bottom: 16px;">Your Friends</h3>
                <div id="friendsList" style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="text-align: center; padding: 20px; color: var(--text-secondary);">Loading friends...</div>
                </div>
            </div>
        </div>
    `;

    const searchInput = document.getElementById('friendSearchInput');
    const searchBtn = document.getElementById('friendSearchBtn');
    const resultsDiv = document.getElementById('friendSearchResults');
    const listDiv = document.getElementById('friendsList');

    searchBtn.addEventListener('click', async () => {
        const query = searchInput.value;
        if (!query) return;
        const res = await fetch(`/api/friends/search?q=${query}`);
        const users = await res.json();
        
        resultsDiv.innerHTML = users.map(u => `
            <div class="glass-item" style="display: flex; align-items: center; justify-content: space-between; padding: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${u.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                    <div>
                        <div style="font-weight: 600; font-size: 0.9rem;">${u.name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${u.email}</div>
                    </div>
                </div>
                <button class="btn btn-small add-friend-btn" data-id="${u.id}">Add</button>
            </div>
        `).join('') || '<div style="text-align: center; color: var(--text-secondary);">No users found</div>';

        document.querySelectorAll('.add-friend-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const friendId = btn.getAttribute('data-id');
                await fetch('/api/friends/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: STATE.user.id, friend_id: friendId })
                });
                btn.innerText = 'Added!';
                btn.disabled = true;
                loadFriendsList();
            });
        });
    });

    async function loadFriendsList() {
        const res = await fetch(`/api/friends/list?user_id=${STATE.user.id}`);
        const friends = await res.json();
        listDiv.innerHTML = friends.map(f => `
            <div class="glass-item" style="display: flex; align-items: center; gap: 12px; padding: 12px;">
                <img src="${f.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                <div>
                    <div style="font-weight: 600; font-size: 0.9rem;">${f.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${f.email}</div>
                </div>
            </div>
        `).join('') || '<div style="text-align: center; color: var(--text-secondary);">You haven\'t added any friends yet.</div>';
    }

    loadFriendsList();
}

async function openShareModal(tripId) {
    if (!STATE.user) {
        alert("Please sign in to share trips!");
        return;
    }

    const trip = STATE.trips.find(t => t.id === tripId);
    const res = await fetch(`/api/friends/list?user_id=${STATE.user.id}`);
    const friends = await res.json();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="glass-card" style="width: 400px; padding: 24px; position: relative;">
            <button class="sidebar-close-btn" style="position: absolute; top: 12px; right: 12px;">&times;</button>
            <h2 style="margin-bottom: 8px;">Share Trip</h2>
            <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 20px;">Invite friends to collaborate on <strong>${trip.name}</strong></p>
            
            <div style="display: flex; flex-direction: column; gap: 10px;">
                ${friends.map(f => `
                    <div class="glass-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <img src="${f.picture}" style="width: 28px; height: 28px; border-radius: 50%;">
                            <span style="font-size: 0.9rem;">${f.name}</span>
                        </div>
                        <button class="btn btn-small share-action-btn" data-friend-id="${f.id}">Share</button>
                    </div>
                `).join('') || '<p style="text-align: center; color: var(--text-secondary);">Add friends first!</p>'}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.sidebar-close-btn').onclick = () => modal.remove();
    modal.querySelectorAll('.share-action-btn').forEach(btn => {
    });
}



init();
