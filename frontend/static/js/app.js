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
    hasLoggedInBefore: false, // Tracks if user has ever signed in
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
    activeDetailId: null, // Store ID for detail views (e.g. archived trip detail)
    notifications: []
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
    "Tuvalu", "Uganda", "Ukraine", "UAE", "UK", "United States (USA)", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City",
    "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
].sort();

// Inspirational pairs for the initial slideshow (Quotes instead of Facts)
const INSPIRATIONAL_PAIRS = [
    { i: 'https://images.unsplash.com/photo-1526772662000-3f88f10405ff', q: 'To lose yourself in a new country is to find yourself in the world.' },
    { i: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b', q: 'Traveling is finding a place where every path leads somewhere beautiful.' },
    { i: 'https://images.unsplash.com/photo-1501854140801-50d01698950b', q: 'To travel is to find peace in the untamed beauty of the world.' },
    { i: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e', q: 'Every sunrise is a new begginning.' },
    { i: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d', q: 'Allow yourself to wander roads that feel ancient and alive.' },
    { i: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716', q: 'Traveling is the bridge that connects mind and soul' },
    { i: 'https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07', q: 'Discover hidden places in every corner.' },
    { i: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e', q: 'Go where the horizon meets the ocean and time stands still.' },
    { i: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8', q: 'Adventure is not a destination, it\'s a belief system.' },
    { i: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e', q: 'Embrace the spirit of the backpacker' },
    { i: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb', q: 'The essence of traveling beats in every human heart.' },
    { i: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606', q: 'Explore the peak of your potential.' },
].map(p => ({ i: p.i + '?auto=format&fit=crop&w=1600&q=80', q: p.q }));

// Quotes & Images Dictionary — generated from facts and curated images
const DESTINATION_DATA = {
    "Afghanistan": { i: "1589192144353-8e7c107077a1", q: "Central Asia's crossroads.", f: "Did you know that Afghanistan has a population of about 37 million people? Its capital city is Kabul." },
    "Alabama": { i: "1469474968028-56623f02e42e", q: "Sweet Home Alabama.", f: "Did you know that the Alabama State has a population of about 5 million people? Its biggest city is Huntsville." },
    "Alaska": { i: "1472214103451-9374bd1c798e", q: "The Last Frontier.", f: "Did you know that the Alaska State has a population of about 733 thousand people? Its biggest city is Anchorage." },
    "Albania": { i: "1588965000000-019521f3f39b", q: "Balkan beauty.", f: "Did you know that Albania has a population of about 2.9 million people? Its capital city is Tirana." },
    "Algeria": { i: "1544062562417-380d5d113f8c", q: "Sahara's gateway.", f: "Did you know that Algeria has a population of about 42 million people? Its capital city is Alger." },
    "Andorra": { i: "1469854523086-cc02fe5d8800", q: "Andorra is waiting for you.", f: "Did you know that Andorra has a population of about 77 thousand people? Its capital city is Andorra la Vella." },
    "Angola": { i: "1469854523086-cc02fe5d8800", q: "Angola is waiting for you.", f: "Did you know that Angola has a population of about 31 million people? Its capital city is Luanda." },
    "Antigua": { i: "1469854523086-cc02fe5d8800", q: "Antigua is waiting for you.", f: "Did you know that Antigua and Barbuda has a population of about 96 thousand people? Its capital city is Saint John's." },
    "Argentina": { i: "1449433114371-d67b866d368e", q: "Land of Tango.", f: "Did you know that Argentina has a population of about 44 million people? Its capital city is Buenos Aires." },
    "Arizona": { i: "1501854140801-50d01698950b", q: "The Grand Canyon State.", f: "Did you know that the Arizona State has a population of about 7 million people? Its biggest city is Phoenix." },
    "Arkansas": { i: "1470071131384-001b85755536", q: "The Natural State.", f: "Did you know that the Arkansas State has a population of about 3 million people? Its biggest city is Little Rock." },
    "Armenia": { i: "1469854523086-cc02fe5d8800", q: "Armenia is waiting for you.", f: "Did you know that Armenia has a population of about 3.0 million people? Its capital city is Yerevan." },
    "Australia": { i: "1523413680321-4d9d448b18f9", q: "The Great Down Under.", f: "Did you know that Australia has a population of about 25 million people? Its capital city is Canberra." },
    "Austria": { i: "1516903529241-10503553f08a", q: "Alps and Art.", f: "Did you know that Austria has a population of about 8.8 million people? Its capital city is Wien." },
    "Azerbaijan": { i: "1469854523086-cc02fe5d8800", q: "Azerbaijan is waiting for you.", f: "Did you know that Azerbaijan has a population of about 9.9 million people? Its capital city is Baku." },
    "Bahamas": { i: "1469854523086-cc02fe5d8800", q: "Bahamas is waiting for you.", f: "Did you know that Bahamas has a population of about 386 thousand people? Its capital city is Nassau." },
    "Bahrain": { i: "1469854523086-cc02fe5d8800", q: "Bahrain is waiting for you.", f: "Did you know that Bahrain has a population of about 1.6 million people? Its capital city is al-Manama." },
    "Bangladesh": { i: "1469854523086-cc02fe5d8800", q: "Bangladesh is waiting for you.", f: "Did you know that Bangladesh has a population of about 161 million people? Its capital city is Dhaka." },
    "Barbados": { i: "1469854523086-cc02fe5d8800", q: "Barbados is waiting for you.", f: "Did you know that Barbados has a population of about 287 thousand people? Its capital city is Bridgetown." },
    "Belarus": { i: "1469854523086-cc02fe5d8800", q: "Belarus is waiting for you.", f: "Did you know that Belarus has a population of about 9.5 million people? Its capital city is Minsk." },
    "Belgium": { i: "1490642220353-d023b6b27e8a", q: "Heart of Europe.", f: "Did you know that Belgium has a population of about 11 million people? Its capital city is Bruxelles." },
    "Belize": { i: "1469854523086-cc02fe5d8800", q: "Belize is waiting for you.", f: "Did you know that Belgium has a population of about 383 thousand people? Its capital city is Belmopan." },
    "Benin": { i: "1469854523086-cc02fe5d8800", q: "Benin is waiting for you.", f: "Did you know that Benin has a population of about 11 million people? Its capital city is Porto-Novo." },
    "Bhutan": { i: "1469854523086-cc02fe5d8800", q: "Bhutan is waiting for you.", f: "Did you know that Bhutan has a population of about 754 thousand people? Its capital city is Thimphu." },
    "Bolivia": { i: "1469854523086-cc02fe5d8800", q: "Bolivia is waiting for you.", f: "Did you know that Bolivia has a population of about 11 million people? Its capital city is La Paz." },
    "Bosnia": { i: "1469854523086-cc02fe5d8800", q: "Bosnia is waiting for you.", f: "Did you know that Bosnia and Herzegovina has a population of about 3.3 million people? Its capital city is Sarajevo." },
    "Botswana": { i: "1469854523086-cc02fe5d8800", q: "Botswana is waiting for you.", f: "Did you know that Botswana has a population of about 2.3 million people? Its capital city is Gaborone." },
    "Brazil": { i: "1483729553833-9411f2115507", q: "Tropical rhythms.", f: "Did you know that Brazil has a population of about 209 million people? Its capital city is Brasília." },
    "Brunei": { i: "1469854523086-cc02fe5d8800", q: "Brunei is waiting for you.", f: "Did you know that Brunei has a population of about 429 thousand people? Its capital city is Bandar Seri Begawan." },
    "Bulgaria": { i: "1469854523086-cc02fe5d8800", q: "Bulgaria is waiting for you.", f: "Did you know that Bulgaria has a population of about 7.0 million people? Its capital city is Sofia." },
    "Burkina": { i: "1469854523086-cc02fe5d8800", q: "Burkina is waiting for you.", f: "Did you know that Burkina Faso has a population of about 20 million people? Its capital city is Ouagadougou." },
    "Burundi": { i: "1469854523086-cc02fe5d8800", q: "Burundi is waiting for you.", f: "Did you know that Burundi has a population of about 11 million people? Its capital city is Bujumbura." },
    "Cabo": { i: "1469854523086-cc02fe5d8800", q: "Cabo is waiting for you.", f: "Did you know that Cabo Verde has a population of about 556 thousand people?" },
    "California": { i: "1465146344425-f00d5f5c8f07", q: "The Golden State.", f: "Did you know that the California State has a population of about 40 million people? Its biggest city is Los Angeles." },
    "Cambodia": { i: "1469854523086-cc02fe5d8800", q: "Cambodia is waiting for you.", f: "Did you know that Cambodia has a population of about 16 million people? Its capital city is Phnom Penh." },
    "Cameroon": { i: "1469854523086-cc02fe5d8800", q: "Cameroon is waiting for you.", f: "Did you know that Cameroon has a population of about 25 million people? Its capital city is Yaounde." },
    "Canada": { i: "1503622765438-dec7e6190771", q: "Great White North.", f: "Did you know that Canada has a population of about 37 million people? Its capital city is Ottawa." },
    "Central": { i: "1469854523086-cc02fe5d8800", q: "Central is waiting for you.", f: "Did you know that Central African Republic has a population of about 4.7 million people? Its capital city is Bangui." },
    "Chad": { i: "1469854523086-cc02fe5d8800", q: "Chad is waiting for you.", f: "Did you know that Chad has a population of about 15 million people? Its capital city is N'Djamena." },
    "Chile": { i: "1469854523086-cc02fe5d8800", q: "Chile is waiting for you.", f: "Did you know that Chile has a population of about 19 million people? Its capital city is Santiago de Chile." },
    "China": { i: "1508433313474-758b4ff2cbb0", q: "Ancient and modern.", f: "Did you know that China has a population of about 1.4 billion people? Its capital city is Peking." },
    "Colombia": { i: "1533696812891-7d124a7300c2", q: "Coffee and color.", f: "Did you know that Colombia has a population of about 50 million people? Its capital city is Bogota." },
    "Colorado": { i: "1433086966358-54859d0ed716", q: "Colorful Colorado.", f: "Did you know that the Colorado State has a population of about 6 million people? Its biggest city is Denver." },
    "Comoros": { i: "1469854523086-cc02fe5d8800", q: "Comoros is waiting for you.", f: "Did you know that Comoros has a population of about 832 thousand people? Its capital city is Moroni." },
    "Congo": { i: "1469854523086-cc02fe5d8800", q: "Congo is waiting for you.", f: "Did you know that Congo has a population of about 5.2 million people? Its capital city is Brazzaville." },
    "Connecticut": { i: "1473448912268-2022ce9509d8", q: "The Constitution State.", f: "Did you know that the Connecticut State has a population of about 4 million people? Its biggest city is Bridgeport." },
    "Costa": { i: "1469854523086-cc02fe5d8800", q: "Costa is waiting for you.", f: "Did you know that Costa Rica has a population of about 5.0 million people? Its capital city is San José." },
    "Croatia": { i: "1555513460-31682705284b", q: "Adriatic gem.", f: "Did you know that Croatia has a population of about 4.1 million people? Its capital city is Zagreb." },
    "Cuba": { i: "1469854523086-cc02fe5d8800", q: "Cuba is waiting for you.", f: "Did you know that Cuba has a population of about 11 million people? Its capital city is La Habana." },
    "Cyprus": { i: "1469854523086-cc02fe5d8800", q: "Cyprus is waiting for you.", f: "Did you know that Cyprus has a population of about 1.2 million people? Its capital city is Nicosia." },
    "Czech": { i: "1469854523086-cc02fe5d8800", q: "Czech is waiting for you.", f: "Did you know that Czech Republic has a population of about 11 million people? Its capital city is Praha." },
    "Delaware": { i: "1447752875215-b2761acb3c5d", q: "The First State.", f: "Did you know that the Delaware State has a population of about 990 thousand people? Its biggest city is Wilmington." },
    "Denmark": { i: "1513132240413-d096a650d135", q: "Nordic charm.", f: "Did you know that Denmark has a population of about 5.8 million people? Its capital city is Copenhagen." },
    "Djibouti": { i: "1469854523086-cc02fe5d8800", q: "Djibouti is waiting for you.", f: "Did you know that Djibouti has a population of about 959 thousand people? Its capital city is Djibouti." },
    "Dominica": { i: "1469854523086-cc02fe5d8800", q: "Dominica is waiting for you.", f: "Did you know that Dominica has a population of about 72 thousand people? Its capital city is Roseau." },
    "Dominican": { i: "1469854523086-cc02fe5d8800", q: "Dominican is waiting for you.", f: "Did you know that Dominican Republic has a population of about 11 million people? Its capital city is Santo Domingo de Guzman." },
    "Ecuador": { i: "1469854523086-cc02fe5d8800", q: "Ecuador is waiting for you.", f: "Did you know that Ecuador has a population of about 17 million people? Its capital city is Quito." },
    "Egypt": { i: "1504351344031-15e8869f91f3", q: "Gift of the Nile.", f: "Did you know that Egypt has a population of about 98 million people? Its capital city is Cairo." },
    "El": { i: "1469854523086-cc02fe5d8800", q: "El is waiting for you.", f: "Did you know that El Salvador has a population of about 6.4 million people? Its capital city is San Salvador." },
    "Equatorial": { i: "1469854523086-cc02fe5d8800", q: "Equatorial is waiting for you.", f: "Did you know that Equatorial Guinea has a population of about 1.3 million people? Its capital city is Malabo." },
    "Eritrea": { i: "1469854523086-cc02fe5d8800", q: "Eritrea is waiting for you.", f: "Did you know that Eritrea has a population of about 6.2 million people? Its capital city is Asmara." },
    "Estonia": { i: "1469854523086-cc02fe5d8800", q: "Estonia is waiting for you.", f: "Did you know that Estonia has a population of about 1.3 million people? Its capital city is Tallinn." },
    "Eswatini": { i: "1469854523086-cc02fe5d8800", q: "Eswatini is waiting for you.", f: "Did you know that Eswatini has a population of about 1.1 million people? Its capital city is Mbabane." },
    "Ethiopia": { i: "1469854523086-cc02fe5d8800", q: "Ethiopia is waiting for you.", f: "Did you know that Ethiopia has a population of about 109 million people? Its capital city is Addis Abeba." },
    "Fiji": { i: "1469854523086-cc02fe5d8800", q: "Fiji is waiting for you.", f: "Did you know? Fiji is full of hidden gems waiting to be explored." },
    "Finland": { i: "1469854523086-cc02fe5d8800", q: "Finland is waiting for you.", f: "Did you know that Finland has a population of about 5.5 million people? Its capital city is Helsinki." },
    "Florida": { i: "1464822759023-fed622ff2c3b", q: "The Sunshine State.", f: "Did you know that the Florida State has a population of about 22 million people? Its biggest city is Jacksonville." },
    "France": { i: "1502604067106-1200be669a8a", q: "Art de vivre.", f: "Did you know that France has a population of about 67 million people? Its capital city is Paris." },
    "Gabon": { i: "1469854523086-cc02fe5d8800", q: "Gabon is waiting for you.", f: "Did you know that Gabon has a population of about 2.1 million people? Its capital city is Libreville." },
    "Gambia": { i: "1469854523086-cc02fe5d8800", q: "Gambia is waiting for you.", f: "Did you know that Gambia has a population of about 2.3 million people? Its capital city is Banjul." },
    "Georgia": { i: "1507525428034-b723cf961d3e", q: "The Peach State.", f: "Did you know that the Georgia State has a population of about 11 million people? Its biggest city is Atlanta." },
    "Germany": { i: "1467269222272-bc0ad1f91cdc", q: "Innovation and history.", f: "Did you know that Germany has a population of about 83 million people? Its capital city is Berlin." },
    "Ghana": { i: "1469854523086-cc02fe5d8800", q: "Ghana is waiting for you.", f: "Did you know that Ghana has a population of about 30 million people? Its capital city is Accra." },
    "Greece": { i: "1533105079020-f1405128714e", q: "Cradle of civilization.", f: "Did you know that Greece has a population of about 11 million people? Its capital city is Athenai." },
    "Grenada": { i: "1469854523086-cc02fe5d8800", q: "Grenada is waiting for you.", f: "Did you know that Grenada has a population of about 111 thousand people? Its capital city is Saint George's." },
    "Guatemala": { i: "1469854523086-cc02fe5d8800", q: "Guatemala is waiting for you.", f: "Did you know that Guatemala has a population of about 17 million people? Its capital city is Ciudad de Guatemala." },
    "Guinea": { i: "1469854523086-cc02fe5d8800", q: "Guinea is waiting for you.", f: "Did you know that Guinea has a population of about 12 million people? Its capital city is Conakry." },
    "Guinea-Bissau": { i: "1469854523086-cc02fe5d8800", q: "Guinea-Bissau is waiting for you.", f: "Did you know that Guinea-Bissau has a population of about 1.9 million people? Its capital city is Bissau." },
    "Guyana": { i: "1469854523086-cc02fe5d8800", q: "Guyana is waiting for you.", f: "Did you know that Guyana has a population of about 779 thousand people? Its capital city is Georgetown." },
    "Haiti": { i: "1469854523086-cc02fe5d8800", q: "Haiti is waiting for you.", f: "Did you know that Haiti has a population of about 11 million people? Its capital city is Port-au-Prince." },
    "Hawaii": { i: "1476610971033-5c8523b7a2d6", q: "The Aloha State.", f: "Did you know that the Hawaii State has a population of about 2 million people? Its biggest city is Honolulu." },
    "Honduras": { i: "1469854523086-cc02fe5d8800", q: "Honduras is waiting for you.", f: "Did you know that Honduras has a population of about 9.6 million people? Its capital city is Tegucigalpa." },
    "Hungary": { i: "1469854523086-cc02fe5d8800", q: "Hungary is waiting for you.", f: "Did you know that Hungary has a population of about 9.8 million people? Its capital city is Budapest." },
    "Iceland": { i: "1476610971033-5c8523b7a2d6", q: "Fire and ice.", f: "Did you know that Iceland has a population of about 353 thousand people? Its capital city is Reykjavík." },
    "Idaho": { i: "1449844908441-8829872d2607", q: "The Gem State.", f: "Did you know that the Idaho State has a population of about 2 million people? Its biggest city is Boise." },
    "Illinois": { i: "1469474968028-56623f02e42e", q: "The Prairie State.", f: "Did you know that the Illinois State has a population of about 13 million people? Its biggest city is Chicago." },
    "India": { i: "1524478228052-b137a0a74564", q: "Incredible India.", f: "Did you know that India has a population of about 1.4 billion people? Its capital city is New Delhi." },
    "Indiana": { i: "1472214103451-9374bd1c798e", q: "The Hoosier State.", f: "Did you know that the Indiana State has a population of about 7 million people? Its biggest city is Indianapolis." },
    "Indonesia": { i: "1513407027603-2fcbb73c2806", q: "Island paradise.", f: "Did you know that Indonesia has a population of about 268 million people? Its capital city is Jakarta." },
    "Iowa": { i: "1501854140801-50d01698950b", q: "The Hawkeye State.", f: "Did you know that the Iowa State has a population of about 3 million people? Its biggest city is Des Moines." },
    "Iran": { i: "1469854523086-cc02fe5d8800", q: "Iran is waiting for you.", f: "Did you know that Iran has a population of about 82 million people? Its capital city is Tehran." },
    "Iraq": { i: "1469854523086-cc02fe5d8800", q: "Iraq is waiting for you.", f: "Did you know that Iraq has a population of about 38 million people? Its capital city is Baghdad." },
    "Ireland": { i: "1504449104445-9a51e6b02a20", q: "Emerald Isle.", f: "Did you know that Ireland has a population of about 4.9 million people? Its capital city is Dublin." },
    "Israel": { i: "1469854523086-cc02fe5d8800", q: "Israel is waiting for you.", f: "Did you know that Israel has a population of about 8.9 million people? Its capital city is Jerusalem." },
    "Italy": { i: "1516483638261-1478525c7f88", q: "La Dolce Vita.", f: "Did you know that Italy has a population of about 60 million people? Its capital city is Roma." },
    "Jamaica": { i: "1469854523086-cc02fe5d8800", q: "Jamaica is waiting for you.", f: "Did you know that Jamaica has a population of about 2.9 million people? Its capital city is Kingston." },
    "Japan": { i: "1493976040374-4efc0c8d1853", q: "Land of the Rising Sun.", f: "Did you know that Japan has a population of about 127 million people? Its capital city is Tokyo." },
    "Jordan": { i: "1469854523086-cc02fe5d8800", q: "Jordan is waiting for you.", f: "Did you know that Jordan has a population of about 10.0 million people? Its capital city is Amman." },
    "Kansas": { i: "1470071131384-001b85755536", q: "The Sunflower State.", f: "Did you know that the Kansas State has a population of about 3 million people? Its biggest city is Wichita." },
    "Kazakhstan": { i: "1469854523086-cc02fe5d8800", q: "Kazakhstan is waiting for you.", f: "Did you know that Kazakhstan has a population of about 18 million people? Its capital city is Astana." },
    "Kentucky": { i: "1465146344425-f00d5f5c8f07", q: "The Bluegrass State.", f: "Did you know that the Kentucky State has a population of about 4 million people? Its biggest city is Louisville." },
    "Kenya": { i: "1469854523086-cc02fe5d8800", q: "Kenya is waiting for you.", f: "Did you know that Kenya has a population of about 51 million people? Its capital city is Nairobi." },
    "Kiribati": { i: "1469854523086-cc02fe5d8800", q: "Kiribati is waiting for you.", f: "Did you know that Kiribati has a population of about 116 thousand people? Its capital city is Bairiki." },
    "Kuwait": { i: "1469854523086-cc02fe5d8800", q: "Kuwait is waiting for you.", f: "Did you know that Kuwait has a population of about 4.1 million people? Its capital city is Kuwait." },
    "Kyrgyzstan": { i: "1469854523086-cc02fe5d8800", q: "Kyrgyzstan is waiting for you.", f: "Did you know that Kyrgyzstan has a population of about 6.3 million people? Its capital city is Bishkek." },
    "Laos": { i: "1469854523086-cc02fe5d8800", q: "Laos is waiting for you.", f: "Did you know that Laos has a population of about 7.1 million people? Its capital city is Vientiane." },
    "Latvia": { i: "1469854523086-cc02fe5d8800", q: "Latvia is waiting for you.", f: "Did you know that Latvia has a population of about 1.9 million people? Its capital city is Riga." },
    "Lebanon": { i: "1469854523086-cc02fe5d8800", q: "Lebanon is waiting for you.", f: "Did you know that Lebanon has a population of about 6.8 million people? Its capital city is Beirut." },
    "Lesotho": { i: "1469854523086-cc02fe5d8800", q: "Lesotho is waiting for you.", f: "Did you know that Lesotho has a population of about 2.1 million people? Its capital city is Maseru." },
    "Liberia": { i: "1469854523086-cc02fe5d8800", q: "Liberia is waiting for you.", f: "Did you know that Liberia has a population of about 4.8 million people? Its capital city is Monrovia." },
    "Libya": { i: "1469854523086-cc02fe5d8800", q: "Libya is waiting for you.", f: "Did you know that Libya has a population of about 6.7 million people? Its capital city is Tripoli." },
    "Liechtenstein": { i: "1469854523086-cc02fe5d8800", q: "Liechtenstein is waiting for you.", f: "Did you know that Liechtenstein has a population of about 38 thousand people? Its capital city is Vaduz." },
    "Lithuania": { i: "1469854523086-cc02fe5d8800", q: "Lithuania is waiting for you.", f: "Did you know that Lithuania has a population of about 2.8 million people? Its capital city is Vilnius." },
    "Louisiana": { i: "1433086966358-54859d0ed716", q: "The Pelican State.", f: "Did you know that the Louisiana State has a population of about 5 million people? Its biggest city is New Orleans." },
    "Luxembourg": { i: "1469854523086-cc02fe5d8800", q: "Luxembourg is waiting for you.", f: "Did you know that Luxembourg has a population of about 608 thousand people? Its capital city is Luxembourg [Luxemburg/L." },
    "Madagascar": { i: "1469854523086-cc02fe5d8800", q: "Madagascar is waiting for you.", f: "Did you know that Madagascar has a population of about 26 million people? Its capital city is Antananarivo." },
    "Maine": { i: "1473448912268-2022ce9509d8", q: "The Pine Tree State.", f: "Did you know that the Maine State has a population of about 1 million people? Its biggest city is Portland." },
    "Malawi": { i: "1469854523086-cc02fe5d8800", q: "Malawi is waiting for you.", f: "Did you know that Malawi has a population of about 18 million people? Its capital city is Lilongwe." },
    "Malaysia": { i: "1469854523086-cc02fe5d8800", q: "Malaysia is waiting for you.", f: "Did you know that Malaysia has a population of about 32 million people? Its capital city is Kuala Lumpur." },
    "Maldives": { i: "1469854523086-cc02fe5d8800", q: "Maldives is waiting for you.", f: "Did you know that Maldives has a population of about 516 thousand people? Its capital city is Male." },
    "Mali": { i: "1469854523086-cc02fe5d8800", q: "Mali is waiting for you.", f: "Did you know that Mali has a population of about 19 million people? Its capital city is Bamako." },
    "Malta": { i: "1469854523086-cc02fe5d8800", q: "Malta is waiting for you.", f: "Did you know that Malta has a population of about 485 thousand people? Its capital city is Valletta." },
    "Marshall": { i: "1469854523086-cc02fe5d8800", q: "Marshall is waiting for you.", f: "Did you know that Marshall Islands has a population of about 58 thousand people? Its capital city is Dalap-Uliga-Darrit." },
    "Maryland": { i: "1447752875215-b2761acb3c5d", q: "The Old Line State.", f: "Did you know that the Maryland State has a population of about 6 million people? Its biggest city is Baltimore." },
    "Massachusetts": { i: "1464822759023-fed622ff2c3b", q: "The Bay State.", f: "Did you know that the Massachusetts State has a population of about 7 million people? Its biggest city is Boston." },
    "Mauritania": { i: "1469854523086-cc02fe5d8800", q: "Mauritania is waiting for you.", f: "Did you know that Mauritania has a population of about 4.4 million people? Its capital city is Nouakchott." },
    "Mauritius": { i: "1469854523086-cc02fe5d8800", q: "Mauritius is waiting for you.", f: "Did you know that Mauritius has a population of about 1.3 million people? Its capital city is Port-Louis." },
    "Mexico": { i: "1512813195302-3f11d1306eb5", q: "Viva México.", f: "Did you know that Mexico has a population of about 126 million people? Its capital city is Ciudad de M." },
    "Michigan": { i: "1507525428034-b723cf961d3e", q: "The Great Lakes State.", f: "Did you know that the Michigan State has a population of about 10 million people? Its biggest city is Detroit." },
    "Micronesia": { i: "1469854523086-cc02fe5d8800", q: "Micronesia is waiting for you.", f: "Did you know? Micronesia is full of hidden gems waiting to be explored." },
    "Minnesota": { i: "1476610971033-5c8523b7a2d6", q: "The North Star State.", f: "Did you know that the Minnesota State has a population of about 6 million people? Its biggest city is Minneapolis." },
    "Mississippi": { i: "1449844908441-8829872d2607", q: "The Magnolia State.", f: "Did you know that the Mississippi State has a population of about 3 million people? Its biggest city is Jackson." },
    "Missouri": { i: "1469474968028-56623f02e42e", q: "The Show-Me State.", f: "Did you know that the Missouri State has a population of about 6 million people? Its biggest city is Kansas City." },
    "Moldova": { i: "1469854523086-cc02fe5d8800", q: "Moldova is waiting for you.", f: "Did you know that Moldova has a population of about 2.7 million people? Its capital city is Chisinau." },
    "Monaco": { i: "1469854523086-cc02fe5d8800", q: "Monaco is waiting for you.", f: "Did you know that Monaco has a population of about 39 thousand people? Its capital city is Monaco-Ville." },
    "Mongolia": { i: "1469854523086-cc02fe5d8800", q: "Mongolia is waiting for you.", f: "Did you know that Mongolia has a population of about 3.2 million people? Its capital city is Ulan Bator." },
    "Montana": { i: "1472214103451-9374bd1c798e", q: "Big Sky Country.", f: "Did you know that the Montana State has a population of about 1 million people? Its biggest city is Billings." },
    "Montenegro": { i: "1469854523086-cc02fe5d8800", q: "Montenegro is waiting for you.", f: "Did you know that Montenegro has a population of about 631 thousand people? Its capital city is Podgorica." },
    "Morocco": { i: "1469854523086-cc02fe5d8800", q: "Morocco is waiting for you.", f: "Did you know that Morocco has a population of about 36 million people? Its capital city is Rabat." },
    "Mozambique": { i: "1469854523086-cc02fe5d8800", q: "Mozambique is waiting for you.", f: "Did you know that Mozambique has a population of about 29 million people? Its capital city is Maputo." },
    "Myanmar": { i: "1469854523086-cc02fe5d8800", q: "Myanmar is waiting for you.", f: "Did you know that Myanmar has a population of about 54 million people? Its capital city is Rangoon (Yangon)." },
    "Namibia": { i: "1469854523086-cc02fe5d8800", q: "Namibia is waiting for you.", f: "Did you know that Namibia has a population of about 2.4 million people? Its capital city is Windhoek." },
    "Nauru": { i: "1469854523086-cc02fe5d8800", q: "Nauru is waiting for you.", f: "Did you know that Nauru has a population of about 13 thousand people? Its capital city is Yaren." },
    "Nebraska": { i: "1501854140801-50d01698950b", q: "The Cornhusker State.", f: "Did you know that the Nebraska State has a population of about 2 million people? Its biggest city is Omaha." },
    "Nepal": { i: "1469854523086-cc02fe5d8800", q: "Nepal is waiting for you.", f: "Did you know that Nepal has a population of about 28 million people? Its capital city is Kathmandu." },
    "Netherlands": { i: "1513481615233-5e67010e407d", q: "Canals and colors.", f: "Did you know that Netherlands has a population of about 17 million people? Its capital city is Amsterdam." },
    "Nevada": { i: "1470071131384-001b85755536", q: "The Silver State.", f: "Did you know that the Nevada State has a population of about 3 million people? Its biggest city is Las Vegas." },
    "New Hampshire": { i: "1465146344425-f00d5f5c8f07", q: "Live Free or Die.", f: "Did you know that the New Hampshire State has a population of about 1 million people? Its biggest city is Manchester." },
    "New Jersey": { i: "1433086966358-54859d0ed716", q: "The Garden State.", f: "Did you know that the New Jersey State has a population of about 9 million people? Its biggest city is Newark." },
    "New Mexico": { i: "1473448912268-2022ce9509d8", q: "Land of Enchantment.", f: "Did you know that the New Mexico State has a population of about 2 million people? Its biggest city is Albuquerque." },
    "New York": { i: "1447752875215-b2761acb3c5d", q: "The Empire State.", f: "Did you know that the New York State has a population of about 20 million people? Its biggest city is New York City." },
    "New Zealand": { i: "1469854523086-cc02fe5d8800", q: "New Zealand is waiting for you.", f: "Did you know that New Zealand has a population of about 4.8 million people? Its capital city is Wellington." },
    "Nicaragua": { i: "1469854523086-cc02fe5d8800", q: "Nicaragua is waiting for you.", f: "Did you know that Nicaragua has a population of about 6.5 million people? Its capital city is Managua." },
    "Niger": { i: "1469854523086-cc02fe5d8800", q: "Niger is waiting for you.", f: "Did you know that Niger has a population of about 22 million people? Its capital city is Niamey." },
    "Nigeria": { i: "1469854523086-cc02fe5d8800", q: "Nigeria is waiting for you.", f: "Did you know that Nigeria has a population of about 196 million people? Its capital city is Abuja." },
    "North Carolina": { i: "1464822759023-fed622ff2c3b", q: "First in Flight.", f: "Did you know that the North Carolina State has a population of about 10 million people? Its biggest city is Charlotte." },
    "North Dakota": { i: "1507525428034-b723cf961d3e", q: "The Peace Garden State.", f: "Did you know that the North Dakota State has a population of about 779 thousand people? Its biggest city is Fargo." },
    "North Macedonia": { i: "1469854523086-cc02fe5d8800", q: "North Macedonia is waiting for you.", f: "Did you know that North Macedonia has a population of about 2.1 million people? Its capital city is Skopje." },
    "Norway": { i: "1519067793744-119192411b21", q: "Fjord fantasy.", f: "Did you know that Norway has a population of about 5.3 million people? Its capital city is Oslo." },
    "Ohio": { i: "1476610971033-5c8523b7a2d6", q: "The Buckeye State.", f: "Did you know that the Ohio State has a population of about 12 million people? Its biggest city is Columbus." },
    "Oklahoma": { i: "1449844908441-8829872d2607", q: "The Sooner State.", f: "Did you know that the Oklahoma State has a population of about 4 million people? Its biggest city is Oklahoma City." },
    "Oman": { i: "1469854523086-cc02fe5d8800", q: "Oman is waiting for you.", f: "Did you know that Oman has a population of about 4.8 million people? Its capital city is Masqat." },
    "Oregon": { i: "1469474968028-56623f02e42e", q: "The Beaver State.", f: "Did you know that the Oregon State has a population of about 4 million people? Its biggest city is Portland." },
    "Pakistan": { i: "1469854523086-cc02fe5d8800", q: "Pakistan is waiting for you.", f: "Did you know that Pakistan has a population of about 212 million people? Its capital city is Islamabad." },
    "Palau": { i: "1469854523086-cc02fe5d8800", q: "Palau is waiting for you.", f: "Did you know that Palau has a population of about 18 thousand people? Its capital city is Koror." },
    "Palestine": { i: "1469854523086-cc02fe5d8800", q: "Palestine is waiting for you.", f: "Did you know that Palestine has a population of about 4.6 million people? Its capital city is Gaza." },
    "Panama": { i: "1469854523086-cc02fe5d8800", q: "Panama is waiting for you.", f: "Did you know that Panama has a population of about 4.2 million people? Its capital city is Ciudad de Panamá." },
    "Papua New Guinea": { i: "1469854523086-cc02fe5d8800", q: "Papua New Guinea is waiting for you.", f: "Did you know that Papua New Guinea has a population of about 8.6 million people? Its capital city is Port Moresby." },
    "Paraguay": { i: "1469854523086-cc02fe5d8800", q: "Paraguay is waiting for you.", f: "Did you know that Paraguay has a population of about 7.0 million people? Its capital city is Asunción." },
    "Pennsylvania": { i: "1472214103451-9374bd1c798e", q: "The Keystone State.", f: "Did you know that the Pennsylvania State has a population of about 13 million people? Its biggest city is Philadelphia." },
    "Peru": { i: "1469854523086-cc02fe5d8800", q: "Peru is waiting for you.", f: "Did you know that Peru has a population of about 32 million people? Its capital city is Lima." },
    "Philippines": { i: "1469854523086-cc02fe5d8800", q: "Philippines is waiting for you.", f: "Did you know that Philippines has a population of about 107 million people? Its capital city is Manila." },
    "Poland": { i: "1469854523086-cc02fe5d8800", q: "Poland is waiting for you.", f: "Did you know that Poland has a population of about 38 million people? Its capital city is Warszawa." },
    "Portugal": { i: "1515232353913-9092d6e32a21", q: "Atlantic soulful.", f: "Did you know that Portugal has a population of about 10 million people? Its capital city is Lisboa." },
    "Qatar": { i: "1469854523086-cc02fe5d8800", q: "Qatar is waiting for you.", f: "Did you know that Qatar has a population of about 2.8 million people? Its capital city is Doha." },
    "Rhode Island": { i: "1501854140801-50d01698950b", q: "The Ocean State.", f: "Did you know that the Rhode Island State has a population of about 1 million people? Its biggest city is Providence." },
    "Romania": { i: "1469854523086-cc02fe5d8800", q: "Romania is waiting for you.", f: "Did you know that Romania has a population of about 19 million people? Its capital city is Bucuresti." },
    "Russia": { i: "1469854523086-cc02fe5d8800", q: "Russia is waiting for you.", f: "Did you know? Russia is full of hidden gems waiting to be explored." },
    "Rwanda": { i: "1469854523086-cc02fe5d8800", q: "Rwanda is waiting for you.", f: "Did you know that Rwanda has a population of about 12 million people? Its capital city is Kigali." },
    "Saint Kitts And Nevis": { i: "1469854523086-cc02fe5d8800", q: "Saint Kitts And Nevis is waiting for you.", f: "Did you know that Saint Kitts and Nevis has a population of about 52 thousand people? Its capital city is Basseterre." },
    "Saint Lucia": { i: "1469854523086-cc02fe5d8800", q: "Saint Lucia is waiting for you.", f: "Did you know that Saint Lucia has a population of about 182 thousand people? Its capital city is Castries." },
    "Saint Vincent": { i: "1469854523086-cc02fe5d8800", q: "Saint Vincent is waiting for you.", f: "Did you know? Saint Vincent is full of hidden gems waiting to be explored." },
    "Samoa": { i: "1469854523086-cc02fe5d8800", q: "Samoa is waiting for you.", f: "Did you know that Samoa has a population of about 196 thousand people? Its capital city is Apia." },
    "San Marino": { i: "1469854523086-cc02fe5d8800", q: "San Marino is waiting for you.", f: "Did you know that San Marino has a population of about 34 thousand people? Its capital city is San Marino." },
    "Sao Tome And Principe": { i: "1469854523086-cc02fe5d8800", q: "Sao Tome And Principe is waiting for you.", f: "Did you know that Sao Tome and Principe has a population of about 211 thousand people? Its capital city is São Tomé." },
    "Saudi Arabia": { i: "1469854523086-cc02fe5d8800", q: "Saudi Arabia is waiting for you.", f: "Did you know that Saudi Arabia has a population of about 34 million people? Its capital city is Riyadh." },
    "Senegal": { i: "1469854523086-cc02fe5d8800", q: "Senegal is waiting for you.", f: "Did you know that Senegal has a population of about 16 million people? Its capital city is Dakar." },
    "Serbia": { i: "1469854523086-cc02fe5d8800", q: "Serbia is waiting for you.", f: "Did you know that Serbia has a population of about 7.0 million people? Its capital city is Belgrade." },
    "Seychelles": { i: "1469854523086-cc02fe5d8800", q: "Seychelles is waiting for you.", f: "Did you know that Seychelles has a population of about 97 thousand people? Its capital city is Victoria." },
    "Sierra Leone": { i: "1469854523086-cc02fe5d8800", q: "Sierra Leone is waiting for you.", f: "Did you know that Sierra Leone has a population of about 7.7 million people? Its capital city is Freetown." },
    "Singapore": { i: "1469854523086-cc02fe5d8800", q: "Singapore is waiting for you.", f: "Did you know that Singapore has a population of about 5.6 million people? Its capital city is Singapore." },
    "Slovakia": { i: "1469854523086-cc02fe5d8800", q: "Slovakia is waiting for you.", f: "Did you know that Slovakia has a population of about 5.4 million people? Its capital city is Bratislava." },
    "Slovenia": { i: "1469854523086-cc02fe5d8800", q: "Slovenia is waiting for you.", f: "Did you know that Slovenia has a population of about 2.1 million people? Its capital city is Ljubljana." },
    "Solomon Islands": { i: "1469854523086-cc02fe5d8800", q: "Solomon Islands is waiting for you.", f: "Did you know that Solomon Islands has a population of about 653 thousand people? Its capital city is Honiara." },
    "Somalia": { i: "1469854523086-cc02fe5d8800", q: "Somalia is waiting for you.", f: "Did you know that Somalia has a population of about 15 million people? Its capital city is Mogadishu." },
    "South Africa": { i: "1469854523086-cc02fe5d8800", q: "South Africa is waiting for you.", f: "Did you know that South Africa has a population of about 58 million people? Its capital city is Pretoria." },
    "South Carolina": { i: "1470071131384-001b85755536", q: "The Palmetto State.", f: "Did you know that the South Carolina State has a population of about 5 million people? Its biggest city is Charleston." },
    "South Dakota": { i: "1465146344425-f00d5f5c8f07", q: "Mount Rushmore State.", f: "Did you know that the South Dakota State has a population of about 887 thousand people? Its biggest city is Sioux Falls." },
    "South Sudan": { i: "1469854523086-cc02fe5d8800", q: "South Sudan is waiting for you.", f: "Did you know that South Sudan has a population of about 11 million people? Its capital city is Juba." },
    "Spain": { i: "1506665531191-c414908a8a4a", q: "Passion and sun.", f: "Did you know that Spain has a population of about 47 million people? Its capital city is Madrid." },
    "Sri Lanka": { i: "1469854523086-cc02fe5d8800", q: "Sri Lanka is waiting for you.", f: "Did you know that Sri Lanka has a population of about 22 million people? Its capital city is Colombo, Sri Jayawardenepura Kotte." },
    "Sudan": { i: "1469854523086-cc02fe5d8800", q: "Sudan is waiting for you.", f: "Did you know that Sudan has a population of about 42 million people? Its capital city is Khartum." },
    "Suriname": { i: "1469854523086-cc02fe5d8800", q: "Suriname is waiting for you.", f: "Did you know that Suriname has a population of about 576 thousand people? Its capital city is Paramaribo." },
    "Sweden": { i: "1469854523086-cc02fe5d8800", q: "Sweden is waiting for you.", f: "Did you know that Sweden has a population of about 10 million people? Its capital city is Stockholm." },
    "Switzerland": { i: "1516584222044-1803503a7d48", q: "Mountain majesty.", f: "Did you know that Switzerland has a population of about 8.5 million people? Its capital city is Bern." },
    "Syria": { i: "1469854523086-cc02fe5d8800", q: "Syria is waiting for you.", f: "Did you know that Syria has a population of about 17 million people? Its capital city is Damascus." },
    "Taiwan": { i: "1469854523086-cc02fe5d8800", q: "Taiwan is waiting for you.", f: "Did you know? Taiwan is full of hidden gems waiting to be explored." },
    "Tajikistan": { i: "1469854523086-cc02fe5d8800", q: "Tajikistan is waiting for you.", f: "Did you know that Tajikistan has a population of about 9.1 million people? Its capital city is Dushanbe." },
    "Tanzania": { i: "1469854523086-cc02fe5d8800", q: "Tanzania is waiting for you.", f: "Did you know that Tanzania has a population of about 56 million people? Its capital city is Dodoma." },
    "Tennessee": { i: "1433086966358-54859d0ed716", q: "The Volunteer State.", f: "Did you know that the Tennessee State has a population of about 7 million people? Its biggest city is Nashville." },
    "Texas": { i: "1473448912268-2022ce9509d8", q: "The Lone Star State.", f: "Did you know that the Texas State has a population of about 29 million people? Its biggest city is Houston." },
    "Thailand": { i: "1528127269394-b7d91e0a2736", q: "Land of smiles.", f: "Did you know that Thailand has a population of about 69 million people? Its capital city is Bangkok." },
    "Timor-Leste": { i: "1469854523086-cc02fe5d8800", q: "Timor-Leste is waiting for you.", f: "Did you know? Timor-Leste is full of hidden gems waiting to be explored." },
    "Togo": { i: "1469854523086-cc02fe5d8800", q: "Togo is waiting for you.", f: "Did you know that Togo has a population of about 7.9 million people? Its capital city is Lomé." },
    "Tonga": { i: "1469854523086-cc02fe5d8800", q: "Tonga is waiting for you.", f: "Did you know that Tonga has a population of about 103 thousand people? Its capital city is Nuku'alofa." },
    "Trinidad And Tobago": { i: "1469854523086-cc02fe5d8800", q: "Trinidad And Tobago is waiting for you.", f: "Did you know that Trinidad and Tobago has a population of about 1.4 million people? Its capital city is Port-of-Spain." },
    "Tunisia": { i: "1469854523086-cc02fe5d8800", q: "Tunisia is waiting for you.", f: "Did you know that Tunisia has a population of about 12 million people? Its capital city is Tunis." },
    "Turkey": { i: "1524231754455-da7484439366", q: "East meets West.", f: "Did you know that Turkey has a population of about 82 million people? Its capital city is Ankara." },
    "Turkmenistan": { i: "1469854523086-cc02fe5d8800", q: "Turkmenistan is waiting for you.", f: "Did you know that Turkmenistan has a population of about 5.9 million people? Its capital city is Ashgabat." },
    "Tuvalu": { i: "1469854523086-cc02fe5d8800", q: "Tuvalu is waiting for you.", f: "Did you know that Tuvalu has a population of about 12 thousand people? Its capital city is Funafuti." },
    "UK": { i: "1486325212042-2e47fa4c13a0", q: "British heritage.", f: "Did you know that UK has a population of about 66 million people? Its capital city is London." },
    "Uae": { i: "1469854523086-cc02fe5d8800", q: "Uae is waiting for you.", f: "Did you know that UAE has a population of about 9.6 million people? Its capital city is Abu Dhabi." },
    "Uganda": { i: "1469854523086-cc02fe5d8800", q: "Uganda is waiting for you.", f: "Did you know that Uganda has a population of about 43 million people? Its capital city is Kampala." },
    "Uk": { i: "1469854523086-cc02fe5d8800", q: "Uk is waiting for you.", f: "Did you know that UK has a population of about 66 million people? Its capital city is London." },
    "Ukraine": { i: "1469854523086-cc02fe5d8800", q: "Ukraine is waiting for you.", f: "Did you know that Ukraine has a population of about 45 million people? Its capital city is Kyiv." },
    "United Arab Emirates (UAE)": { i: "1512453973954-47efef380d6d", q: "Future in the sand.", f: "Did you know? United Arab Emirates (UAE) is full of hidden gems waiting to be explored." },
    "Uruguay": { i: "1469854523086-cc02fe5d8800", q: "Uruguay is waiting for you.", f: "Did you know that Uruguay has a population of about 3.4 million people? Its capital city is Montevideo." },
    "Usa": { i: "1469854523086-cc02fe5d8800", q: "Usa is waiting for you.", f: "Did you know that USA has a population of about 327 million people? Its capital city is Washington." },
    "Utah": { i: "1447752875215-b2761acb3c5d", q: "Life Elevated.", f: "Did you know that the Utah State has a population of about 3 million people? Its biggest city is Salt Lake City." },
    "Uzbekistan": { i: "1469854523086-cc02fe5d8800", q: "Uzbekistan is waiting for you.", f: "Did you know that Uzbekistan has a population of about 33 million people? Its capital city is Toskent." },
    "Vanuatu": { i: "1469854523086-cc02fe5d8800", q: "Vanuatu is waiting for you.", f: "Did you know that Vanuatu has a population of about 293 thousand people? Its capital city is Port-Vila." },
    "Vatican City": { i: "1469854523086-cc02fe5d8800", q: "Vatican City is waiting for you.", f: "Did you know? Vatican City is full of hidden gems waiting to be explored." },
    "Venezuela": { i: "1469854523086-cc02fe5d8800", q: "Venezuela is waiting for you.", f: "Did you know that Venezuela has a population of about 29 million people? Its capital city is Caracas." },
    "Vermont": { i: "1464822759023-fed622ff2c3b", q: "The Green Mountain State.", f: "Did you know that the Vermont State has a population of about 643 thousand people? Its biggest city is Burlington." },
    "Vietnam": { i: "1528127269394-b7d91e0a2736", q: "Timeless charm.", f: "Did you know that Vietnam has a population of about 96 million people? Its capital city is Hanoi." },
    "Virginia": { i: "1507525428034-b723cf961d3e", q: "Virginia is for Lovers.", f: "Did you know that the Virginia State has a population of about 9 million people? Its biggest city is Virginia Beach." },
    "Washington": { i: "1476610971033-5c8523b7a2d6", q: "The Evergreen State.", f: "Did you know that the Washington State has a population of about 8 million people? Its biggest city is Seattle." },
    "West Virginia": { i: "1449844908441-8829872d2607", q: "Mountain Mama.", f: "Did you know that the West Virginia State has a population of about 2 million people? Its biggest city is Charleston." },
    "Wisconsin": { i: "1469474968028-56623f02e42e", q: "America's Dairyland.", f: "Did you know that the Wisconsin State has a population of about 6 million people? Its biggest city is Milwaukee." },
    "Wyoming": { i: "1472214103451-9374bd1c798e", q: "The Equality State.", f: "Did you know that the Wyoming State has a population of about 577 thousand people? Its biggest city is Cheyenne." },
    "Yemen": { i: "1469854523086-cc02fe5d8800", q: "Yemen is waiting for you.", f: "Did you know that Yemen has a population of about 28 million people? Its capital city is Sanaa." },
    "Zambia": { i: "1469854523086-cc02fe5d8800", q: "Zambia is waiting for you.", f: "Did you know that Zambia has a population of about 17 million people? Its capital city is Lusaka." },
    "Zimbabwe": { i: "1469854523086-cc02fe5d8800", q: "Zimbabwe is waiting for you.", f: "Did you know that Zimbabwe has a population of about 14 million people? Its capital city is Harare." },
};

const TRAVEL_DATA_DEFAULT = {
    q: 'The world is a book, and those who do not travel read only one page.',
    i: '1469854523086-cc02fe5d8800',
    f: 'Traveling is the best way to learn about the world.'
};

function getMediaForTrip(trip) {
    if (!trip) return { quotes: [TRAVEL_DATA_DEFAULT.q], images: [`https://images.unsplash.com/photo-${TRAVEL_DATA_DEFAULT.i}?auto=format&fit=crop&w=1600&q=80`], facts: [TRAVEL_DATA_DEFAULT.f] };
    
    let data = null;
    const countryStr = trip.country || '';
    
    if (countryStr.includes(' - ')) {
        const parts = countryStr.split(' - ');
        const state = parts[1];
        if (DESTINATION_DATA[state]) {
            data = DESTINATION_DATA[state];
        }
    } else if (DESTINATION_DATA[countryStr]) {
        data = DESTINATION_DATA[countryStr];
    } else if (countryStr === 'United States (USA)') {
        data = DESTINATION_DATA['Usa'] || DESTINATION_DATA['United States'];
    }
    
    if (!data) {
        // Dynamic fallback for other countries
        data = {
            q: `${countryStr} is waiting for you.`,
            i: "1501854140801-50d01698950b",
            f: `Did you know? ${countryStr} is full of hidden gems waiting to be explored.`
        };
    }
    
    return {
        quotes: [data.q],
        images: [`https://images.unsplash.com/photo-${data.i}?auto=format&fit=crop&w=1600&q=80`],
        facts: [data.f]
    };
}


window.showLiquidAlert = (msg) => {
    const alert = document.createElement('div');
    alert.className = 'liquid-alert';
    alert.style.position = 'fixed';
    alert.style.bottom = '40px';
    alert.style.left = '50%';
    alert.style.transform = 'translateX(-50%) translateY(100px)';
    alert.style.background = 'rgba(255,255,255,0.7)';
    alert.style.backdropFilter = 'blur(20px)';
    alert.style.padding = '16px 32px';
    alert.style.borderRadius = '980px';
    alert.style.border = '1px solid rgba(255,255,255,0.4)';
    alert.style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)';
    alert.style.color = '#002d5b';
    alert.style.fontWeight = '700';
    alert.style.zIndex = '99999';
    alert.style.transition = 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
    alert.innerHTML = `<span>⚠️ ${msg}</span>`;
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
    
    setTimeout(() => {
        alert.style.transform = 'translateX(-50%) translateY(100px)';
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 500);
    }, 3000);
};

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
                archived_trips: STATE.archivedTrips || [],
                expenses: STATE.expenses,
                activities: STATE.activities,
                photos: STATE.photos,
                groups: STATE.groups,
                categories: STATE.categories || [],
                budgets: STATE.budgets || []
            })
        });
    } catch (e) {
        console.error("Sync failed:", e);
    }
}

async function fetchNotifications() {
    if (!STATE.user) return;
    try {
        const res = await fetch(`/api/notifications/list?user_id=${encodeURIComponent(STATE.user.id)}`);
        const notifications = await res.json();
        STATE.notifications = notifications;
        updateNotificationUI();
    } catch (e) {
        console.error("Failed to fetch notifications:", e);
    }
}

function updateNotificationUI() {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    const unreadCount = STATE.notifications.filter(n => !n.is_read).length;
    if (unreadCount > 0) {
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
    renderNotificationDropdown();
}

async function markNotificationsRead() {
    if (!STATE.user) return;
    try {
        await fetch('/api/notifications/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: STATE.user.id })
        });
        STATE.notifications.forEach(n => n.is_read = 1);
        updateNotificationUI();
    } catch (e) {
        console.error("Failed to mark notifications read:", e);
    }
}

function renderNotificationDropdown() {
    const list = document.getElementById('notificationList');
    if (!list) return;
    
    if (STATE.notifications.length === 0) {
        list.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-secondary); font-size: 0.9rem;">No new notifications</div>`;
        return;
    }

    list.innerHTML = STATE.notifications.map(n => {
        let actionHtml = '';
        if (n.type === 'friend_request' && !n.is_read) {
            actionHtml = `
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="btn btn-small" style="padding: 4px 12px; font-size: 0.8rem;" onclick="window.acceptFriendRequest('${n.related_id}')">Accept</button>
                </div>
            `;
        }
        
        return `
            <div style="padding: 16px; border-bottom: 1px solid var(--glass-border); background: ${n.is_read ? 'transparent' : 'rgba(0,122,255,0.05)'};">
                <div style="font-size: 0.9rem; color: var(--text-primary); line-height: 1.4;">
                    ${n.message}
                </div>
                ${actionHtml}
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px;">
                    ${new Date(n.created_at).toLocaleString()}
                </div>
            </div>
        `;
    }).join('');
}

window.acceptFriendRequest = async (friendId) => {
    if (!STATE.user) return;
    try {
        await fetch('/api/friends/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: STATE.user.id, friend_id: friendId })
        });
        // Remove the request notification visually or mark as read
        await fetchNotifications();
        if (STATE.currentPage === 'friends') {
            navigate('friends'); // Refresh friends page
        }
    } catch (e) {
        console.error("Failed to accept friend request:", e);
    }
};

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
    profile: renderProfile,
    'archived-detail': () => renderArchivedTripDetail(STATE.activeDetailId)
};

function navigate(pageId, data = null, shouldPushState = true) {
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

    // History API Integration
    if (shouldPushState) {
        const url = new URL(window.location);
        url.searchParams.set('page', pageId);
        if (data && data.id) url.searchParams.set('id', data.id);
        else url.searchParams.delete('id');
        window.history.pushState({ pageId, data }, '', url);
    }

    const container = document.getElementById('app-container');
    container.innerHTML = '';

    if (pages[pageId]) {
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
        // Shuffled slideshow for when NO trip is selected (Inspirational Quotes ONLY)
        displayImages = INSPIRATIONAL_PAIRS.map(p => p.i);
        displayQuotes = INSPIRATIONAL_PAIRS.map(p => p.q);

        // Shuffle the inspirational content
        const indices = Array.from({ length: displayImages.length }, (_, i) => i);
        indices.sort(() => Math.random() - 0.5);
        displayImages = indices.map(i => displayImages[i]);
        displayQuotes = indices.map(i => displayQuotes[i]);
    } else {
        // STATIC single image and alternate between quote/fact for the ACTIVE trip
        const data = getMediaForTrip(activeTrip);
        
        let showQuote = localStorage.getItem('home_media_toggle') !== 'fact';
        localStorage.setItem('home_media_toggle', showQuote ? 'fact' : 'quote');

        displayImages = [data.images[0]];
        displayQuotes = [showQuote ? data.quotes[0] : data.facts[0]];
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
    } else {
        const tripExpenses = (STATE.expenses || []).filter(e => e && e.tripId === activeTrip.id);
        const tripDays = (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id);
        const isFresh = tripExpenses.length === 0 && tripDays.length === 0;

        let greeting = "Welcome back, traveler";
        if (isFresh && activeTrip.country) {
            // Show state name only when it's a US state (format: "USA - California")
            const displayCountry = activeTrip.country.includes(' - ')
                ? activeTrip.country.split(' - ')[1]
                : activeTrip.country;
            const greetings = [
                `${displayCountry} is a phenomenal choice!`,
                `Ready to dive into ${displayCountry}?`,
                `Let's make memories in ${displayCountry}.`,
                `${displayCountry} awaits your arrival.`,
                `A blank canvas in ${displayCountry}. Let's plan!`,
                `Your ${displayCountry} adventure starts here.`,
                `Time to write your ${displayCountry} story.`
            ];
            greeting = greetings[Math.floor(Math.random() * greetings.length)];
        }

        div.innerHTML = `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${greeting}</h1>
                <p>You have <strong>${tripExpenses.length}</strong> expenses recorded for ${activeTrip.name}.</p>
            </div>
            
            <div class="card glass" style="padding: 0; overflow: hidden; height: 400px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
                <div id="homeHeroMap" style="width: 100%; height: 100%; position: absolute; inset: 0; z-index: 0;"></div>
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); pointer-events: none; z-index: 1;"></div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; pointer-events: none; z-index: 2;">
                    <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out;">
                        ${displayQuotes[0] || ''}
                    </p>
                </div>
            </div>
        `;

        setTimeout(() => {
            const mapContainer = document.getElementById('homeHeroMap');
            if (mapContainer && !mapContainer._leaflet_id) {
                // Add custom styling for map tooltips
                if (!document.getElementById('map-custom-css')) {
                    const style = document.createElement('style');
                    style.id = 'map-custom-css';
                    style.innerHTML = `
                        .city-tooltip { background: rgba(0,0,0,0.7); color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-weight: bold; backdrop-filter: blur(10px); cursor: pointer; transition: background 0.2s, opacity 0.3s; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
                        .city-tooltip:hover { background: var(--accent-blue); }
                        .leaflet-tooltip-top:before { border-top-color: rgba(0,0,0,0.7); }
                        #homeHeroMap.hide-city-labels .city-tooltip:not(.biggest-city-tooltip) { opacity: 0 !important; pointer-events: none !important; }
                    `;
                    document.head.appendChild(style);
                }

                let query = activeTrip.country || '';
                const isUSState = query.includes(' - ');
                if (isUSState) {
                    query = query.split(' - ')[1] + ', USA';
                }

                const map = L.map('homeHeroMap', {
                    zoomControl: false,
                    doubleClickZoom: false,
                    scrollWheelZoom: true
                }).setView([20, 0], 2);

                // Restore saved map view per trip
                const tripMapKey = activeTrip ? activeTrip.id : null;
                const savedMapView = tripMapKey && STATE.mapViews && STATE.mapViews[tripMapKey];

                if (savedMapView) {
                    map.setView([savedMapView.lat, savedMapView.lng], savedMapView.zoom, { animate: false });
                }

                // Base Satellite View ONLY (No global frontiers or painted text)
                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    attribution: 'Tiles &copy; Esri',
                    maxZoom: 18
                }).addTo(map);

                // Add pins for accepted Trip Days that have locations
                const currentTripDays = activeTrip ? (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id) : [];
                currentTripDays.forEach(day => {
                    if (day.lat && day.lon) {
                        const icon = L.divIcon({
                            className: '',
                            html: `<div style="width:28px;height:28px;background:linear-gradient(135deg,#9b59b6,#007aff);border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:0.75rem;border:2px solid white;box-shadow:0 4px 12px rgba(0,0,0,0.4);cursor:pointer;font-family:-apple-system,sans-serif;">${day.dayNumber}</div>`,
                            iconSize: [28, 28], iconAnchor: [14, 14]
                        });

                        const marker = L.marker([day.lat, day.lon], { icon }).addTo(map);
                        marker.bindTooltip(`Day ${day.dayNumber}: ${day.name}`, {
                            permanent: false,
                            interactive: true,
                            direction: 'top',
                            className: 'city-tooltip',
                            offset: [0, -10]
                        });
                        marker.on('click', () => {
                            map.flyTo([day.lat, day.lon], 12, { duration: 1.5 });
                        });
                    }
                });

                const nominatimLimit = isUSState ? 5 : 1;
                fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${nominatimLimit}&polygon_geojson=1&extratags=1`)
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.length > 0) {
                            // For US states, prefer the admin_level=4 result (the state boundary, not the city)
                            let result = data[0];
                            if (isUSState) {
                                const stateResult = data.find(r => r.extratags && r.extratags.admin_level === '4');
                                if (stateResult) result = stateResult;
                            }

                            // Draw only the requested country/state border
                            if (result.geojson) {
                                L.geoJSON(result.geojson, {
                                    style: {
                                        color: '#007aff',
                                        weight: 3,
                                        opacity: 0.9,
                                        fillOpacity: 0.05,
                                        dashArray: '5, 10'
                                    }
                                }).addTo(map);
                            }

                            if (result.boundingbox) {
                                const bbox = result.boundingbox; // [latMin, latMax, lonMin, lonMax]
                                const bounds = [
                                    [parseFloat(bbox[0]), parseFloat(bbox[2])], // SouthWest
                                    [parseFloat(bbox[1]), parseFloat(bbox[3])]  // NorthEast
                                ];

                                // Only fitBounds on first visit — if user has a saved view, respect it
                                if (!savedMapView) {
                                    map.fitBounds(bounds, { padding: [10, 10] });
                                }

                                // NOW attach the move/zoom save listener, after all initial positioning is done
                                // This ensures fitBounds never accidentally overwrites the user's saved position
                                map.on('moveend', () => {
                                    if (!tripMapKey) return;
                                    if (!STATE.mapViews) STATE.mapViews = {};
                                    const c = map.getCenter();
                                    STATE.mapViews[tripMapKey] = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
                                    saveState();
                                });

                                // Fetch Top Cities STRICTLY INSIDE the geometry via Overpass API
                                let overpassQuery = "";
                                let areaId = null;
                                if (result.osm_type === 'relation') {
                                    areaId = 3600000000 + parseInt(result.osm_id);
                                } else if (result.osm_type === 'way') {
                                    areaId = 2400000000 + parseInt(result.osm_id);
                                }

                                if (areaId) {
                                    overpassQuery = `[out:json][timeout:10];area(${areaId})->.searchArea;node["place"="city"](area.searchArea);out center;`;
                                } else {
                                    const bboxStr = `${bbox[0]},${bbox[2]},${bbox[1]},${bbox[3]}`;
                                    overpassQuery = `[out:json][timeout:10];node["place"="city"](${bboxStr});out center;`;
                                }

                                fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`)
                                    .then(r => r.json())
                                    .then(cityData => {
                                        if (cityData && cityData.elements) {
                                            // Sort by population and slice top 8
                                            const cities = cityData.elements.sort((a, b) => {
                                                const popA = parseInt((a.tags && a.tags.population) || 0);
                                                const popB = parseInt((b.tags && b.tags.population) || 0);
                                                return popB - popA;
                                            }).slice(0, 8);
                                            
                                            cities.forEach((city, index) => {
                                                if (city.lat && city.lon && city.tags && city.tags.name) {
                                                    const marker = L.circleMarker([city.lat, city.lon], {
                                                        radius: 6,
                                                        fillColor: "#007aff",
                                                        color: "#ffffff",
                                                        weight: 2,
                                                        opacity: 1,
                                                        fillOpacity: 1
                                                    }).addTo(map);
                                                    
                                                    const tooltipClass = index === 0 ? 'city-tooltip biggest-city-tooltip' : 'city-tooltip';
                                                    
                                                    marker.bindTooltip(city.tags.name, { 
                                                        permanent: true, 
                                                        interactive: true,
                                                        direction: 'top', 
                                                        className: tooltipClass,
                                                        offset: [0, -5]
                                                    });
                                                    
                                                    marker.on('click', () => {
                                                        map.flyTo([city.lat, city.lon], 12, { duration: 1.5 });
                                                    });
                                                }
                                            });

                                            // Toggle labels based on zoom
                                            const updateLabels = () => {
                                                if (map.getZoom() < 8) {
                                                    mapContainer.classList.add('hide-city-labels');
                                                } else {
                                                    mapContainer.classList.remove('hide-city-labels');
                                                }
                                            };
                                            map.on('zoomend', updateLabels);
                                            updateLabels(); // Initial check
                                        }
                                    }).catch(e => console.error("City fetch failed", e));

                            } else {
                                const lat = parseFloat(result.lat);
                                const lon = parseFloat(result.lon);
                                map.setView([lat, lon], query.includes('USA') ? 6 : 5);
                            }
                        }
                    })
                    .catch(err => console.error("Map geocoding failed", err));
            }
        }, 100);
    }

    // Shared logic for guide and days
    const tripExpenses = activeTrip ? (STATE.expenses || []).filter(e => e && e.tripId === activeTrip.id) : [];
    const tripDays = activeTrip ? (STATE.tripDays || []).filter(d => d.tripId === activeTrip.id) : [];


    // Getting Started Guide Checklist
    const guideContainer = document.createElement('div');
    guideContainer.style.marginTop = '40px';

    if (!STATE.guideProgress) STATE.guideProgress = {};

    const hasLogin = !!STATE.user || window.isGoogleAuthenticated === true;
    const hasTrip = STATE.trips.length > 0;
    const hasCompanions = (STATE.groups || []).length > 0;
    const hasPlan = tripDays.length > 0;
    const hasExpenses = tripExpenses.length > 0;
    const hasBudgets = STATE.budgets && STATE.budgets.length > 0;
    const hasCollections = STATE.archivedTrips && STATE.archivedTrips.length > 0;
    const hasCategories = (STATE.categories || []).length > 3; // Default is 3
    const hasSettlement = STATE.expenses.some(e => e.isSettlement);
    const hasFriends = false;

    if (hasLogin) STATE.guideProgress.login = true;
    if (hasTrip) STATE.guideProgress.trip = true;
    if (hasCompanions) STATE.guideProgress.companions = true;
    if (hasPlan) STATE.guideProgress.plan = true;
    if (hasExpenses) STATE.guideProgress.expenses = true;
    if (hasBudgets) STATE.guideProgress.budgets = true;
    if (hasCollections) STATE.guideProgress.collections = true;
    if (hasCategories) STATE.guideProgress.categories = true;
    if (hasSettlement) STATE.guideProgress.settlement = true;
    if (hasFriends) STATE.guideProgress.friends = true;

    const steps = [
        { text: "Log in to your account", done: STATE.guideProgress.login, icon: "🔐", action: () => navigate('profile') },
        { text: "Create your first trip", done: STATE.guideProgress.trip, icon: "✈️", action: () => window.openNewTripModal() },
        { text: "Add your travel companions", done: STATE.guideProgress.companions, icon: "👥", action: () => window.showPersonalizationTab('companions') },
        { text: "Set your own categories", done: STATE.guideProgress.categories, icon: "🏷️", action: () => window.showPersonalizationTab('categories') },
        { text: 'Generate your AI travel plan<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(or <span onclick="event.stopPropagation(); if(STATE.activeTripId){ window.openAddDayModal(STATE.activeTripId); } else { window.showLiquidAlert(\'Create a trip first\'); }" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">create it manually</span>)</span>', done: STATE.guideProgress.plan, icon: "✦", action: () => navigate('ai') },
        { text: 'Input your expenses<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(<span onclick="event.stopPropagation(); navigate(\'expenses\')" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">Manually</span> or <span onclick="event.stopPropagation(); navigate(\'upload\')" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">in a batch</span>)</span>', done: STATE.guideProgress.expenses, icon: "💰", action: () => navigate('expenses') },
        { text: "Explore Budgets", done: STATE.guideProgress.budgets, icon: "📊", action: () => navigate('budgets') },
        { text: "Settle your first expenses", done: STATE.guideProgress.settlement, icon: "🤝", action: () => navigate('settlement') },
        { text: "Discover Collections", done: STATE.guideProgress.collections, icon: "📂", action: () => navigate('collections') },
        { text: "Connect with your friends", done: STATE.guideProgress.friends, icon: "📱", action: () => navigate('friends') }
    ];

    const allDone = steps.every(s => s.done) || STATE.guideAllDone;
    if (allDone && !STATE.guideAllDone) {
        STATE.guideAllDone = true;
        saveState();
    }



    // No interval for active trips - keep it simple and aesthetic


    // Trip Days Section
    const daysContainer = document.createElement('div');
    daysContainer.style.marginTop = '40px';

    tripDays.sort((a, b) => a.dayNumber - b.dayNumber);

    daysContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <h2 style="font-size: 1.5rem; letter-spacing: -0.02em; margin: 0;">Your Journey</h2>
            </div>
            <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600; margin-top: 4px;">${tripDays.length} Day${tripDays.length !== 1 ? 's' : ''} Planned</span>
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

    if (activeTrip) {
        div.appendChild(daysContainer);

        setTimeout(() => {
            const addBtn = div.querySelector('#addDayBtn');
            if (addBtn) addBtn.onclick = () => window.openAddDayModal(activeTrip.id);
        }, 0);
    }

    // Toggle state for Quick Access (Moved to bottom)
    const isHidden = STATE.hideQuickAccess === true;

    if (isHidden) {
        const showBtnContainer = document.createElement('div');
        showBtnContainer.style.textAlign = 'center';
        showBtnContainer.style.marginTop = '40px';
        showBtnContainer.innerHTML = `
            <button class="btn btn-liquid-glass" style="padding: 10px 24px; border-radius: 980px; font-size: 0.85rem; font-weight: 700; color: #002d5b; border: 1px solid rgba(0,0,0,0.05); background: rgba(255,255,255,0.4);" onmouseover="this.style.background='rgba(255,255,255,0.7)';" onmouseout="this.style.background='rgba(255,255,255,0.4)';">
                🧭 Show Quick Access
            </button>
        `;
        showBtnContainer.querySelector('button').onclick = () => {
            STATE.hideQuickAccess = false;
            saveState();
            navigate('home');
        };
        div.appendChild(showBtnContainer);
    } else {
        guideContainer.innerHTML = `
            <div class="card glass" style="padding: 32px; border-radius: 28px; border: 1.5px solid ${allDone ? 'rgba(0,0,0,0.05)' : 'rgba(0, 122, 255, 0.15)'}; background: ${allDone ? 'rgba(255,255,255,0.4)' : 'linear-gradient(165deg, rgba(255,255,255,0.9), rgba(240,247,255,0.8))'}; position: relative;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: ${allDone ? '#000000' : 'var(--accent-blue)'}; color: white; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">${allDone ? '⚡️' : '🧭'}</div>
                        <h2 style="margin: 0; font-size: 1.5rem; letter-spacing: -0.02em; color: #002d5b;">${allDone ? 'Quick Access' : 'Getting Started Guide'}</h2>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${allDone ? `<span style="font-size: 0.75rem; font-weight: 800; color: rgba(0,45,91,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Toolbar</span>` : ''}
                        <button id="hideQuickAccessBtn" style="background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.05); padding: 6px 14px; border-radius: 980px; color: rgba(0,0,0,0.5); cursor: pointer; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.1)'; this.style.color='#ff3b30'; this.style.borderColor='rgba(255,59,48,0.2)';" onmouseout="this.style.background='rgba(0,0,0,0.05)'; this.style.color='rgba(0,0,0,0.5)'; this.style.borderColor='rgba(0,0,0,0.05)';">Hide</button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    ${steps.map((step, i) => {
            const showTick = !allDone && step.done;
            return `
                        <div class="guide-step-card" data-index="${i}" style="display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: ${showTick ? 'rgba(52, 199, 89, 0.08)' : 'white'}; border-radius: 20px; border: 1px solid ${showTick ? 'rgba(52, 199, 89, 0.2)' : 'rgba(0,0,0,0.05)'}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 24px rgba(0,0,0,0.08)';" onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                            ${allDone ? `
                            <div style="font-size: 1.4rem; flex-shrink: 0; line-height: 1;">${step.icon}</div>
                            ` : `
                            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${showTick ? '#34c759' : 'rgba(0,45,91,0.1)'}; display: flex; align-items: center; justify-content: center; color: ${showTick ? '#34c759' : 'rgba(0,0,0,0.4)'}; font-weight: 800; font-size: 0.8rem; background: ${showTick ? 'white' : 'rgba(0,0,0,0.02)'}; flex-shrink: 0;">
                                ${showTick ? '✓' : step.icon}
                            </div>
                            `}
                            <div style="display: flex; flex-direction: column;">
                                ${!allDone ? `<div style="font-size: 0.75rem; font-weight: 800; color: ${showTick ? '#34c759' : 'rgba(0,45,91,0.4)'}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Step ${i + 1}</div>` : ''}
                                <div style="font-size: 1rem; font-weight: 700; color: ${showTick ? 'rgba(0,45,91,0.6)' : '#002d5b'}; text-decoration: ${showTick ? 'line-through' : 'none'};">
                                    ${step.text}
                                </div>
                            </div>
                        </div>
                    `}).join('')}
                </div>
            </div>
        `;

        setTimeout(() => {
            guideContainer.querySelectorAll('.guide-step-card').forEach(card => {
                card.onclick = () => {
                    const idx = card.dataset.index;
                    if (steps[idx].action) steps[idx].action();
                };
            });
            const hBtn = guideContainer.querySelector('#hideQuickAccessBtn');
            if (hBtn) hBtn.onclick = (e) => {
                e.stopPropagation();
                STATE.hideQuickAccess = true;
                saveState();
                navigate('home');
            };
        }, 0);

        div.appendChild(guideContainer);
    }

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
        <h1 style="margin-bottom: 32px;">Expenses</h1>
        <div style="display: flex; flex-direction: column; gap: 60px;">
            <!-- Add Expense Section -->
            <div class="card glass" style="max-width: 600px; margin: 0 auto; width: 100%; border-radius: 44px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); padding: 48px; box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
                <h2 class="card-title" style="font-size: 2.2rem; margin-bottom: 32px; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Expense</h2>
                <form id="expenseForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    
                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Who Paid</label>
                        <select id="expWho" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            ${peopleOptions}
                        </select>
                        ${!STATE.groups || STATE.groups.length === 0 ? `
                        <div style="margin-top: 12px; font-size: 0.85rem; color: #0071e3; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;" onclick="navigate('personalization'); setTimeout(() => window.showPersTab('companions'), 50);">
                            <span>➕</span> <span style="text-decoration: underline;">Add companions in the personalization section</span>
                        </div>` : ''}
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Category</label>
                        <select id="expCategory" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            ${categoryOptions}
                        </select>
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Label</label>
                        <input type="text" id="expLabel" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" placeholder="e.g. Dinner at Mario's" required>
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Date</label>
                        <input type="date" id="expDate" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px; position: relative;" id="countrySearchContainer">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Country</label>
                        <div class="custom-select-wrapper">
                            <input type="text" id="expCountry" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" placeholder="Search country..." autocomplete="off">
                            <div id="countryDropdownList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 250px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                                ${COUNTRIES.sort().map(c => `<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${c}">${c}</div>`).join('')}
                                <div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="Other">Other</div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Value</label>
                        <input type="number" step="0.01" id="expValue" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 700; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                    </div>

                    <div style="margin-bottom: 32px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Currency</label>
                        <select id="expCurrency" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            <option value="">Select Currency...</option>
                            ${Object.keys(CONVERSION_RATES).map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 40px; background: rgba(0,0,0,0.03); padding: 32px; border-radius: 32px; border: 1px solid rgba(0,0,0,0.05); width: 100%; max-width: 440px; box-sizing: border-box;">
                        <label style="display: block; margin-bottom: 16px; font-size: 0.9rem; font-weight: 800; color: #000000; letter-spacing: -0.02em;">Split Between</label>
                        <div style="display: flex; gap: 14px; margin-bottom: 20px;">
                            <select id="addSplitSelect" class="glass-input" style="flex: 1; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.4); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;">
                                <option value="">Add person to split...</option>
                                ${STATE.groups.map(p => `<option value="${p}">${p}</option>`).join('')}
                            </select>
                            <button type="button" id="addSplitBtn" class="btn btn-small" style="padding: 0 24px; height: 50px; border-radius: 16px; background: #0071e3; color: #ffffff; font-weight: 700;">+ Add</button>
                        </div>
                        <div id="splitContainer" style="display: flex; flex-direction: column; gap: 12px;">
                            <!-- Dynamic splitters appear here -->
                        </div>
                    </div>
                    <button type="submit" class="btn" style="width: 100%; max-width: 440px; padding: 20px; font-size: 1.2rem; font-weight: 800; border-radius: 24px; background: #0071e3; color: #ffffff; box-shadow: 0 15px 40px rgba(0,113,227,0.3); transition: all 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 20px 50px rgba(0,113,227,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 15px 40px rgba(0,113,227,0.3)';">Save Expense</button>
                </form>
            </div>

            <!-- All Expenses Section -->
            <div id="expensesContainer" style="max-width: 1000px; margin: 0 auto; width: 100%; margin-bottom: 60px;">
                <div style="margin-bottom: 40px; padding: 0 10px;">
                    <div class="card glass" style="padding: 32px; border-radius: 32px; background: linear-gradient(135deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1)); border: 1px solid rgba(255,255,255,0.5); box-shadow: 0 20px 50px rgba(0,0,0,0.05);">
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                            <h2 style="font-size: 1.8rem; font-weight: 800; letter-spacing: -0.04em; margin: 0;">Expense History</h2>
                            <div style="display: flex; gap: 8px;">
                                <button id="clearFiltersBtn" style="font-size: 0.7rem; font-weight: 700; color: #ff3b30; background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.1); padding: 6px 14px; border-radius: 100px; text-transform: uppercase; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.15)';" onmouseout="this.style.background='rgba(255,59,48,0.08)';">Clear Filters</button>
                                <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-blue); background: rgba(0,113,227,0.1); padding: 6px 14px; border-radius: 100px; text-transform: uppercase;">Smart Filters</span>
                            </div>
                        </div>

                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
                            <!-- Text Search -->
                            <div style="grid-column: span 2;">
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Search</label>
                                <input type="text" id="filterSearch" class="glass-input" placeholder="Search labels or items..." style="width: 100%; padding: 12px 18px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);">
                            </div>

                            <!-- Category -->
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Category</label>
                                <select id="filterCategory" class="glass-input" style="width: 100%; padding: 12px 18px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);">
                                    <option value="all">All Categories</option>
                                    ${STATE.categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}
                                    <option value="settlement">🤝 Settlement</option>
                                </select>
                            </div>

                            <!-- Person -->
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Payer</label>
                                <select id="filterWho" class="glass-input" style="width: 100%; padding: 12px 18px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);">
                                    <option value="all">Everyone</option>
                                    ${STATE.groups.map(p => `<option value="${p}">${p}</option>`).join('')}
                                </select>
                            </div>

                            <!-- Date Range -->
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">From Date</label>
                                <input type="date" id="filterDateFrom" class="glass-input" style="width: 100%; padding: 12px 18px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">To Date</label>
                                <input type="date" id="filterDateTo" class="glass-input" style="width: 100%; padding: 12px 18px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);">
                            </div>

                            <!-- Price Range -->
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Min Value (€)</label>
                                <input type="number" id="filterMinVal" class="glass-input" placeholder="0" style="width: 100%; padding: 12px 18px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Max Value (€)</label>
                                <input type="number" id="filterMaxVal" class="glass-input" placeholder="Max" style="width: 100%; padding: 12px 18px; border-radius: 14px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.05);">
                            </div>
                        </div>
                    </div>
                </div>
                <div id="tripExpensesList" style="display: flex; flex-direction: column; gap: 20px;"></div>
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
            renderTripExpenses(div.querySelector('#tripExpensesList'));
            form.reset();
            activeSplitters = [];
            updateSplitUI();
        });

        // Filter Logic
        const filterExps = () => {
            const search = div.querySelector('#filterSearch').value.toLowerCase();
            const catId = div.querySelector('#filterCategory').value;
            const who = div.querySelector('#filterWho').value;
            const dateFrom = div.querySelector('#filterDateFrom').value;
            const dateTo = div.querySelector('#filterDateTo').value;
            const minVal = parseFloat(div.querySelector('#filterMinVal').value) || 0;
            const maxVal = parseFloat(div.querySelector('#filterMaxVal').value) || Infinity;
            
            renderTripExpenses(div.querySelector('#tripExpensesList'), { 
                search, catId, who, dateFrom, dateTo, minVal, maxVal 
            });
        };

        div.querySelector('#filterSearch').oninput = filterExps;
        div.querySelector('#filterCategory').onchange = filterExps;
        div.querySelector('#filterWho').onchange = filterExps;
        div.querySelector('#filterDateFrom').onchange = filterExps;
        div.querySelector('#filterDateTo').onchange = filterExps;
        div.querySelector('#filterMinVal').oninput = filterExps;
        div.querySelector('#filterMaxVal').oninput = filterExps;

        div.querySelector('#clearFiltersBtn').onclick = () => {
            div.querySelector('#filterSearch').value = '';
            div.querySelector('#filterCategory').value = 'all';
            div.querySelector('#filterWho').value = 'all';
            div.querySelector('#filterDateFrom').value = '';
            div.querySelector('#filterDateTo').value = '';
            div.querySelector('#filterMinVal').value = '';
            div.querySelector('#filterMaxVal').value = '';
            renderTripExpenses(div.querySelector('#tripExpensesList'));
        };

        renderTripExpenses(div.querySelector('#tripExpensesList'));
        updateSplitUI();
    }, 0);

    return div;
}

function renderTripExpenses(container, filters = {}) {
    if (!container) return;

    let tripExpenses = STATE.expenses.filter(e => e.tripId === STATE.activeTripId);

    // Apply Filters
    if (filters.search) {
        tripExpenses = tripExpenses.filter(e => e.label.toLowerCase().includes(filters.search));
    }
    if (filters.catId && filters.catId !== 'all') {
        if (filters.catId === 'settlement') {
            tripExpenses = tripExpenses.filter(e => e.isSettlement);
        } else {
            tripExpenses = tripExpenses.filter(e => e.categoryId === filters.catId && !e.isSettlement);
        }
    } else {
        // By default, only show non-settlements unless filtered for settlements
        tripExpenses = tripExpenses.filter(e => !e.isSettlement);
    }
    if (filters.who && filters.who !== 'all') {
        tripExpenses = tripExpenses.filter(e => e.who === filters.who);
    }
    if (filters.dateFrom) {
        tripExpenses = tripExpenses.filter(e => e.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
        tripExpenses = tripExpenses.filter(e => e.date <= filters.dateTo);
    }
    if (filters.minVal !== undefined) {
        tripExpenses = tripExpenses.filter(e => (e.euroValue || 0) >= filters.minVal);
    }
    if (filters.maxVal !== undefined && filters.maxVal !== Infinity) {
        tripExpenses = tripExpenses.filter(e => (e.euroValue || 0) <= filters.maxVal);
    }

    tripExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    function formatAppleDate(dateStr) {
        if (!dateStr) return 'Global';
        const date = new Date(dateStr);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    }

    if (tripExpenses.length === 0) {
        container.innerHTML = `
            <div class="card glass" style="padding: 50px; text-align: center; border-radius: 32px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); backdrop-filter: blur(25px);">
                <div style="font-size: 2.5rem; margin-bottom: 15px; opacity: 0.5;">💸</div>
                <p style="color: rgba(255,255,255,0.5); font-weight: 500; font-size: 1rem;">No expenses found for this trip.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tripExpenses.map(e => {
        const cat = STATE.categories.find(c => c.id === e.categoryId);
        const displayEuro = e.euroValue;

        return `
            <div class="card glass" style="padding: 14px 22px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); display: flex; justify-content: space-between; align-items: center; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.1);" onmouseover="this.style.transform='scale(1.012)'; this.style.boxShadow='0 20px 50px rgba(0,0,0,0.2)'; this.style.background='rgba(255,255,255,0.2)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 10px 30px rgba(0,0,0,0.1)'; this.style.background='rgba(255,255,255,0.15)';">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 48px; height: 48px; background: rgba(0,0,0,0.04); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; border: 1px solid rgba(0,0,0,0.04);">
                        ${cat ? cat.icon : '💰'}
                    </div>
                    <div>
                        <strong style="display: block; font-size: 1.1rem; letter-spacing: -0.02em; color: #000000; margin-bottom: 1px;">${e.label}</strong>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: rgba(0,0,0,0.5); font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;">
                            <span>${formatAppleDate(e.date)}</span>
                            <span style="width: 3px; height: 3px; background: rgba(0,0,0,0.1); border-radius: 50%;"></span>
                            <span>${e.country || 'Global'}</span>
                            <span style="width: 3px; height: 3px; background: rgba(0,0,0,0.1); border-radius: 50%;"></span>
                            <span>${e.who}</span>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="text-align: right;">
                        <div style="font-weight: 800; font-size: 1.2rem; color: #000000; letter-spacing: -0.03em;">${e.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style="font-size: 0.75rem; opacity: 0.5; font-weight: 600;">${e.currency}</span></div>
                        <div style="font-size: 0.85rem; color: #0071e3; font-weight: 700; margin-top: 1px;">≈ €${displayEuro.toFixed(2)}</div>
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button onclick="window.openEditExpenseModal('${e.id}')" style="background: rgba(0,113,227,0.08); border: 1px solid rgba(0,113,227,0.1); color: #0071e3; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.15)';" onmouseout="this.style.background='rgba(0,113,227,0.08)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button onclick="window.deleteExpense('${e.id}')" style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.1); color: #ff3b30; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.15)';" onmouseout="this.style.background='rgba(255,59,48,0.08)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window.openEditExpenseModal = (id) => {
    const e = STATE.expenses.find(exp => exp.id === id);
    if (!e) return;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    const peopleOptions = STATE.groups.map(p => `<option value="${p}" ${e.who === p ? 'selected' : ''}>${p}</option>`).join('');
    const categoryOptions = STATE.categories.map(c => `<option value="${c.id}" ${e.categoryId === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');
    const currencyOptions = Object.keys(CONVERSION_RATES).map(c => `<option value="${c}" ${e.currency === c ? 'selected' : ''}>${c}</option>`).join('');

    modal.innerHTML = `
        <div class="card glass" style="width: 500px; max-height: 90vh; overflow-y: auto; padding: 40px; border-radius: 44px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4); box-sizing: border-box;">
            <h2 style="margin: 0 0 24px; font-size: 1.8rem; letter-spacing: -0.04em; color: #ffffff; text-align: center;">Edit Expense</h2>
            
            <form id="editExpenseForm" style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                    <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.7); text-transform: uppercase;">Label</label>
                    <input type="text" id="editExpLabel" class="glass-input" value="${e.label}" style="width: 100%; padding: 14px; border-radius: 14px; background: rgba(255,255,255,0.1); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" required>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.7); text-transform: uppercase;">Who Paid</label>
                        <select id="editExpWho" class="glass-input" style="width: 100%; padding: 14px; border-radius: 14px; background: rgba(255,255,255,0.1); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                            ${peopleOptions}
                        </select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.7); text-transform: uppercase;">Category</label>
                        <select id="editExpCategory" class="glass-input" style="width: 100%; padding: 14px; border-radius: 14px; background: rgba(255,255,255,0.1); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                            ${categoryOptions}
                        </select>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.7); text-transform: uppercase;">Value</label>
                        <input type="number" step="0.01" id="editExpValue" class="glass-input" value="${e.value}" style="width: 100%; padding: 14px; border-radius: 14px; background: rgba(255,255,255,0.1); color: #ffffff; font-weight: 700; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" required>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.7); text-transform: uppercase;">Currency</label>
                        <select id="editExpCurrency" class="glass-input" style="width: 100%; padding: 14px; border-radius: 14px; background: rgba(255,255,255,0.1); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                            ${currencyOptions}
                        </select>
                    </div>
                </div>

                <div>
                    <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.7); text-transform: uppercase;">Date</label>
                    <input type="date" id="editExpDate" class="glass-input" value="${e.date}" style="width: 100%; padding: 14px; border-radius: 14px; background: rgba(255,255,255,0.1); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" required>
                </div>

                <div style="margin-top: 12px; display: flex; gap: 10px;">
                    <button type="submit" class="btn" style="flex: 1; background: var(--accent-blue); color: white; padding: 16px; border-radius: 16px; font-weight: 700;">Update Expense</button>
                    <button type="button" id="cancelEditBtn" class="btn" style="padding: 16px; background: rgba(255,255,255,0.1); color: #ffffff; border-radius: 16px; font-weight: 600; border: 1px solid rgba(255,255,255,0.2);">Cancel</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#cancelEditBtn').onclick = () => modal.remove();

    modal.querySelector('#editExpenseForm').onsubmit = (evt) => {
        evt.preventDefault();

        e.label = modal.querySelector('#editExpLabel').value;
        e.who = modal.querySelector('#editExpWho').value;
        e.categoryId = modal.querySelector('#editExpCategory').value;
        e.value = parseFloat(modal.querySelector('#editExpValue').value);
        e.currency = modal.querySelector('#editExpCurrency').value;
        e.date = modal.querySelector('#editExpDate').value;

        // Recalculate Euro value
        const rate = CONVERSION_RATES[e.currency] || 1;
        e.euroValue = e.value / rate;

        saveState();
        modal.remove();
        navigate('expenses');
    };
};

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
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 12px; line-height: 1.5;">
                    Use your favourite app's format or <a href="#" onclick="window.showSettingsTab('format'); return false;" style="color: var(--accent-blue); text-decoration: none; font-weight: 600;">customize your own upload format</a> in settings.
                </p>
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
            reader.onload = function (evt) {
                try {
                    const data = new Uint8Array(evt.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

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

                        who = get('who');
                        catName = get('categoryId');
                        label = get('label');
                        date = get('date');
                        country = get('country') || 'Unknown';
                        value = parseFloat(get('value')) || 0;
                        currency = get('currency').toUpperCase() || 'EUR';
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

    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId && !e.isSettlement);

    // Trigger historical rate fetch in background
    const uniqueDates = [...new Set(tripExps.map(e => e.date).filter(d => !!d))];
    fetchHistoricalRates(uniqueDates).then(() => { });

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
                <h1 style="margin: 0; font-size: 3.5rem; letter-spacing: -0.04em;">Insights</h1>
                <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: 1.1rem;">Your travel spending at a glance.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 24px;">
                <div class="glass" style="display: flex; padding: 4px; border-radius: 14px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-sm);">
                    <button class="rate-mode-btn ${mode === 'at_trip' ? 'active' : ''}" data-mode="at_trip" style="padding: 8px 18px; border-radius: 11px; border: none; background: ${mode === 'at_trip' ? 'var(--accent-blue)' : 'transparent'}; color: ${mode === 'at_trip' ? 'white' : 'var(--accent-blue)'}; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                        At Trip
                    </button>
                    <button class="rate-mode-btn ${mode === 'today' ? 'active' : ''}" data-mode="today" style="padding: 8px 18px; border-radius: 11px; border: none; background: ${mode === 'today' ? 'var(--accent-blue)' : 'transparent'}; color: ${mode === 'today' ? 'white' : 'var(--accent-blue)'}; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
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
            <h1 style="background: linear-gradient(135deg, #5856d6, #ff2d55); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Personalization</h1>
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
            if (name) {
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
    const trip = STATE.trips[tripIndex];

    if (!STATE.user) {
        alert("You must be logged in to complete trips and save them to your account.");
        return;
    }

    if (!confirm(`Are you sure you want to complete "${trip.name}"? It will be moved to Collections and synced to your account.`)) return;

    // Move trip to archivedTrips
    const archivedTrip = STATE.trips.splice(tripIndex, 1)[0];
    
    // Store its associated data inside the trip object for collections view if needed, 
    // or just rely on the global arrays. The existing app seems to store them inside.
    archivedTrip.expenses = (STATE.expenses || []).filter(e => e.tripId === archivedTrip.id);
    archivedTrip.itinerary = (STATE.activities || []).filter(a => a.tripId === archivedTrip.id);
    archivedTrip.photos = (STATE.photos || []).filter(p => p.tripId === archivedTrip.id);
    archivedTrip.tripDays = (STATE.tripDays || []).filter(d => d.tripId === archivedTrip.id);

    // Remove from global arrays to keep active state clean
    STATE.expenses = (STATE.expenses || []).filter(e => e.tripId !== archivedTrip.id);
    STATE.activities = (STATE.activities || []).filter(a => a.tripId !== archivedTrip.id);
    STATE.photos = (STATE.photos || []).filter(p => p.tripId !== archivedTrip.id);
    STATE.tripDays = (STATE.tripDays || []).filter(d => d.tripId !== archivedTrip.id);

    if (!STATE.archivedTrips) STATE.archivedTrips = [];
    STATE.archivedTrips.push(archivedTrip);
    
    STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0].id : null;
    
    saveState();
    updateTripSelector();
    navigate('collections');
}

window.logout = () => {
    STATE.user = null;
    STATE.groups = []; 
    STATE.archivedTrips = [];
    STATE.profilePhoto = null;
    saveState();
    location.reload();
};

window.deleteActiveTrip = () => {
    if (!STATE.activeTripId) return;
    const trip = STATE.trips.find(t => t.id === STATE.activeTripId);
    if (!trip) return;

    window.showConfirmModal({
        title: "Delete Active Trip?",
        message: `Permanently delete "${trip.name}" and all its data? This cannot be undone.`,
        confirmText: "Delete Trip",
        onConfirm: () => {
            const tripId = STATE.activeTripId;
            STATE.trips = STATE.trips.filter(t => t.id !== tripId);
            STATE.expenses = (STATE.expenses || []).filter(e => e.tripId !== tripId);
            STATE.activities = (STATE.activities || []).filter(a => a.tripId !== tripId);
            STATE.photos = (STATE.photos || []).filter(p => p.tripId !== tripId);
            STATE.tripDays = (STATE.tripDays || []).filter(d => d.tripId !== tripId);

            STATE.activeTripId = STATE.trips.length > 0 ? STATE.trips[0].id : null;
            saveState();
            updateTripSelector();
            navigate('home');
        }
    });
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
        const MANDATORY = ['label', 'date', 'value', 'who'];
        const OPTIONAL = ['country', 'categoryId', 'currency'];
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
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-small" style="background:rgba(0,113,227,0.1); color:#007aff; border:none; padding:8px 16px; border-radius:12px;" onclick="window.editSavedFormat('${f.id}')">Edit</button>
                                <button class="btn btn-small" style="background:rgba(255,59,48,0.1); color:#ff3b30; border:none; padding:8px 16px; border-radius:12px;" onclick="window.deleteSavedFormat('${f.id}')">Delete</button>
                            </div>
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
                <h1 style="background: linear-gradient(135deg, #5856d6, #ff2d55); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">System Control</h1>
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
                onConfirm: async () => {
                    STATE.trips = []; STATE.archivedTrips = []; STATE.tripDays = []; STATE.expenses = []; STATE.budgets = []; STATE.activeTripId = null;
                    saveState();
                    // Also wipe trips from server
                    if (STATE.user) {
                        try {
                            await fetch('/api/user-data', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user_id: STATE.user.id })
                            });
                        } catch(e) { console.error('Server wipe failed', e); }
                    }
                    window.switchSettingsTab('reset');
                }
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
                onConfirm: async () => {
                    // Wipe server data first if logged in
                    if (STATE.user) {
                        try {
                            await fetch('/api/user-data', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ user_id: STATE.user.id })
                            });
                        } catch(e) { console.error('Server wipe failed', e); }
                    }
                    STATE.trips = []; STATE.archivedTrips = []; STATE.tripDays = []; STATE.expenses = []; STATE.groups = []; STATE.budgets = []; STATE.categories = []; STATE.activeTripId = null; STATE.user = null; STATE.notifications = []; STATE.hasLoggedInBefore = false;
                    saveState();
                    localStorage.clear();
                    location.reload();
                }
            }
        };
        window.showConfirmModal(configs[type]);
    };

    window.addFormatMapping = () => {
        const variable = document.getElementById('mapVarSelect')?.value;
        const column = document.getElementById('mapColSelect')?.value;
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

    window.editSavedFormat = (id) => {
        const format = (STATE.savedFormats || []).find(f => f.id === id);
        if (!format) return;
        // Load the saved format's mappings into the active editor
        STATE.customFormat = [...format.mappings];
        // Remove it from saved so the user can re-save it with a new name or overwrite
        STATE.savedFormats = (STATE.savedFormats || []).filter(f => f.id !== id);
        saveState();
        window.switchSettingsTab('format');
        // Pre-fill the name input after tab renders
        setTimeout(() => {
            const nameInput = document.getElementById('formatNameInput');
            if (nameInput) nameInput.value = format.name;
        }, 50);
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

window.showPersonalizationTab = (tab) => {
    navigate('personalization');
    setTimeout(() => {
        if (window.showPersTab) window.showPersTab(tab);
    }, 50);
};

// --- Page: Budgets ---
function renderBudgets() {
    const div = document.createElement('div');
    if (!STATE.user) {
        div.innerHTML = `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Budgets</h1>
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
            <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Budgets</h1>
            <p>Set spending limits and track them across trips.</p>
        </div>
        
        <div class="grid-2" style="margin-top: 24px;">
            <div class="card glass card-glow-blue">
                <h2 class="card-title" style="color: var(--accent-blue);">Create New Budget</h2>
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
                <div style="display: grid; grid-template-columns: 1fr 100px; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Target Amount</label>
                        <input type="number" id="budAmt" class="glass-input" style="width:100%;" placeholder="e.g. 1000">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Currency</label>
                        <select id="budCurr" class="glass-input" style="width:100%;">
                            ${Object.keys(CONVERSION_RATES).map(c => `<option value="${c}" ${STATE.insightCurrency === c ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <button id="saveBudgetBtn" class="btn" style="width:100%; background: var(--accent-blue);">Save Budget</button>
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
            const curr = div.querySelector('#budCurr').value;
            if (!amt || amt <= 0) return alert('Enter a valid amount.');

            // Convert to EUR for consistent tracking if needed
            let eurAmt = amt;
            if (curr !== 'EUR') {
                const rate = CONVERSION_RATES[curr] || 1;
                eurAmt = amt * rate;
            }

            STATE.budgets.push({
                id: generateId(),
                tripId: div.querySelector('#budTrip').value,
                categoryId: div.querySelector('#budCat').value,
                user: div.querySelector('#budUser').value,
                amount: eurAmt,
                originalAmount: amt,
                originalCurrency: curr
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

    if (!STATE.user) {
        div.innerHTML = `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
                <p>Log in to view and manage your completed trips.</p>
            </div>
            <div class="card glass" style="text-align: center; padding: 60px; margin-top: 24px;">
                <h2 style="margin-bottom: 20px;">Private Collections</h2>
                <p style="color: var(--text-secondary); margin-bottom: 30px;">Your completed trips are safely attached to your account. Log in to access your travel history.</p>
                <button class="btn" style="background: var(--accent-blue);" onclick="navigate('profile')">Log In Now</button>
            </div>
        `;
        return div;
    }

    const archived = STATE.archivedTrips || [];

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
            <p>Your completed travel memories and trip photos.</p>
        </div>
        
        <div class="trip-nav glass" style="margin-top: 24px; display: none;">
            <button class="trip-tab active" id="tabArchived">Completed Trips</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${archived.length > 0 ? archived.map(t => `
                    <div class="card glass card-glow-blue" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
                        <div style="cursor: pointer; flex: 1;" onclick="window.viewArchivedDetails('${t.id}')">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h3 style="margin: 0;">${t.name}</h3>
                            </div>
                            <p style="color: var(--text-secondary); margin: 4px 0 0 0; font-size: 0.85rem;">${t.country}</p>
                            <p style="color: var(--text-secondary); margin: 2px 0 0 0; font-size: 0.85rem;">${(t.expenses || []).filter(e => !e.isSettlement).length} expenses</p>
                            <p style="color: var(--accent-blue); margin: 2px 0 0 0; font-size: 0.85rem; font-weight: 700;">Total: €${(t.expenses || []).filter(e => !e.isSettlement).reduce((sum, e) => sum + (e.euroValue || 0), 0).toFixed(2)}</p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <div style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.03); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(0,0,0,0.08); box-shadow: inset 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03);">
                                <span id="publicLabel-${t.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${t.isPublic ? '#34c759' : 'rgba(0,0,0,0.3)'}; text-shadow: ${t.isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none'};">${t.isPublic ? 'Public' : 'Not public'}</span>
                                <label class="switch" style="transform: scale(0.75);">
                                    <input type="checkbox" ${t.isPublic ? 'checked' : ''} onchange="window.toggleTripPrivacy('${t.id}', this.checked)">
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div style="width: 1px; height: 30px; background: var(--glass-border);"></div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-small" onclick="window.restoreTrip('${t.id}')" style="background: var(--accent-blue); padding: 8px 16px; font-weight: 700;">Restore</button>
                                <button class="btn btn-small" onclick="window.deleteArchivedTrip('${t.id}')" style="background: rgba(255,59,48,0.1); color: #ff3b30; border: 1px solid rgba(255,59,48,0.3);" title="Delete Permanently">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('') : `
                    <div class="card glass" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">📚</div>
                        <h2>No completed trips</h2>
                        <p style="color: var(--text-secondary);">Your travel history will appear here once you complete a trip.</p>
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

window.toggleTripPrivacy = (tripId, isPublic) => {
    const trip = STATE.archivedTrips.find(t => t.id === tripId);
    if (trip) {
        trip.isPublic = isPublic;
        saveState();
        
        // Update UI label if it exists (for the banner depth effect)
        const label = document.getElementById(`publicLabel-${tripId}`);
        if (label) {
            label.textContent = isPublic ? 'Public' : 'Not public';
            label.style.color = isPublic ? '#34c759' : (STATE.currentPage === 'collections' ? 'rgba(0,0,0,0.3)' : '#a1a1aa');
            label.style.textShadow = isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none';
        } else {
            // If we're on a page where we don't have the fancy label, just refresh
            if (STATE.currentPage === 'collections') navigate('collections');
        }
        // Send notification to friends if made public
        if (isPublic && STATE.user) {
            fetch('/api/notifications/trip_public', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, trip_name: trip.name })
            }).catch(e => console.error("Failed to notify friends:", e));
        }
    }
};

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
    (trip.expenses || []).filter(e => !e.isSettlement).forEach(e => totalSpent += parseFloat(e.euroValue || 0));

    let firstPhoto = null;
    if (trip.tripDays) {
        for (const day of trip.tripDays) {
            if (day.photos && day.photos.length > 0) {
                firstPhoto = day.photos[0];
                break;
            }
        }
    }

    div.innerHTML = `
        <div class="trip-banner" style="${firstPhoto ? `background: linear-gradient(rgba(0,45,91,0.6), rgba(0,45,91,0.8)), url(${firstPhoto}) center/cover no-repeat; border: none;` : `background: rgba(255,255,255,0.9); border: 1.5px solid var(--accent-blue);`}">
            <div style="font-size: 0.9rem; color: ${firstPhoto ? 'rgba(255,255,255,0.7)' : 'rgba(0, 45, 91, 0.5)'}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.25em; margin-bottom: 12px;">Memories of</div>
            <h1 class="trip-banner-title" style="font-size: 4rem; margin: 0; letter-spacing: -0.06em; color: ${firstPhoto ? '#ffffff' : 'var(--accent-blue)'}; font-weight: 800; line-height: 0.95;">${trip.name}</h1>
            <div style="display: flex; align-items: center; gap: 32px; margin-top: 20px; color: ${firstPhoto ? 'rgba(255,255,255,0.9)' : '#1a3a5f'}; font-weight: 700;">
                <span style="display: flex; align-items: center; gap: 8px;">${trip.country}</span>
                
                <!-- Privacy Switch in Banner -->
                <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.08); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(20px); box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.1);">
                    <span id="publicLabel-${trip.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${trip.isPublic ? '#34c759' : '#a1a1aa'}; text-shadow: ${trip.isPublic ? '0 0 12px rgba(52, 199, 89, 0.6)' : 'none'};">${trip.isPublic ? 'Public' : 'Not public'}</span>
                    <label class="switch" style="transform: scale(0.75);">
                        <input type="checkbox" ${trip.isPublic ? 'checked' : ''} onchange="window.toggleTripPrivacy('${trip.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>

                <span style="display: flex; align-items: center; gap: 8px;">${trip.tripDays?.length || 0} Days</span>
                <span style="display: flex; align-items: center; gap: 8px;">€${totalSpent.toFixed(0)} spent</span>
            </div>
            <div style="margin-top: 12px; color: ${firstPhoto ? '#4da3ff' : 'var(--accent-blue)'}; font-weight: 800; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.05em;">
                ${(trip.expenses || []).filter(e => e.isSettlement).length > 0 ? 0 : (trip.expenses || []).filter(e => !e.isSettlement).length} Unsetled
            </div>
            <div style="position: absolute; right: 40px; bottom: 40px; display: flex; gap: 12px;">
                <button class="btn" style="background: #002d5b; color: #ffffff; padding: 12px 24px; border-radius: 16px; font-weight: 800;" onclick="window.restoreTrip('${trip.id}')">Restore Trip</button>
                <button class="btn" style="background: rgba(0,0,0,0.05); color: #002d5b; padding: 12px 24px; border-radius: 16px; font-weight: 800; border: 1px solid rgba(0,0,0,0.1);" onclick="navigate('collections')">Back</button>
            </div>
        </div>

        <div class="day-blocks-grid">
            ${(trip.tripDays || []).sort((a, b) => a.dayNumber - b.dayNumber).map(day => {
        const dayPhotos = day.photos || [];
        const dayDocs = day.tickets || [];

        return `
                    <div class="day-block" onclick="window.openDayDetailView('${trip.id}', '${day.id}', true)" style="${dayPhotos.length > 0 ? `background: linear-gradient(rgba(0,45,91,0.7), rgba(0,45,91,0.85)), url(${dayPhotos[0]}) center/cover no-repeat; border: none;` : ''}">
                        <div class="day-block-header">
                            <span class="day-block-number" style="color: ${dayPhotos.length > 0 ? '#4da3ff' : '#007aff'};">Day ${day.dayNumber}</span>
                            <div style="display: flex; gap: 8px;">
                                ${dayPhotos.length > 0 ? `<span style="font-size: 0.8rem; color: rgba(255,255,255,0.6);">📸 ${dayPhotos.length}</span>` : ''}
                                ${dayDocs.length > 0 ? `<span style="font-size: 0.8rem; color: ${dayPhotos.length > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(0, 45, 91, 0.4)'};">🎫 ${dayDocs.length}</span>` : ''}
                            </div>
                        </div>
                        <h3 class="day-block-name" style="color: ${dayPhotos.length > 0 ? '#ffffff' : 'var(--accent-blue)'}; font-size: 1.6rem; font-weight: 800;">${day.name || `Day ${day.dayNumber}`}</h3>
                        
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
                    <div style="font-size: 0.8rem; color: #007aff; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 4px;">${isArchived ? 'Completed' : 'Trip'} Day ${day.dayNumber}</div>
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

                <!-- Notes Section (Completed View) -->
                <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 28px; border: 1.5px solid rgba(0, 45, 91, 0.1);">
                    <h3 style="margin: 0 0 14px; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">📝 Journaling</h3>
                    <div style="background: rgba(255,255,255,0.8); border-radius: 16px; padding: 14px; font-size: 0.95rem; color: #002d5b; line-height: 1.5; min-height: 40px;">
                        ${day.notes || '<span style="color: rgba(0,45,91,0.3);">No journaling recorded.</span>'}
                    </div>
                </div>

                <!-- Plans Section (Completed View) -->
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
        title: "Delete Completed Trip?",
        message: "Permanently delete this completed trip and all its data? This cannot be undone.",
        confirmText: "Delete Trip",
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
            <div style="position: relative; width: 100%; height: calc(100vh - 200px); min-height: 480px; border-radius: 20px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.15);">
                <div id="emptyMap" style="width:100%; height:100%;"></div>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);z-index:1000;">
                    <div class="premium-glass-card" style="text-align:center;color:#002d5b;padding:48px;max-width:500px;background:rgba(255,255,255,0.6);border-radius:36px;border:1px solid rgba(255,255,255,0.8);box-shadow: 0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1);" onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 40px 80px rgba(0,0,0,0.15), 0 15px 30px rgba(0,0,0,0.1)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05)';">
                        <div style="font-size:4.5rem;margin-bottom:24px;filter:drop-shadow(0 10px 15px rgba(0,0,0,0.1));">🧭</div>
                        <h2 style="font-size:2rem;font-weight:800;margin-bottom:16px;letter-spacing:-0.03em;">Ready for a new adventure?</h2>
                        <p style="font-size:1.15rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;margin-bottom:32px;">To generate a personalized AI itinerary, you'll need to create a trip first.</p>
                        <button onclick="window.openNewTripModal()" class="btn btn-liquid-glass" style="padding:16px 36px;font-size:1.15rem;font-weight:800;background:var(--accent-blue);color:white;border:none;box-shadow:0 15px 30px rgba(0,113,227,0.3); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 20px 40px rgba(0,113,227,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 15px 30px rgba(0,113,227,0.3)';">+ Start Your Journey</button>
                    </div>
                </div>
            </div>`;
        setTimeout(() => {
            if (typeof L !== 'undefined') {
                const m = L.map('emptyMap', { zoomControl: false, attributionControl: false }).setView([20, 0], 2);
                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 20
                }).addTo(m);
            }
        }, 0);
        return div;
    }

    // ── ACTIVE TRIP STATE ────────────────────────────────────
    const tripCountry = activeTrip.country || '';
    const tripExps = STATE.expenses.filter(e => e.tripId === STATE.activeTripId && e.date).sort((a, b) => a.date.localeCompare(b.date));
    const dates = tripExps.map(e => e.date);
    const minDate = dates[0] || '';
    const maxDate = dates[dates.length - 1] || '';

    const savedPlan = activeTrip.aiPlan || null;
    const savedContext = activeTrip.aiContext || '';
    const savedNumDays = activeTrip.aiNumDays || 1;

    const tourismTypes = [
        { icon: '🏛️', label: 'Culture & History' }, { icon: '🍽️', label: 'Food & Dining' },
        { icon: '🌿', label: 'Nature & Outdoors' }, { icon: '🏄', label: 'Adventure & Sports' },
        { icon: '🌙', label: 'Nightlife' }, { icon: '💎', label: 'Luxury' },
        { icon: '👨‍👩‍👧', label: 'Family-Friendly' }, { icon: '🎒', label: 'Budget Travel' },
        { icon: '🛍️', label: 'Shopping' }, { icon: '🧘', label: 'Wellness & Spa' },
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
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">From</label>
                                <input id="aiDateFrom" type="date" class="glass-input" value="${minDate}" style="width:100%; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">To</label>
                                <input id="aiDateTo" type="date" class="glass-input" value="${maxDate}" style="width:100%; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>

                    <div class="card glass" style="padding:20px;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.05em;">📝 Requirements</h2>
                        <textarea id="aiExtraContext" class="glass-input" rows="3" style="width:100%; resize:none; font-size:0.9rem; box-sizing: border-box;" placeholder="e.g. Vegetarian friendly, no walking more than 2km...">${savedContext}</textarea>
                    </div>
                    <!-- Generate -->
                    <button id="generateBtn" class="btn ai-generate-btn" style="width:100%; padding: 16px; border-radius: 16px; font-weight: 800; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; border: none; cursor: pointer;">✦ Generate My Itinerary</button>
                </div>

                <!-- Right: Leaflet Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiLeafletMap" style="width:100%;height:100%;"></div>
                        <div id="aiZoomBadge" style="position:absolute;bottom:14px;left:14px;background:var(--glass-bg);backdrop-filter:blur(12px);padding:6px 14px;border-radius:980px;border:1px solid var(--glass-border);font-size:0.82rem;font-weight:600;z-index:1000;color:#001a33;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='var(--glass-bg)'">
                            <span>📍</span> <span>${tripCountry}</span>
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

        // Zoom helper
        const zoomToLocation = (location) => {
            if (!leafletMap) return;
            
            // Check for saved view first
            const aiTripMapKey = activeTrip.id + '_ai';
            if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) {
                const saved = STATE.mapViews[aiTripMapKey];
                leafletMap.setView([saved.lat, saved.lng], saved.zoom, { animate: false });
                return;
            }

            let query = location.replace(/\(USA\)/g, '').trim();
            if (query.includes(' - ')) {
                const parts = query.split(' - ');
                query = `${parts[1]}, ${parts[0]}`;
            }
            fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`)
                .then(r => r.json()).then(data => {
                    if (data[0] && data[0].boundingbox) {
                        const b = data[0].boundingbox;
                        leafletMap.fitBounds([
                            [parseFloat(b[0]), parseFloat(b[2])],
                            [parseFloat(b[1]), parseFloat(b[3])]
                        ], { padding: [20, 20], maxZoom: 12 });
                    } else if (data[0]) {
                        leafletMap.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 8);
                    }
                }).catch(() => { });
        };

        // Init Leaflet map
        if (typeof L !== 'undefined') {
            if (leafletMap) { leafletMap.remove(); leafletMap = null; }
            leafletMap = L.map('aiLeafletMap', { zoomControl: true, attributionControl: false }).setView([20, 0], 2);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(leafletMap);
            
            zoomToLocation(tripCountry);

            // Save map view on move/zoom
            leafletMap.on('moveend', () => {
                const aiTripMapKey = activeTrip.id + '_ai';
                if (!STATE.mapViews) STATE.mapViews = {};
                const c = leafletMap.getCenter();
                STATE.mapViews[aiTripMapKey] = { lat: c.lat, lng: c.lng, zoom: leafletMap.getZoom() };
                saveState();
            });

            const badge = div.querySelector('#aiZoomBadge');
            if (badge) badge.onclick = () => {
                // Ignore saved view when clicking badge manually
                const aiTripMapKey = activeTrip.id + '_ai';
                if (STATE.mapViews && STATE.mapViews[aiTripMapKey]) {
                    delete STATE.mapViews[aiTripMapKey];
                }
                zoomToLocation(tripCountry);
            };
        }

        let generatedItinerary = savedPlan;

        const renderItineraryOutput = (itinerary, numDays, country) => {
            const outputEl = div.querySelector('#itineraryOutput');
            if (!itinerary || !itinerary.length) {
                outputEl.innerHTML = '';
                return;
            }

            outputEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;color:white;${sf}">${numDays}-Day ${country} Itinerary</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">Generated by Gemini AI</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">✦ AI-Generated</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>
                <div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">Accept Plan & Add to Trip</button></div>`;

            const daysContainer = outputEl.querySelector('#itineraryDays');
            const dayDivs = [];

            itinerary.forEach((day, i) => {
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
                    let loc = day.mainLocation || day.title || country;
                    if (!day.mainLocation && day.title) {
                        loc = day.title.replace(/Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi, '').trim();
                    }
                    try {
                        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc + ', ' + country)}&format=json&limit=1`);
                        const data = await r.json();
                        if (!data[0]) return;
                        const lat = parseFloat(data[0].lat), lon = parseFloat(data[0].lon);
                        markerCoords.push([lat, lon]);

                        // Cache coordinates for saving later
                        day.lat = lat;
                        day.lon = lon;

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
                        if (markerCoords.length === itinerary.length) {
                            leafletMap.fitBounds(markerCoords, { padding: [40, 40] });
                        }
                    } catch (e) { console.warn('Geocode failed for', loc, e); }
                };

                // Stagger geocode calls to respect Nominatim rate limit
                itinerary.forEach((day, i) => {
                    setTimeout(() => geocodeAndMark(day, i), i * 1100);
                });
            }

            // Accept Plan logic
            document.getElementById('acceptPlanBtn').onclick = () => {
                if (!itinerary) return;

                if (!STATE.tripDays) STATE.tripDays = [];
                if (!STATE.activities) STATE.activities = [];

                itinerary.forEach((dayInfo, idx) => {
                    const dayDate = dayInfo.date || (new Date().toISOString().split('T')[0]);

                    // Create Day with plan pre-filled from AI
                    const dayId = 'day_' + Date.now() + '_' + idx;
                    STATE.tripDays.push({
                        id: dayId,
                        tripId: activeTrip.id,
                        date: dayDate,
                        name: dayInfo.title || `Day ${idx + 1}`,
                        dayNumber: idx + 1,
                        lat: dayInfo.lat,
                        lon: dayInfo.lon,
                        photos: [],
                        tickets: [],
                        notes: '',
                        plan: {
                            morning: dayInfo.morning ? `${dayInfo.morning.activity}: ${dayInfo.morning.description}` : '',
                            afternoon: dayInfo.afternoon ? `${dayInfo.afternoon.activity}: ${dayInfo.afternoon.description}` : '',
                            evening: dayInfo.evening ? `${dayInfo.evening.activity}: ${dayInfo.evening.description}` : ''
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
        };

        if (generatedItinerary) {
            renderItineraryOutput(generatedItinerary, savedNumDays, tripCountry);
        }

        // Generate button
        div.querySelector('#generateBtn').addEventListener('click', async () => {
            const outputEl = div.querySelector('#itineraryOutput');
            const dateFrom = div.querySelector('#aiDateFrom').value;
            const dateTo = div.querySelector('#aiDateTo').value;
            const context = document.getElementById('aiExtraContext').value;
            const country = tripCountry;

            if (!dateFrom || !dateTo) { alert('Please select your travel dates.'); return; }

            const from = new Date(dateFrom), to = new Date(dateTo);
            const numDays = Math.max(1, Math.round((to - from) / 86400000) + 1);

            activeTrip.aiContext = context;
            activeTrip.aiNumDays = numDays;
            saveState();

            outputEl.innerHTML = `<div class="ai-loading-spinner" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px;"><div class="spinner-ring" style="width:40px; height:40px; border:3px solid rgba(255,255,255,0.1); border-top-color:var(--accent-blue); border-radius:50%; animation:spin 1s linear infinite;"></div><div style="font-weight:600; margin-top: 24px; font-size: 1.2rem; color: white;">Consulting Gemini AI...</div><div style="font-size:0.85rem;color:var(--text-secondary);margin-top:8px;">Building your ${numDays}-day itinerary for ${country}</div></div>`;

            // Scroll down a bit to show loading
            outputEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

            try {
                const r = await fetch('/api/generate_itinerary', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ destination: country, numDays: numDays, dateFrom: dateFrom, dateTo: dateTo, context: context })
                });
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                generatedItinerary = d.itinerary;
                
                activeTrip.aiPlan = generatedItinerary;
                saveState();

                renderItineraryOutput(generatedItinerary, numDays, country);
                outputEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (e) {
                let errorMsg = e.message;
                if (errorMsg.includes('503')) {
                    errorMsg = "Gemini servers are currently busy or unavailable. Please try again in a few moments.";
                }
                outputEl.innerHTML = `<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p style="color:var(--text-secondary);">${errorMsg}</p></div>`;
            }
        });
    }, 0);

    return div;
}



// --- Page: Settlements ---
function renderSettlement() {
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

// --- Social & Friends (Simplified) ---
// --- Social & Friends ---
function renderFriends() {
    const div = document.createElement('div');

    const updateFriendsList = async () => {
        if (!STATE.user) return;
        try {
            // Fetch Friends
            const resFriends = await fetch(`/api/friends/list?user_id=${STATE.user.id}`);
            const friends = await resFriends.json();
            
            // Fetch Pending Requests
            const resPending = await fetch(`/api/friends/pending?user_id=${STATE.user.id}`);
            const pending = await resPending.json();
            
            const friendsContainer = div.querySelector('#friendsList');
            const pendingContainer = div.querySelector('#pendingList');
            
            if (friendsContainer) {
                if (friends.length === 0) {
                    friendsContainer.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No friends added yet.</div>`;
                } else {
                    friendsContainer.innerHTML = friends.map(f => `
                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1);">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <img src="${f.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.9rem;">${f.name}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${f.email}</div>
                                </div>
                            </div>
                        </div>
                    `).join('');
                }
            }
            
            if (pendingContainer) {
                if (pending.length === 0) {
                    pendingContainer.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No pending requests.</div>`;
                } else {
                    pendingContainer.innerHTML = pending.map(p => `
                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,159,10,0.1); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(255,159,10,0.2);">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <img src="${p.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${p.name}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${p.email}</div>
                                </div>
                            </div>
                            <button class="btn btn-small" onclick="window.acceptFriendRequest('${p.id}')" style="padding: 6px 12px; font-size: 0.75rem;">Accept</button>
                        </div>
                    `).join('');
                }
            }
        } catch (e) { console.error("Error loading friends:", e); }
    };

    window.searchForFriend = async () => {
        const query = div.querySelector('#friendSearchInput').value.trim();
        const resultsContainer = div.querySelector('#searchResults');
        if (!query) return;

        resultsContainer.innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">Searching...</p>`;

        try {
            const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
            const users = await res.json();

            if (users.length === 0) {
                resultsContainer.innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">No user found. Ask them to login first!</p>`;
            } else {
                resultsContainer.innerHTML = users.map(u => `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,122,255,0.05); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(0,122,255,0.1);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <img src="${u.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                            <div>
                                <div style="font-weight: 600; font-size: 0.9rem;">${u.name}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">${u.email}</div>
                            </div>
                        </div>
                        <button class="btn btn-small" onclick="window.sendFriendRequest('${u.id}')" style="padding: 6px 12px; font-size: 0.75rem;">Send Request</button>
                    </div>
                `).join('');
            }
        } catch (e) { resultsContainer.innerHTML = `<p style="color:red;">Error searching.</p>`; }
    };

    window.sendFriendRequest = async (friendId) => {
        if (!STATE.user) { alert("Please login first"); return; }
        try {
            const res = await fetch('/api/friends/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: STATE.user.id, friend_id: friendId })
            });
            const data = await res.json();
            if (data.status === 'success') {
                div.querySelector('#searchResults').innerHTML = `<p style="text-align:center; padding:10px; font-size:0.8rem; color:#34c759;">Request sent!</p>`;
                div.querySelector('#friendSearchInput').value = '';
                updateFriendsList();
            } else if (data.status === 'error') {
                alert(data.message);
            }
        } catch (e) { alert("Failed to send request"); }
    };

    div.innerHTML = `
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Friends</h1>
            <p>Connect with other travelers and share your itineraries</p>
        </div>
        <div class="grid-2" style="margin-top: 24px;">
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <div class="card glass card-glow-blue">
                    <h3 style="margin-bottom: 16px; font-weight: 700;">Find Friends</h3>
                    <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                        <input type="text" id="friendSearchInput" class="glass-input" placeholder="Search by email..." style="flex: 1;" onkeyup="if(event.key === 'Enter') window.searchForFriend()">
                        <button class="btn btn-small" onclick="window.searchForFriend()">Search</button>
                    </div>
                    <div id="searchResults"></div>
                </div>
                
                <div class="card glass card-glow-orange">
                    <h3 style="margin-bottom: 16px; font-weight: 700;">Pending Requests</h3>
                    <div id="pendingList">
                        <div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">Loading...</div>
                    </div>
                </div>
            </div>

            <div class="card glass card-glow-purple">
                <h3 style="margin-bottom: 16px; font-weight: 700;">Your Friends</h3>
                <div id="friendsList">
                    <div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">Loading...</div>
                </div>
            </div>
        </div>
    `;

    setTimeout(updateFriendsList, 0);
    return div;
}

// --- Trip Journey Helpers ---


// --- Confirmation & Safety UI ---
window.showConfirmModal = (options = {}) => {
    const {
        title = "Are you sure?",
        message = "This action cannot be undone.",
        confirmText = "Delete",
        confirmColor = "#ff3b30",
        requireInput = false,
        onConfirm = () => { }
    } = options;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card glass" style="width: 420px; height: 420px; padding: 40px; border-radius: 44px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.05); box-shadow: 0 40px 100px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; box-sizing: border-box; overflow: hidden;">
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff;">${title}</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 1rem; font-weight: 500;">${message}</p>
            </div>
            
            ${requireInput ? `
                <div style="width: 100%; margin-bottom: 8px;">
                    <p style="font-size: 0.75rem; color: #ff3b30; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.1em; text-align: center;">Type "${requireInput}" to confirm</p>
                    <input type="text" id="safetyInput" class="glass-input" placeholder="Type here..." style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                </div>
            ` : ''}

            <div style="width: 100%; display: flex; flex-direction: column; gap: 10px;">
                <button class="btn" id="modalConfirmBtn" style="width: 100%; background: ${confirmColor}; color: #ffffff; padding: 18px; font-weight: 800; border-radius: 20px; box-shadow: 0 10px 30px ${confirmColor}66; font-size: 1.1rem; box-sizing: border-box; transition: all 0.3s; ${requireInput ? 'opacity: 0.3; cursor: not-allowed;' : ''}" ${requireInput ? 'disabled' : ''}>${confirmText}</button>
                <button class="btn" id="modalCancelBtn" style="width: 100%; padding: 8px; font-weight: 600; background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: 0.9rem;">Cancel</button>
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

    modal.querySelector('#modalCancelBtn').onclick = () => modal.remove();
    confirmBtn.onclick = () => {
        try {
            onConfirm();
        } catch (e) {
            console.error("Modal onConfirm failed:", e);
        } finally {
            modal.remove();
            // Safety: remove any other lingering overlays
            document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
        }
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
        <div class="card glass shadow-2xl animation-pop" style="width: 720px; height: 860px; max-height: 92vh; overflow-y: auto; padding: 48px; border-radius: 48px; border: 1.5px solid #002d5b; background: rgba(255,255,255,0.95); display: flex; flex-direction: column; box-sizing: border-box;">
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
                                    <div style="font-size: 1.5rem;">${t.fileData ? '📎' : '📄'}</div>
                                    <div>
                                        <div style="font-weight: 700; font-size: 1rem; color: #002d5b;">${t.name}</div>
                                        <div style="font-size: 0.8rem; color: #1a3a5f; font-weight: 600;">Saved on ${new Date(t.date).toLocaleDateString()}</div>
                                        ${t.fileData ? `<a href="${t.fileData}" download="${t.fileName || t.name}" style="font-size:0.78rem;color:#007aff;font-weight:700;text-decoration:none;">⬇ View / Download</a>` : `<label style="font-size:0.78rem;color:#007aff;font-weight:700;cursor:pointer;">📎 Attach file<input type="file" style="display:none;" onchange="window.uploadTicketFile('${day.id}', ${i}, this)"></label>`}
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
                    <h3 style="margin: 0 0 14px; font-size: 1.2rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">📝 Journaling</h3>
                    <textarea id="dayNotesInput" style="width: 100%; min-height: 90px; background: rgba(255,255,255,0.8); border: 1.5px solid rgba(0,45,91,0.1); border-radius: 16px; padding: 14px; font-size: 0.95rem; color: #002d5b; resize: vertical; font-family: inherit; outline: none; box-sizing: border-box; line-height: 1.5;" placeholder="Write what happened today…">${day.notes || ''}</textarea>
                    <button id="saveNotesBtn" class="btn btn-small" style="margin-top: 10px; background: #002d5b; color: #ffffff; padding: 10px 20px; border-radius: 14px; font-weight: 700;">Save Journal</button>
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
                    <button id="savePlanBtn" class="btn btn-small" style="margin-top: 10px; background: #5856d6; color: #ffffff; padding: 10px 20px; border-radius: 14px; font-weight: 700;">Save plan changes</button>
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
            const newIndex = day.tickets.length;
            day.tickets.push({ name: ticketName, date: new Date().toISOString() });
            saveState();
            refreshModal();

            // Immediately offer a file picker after creating the document
            setTimeout(() => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx';
                fileInput.style.display = 'none';
                fileInput.onchange = () => window.uploadTicketFile(day.id, newIndex, fileInput);
                document.body.appendChild(fileInput);
                fileInput.click();
                fileInput.addEventListener('change', () => document.body.removeChild(fileInput), { once: true });
            }, 300);
        }
    };

    modal.querySelector('#saveNotesBtn').onclick = () => {
        day.notes = modal.querySelector('#dayNotesInput').value;
        saveState();
        const btn = modal.querySelector('#saveNotesBtn');
        btn.textContent = 'Saved ✓'; btn.style.background = '#34c759';
        setTimeout(() => { btn.textContent = 'Save Journal'; btn.style.background = '#002d5b'; }, 2000);
    };

    modal.querySelector('#savePlanBtn').onclick = () => {
        if (!day.plan) day.plan = {};
        day.plan.morning = modal.querySelector('#planMorning').value;
        day.plan.afternoon = modal.querySelector('#planAfternoon').value;
        day.plan.evening = modal.querySelector('#planEvening').value;
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

window.uploadTicketFile = (dayId, index, inputEl) => {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const day = STATE.tripDays.find(d => d.id === dayId);
    if (!day || !day.tickets || !day.tickets[index]) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
        day.tickets[index].fileData = evt.target.result;
        day.tickets[index].fileName = file.name;
        saveState();
        // Refresh the modal
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.remove();
        window.openDayDetail(dayId);
    };
    reader.readAsDataURL(file);
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
const US_STATES = [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

window.openNewTripModal = () => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.backdropFilter = 'blur(25px)';

    modal.innerHTML = `
        <div class="card glass" style="width: 420px; padding: 40px; border-radius: 44px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.05); box-shadow: 0 40px 100px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; box-sizing: border-box; overflow: visible;">
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff;">New Trip 🌎</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 1rem; font-weight: 500;">Adventure awaits.</p>
            </div>
            
            <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
                <input type="text" id="modalTripName" class="glass-input" placeholder="Trip Name (e.g. Bali Dreams)" style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                
                <div style="position: relative;" id="modalCountrySearchContainer">
                    <input type="text" id="modalTripCountry" autocomplete="off" class="glass-input" placeholder="Country (e.g. Indonesia)" style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                    <div id="modalCountryDropdownList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                        ${COUNTRIES.sort().map(c => `<div class="dropdown-item country-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${c}">${c}</div>`).join('')}
                    </div>
                </div>

                <div style="position: relative; display: none;" id="modalStateSearchContainer">
                    <input type="text" id="modalTripState" autocomplete="off" class="glass-input" placeholder="State (e.g. California)" style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                    <div id="modalStateDropdownList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                        ${US_STATES.map(s => `<div class="dropdown-item state-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${s}">${s}</div>`).join('')}
                    </div>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 10px; width: 100%;">
                    <button id="modalCreateBtn" class="btn" style="width: 100%; background: var(--accent-blue); color: #ffffff; padding: 18px; font-weight: 800; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,113,227,0.4); font-size: 1.1rem; box-sizing: border-box;">Launch Adventure</button>
                    <button id="modalCancelBtn" class="btn" style="width: 100%; padding: 8px; font-weight: 600; background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: 0.9rem;">Discard</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // --- Country Dropdown Logic ---
    const countryInput = modal.querySelector('#modalTripCountry');
    const countryList = modal.querySelector('#modalCountryDropdownList');
    const countryItems = modal.querySelectorAll('.country-item');
    const stateContainer = modal.querySelector('#modalStateSearchContainer');
    const stateInput = modal.querySelector('#modalTripState');

    countryInput.onfocus = () => countryList.style.display = 'block';
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

            if (countryInput.value === 'United States (USA)') {
                stateContainer.style.display = 'block';
            } else {
                stateContainer.style.display = 'none';
                stateInput.value = '';
            }
        };
        item.onmouseover = () => item.style.background = 'rgba(0, 122, 255, 0.1)';
        item.onmouseout = () => item.style.background = 'transparent';
    });

    // --- State Dropdown Logic ---
    const stateList = modal.querySelector('#modalStateDropdownList');
    const stateItems = modal.querySelectorAll('.state-item');

    stateInput.onfocus = () => stateList.style.display = 'block';
    stateInput.oninput = (e) => {
        const val = e.target.value.toLowerCase();
        stateItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(val) ? 'block' : 'none';
        });
        stateList.style.display = 'block';
    };

    stateItems.forEach(item => {
        item.onclick = (e) => {
            stateInput.value = item.getAttribute('data-value');
            stateList.style.display = 'none';
            e.stopPropagation();
        };
        item.onmouseover = () => item.style.background = 'rgba(0, 122, 255, 0.1)';
        item.onmouseout = () => item.style.background = 'transparent';
    });

    document.addEventListener('click', (e) => {
        if (modal.querySelector('#modalCountrySearchContainer') && !modal.querySelector('#modalCountrySearchContainer').contains(e.target)) {
            countryList.style.display = 'none';
        }
        if (stateContainer && stateContainer.style.display === 'block' && !stateContainer.contains(e.target)) {
            stateList.style.display = 'none';
        }
    });

    const nameInput = modal.querySelector('#modalTripName');
    nameInput.focus();
    modal.querySelector('#modalCancelBtn').onclick = () => modal.remove();
    modal.querySelector('#modalCreateBtn').onclick = () => {
        const name = nameInput.value.trim();
        let country = countryInput.value.trim();
        
        if (country === 'United States (USA)' && stateInput.value.trim()) {
            country = `United States (USA) - ${stateInput.value.trim()}`;
        }

        if (name && country) {
            const id = generateId();
            STATE.trips.push({ id, name, country });
            STATE.activeTripId = id;
            saveState();
            modal.remove();
            navigate('home');
            updateTripSelector();
        } else {
            alert("Please fill in all required fields!");
        }
    };
};

// --- Initialization ---
function init() {
    loadState();
    // Ensure logged-in user has a companion if none exist
    if (STATE.user && STATE.user.name) {
        STATE.groups = STATE.groups || [];
        if (STATE.groups.length === 0) {
            STATE.groups.push(STATE.user.name);
            saveState();
        }
    }

    updateTripSelector();
    updateUserUI();

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

    // Action Buttons Injection (Archive & Delete)
    if (!document.getElementById('archiveTripBtn')) {
        const navTrips = document.querySelector('.nav-trips');
        if (navTrips) {
            // Complete Button
            const archiveBtn = document.createElement('button');
            archiveBtn.id = 'archiveTripBtn';
            archiveBtn.className = 'btn-complete';
            archiveBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>`;
            archiveBtn.title = 'Complete active trip';
            archiveBtn.onclick = archiveActiveTrip;
            navTrips.appendChild(archiveBtn);

            // Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.id = 'deleteTripBtn';
            deleteBtn.className = 'btn-delete';
            deleteBtn.style.marginLeft = '4px'; // Small gap
            deleteBtn.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>`;
            deleteBtn.title = 'Delete active trip';
            deleteBtn.onclick = window.deleteActiveTrip;
            navTrips.appendChild(deleteBtn);
        }
    }

    // Notification Bell Logic
    const bellBtn = document.getElementById('notificationBellBtn');
    const notifDropdown = document.getElementById('notificationDropdown');
    const markReadBtn = document.getElementById('markAllReadBtn');
    if (bellBtn && notifDropdown) {
        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (notifDropdown.style.display === 'none') {
                notifDropdown.style.display = 'flex';
                if (STATE.notifications && STATE.notifications.some(n => !n.is_read)) {
                    markNotificationsRead();
                }
            } else {
                notifDropdown.style.display = 'none';
            }
        });
        document.addEventListener('click', (e) => {
            if (!notifDropdown.contains(e.target) && !bellBtn.contains(e.target)) {
                notifDropdown.style.display = 'none';
            }
        });
        if (markReadBtn) {
            markReadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                markNotificationsRead();
            });
        }
    }

    // Google Login
    initGoogleLogin();

    if (STATE.user) {
        fetchNotifications();
        setInterval(fetchNotifications, 60000); // Poll every minute
    }

    // Initial Nav
    const urlParams = new URLSearchParams(window.location.search);
    navigate(urlParams.get('page') || 'home', null, false);

    // Handle Browser Back/Forward
    window.onpopstate = (e) => {
        if (e.state && e.state.pageId) {
            navigate(e.state.pageId, e.state.data, false);
        } else {
            const up = new URLSearchParams(window.location.search);
            const page = up.get('page') || 'home';
            const id = up.get('id');
            navigate(page, id ? { id } : null, false);
        }
    };
}

window.globalGoogleClientId = null;

async function initGoogleLogin() {
    try {
        const resp = await fetch('/api/config');
        const config = await resp.json();
        if (!config.google_client_id) return;
        
        window.globalGoogleClientId = config.google_client_id;

        window.google.accounts.id.initialize({
            client_id: config.google_client_id,
            callback: handleGoogleLogin
        });
        
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
        STATE.hasLoggedInBefore = true;
        
        // Fetch user data from server
        try {
            const dataRes = await fetch(`/api/data?user_id=${STATE.user.id}`);
            const userData = await dataRes.json();
            
            // Companions — server always wins
            if (userData.groups && userData.groups.length > 0) STATE.groups = userData.groups;

            // Categories — server wins if user has saved custom ones
            if (userData.categories && userData.categories.length > 0) {
                STATE.categories = userData.categories;
            }

            // Budgets — server wins
            if (userData.budgets && userData.budgets.length > 0) {
                STATE.budgets = userData.budgets;
            }
            
            if (userData.trips) {
                // Server trips with is_archived=1 go to archivedTrips
                const serverArchived = userData.trips.filter(t => t.is_archived);
                const serverActive = userData.trips.filter(t => !t.is_archived);
                
                // For archived trips, attach their expenses and restore public state
                serverArchived.forEach(t => {
                    t.expenses = (userData.expenses || []).filter(e => e.trip_id === t.id);
                    t.isPublic = !!t.is_public;  // map DB column to frontend field
                });

                STATE.archivedTrips = serverArchived;
                
                // Merge active trips: keep local ones that aren't on server
                const localActiveIds = new Set(STATE.trips.map(t => t.id));
                const uniqueServerActive = serverActive.filter(t => !localActiveIds.has(t.id));
                STATE.trips = [...STATE.trips, ...uniqueServerActive];

                // Restore expenses for active trips from server
                if (userData.expenses && userData.expenses.length > 0) {
                    const serverExpenses = userData.expenses
                        .filter(e => !e.is_archived_trip)
                        .map(e => ({
                            id: e.id,
                            tripId: e.trip_id,
                            who: e.who,
                            categoryId: e.category_id,
                            label: e.label,
                            date: e.date,
                            country: e.country,
                            value: e.value,
                            currency: e.currency,
                            euroValue: e.euro_value
                        }));
                    const localExpIds = new Set(STATE.expenses.map(e => e.id));
                    const uniqueServerExps = serverExpenses.filter(e => !localExpIds.has(e.id));
                    STATE.expenses = [...STATE.expenses, ...uniqueServerExps];
                }
            }
        } catch (e) {
            console.error("Failed to fetch user data:", e);
        }

        // Auto-create companion for the user if none exist
        STATE.groups = STATE.groups || [];
        if (STATE.groups.length === 0 && STATE.user.name) {
            STATE.groups.push(STATE.user.name);
        }
        
        saveState();
        updateUserUI();
        navigate('profile');
    }
}

function updateUserUI() {
    const avatar = document.getElementById('sidebarProfileAvatar');
    const icon = document.getElementById('sidebarProfileIcon');
    const label = document.getElementById('sidebarProfileLabel');
    const sub = document.getElementById('sidebarProfileSub');
    const pic = document.getElementById('sidebarProfilePic');
    const logoutBtn = document.getElementById('sidebarLogoutBtn');

    if (STATE.user) {
        if (avatar) { avatar.style.display = 'block'; }
        if (icon) { icon.style.display = 'none'; }
        if (label) { label.textContent = STATE.user.name; }
        if (sub) { sub.style.display = 'block'; sub.textContent = 'Logged in ✓'; }
        if (pic) { pic.src = STATE.user.picture; }
        if (logoutBtn) { logoutBtn.style.display = 'block'; }
    } else {
        if (avatar) { avatar.style.display = 'none'; }
        if (icon) { icon.style.display = 'block'; }
        if (label) { label.textContent = 'Log in'; }
        if (sub) { sub.style.display = 'none'; }
        if (logoutBtn) { logoutBtn.style.display = 'none'; }
    }
}

function renderProfile() {
    const div = document.createElement('div');
    
    if (!STATE.user) {
        const isReturning = STATE.hasLoggedInBefore;
        div.innerHTML = `
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #007aff, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Log In</h1>
                <p>${isReturning ? 'Sign in to your account to securely save and sync your trips across all your devices.' : 'Sign in with Google to start syncing your trips and travel memories across all your devices.'}</p>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; min-height: 50vh;">
                <div class="card glass" style="padding: 50px; text-align: center; border-radius: 32px; max-width: 400px; width: 100%;">
                    <h2 style="margin-bottom: 30px; font-size: 1.5rem; color: var(--accent-blue);">${isReturning ? 'Welcome back' : 'Create your account with Google'}</h2>
                    <div id="profileLoginBtnContainer" style="display: flex; justify-content: center; min-height: 40px;"></div>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            if (window.google && window.google.accounts && window.globalGoogleClientId) {
                window.google.accounts.id.renderButton(
                    div.querySelector("#profileLoginBtnContainer"),
                    { theme: "outline", size: "large", width: 280 }
                );
            }
        }, 300);
        
    } else {
        const u = STATE.user;
        const completedTrips = STATE.archivedTrips || [];
        const uniqueCountries = [...new Set(completedTrips.map(t => t.country).filter(Boolean))];
        const customPhoto = STATE.profilePhoto || null;
        const profilePicSrc = customPhoto || u.picture;

        div.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto; padding-bottom: 60px;">
                
                <!-- Instagram-style Profile Header -->
                <div style="display: flex; align-items: flex-start; gap: 40px; padding: 30px 20px; border-bottom: 1px solid var(--glass-border); margin-bottom: 30px;">
                    <!-- Avatar -->
                    <div style="position: relative; flex-shrink: 0; cursor: pointer; border-radius: 50%;" id="profilePicWrapper" title="Change profile photo">
                        <div style="padding: 4px; background: linear-gradient(135deg, #4da3ff 0%, var(--accent-blue) 50%, #004080 100%); border-radius: 50%;">
                            <img id="profilePicDisplay" src="${profilePicSrc}" alt="Profile Picture" style="width: 140px; height: 140px; border-radius: 50%; border: 4px solid var(--bg-color); object-fit: cover; display: block; transition: opacity 0.2s; background: var(--bg-color);">
                        </div>
                        <div style="position: absolute; inset: 4px; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;" id="profilePicOverlay">
                            <div style="background: rgba(0,0,0,0.6); border-radius: 50%; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                            </div>
                        </div>
                        <input type="file" id="profilePhotoInput" accept="image/*" style="display:none;">
                    </div>
                    
                    <!-- Info Section -->
                    <div style="flex: 1; padding-top: 10px;">
                        <!-- Name & Actions -->
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em;">${u.name}</h2>
                            <button id="profileLogoutBtn" style="background: transparent; color: var(--text-secondary); font-weight: 600; border: 1px solid var(--glass-border); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.1)'; this.style.color='#ff3b30'; this.style.borderColor='rgba(255,59,48,0.2)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)'; this.style.borderColor='var(--glass-border)';">Log Out</button>
                        </div>
                        
                        <!-- Stats Row -->
                        <div style="display: flex; gap: 32px; margin-bottom: 24px;">
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${completedTrips.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">trips</span>
                            </div>
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${uniqueCountries.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">countries</span>
                            </div>
                        </div>
                        
                        <!-- Bio & Status -->
                        <div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${u.email}</div>
                            
                            <!-- Inline Status Dropdown (Minimalist) -->
                            <div style="position: relative; display: inline-block; margin-bottom: 8px;">
                                <select id="profileStatus" style="appearance: none; background: rgba(0, 113, 227, 0.08); color: var(--accent-blue); border: 1px solid rgba(0, 113, 227, 0.15); border-radius: 12px; padding: 2px 24px 2px 10px; font-size: 0.8rem; font-weight: 700; cursor: pointer; outline: none; transition: all 0.2s;">
                                    <option value="" disabled ${!u.status ? 'selected' : ''}>Set status...</option>
                                    <option value="Deliberating next trip" ${u.status === 'Deliberating next trip' ? 'selected' : ''}>🤔 Deliberating next trip</option>
                                    <option value="Preparing a trip right now" ${u.status === 'Preparing a trip right now' ? 'selected' : ''}>🎒 Preparing a trip right now</option>
                                    <option value="Exploring the world" ${u.status === 'Exploring the world' ? 'selected' : ''}>🌍 Exploring the world</option>
                                    <option value="Resting at home base" ${u.status === 'Resting at home base' ? 'selected' : ''}>🏠 Resting at home base</option>
                                    <option value="Hunting for flight deals" ${u.status === 'Hunting for flight deals' ? 'selected' : ''}>✈️ Hunting for flight deals</option>
                                </select>
                                <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--accent-blue); font-size: 0.6rem;">▼</div>
                            </div>

                            <!-- Seamless Bio Textarea -->
                            <textarea id="profileBio" placeholder="Add a bio..." style="width: 100%; max-width: 500px; min-height: 40px; background: transparent; border: 1px solid transparent; border-radius: 8px; color: var(--text-primary); font-size: 0.95rem; font-family: inherit; line-height: 1.5; resize: none; outline: none; padding: 6px; margin-left: -6px; transition: all 0.2s;" onfocus="this.style.background='rgba(0,0,0,0.03)'; this.style.borderColor='var(--glass-border)';" onblur="this.style.background='transparent'; this.style.borderColor='transparent';">${u.bio || ''}</textarea>

                            <div style="margin-top: 8px;">
                                <button id="saveProfileBtn" class="btn btn-small" style="background: var(--text-primary); color: var(--bg-color); padding: 6px 16px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; opacity: 0; transition: opacity 0.3s; pointer-events: none;">Save Profile</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: center; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-primary);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        Your footprint
                    </div>
                </div>

                <!-- Footprint Section -->
                <div style="margin-top: 20px;">
                    <p style="color: var(--text-secondary); text-align: center; margin-top: 0; margin-bottom: 24px; font-size: 0.9rem;">Every country you've been to, lit up. Public trips show as pins — click a badge to explore.</p>
                    
                    <div class="card glass" style="padding: 0; overflow: hidden; border-radius: 20px; position: relative; z-index: 1; border: 1px solid var(--glass-border);">
                        <div id="legaciesMap" style="width: 100%; height: 450px;"></div>
                    </div>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            // Profile updates
            const statusEl = div.querySelector('#profileStatus');
            const bioEl = div.querySelector('#profileBio');
            const saveBtn = div.querySelector('#saveProfileBtn');
            
            const handleProfileChange = () => {
                saveBtn.style.opacity = '1';
                saveBtn.style.pointerEvents = 'auto';
            };
            
            if (statusEl) statusEl.onchange = handleProfileChange;
            if (bioEl) bioEl.oninput = handleProfileChange;
            
            if (saveBtn) {
                saveBtn.onclick = async () => {
                    const newStatus = statusEl.value;
                    const newBio = bioEl.value;
                    try {
                        const res = await fetch('/api/profile/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: STATE.user.id, bio: newBio, status: newStatus })
                        });
                        if (res.ok) {
                            STATE.user.bio = newBio;
                            STATE.user.status = newStatus;
                            saveState();
                            saveBtn.style.opacity = '0';
                            saveBtn.style.pointerEvents = 'none';
                            window.showToast?.("Profile updated successfully!");
                        }
                    } catch(e) { console.error("Profile update failed", e); }
                };
            }

            // Profile photo upload
            const wrapper = div.querySelector('#profilePicWrapper');
            const overlay = div.querySelector('#profilePicOverlay');
            const input = div.querySelector('#profilePhotoInput');
            const picDisplay = div.querySelector('#profilePicDisplay');

            if (wrapper) {
                wrapper.addEventListener('mouseenter', () => { if (overlay) overlay.style.opacity = '1'; });
                wrapper.addEventListener('mouseleave', () => { if (overlay) overlay.style.opacity = '0'; });
                wrapper.addEventListener('click', () => input && input.click());
            }

            if (input) {
                input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const dataUrl = ev.target.result;
                        STATE.profilePhoto = dataUrl;
                        saveState();
                        if (picDisplay) picDisplay.src = dataUrl;
                    };
                    reader.readAsDataURL(file);
                });
            }

            // Logout logic
            const logoutBtn = div.querySelector('#profileLogoutBtn');
            if (logoutBtn) {
                logoutBtn.onclick = () => {
                    window.logout();
                };
            }

            // Map logic
            if (typeof L !== 'undefined') {
                const map = L.map('legaciesMap', { 
                    zoomControl: false,  // Remove zoom buttons
                    attributionControl: false,
                    scrollWheelZoom: true 
                }).setView([20, 0], 2);

                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
                    subdomains: 'abcd',
                    maxZoom: 14
                }).addTo(map);

                // Fetch World GeoJSON (Higher resolution to include islands like Balearics and Canaries)
                fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson')
                    .then(res => res.json())
                    .then(data => {
                        L.geoJSON(data, {
                            style: function (feature) {
                                const countryName = feature.properties.NAME || feature.properties.name;
                                const isVisited = uniqueCountries.some(c => 
                                    c.toLowerCase() === countryName.toLowerCase() || 
                                    (c === 'USA' && countryName === 'United States of America') ||
                                    (c === 'UK' && countryName === 'United Kingdom')
                                );
                                return {
                                    fillColor: isVisited ? '#0071e3' : '#d0d0d5',
                                    weight: 1,
                                    opacity: 1,
                                    color: '#ffffff',
                                    fillOpacity: isVisited ? 0.65 : 0.35
                                };
                            }
                        }).addTo(map);
                    }).catch(err => console.error("Failed to load map data", err));

                // Helper: show fancy country trip popup
                function showCountryTripsPopup(countryKey, trips) {
                    const existing = document.getElementById('footprintCountryPopup');
                    if (existing) existing.remove();

                    const popup = document.createElement('div');
                    popup.id = 'footprintCountryPopup';
                    popup.style.cssText = `
                        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -60%) scale(0.92);
                        background: rgba(255,255,255,0.18); backdrop-filter: blur(32px) saturate(180%);
                        -webkit-backdrop-filter: blur(32px) saturate(180%);
                        border: 1px solid rgba(255,255,255,0.3); border-radius: 28px;
                        box-shadow: 0 32px 80px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.15);
                        padding: 0; width: 340px; max-height: 480px;
                        z-index: 9999; overflow: hidden;
                        transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.3s;
                        opacity: 0;
                    `;

                    popup.innerHTML = `
                        <div style="padding: 24px 24px 16px; border-bottom: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #ff2d55; margin-bottom: 4px;">📍 ${trips.length} trip${trips.length > 1 ? 's' : ''}</div>
                                <div style="font-size: 1.3rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em;">${countryKey}</div>
                            </div>
                            <button id="footprintPopupClose" style="width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(0,0,0,0.1); color: var(--text-primary); font-size: 1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">✕</button>
                        </div>
                        <div style="padding: 12px 16px; max-height: 340px; overflow-y: auto;">
                            ${trips.map((trip, i) => `
                                <div class="footprint-trip-row" data-trip-id="${trip.id}" style="
                                    display: flex; align-items: center; gap: 16px;
                                    padding: 14px 12px; border-radius: 16px;
                                    cursor: pointer; margin-bottom: 6px;
                                    transition: background 0.2s;
                                    background: rgba(255,255,255,0.05);
                                " 
                                onmouseenter="this.style.background='rgba(0,113,227,0.12)'"
                                onmouseleave="this.style.background='rgba(255,255,255,0.05)'">
                                    <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #ff2d55, #ff6b81); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 0.85rem; flex-shrink: 0;">${i + 1}</div>
                                    <div style="flex:1; min-width:0;">
                                        <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${trip.name}</div>
                                        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">Public trip · ${trip.country || countryKey}</div>
                                    </div>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                </div>
                            `).join('')}
                        </div>
                    `;

                    document.body.appendChild(popup);

                    // Animate in
                    requestAnimationFrame(() => {
                        popup.style.opacity = '1';
                        popup.style.transform = 'translate(-50%, -50%) scale(1)';
                    });

                    // Close button
                    popup.querySelector('#footprintPopupClose').onclick = () => {
                        popup.style.opacity = '0';
                        popup.style.transform = 'translate(-50%, -60%) scale(0.92)';
                        setTimeout(() => popup.remove(), 300);
                    };

                    // Click outside to close
                    setTimeout(() => {
                        document.addEventListener('click', function closePopup(e) {
                            if (!popup.contains(e.target)) {
                                popup.style.opacity = '0';
                                popup.style.transform = 'translate(-50%, -60%) scale(0.92)';
                                setTimeout(() => popup.remove(), 300);
                                document.removeEventListener('click', closePopup);
                            }
                        });
                    }, 100);

                    // Trip row click → navigate to archived detail
                    popup.querySelectorAll('.footprint-trip-row').forEach(row => {
                        row.onclick = (e) => {
                            e.stopPropagation();
                            const tripId = row.dataset.tripId;
                            popup.remove();
                            navigate('archived-detail', { id: tripId });
                        };
                    });
                }

                // Group public trips by country
                const publicTrips = completedTrips.filter(t => t.isPublic);
                const tripsByCountry = {};
                publicTrips.forEach(trip => {
                    const key = trip.country || trip.name;
                    if (!key) return;
                    if (!tripsByCountry[key]) tripsByCountry[key] = [];
                    tripsByCountry[key].push(trip);
                });

                // Geocode and place one pin per country, with count badge if multiple
                const addPinsSequence = async () => {
                    for (const [countryKey, trips] of Object.entries(tripsByCountry)) {
                        try {
                            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(countryKey)}&format=json&limit=1`);
                            const results = await res.json();
                            if (results && results.length > 0) {
                                const lat = parseFloat(results[0].lat);
                                const lon = parseFloat(results[0].lon);
                                const count = trips.length;
                                const isMulti = count > 1;

                                const pinHtml = isMulti
                                    ? `<div style="position:relative; display:inline-block;">
                                        <div style="width:18px; height:18px; background:#ff2d55; border-radius:50%; border:3px solid white; box-shadow:0 4px 16px rgba(255,45,85,0.5);"></div>
                                        <div style="position:absolute; top:-8px; right:-8px; background:#002d5b; color:white; border-radius:50%; width:18px; height:18px; font-size:0.6rem; font-weight:800; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 6px rgba(0,0,0,0.3);">${count}</div>
                                      </div>`
                                    : `<div style="width:18px; height:18px; background:#ff2d55; border-radius:50%; border:3px solid white; box-shadow:0 4px 16px rgba(255,45,85,0.5);"></div>`;

                                const icon = L.divIcon({
                                    className: '',
                                    html: pinHtml,
                                    iconSize: isMulti ? [30, 30] : [24, 24],
                                    iconAnchor: [12, 12]
                                });

                                const marker = L.marker([lat, lon], { icon }).addTo(map);

                                if (isMulti) {
                                    // Click → zoom in + show fancy country popup
                                    marker.on('click', () => {
                                        map.flyTo([lat, lon], 6, { duration: 0.8 });
                                        showCountryTripsPopup(countryKey, trips);
                                    });
                                } else {
                                    // Single trip — click to show popup too (consistent UX)
                                    marker.on('click', () => {
                                        showCountryTripsPopup(countryKey, trips);
                                    });
                                    marker.bindTooltip(`<div style="text-align:center;"><strong style="color:#002d5b;">${trips[0].name}</strong><br><span style="color:#86868b; font-size:0.8em;">Public Trip</span></div>`, {
                                        direction: 'top',
                                        offset: [0, -12]
                                    });
                                }
                            }
                            await new Promise(r => setTimeout(r, 1000));
                        } catch(e) {
                            console.error("Failed to geocode pin", e);
                        }
                    }
                };

                addPinsSequence();
            }
        }, 100);
    }
    
    return div;
}

document.addEventListener('DOMContentLoaded', init);
