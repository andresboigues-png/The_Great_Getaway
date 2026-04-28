(function(){var e={trips:[],activeTripId:null,categories:[{id:`c1`,name:`Food`,icon:`🍔`,color:`#ff3b30`},{id:`c2`,name:`Transport`,icon:`✈️`,color:`#007aff`},{id:`c3`,name:`Accommodation`,icon:`🏨`,color:`#5856d6`}],expenses:[],groups:[],draftExpense:{who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`,euroValue:``},insightCurrency:`EUR`,rateMode:`at_trip`,rateCache:{},user:null,hasLoggedInBefore:!1,excelMapping:{who:`Who`,categoryId:`Category`,label:`Label`,date:`Date`,country:`Country`,value:`Value`,currency:`Currency`,euroValue:`Euro Value`},activities:[],photos:[],budgets:[],savedFormats:[],tripDays:[],archivedTrips:[],activeDetailId:null,notifications:[]};function t(){let t=localStorage.getItem(`theGreatEscapeState`);t&&Object.assign(e,JSON.parse(t)),e.savedFormats||=[],e.tripDays||=[],e.archivedTrips||=[],e.tripDays.forEach(e=>{e.tickets||=[],e.notes===void 0&&(e.notes=``),e.plan||={morning:``,afternoon:``,evening:``}}),e.trips.length>0&&(!e.activeTripId||!e.trips.find(t=>t.id===e.activeTripId))&&(e.activeTripId=e.trips[0].id)}function n(){e.tripDays&&e.tripDays.forEach(e=>{e.tickets||=[]}),localStorage.setItem(`theGreatEscapeState`,JSON.stringify(e))}var r=new Map;function i(e,t){return r.has(e)||r.set(e,new Set),r.get(e).add(t),()=>r.get(e)?.delete(t)}function a(e,t){r.get(e)?.forEach(n=>{try{n(t)}catch(t){console.error(`Subscriber for "${e}" threw:`,t)}})}i(`state:changed`,n);var o=`Afghanistan.Albania.Algeria.Andorra.Angola.Antigua and Barbuda.Argentina.Armenia.Australia.Austria.Azerbaijan.Bahamas.Bahrain.Bangladesh.Barbados.Belarus.Belgium.Belize.Benin.Bhutan.Bolivia.Bosnia and Herzegovina.Botswana.Brazil.Brunei.Bulgaria.Burkina Faso.Burundi.Cabo Verde.Cambodia.Cameroon.Canada.Central African Republic.Chad.Chile.China.Colombia.Comoros.Congo.Costa Rica.Croatia.Cuba.Cyprus.Czech Republic.Denmark.Djibouti.Dominica.Dominican Republic.Ecuador.Egypt.El Salvador.Equatorial Guinea.Eritrea.Estonia.Eswatini.Ethiopia.Fiji.Finland.France.Gabon.Gambia.Georgia.Germany.Ghana.Greece.Grenada.Guatemala.Guinea.Guinea-Bissau.Guyana.Haiti.Honduras.Hungary.Iceland.India.Indonesia.Iran.Iraq.Ireland.Israel.Italy.Jamaica.Japan.Jordan.Kazakhstan.Kenya.Kiribati.Korea, North.Korea, South.Kosovo.Kuwait.Kyrgyzstan.Laos.Latvia.Lebanon.Lesotho.Liberia.Libya.Liechtenstein.Lithuania.Luxembourg.Madagascar.Malawi.Malaysia.Maldives.Mali.Malta.Marshall Islands.Mauritania.Mauritius.Mexico.Micronesia.Moldova.Monaco.Mongolia.Montenegro.Morocco.Mozambique.Myanmar.Namibia.Nauru.Nepal.Netherlands.New Zealand.Nicaragua.Niger.Nigeria.North Macedonia.Norway.Oman.Pakistan.Palau.Palestine.Panama.Papua New Guinea.Paraguay.Peru.Philippines.Poland.Portugal.Qatar.Romania.Russia.Rwanda.Saint Kitts and Nevis.Saint Lucia.Saint Vincent.Samoa.San Marino.Sao Tome and Principe.Saudi Arabia.Senegal.Serbia.Seychelles.Sierra Leone.Singapore.Slovakia.Slovenia.Solomon Islands.Somalia.South Africa.South Sudan.Spain.Sri Lanka.Sudan.Suriname.Sweden.Switzerland.Syria.Taiwan.Tajikistan.Tanzania.Thailand.Timor-Leste.Togo.Tonga.Trinidad and Tobago.Tunisia.Turkey.Turkmenistan.Tuvalu.Uganda.Ukraine.UAE.UK.United States (USA).Uruguay.Uzbekistan.Vanuatu.Vatican City.Venezuela.Vietnam.Yemen.Zambia.Zimbabwe`.split(`.`).sort(),s=[{i:`https://images.unsplash.com/photo-1526772662000-3f88f10405ff`,q:`To lose yourself in a new country is to find yourself in the world.`},{i:`https://images.unsplash.com/photo-1464822759023-fed622ff2c3b`,q:`Traveling is finding a place where every path leads somewhere beautiful.`},{i:`https://images.unsplash.com/photo-1501854140801-50d01698950b`,q:`To travel is to find peace in the untamed beauty of the world.`},{i:`https://images.unsplash.com/photo-1469474968028-56623f02e42e`,q:`Every sunrise is a new begginning.`},{i:`https://images.unsplash.com/photo-1447752875215-b2761acb3c5d`,q:`Allow yourself to wander roads that feel ancient and alive.`},{i:`https://images.unsplash.com/photo-1433086966358-54859d0ed716`,q:`Traveling is the bridge that connects mind and soul`},{i:`https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07`,q:`Discover hidden places in every corner.`},{i:`https://images.unsplash.com/photo-1507525428034-b723cf961d3e`,q:`Go where the horizon meets the ocean and time stands still.`},{i:`https://images.unsplash.com/photo-1473448912268-2022ce9509d8`,q:`Adventure is not a destination, it's a belief system.`},{i:`https://images.unsplash.com/photo-1493246507139-91e8fad9978e`,q:`Embrace the spirit of the backpacker`},{i:`https://images.unsplash.com/photo-1506744038136-46273834b3fb`,q:`The essence of traveling beats in every human heart.`},{i:`https://images.unsplash.com/photo-1454496522488-7a8e488e8606`,q:`Explore the peak of your potential.`}].map(e=>({i:e.i+`?auto=format&fit=crop&w=1600&q=80`,q:e.q})),c={q:`The world is a book, and those who do not travel read only one page.`,i:`1469854523086-cc02fe5d8800`,f:`Traveling is the best way to learn about the world.`},l={EUR:1,USD:.92,GBP:1.17,JPY:.0062,CHF:1.04,CAD:.68,AUD:.61,CNY:.13,BRL:.18,MXN:.055,INR:.011,IDR:58e-6,SGD:.69,NZD:.56,HKD:.12,KRW:69e-5,ZAR:.049},u={Afghanistan:{i:`1589192144353-8e7c107077a1`,q:`Central Asia's crossroads.`,f:`Did you know that Afghanistan has a population of about 37 million people? Its capital city is Kabul.`},Alabama:{i:`1469474968028-56623f02e42e`,q:`Sweet Home Alabama.`,f:`Did you know that the Alabama State has a population of about 5 million people? Its biggest city is Huntsville.`},Alaska:{i:`1472214103451-9374bd1c798e`,q:`The Last Frontier.`,f:`Did you know that the Alaska State has a population of about 733 thousand people? Its biggest city is Anchorage.`},Albania:{i:`1588965000000-019521f3f39b`,q:`Balkan beauty.`,f:`Did you know that Albania has a population of about 2.9 million people? Its capital city is Tirana.`},Algeria:{i:`1544062562417-380d5d113f8c`,q:`Sahara's gateway.`,f:`Did you know that Algeria has a population of about 42 million people? Its capital city is Alger.`},Andorra:{i:`1469854523086-cc02fe5d8800`,q:`Andorra is waiting for you.`,f:`Did you know that Andorra has a population of about 77 thousand people? Its capital city is Andorra la Vella.`},Angola:{i:`1469854523086-cc02fe5d8800`,q:`Angola is waiting for you.`,f:`Did you know that Angola has a population of about 31 million people? Its capital city is Luanda.`},Antigua:{i:`1469854523086-cc02fe5d8800`,q:`Antigua is waiting for you.`,f:`Did you know that Antigua and Barbuda has a population of about 96 thousand people? Its capital city is Saint John's.`},Argentina:{i:`1449433114371-d67b866d368e`,q:`Land of Tango.`,f:`Did you know that Argentina has a population of about 44 million people? Its capital city is Buenos Aires.`},Arizona:{i:`1501854140801-50d01698950b`,q:`The Grand Canyon State.`,f:`Did you know that the Arizona State has a population of about 7 million people? Its biggest city is Phoenix.`},Arkansas:{i:`1470071131384-001b85755536`,q:`The Natural State.`,f:`Did you know that the Arkansas State has a population of about 3 million people? Its biggest city is Little Rock.`},Armenia:{i:`1469854523086-cc02fe5d8800`,q:`Armenia is waiting for you.`,f:`Did you know that Armenia has a population of about 3.0 million people? Its capital city is Yerevan.`},Australia:{i:`1523413680321-4d9d448b18f9`,q:`The Great Down Under.`,f:`Did you know that Australia has a population of about 25 million people? Its capital city is Canberra.`},Austria:{i:`1516903529241-10503553f08a`,q:`Alps and Art.`,f:`Did you know that Austria has a population of about 8.8 million people? Its capital city is Wien.`},Azerbaijan:{i:`1469854523086-cc02fe5d8800`,q:`Azerbaijan is waiting for you.`,f:`Did you know that Azerbaijan has a population of about 9.9 million people? Its capital city is Baku.`},Bahamas:{i:`1469854523086-cc02fe5d8800`,q:`Bahamas is waiting for you.`,f:`Did you know that Bahamas has a population of about 386 thousand people? Its capital city is Nassau.`},Bahrain:{i:`1469854523086-cc02fe5d8800`,q:`Bahrain is waiting for you.`,f:`Did you know that Bahrain has a population of about 1.6 million people? Its capital city is al-Manama.`},Bangladesh:{i:`1469854523086-cc02fe5d8800`,q:`Bangladesh is waiting for you.`,f:`Did you know that Bangladesh has a population of about 161 million people? Its capital city is Dhaka.`},Barbados:{i:`1469854523086-cc02fe5d8800`,q:`Barbados is waiting for you.`,f:`Did you know that Barbados has a population of about 287 thousand people? Its capital city is Bridgetown.`},Belarus:{i:`1469854523086-cc02fe5d8800`,q:`Belarus is waiting for you.`,f:`Did you know that Belarus has a population of about 9.5 million people? Its capital city is Minsk.`},Belgium:{i:`1490642220353-d023b6b27e8a`,q:`Heart of Europe.`,f:`Did you know that Belgium has a population of about 11 million people? Its capital city is Bruxelles.`},Belize:{i:`1469854523086-cc02fe5d8800`,q:`Belize is waiting for you.`,f:`Did you know that Belgium has a population of about 383 thousand people? Its capital city is Belmopan.`},Benin:{i:`1469854523086-cc02fe5d8800`,q:`Benin is waiting for you.`,f:`Did you know that Benin has a population of about 11 million people? Its capital city is Porto-Novo.`},Bhutan:{i:`1469854523086-cc02fe5d8800`,q:`Bhutan is waiting for you.`,f:`Did you know that Bhutan has a population of about 754 thousand people? Its capital city is Thimphu.`},Bolivia:{i:`1469854523086-cc02fe5d8800`,q:`Bolivia is waiting for you.`,f:`Did you know that Bolivia has a population of about 11 million people? Its capital city is La Paz.`},Bosnia:{i:`1469854523086-cc02fe5d8800`,q:`Bosnia is waiting for you.`,f:`Did you know that Bosnia and Herzegovina has a population of about 3.3 million people? Its capital city is Sarajevo.`},Botswana:{i:`1469854523086-cc02fe5d8800`,q:`Botswana is waiting for you.`,f:`Did you know that Botswana has a population of about 2.3 million people? Its capital city is Gaborone.`},Brazil:{i:`1483729553833-9411f2115507`,q:`Tropical rhythms.`,f:`Did you know that Brazil has a population of about 209 million people? Its capital city is Brasília.`},Brunei:{i:`1469854523086-cc02fe5d8800`,q:`Brunei is waiting for you.`,f:`Did you know that Brunei has a population of about 429 thousand people? Its capital city is Bandar Seri Begawan.`},Bulgaria:{i:`1469854523086-cc02fe5d8800`,q:`Bulgaria is waiting for you.`,f:`Did you know that Bulgaria has a population of about 7.0 million people? Its capital city is Sofia.`},Burkina:{i:`1469854523086-cc02fe5d8800`,q:`Burkina is waiting for you.`,f:`Did you know that Burkina Faso has a population of about 20 million people? Its capital city is Ouagadougou.`},Burundi:{i:`1469854523086-cc02fe5d8800`,q:`Burundi is waiting for you.`,f:`Did you know that Burundi has a population of about 11 million people? Its capital city is Bujumbura.`},Cabo:{i:`1469854523086-cc02fe5d8800`,q:`Cabo is waiting for you.`,f:`Did you know that Cabo Verde has a population of about 556 thousand people?`},California:{i:`1465146344425-f00d5f5c8f07`,q:`The Golden State.`,f:`Did you know that the California State has a population of about 40 million people? Its biggest city is Los Angeles.`},Cambodia:{i:`1469854523086-cc02fe5d8800`,q:`Cambodia is waiting for you.`,f:`Did you know that Cambodia has a population of about 16 million people? Its capital city is Phnom Penh.`},Cameroon:{i:`1469854523086-cc02fe5d8800`,q:`Cameroon is waiting for you.`,f:`Did you know that Cameroon has a population of about 25 million people? Its capital city is Yaounde.`},Canada:{i:`1503622765438-dec7e6190771`,q:`Great White North.`,f:`Did you know that Canada has a population of about 37 million people? Its capital city is Ottawa.`},Central:{i:`1469854523086-cc02fe5d8800`,q:`Central is waiting for you.`,f:`Did you know that Central African Republic has a population of about 4.7 million people? Its capital city is Bangui.`},Chad:{i:`1469854523086-cc02fe5d8800`,q:`Chad is waiting for you.`,f:`Did you know that Chad has a population of about 15 million people? Its capital city is N'Djamena.`},Chile:{i:`1469854523086-cc02fe5d8800`,q:`Chile is waiting for you.`,f:`Did you know that Chile has a population of about 19 million people? Its capital city is Santiago de Chile.`},China:{i:`1508433313474-758b4ff2cbb0`,q:`Ancient and modern.`,f:`Did you know that China has a population of about 1.4 billion people? Its capital city is Peking.`},Colombia:{i:`1533696812891-7d124a7300c2`,q:`Coffee and color.`,f:`Did you know that Colombia has a population of about 50 million people? Its capital city is Bogota.`},Comoros:{i:`1469854523086-cc02fe5d8800`,q:`Comoros is waiting for you.`,f:`Did you know that Comoros has a population of about 832 thousand people? Its capital city is Moroni.`},Congo:{i:`1469854523086-cc02fe5d8800`,q:`Congo is waiting for you.`,f:`Did you know that Congo has a population of about 84 million people? Its capital city is Brazzaville.`},"Costa Rica":{i:`1516244433333-333333333333`,q:`Pura Vida.`,f:`Did you know that Costa Rica has a population of about 5 million people? Its capital city is San Jose.`},Croatia:{i:`1506973035811-1354d12ee703`,q:`Adriatic gem.`,f:`Did you know that Croatia has a population of about 4.1 million people? Its capital city is Zagreb.`},Cuba:{i:`1469854523086-cc02fe5d8800`,q:`Cuba is waiting for you.`,f:`Did you know that Cuba has a population of about 11 million people? Its capital city is La Habana.`},Cyprus:{i:`1469854523086-cc02fe5d8800`,q:`Cyprus is waiting for you.`,f:`Did you know that Cyprus has a population of about 1.2 million people? Its capital city is Lefkosia.`},Czech:{i:`1469854523086-cc02fe5d8800`,q:`Czech is waiting for you.`,f:`Did you know that Czech Republic has a population of about 11 million people? Its capital city is Praha.`},Denmark:{i:`1513326738677-22749004144e`,q:`Hygge home.`,f:`Did you know that Denmark has a population of about 5.8 million people? Its capital city is København.`},Djibouti:{i:`1469854523086-cc02fe5d8800`,q:`Djibouti is waiting for you.`,f:`Did you know that Djibouti has a population of about 958 thousand people? Its capital city is Djibouti.`},Dominica:{i:`1469854523086-cc02fe5d8800`,q:`Dominica is waiting for you.`,f:`Did you know that Dominica has a population of about 71 thousand people? Its capital city is Roseau.`},Dominican:{i:`1469854523086-cc02fe5d8800`,q:`Dominican is waiting for you.`,f:`Did you know that Dominican Republic has a population of about 11 million people? Its capital city is Santo Domingo.`},Ecuador:{i:`1469854523086-cc02fe5d8800`,q:`Ecuador is waiting for you.`,f:`Did you know that Ecuador has a population of about 17 million people? Its capital city is Quito.`},Egypt:{i:`1506197394155-930c76311653`,q:`Gifts of the Nile.`,f:`Did you know that Egypt has a population of about 98 million people? Its capital city is al-Qahira.`},El:{i:`1469854523086-cc02fe5d8800`,q:`El is waiting for you.`,f:`Did you know that El Salvador has a population of about 6.4 million people? Its capital city is San Salvador.`},Equatorial:{i:`1469854523086-cc02fe5d8800`,q:`Equatorial is waiting for you.`,f:`Did you know that Equatorial Guinea has a population of about 1.3 million people? Its capital city is Malabo.`},Eritrea:{i:`1469854523086-cc02fe5d8800`,q:`Eritrea is waiting for you.`,f:`Did you know that Eritrea has a population of about 3.2 million people? Its capital city is Asmara.`},Estonia:{i:`1469854523086-cc02fe5d8800`,q:`Estonia is waiting for you.`,f:`Did you know that Estonia has a population of about 1.3 million people? Its capital city is Tallinn.`},Eswatini:{i:`1469854523086-cc02fe5d8800`,q:`Eswatini is waiting for you.`,f:`Did you know that Eswatini has a population of about 1.1 million people? Its capital city is Mbabane.`},Ethiopia:{i:`1469854523086-cc02fe5d8800`,q:`Ethiopia is waiting for you.`,f:`Did you know that Ethiopia has a population of about 109 million people? Its capital city is Addis Abeba.`},Fiji:{i:`1469854523086-cc02fe5d8800`,q:`Fiji is waiting for you.`,f:`Did you know that Fiji has a population of about 883 thousand people? Its capital city is Suva.`},Finland:{i:`1518129448333-3c220f592612`,q:`Land of a thousand lakes.`,f:`Did you know that Finland has a population of about 5.5 million people? Its capital city is Helsinki.`},Florida:{i:`1447752875215-b2761acb3c5d`,q:`The Sunshine State.`,f:`Did you know that the Florida State has a population of about 21 million people? Its biggest city is Jacksonville.`},France:{i:`1502603300225-44b2019e9930`,q:`Art and elegance.`,f:`Did you know that France has a population of about 67 million people? Its capital city is Paris.`},Gabon:{i:`1469854523086-cc02fe5d8800`,q:`Gabon is waiting for you.`,f:`Did you know that Gabon has a population of about 2.1 million people? Its capital city is Libreville.`},Gambia:{i:`1469854523086-cc02fe5d8800`,q:`Gambia is waiting for you.`,f:`Did you know that Gambia has a population of about 2.1 million people? Its capital city is Banjul.`},Georgia:{i:`1501854140801-50d01698950b`,q:`Caucasus charm.`,f:`Did you know that Georgia has a population of about 3.7 million people? Its capital city is Tiflis.`},Germany:{i:`1467269013931-1d7411a33a01`,q:`History and efficiency.`,f:`Did you know that Germany has a population of about 83 million people? Its capital city is Berlin.`},Ghana:{i:`1469854523086-cc02fe5d8800`,q:`Ghana is waiting for you.`,f:`Did you know that Ghana has a population of about 30 million people? Its capital city is Accra.`},Greece:{i:`1505164222044-1803503a7d48`,q:`Cradle of civilization.`,f:`Did you know that Greece has a population of about 10 million people? Its capital city is Athenai.`},Grenada:{i:`1469854523086-cc02fe5d8800`,q:`Grenada is waiting for you.`,f:`Did you know that Grenada has a population of about 111 thousand people? Its capital city is Saint George's.`},Guatemala:{i:`1469854523086-cc02fe5d8800`,q:`Guatemala is waiting for you.`,f:`Did you know that Guatemala has a population of about 17 million people? Its capital city is Ciudad de Guatemala.`},Guinea:{i:`1469854523086-cc02fe5d8800`,q:`Guinea is waiting for you.`,f:`Did you know that Guinea has a population of about 12 million people? Its capital city is Conakry.`},"Guinea-Bissau":{i:`1469854523086-cc02fe5d8800`,q:`Guinea-Bissau is waiting for you.`,f:`Did you know that Guinea-Bissau has a population of about 1.9 million people? Its capital city is Bissau.`},Guyana:{i:`1469854523086-cc02fe5d8800`,q:`Guyana is waiting for you.`,f:`Did you know that Guyana has a population of about 779 thousand people? Its capital city is Georgetown.`},Haiti:{i:`1469854523086-cc02fe5d8800`,q:`Haiti is waiting for you.`,f:`Did you know that Haiti has a population of about 11 million people? Its capital city is Port-au-Prince.`},Hawaii:{i:`1476610971033-5c8523b7a2d6`,q:`The Aloha State.`,f:`Did you know that the Hawaii State has a population of about 2 million people? Its biggest city is Honolulu.`},Honduras:{i:`1469854523086-cc02fe5d8800`,q:`Honduras is waiting for you.`,f:`Did you know that Honduras has a population of about 9.6 million people? Its capital city is Tegucigalpa.`},Hungary:{i:`1469854523086-cc02fe5d8800`,q:`Hungary is waiting for you.`,f:`Did you know that Hungary has a population of about 9.8 million people? Its capital city is Budapest.`},Iceland:{i:`1476610971033-5c8523b7a2d6`,q:`Fire and ice.`,f:`Did you know that Iceland has a population of about 353 thousand people? Its capital city is Reykjavík.`},Idaho:{i:`1449844908441-8829872d2607`,q:`The Gem State.`,f:`Did you know that the Idaho State has a population of about 2 million people? Its biggest city is Boise.`},Illinois:{i:`1469474968028-56623f02e42e`,q:`The Prairie State.`,f:`Did you know that the Illinois State has a population of about 13 million people? Its biggest city is Chicago.`},India:{i:`1524478228052-b137a0a74564`,q:`Incredible India.`,f:`Did you know that India has a population of about 1.4 billion people? Its capital city is New Delhi.`},Indiana:{i:`1472214103451-9374bd1c798e`,q:`The Hoosier State.`,f:`Did you know that the Indiana State has a population of about 7 million people? Its biggest city is Indianapolis.`},Indonesia:{i:`1513407027603-2fcbb73c2806`,q:`Island paradise.`,f:`Did you know that Indonesia has a population of about 268 million people? Its capital city is Jakarta.`},Iowa:{i:`1501854140801-50d01698950b`,q:`The Hawkeye State.`,f:`Did you know that the Iowa State has a population of about 3 million people? Its biggest city is Des Moines.`},Iran:{i:`1469854523086-cc02fe5d8800`,q:`Iran is waiting for you.`,f:`Did you know that Iran has a population of about 82 million people? Its capital city is Tehran.`},Iraq:{i:`1469854523086-cc02fe5d8800`,q:`Iraq is waiting for you.`,f:`Did you know that Iraq has a population of about 38 million people? Its capital city is Baghdad.`},Ireland:{i:`1504449104445-9a51e6b02a20`,q:`Emerald Isle.`,f:`Did you know that Ireland has a population of about 4.9 million people? Its capital city is Dublin.`},Israel:{i:`1469854523086-cc02fe5d8800`,q:`Israel is waiting for you.`,f:`Did you know that Israel has a population of about 8.9 million people? Its capital city is Jerusalem.`},Italy:{i:`1516483638261-1478525c7f88`,q:`La Dolce Vita.`,f:`Did you know that Italy has a population of about 60 million people? Its capital city is Roma.`},Jamaica:{i:`1469854523086-cc02fe5d8800`,q:`Jamaica is waiting for you.`,f:`Did you know that Jamaica has a population of about 2.9 million people? Its capital city is Kingston.`},Japan:{i:`1493976040374-4efc0c8d1853`,q:`Land of the Rising Sun.`,f:`Did you know that Japan has a population of about 127 million people? Its capital city is Tokyo.`},Jordan:{i:`1469854523086-cc02fe5d8800`,q:`Jordan is waiting for you.`,f:`Did you know that Jordan has a population of about 10.0 million people? Its capital city is Amman.`},Kansas:{i:`1470071131384-001b85755536`,q:`The Sunflower State.`,f:`Did you know that the Kansas State has a population of about 3 million people? Its biggest city is Wichita.`},Kazakhstan:{i:`1469854523086-cc02fe5d8800`,q:`Kazakhstan is waiting for you.`,f:`Did you know that Kazakhstan has a population of about 18 million people? Its capital city is Astana.`},Kentucky:{i:`1465146344425-f00d5f5c8f07`,q:`The Bluegrass State.`,f:`Did you know that the Kentucky State has a population of about 4 million people? Its biggest city is Louisville.`},Kenya:{i:`1469854523086-cc02fe5d8800`,q:`Kenya is waiting for you.`,f:`Did you know that Kenya has a population of about 51 million people? Its capital city is Nairobi.`},Kiribati:{i:`1469854523086-cc02fe5d8800`,q:`Kiribati is waiting for you.`,f:`Did you know that Kiribati has a population of about 116 thousand people? Its capital city is Bairiki.`},Kuwait:{i:`1469854523086-cc02fe5d8800`,q:`Kuwait is waiting for you.`,f:`Did you know that Kuwait has a population of about 4.1 million people? Its capital city is Kuwait.`},Kyrgyzstan:{i:`1469854523086-cc02fe5d8800`,q:`Kyrgyzstan is waiting for you.`,f:`Did you know that Kyrgyzstan has a population of about 6.3 million people? Its capital city is Bishkek.`},Laos:{i:`1469854523086-cc02fe5d8800`,q:`Laos is waiting for you.`,f:`Did you know that Laos has a population of about 7.1 million people? Its capital city is Vientiane.`},Latvia:{i:`1469854523086-cc02fe5d8800`,q:`Latvia is waiting for you.`,f:`Did you know that Latvia has a population of about 1.9 million people? Its capital city is Riga.`},Lebanon:{i:`1469854523086-cc02fe5d8800`,q:`Lebanon is waiting for you.`,f:`Did you know that Lebanon has a population of about 6.8 million people? Its capital city is Beirut.`},Lesotho:{i:`1469854523086-cc02fe5d8800`,q:`Lesotho is waiting for you.`,f:`Did you know that Lesotho has a population of about 2.1 million people? Its capital city is Maseru.`},Liberia:{i:`1469854523086-cc02fe5d8800`,q:`Liberia is waiting for you.`,f:`Did you know that Liberia has a population of about 4.8 million people? Its capital city is Monrovia.`},Libya:{i:`1469854523086-cc02fe5d8800`,q:`Libya is waiting for you.`,f:`Did you know that Libya has a population of about 6.7 million people? Its capital city is Tripoli.`},Liechtenstein:{i:`1469854523086-cc02fe5d8800`,q:`Liechtenstein is waiting for you.`,f:`Did you know that Liechtenstein has a population of about 38 thousand people? Its capital city is Vaduz.`},Lithuania:{i:`1469854523086-cc02fe5d8800`,q:`Lithuania is waiting for you.`,f:`Did you know that Lithuania has a population of about 2.8 million people? Its capital city is Vilnius.`},Louisiana:{i:`1433086966358-54859d0ed716`,q:`The Pelican State.`,f:`Did you know that the Louisiana State has a population of about 5 million people? Its biggest city is New Orleans.`},Luxembourg:{i:`1469854523086-cc02fe5d8800`,q:`Luxembourg is waiting for you.`,f:`Did you know that Luxembourg has a population of about 608 thousand people? Its capital city is Luxembourg [Luxemburg/L.`},Madagascar:{i:`1469854523086-cc02fe5d8800`,q:`Madagascar is waiting for you.`,f:`Did you know that Madagascar has a population of about 26 million people? Its capital city is Antananarivo.`},Maine:{i:`1473448912268-2022ce9509d8`,q:`The Pine Tree State.`,f:`Did you know that the Maine State has a population of about 1 million people? Its biggest city is Portland.`},Malawi:{i:`1469854523086-cc02fe5d8800`,q:`Malawi is waiting for you.`,f:`Did you know that Malawi has a population of about 18 million people? Its capital city is Lilongwe.`},Malaysia:{i:`1469854523086-cc02fe5d8800`,q:`Malaysia is waiting for you.`,f:`Did you know that Malaysia has a population of about 32 million people? Its capital city is Kuala Lumpur.`},Maldives:{i:`1469854523086-cc02fe5d8800`,q:`Maldives is waiting for you.`,f:`Did you know that Maldives has a population of about 516 thousand people? Its capital city is Male.`},Mali:{i:`1469854523086-cc02fe5d8800`,q:`Mali is waiting for you.`,f:`Did you know that Mali has a population of about 19 million people? Its capital city is Bamako.`},Malta:{i:`1469854523086-cc02fe5d8800`,q:`Malta is waiting for you.`,f:`Did you know that Malta has a population of about 485 thousand people? Its capital city is Valletta.`},Marshall:{i:`1469854523086-cc02fe5d8800`,q:`Marshall is waiting for you.`,f:`Did you know that Marshall Islands has a population of about 58 thousand people? Its capital city is Dalap-Uliga-Darrit.`},Maryland:{i:`1447752875215-b2761acb3c5d`,q:`The Old Line State.`,f:`Did you know that the Maryland State has a population of about 6 million people? Its biggest city is Baltimore.`},Massachusetts:{i:`1464822759023-fed622ff2c3b`,q:`The Bay State.`,f:`Did you know that the Massachusetts State has a population of about 7 million people? Its biggest city is Boston.`},Mauritania:{i:`1469854523086-cc02fe5d8800`,q:`Mauritania is waiting for you.`,f:`Did you know that Mauritania has a population of about 4.4 million people? Its capital city is Nouakchott.`},Mauritius:{i:`1469854523086-cc02fe5d8800`,q:`Mauritius is waiting for you.`,f:`Did you know that Mauritius has a population of about 1.3 million people? Its capital city is Port-Louis.`},Mexico:{i:`1512813195302-3f11d1306eb5`,q:`Viva México.`,f:`Did you know that Mexico has a population of about 126 million people? Its capital city is Ciudad de M.`},Michigan:{i:`1507525428034-b723cf961d3e`,q:`The Great Lakes State.`,f:`Did you know that the Michigan State has a population of about 10 million people? Its biggest city is Detroit.`},Micronesia:{i:`1469854523086-cc02fe5d8800`,q:`Micronesia is waiting for you.`,f:`Did you know? Micronesia is full of hidden gems waiting to be explored.`},Minnesota:{i:`1476610971033-5c8523b7a2d6`,q:`The North Star State.`,f:`Did you know that the Minnesota State has a population of about 6 million people? Its biggest city is Minneapolis.`},Mississippi:{i:`1449844908441-8829872d2607`,q:`The Magnolia State.`,f:`Did you know that the Mississippi State has a population of about 3 million people? Its biggest city is Jackson.`},Missouri:{i:`1469474968028-56623f02e42e`,q:`The Show-Me State.`,f:`Did you know that the Missouri State has a population of about 6 million people? Its biggest city is Kansas City.`},Moldova:{i:`1469854523086-cc02fe5d8800`,q:`Moldova is waiting for you.`,f:`Did you know that Moldova has a population of about 2.7 million people? Its capital city is Chisinau.`},Monaco:{i:`1469854523086-cc02fe5d8800`,q:`Monaco is waiting for you.`,f:`Did you know that Monaco has a population of about 39 thousand people? Its capital city is Monaco-Ville.`},Mongolia:{i:`1469854523086-cc02fe5d8800`,q:`Mongolia is waiting for you.`,f:`Did you know that Mongolia has a population of about 3.2 million people? Its capital city is Ulan Bator.`},Montana:{i:`1472214103451-9374bd1c798e`,q:`Big Sky Country.`,f:`Did you know that the Montana State has a population of about 1 million people? Its biggest city is Billings.`},Montenegro:{i:`1469854523086-cc02fe5d8800`,q:`Montenegro is waiting for you.`,f:`Did you know that Montenegro has a population of about 631 thousand people? Its capital city is Podgorica.`},Morocco:{i:`1469854523086-cc02fe5d8800`,q:`Morocco is waiting for you.`,f:`Did you know that Morocco has a population of about 36 million people? Its capital city is Rabat.`},Mozambique:{i:`1469854523086-cc02fe5d8800`,q:`Mozambique is waiting for you.`,f:`Did you know that Mozambique has a population of about 29 million people? Its capital city is Maputo.`},Myanmar:{i:`1469854523086-cc02fe5d8800`,q:`Myanmar is waiting for you.`,f:`Did you know that Myanmar has a population of about 54 million people? Its capital city is Rangoon (Yangon).`},Namibia:{i:`1469854523086-cc02fe5d8800`,q:`Namibia is waiting for you.`,f:`Did you know that Namibia has a population of about 2.4 million people? Its capital city is Windhoek.`},Nauru:{i:`1469854523086-cc02fe5d8800`,q:`Nauru is waiting for you.`,f:`Did you know that Nauru has a population of about 13 thousand people? Its capital city is Yaren.`},Nebraska:{i:`1501854140801-50d01698950b`,q:`The Cornhusker State.`,f:`Did you know that the Nebraska State has a population of about 2 million people? Its biggest city is Omaha.`},Nepal:{i:`1469854523086-cc02fe5d8800`,q:`Nepal is waiting for you.`,f:`Did you know that Nepal has a population of about 28 million people? Its capital city is Kathmandu.`},Netherlands:{i:`1513481615233-5e67010e407d`,q:`Canals and colors.`,f:`Did you know that Netherlands has a population of about 17 million people? Its capital city is Amsterdam.`},Nevada:{i:`1470071131384-001b85755536`,q:`The Silver State.`,f:`Did you know that the Nevada State has a population of about 3 million people? Its biggest city is Las Vegas.`},"New Hampshire":{i:`1465146344425-f00d5f5c8f07`,q:`Live Free or Die.`,f:`Did you know that the New Hampshire State has a population of about 1 million people? Its biggest city is Manchester.`},"New Jersey":{i:`1433086966358-54859d0ed716`,q:`The Garden State.`,f:`Did you know that the New Jersey State has a population of about 9 million people? Its biggest city is Newark.`},"New Mexico":{i:`1473448912268-2022ce9509d8`,q:`Land of Enchantment.`,f:`Did you know that the New Mexico State has a population of about 2 million people? Its biggest city is Albuquerque.`},"New York":{i:`1447752875215-b2761acb3c5d`,q:`The Empire State.`,f:`Did you know that the New York State has a population of about 20 million people? Its biggest city is New York City.`},"New Zealand":{i:`1469854523086-cc02fe5d8800`,q:`New Zealand is waiting for you.`,f:`Did you know that New Zealand has a population of about 4.8 million people? Its capital city is Wellington.`},Nicaragua:{i:`1469854523086-cc02fe5d8800`,q:`Nicaragua is waiting for you.`,f:`Did you know that Nicaragua has a population of about 6.5 million people? Its capital city is Managua.`},Niger:{i:`1469854523086-cc02fe5d8800`,q:`Niger is waiting for you.`,f:`Did you know that Niger has a population of about 22 million people? Its capital city is Niamey.`},Nigeria:{i:`1469854523086-cc02fe5d8800`,q:`Nigeria is waiting for you.`,f:`Did you know that Nigeria has a population of about 196 million people? Its capital city is Abuja.`},"North Carolina":{i:`1464822759023-fed622ff2c3b`,q:`First in Flight.`,f:`Did you know that the North Carolina State has a population of about 10 million people? Its biggest city is Charlotte.`},"North Dakota":{i:`1507525428034-b723cf961d3e`,q:`The Peace Garden State.`,f:`Did you know that the North Dakota State has a population of about 779 thousand people? Its biggest city is Fargo.`},"North Macedonia":{i:`1469854523086-cc02fe5d8800`,q:`North Macedonia is waiting for you.`,f:`Did you know that North Macedonia has a population of about 2.1 million people? Its capital city is Skopje.`},Norway:{i:`1519067793744-119192411b21`,q:`Fjord fantasy.`,f:`Did you know that Norway has a population of about 5.3 million people? Its capital city is Oslo.`},Ohio:{i:`1476610971033-5c8523b7a2d6`,q:`The Buckeye State.`,f:`Did you know that the Ohio State has a population of about 12 million people? Its biggest city is Columbus.`},Oklahoma:{i:`1449844908441-8829872d2607`,q:`The Sooner State.`,f:`Did you know that the Oklahoma State has a population of about 4 million people? Its biggest city is Oklahoma City.`},Oman:{i:`1469854523086-cc02fe5d8800`,q:`Oman is waiting for you.`,f:`Did you know that Oman has a population of about 4.8 million people? Its capital city is Masqat.`},Oregon:{i:`1469474968028-56623f02e42e`,q:`The Beaver State.`,f:`Did you know that the Oregon State has a population of about 4 million people? Its biggest city is Portland.`},Pakistan:{i:`1469854523086-cc02fe5d8800`,q:`Pakistan is waiting for you.`,f:`Did you know that Pakistan has a population of about 212 million people? Its capital city is Islamabad.`},Palau:{i:`1469854523086-cc02fe5d8800`,q:`Palau is waiting for you.`,f:`Did you know that Palau has a population of about 18 thousand people? Its capital city is Koror.`},Palestine:{i:`1469854523086-cc02fe5d8800`,q:`Palestine is waiting for you.`,f:`Did you know that Palestine has a population of about 4.6 million people? Its capital city is Gaza.`},Panama:{i:`1469854523086-cc02fe5d8800`,q:`Panama is waiting for you.`,f:`Did you know that Panama has a population of about 4.2 million people? Its capital city is Ciudad de Panamá.`},"Papua New Guinea":{i:`1469854523086-cc02fe5d8800`,q:`Papua New Guinea is waiting for you.`,f:`Did you know that Papua New Guinea has a population of about 8.6 million people? Its capital city is Port Moresby.`},Paraguay:{i:`1469854523086-cc02fe5d8800`,q:`Paraguay is waiting for you.`,f:`Did you know that Paraguay has a population of about 7.0 million people? Its capital city is Asunción.`},Pennsylvania:{i:`1472214103451-9374bd1c798e`,q:`The Keystone State.`,f:`Did you know that the Pennsylvania State has a population of about 13 million people? Its biggest city is Philadelphia.`},Peru:{i:`1469854523086-cc02fe5d8800`,q:`Peru is waiting for you.`,f:`Did you know that Peru has a population of about 32 million people? Its capital city is Lima.`},Philippines:{i:`1469854523086-cc02fe5d8800`,q:`Philippines is waiting for you.`,f:`Did you know that Philippines has a population of about 107 million people? Its capital city is Manila.`},Poland:{i:`1469854523086-cc02fe5d8800`,q:`Poland is waiting for you.`,f:`Did you know that Poland has a population of about 38 million people? Its capital city is Warszawa.`},Portugal:{i:`1515232353913-9092d6e32a21`,q:`Atlantic soulful.`,f:`Did you know that Portugal has a population of about 10 million people? Its capital city is Lisboa.`},Qatar:{i:`1469854523086-cc02fe5d8800`,q:`Qatar is waiting for you.`,f:`Did you know that Qatar has a population of about 2.8 million people? Its capital city is Doha.`},"Rhode Island":{i:`1501854140801-50d01698950b`,q:`The Ocean State.`,f:`Did you know that the Rhode Island State has a population of about 1 million people? Its biggest city is Providence.`},Romania:{i:`1469854523086-cc02fe5d8800`,q:`Romania is waiting for you.`,f:`Did you know that Romania has a population of about 19 million people? Its capital city is Bucuresti.`},Russia:{i:`1469854523086-cc02fe5d8800`,q:`Russia is waiting for you.`,f:`Did you know? Russia is full of hidden gems waiting to be explored.`},Rwanda:{i:`1469854523086-cc02fe5d8800`,q:`Rwanda is waiting for you.`,f:`Did you know that Rwanda has a population of about 12 million people? Its capital city is Kigali.`},"Saint Kitts And Nevis":{i:`1469854523086-cc02fe5d8800`,q:`Saint Kitts And Nevis is waiting for you.`,f:`Did you know that Saint Kitts and Nevis has a population of about 52 thousand people? Its capital city is Basseterre.`},"Saint Lucia":{i:`1469854523086-cc02fe5d8800`,q:`Saint Lucia is waiting for you.`,f:`Did you know that Saint Lucia has a population of about 182 thousand people? Its capital city is Castries.`},"Saint Vincent":{i:`1469854523086-cc02fe5d8800`,q:`Saint Vincent is waiting for you.`,f:`Did you know? Saint Vincent is full of hidden gems waiting to be explored.`},Samoa:{i:`1469854523086-cc02fe5d8800`,q:`Samoa is waiting for you.`,f:`Did you know that Samoa has a population of about 196 thousand people? Its capital city is Apia.`},"San Marino":{i:`1469854523086-cc02fe5d8800`,q:`San Marino is waiting for you.`,f:`Did you know that San Marino has a population of about 34 thousand people? Its capital city is San Marino.`},"Sao Tome And Principe":{i:`1469854523086-cc02fe5d8800`,q:`Sao Tome And Principe is waiting for you.`,f:`Did you know that Sao Tome and Principe has a population of about 211 thousand people? Its capital city is São Tomé.`},"Saudi Arabia":{i:`1469854523086-cc02fe5d8800`,q:`Saudi Arabia is waiting for you.`,f:`Did you know that Saudi Arabia has a population of about 34 million people? Its capital city is Riyadh.`},Senegal:{i:`1469854523086-cc02fe5d8800`,q:`Senegal is waiting for you.`,f:`Did you know that Senegal has a population of about 16 million people? Its capital city is Dakar.`},Serbia:{i:`1469854523086-cc02fe5d8800`,q:`Serbia is waiting for you.`,f:`Did you know that Serbia has a population of about 7.0 million people? Its capital city is Belgrade.`},Seychelles:{i:`1469854523086-cc02fe5d8800`,q:`Seychelles is waiting for you.`,f:`Did you know that Seychelles has a population of about 97 thousand people? Its capital city is Victoria.`},"Sierra Leone":{i:`1469854523086-cc02fe5d8800`,q:`Sierra Leone is waiting for you.`,f:`Did you know that Sierra Leone has a population of about 7.7 million people? Its capital city is Freetown.`},Singapore:{i:`1469854523086-cc02fe5d8800`,q:`Singapore is waiting for you.`,f:`Did you know that Singapore has a population of about 5.6 million people? Its capital city is Singapore.`},Slovakia:{i:`1469854523086-cc02fe5d8800`,q:`Slovakia is waiting for you.`,f:`Did you know that Slovakia has a population of about 5.4 million people? Its capital city is Bratislava.`},Slovenia:{i:`1469854523086-cc02fe5d8800`,q:`Slovenia is waiting for you.`,f:`Did you know that Slovenia has a population of about 2.1 million people? Its capital city is Ljubljana.`},"Solomon Islands":{i:`1469854523086-cc02fe5d8800`,q:`Solomon Islands is waiting for you.`,f:`Did you know that Solomon Islands has a population of about 653 thousand people? Its capital city is Honiara.`},Somalia:{i:`1469854523086-cc02fe5d8800`,q:`Somalia is waiting for you.`,f:`Did you know that Somalia has a population of about 15 million people? Its capital city is Mogadishu.`},"South Africa":{i:`1469854523086-cc02fe5d8800`,q:`South Africa is waiting for you.`,f:`Did you know that South Africa has a population of about 58 million people? Its capital city is Pretoria.`},"South Carolina":{i:`1470071131384-001b85755536`,q:`The Palmetto State.`,f:`Did you know that the South Carolina State has a population of about 5 million people? Its biggest city is Charleston.`},"South Dakota":{i:`1465146344425-f00d5f5c8f07`,q:`Mount Rushmore State.`,f:`Did you know that the South Dakota State has a population of about 887 thousand people? Its biggest city is Sioux Falls.`},"South Sudan":{i:`1469854523086-cc02fe5d8800`,q:`South Sudan is waiting for you.`,f:`Did you know that South Sudan has a population of about 11 million people? Its capital city is Juba.`},Spain:{i:`1506665531191-c414908a8a4a`,q:`Passion and sun.`,f:`Did you know that Spain has a population of about 47 million people? Its capital city is Madrid.`},"Sri Lanka":{i:`1469854523086-cc02fe5d8800`,q:`Sri Lanka is waiting for you.`,f:`Did you know that Sri Lanka has a population of about 22 million people? Its capital city is Colombo, Sri Jayawardenepura Kotte.`},Sudan:{i:`1469854523086-cc02fe5d8800`,q:`Sudan is waiting for you.`,f:`Did you know that Sudan has a population of about 42 million people? Its capital city is Khartum.`},Suriname:{i:`1469854523086-cc02fe5d8800`,q:`Suriname is waiting for you.`,f:`Did you know that Suriname has a population of about 576 thousand people? Its capital city is Paramaribo.`},Sweden:{i:`1469854523086-cc02fe5d8800`,q:`Sweden is waiting for you.`,f:`Did you know that Sweden has a population of about 10 million people? Its capital city is Stockholm.`},Switzerland:{i:`1516584222044-1803503a7d48`,q:`Mountain majesty.`,f:`Did you know that Switzerland has a population of about 8.5 million people? Its capital city is Bern.`},Syria:{i:`1469854523086-cc02fe5d8800`,q:`Syria is waiting for you.`,f:`Did you know that Syria has a population of about 17 million people? Its capital city is Damascus.`},Taiwan:{i:`1469854523086-cc02fe5d8800`,q:`Taiwan is waiting for you.`,f:`Did you know? Taiwan is full of hidden gems waiting to be explored.`},Tajikistan:{i:`1469854523086-cc02fe5d8800`,q:`Tajikistan is waiting for you.`,f:`Did you know that Tajikistan has a population of about 9.1 million people? Its capital city is Dushanbe.`},Tanzania:{i:`1469854523086-cc02fe5d8800`,q:`Tanzania is waiting for you.`,f:`Did you know that Tanzania has a population of about 56 million people? Its capital city is Dodoma.`},Tennessee:{i:`1433086966358-54859d0ed716`,q:`The Volunteer State.`,f:`Did you know that the Tennessee State has a population of about 7 million people? Its biggest city is Nashville.`},Texas:{i:`1473448912268-2022ce9509d8`,q:`The Lone Star State.`,f:`Did you know that the Texas State has a population of about 29 million people? Its biggest city is Houston.`},Thailand:{i:`1528127269394-b7d91e0a2736`,q:`Land of smiles.`,f:`Did you know that Thailand has a population of about 69 million people? Its capital city is Bangkok.`},"Timor-Leste":{i:`1469854523086-cc02fe5d8800`,q:`Timor-Leste is waiting for you.`,f:`Did you know? Timor-Leste is full of hidden gems waiting to be explored.`},Togo:{i:`1469854523086-cc02fe5d8800`,q:`Togo is waiting for you.`,f:`Did you know that Togo has a population of about 7.9 million people? Its capital city is Lomé.`},Tonga:{i:`1469854523086-cc02fe5d8800`,q:`Tonga is waiting for you.`,f:`Did you know that Tonga has a population of about 103 thousand people? Its capital city is Nuku'alofa.`},"Trinidad And Tobago":{i:`1469854523086-cc02fe5d8800`,q:`Trinidad And Tobago is waiting for you.`,f:`Did you know that Trinidad and Tobago has a population of about 1.4 million people? Its capital city is Port-of-Spain.`},Tunisia:{i:`1469854523086-cc02fe5d8800`,q:`Tunisia is waiting for you.`,f:`Did you know that Tunisia has a population of about 12 million people? Its capital city is Tunis.`},Turkey:{i:`1524231754455-da7484439366`,q:`East meets West.`,f:`Did you know that Turkey has a population of about 82 million people? Its capital city is Ankara.`},Turkmenistan:{i:`1469854523086-cc02fe5d8800`,q:`Turkmenistan is waiting for you.`,f:`Did you know that Turkmenistan has a population of about 5.9 million people? Its capital city is Ashgabat.`},Tuvalu:{i:`1469854523086-cc02fe5d8800`,q:`Tuvalu is waiting for you.`,f:`Did you know that Tuvalu has a population of about 12 thousand people? Its capital city is Funafuti.`},UK:{i:`1486325212042-2e47fa4c13a0`,q:`British heritage.`,f:`Did you know that UK has a population of about 66 million people? Its capital city is London.`},Uae:{i:`1469854523086-cc02fe5d8800`,q:`Uae is waiting for you.`,f:`Did you know that UAE has a population of about 9.6 million people? Its capital city is Abu Dhabi.`},Uganda:{i:`1469854523086-cc02fe5d8800`,q:`Uganda is waiting for you.`,f:`Did you know that Uganda has a population of about 43 million people? Its capital city is Kampala.`},Uk:{i:`1469854523086-cc02fe5d8800`,q:`Uk is waiting for you.`,f:`Did you know that UK has a population of about 66 million people? Its capital city is London.`},Ukraine:{i:`1469854523086-cc02fe5d8800`,q:`Ukraine is waiting for you.`,f:`Did you know that Ukraine has a population of about 45 million people? Its capital city is Kyiv.`},"United Arab Emirates (UAE)":{i:`1512453973954-47efef380d6d`,q:`Future in the sand.`,f:`Did you know? United Arab Emirates (UAE) is full of hidden gems waiting to be explored.`},Uruguay:{i:`1469854523086-cc02fe5d8800`,q:`Uruguay is waiting for you.`,f:`Did you know that Uruguay has a population of about 3.4 million people? Its capital city is Montevideo.`},Usa:{i:`1469854523086-cc02fe5d8800`,q:`Usa is waiting for you.`,f:`Did you know that USA has a population of about 327 million people? Its capital city is Washington.`},Utah:{i:`1447752875215-b2761acb3c5d`,q:`Life Elevated.`,f:`Did you know that the Utah State has a population of about 3 million people? Its biggest city is Salt Lake City.`},Uzbekistan:{i:`1469854523086-cc02fe5d8800`,q:`Uzbekistan is waiting for you.`,f:`Did you know that Uzbekistan has a population of about 33 million people? Its capital city is Toskent.`},Vanuatu:{i:`1469854523086-cc02fe5d8800`,q:`Vanuatu is waiting for you.`,f:`Did you know that Vanuatu has a population of about 293 thousand people? Its capital city is Port-Vila.`},"Vatican City":{i:`1469854523086-cc02fe5d8800`,q:`Vatican City is waiting for you.`,f:`Did you know? Vatican City is full of hidden gems waiting to be explored.`},Venezuela:{i:`1469854523086-cc02fe5d8800`,q:`Venezuela is waiting for you.`,f:`Did you know that Venezuela has a population of about 29 million people? Its capital city is Caracas.`},Vermont:{i:`1464822759023-fed622ff2c3b`,q:`The Green Mountain State.`,f:`Did you know that the Vermont State has a population of about 643 thousand people? Its biggest city is Burlington.`},Vietnam:{i:`1528127269394-b7d91e0a2736`,q:`Timeless charm.`,f:`Did you know that Vietnam has a population of about 96 million people? Its capital city is Hanoi.`},Virginia:{i:`1507525428034-b723cf961d3e`,q:`Virginia is for Lovers.`,f:`Did you know that the Virginia State has a population of about 9 million people? Its biggest city is Virginia Beach.`},Washington:{i:`1476610971033-5c8523b7a2d6`,q:`The Evergreen State.`,f:`Did you know that the Washington State has a population of about 8 million people? Its biggest city is Seattle.`},"West Virginia":{i:`1449844908441-8829872d2607`,q:`Mountain Mama.`,f:`Did you know that the West Virginia State has a population of about 2 million people? Its biggest city is Charleston.`},Wisconsin:{i:`1469474968028-56623f02e42e`,q:`America's Dairyland.`,f:`Did you know that the Wisconsin State has a population of about 6 million people? Its biggest city is Milwaukee.`},Wyoming:{i:`1472214103451-9374bd1c798e`,q:`The Equality State.`,f:`Did you know that the Wyoming State has a population of about 577 thousand people? Its biggest city is Cheyenne.`},Yemen:{i:`1469854523086-cc02fe5d8800`,q:`Yemen is waiting for you.`,f:`Did you know that Yemen has a population of about 28 million people? Its capital city is Sanaa.`},Zambia:{i:`1469854523086-cc02fe5d8800`,q:`Zambia is waiting for you.`,f:`Did you know that Zambia has a population of about 17 million people? Its capital city is Lusaka.`},Zimbabwe:{i:`1469854523086-cc02fe5d8800`,q:`Zimbabwe is waiting for you.`,f:`Did you know that Zimbabwe has a population of about 14 million people? Its capital city is Harare.`}},d=`Alabama.Alaska.Arizona.Arkansas.California.Colorado.Connecticut.Delaware.Florida.Georgia.Hawaii.Idaho.Illinois.Indiana.Iowa.Kansas.Kentucky.Louisiana.Maine.Maryland.Massachusetts.Michigan.Minnesota.Mississippi.Missouri.Montana.Nebraska.Nevada.New Hampshire.New Jersey.New Mexico.New York.North Carolina.North Dakota.Ohio.Oklahoma.Oregon.Pennsylvania.Rhode Island.South Carolina.South Dakota.Tennessee.Texas.Utah.Vermont.Virginia.Washington.West Virginia.Wisconsin.Wyoming`.split(`.`).sort();function f(e){if(!e)return{quotes:[c.q],images:[`https://images.unsplash.com/photo-${c.i}?auto=format&fit=crop&w=1600&q=80`],facts:[c.f]};let t=null,n=e.country||``;if(n.includes(` - `)){let e=n.split(` - `)[1];u[e]&&(t=u[e])}else u[n]?t=u[n]:n===`United States (USA)`&&(t=u.Usa||u[`United States`]);return t||={q:`${n} is waiting for you.`,i:`1501854140801-50d01698950b`,f:`Did you know? ${n} is full of hidden gems waiting to be explored.`},{quotes:[t.q],images:[`https://images.unsplash.com/photo-${t.i}?auto=format&fit=crop&w=1600&q=80`],facts:[t.f]}}function p(e){let t=document.createElement(`div`);t.className=`liquid-alert`,t.style.position=`fixed`,t.style.bottom=`40px`,t.style.left=`50%`,t.style.transform=`translateX(-50%) translateY(100px)`,t.style.background=`rgba(255,255,255,0.7)`,t.style.backdropFilter=`blur(20px)`,t.style.padding=`16px 32px`,t.style.borderRadius=`980px`,t.style.border=`1px solid rgba(255,255,255,0.4)`,t.style.boxShadow=`0 20px 40px rgba(0,0,0,0.1)`,t.style.color=`#002d5b`,t.style.fontWeight=`700`,t.style.zIndex=`99999`,t.style.transition=`all 0.5s cubic-bezier(0.16, 1, 0.3, 1)`,t.innerHTML=`<span>⚠️ ${e}</span>`,document.body.appendChild(t),setTimeout(()=>{t.style.transform=`translateX(-50%) translateY(0)`},10),setTimeout(()=>{t.style.transform=`translateX(-50%) translateY(100px)`,t.style.opacity=`0`,setTimeout(()=>t.remove(),500)},3e3)}function m(e={}){let{title:t=`Are you sure?`,message:n=`This action cannot be undone.`,confirmText:r=`Delete`,confirmColor:i=`#ff3b30`,requireInput:a=!1,onConfirm:o=()=>{}}=e,s=document.createElement(`div`);s.className=`modal-overlay`,s.style.display=`flex`,s.style.backdropFilter=`blur(25px)`,s.innerHTML=`
        <div class="card glass" style="width: 420px; height: 420px; padding: 40px; border-radius: 44px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.05); box-shadow: 0 40px 100px rgba(0,0,0,0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; box-sizing: border-box; overflow: hidden;">
            <div style="text-align: center;">
                <h2 style="margin: 0; font-size: 2.2rem; letter-spacing: -0.06em; color: #ffffff;">${t}</h2>
                <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 1rem; font-weight: 500;">${n}</p>
            </div>
            
            ${a?`
                <div style="width: 100%; margin-bottom: 8px;">
                    <p style="font-size: 0.75rem; color: #ff3b30; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.1em; text-align: center;">Type "${a}" to confirm</p>
                    <input type="text" id="safetyInput" class="glass-input" placeholder="Type here..." style="width: 100%; text-align: center; background: rgba(255,255,255,0.08); padding: 18px; border-radius: 20px; font-size: 1.1rem; color: #ffffff; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;">
                </div>
            `:``}

            <div style="width: 100%; display: flex; flex-direction: column; gap: 10px;">
                <button class="btn" id="modalConfirmBtn" style="width: 100%; background: ${i}; color: #ffffff; padding: 18px; font-weight: 800; border-radius: 20px; box-shadow: 0 10px 30px ${i}66; font-size: 1.1rem; box-sizing: border-box; transition: all 0.3s; ${a?`opacity: 0.3; cursor: not-allowed;`:``}" ${a?`disabled`:``}>${r}</button>
                <button class="btn" id="modalCancelBtn" style="width: 100%; padding: 8px; font-weight: 600; background: transparent; border: none; color: rgba(255,255,255,0.4); font-size: 0.9rem;">Cancel</button>
            </div>
        </div>
    `,document.body.appendChild(s);let c=s.querySelector(`#modalConfirmBtn`),l=s.querySelector(`#modalCancelBtn`),u=s.querySelector(`#safetyInput`);a&&u&&(u.focus(),u.oninput=e=>{let t=e.target.value.trim().toUpperCase()===a.toUpperCase();c.disabled=!t,t?(c.style.opacity=`1`,c.style.cursor=`pointer`,c.style.boxShadow=`0 15px 35px rgba(255, 59, 48, 0.4)`):(c.style.opacity=`0.3`,c.style.cursor=`not-allowed`,c.style.boxShadow=`0 10px 30px ${i}66`)}),c.onclick=()=>{o(),s.remove()},l.onclick=()=>s.remove(),s.onclick=e=>{e.target===s&&s.remove()}}function h(){return Math.random().toString(36).substr(2,9)}function g(e){if(!e)return``;let t=new Date(e+`T00:00:00Z`),n=new Date,r=t.toLocaleDateString(`en-US`,{month:`short`,day:`numeric`,timeZone:`UTC`});return t.getUTCFullYear()!==n.getFullYear()&&(r+=` - ${t.getUTCFullYear()}`),r}var _={},v=null,y=null,b=null;function x(){let t=document.createElement(`div`),n=e.trips&&e.activeTripId?e.trips.find(t=>t.id===e.activeTripId):null,r=0,i=[],o=[];if(n){let e=f(n),t=localStorage.getItem(`home_media_toggle`)!==`fact`;localStorage.setItem(`home_media_toggle`,t?`fact`:`quote`),i=[e.images[0]],o=[t?e.quotes[0]:e.facts[0]]}else{i=s.map(e=>e.i),o=s.map(e=>e.q);let e=Array.from({length:i.length},(e,t)=>t);e.sort(()=>Math.random()-.5),i=e.map(e=>i[e]),o=e.map(e=>o[e])}let c=()=>{if(i.length<=1)return;r=(r+1)%i.length;let e=t.querySelector(`#homeHeroImg`),n=t.querySelector(`#homeQuote`);e&&(e.style.opacity=`0`,setTimeout(()=>{e.src=i[r],e.style.opacity=`1`},800)),n&&(n.style.opacity=`0`,setTimeout(()=>{n.innerText=o[r%o.length]||``,n.style.opacity=`1`},800))};if(!n)t.innerHTML=`
            <div class="ai-page-header" style="padding: 40px; text-align: center; border-radius: 28px;">
                <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; font-size: 3.5rem;">Let's travel.</h1>
                <p style="color: var(--text-secondary); max-width: 440px; margin: 10px auto 0; font-size: 1.1rem;">Your next big adventure is waiting. Create a trip to start tracking expenses and planning days.</p>
            </div>
            
            <div class="card glass" style="padding: 0; overflow: hidden; height: 450px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
                <img id="homeHeroImg" src="${i[0]||``}" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%);"></div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; display: flex; align-items: flex-end; justify-content: space-between;">
                    <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out; max-width: 60%;">
                        ${o[0]||``}
                    </p>
                    <button class="btn" style="background: var(--accent-blue); padding: 12px 24px; border-radius: 100px; box-shadow: 0 10px 20px rgba(0,113,227,0.3); font-weight: 700; font-size: 0.95rem;" onclick="window.openNewTripModal()">Create First Trip</button>
                </div>
            </div>
        `,setInterval(c,6e3);else{let r=(e.expenses||[]).filter(e=>e&&e.tripId===n.id),i=(e.tripDays||[]).filter(e=>e.tripId===n.id),s=r.length===0&&i.length===0,c=`Welcome back, traveler`;if(s&&n.country){let t=n.country.includes(` - `)?n.country.split(` - `)[1]:n.country,r=[`Welcome back, ${e.user&&e.user.firstName?e.user.firstName:`traveler`}!`,`Ready for your ${n.name} adventure?`,`Your ${t} adventure starts here.`,`Time to write your ${t} story.`];c=r[Math.floor(Math.random()*r.length)]}t.innerHTML=`
            <div class="ai-page-header" style="text-align: center;">
                <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${c}</h1>
                ${n?`<p>You have <strong>${r.length}</strong> expenses recorded for ${n.name}.</p>`:`<p>Welcome! Start by creating your first trip.</p>`}
            </div>
            
            <div class="card glass" style="padding: 0; overflow: hidden; height: 400px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
                <div id="homeHeroMap" style="width: 100%; height: 100%; position: absolute; inset: 0; z-index: 0;"></div>
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); pointer-events: none; z-index: 1;"></div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; pointer-events: none; z-index: 2;">
                    <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out;">
                        ${o[0]||``}
                    </p>
                </div>
            </div>
        `,setTimeout(()=>{let t=document.getElementById(`homeHeroMap`);if(t&&typeof google<`u`&&google.maps&&n){let r=n.country||``,i=r.includes(` - `)?r.split(` - `)[1]+`, USA`:r,o=n?n.id:null,s=o&&e.mapViews&&e.mapViews[o],c={center:s?{lat:s.lat,lng:s.lng}:{lat:20,lng:0},zoom:s?s.zoom:2,minZoom:2,mapTypeId:`hybrid`,disableDefaultUI:!0,gestureHandling:`greedy`,backgroundColor:`#ffffff`,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]},l=new google.maps.Map(t,c);window.activeMap=l,window.uploadMedia=async e=>{let t=new FormData;t.append(`file`,e);try{return await(await fetch(`/api/upload`,{method:`POST`,body:t})).json()}catch(e){return console.error(`Upload failed`,e),null}};let u=n?(e.tripDays||[]).filter(e=>e.tripId===n.id):[];_={},u.forEach(e=>{if(e.lat&&(e.lon||e.lng)){let t=e.lon||e.lng,n=v===e.id,r=new google.maps.Marker({position:{lat:e.lat,lng:t},map:l,draggable:n,title:`Day ${e.dayNumber}: ${e.name}`,label:{text:String(e.dayNumber),color:`white`,fontWeight:`800`,fontSize:n?`14px`:`12px`},icon:{path:google.maps.SymbolPath.CIRCLE,fillOpacity:1,fillColor:n?`#ff3b30`:`#007aff`,strokeColor:`white`,strokeWeight:2,scale:n?18:14}});_[e.id]=r,n?r.addListener(`dragend`,()=>{let t=r.getPosition();e.lat=t.lat(),e.lon=t.lng(),e.lng=t.lng()}):r.addListener(`click`,()=>{l.panTo(r.getPosition()),l.setZoom(12)})}}),y&&(l.addListener(`click`,e=>y({latlng:{lat:e.latLng.lat(),lng:e.latLng.lng()}})),t.style.cursor=`crosshair`),window.toggleDayMenu=e=>{b=b===e?null:e,R(`home`,null,!0)},window.addDayPin=t=>{let n=e.tripDays.find(e=>e.id===t);n&&(v=t,window.showToast?.(`Click on the map to set the location for this day!`),y=e=>{n.lat=e.latlng.lat,n.lon=e.latlng.lng,n.lng=e.latlng.lng,y=null,R(`home`,null,!0)},R(`home`,null,!0))},window.editDayPin=e=>{v=e,R(`home`,null,!0)},window.saveDayPin=async t=>{let n=e.tripDays.find(e=>e.id===t);n&&(v=null,y=null,a(`state:changed`),await Y(n),window.showToast?.(`Location saved!`),R(`home`,null,!0))},window.deleteDayPin=async t=>{let n=e.tripDays.find(e=>e.id===t);n&&(n.lat=null,n.lon=null,n.lng=null,v=null,y=null,a(`state:changed`),await Y(n),R(`home`,null,!0))},l.addListener(`idle`,()=>{e.mapViews||={};let t=l.getCenter();e.mapViews[o]={lat:t.lat(),lng:t.lng(),zoom:l.getZoom()},a(`state:changed`)});let d=i.trim();console.log(`Map Init: Target ->`,d),new google.maps.Geocoder().geocode({address:d},(e,t)=>{if(t===`OK`&&e[0]){let t=e[0].geometry.viewport;google.maps.event.addListenerOnce(l,`tilesloaded`,()=>{l.fitBounds(t)})}});let f=`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(d)}&format=json&limit=1&polygon_geojson=1`;fetch(f,{headers:{"User-Agent":`TheGreatGetaway/1.2`}}).then(e=>e.json()).then(e=>{if(e&&e[0]&&e[0].geojson){let t={type:`Feature`,geometry:e[0].geojson,properties:{name:d}};l.data.forEach(e=>l.data.remove(e)),l.data.addGeoJson(t),l.data.setStyle({fillColor:`transparent`,fillOpacity:0,strokeColor:`#007aff`,strokeWeight:2.2,strokeOpacity:.9,visible:!0,clickable:!1}),console.log(`Border successfully applied for:`,d)}else console.warn(`Nominatim: Geometry not found for`,d)}).catch(e=>console.error(`Border fetch failed:`,e)),fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(d)}&format=json&limit=1`).then(e=>e.json()).then(e=>{if(e&&e[0]){let t=e[0],n=t.osm_type===`relation`?36e8+parseInt(t.osm_id):t.osm_type===`way`?24e8+parseInt(t.osm_id):null;if(n){let e=`[out:json][timeout:15];area(${n})->.searchArea;node["place"~"city|town"](area.searchArea);out center;`;fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(e)}`).then(e=>e.json()).then(e=>{e&&e.elements&&e.elements.sort((e,t)=>{let n=parseInt(e.tags&&e.tags.population||0);return parseInt(t.tags&&t.tags.population||0)-n}).slice(0,15).forEach(e=>{e.lat&&e.lon&&e.tags&&e.tags.name&&new google.maps.Marker({position:{lat:e.lat,lng:e.lon},map:l,icon:{path:google.maps.SymbolPath.CIRCLE,scale:0},label:{text:e.tags[`name:en`]||e.tags.name,color:`white`,fontSize:`11px`,fontWeight:`700`,className:`map-city-label`}})})})}}})}},100)}let l=n?(e.expenses||[]).filter(e=>e&&e.tripId===n.id):[],u=n?(e.tripDays||[]).filter(e=>e.tripId===n.id):[],d=document.createElement(`div`);d.style.marginTop=`40px`,e.guideProgress||={};let p=!!e.user||window.isGoogleAuthenticated===!0,m=e.trips.length>0,h=(e.groups||[]).length>0,x=u.length>0,S=l.length>0,C=e.budgets&&e.budgets.length>0,w=e.archivedTrips&&e.archivedTrips.length>0,T=(e.categories||[]).length>3,E=e.expenses.some(e=>e.isSettlement);p&&(e.guideProgress.login=!0),m&&(e.guideProgress.trip=!0),h&&(e.guideProgress.companions=!0),x&&(e.guideProgress.plan=!0),S&&(e.guideProgress.expenses=!0),C&&(e.guideProgress.budgets=!0),w&&(e.guideProgress.collections=!0),T&&(e.guideProgress.categories=!0),E&&(e.guideProgress.settlement=!0);let D=[{text:`Log in to your account`,done:e.guideProgress.login,icon:`🔐`,action:()=>R(`profile`)},{text:`Create your first trip`,done:e.guideProgress.trip,icon:`✈️`,action:()=>window.openNewTripModal()},{text:`Add your travel companions`,done:e.guideProgress.companions,icon:`👥`,action:()=>window.showPersonalizationTab(`companions`)},{text:`Set your own categories`,done:e.guideProgress.categories,icon:`🏷️`,action:()=>window.showPersonalizationTab(`categories`)},{text:`Generate your AI travel plan<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(or <span onclick="event.stopPropagation(); if(STATE.activeTripId){ window.openAddDayModal(STATE.activeTripId); } else { window.showLiquidAlert('Create a trip first'); }" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">create it manually</span>)</span>`,done:e.guideProgress.plan,icon:`✦`,action:()=>R(`ai`)},{text:`Input your expenses<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(<span onclick="event.stopPropagation(); window.navigate('expenses')" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">Manually</span> or <span onclick="event.stopPropagation(); window.navigate('upload')" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">in a batch</span>)</span>`,done:e.guideProgress.expenses,icon:`💰`,action:()=>R(`expenses`)},{text:`Explore Budgets`,done:e.guideProgress.budgets,icon:`📊`,action:()=>R(`budgets`)},{text:`Settle your first expenses`,done:e.guideProgress.settlement,icon:`🤝`,action:()=>R(`settlement`)},{text:`Discover Collections`,done:e.guideProgress.collections,icon:`📂`,action:()=>R(`collections`)},{text:`Connect with your friends`,done:e.guideProgress.friends,icon:`📱`,action:()=>R(`friends`)}],O=D.every(e=>e.done)||e.guideAllDone;O&&!e.guideAllDone&&(e.guideAllDone=!0,a(`state:changed`));let k=document.createElement(`div`);if(k.style.marginTop=`40px`,u.sort((e,t)=>e.dayNumber-t.dayNumber),k.innerHTML=`
        <div style="display: flex; flex-direction: column; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <h2 style="font-size: 1.8rem; letter-spacing: -0.03em; margin: 0; font-weight: 800; color: #002d5b;">Your Journey</h2>
            </div>
            <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 6px 0 0; font-weight: 500;">${u.length} Day${u.length===1?``:`s`} of adventure</p>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 32px; position: relative; padding-left: 20px;">
            <!-- Subtle Timeline Line -->
            <div style="position: absolute; left: 10px; top: 10px; bottom: 10px; width: 2px; background: linear-gradient(180deg, var(--accent-blue) 0%, rgba(0,113,227,0.05) 100%); border-radius: 1px; opacity: 0.3;"></div>

            ${u.map(e=>{let t=b===e.id;return`
                <div style="display: flex; align-items: flex-start; gap: 24px; position: relative;">
                    <!-- Timeline Dot -->
                    <div style="position: absolute; left: -14px; top: 22px; width: 10px; height: 10px; border-radius: 50%; background: ${t?`var(--accent-blue)`:`white`}; border: 2px solid var(--accent-blue); z-index: 2; box-shadow: 0 0 0 4px white;"></div>
                    
                    <!-- LEFT SPACE MENU -->
                    <div style="width: 200px; min-width: 200px; opacity: ${+!!t}; transform: translateX(${t?`0`:`-20px`}); transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: ${t?`auto`:`none`}; display: flex; flex-direction: column; gap: 8px; padding-top: 4px;">
                        <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-blue); margin-bottom: 4px; padding-left: 12px;">Actions</div>
                        
                        ${v===e.id?`
                            <div style="display: flex; gap: 4px;">
                                <button onclick="event.stopPropagation(); window.saveDayPin('${e.id}')" style="flex: 2; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 12px; border: none; background: #34c759; color: white; font-size: 0.85rem; font-weight: 700; cursor: pointer;">Save Pin</button>
                                <button onclick="event.stopPropagation(); window.deleteDayPin('${e.id}')" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 12px; border: none; background: rgba(255,59,48,0.1); color: #ff3b30; font-size: 0.85rem; font-weight: 700; cursor: pointer;">X</button>
                            </div>
                        `:`
                            <button onclick="event.stopPropagation(); ${e.lat?`window.editDayPin('${e.id}')`:`window.addDayPin('${e.id}')`}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,113,227,0.06); color: var(--accent-blue); font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.12)';" onmouseout="this.style.background='rgba(0,113,227,0.06)';">
                                <span>${e.lat?`📍 Edit Pin Location`:`📍 Add Pin to Map`}</span>
                            </button>
                        `}
                        
                        <button onclick="event.stopPropagation(); window.openJournalingModal('${e.id}')" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>✍️ Journaling</span>
                        </button>
                        
                        <button onclick="event.stopPropagation(); window.openPhotosModal('${e.id}')" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>📸 Add Photos</span>
                        </button>
                        
                        <button onclick="event.stopPropagation(); window.openDocumentsModal('${e.id}')" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>📄 Documents</span>
                        </button>
                    </div>

                    <!-- MAIN CARD -->
                    <div class="day-card card glass" 
                         style="flex: 1; padding: 20px 28px; border-radius: 28px; border: 1.5px solid ${t?`var(--accent-blue)`:`rgba(0,0,0,0.05)`}; background: ${t?`rgba(255,255,255,0.95)`:`white`}; cursor: pointer; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: ${t?`0 20px 40px rgba(0,0,0,0.1)`:`none`};" 
                         onclick="event.stopPropagation(); window.toggleDayMenu('${e.id}')"
                         onmouseover="${t?``:`this.style.transform='translateX(8px)'; this.style.borderColor='rgba(0,113,227,0.2)';`}"
                         onmouseout="${t?``:`this.style.transform='none'; this.style.borderColor='rgba(0,0,0,0.05)';`}">
                        
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 20px;">
                                <div style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; width: 54px; height: 54px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; box-shadow: 0 10px 20px rgba(0,113,227,0.15);">
                                    <span style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; opacity: 0.8; letter-spacing: 0.05em; line-height: 1;">Day</span>
                                    <span style="font-size: 1.4rem; font-weight: 800; line-height: 1.1;">${e.dayNumber}</span>
                                </div>
                                <div style="display: flex; flex-direction: column;">
                                    <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">${e.name}</h3>
                                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                                        <span>📅 ${g(e.date)||`Set date`}</span>
                                        ${e.lat?`<span style="color: var(--accent-blue); opacity: 0.6;">•</span> <span style="color: var(--accent-blue);">📍 Location Set</span>`:``}
                                    </div>
                                </div>
                            </div>
                            
                            <div style="display: flex; align-items: center; gap: 16px;">
                                ${t?`
                                    <button onclick="event.stopPropagation(); window.openDayDetail('${e.id}')" class="btn btn-liquid-glass" style="padding: 8px 16px; font-size: 0.8rem; font-weight: 700; background: var(--accent-blue); color: white; border: none; border-radius: 10px;">Open Full Plan</button>
                                `:`
                                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: center; color: #002d5b; transition: all 0.3s;">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </div>
                                `}
                            </div>
                        </div>

                        ${t&&e.notes?`
                            <div style="margin-top: 20px; padding: 16px; background: rgba(0,0,0,0.02); border-radius: 16px; border-left: 4px solid var(--accent-blue);">
                                <div style="font-size: 0.75rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue); margin-bottom: 8px;">Journaling Preview</div>
                                <p style="margin: 0; font-size: 0.95rem; line-height: 1.5; color: #002d5b; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${e.notes}</p>
                            </div>
                        `:``}
                    </div>
                </div>
            `}).join(``)}
            
            <!-- ADD DAY BUTTON (Vertical Timeline Style) -->
            <div id="addDayBtn" style="margin-top: 8px; display: flex; align-items: center; gap: 24px; cursor: pointer; group" onmouseover="this.querySelector('.add-dot').style.transform='scale(1.3)'; this.querySelector('.add-text').style.color='var(--accent-blue)';" onmouseout="this.querySelector('.add-dot').style.transform='none'; this.querySelector('.add-text').style.color='var(--text-secondary)';">
                <div class="add-dot" style="width: 14px; height: 14px; border-radius: 50%; border: 2px dashed var(--accent-blue); background: transparent; transition: all 0.3s; margin-left: -2px;"></div>
                <div class="add-text" style="font-weight: 700; color: var(--text-secondary); font-size: 1rem; transition: all 0.3s; letter-spacing: -0.01em;">+ Add a new day to your journey</div>
            </div>
        </div>
    `,n&&(t.appendChild(k),setTimeout(()=>{let e=t.querySelector(`#addDayBtn`);e&&(e.onclick=()=>window.openAddDayModal(n.id))},0)),e.hideQuickAccess===!0){let n=document.createElement(`div`);n.style.textAlign=`center`,n.style.marginTop=`40px`,n.innerHTML=`
            <button class="btn btn-liquid-glass" style="padding: 10px 24px; border-radius: 980px; font-size: 0.85rem; font-weight: 700; color: #002d5b; border: 1px solid rgba(0,0,0,0.05); background: rgba(255,255,255,0.4);" onmouseover="this.style.background='rgba(255,255,255,0.7)';" onmouseout="this.style.background='rgba(255,255,255,0.4)';">
                🧭 Show Quick Access
            </button>
        `,n.querySelector(`button`).onclick=()=>{e.hideQuickAccess=!1,a(`state:changed`),R(`home`)},t.appendChild(n)}else d.innerHTML=`
            <div class="card glass" style="padding: 32px; border-radius: 28px; border: 1.5px solid ${O?`rgba(0,0,0,0.05)`:`rgba(0, 122, 255, 0.15)`}; background: ${O?`rgba(255,255,255,0.4)`:`linear-gradient(165deg, rgba(255,255,255,0.9), rgba(240,247,255,0.8))`}; position: relative;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: ${O?`#000000`:`var(--accent-blue)`}; color: white; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">${O?`⚡️`:`🧭`}</div>
                        <h2 style="margin: 0; font-size: 1.5rem; letter-spacing: -0.02em; color: #002d5b;">${O?`Quick Access`:`Getting Started Guide`}</h2>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${O?`<span style="font-size: 0.75rem; font-weight: 800; color: rgba(0,45,91,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Toolbar</span>`:``}
                        <button id="hideQuickAccessBtn" style="background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.05); padding: 6px 14px; border-radius: 980px; color: rgba(0,0,0,0.5); cursor: pointer; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.1)'; this.style.color='#ff3b30'; this.style.borderColor='rgba(255,59,48,0.2)';" onmouseout="this.style.background='rgba(0,0,0,0.05)'; this.style.color='rgba(0,0,0,0.5)'; this.style.borderColor='rgba(0,0,0,0.05)';">Hide</button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    ${D.map((e,t)=>{let n=!O&&e.done;return`
                        <div class="guide-step-card" data-index="${t}" style="display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: ${n?`rgba(52, 199, 89, 0.08)`:`white`}; border-radius: 20px; border: 1px solid ${n?`rgba(52, 199, 89, 0.2)`:`rgba(0,0,0,0.05)`}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 24px rgba(0,0,0,0.08)';" onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                            ${O?`
                            <div style="font-size: 1.4rem; flex-shrink: 0; line-height: 1;">${e.icon}</div>
                            `:`
                            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${n?`#34c759`:`rgba(0,45,91,0.1)`}; display: flex; align-items: center; justify-content: center; color: ${n?`#34c759`:`rgba(0,0,0,0.4)`}; font-weight: 800; font-size: 0.8rem; background: ${n?`white`:`rgba(0,0,0,0.02)`}; flex-shrink: 0;">
                                ${n?`✓`:e.icon}
                            </div>
                            `}
                            <div style="display: flex; flex-direction: column;">
                                ${O?``:`<div style="font-size: 0.75rem; font-weight: 800; color: ${n?`#34c759`:`rgba(0,45,91,0.4)`}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Step ${t+1}</div>`}
                                <div style="font-size: 1rem; font-weight: 700; color: ${n?`rgba(0,45,91,0.6)`:`#002d5b`}; text-decoration: ${n?`line-through`:`none`};">
                                    ${e.text}
                                </div>
                            </div>
                        </div>
                    `}).join(``)}
                </div>
            </div>
        `,setTimeout(()=>{d.querySelectorAll(`.guide-step-card`).forEach(e=>{e.onclick=()=>{let t=e.dataset.index;D[t].action&&D[t].action()}});let t=d.querySelector(`#hideQuickAccessBtn`);t&&(t.onclick=t=>{t.stopPropagation(),e.hideQuickAccess=!0,a(`state:changed`),R(`home`)})},0),t.appendChild(d);return t}window.openJournalingModal=t=>{let n=e.tripDays.find(e=>e.id===t);if(!n)return;let r=document.createElement(`div`);r.className=`modal-overlay`,r.style.display=`flex`,r.style.backdropFilter=`blur(25px)`,r.innerHTML=`
        <div class="card glass" style="width: 580px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.9); box-shadow: 0 40px 100px rgba(0,0,0,0.2);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800; letter-spacing: -0.04em;">Day ${n.dayNumber} Journaling</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Capture your memories and stories from ${n.name}</p>
            <textarea id="journalText" class="glass-input" style="width: 100%; height: 240px; padding: 20px; border-radius: 20px; font-size: 1.05rem; line-height: 1.6; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.05);" placeholder="What happened today? How did you feel?">${n.notes||``}</textarea>
            <div style="display: flex; gap: 12px;">
                <button id="saveJournalBtn" class="btn" style="flex: 2; padding: 16px; border-radius: 16px; background: var(--accent-blue); color: white; font-weight: 800; font-size: 1rem; border: none;">Save Story</button>
                <button id="closeJournalBtn" class="btn" style="flex: 1; padding: 16px; border-radius: 16px; background: rgba(0,0,0,0.05); color: #002d5b; font-weight: 700; border: none; font-size: 0.9rem;">Close</button>
            </div>
        </div>
    `,document.body.appendChild(r),r.querySelector(`#closeJournalBtn`).onclick=()=>r.remove(),r.querySelector(`#saveJournalBtn`).onclick=async()=>{n.notes=r.querySelector(`#journalText`).value,a(`state:changed`),await Y(n),window.showToast?.(`Memories saved!`),r.remove(),R(`home`,null,!0)}},window.openPhotosModal=t=>{let n=e.tripDays.find(e=>e.id===t);if(!n)return;n.photos||=[];let r=document.createElement(`div`);r.className=`modal-overlay`,r.style.display=`flex`,r.style.backdropFilter=`blur(25px)`,r.innerHTML=`
        <div class="card glass" style="width: 500px; padding: 32px; border-radius: 40px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.95);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800;">Photo Gallery</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Add images that define your Day ${n.dayNumber}</p>
            <div id="photoList" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; max-height: 300px; overflow-y: auto; padding: 4px;">
                ${n.photos.length===0?`<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px;">No photos added yet.</p>`:n.photos.map((e,n)=>`
                        <div style="position: relative; aspect-ratio: 1; border-radius: 16px; overflow: hidden; border: 1px solid rgba(0,0,0,0.05);">
                            <img src="${e}" style="width: 100%; height: 100%; object-fit: cover;">
                            <button onclick="window.removePhoto('${t}', ${n})" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,59,48,0.8); color: white; border: none; font-size: 0.7rem; font-weight: 800; cursor: pointer;">✕</button>
                        </div>
                    `).join(``)}
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                <label class="btn" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 14px; background: rgba(0,113,227,0.1); color: var(--accent-blue); cursor: pointer; border: 1px dashed var(--accent-blue); transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.15)';" onmouseout="this.style.background='rgba(0,113,227,0.1)';" id="uploadLabel">
                    <span id="uploadStatusText">📤 Upload Photo</span>
                    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
                </label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div style="flex: 1; height: 1px; background: rgba(0,0,0,0.05);"></div>
                    <span style="font-size: 0.7rem; color: var(--text-secondary); font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">OR</span>
                    <div style="flex: 1; height: 1px; background: rgba(0,0,0,0.05);"></div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="photoUrl" class="glass-input" placeholder="Paste image URL here..." style="flex: 1; padding: 14px; border-radius: 14px; font-size: 0.9rem;">
                    <button id="addPhotoBtn" class="btn" style="padding: 14px 20px; border-radius: 14px; background: var(--accent-blue); color: white; font-weight: 700;">Add</button>
                </div>
            </div>
            <button id="closePhotosBtn" class="btn" style="width: 100%; padding: 16px; border-radius: 16px; background: rgba(0,0,0,0.05); color: #002d5b; font-weight: 700; border: none; font-size: 0.9rem;">Done</button>
        </div>
    `,document.body.appendChild(r);let i=r.querySelector(`#photoUpload`);i.onchange=async e=>{let i=e.target.files[0];if(!i)return;r.querySelector(`#uploadStatusText`).textContent=`⌛ Uploading...`;let o=await window.uploadMedia(i);o&&o.url?(n.photos.push(o.url),a(`state:changed`),await Y(n),r.remove(),window.openPhotosModal(t)):r.querySelector(`#uploadStatusText`).textContent=`❌ Failed. Try again.`},window.removePhoto=async(e,t)=>{n.photos.splice(t,1),a(`state:changed`),await Y(n),r.remove(),window.openPhotosModal(e)},r.querySelector(`#addPhotoBtn`).onclick=async()=>{let e=r.querySelector(`#photoUrl`).value;e&&(n.photos.push(e),a(`state:changed`),await Y(n),r.remove(),window.openPhotosModal(t))},r.querySelector(`#closePhotosBtn`).onclick=()=>{r.remove(),R(`home`,null,!0)}},window.openDocumentsModal=t=>{let n=e.tripDays.find(e=>e.id===t);if(!n)return;n.documents||=[];let r=document.createElement(`div`);r.className=`modal-overlay`,r.style.display=`flex`,r.style.backdropFilter=`blur(25px)`,r.innerHTML=`
        <div class="card glass" style="width: 460px; padding: 32px; border-radius: 40px; background: rgba(255,255,255,0.95);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800;">Documents</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Tickets, bookings, and important info</p>
            <div id="docList" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; max-height: 250px; overflow-y: auto;">
                ${n.documents.length===0?`<p style="text-align: center; color: var(--text-secondary); padding: 32px;">No documents linked.</p>`:n.documents.map((e,n)=>`
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: white; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05);">
                            <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                                <span style="font-size: 1.2rem;">📄</span>
                                <a href="${e.url}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${e.name}</a>
                            </div>
                            <button onclick="window.removeDoc('${t}', ${n})" style="background: none; border: none; color: #ff3b30; font-weight: 800; cursor: pointer;">✕</button>
                        </div>
                    `).join(``)}
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                <label class="btn" style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 14px; background: rgba(0,113,227,0.1); color: var(--accent-blue); cursor: pointer; border: 1px dashed var(--accent-blue); transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.15)';" onmouseout="this.style.background='rgba(0,113,227,0.1)';" id="uploadDocLabel">
                    <span id="uploadDocStatusText">📤 Upload Document</span>
                    <input type="file" id="docUpload" style="display: none;">
                </label>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div style="flex: 1; height: 1px; background: rgba(0,0,0,0.05);"></div>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: 800;">OR</span>
                    <div style="flex: 1; height: 1px; background: rgba(0,0,0,0.05);"></div>
                </div>
                <input type="text" id="docName" class="glass-input" placeholder="Document Name (e.g. Flight Ticket)" style="padding: 12px; border-radius: 12px;">
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="docUrl" class="glass-input" placeholder="Link to document (Google Drive, URL...)" style="flex: 1; padding: 12px; border-radius: 12px;">
                    <button id="addDocBtn" class="btn" style="padding: 12px 20px; border-radius: 12px; background: var(--accent-blue); color: white; font-weight: 700;">Add</button>
                </div>
            </div>
            <button id="closeDocsBtn" class="btn" style="width: 100%; padding: 16px; border-radius: 16px; background: rgba(0,0,0,0.05); color: #002d5b; font-weight: 700; border: none; font-size: 0.9rem;">Close</button>
        </div>
    `,document.body.appendChild(r);let i=r.querySelector(`#docUpload`);i.onchange=async e=>{let i=e.target.files[0];if(!i)return;r.querySelector(`#uploadDocStatusText`).textContent=`⌛ Uploading...`;let o=await window.uploadMedia(i);o&&o.url?(n.documents.push({name:o.name||i.name,url:o.url}),a(`state:changed`),await Y(n),r.remove(),window.openDocumentsModal(t)):r.querySelector(`#uploadDocStatusText`).textContent=`❌ Failed. Try again.`},window.removeDoc=async(e,t)=>{n.documents.splice(t,1),a(`state:changed`),await Y(n),r.remove(),window.openDocumentsModal(e)},r.querySelector(`#addDocBtn`).onclick=async()=>{let e=r.querySelector(`#docName`).value,i=r.querySelector(`#docUrl`).value;e&&i&&(n.documents.push({name:e,url:i}),a(`state:changed`),await Y(n),r.remove(),window.openDocumentsModal(t))},r.querySelector(`#closeDocsBtn`).onclick=()=>r.remove()},window.openDayDetail=t=>{let n=e.tripDays.find(e=>e.id===t);if(!n)return;let r=document.createElement(`div`);r.className=`modal-overlay`,r.style.display=`flex`,r.style.backdropFilter=`blur(25px)`,r.innerHTML=`
        <div class="card glass" style="width: 800px; max-height: 90vh; overflow-y: auto; padding: 48px; border-radius: 48px; background: white; border: 1px solid rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 40px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <div style="background: var(--accent-blue); color: white; padding: 4px 12px; border-radius: 8px; font-weight: 800; font-size: 0.75rem; text-transform: uppercase;">Day ${n.dayNumber}</div>
                        <div style="color: var(--text-secondary); font-weight: 600; font-size: 0.9rem;">${g(n.date)}</div>
                    </div>
                    <h2 style="font-size: 2.5rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${n.name}</h2>
                </div>
                <button id="closeDetailBtn" style="background: rgba(0,0,0,0.05); border: none; width: 44px; height: 44px; border-radius: 50%; font-size: 1.5rem; cursor: pointer;">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue);">Morning</h4>
                        <textarea class="glass-input plan-input" data-time="morning" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Morning plans...">${n.plan?.morning||``}</textarea>
                    </div>
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #ff9500;">Afternoon</h4>
                        <textarea class="glass-input plan-input" data-time="afternoon" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Afternoon plans...">${n.plan?.afternoon||``}</textarea>
                    </div>
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #5856d6;">Evening</h4>
                        <textarea class="glass-input plan-input" data-time="evening" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Evening plans...">${n.plan?.evening||``}</textarea>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="flex: 1; background: rgba(0,113,227,0.05); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,113,227,0.1);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue);">Personal Notes</h4>
                        <textarea id="detailNotes" style="width: 100%; height: 200px; background: transparent; border: none; font-size: 1rem; color: #002d5b; resize: none;" placeholder="Private thoughts about this day...">${n.notes||``}</textarea>
                    </div>
                    <div style="background: #000000; padding: 24px; border-radius: 24px; color: white;">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #34c759;">Expert Tip</h4>
                        <p style="margin: 0; font-size: 0.95rem; line-height: 1.5; opacity: 0.9;">${n.tip||`Always keep a portable charger and a small bottle of water in your bag for long exploration days.`}</p>
                    </div>
                    <button id="saveDetailBtn" class="btn" style="width: 100%; padding: 20px; border-radius: 20px; background: var(--accent-blue); color: white; font-weight: 800; font-size: 1.1rem; border: none; box-shadow: 0 15px 30px rgba(0,113,227,0.2);">Save All Changes</button>
                </div>
            </div>
        </div>
    `,document.body.appendChild(r),r.querySelector(`#closeDetailBtn`).onclick=()=>r.remove(),r.querySelector(`#saveDetailBtn`).onclick=async()=>{let e=r.querySelector(`[data-time="morning"]`).value,t=r.querySelector(`[data-time="afternoon"]`).value,i=r.querySelector(`[data-time="evening"]`).value,o=r.querySelector(`#detailNotes`).value;n.plan={morning:e,afternoon:t,evening:i},n.notes=o,a(`state:changed`),await Y(n),window.showToast?.(`Itinerary updated!`),r.remove(),R(`home`)}};var S=t=>{let n=e.expenses.find(e=>e.id===t);n&&(e.draftExpense={...n},e.activeTripId=n.tripId,a(`state:changed`),R(`expenses`))},C=t=>{m({title:`Delete Expense?`,message:`This action cannot be undone.`,confirmText:`Delete`,onConfirm:()=>{e.expenses=e.expenses.filter(e=>e.id!==t),a(`state:changed`),se(t),R(`expenses`)}})};function w(){let t=document.createElement(`div`);if(!e.activeTripId)return t.innerHTML=`<h1>Expenses</h1><div class="card glass"><p>Please select a trip first.</p></div>`,t;let n=e.groups.map(e=>`<option value="${e}">${e}</option>`).join(``);n||=`<option value="">Add companions in the personalisation section</option>`;let r=e.categories.map(e=>`<option value="${e.id}">${e.icon} ${e.name}</option>`).join(``);return t.innerHTML=`
        <h1 style="margin-bottom: 32px;">Expenses</h1>
        <div style="display: flex; flex-direction: column; gap: 60px;">
            <!-- Add Expense Section -->
            <div class="card glass" style="max-width: 600px; margin: 0 auto; width: 100%; border-radius: 44px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); padding: 48px; box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
                <h2 class="card-title" style="font-size: 2.2rem; margin-bottom: 32px; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Expense</h2>
                <form id="expenseForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    
                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Who Paid</label>
                        <select id="expWho" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            ${n}
                        </select>
                        ${!e.groups||e.groups.length===0?`
                        <div id="addCompanionsHelper" style="margin-top: 12px; font-size: 0.85rem; color: #0071e3; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <span>➕</span> <span style="text-decoration: underline;">Add companions in the personalization section</span>
                        </div>`:``}
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Category</label>
                        <select id="expCategory" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            ${r}
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
                                ${o.sort().map(e=>`<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${e}">${e}</div>`).join(``)}
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
                            ${Object.keys(l).map(e=>`<option value="${e}">${e}</option>`).join(``)}
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 40px; background: rgba(0,0,0,0.03); padding: 32px; border-radius: 32px; border: 1px solid rgba(0,0,0,0.05); width: 100%; max-width: 440px; box-sizing: border-box;">
                        <label style="display: block; margin-bottom: 16px; font-size: 0.9rem; font-weight: 800; color: #000000; letter-spacing: -0.02em;">Split Between</label>
                        <div style="display: flex; gap: 14px; margin-bottom: 20px;">
                            <select id="addSplitSelect" class="glass-input" style="flex: 1; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.4); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;">
                                <option value="">Add person to split...</option>
                                ${e.groups.map(e=>`<option value="${e}">${e}</option>`).join(``)}
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

                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                            <!-- Row 1: Search (full width) -->
                            <div style="grid-column: 1 / -1;">
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Search</label>
                                <input type="text" id="filterSearch" class="glass-input" placeholder="Search labels or items..." style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                            </div>

                            <!-- Row 2: Category | Payer | (empty) -->
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Category</label>
                                <select id="filterCategory" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                    <option value="all">All Categories</option>
                                    ${e.categories.map(e=>`<option value="${e.id}">${e.icon} ${e.name}</option>`).join(``)}
                                    <option value="settlement">🤝 Settlement</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Payer</label>
                                <select id="filterWho" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                    <option value="all">Everyone</option>
                                    ${e.groups.map(e=>`<option value="${e}">${e}</option>`).join(``)}
                                </select>
                            </div>
                            <div></div>

                            <!-- Row 3: From Date | To Date | Min–Max Value -->
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">From Date</label>
                                <input type="date" id="filterDateFrom" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">To Date</label>
                                <input type="date" id="filterDateTo" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Value Range (€)</label>
                                <div style="display: flex; gap: 8px; align-items: center;">
                                    <input type="number" id="filterMinVal" class="glass-input" placeholder="Min" style="flex: 1; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                    <span style="color: rgba(0,0,0,0.3); font-weight: 700; flex-shrink: 0;">–</span>
                                    <input type="number" id="filterMaxVal" class="glass-input" placeholder="Max" style="flex: 1; padding: 10px 12px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div id="tripExpensesList" style="display: flex; flex-direction: column; gap: 20px;"></div>
            </div>
        </div>
    `,setTimeout(()=>{t.querySelector(`#addCompanionsHelper`)?.addEventListener(`click`,()=>{R(`personalization`),setTimeout(()=>window.showPersTab(`companions`),50)}),t.addEventListener(`click`,e=>{let t=e.target.closest(`.expense-edit-btn`);if(t){S(t.dataset.expenseId);return}let n=e.target.closest(`.expense-delete-btn`);if(n){C(n.dataset.expenseId);return}});let n=t.querySelector(`#expenseForm`),r=t.querySelector(`#splitContainer`),i=t.querySelector(`#addSplitSelect`),o=t.querySelector(`#addSplitBtn`),s=[];function c(){if(s.length===0){r.innerHTML=`<p style="color:var(--text-secondary); font-size:0.85rem; padding:10px; border:1px dashed var(--glass-border); border-radius:8px; text-align:center;">100% will be attributed to the payer.</p>`;return}let e=(100/s.length).toFixed(1);r.innerHTML=s.map(t=>`
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <span style="font-weight: 500;">${t}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="number" class="glass-input split-input" data-person="${t}" value="${e}" step="0.1" style="width: 70px; padding: 4px 8px; text-align: center;" required>
                        <span style="color: var(--text-secondary); font-size: 0.9rem;">%</span>
                        <button type="button" class="remove-splitter" data-person="${t}" style="background:none; border:none; color:#ff3b30; cursor:pointer; font-weight:700; margin-left:8px;">&times;</button>
                    </div>
                </div>
            `).join(``),r.querySelectorAll(`.remove-splitter`).forEach(e=>{e.onclick=()=>{let t=e.getAttribute(`data-person`);s=s.filter(e=>e!==t),c()}})}if(o.onclick=()=>{let e=i.value;e&&!s.includes(e)&&(s.push(e),c())},e.draftExpense){let n=e.draftExpense;n.who&&(t.querySelector(`#expWho`).value=n.who),n.categoryId&&(t.querySelector(`#expCategory`).value=n.categoryId),n.label&&(t.querySelector(`#expLabel`).value=n.label),n.date&&(t.querySelector(`#expDate`).value=n.date),n.country&&(t.querySelector(`#expCountry`).value=n.country),n.value&&(t.querySelector(`#expValue`).value=n.value),n.currency&&(t.querySelector(`#expCurrency`).value=n.currency)}n.querySelectorAll(`input, select`).forEach(t=>{t.addEventListener(`input`,t=>{let n=t.target.id;if(!n)return;let r=t.target.value;n===`expWho`&&(e.draftExpense.who=r),n===`expCategory`&&(e.draftExpense.categoryId=r),n===`expLabel`&&(e.draftExpense.label=r),n===`expDate`&&(e.draftExpense.date=r),n===`expCountry`&&(e.draftExpense.country=r),n===`expValue`&&(e.draftExpense.value=r),n===`expCurrency`&&(e.draftExpense.currency=r),a(`state:changed`)})});let u=t.querySelector(`#expCountry`),d=t.querySelector(`#countryDropdownList`),f=d.querySelectorAll(`.dropdown-item`);u.onfocus=()=>{d.style.display=`block`},u.oninput=e=>{let t=e.target.value.toLowerCase();f.forEach(e=>{let n=e.textContent.toLowerCase();e.style.display=n.includes(t)?`block`:`none`}),d.style.display=`block`},f.forEach(t=>{t.onclick=n=>{u.value=t.getAttribute(`data-value`),d.style.display=`none`,n.stopPropagation(),e.draftExpense.country=u.value,a(`state:changed`)},t.onmouseover=()=>t.style.background=`rgba(0, 122, 255, 0.1)`,t.onmouseout=()=>t.style.background=`transparent`}),document.addEventListener(`click`,e=>{t.querySelector(`#countrySearchContainer`).contains(e.target)||(d.style.display=`none`)}),n.addEventListener(`submit`,r=>{r.preventDefault();let i=t.querySelector(`#expWho`).value,o={},u=0,d=t.querySelectorAll(`.split-input`);if(d.length>0){if(d.forEach(e=>{let t=parseFloat(e.value)||0;o[e.getAttribute(`data-person`)]=t,u+=t}),Math.abs(u-100)>.5){alert(`Percentages must add up to exactly 100%`);return}}else o[i]=100;let f=parseFloat(t.querySelector(`#expValue`).value),p=t.querySelector(`#expCurrency`).value.toUpperCase();if(isNaN(f)||f<=0){alert(`Please enter a valid expense value.`);return}if(!p){alert(`Please select a currency.`);return}let m=e.trips.find(t=>t.id===e.activeTripId),g=t.querySelector(`#expCountry`).value||(m?m.country:``),_=!!e.draftExpense?.id,v={id:_?e.draftExpense.id:h(),tripId:e.activeTripId,who:i,categoryId:t.querySelector(`#expCategory`).value,label:t.querySelector(`#expLabel`).value,date:t.querySelector(`#expDate`).value,country:g,value:f,currency:p,euroValue:f*(l[p]||1),splits:o};if(_){let t=e.expenses.findIndex(e=>e.id===v.id);t===-1?e.expenses.push(v):e.expenses[t]=v}else e.expenses.push(v);e.draftExpense={who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`},a(`state:changed`),K(v),T(t.querySelector(`#tripExpensesList`)),n.reset(),s=[],c()});let p=()=>{let e=t.querySelector(`#filterSearch`).value.toLowerCase(),n=t.querySelector(`#filterCategory`).value,r=t.querySelector(`#filterWho`).value,i=t.querySelector(`#filterDateFrom`).value,a=t.querySelector(`#filterDateTo`).value,o=parseFloat(t.querySelector(`#filterMinVal`).value)||0,s=parseFloat(t.querySelector(`#filterMaxVal`).value)||1/0;T(t.querySelector(`#tripExpensesList`),{search:e,catId:n,who:r,dateFrom:i,dateTo:a,minVal:o,maxVal:s})};t.querySelector(`#filterSearch`).oninput=p,t.querySelector(`#filterCategory`).onchange=p,t.querySelector(`#filterWho`).onchange=p,t.querySelector(`#filterDateFrom`).onchange=p,t.querySelector(`#filterDateTo`).onchange=p,t.querySelector(`#filterMinVal`).oninput=p,t.querySelector(`#filterMaxVal`).oninput=p,t.querySelector(`#clearFiltersBtn`).onclick=()=>{t.querySelector(`#filterSearch`).value=``,t.querySelector(`#filterCategory`).value=`all`,t.querySelector(`#filterWho`).value=`all`,t.querySelector(`#filterDateFrom`).value=``,t.querySelector(`#filterDateTo`).value=``,t.querySelector(`#filterMinVal`).value=``,t.querySelector(`#filterMaxVal`).value=``,T(t.querySelector(`#tripExpensesList`))},T(t.querySelector(`#tripExpensesList`)),c()},0),t}function T(t,n={}){if(!t)return;let r=e.expenses.filter(t=>t.tripId===e.activeTripId);n.search&&(r=r.filter(e=>e.label.toLowerCase().includes(n.search))),r=n.catId&&n.catId!==`all`?n.catId===`settlement`?r.filter(e=>e.isSettlement):r.filter(e=>e.categoryId===n.catId&&!e.isSettlement):r.filter(e=>!e.isSettlement),n.who&&n.who!==`all`&&(r=r.filter(e=>e.who===n.who)),n.dateFrom&&(r=r.filter(e=>e.date>=n.dateFrom)),n.dateTo&&(r=r.filter(e=>e.date<=n.dateTo)),n.minVal!==void 0&&(r=r.filter(e=>(e.euroValue||0)>=n.minVal)),n.maxVal!==void 0&&n.maxVal!==1/0&&(r=r.filter(e=>(e.euroValue||0)<=n.maxVal)),r.sort((e,t)=>new Date(t.date)-new Date(e.date));function i(e){if(!e)return`Global`;let t=new Date(e);return`${[`Jan`,`Feb`,`Mar`,`Apr`,`May`,`Jun`,`Jul`,`Aug`,`Sep`,`Oct`,`Nov`,`Dec`][t.getMonth()]} ${t.getDate()}`}if(r.length===0){t.innerHTML=`
            <div class="card glass" style="padding: 50px; text-align: center; border-radius: 32px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); backdrop-filter: blur(25px);">
                <div style="font-size: 2.5rem; margin-bottom: 15px; opacity: 0.5;">💸</div>
                <p style="color: rgba(255,255,255,0.5); font-weight: 500; font-size: 1rem;">No expenses found for this trip.</p>
            </div>
        `;return}t.innerHTML=r.map(t=>{let n=e.categories.find(e=>e.id===t.categoryId),r=t.euroValue;return`
            <div class="card glass" style="padding: 14px 22px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); display: flex; justify-content: space-between; align-items: center; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.1);" onmouseover="this.style.transform='scale(1.012)'; this.style.boxShadow='0 20px 50px rgba(0,0,0,0.2)'; this.style.background='rgba(255,255,255,0.2)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 10px 30px rgba(0,0,0,0.1)'; this.style.background='rgba(255,255,255,0.15)';">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 48px; height: 48px; background: rgba(0,0,0,0.04); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; border: 1px solid rgba(0,0,0,0.04);">
                        ${n?n.icon:`💰`}
                    </div>
                    <div>
                        <strong style="display: block; font-size: 1.1rem; letter-spacing: -0.02em; color: #000000; margin-bottom: 1px;">${t.label}</strong>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: rgba(0,0,0,0.5); font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;">
                            <span>${i(t.date)}</span>
                            <span style="width: 3px; height: 3px; background: rgba(0,0,0,0.1); border-radius: 50%;"></span>
                            <span>${t.country||`Global`}</span>
                            <span style="width: 3px; height: 3px; background: rgba(0,0,0,0.1); border-radius: 50%;"></span>
                            <span>${t.who}</span>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="text-align: right;">
                        <div style="font-weight: 800; font-size: 1.2rem; color: #000000; letter-spacing: -0.03em;">${t.value.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2})} <span style="font-size: 0.75rem; opacity: 0.5; font-weight: 600;">${t.currency}</span></div>
                        <div style="font-size: 0.85rem; color: #0071e3; font-weight: 700; margin-top: 1px;">≈ €${(r||0).toFixed(2)}</div>
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button class="expense-edit-btn" data-expense-id="${t.id}" style="background: rgba(0,113,227,0.08); border: 1px solid rgba(0,113,227,0.1); color: #0071e3; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.15)';" onmouseout="this.style.background='rgba(0,113,227,0.08)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button class="expense-delete-btn" data-expense-id="${t.id}" style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.1); color: #ff3b30; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.15)';" onmouseout="this.style.background='rgba(255,59,48,0.08)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `}).join(``)}var E=e=>{let t=document.querySelectorAll(`.settings-tab-btn`),n=document.querySelectorAll(`.settings-section`);t.forEach(e=>e.classList.remove(`active`)),n.forEach(e=>e.classList.remove(`active`));let r=Array.from(t).find(t=>t.innerText.toLowerCase().includes(e.toLowerCase()));r&&r.classList.add(`active`);let i=document.getElementById(`settings-${e}`);i&&i.classList.add(`active`)};window.showPersTab=e=>{let t=document.getElementById(`persMenu`),n=document.getElementById(`persContent`),r=document.getElementById(`persCategories`),i=document.getElementById(`persCompanions`);e===`menu`?(t&&(t.style.display=`grid`),n&&(n.style.display=`none`)):(t&&(t.style.display=`none`),n&&(n.style.display=`block`),r&&(r.style.display=e===`categories`?`block`:`none`),i&&(i.style.display=e===`companions`?`block`:`none`))},window.showPersonalizationTab=window.showPersTab,window.deleteCategory=t=>{m({title:`Delete Category?`,message:`This will not affect existing expenses, but you won't be able to select this category again.`,confirmText:`Delete`,onConfirm:()=>{e.categories=e.categories.filter(e=>e.id!==t),a(`state:changed`),J(),R(`personalization`),setTimeout(()=>window.showPersTab(`categories`),50)}})},window.deleteCompanion=t=>{m({title:`Remove Companion?`,message:`Remove "${t}" from your travel companions?`,confirmText:`Remove`,onConfirm:()=>{e.groups=e.groups.filter(e=>e!==t),a(`state:changed`),q(),R(`personalization`),setTimeout(()=>window.showPersTab(`companions`),50)}})};function D(){let t=document.createElement(`div`);function n(){let t=[`label`,`date`,`value`,`who`],n=[`country`,`categoryId`,`currency`],r=new Set((e.customFormat||[]).map(e=>e.variable)),i=e.savedFormats||[];return`
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px;">
                ${t.map(e=>{let t=r.has(e);return`<span style="padding:6px 14px; border-radius:20px; font-size:0.75rem; font-weight:700; border:1px solid ${t?`rgba(52,199,89,0.3)`:`rgba(255,59,48,0.3)`}; background:${t?`rgba(52,199,89,0.05)`:`rgba(255,59,48,0.05)`}; color:${t?`#34c759`:`#ff3b30`};">
                        ${t?`✓`:`★`} ${e.toUpperCase()}
                    </span>`}).join(``)}
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
                        ${(e.customFormat||[]).length===0?`<tr><td colspan="3" style="padding:32px; text-align:center; color:var(--text-secondary); font-style:italic;">No mappings yet.</td></tr>`:(e.customFormat||[]).map(e=>`
                            <tr style="border-bottom: 1px solid var(--glass-border);">
                                <td style="padding:16px; font-weight:700;">${e.variable}</td>
                                <td style="padding:16px;"><span style="background:#ff9500; color:white; padding:4px 10px; border-radius:8px; font-weight:800; font-size:0.8rem;">${e.column}</span></td>
                                <td style="padding:16px; text-align:center;">
                                    <button onclick="window.removeFormatMapping('${e.variable}')" style="background:rgba(255,59,48,0.1); border:none; color:#ff3b30; width:32px; height:32px; border-radius:50%; cursor:pointer;">&times;</button>
                                </td>
                            </tr>
                        `).join(``)}
                    </tbody>
                </table>
            </div>

            <div style="display:flex; gap:16px; align-items:flex-end; flex-wrap:wrap; margin-bottom:32px;">
                <div style="flex:1; min-width:150px;">
                    <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--text-secondary);">VARIABLE</label>
                    <select id="mapVarSelect" class="glass-input" style="width:100%;">
                        <option value="">Select...</option>
                        ${t.concat(n).filter(e=>!r.has(e)).map(e=>`<option value="${e}">${t.includes(e)?`★ `:``}${e}</option>`).join(``)}
                    </select>
                </div>
                <div style="flex:1; min-width:120px;">
                    <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--text-secondary);">COLUMN</label>
                    <select id="mapColSelect" class="glass-input" style="width:100%;">
                        <option value="">Col...</option>
                        ${`ABCDEFGHIJKLMNOPQRSTUVWXYZ`.split(``).map(e=>`<option value="${e}">${e}</option>`).join(``)}
                    </select>
                </div>
                <button class="btn btn-liquid-glass" style="padding: 12px 24px;" onclick="window.addFormatMapping()">Map Field</button>
            </div>

            <div style="border-top: 1px solid var(--glass-border); padding-top: 32px;">
                <h3 style="margin-top:0;">Saved Formats (${i.length}/5)</h3>
                <div style="display:grid; gap:12px;">
                    ${i.map(e=>`
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:16px; border-radius:16px; border:1px solid var(--glass-border);">
                            <div style="font-weight:700;">${e.name}</div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-small" style="background:rgba(0,113,227,0.1); color:#007aff; border:none; padding:8px 16px; border-radius:12px;" onclick="window.editSavedFormat('${e.id}')">Edit</button>
                                <button class="btn btn-small" style="background:rgba(255,59,48,0.1); color:#ff3b30; border:none; padding:8px 16px; border-radius:12px;" onclick="window.deleteSavedFormat('${e.id}')">Delete</button>
                            </div>
                        </div>
                    `).join(``)}
                    ${i.length<5?`
                        <div style="display:flex; gap:12px; margin-top:12px;">
                            <input type="text" id="formatNameInput" class="glass-input" placeholder="Name this format..." style="flex:1;">
                            <button class="btn" onclick="window.saveCustomFormat()" style="background:var(--accent-blue);">Save Format</button>
                        </div>
                    `:``}
                </div>
            </div>
        `}let r=(e=`menu`)=>`
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #5856d6, #ff2d55); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">System Control</h1>
                <p>Manage your travel data, custom formats, and core preferences.</p>
            </div>

            ${e===`menu`?`
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
            `:`
                <button class="btn btn-small btn-liquid-glass" style="margin-bottom: 24px; padding: 10px 20px; border-radius: 14px;" onclick="window.switchSettingsTab('menu')">&larr; Back to Control Center</button>
                
                ${e===`reset`?`
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
                `:``}

                ${e===`format`?`
                    <div class="card glass" style="padding: 32px; border-radius: 28px;">
                        <h2 style="color: #ff9500; margin-top: 0;">Custom Excel Mapping</h2>
                        <p style="color: var(--text-secondary); margin-bottom: 24px;">Define how internal app fields map to Excel columns for seamless imports.</p>
                        
                        <div id="mappingTableContainer">
                            ${n()}
                        </div>
                    </div>
                `:``}
            `}
        `;return window.switchSettingsTab=e=>{t.innerHTML=r(e)},window.confirmReset=t=>{m({groups:{title:`Clear Companions?`,message:`This will remove all travel companions and group lists.`,confirmText:`Clear All`,onConfirm:()=>{e.groups=[],a(`state:changed`),window.switchSettingsTab(`reset`)}},trips:{title:`Wipe All Trips?`,message:`This permanently deletes every trip, day log, and itinerary.`,confirmText:`Delete Trips`,onConfirm:async()=>{if(e.trips=[],e.archivedTrips=[],e.tripDays=[],e.expenses=[],e.budgets=[],e.activeTripId=null,a(`state:changed`),e.user)try{await fetch(`/api/user-data`,{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id})})}catch(e){console.error(`Server wipe failed`,e)}window.switchSettingsTab(`reset`)}},categories:{title:`Reset Categories?`,message:`Reverts all expense categories to the system defaults.`,confirmText:`Restore Defaults`,onConfirm:()=>{e.categories=[{id:`c1`,name:`Food`,icon:`🍔`,color:`#ff3b30`},{id:`c2`,name:`Transport`,icon:`✈️`,color:`#007aff`},{id:`c3`,name:`Accommodation`,icon:`🏨`,color:`#5856d6`}],a(`state:changed`),J(),window.switchSettingsTab(`reset`)}},app:{title:`Factory Reset`,message:`Absolute destruction. This wipes EVERY bit of data from the application.`,confirmText:`ERASE EVERYTHING`,onConfirm:async()=>{if(e.user)try{await fetch(`/api/user-data`,{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id})})}catch(e){console.error(`Server wipe failed`,e)}e.trips=[],e.archivedTrips=[],e.tripDays=[],e.expenses=[],e.groups=[],e.budgets=[],e.categories=[],e.activeTripId=null,e.user=null,e.notifications=[],e.hasLoggedInBefore=!1,a(`state:changed`),localStorage.clear(),location.reload()}}}[t])},window.addFormatMapping=()=>{let t=document.getElementById(`mapVarSelect`)?.value,n=document.getElementById(`mapColSelect`)?.value;!t||!n||(e.customFormat=e.customFormat||[],!e.customFormat.some(e=>e.variable===t)&&(e.customFormat.push({variable:t,column:n}),a(`state:changed`),window.switchSettingsTab(`format`)))},window.removeFormatMapping=t=>{e.customFormat=(e.customFormat||[]).filter(e=>e.variable!==t),a(`state:changed`),window.switchSettingsTab(`format`)},window.saveCustomFormat=()=>{let t=[`label`,`date`,`value`,`who`],n=e.customFormat||[],r=new Set(n.map(e=>e.variable)),i=t.filter(e=>!r.has(e));if(i.length>0)return alert(`Missing required fields: ${i.join(`, `)}`);let o=(document.getElementById(`formatNameInput`)?.value||``).trim();o&&(e.savedFormats=e.savedFormats||[],e.savedFormats.push({id:h(),name:o,mappings:[...n]}),e.customFormat=[],a(`state:changed`),window.switchSettingsTab(`format`))},window.deleteSavedFormat=t=>{m({title:`Delete Format?`,message:`This mapping will no longer be available for imports.`,confirmText:`Delete`,onConfirm:()=>{e.savedFormats=(e.savedFormats||[]).filter(e=>e.id!==t),a(`state:changed`),window.switchSettingsTab(`format`)}})},window.editSavedFormat=t=>{let n=(e.savedFormats||[]).find(e=>e.id===t);n&&(e.customFormat=[...n.mappings],e.savedFormats=(e.savedFormats||[]).filter(e=>e.id!==t),a(`state:changed`),window.switchSettingsTab(`format`),setTimeout(()=>{let e=document.getElementById(`formatNameInput`);e&&(e.value=n.name)},50))},t.innerHTML=r(`menu`),t}function O(){let t=document.createElement(`div`);return t.innerHTML=`
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
                            ${e.categories.map(e=>`
        <tr style="border-bottom: 1px solid var(--glass-border)">
            <td style="padding: 12px; font-weight: 500;">${e.icon} ${e.name}</td>
            <td style="padding: 12px; text-align: right;"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background: ${e.color}"></span></td>
            <td style="padding: 12px; text-align: right;">
                <button class="btn-small" style="background:none; color:#ff3b30; border:none; cursor:pointer;" onclick="window.deleteCategory('${e.id}')">✕</button>
            </td>
        </tr>
    `).join(``)}
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
                            ${e.groups.map(e=>`
        <tr style="border-bottom: 1px solid var(--glass-border)">
            <td style="padding: 12px; font-weight: 500;">${e}</td>
            <td style="padding: 12px; text-align: right;">
                <button class="btn-small" style="background:none; color:#ff3b30; border:none; cursor:pointer;" onclick="window.deleteCompanion('${e}')">✕</button>
            </td>
        </tr>
    `).join(``)||`<tr><td colspan="2" style="text-align:center; padding: 20px; color: var(--text-secondary);">No companions added yet.</td></tr>`}
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
    `,setTimeout(()=>{let n=t.querySelector(`#addCatBtn`);n&&n.addEventListener(`click`,()=>{let n=t.querySelector(`#catIcon`).value,r=t.querySelector(`#catName`).value.trim(),i=t.querySelector(`#catColor`).value;r&&(e.categories.push({id:h(),name:r,icon:n,color:i}),a(`state:changed`),J(),R(`personalization`),setTimeout(()=>window.showPersTab(`categories`),50))});let r=t.querySelector(`#addPersonBtn`);r&&r.addEventListener(`click`,()=>{let n=t.querySelector(`#newPerson`).value.trim();n&&!e.groups.includes(n)&&(e.groups.push(n),a(`state:changed`),q(),R(`personalization`),setTimeout(()=>window.showPersTab(`companions`),50))})},0),t}function k(){let t=document.createElement(`div`);return t.innerHTML=`
        <h1>Upload Data</h1>
        <div class="card glass" style="border-color: rgba(33, 115, 70, 0.3); box-shadow: 0 0 15px rgba(33, 115, 70, 0.1);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <h2 class="card-title" style="color: #217346; margin: 0;">Excel Upload</h2>
            </div>

            <!-- Format Selector -->
            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:8px;">Import Format</label>
                <select id="formatSelect" class="glass-input" style="width:100%;">
                    ${(()=>{let t=e.savedFormats||[],n=e.trips.find(t=>t.id===e.activeTripId),r=n?.activeFormatId,i=n?.activeFormatType||`popular`;return`
                            <optgroup label="Popular Formats">${[{id:`tricount`,name:`Tricount Export (CSV/XLSX)`},{id:`splitwise`,name:`Splitwise Export`},{id:`revolut`,name:`Revolut Monthly Statement`}].map(e=>`<option value="popular:${e.id}" ${i===`popular`&&r===e.id?`selected`:``}>${e.name}</option>`).join(``)}</optgroup>
                            <optgroup label="Custom Formats">${t.length===0?`<option disabled>No saved custom formats yet</option>`:t.map(e=>`<option value="custom:${e.id}" ${i===`custom`&&r===e.id?`selected`:``}>${e.name}</option>`).join(``)}</optgroup>
                        `})()}
                </select>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 12px; line-height: 1.5;">
                    Use your favourite app's format or <a href="#" id="uploadFormatSettingsLink" style="color: var(--accent-blue); text-decoration: none; font-weight: 600;">customize your own upload format</a> in settings.
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
    `,setTimeout(()=>{let n=null;t.querySelector(`#uploadFormatSettingsLink`)?.addEventListener(`click`,e=>{e.preventDefault(),R(`settings`),setTimeout(()=>E(`format`),50)});let r=t.querySelector(`#formatSelect`),i=t.querySelector(`#popularNote`),o=t.querySelector(`#customFormatPreview`),s=t.querySelector(`#customFormatTable`),c=()=>{let n=r.value,c=n.startsWith(`popular:`);if(i.style.display=c?`block`:`none`,c){o.style.display=`none`;let r=n.split(`:`)[1],i=t.querySelector(`#popularFormatTableContainer`),s=[],c=[];r===`tricount`?(s=[`Title`,`Amount`,`Currency`,`Date`,`Paid by`],c=[`Dinner`,`45.00`,`EUR`,`2023-10-12`,`Alice`]):r===`splitwise`?(s=[`Date`,`Description`,`Category`,`Cost`,`Currency`],c=[`2023-10-12`,`Taxi`,`Transportation`,`20.00`,`EUR`]):r===`revolut`&&(s=[`Type`,`Product`,`Started Date`,`Description`,`Amount`,`Currency`,`State`],c=[`CARD_PAYMENT`,`Current`,`2023-10-12`,`Restaurant`,`-45.00`,`EUR`,`COMPLETED`]),s.length>0?i.innerHTML=`
                        <table class="liquid-table" style="font-size: 0.75rem; margin: 0;">
                            <thead>
                                <tr>${s.map(e=>`<th style="padding: 8px 12px;">${e}</th>`).join(``)}</tr>
                            </thead>
                            <tbody>
                                <tr>${c.map(e=>`<td style="padding: 8px 12px; color: var(--text-secondary);">${e}</td>`).join(``)}</tr>
                            </tbody>
                        </table>
                    `:i.innerHTML=``;let l=e.trips.find(t=>t.id===e.activeTripId);l&&(l.activeFormatId=r,l.activeFormatType=`popular`,a(`state:changed`))}else{let t=n.split(`:`)[1],r=(e.savedFormats||[]).find(e=>e.id===t);if(r){o.style.display=`block`,s.innerHTML=`<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:8px;">
                        ${r.mappings.map(e=>`<div style="font-size:0.75rem;"><span style="color:var(--text-secondary);">${e.variable}:</span> <strong>${e.column}</strong></div>`).join(``)}
                    </div>`;let n=e.trips.find(t=>t.id===e.activeTripId);n&&(n.activeFormatId=t,n.activeFormatType=`custom`,a(`state:changed`))}else o.style.display=`none`}};r.addEventListener(`change`,c),c(),t.querySelector(`#excelFile`).addEventListener(`change`,e=>{let r=e.target.files[0];if(!r)return;let i=new FileReader;i.onload=function(e){try{let r=new Uint8Array(e.target.result),i=XLSX.read(r,{type:`array`}),a=i.SheetNames[0],o=i.Sheets[a],s=XLSX.utils.sheet_to_json(o,{header:1});if(s.length<2)return;let c=s[0];n=s.slice(1).filter(e=>e.length>0&&e[0]);let l=t.querySelector(`#previewContainer`),u=t.querySelector(`#previewTable thead`),d=t.querySelector(`#previewTable tbody`);u.innerHTML=`<tr>`+c.map(e=>`<th>${e||``}</th>`).join(``)+`</tr>`,d.innerHTML=n.slice(0,3).map(e=>`<tr>`+c.map((t,n)=>`<td>${e[n]||``}</td>`).join(``)+`</tr>`).join(``),l.style.display=`block`}catch(e){console.error(`Preview error`,e)}},i.readAsArrayBuffer(r)}),t.querySelector(`#uploadBtn`).addEventListener(`click`,()=>{if(!e.activeTripId){alert(`Please select or create a trip first!`);return}let i=t.querySelector(`#uploadStatus`),o=r.value,s=o.startsWith(`popular:`),c=o.split(`:`)[1];if(!n){i.innerText=`Please select a valid file to process.`,i.style.color=`red`;return}try{let r=0,u=[];if(!s){let t=o.split(`:`)[1],n=e.savedFormats.find(e=>e.id===t);if(!n)throw Error(`Format not found`);u=n.mappings}n.forEach(t=>{let n,i,a,o,d,f,p;if(s)c===`tricount`?(a=String(t[0]||``).trim(),f=parseFloat(t[1])||0,p=String(t[2]||`EUR`).trim().toUpperCase(),o=String(t[3]||``).trim(),i=String(t[4]||``).trim(),n=String(t[5]||``).trim(),d=`Unknown`):c===`splitwise`&&(o=String(t[0]||``).trim(),a=String(t[1]||``).trim(),i=String(t[2]||``).trim(),f=parseFloat(t[3])||0,p=String(t[4]||`EUR`).trim().toUpperCase(),n=`Me`,d=`Unknown`);else{let e=e=>e?e.toUpperCase().charCodeAt(0)-65:-1,r=n=>{let r=u.find(e=>e.variable===n);return r?String(t[e(r.column)]||``).trim():``};n=r(`who`),i=r(`categoryId`),a=r(`label`),o=r(`date`),d=r(`country`)||`Unknown`,f=parseFloat(r(`value`))||0,p=r(`currency`).toUpperCase()||`EUR`}n&&!e.groups.includes(n)&&e.groups.push(n);let m=e.categories.find(e=>e.name.toLowerCase()===i.toLowerCase());!m&&i&&(m={id:h(),name:i,icon:`📌`,color:`#8e8e93`},e.categories.push(m));let g=m?m.id:e.categories[0].id,_={id:h(),tripId:e.activeTripId,who:n,categoryId:g,label:a,date:o,country:d,value:f,currency:p,euroValue:f*(l[p]||1)};e.expenses.push(_),r++}),a(`state:changed`),z(),i.innerText=`Successfully imported ${r} expenses!`,i.style.color=`green`,n=null,t.querySelector(`#previewContainer`).style.display=`none`}catch(e){console.error(e),i.innerText=`Error parsing file. Check the format.`,i.style.color=`red`}})},0),t}function ee(){let t=document.createElement(`div`);if(!e.activeTripId)return t.innerHTML=`<h1>Insights</h1><div class="card glass"><p>Please select a trip.</p></div>`,t;let n=e.expenses.filter(t=>t.tripId===e.activeTripId&&!t.isSettlement);if(de([...new Set(n.map(e=>e.date).filter(e=>!!e))]).then(()=>{}),n.length===0)return t.innerHTML=`
            <h1>Insights</h1>
            <div style="height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 5rem; margin-bottom: 20px; opacity: 0.5;">📊</div>
                <h2 style="color: var(--text-primary); margin-bottom: 10px;">No Data to Analyze Yet</h2>
                <p style="max-width: 400px; line-height: 1.5;">Add your travel expenses in the <b>Expenses</b> tab or upload an Excel sheet to see your spending breakdown and analytics.</p>
                <button id="goToExpensesBtn" class="btn" style="margin-top: 24px;">Add Your First Expense</button>
            </div>
        `,setTimeout(()=>{t.querySelector(`#goToExpensesBtn`).addEventListener(`click`,()=>R(`expenses`))},0),t;let r=e.insightCurrency||`EUR`,i=e.rateMode||`at_trip`,o=n.map(t=>{let n=l[t.currency]||1;if(i===`at_trip`){let r=`${t.date}_${t.currency}_EUR`;e.rateCache&&e.rateCache[r]&&(n=e.rateCache[r])}let a=t.euroValue||t.value*n,o=a;if(r!==`EUR`){let n=1/(l[r]||1);if(i===`at_trip`){let i=`${t.date}_${r}_EUR`;e.rateCache&&e.rateCache[i]&&(n=1/e.rateCache[i])}o=a*n}return{...t,displayValue:o}}),s=o.reduce((e,t)=>e+t.displayValue,0),c=o.length,u=null;o.length>0&&(u=o.reduce((e,t)=>t.displayValue>e.displayValue?t:e,o[0]));let d={},f={},p={};o.forEach(e=>{f[e.categoryId]||(f[e.categoryId]=0),f[e.categoryId]+=e.displayValue,d[e.who]||(d[e.who]=0),d[e.who]+=e.displayValue;let t=e.date||`Unknown`;p[t]||(p[t]=0),p[t]+=e.displayValue});let m=Object.entries(d).sort((e,t)=>t[1]-e[1]).slice(0,10),h=m.length>0?m[0][0]:`N/A`,g=m.length>0?m[0][1]:0,_=m.slice(1).map(([e,t],n)=>`
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
            <span style="font-weight: 500;">${n+2}. ${e}</span>
            <span style="color: var(--accent-blue); font-weight: 600;">${r===`EUR`?`€`:``}${t.toFixed(2)}${r===`EUR`?``:` `+r}</span>
        </div>
    `).join(``),v={};n.forEach(e=>{v[e.categoryId]=(v[e.categoryId]||0)+1});let y=Object.entries(v).sort((e,t)=>t[1]-e[1]).slice(0,10),b=y.length>0?y[0][0]:null,x=b?e.categories.find(e=>e.id===b):null;x&&x.icon+``+x.name;let S=y.slice(1).map(([t,n],r)=>{let i=e.categories.find(e=>e.id===t);return`
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
                <span style="font-weight: 500;">${r+2}. ${i?i.icon+` `+i.name:`Unknown`}</span>
                <span style="color: var(--accent-blue); font-weight: 600;">${n} trans.</span>
            </div>
        `}).join(``),C=[],w=[],T=[];return Object.keys(f).forEach(t=>{let n=e.categories.find(e=>e.id===t);n?(C.push(n.icon+` `+n.name),T.push(n.color)):(C.push(`Unknown`),T.push(`#ccc`)),w.push(f[t])}),t.innerHTML=`
        <!-- Header Section -->
        <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 1px solid var(--glass-border);">
            <div>
                <h1 style="margin: 0; font-size: 3.5rem; letter-spacing: -0.04em;">Insights</h1>
                <p style="color: var(--text-secondary); margin: 8px 0 0 0; font-size: 1.1rem;">Your travel spending at a glance.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 24px;">
                <div class="glass" style="display: flex; padding: 4px; border-radius: 14px; border: 1px solid var(--glass-border); box-shadow: var(--shadow-sm);">
                    <button class="rate-mode-btn ${i===`at_trip`?`active`:``}" data-mode="at_trip" style="padding: 8px 18px; border-radius: 11px; border: none; background: ${i===`at_trip`?`var(--accent-blue)`:`transparent`}; color: ${i===`at_trip`?`white`:`var(--accent-blue)`}; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                        At Trip
                    </button>
                    <button class="rate-mode-btn ${i===`today`?`active`:``}" data-mode="today" style="padding: 8px 18px; border-radius: 11px; border: none; background: ${i===`today`?`var(--accent-blue)`:`transparent`}; color: ${i===`today`?`white`:`var(--accent-blue)`}; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                        Today
                    </button>
                </div>

                <div style="display: flex; align-items: center; gap: 12px;">
                    <select id="insightCurrencySelector" class="glass-input" style="width: 110px; padding: 8px 12px; font-weight: 500; font-size: 0.9rem; background: var(--glass-bg);">
                        ${Object.keys(l).map(e=>`<option value="${e}" ${r===e?`selected`:``}>${e}</option>`).join(``)}
                    </select>
                </div>
            </div>
        </div>

        <!-- Hero Row: Totals -->
        <div style="margin-bottom: 32px;">
            <div class="card glass" style="background: linear-gradient(135deg, var(--glass-bg), rgba(0,113,227,0.03)); border-left: 4px solid var(--accent-blue);">
                <h2 class="card-title" style="font-size: 1rem; color: var(--accent-blue); text-transform: uppercase; letter-spacing: 0.1em;">Total Spent on your trip</h2>
                <div style="display: flex; align-items: baseline; gap: 10px;">
                    <h1 style="margin: 0; font-size: 4.5rem; font-weight: 800; letter-spacing: -0.05em;">${r===`EUR`?`€`:``}${s.toFixed(2)}</h1>
                    <span style="font-size: 1.5rem; color: var(--text-secondary); font-weight: 400;">${r===`EUR`?``:r}</span>
                </div>
                <p style="color: var(--text-secondary); margin-top: 10px; font-size: 1.1rem;">Spent across <strong>${c}</strong> transactions during your travels.</p>
            </div>
        </div>

        <!-- Summary Grid -->
        <div class="grid-2" style="grid-template-columns: 1fr 1fr; margin-bottom: 32px;">
            <div class="card glass">
                <h2 class="card-title" style="font-size: 0.9rem; color: var(--text-secondary);">Avg. Daily Spend</h2>
                <h1 style="margin: 0; font-size: 2.5rem;">${r===`EUR`?`€`:``}${(s/(Object.keys(p).length||1)).toFixed(2)}<small style="font-size: 1rem; font-weight: 400; color: var(--text-secondary); margin-left: 8px;">/ day</small></h1>
            </div>
            ${u?`
            <div class="card glass">
                <h2 class="card-title" style="font-size: 0.9rem; color: var(--text-secondary);">Single Peak</h2>
                <h1 style="margin: 0; font-size: 2.5rem; color: #ff3b30;">${r===`EUR`?`€`:``}${u.displayValue.toFixed(2)}</h1>
                <p style="margin: 4px 0 0 0; font-size: 0.9rem; color: var(--text-secondary);">${u.label} • ${u.who}</p>
            </div>
            `:``}
        </div>

        <!-- Rankings Grid -->
        <div class="grid-2" style="margin-bottom: 32px;">
            <div class="card glass" style="padding: 28px;">
                <h2 class="card-title">Top Spenders</h2>
                <div style="margin-bottom: 20px;">
                    <h1 style="margin: 0; font-size: 2rem; color: var(--text-primary);">${h}</h1>
                    <span style="color: var(--accent-blue); font-weight: 700; font-size: 1.1rem;">${s>0?(r===`EUR`?`€`:``)+g.toFixed(2):`0`}</span>
                </div>
                <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 4px;">
                    ${_}
                </div>
            </div>

            <div class="card glass" style="padding: 28px;">
                <h2 class="card-title">Category Breakdown</h2>
                <div style="position: relative; height:200px; width:100%; margin-bottom: 20px;">
                    <canvas id="categoryChart"></canvas>
                </div>
                <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 4px;">
                    ${S}
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
    `,setTimeout(()=>{t.querySelectorAll(`.rate-mode-btn`).forEach(t=>{t.addEventListener(`click`,()=>{e.rateMode=t.dataset.mode,a(`state:changed`),R(`insights`)})}),t.querySelector(`#insightCurrencySelector`).addEventListener(`change`,t=>{e.insightCurrency=t.target.value,a(`state:changed`),R(`insights`)});let i=t.querySelector(`#categoryChart`);i&&w.length>0&&new Chart(i,{type:`doughnut`,data:{labels:C,datasets:[{data:w,backgroundColor:T,borderWidth:0}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:`right`}}}});let o=t.querySelector(`#timelineChart`);if(o&&n.length>0){let e=Object.keys(p).sort(),t=e.map(e=>p[e]),n=e.map(e=>{try{return new Date(e).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`})}catch{return e}});new Chart(o,{type:`line`,data:{labels:n,datasets:[{label:r+` Spent`,data:t,borderColor:`#0071e3`,backgroundColor:`rgba(0, 113, 227, 0.1)`,fill:!0,tension:.4,pointRadius:4,pointBackgroundColor:`#0071e3`,borderWidth:3}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{display:!1},ticks:{maxRotation:0,autoSkip:!0,maxTicksLimit:7}},y:{beginAtZero:!0,grid:{color:`rgba(255,255,255,0.05)`},ticks:{maxTicksLimit:5,callback:e=>(r===`EUR`?`€`:``)+e}}}}})}},0),t}var te=t=>{e.budgets=e.budgets.filter(e=>e.id!==t),a(`state:changed`),le(t),R(`budgets`)};function A(){let t=document.createElement(`div`);if(!e.user)return t.innerHTML=`
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
        `,t;e.budgets=e.budgets||[];let n=e.trips.map(e=>`<option value="${e.id}">${e.name}</option>`).join(``),r=e.categories.map(e=>`<option value="${e.id}">${e.name}</option>`).join(``),i=e.groups.map(e=>`<option value="${e}">${e}</option>`).join(``),o=e.budgets.length>0?e.budgets.map(t=>{let n=0;e.expenses.forEach(e=>{e.isSettlement||t.tripId&&t.tripId!==`all`&&e.tripId!==t.tripId||t.categoryId&&t.categoryId!==`all`&&e.categoryId!==t.categoryId||t.user&&t.user!==`all`&&e.who!==t.user||(n+=parseFloat(e.euroValue||0))});let r=Math.min(n/t.amount*100,100),i=n>t.amount,a=!i&&r>80,o=`On Track`,s=`#34c759`;i?(o=`Over Budget`,s=`#ff3b30`):a&&(o=`Near Limit`,s=`#ff9500`);let c=e.categories.find(e=>e.id===t.categoryId),l=c?c.icon:`💰`,u=[];return t.tripId&&t.tripId!==`all`&&u.push(e.trips.find(e=>e.id===t.tripId)?.name||`Trip`),t.categoryId&&t.categoryId!==`all`&&u.push(c?.name||`Category`),t.user&&t.user!==`all`&&u.push(t.user),`
            <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid var(--glass-border); margin-bottom: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.1rem;">${l}</span>
                        <div style="font-weight: 700; font-size: 0.95rem;">${u.length>0?u.join(` · `):`General Budget`}</div>
                    </div>
                    <div style="font-size: 0.7rem; font-weight: 800; color: ${s}; text-transform: uppercase; letter-spacing: 0.05em;">${o}</div>
                </div>

                <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                    <div style="height: 100%; width: ${r}%; background: ${s}; border-radius: 3px; transition: width 1s;"></div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 0.8rem; font-weight: 600;">
                        ${n.toFixed(0)}€ <span style="color: var(--text-secondary); opacity: 0.6;">/ ${t.amount.toFixed(0)}€</span>
                    </div>
                    <button class="btn-small delete-budget-btn" data-budget-id="${t.id}" style="background: none; border: none; color: #ff3b30; font-size: 0.7rem; font-weight: 700; cursor: pointer; padding: 0;">Delete</button>
                </div>
            </div>
        `}).join(``):`
        <div style="text-align: center; padding: 32px; border: 2px dashed var(--glass-border); border-radius: 16px; color: var(--text-secondary); font-size: 0.9rem;">
            No active budgets yet.
        </div>
    `;return t.innerHTML=`
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Budgets</h1>
            <p>Set spending limits and track them across trips.</p>
        </div>
        
        <div class="grid-2" style="margin-top: 24px;">
            <div class="card glass card-glow-blue">
                <h2 class="card-title" style="color: var(--accent-blue);">Create New Budget</h2>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Trip</label>
                    <select id="budTrip" class="glass-input" style="width:100%;"><option value="all">All Trips</option>${n}</select>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Category</label>
                    <select id="budCat" class="glass-input" style="width:100%;"><option value="all">All Categories</option>${r}</select>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Person</label>
                    <select id="budUser" class="glass-input" style="width:100%;"><option value="all">Everyone</option>${i}</select>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 100px; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Target Amount</label>
                        <input type="number" id="budAmt" class="glass-input" style="width:100%;" placeholder="e.g. 1000">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Currency</label>
                        <select id="budCurr" class="glass-input" style="width:100%;">
                            ${Object.keys(l).map(t=>`<option value="${t}" ${e.insightCurrency===t?`selected`:``}>${t}</option>`).join(``)}
                        </select>
                    </div>
                </div>
                <button id="saveBudgetBtn" class="btn" style="width:100%; background: var(--accent-blue);">Save Budget</button>
            </div>
            
            <div class="card glass card-glow-blue">
                <h2 class="card-title">Active Tracking</h2>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${o}
                </div>
            </div>
        </div>
    `,setTimeout(()=>{t.addEventListener(`click`,e=>{let t=e.target.closest(`.delete-budget-btn`);t&&te(t.dataset.budgetId)});let n=t.querySelector(`#saveBudgetBtn`);n&&n.addEventListener(`click`,()=>{let n=parseFloat(t.querySelector(`#budAmt`).value),r=t.querySelector(`#budCurr`).value;if(!n||n<=0)return alert(`Enter a valid amount.`);let i=n;r!==`EUR`&&(i=n*(l[r]||1));let o={id:h(),tripId:t.querySelector(`#budTrip`).value,categoryId:t.querySelector(`#budCat`).value,user:t.querySelector(`#budUser`).value,amount:i,originalAmount:n,originalCurrency:r};e.budgets.push(o),a(`state:changed`),ce(o),R(`budgets`)})},0),t}function ne(){let t=document.createElement(`div`);if(!e.user)return t.innerHTML=`
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
                <p>Log in to view and manage your completed trips.</p>
            </div>
            <div class="card glass" style="text-align: center; padding: 60px; margin-top: 24px;">
                <h2 style="margin-bottom: 20px;">Private Collections</h2>
                <p style="color: var(--text-secondary); margin-bottom: 30px;">Your completed trips are safely attached to your account. Log in to access your travel history.</p>
                <button class="btn" style="background: var(--accent-blue);" onclick="window.navigate('profile')">Log In Now</button>
            </div>
        `,t;let n=e.archivedTrips||[];return t.innerHTML=`
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
            <p>Your completed travel memories and trip photos.</p>
        </div>
        
        <div class="trip-nav glass" style="margin-top: 24px; display: none;">
            <button class="trip-tab active" id="tabArchived">Completed Trips</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${n.length>0?n.map(e=>`
                    <div class="card glass card-glow-blue" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
                        <div style="cursor: pointer; flex: 1;" onclick="window.viewArchivedDetails('${e.id}')">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h3 style="margin: 0;">${e.name}</h3>
                            </div>
                            <p style="color: var(--text-secondary); margin: 4px 0 0 0; font-size: 0.85rem;">${e.country}</p>
                            <p style="color: var(--text-secondary); margin: 2px 0 0 0; font-size: 0.85rem;">${(e.expenses||[]).filter(e=>!e.isSettlement).length} expenses</p>
                            <p style="color: var(--accent-blue); margin: 2px 0 0 0; font-size: 0.85rem; font-weight: 700;">Total: €${(e.expenses||[]).filter(e=>!e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0).toFixed(2)}</p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <div style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.03); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(0,0,0,0.08); box-shadow: inset 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03);">
                                <span id="publicLabel-${e.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${e.isPublic?`#34c759`:`rgba(0,0,0,0.3)`}; text-shadow: ${e.isPublic?`0 0 12px rgba(52, 199, 89, 0.6)`:`none`};">${e.isPublic?`Public`:`Not public`}</span>
                                <label class="switch" style="transform: scale(0.75);">
                                    <input type="checkbox" ${e.isPublic?`checked`:``} onchange="window.toggleTripPrivacy('${e.id}', this.checked)">
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div style="width: 1px; height: 30px; background: var(--glass-border);"></div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-small" onclick="window.restoreTrip('${e.id}')" style="background: var(--accent-blue); padding: 8px 16px; font-weight: 700;">Restore</button>
                                <button class="btn btn-small" onclick="window.deleteArchivedTrip('${e.id}')" style="background: rgba(255,59,48,0.1); color: #ff3b30; border: 1px solid rgba(255,59,48,0.3);" title="Delete Permanently">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join(``):`
                    <div class="card glass" style="grid-column: 1 / -1; text-align: center; padding: 60px;">
                        <div style="font-size: 4rem; margin-bottom: 20px;">📚</div>
                        <h2>No completed trips</h2>
                        <p style="color: var(--text-secondary);">Your travel history will appear here once you complete a trip.</p>
                    </div>
                `}
            </div>
        </div>
    `,t}function re(t){let n=e.archivedTrips.find(e=>e.id===t),r=document.createElement(`div`);if(!n)return r.innerHTML=`<p style="padding: 40px; text-align: center;">Trip not found.</p>`,r;let i=0;(n.expenses||[]).filter(e=>!e.isSettlement).forEach(e=>i+=parseFloat(e.euroValue||0));let a=null;if(n.tripDays){for(let e of n.tripDays)if(e.photos&&e.photos.length>0){a=e.photos[0];break}}return r.innerHTML=`
        <div class="trip-banner" style="${a?`background: linear-gradient(rgba(0,45,91,0.6), rgba(0,45,91,0.8)), url(${a}) center/cover no-repeat; border: none;`:`background: rgba(255,255,255,0.9); border: 1.5px solid var(--accent-blue);`}">
            <div style="font-size: 0.9rem; color: ${a?`rgba(255,255,255,0.7)`:`rgba(0, 45, 91, 0.5)`}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.25em; margin-bottom: 12px;">Memories of</div>
            <h1 class="trip-banner-title" style="font-size: 4rem; margin: 0; letter-spacing: -0.06em; color: ${a?`#ffffff`:`var(--accent-blue)`}; font-weight: 800; line-height: 0.95;">${n.name}</h1>
            <div style="display: flex; align-items: center; gap: 32px; margin-top: 20px; color: ${a?`rgba(255,255,255,0.9)`:`#1a3a5f`}; font-weight: 700;">
                <span style="display: flex; align-items: center; gap: 8px;">${n.country}</span>
                
                <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.08); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(20px); box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.1);">
                    <span id="publicLabel-${n.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${n.isPublic?`#34c759`:`#a1a1aa`}; text-shadow: ${n.isPublic?`0 0 12px rgba(52, 199, 89, 0.6)`:`none`};">${n.isPublic?`Public`:`Not public`}</span>
                    <label class="switch" style="transform: scale(0.75);">
                        <input type="checkbox" ${n.isPublic?`checked`:``} onchange="window.toggleTripPrivacy('${n.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>

                <span style="display: flex; align-items: center; gap: 8px;">${n.tripDays?.length||0} Days</span>
                <span style="display: flex; align-items: center; gap: 8px;">€${i.toFixed(0)} spent</span>
            </div>
            <div style="position: absolute; right: 40px; bottom: 40px; display: flex; gap: 12px;">
                <button class="btn" style="background: #002d5b; color: #ffffff; padding: 12px 24px; border-radius: 16px; font-weight: 800;" onclick="window.restoreTrip('${n.id}')">Restore Trip</button>
                <button class="btn" style="background: rgba(0,0,0,0.05); color: #002d5b; padding: 12px 24px; border-radius: 16px; font-weight: 800; border: 1px solid rgba(0,0,0,0.1);" onclick="window.navigate('collections')">Back</button>
            </div>
        </div>

        <div class="day-blocks-grid">
            ${(n.tripDays||[]).sort((e,t)=>e.dayNumber-t.dayNumber).map(e=>{let t=e.photos||[];return e.tickets,`
                    <div class="day-block" style="${t.length>0?`background: linear-gradient(rgba(0,45,91,0.7), rgba(0,45,91,0.85)), url(${t[0]}) center/cover no-repeat; border: none;`:``}">
                        <div class="day-block-header">
                            <span class="day-block-number" style="color: ${t.length>0?`#4da3ff`:`#007aff`};">Day ${e.dayNumber}</span>
                        </div>
                        <h3 class="day-block-name" style="color: ${t.length>0?`#ffffff`:`var(--accent-blue)`}; font-size: 1.6rem; font-weight: 800;">${e.name||`Day ${e.dayNumber}`}</h3>
                    </div>
                `}).join(``)}
        </div>
    `,r}window.viewArchivedDetails=e=>{let t=document.getElementById(`app-container`);t.innerHTML=``,t.appendChild(re(e))},window.toggleTripPrivacy=async(t,n)=>{let r=e.archivedTrips.find(e=>e.id===t)||e.trips.find(e=>e.id===t);if(!r)return;r.isPublic=n,a(`state:changed`);let i=document.getElementById(`publicLabel-${t}`);if(i&&(i.textContent=n?`Public`:`Not public`,i.style.color=n?`#34c759`:`rgba(0,0,0,0.3)`,i.style.textShadow=n?`0 0 12px rgba(52, 199, 89, 0.6)`:`none`),e.user)try{await fetch(`/api/trips/privacy`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id,trip_id:t,is_public:n})})}catch{}},window.restoreTrip=t=>{let n=e.archivedTrips.find(e=>e.id===t);n&&m({title:`Restore Trip?`,message:`This will move the trip back to your active list.`,confirmText:`Restore`,onConfirm:()=>{n.isArchived=!1,n.expenses&&(e.expenses=[...e.expenses,...n.expenses],delete n.expenses),n.tripDays&&(e.tripDays=[...e.tripDays,...n.tripDays],delete n.tripDays),e.trips.push(n),e.archivedTrips=e.archivedTrips.filter(e=>e.id!==t),e.activeTripId=t,a(`state:changed`),R(`home`)}})},window.deleteArchivedTrip=t=>{m({title:`Delete Permanently?`,message:`This trip and all its memories will be gone forever.`,confirmText:`Delete`,onConfirm:async()=>{if(e.archivedTrips=e.archivedTrips.filter(e=>e.id!==t),a(`state:changed`),e.user)try{await fetch(`/api/trips/delete`,{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id,trip_id:t})})}catch{}R(`collections`)}})};var j=null,M=[];function ie(){let t=document.createElement(`div`),n=e.trips.find(t=>t.id===e.activeTripId);if(!n)return t.innerHTML=`
            <div style="padding:32px 0 24px;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;">
                <h1 style="margin:0 0 6px;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Your AI-powered travel planner</p>
            </div>
            <div style="position: relative; width: 100%; height: calc(100vh - 200px); min-height: 480px; border-radius: 20px; overflow: hidden; box-shadow: 0 40px 100px rgba(0,0,0,0.15);">
                <div id="emptyMap" style="width:100%; height:100%;"></div>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);z-index:1000;">
                    <div class="premium-glass-card" style="text-align:center;color:#002d5b;padding:48px;max-width:500px;background:rgba(255,255,255,0.6);border-radius:36px;border:1px solid rgba(255,255,255,0.8);box-shadow: 0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s cubic-bezier(0.16, 1, 0.3, 1);" onmouseover="this.style.transform='translateY(-5px)'; this.style.boxShadow='0 40px 80px rgba(0,0,0,0.15), 0 15px 30px rgba(0,113,227,0.15)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 30px 60px rgba(0,0,0,0.1), 0 10px 20px rgba(0,0,0,0.05)';">
                        <div style="font-size:4.5rem;margin-bottom:24px;filter:drop-shadow(0 10px 15px rgba(0,0,0,0.1));">🧭</div>
                        <h2 style="font-size:2rem;font-weight:800;margin-bottom:16px;letter-spacing:-0.03em;">Ready for a new adventure?</h2>
                        <p style="font-size:1.15rem;opacity:0.85;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;margin-bottom:32px;">To generate a personalized AI itinerary, you'll need to create a trip first.</p>
                        <button id="aiStartJourneyBtn" class="btn btn-liquid-glass" style="padding:16px 36px;font-size:1.15rem;font-weight:800;background:var(--accent-blue);color:white;border:none;box-shadow:0 15px 30px rgba(0,113,227,0.3); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 20px 40px rgba(0,113,227,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 15px 30px rgba(0,113,227,0.3)';">+ Start Your Journey</button>
                    </div>
                </div>
            </div>`,setTimeout(()=>{t.querySelector(`#aiStartJourneyBtn`)?.addEventListener(`click`,()=>window.openNewTripModal()),typeof google<`u`&&google.maps&&new google.maps.Map(document.getElementById(`emptyMap`),{center:{lat:20,lng:0},zoom:2,minZoom:2,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]})},100),t;let r=n.country||``,i=e.expenses.filter(t=>t.tripId===e.activeTripId&&t.date).sort((e,t)=>e.date.localeCompare(t.date)).map(e=>e.date),o=i[0]||``,s=i[i.length-1]||``,c=n.aiPlan||null,l=n.aiContext||``,u=n.aiNumDays||1,d=`font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;return t.innerHTML=`
        <div style="${d}">
            <!-- Header -->
            <div style="padding:32px 0 24px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <h1 style="margin:0;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Planning your trip to <strong>${r}</strong></p>
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
                                <input id="aiDateFrom" type="date" class="glass-input" value="${o}" style="width:100%; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">To</label>
                                <input id="aiDateTo" type="date" class="glass-input" value="${s}" style="width:100%; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>

                    <div class="card glass" style="padding:20px;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.05em;">📝 Requirements</h2>
                        <textarea id="aiExtraContext" class="glass-input" rows="3" style="width:100%; resize:none; font-size:0.9rem; box-sizing: border-box;" placeholder="e.g. Vegetarian friendly, no walking more than 2km...">${l}</textarea>
                    </div>
                    <!-- Generate -->
                    <button id="generateBtn" class="btn ai-generate-btn" style="width:100%; padding: 16px; border-radius: 16px; font-weight: 800; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; border: none; cursor: pointer;">✦ Generate My Itinerary</button>
                </div>

                <!-- Right: Google Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiGoogleMap" style="width:100%;height:100%;"></div>
                        <div id="aiZoomBadge" style="position:absolute;bottom:14px;left:14px;background:var(--glass-bg);backdrop-filter:blur(12px);padding:6px 14px;border-radius:980px;border:1px solid var(--glass-border);font-size:0.82rem;font-weight:600;z-index:1000;color:#001a33;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='var(--glass-bg)'">
                            <span>📍</span> <span>${r}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput" style="margin-bottom: 60px;"></div>
        </div>`,setTimeout(()=>{let i=t=>{if(!j)return;let r=n.id+`_ai`;if(e.mapViews&&e.mapViews[r]){let t=e.mapViews[r];j.setCenter({lat:t.lat,lng:t.lng}),j.setZoom(t.zoom);return}let i=t.replace(/\(USA\)/g,``).trim();i.includes(` - `)&&(i=i.split(` - `)[1]+`, USA`),new google.maps.Geocoder().geocode({address:i},(e,t)=>{t===`OK`&&e[0]&&j.fitBounds(e[0].geometry.viewport)})};if(typeof google<`u`&&google.maps){let o=document.getElementById(`aiGoogleMap`);o&&(j=new google.maps.Map(o,{center:{lat:20,lng:0},zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]}),i(r),j.addListener(`idle`,()=>{let t=n.id+`_ai`;e.mapViews||={};let r=j.getCenter();e.mapViews[t]={lat:r.lat(),lng:r.lng(),zoom:j.getZoom()},a(`state:changed`)}));let s=t.querySelector(`#aiZoomBadge`);s&&(s.onclick=()=>{let t=n.id+`_ai`;e.mapViews&&e.mapViews[t]&&delete e.mapViews[t],i(r)})}let o=c,s=(r,i,o)=>{let s=t.querySelector(`#itineraryOutput`);if(!r||!r.length){s.innerHTML=``;return}s.innerHTML=`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;color:white;${d}">${i}-Day ${o} Itinerary</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">Generated by Gemini AI</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">✦ AI-Generated</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>
                <div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">Accept Plan & Add to Trip</button></div>`;let c=s.querySelector(`#itineraryDays`),l=[];if(r.forEach((e,t)=>{let n=document.createElement(`div`);n.className=`card glass`,n.style.cssText=`border-radius:18px;overflow:hidden;transition:box-shadow 0.3s,border-color 0.3s;${d}`,n.innerHTML=`
                    <div style="display:flex;align-items:stretch;">
                        <div style="width:72px;min-width:72px;background:linear-gradient(180deg,var(--accent-blue),#9b59b6);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 0;gap:4px;">
                            <span style="color:rgba(255,255,255,0.7);font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Day</span>
                            <span style="color:white;font-size:2rem;font-weight:800;line-height:1;">${e.day}</span>
                        </div>
                        <div style="flex:1;padding:24px 28px;">
                            <div style="margin-bottom:20px;">
                                <h3 style="margin:0 0 4px;font-size:1.2rem;font-weight:700;letter-spacing:-0.02em;color:white;">${e.title||`Day `+e.day}</h3>
                                <span style="font-size:0.8rem;color:var(--text-secondary);">${e.date||``}</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:${e.tip?`20px`:`0`};">
                                <div style="padding:16px;background:rgba(0,113,227,0.05);border-radius:12px;border:1px solid rgba(0,113,227,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);margin-bottom:8px;">🌅 Morning</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${e.morning?.activity||``}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${e.morning?.description||``}</div>
                                </div>
                                <div style="padding:16px;background:rgba(255,149,0,0.05);border-radius:12px;border:1px solid rgba(255,149,0,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ff9500;margin-bottom:8px;">☀️ Afternoon</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${e.afternoon?.activity||``}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${e.afternoon?.description||``}</div>
                                </div>
                                <div style="padding:16px;background:rgba(155,89,182,0.05);border-radius:12px;border:1px solid rgba(155,89,182,0.1);">
                                    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9b59b6;margin-bottom:8px;">🌙 Evening</div>
                                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px;color:white;">${e.evening?.activity||``}</div>
                                    <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;">${e.evening?.description||``}</div>
                                </div>
                            </div>
                            ${e.tip?`<div style="padding:12px 16px;background:rgba(0,113,227,0.05);border-left:3px solid var(--accent-blue);border-radius:0 10px 10px 0;"><span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);">💡 Pro Tip</span><p style="margin:5px 0 0;font-size:0.85rem;color:var(--text-secondary);">${e.tip}</p></div>`:``}
                        </div>
                    </div>`,c.appendChild(n),l.push(n)}),j){M.forEach(e=>e.setMap(null)),M=[];let e=new google.maps.LatLngBounds,t=new google.maps.Geocoder,n=(n,r)=>{let i=n.mainLocation||n.title||o;!n.mainLocation&&n.title&&(i=n.title.replace(/Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi,``).trim()),t.geocode({address:i+`, `+o},(t,i)=>{if(i===`OK`&&t[0]){let i=t[0].geometry.location;n.lat=i.lat(),n.lon=i.lng();let a=new google.maps.Marker({position:i,map:j,label:{text:String(n.day),color:`white`,fontWeight:`800`},icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:`#0071e3`,fillOpacity:1,strokeWeight:2,strokeColor:`white`}});a.addListener(`click`,()=>{l.forEach(e=>{e.style.boxShadow=``,e.style.borderColor=``});let e=l[r];e&&(e.style.boxShadow=`0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)`,e.style.borderColor=`var(--accent-blue)`,e.scrollIntoView({behavior:`smooth`,block:`center`}))}),M.push(a),e.extend(i),M.length>0&&j.fitBounds(e)}})};r.forEach((e,t)=>setTimeout(()=>n(e,t),t*500))}document.getElementById(`acceptPlanBtn`).onclick=()=>{if(!r)return;r.forEach((t,r)=>{let i=t.date||new Date().toISOString().split(`T`)[0],a=`day_`+Date.now()+`_`+r;e.tripDays.push({id:a,tripId:n.id,date:i,name:t.title||`Day ${r+1}`,dayNumber:r+1,lat:t.lat,lon:t.lon,photos:[],tickets:[],notes:``,plan:{morning:t.morning?`${t.morning.activity}: ${t.morning.description}`:``,afternoon:t.afternoon?`${t.afternoon.activity}: ${t.afternoon.description}`:``,evening:t.evening?`${t.evening.activity}: ${t.evening.description}`:``}})}),a(`state:changed`);let t=document.getElementById(`acceptPlanBtn`);t.innerHTML=`✓ Plan Accepted! (View in Home)`,t.style.background=`#34c759`,t.disabled=!0}};o&&s(o,u,r);let l=t.querySelector(`#aiExtraContext`);l&&(l.oninput=e=>{n.aiContext=e.target.value,a(`state:changed`)}),t.querySelector(`#generateBtn`).addEventListener(`click`,async()=>{let e=t.querySelector(`#itineraryOutput`),i=t.querySelector(`#aiDateFrom`).value,c=t.querySelector(`#aiDateTo`).value,l=document.getElementById(`aiExtraContext`).value;if(!i||!c){alert(`Please select your travel dates.`);return}let u=new Date(i),d=new Date(c),f=Math.max(1,Math.round((d-u)/864e5)+1);n.aiContext=l,n.aiNumDays=f,a(`state:changed`),e.innerHTML=`<div style="text-align:center;padding:60px;"><div class="spinner-ring" style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div><div style="color:white;font-weight:600;">Consulting Gemini AI...</div></div>`,e.scrollIntoView({behavior:`smooth`});try{let t=await(await fetch(`/api/generate_itinerary`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({destination:r,numDays:f,dateFrom:i,dateTo:c,context:l})})).json();if(t.error)throw Error(t.error);o=t.itinerary,n.aiPlan=o,a(`state:changed`),s(o,f,r),e.scrollIntoView({behavior:`smooth`})}catch(t){e.innerHTML=`<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p>${t.message}</p></div>`}})},0),t}function N(){let t=document.createElement(`div`);if(!e.user)return t.innerHTML=`
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
        `,t;let n=e.activeTripId||(e.trips.length>0?e.trips[0].id:null);function r(t){let n=e.trips.find(e=>e.id===t),r=`
            <div style="margin-bottom: 32px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                    <h2 style="font-size: 1.2rem; letter-spacing: -0.02em; margin: 0;">Select a Trip</h2>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">${e.trips.length} Adventures</span>
                </div>
                <div style="display: flex; gap: 16px; overflow-x: auto; padding-bottom: 12px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;">
                    ${e.trips.map(n=>{let r=e.expenses.filter(e=>e.tripId===n.id&&e.isSettlement).reduce((e,t)=>e+(parseFloat(t.euroValue)||0),0).toFixed(0),i=n.id===t;return`
                            <div class="card glass ${i?`card-glow-blue`:``}" 
                                 onclick="window.switchSettlementTrip('${n.id}')"
                                 style="min-width: 200px; padding: 20px; cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); border: 2px solid ${i?`var(--accent-blue)`:`transparent`}; transform: ${i?`scale(1.02)`:`scale(1)`}; opacity: ${i?`1`:`0.8`};">
                                <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.05em;">Adventure</div>
                                <div style="font-weight: 700; font-size: 1.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 12px;">${n.name}</div>
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div style="font-size: 1.3rem; font-weight: 800; color: ${i?`var(--accent-blue)`:`white`};">€${r}</div>
                                    ${i?`<div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-blue);"></div>`:``}
                                </div>
                            </div>
                        `}).join(``)}
                </div>
            </div>
        `;if(!n)return`
                <div class="ai-page-header">
                    <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                    <p>Calculate who owes what across your adventures.</p>
                </div>
                <div class="card glass card-glow-teal" style="text-align: center; padding: 60px; margin-top: 24px;">
                    <div style="font-size: 4rem; margin-bottom: 20px;">⚖️</div>
                    <h2>No trips found</h2>
                    <p style="color: var(--text-secondary);">Create a trip and add expenses to see settlement calculations.</p>
                </div>
            `;let i=e.expenses.filter(e=>e.tripId===t),a={};e.groups.forEach(e=>a[e]=0),i.forEach(t=>{let n=parseFloat(t.euroValue||t.value||0),r=t.who;if(a[r]!==void 0&&(a[r]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[e,r]of Object.entries(t.splits))a[e]!==void 0&&(a[e]-=r/100*n);else{let t=n/Math.max(e.groups.length,1);e.groups.forEach(e=>a[e]-=t)}});let o=[],s=[],c=[];for(let[e,t]of Object.entries(a))t>.01?s.push({person:e,amount:t}):t<-.01&&c.push({person:e,amount:Math.abs(t)});let l=s.map(e=>({...e})),u=c.map(e=>({...e}));l.sort((e,t)=>t.amount-e.amount),u.sort((e,t)=>t.amount-e.amount);let d=0,f=0;for(;d<u.length&&f<l.length;){let e=Math.min(u[d].amount,l[f].amount);o.push({from:u[d].person,to:l[f].person,amount:e}),u[d].amount-=e,l[f].amount-=e,u[d].amount<.01&&d++,l[f].amount<.01&&f++}let p={};e.groups.forEach(e=>p[e]=0);let m=(e.archivedTrips||[]).flatMap(e=>e.expenses||[]);[...e.expenses,...m].forEach(t=>{let n=parseFloat(t.euroValue||t.euro_value||t.value||0),r=t.who;if(p[r]!==void 0&&(p[r]+=n),t.splits&&Object.keys(t.splits).length>0)for(let[e,r]of Object.entries(t.splits))p[e]!==void 0&&(p[e]-=r/100*n);else{let t=n/Math.max(e.groups.length,1);e.groups.forEach(e=>p[e]-=t)}});let h=Math.max(...Object.values(p).map(Math.abs),1);return`
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                <p>Calculate who owes what and settle up fairly.</p>
            </div>

            ${r}

            <div class="card glass" style="margin-bottom: 24px; padding: 20px; border-radius: 20px; border-left: 4px solid var(--accent-blue); background: rgba(0, 113, 227, 0.03);">
                <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="const el = document.getElementById('globalBalancesContainer'); el.style.display = el.style.display === 'none' ? 'block' : 'none';">
                    <h2 class="card-title" style="margin: 0; font-size: 1.1rem; color: var(--text-primary);">🌍 Global Net Balances</h2>
                    <span style="font-size: 0.8rem; color: var(--accent-blue); font-weight: 700;">Show / Hide</span>
                </div>
                <div id="globalBalancesContainer" style="display: none; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${(()=>{let e=Object.values(p).map(Math.abs).some(e=>e>.01);return Object.entries(p).map(([t,n])=>{let r=e?Math.abs(n)/h*100:0;return`
                                    <div style="display: grid; grid-template-columns: 100px ${e?`1fr`:``} 80px; align-items: center; gap: 16px;">
                                        <div style="font-weight: 700; font-size: 0.9rem;">${t}</div>
                                        ${e?`
                                            <div style="height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; position: relative;">
                                                <div style="position: absolute; height: 100%; width: ${r}%; background: ${n>=0?`linear-gradient(90deg, #34c759, #4cd964)`:`linear-gradient(90deg, #ff3b30, #ff453a)`}; border-radius: 6px; transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);"></div>
                                            </div>
                                        `:``}
                                        <div style="text-align: right; font-weight: 800; font-size: 1rem; color: ${n>.01?`#34c759`:n<-.01?`#ff3b30`:`var(--text-secondary)`};">
                                            ${n>.01?`+`:``}${n.toFixed(0)}€
                                        </div>
                                    </div>
                                `}).join(``)})()}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 24px;">
                <div style="display: inline-block; padding: 8px 16px; background: rgba(0, 113, 227, 0.1); border-radius: 100px; border: 1px solid var(--accent-blue); font-size: 0.8rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 12px;">
                    Active View: ${n.name}
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
                            ${Object.entries(a).map(([e,t])=>`
                                <tr>
                                    <td style="font-weight: 500;">${e}</td>
                                    <td style="text-align: right; color: ${t>=0?`#34c759`:`#ff3b30`}; font-weight: 700;">
                                        ${t>=0?`+`:``}${t.toFixed(2)}€
                                    </td>
                                </tr>
                            `).join(``)}
                        </tbody>
                    </table>
                </div>

                <div class="card glass card-glow-blue">
                    <h2 class="card-title">Suggested Payments</h2>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${o.length>0?o.map(e=>`
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0, 113, 227, 0.05); border-radius: 12px; border: 1px solid rgba(0, 113, 227, 0.1);">
                                <div style="display: flex; align-items: center; gap: 16px;">
                                    <div>
                                        <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">${e.from} pays</span>
                                        <div style="font-weight: 700; font-size: 1.1rem;">${e.to}</div>
                                    </div>
                                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">€${e.amount.toFixed(2)}</div>
                                </div>
                                <button class="btn btn-small" style="background: var(--accent-blue); padding: 8px 16px; border-radius: 12px;" onclick="window.settleDebt('${t}', '${e.from}', '${e.to}', ${e.amount})">Settle</button>
                            </div>
                        `).join(``):`<p style="color: var(--text-secondary); text-align: center; padding: 20px; font-weight: 600;">All settled for this trip! 🥂</p>`}
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 16px; margin-top: 32px; justify-content: center; flex-wrap: wrap;">
                <button class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.2); padding: 16px 32px; border-radius: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px;" onclick="window.openManualSettleModal('${t}')">
                    <span>➕</span> Manual Settlement
                </button>
                <button class="btn" style="background: rgba(255,255,255,0.1); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.2); padding: 16px 32px; border-radius: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px;" onclick="window.openPastSettlementsModal('${t}')">
                    <span>📜</span> Past Settlements
                </button>
            </div>
        `}return window.switchSettlementTrip=e=>{n=e,t.innerHTML=r(e)},window.settleDebt=(n,i,o,s)=>{let c={id:h(),tripId:n,label:`Settlement: ${i} → ${o}`,value:s,euroValue:s,currency:`EUR`,who:i,date:new Date().toISOString().split(`T`)[0],splits:{[o]:100},isSettlement:!0};e.expenses.push(c),a(`state:changed`),t.innerHTML=r(n)},window.openManualSettleModal=t=>{let n=document.createElement(`div`);n.className=`modal-overlay`,n.style.display=`flex`,n.style.backdropFilter=`blur(25px)`;let r=e.groups.map(e=>`<option value="${e}">${e}</option>`).join(``);n.innerHTML=`
            <div class="card glass" style="width: 400px; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <h2 style="margin: 0 0 20px; font-size: 1.5rem; text-align: center; color: white;">Manual Settlement</h2>
                
                <form id="manualSettleForm" style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">From</label>
                        <select id="manualSettleFrom" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${r}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">To</label>
                        <select id="manualSettleTo" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${r}</select>
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
        `,document.body.appendChild(n),n.querySelector(`#cancelManualSettleBtn`).onclick=()=>n.remove(),n.querySelector(`#manualSettleForm`).onsubmit=e=>{e.preventDefault();let r=n.querySelector(`#manualSettleFrom`).value,i=n.querySelector(`#manualSettleTo`).value,a=parseFloat(n.querySelector(`#manualSettleAmount`).value);if(r===i){alert(`Sender and receiver must be different.`);return}window.settleDebt(t,r,i,a),n.remove()}},window.openPastSettlementsModal=t=>{let n=document.createElement(`div`);n.className=`modal-overlay`,n.style.display=`flex`,n.style.backdropFilter=`blur(25px)`;let r=e.expenses.filter(e=>e.tripId===t&&e.isSettlement).sort((e,t)=>new Date(t.date)-new Date(e.date)),i=r.length===0?`<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No past settlements recorded for this trip.</p>`:r.map(e=>`
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 12px;">
                    <div>
                        <div style="font-weight: 700; font-size: 1.1rem; color: white;">${e.label}</div>
                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-top: 4px;">${e.date}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="font-size: 1.2rem; font-weight: 800; color: #34c759;">€${e.euroValue.toFixed(2)}</div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-small" style="background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 8px; color: white; border: 1px solid rgba(255,255,255,0.2);" onclick="window.openEditSettlementModal('${e.id}'); document.getElementById('pastSettlementsModal').remove();">Edit</button>
                            <button class="btn btn-small" style="background: rgba(255,59,48,0.1); padding: 8px 12px; border-radius: 8px; color: #ff3b30; border: 1px solid rgba(255,59,48,0.2);" onclick="window.deleteSettlement('${e.id}', '${t}'); document.getElementById('pastSettlementsModal').remove();">Unsettle</button>
                        </div>
                    </div>
                </div>
            `).join(``);n.id=`pastSettlementsModal`,n.innerHTML=`
            <div class="card glass" style="width: 500px; max-height: 80vh; overflow-y: auto; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; font-size: 1.5rem; color: white;">Past Settlements</h2>
                    <button class="btn btn-small" id="closePastSettleBtn" style="background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); color: white;">Close</button>
                </div>
                
                <div style="display: flex; flex-direction: column;">
                    ${i}
                </div>
            </div>
        `,document.body.appendChild(n),n.querySelector(`#closePastSettleBtn`).onclick=()=>n.remove()},window.deleteSettlement=(n,i)=>{m({title:`Unsettle Payment?`,message:`This will remove the settlement and revert the balances. Are you sure?`,confirmText:`Unsettle`,onConfirm:()=>{e.expenses=e.expenses.filter(e=>e.id!==n),a(`state:changed`),t.innerHTML=r(i)}})},window.openEditSettlementModal=i=>{let o=e.expenses.find(e=>e.id===i);if(!o)return;let s=document.createElement(`div`);s.className=`modal-overlay`,s.style.display=`flex`,s.style.backdropFilter=`blur(25px)`;let c=e.groups.map(e=>`<option value="${e}" ${o.who===e?`selected`:``}>${e}</option>`).join(``),l=Object.keys(o.splits||{})[0];s.innerHTML=`
            <div class="card glass" style="width: 400px; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <h2 style="margin: 0 0 20px; font-size: 1.5rem; text-align: center; color: white;">Edit Settlement</h2>
                
                <form id="editSettlementForm" style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">From</label>
                        <select id="editSettleFrom" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${c}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">To</label>
                        <select id="editSettleTo" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${e.groups.map(e=>`<option value="${e}" ${l===e?`selected`:``}>${e}</option>`).join(``)}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">Amount (€)</label>
                        <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${o.euroValue}" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);" required>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">Date</label>
                        <input type="date" id="editSettleDate" value="${o.date}" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);" required>
                    </div>

                    <div style="margin-top: 12px; display: flex; gap: 10px;">
                        <button type="submit" class="btn" style="flex: 1; background: var(--accent-blue); padding: 14px; border-radius: 12px;">Update</button>
                        <button type="button" id="cancelEditSettleBtn" class="btn" style="padding: 14px; background: rgba(255,255,255,0.1); border-radius: 12px; border: 1px solid rgba(255,255,255,0.2);">Cancel</button>
                    </div>
                </form>
            </div>
        `,document.body.appendChild(s),s.querySelector(`#cancelEditSettleBtn`).onclick=()=>s.remove(),s.querySelector(`#editSettlementForm`).onsubmit=e=>{e.preventDefault();let i=s.querySelector(`#editSettleFrom`).value,c=s.querySelector(`#editSettleTo`).value,l=parseFloat(s.querySelector(`#editSettleAmount`).value),u=s.querySelector(`#editSettleDate`).value;if(i===c){alert(`Sender and receiver must be different.`);return}o.who=i,o.splits={[c]:100},o.value=l,o.euroValue=l,o.date=u,o.label=`Settlement: ${i} → ${c}`,a(`state:changed`),s.remove(),t.innerHTML=r(n)}},t.innerHTML=r(n),t}function ae(){let t=document.createElement(`div`),n=async()=>{if(e.user)try{let n=await(await fetch(`/api/friends/list?user_id=${e.user.id}`)).json(),r=await(await fetch(`/api/friends/pending?user_id=${e.user.id}`)).json(),i=t.querySelector(`#friendsList`),a=t.querySelector(`#pendingList`);i&&(n.length===0?i.innerHTML=`<div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No friends added yet.</div>`:i.innerHTML=n.map(e=>`
                        <div class="friend-row" data-user-id="${e.id}" style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: background 0.2s;" onmouseenter="this.style.background='rgba(255,255,255,0.1)'" onmouseleave="this.style.background='rgba(255,255,255,0.05)'">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <img src="${e.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.9rem;">${e.name}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${e.email}</div>
                                </div>
                            </div>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </div>
                    `).join(``)),a&&(r.length===0?a.innerHTML=`<div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No pending requests.</div>`:a.innerHTML=r.map(e=>`
                        <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(255,159,10,0.1); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(255,159,10,0.2);">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <img src="${e.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                                <div>
                                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">${e.name}</div>
                                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${e.email}</div>
                                </div>
                            </div>
                            <button class="btn btn-small accept-friend-btn" data-user-id="${e.id}" style="padding: 6px 12px; font-size: 0.75rem;">Accept</button>
                        </div>
                    `).join(``))}catch(e){console.error(`Error loading friends:`,e)}},r=async()=>{let n=t.querySelector(`#friendSearchInput`).value.trim(),r=t.querySelector(`#searchResults`);if(n){r.innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">Searching...</p>`;try{let t=(await(await fetch(`/api/friends/search?q=${encodeURIComponent(n)}`)).json()).filter(t=>t.id!==e.user.id);t.length===0?r.innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">No user found. Ask them to login first!</p>`:r.innerHTML=t.map(e=>`
                    <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,122,255,0.05); padding: 12px 16px; border-radius: 16px; margin-bottom: 8px; border: 1px solid rgba(0,122,255,0.1);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <img src="${e.picture}" style="width: 32px; height: 32px; border-radius: 50%;">
                            <div>
                                <div style="font-weight: 600; font-size: 0.9rem;">${e.name}</div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">${e.email}</div>
                            </div>
                        </div>
                        <button class="btn btn-small send-friend-btn" data-user-id="${e.id}" style="padding: 6px 12px; font-size: 0.75rem;">Send Request</button>
                    </div>
                `).join(``)}catch{r.innerHTML=`<p style="color:red;">Error searching.</p>`}}},i=async r=>{if(!e.user){alert(`Please login first`);return}if(r===e.user.id){window.showToast?.(`You can't send a friend request to yourself!`);return}try{let i=await(await fetch(`/api/friends/add`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id,friend_id:r})})).json();i.status===`success`?(t.querySelector(`#searchResults`).innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:#34c759;">Request sent!</p>`,t.querySelector(`#friendSearchInput`).value=``,n()):i.status===`error`&&alert(i.message)}catch{alert(`Failed to send request`)}},a=async t=>{if(e.user)try{let r=await(await fetch(`/api/friends/accept`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id,friend_id:t})})).json();r.status===`success`?(window.showToast?.(`Friend request accepted!`),n()):alert(r.message||`Failed to accept request`)}catch(e){console.error(`Error accepting friend:`,e)}};return t.innerHTML=`
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Friends</h1>
            <p>Connect with other travelers and share your itineraries</p>
        </div>
        <div class="grid-2" style="margin-top: 24px;">
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <div class="card glass card-glow-blue">
                    <h3 style="margin-bottom: 16px; font-weight: 700;">Find Friends</h3>
                    <div style="display: flex; gap: 8px; margin-bottom: 20px;">
                        <input type="text" id="friendSearchInput" class="glass-input" placeholder="Search by email..." style="flex: 1;">
                        <button class="btn btn-small" id="friendSearchBtn">Search</button>
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
    `,t.querySelector(`#friendSearchBtn`)?.addEventListener(`click`,r),t.querySelector(`#friendSearchInput`)?.addEventListener(`keyup`,e=>{e.key===`Enter`&&r()}),t.addEventListener(`click`,e=>{let t=e.target.closest(`.accept-friend-btn`);if(t){a(t.dataset.userId);return}let n=e.target.closest(`.send-friend-btn`);if(n){i(n.dataset.userId);return}let r=e.target.closest(`.friend-row`);if(r){R(`profile`,{userId:r.dataset.userId});return}}),setTimeout(n,0),t}var P=async()=>{try{try{await z()}catch(e){console.error(`Final sync before logout failed:`,e)}await fetch(`/api/logout`,{method:`POST`}),e.user=null,e.activeTripId=null,e.trips=[],e.archivedTrips=[],e.expenses=[],e.tripDays=[],e.groups=[],e.budgets=[],e.activities=[],e.photos=[],e.notifications=[],e.savedFormats=[],e.profilePhoto=null,e.draftExpense={who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`,euroValue:``},a(`state:changed`),F(),R(`profile`)}catch{}};window.logout=P;function oe(t=null){let n=document.createElement(`div`),r=!t||e.user&&t===e.user.id;if(!e.user&&r){let t=e.hasLoggedInBefore;return n.innerHTML=`
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #007aff, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Log In</h1>
                <p>${t?`Sign in to your account to securely save and sync your trips across all your devices.`:`Sign in with Google to start syncing your trips and travel memories across all your devices.`}</p>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; min-height: 50vh;">
                <div class="card glass" style="padding: 50px; text-align: center; border-radius: 32px; max-width: 400px; width: 100%;">
                    <h2 style="margin-bottom: 30px; font-size: 1.5rem; color: var(--accent-blue);">${t?`Welcome back`:`Create your account with Google`}</h2>
                    <div id="profileLoginBtnContainer" style="display: flex; justify-content: center; min-height: 40px;"></div>
                </div>
            </div>
        `,setTimeout(()=>{window.google&&window.google.accounts&&window.globalGoogleClientId&&window.google.accounts.id.renderButton(n.querySelector(`#profileLoginBtnContainer`),{theme:`outline`,size:`large`,width:280})},300),n}let i=(t,i)=>{let o=[...new Set((i||[]).map(e=>e.country).filter(Boolean))],s=t.picture;n.innerHTML=`
            <div style="max-width: 800px; margin: 0 auto; padding-bottom: 60px;">
                ${r?``:`
                    <button class="btn btn-small" onclick="window.navigate('friends')" style="margin-bottom: 20px; background: rgba(0,0,0,0.05); color: var(--text-primary); border: 1px solid var(--glass-border); padding: 8px 16px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Back to Friends
                    </button>
                `}

                <!-- Instagram-style Profile Header -->
                <div style="display: flex; align-items: flex-start; gap: 40px; padding: 30px 20px; border-bottom: 1px solid var(--glass-border); margin-bottom: 30px;">
                    <!-- Avatar -->
                    <div style="position: relative; flex-shrink: 0; ${r?`cursor: pointer;`:``} border-radius: 50%;" id="${r?`profilePicWrapper`:``}" title="${r?`Change profile photo`:``}">
                        <div style="padding: 4px; background: linear-gradient(135deg, #4da3ff 0%, var(--accent-blue) 50%, #004080 100%); border-radius: 50%;">
                            <img id="profilePicDisplay" src="${s}" alt="Profile Picture" style="width: 140px; height: 140px; border-radius: 50%; border: 4px solid var(--bg-color); object-fit: cover; display: block; transition: opacity 0.2s; background: var(--bg-color);">
                        </div>
                        ${r?`
                        <div style="position: absolute; inset: 4px; border-radius: 50%; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;" id="profilePicOverlay">
                            <div style="background: rgba(0,0,0,0.6); border-radius: 50%; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
                            </div>
                        </div>
                        <input type="file" id="profilePhotoInput" accept="image/*" style="display:none;">
                        `:``}
                    </div>
                    
                    <!-- Info Section -->
                    <div style="flex: 1; padding-top: 10px;">
                        <!-- Name & Actions -->
                        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em;">${t.name}</h2>
                            ${r?`
                                <button id="profileLogoutBtn" style="background: transparent; color: var(--text-secondary); font-weight: 600; border: 1px solid var(--glass-border); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.1)'; this.style.color='#ff3b30'; this.style.borderColor='rgba(255,59,48,0.2)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)'; this.style.borderColor='var(--glass-border)';" onclick="window.logout()">Log Out</button>
                            `:``}
                        </div>
                        
                        <!-- Stats Row -->
                        <div style="display: flex; gap: 32px; margin-bottom: 24px;">
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${i.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">public trips</span>
                            </div>
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${o.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">countries</span>
                            </div>
                        </div>
                        
                        <!-- Bio & Status -->
                        <div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${t.email}</div>
                            
                            <!-- Inline Status -->
                            <div style="position: relative; display: inline-block; margin-bottom: 8px;">
                                ${r?`
                                    <select id="profileStatus" style="appearance: none; background: rgba(0, 113, 227, 0.08); color: var(--accent-blue); border: 1px solid rgba(0, 113, 227, 0.15); border-radius: 12px; padding: 2px 24px 2px 10px; font-size: 0.8rem; font-weight: 700; cursor: pointer; outline: none; transition: all 0.2s;">
                                        <option value="" disabled ${t.status?``:`selected`}>Set status...</option>
                                        <option value="Deliberating next trip" ${t.status===`Deliberating next trip`?`selected`:``}>🤔 Deliberating next trip</option>
                                        <option value="Preparing a trip right now" ${t.status===`Preparing a trip right now`?`selected`:``}>🎒 Preparing a trip right now</option>
                                        <option value="Exploring the world" ${t.status===`Exploring the world`?`selected`:``}>🌍 Exploring the world</option>
                                        <option value="Resting at home base" ${t.status===`Resting at home base`?`selected`:``}>🏠 Resting at home base</option>
                                        <option value="Hunting for flight deals" ${t.status===`Hunting for flight deals`?`selected`:``}>✈️ Hunting for flight deals</option>
                                    </select>
                                    <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--accent-blue); font-size: 0.6rem;">▼</div>
                                `:`
                                    <div style="background: rgba(0, 113, 227, 0.05); color: var(--accent-blue); border-radius: 12px; padding: 4px 12px; font-size: 0.8rem; font-weight: 700; display: inline-block;">
                                        ${t.status||`Active Traveler`}
                                    </div>
                                `}
                            </div>

                            <!-- Bio -->
                            ${r?`
                                <textarea id="profileBio" placeholder="Add a bio..." style="width: 100%; max-width: 500px; min-height: 40px; background: transparent; border: 1px solid transparent; border-radius: 8px; color: var(--text-primary); font-size: 0.95rem; font-family: inherit; line-height: 1.5; resize: none; outline: none; padding: 6px; margin-left: -6px; transition: all 0.2s;" onfocus="this.style.background='rgba(0,0,0,0.03)'; this.style.borderColor='var(--glass-border)';" onblur="this.style.background='transparent'; this.style.borderColor='transparent';">${t.bio||``}</textarea>
                                <div style="margin-top: 8px;">
                                    <button id="saveProfileBtn" class="btn btn-small" style="background: var(--text-primary); color: var(--bg-color); padding: 6px 16px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; opacity: 0; transition: opacity 0.3s; pointer-events: none;">Save Profile</button>
                                </div>
                            `:`
                                <p style="font-size: 0.95rem; color: var(--text-primary); line-height: 1.5; margin: 4px 0;">${t.bio||`No bio yet.`}</p>
                            `}
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: center; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-primary);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${r?`Your footprint`:`${t.name.split(` `)[0]}'s footprint`}
                    </div>
                </div>

                <!-- Footprint Section -->
                <div style="margin-top: 20px;">
                    <p style="color: var(--text-secondary); text-align: center; margin-top: 0; margin-bottom: 24px; font-size: 0.9rem;">
                        ${r?`Every country you've been to, lit up.`:`Explore where `+t.name.split(` `)[0]+` has been.`}
                    </p>
                    
                    <div class="card glass" style="padding: 0; overflow: hidden; border-radius: 20px; position: relative; z-index: 1; border: 1px solid var(--glass-border);">
                        <div id="legaciesMap" style="width: 100%; height: 450px;"></div>
                    </div>
                </div>
            </div>
        `,setTimeout(()=>{if(r){let t=n.querySelector(`#profileStatus`),r=n.querySelector(`#profileBio`),i=n.querySelector(`#saveProfileBtn`);t&&(t.onchange=()=>{i.style.opacity=`1`,i.style.pointerEvents=`auto`}),r&&(r.oninput=()=>{i.style.opacity=`1`,i.style.pointerEvents=`auto`}),i&&(i.onclick=async()=>{let n=t.value,o=r.value;try{(await fetch(`/api/profile/update`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id,bio:o,status:n})})).ok&&(e.user.bio=o,e.user.status=n,a(`state:changed`),i.style.opacity=`0`,i.style.pointerEvents=`none`,window.showToast?.(`Profile updated!`))}catch{}});let o=n.querySelector(`#profilePhotoInput`),s=n.querySelector(`#profilePicWrapper`),c=n.querySelector(`#profilePicOverlay`);s&&(s.onclick=()=>o&&o.click(),c&&(s.onmouseenter=()=>c.style.opacity=`1`,s.onmouseleave=()=>c.style.opacity=`0`)),o&&(o.onchange=t=>{let r=t.target.files[0];if(!r)return;let i=new FileReader;i.onload=t=>{e.profilePhoto=t.target.result,a(`state:changed`),n.querySelector(`#profilePicDisplay`).src=t.target.result},i.readAsDataURL(r)})}if(typeof google<`u`&&google.maps){let e=document.getElementById(`legaciesMap`);if(e){let t=new google.maps.Map(e,{center:{lat:20,lng:0},zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[{featureType:`all`,elementType:`labels`,stylers:[{visibility:`off`}]},{featureType:`administrative`,elementType:`geometry`,stylers:[{visibility:`on`},{color:`#e0e0e0`}]},{featureType:`landscape`,stylers:[{color:`#f0f0f5`}]},{featureType:`water`,stylers:[{color:`#ffffff`}]}]});fetch(`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson`).then(e=>e.json()).then(e=>{t.data.addGeoJson(e),t.data.setStyle(e=>{let t=(e.getProperty(`NAME`)||e.getProperty(`name`)||e.getProperty(`admin`)||``).toLowerCase();if(!t)return{visible:!1};if(o.some(e=>{if(!e)return!1;let n=e.split(` (`)[0].split(` - `)[0].toLowerCase();return n===`usa`&&(n=`united states`),n===`uk`&&(n=`united kingdom`),t===n||t.includes(n)||n.includes(t)||n===`united states`&&(t.includes(`america`)||t===`usa`)})){let e=0;for(let n=0;n<t.length;n++)e=t.charCodeAt(n)+((e<<5)-e);return{fillColor:`hsl(${Math.abs(e%360)}, 70%, 60%)`,fillOpacity:.7,strokeColor:`#ffffff`,strokeWeight:.5,visible:!0}}return{fillColor:`#d0d0d5`,fillOpacity:.2,strokeColor:`#ffffff`,strokeWeight:.5,visible:!0}})});let n=new google.maps.Geocoder,r={};i.filter(e=>e.isArchived&&e.isPublic).forEach(e=>{let t=e.country||e.name;t&&(r[t]||(r[t]=[]),r[t].push(e))}),(async()=>{for(let[e,i]of Object.entries(r))n.geocode({address:e},(n,r)=>{if(r===`OK`&&n[0]){let r=n[0].geometry.location,a=new google.maps.Marker({position:r,map:t,icon:{path:google.maps.SymbolPath.CIRCLE,fillOpacity:1,fillColor:`#ff2d55`,strokeColor:`white`,strokeWeight:2,scale:i.length>1?14:10}}),o=i.map(e=>`
                                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
                                            <span style="font-weight: 600; color: #000;">${e.name}</span>
                                            <button onclick="window.viewArchivedDetails('${e.id}')" style="background: #007aff; color: white; border: none; padding: 4px 12px; border-radius: 8px; font-weight: 700; font-size: 0.75rem; cursor: pointer;">View</button>
                                        </div>
                                    `).join(``),s=new google.maps.InfoWindow({content:`
                                            <div style="padding: 4px 8px; min-width: 220px; max-width: 300px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
                                                <div style="font-weight: 800; font-size: 0.7rem; text-transform: uppercase; color: rgba(0,0,0,0.5); letter-spacing: 0.1em; margin-bottom: 6px;">${e} — ${i.length} trip${i.length>1?`s`:``}</div>
                                                ${o}
                                            </div>
                                        `});a.addListener(`click`,()=>s.open(t,a))}}),await new Promise(e=>setTimeout(e,800))})()}}},100)};if(r){let t=[...e.trips||[],...e.archivedTrips||[]],n=new Date,r=t.filter(e=>e.isArchived||e.dateTo&&new Date(e.dateTo)<n);i(e.user,r)}else n.innerHTML=`<div style="display:flex; justify-content:center; align-items:center; height:300px;"><p style="font-weight:700; color:var(--text-secondary); animation: pulse 1.5s infinite;">Fetching profile...</p></div>`,fetch(`/api/public-profile/${t}`).then(e=>e.json()).then(e=>{e.error?n.innerHTML=`<p style="text-align:center; padding:50px;">User not found.</p>`:i(e.user,e.trips)}).catch(()=>{n.innerHTML=`<p style="text-align:center; padding:50px;">Error loading profile.</p>`});return n}function F(){let t=document.getElementById(`sidebarProfileAvatar`),n=document.getElementById(`sidebarProfileIcon`),r=document.getElementById(`sidebarProfileLabel`),i=document.getElementById(`sidebarProfileSub`),a=document.getElementById(`sidebarProfilePic`),o=document.getElementById(`sidebarLogoutBtn`);e.user?(t&&(t.style.display=`block`),n&&(n.style.display=`none`),r&&(r.textContent=e.user.name),i&&(i.style.display=`block`,i.textContent=`Logged in ✓`),a&&(a.src=e.user.picture),o&&(o.style.display=`block`)):(t&&(t.style.display=`none`),n&&(n.style.display=`block`),r&&(r.textContent=`Log in`),i&&(i.style.display=`none`),o&&(o.style.display=`none`))}var I=null,L=!1;function R(e,t=null,n=!1){let r=document.getElementById(`app-container`);if(!r)return;I&&=(clearInterval(I),null),r.innerHTML=``;let i=null;switch(e){case`home`:i=x();break;case`expenses`:i=w();break;case`upload`:i=k();break;case`insights`:i=ee();break;case`settings`:i=D();break;case`personalization`:i=O();break;case`budgets`:i=A();break;case`collections`:i=ne();break;case`ai`:i=ie();break;case`settlement`:i=N();break;case`friends`:i=ae();break;case`profile`:i=oe(t?.userId);break;default:i=x()}i&&r.appendChild(i),document.querySelectorAll(`.nav-item`).forEach(t=>{t.classList.remove(`active`),t.getAttribute(`onclick`)?.includes(`navigate('${e}')`)&&t.classList.add(`active`)}),L=!0,window.location.hash=e,n||window.scrollTo(0,0)}window.navigate=R,window.onhashchange=()=>{if(L){L=!1;return}R(window.location.hash.replace(`#`,``)||`home`)};async function z(){if(e.user)try{await fetch(`/api/sync`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id,trips:e.trips,archived_trips:e.archivedTrips||[],expenses:e.expenses,activities:e.activities,photos:e.photos,groups:e.groups,categories:e.categories||[],budgets:e.budgets||[]})})}catch(e){console.error(`Sync failed:`,e)}}async function B(){if(e.user)try{let t=await(await fetch(`/api/data?user_id=${encodeURIComponent(e.user.id)}`)).json();if(t){let n=t.trips||[];e.trips=n.filter(e=>!e.isArchived),e.archivedTrips=n.filter(e=>e.isArchived),e.expenses=t.expenses||[],e.groups=t.companions||[],e.categories=t.categories||[],e.budgets=t.budgets||[],e.tripDays=t.tripDays||[],a(`state:changed`),await X(),window.updateNotificationUI?.(),R(window.location.hash.replace(`#`,``)||`home`)}}catch(e){console.error(`Pull from server failed:`,e)}}var V=(e,t)=>fetch(e,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}).catch(t=>console.error(`POST ${e} failed:`,t)),H=(e,t)=>fetch(e,{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}).catch(t=>console.error(`DELETE ${e} failed:`,t));function U(t){if(e.user)return V(`/api/trips`,{user_id:e.user.id,trip:t})}function W(t){if(e.user)return H(`/api/trips/${t}`,{user_id:e.user.id})}function G(t){if(e.user)return V(`/api/trips/${t}/archive`,{user_id:e.user.id})}function K(t){if(e.user)return V(`/api/expenses`,{user_id:e.user.id,expense:t})}function se(t){if(e.user)return H(`/api/expenses/${t}`,{user_id:e.user.id})}function q(){if(e.user)return V(`/api/companions`,{user_id:e.user.id,companions:e.groups})}function J(){if(e.user)return V(`/api/categories`,{user_id:e.user.id,categories:e.categories})}function ce(t){if(e.user)return V(`/api/budgets`,{user_id:e.user.id,budget:t})}function le(t){if(e.user)return H(`/api/budgets/${t}`,{user_id:e.user.id})}function Y(t){if(e.user)return V(`/api/days`,{user_id:e.user.id,day:t})}async function X(){if(e.user)try{e.notifications=await(await fetch(`/api/notifications/list?user_id=${encodeURIComponent(e.user.id)}`)).json(),window.updateNotificationUI?.()}catch(e){console.error(`Failed to fetch notifications:`,e)}}async function ue(){if(e.user)try{await fetch(`/api/notifications/read`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:e.user.id})}),e.notifications.forEach(e=>e.is_read=1),window.updateNotificationUI?.()}catch(e){console.error(`Failed to mark notifications read:`,e)}}async function de(t){if(t.length===0)return;let n=[...t].sort(),r=n[0],i=n[n.length-1];if(!(!r||!i))try{let t=`https://api.frankfurter.app/${r}..${i}`,n=await fetch(t);if(n.ok){let t=await n.json();Object.entries(t.rates).forEach(([t,n])=>{Object.entries(n).forEach(([n,r])=>{e.rateCache[`${t}_${n}_EUR`]=1/r})}),a(`state:changed`)}}catch(e){console.error(`Failed to fetch historical rates:`,e)}}window.showLiquidAlert=p,window.navigate=R,window.updateNotificationUI=function(){let t=document.getElementById(`notificationBadge`),n=(e.notifications||[]).filter(e=>!e.is_read).length;t&&(t.style.display=n>0?`flex`:`none`,t.textContent=n>9?`9+`:n)},window.renderNotificationDropdown=function(){let t=document.getElementById(`notificationList`);if(!t)return;let n=e.notifications||[];if(n.length===0){t.innerHTML=`<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:0.9rem;">No notifications.</div>`;return}t.innerHTML=n.map(e=>`
        <div class="notification-item ${e.is_read?``:`unread`}">
            <div style="font-weight:700; font-size:0.9rem; margin-bottom:4px; color:${e.type===`alert`?`#ff3b30`:`var(--accent-blue)`}">${e.title||(e.type===`friend_request`?`Friend Request`:e.type===`accepted_request`?`Request Accepted`:`Notification`)}</div>
            <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4;">${e.message}</div>
            <div style="font-size:0.7rem; color:rgba(0,0,0,0.3); margin-top:8px; font-weight:600;">${new Date(e.created_at).toLocaleDateString()}</div>
        </div>
    `).join(``)},window.updateTripSelector=function(){let t=document.getElementById(`tripSelector`),n=document.getElementById(`completeTripBtn`),r=document.getElementById(`deleteTripBtn`);if(!t)return;if(e.trips.length===0){t.innerHTML=`<option value="">No Active Trips</option>`,n&&(n.style.display=`none`),r&&(r.style.display=`none`);return}t.innerHTML=e.trips.map(t=>`
        <option value="${t.id}" ${t.id===e.activeTripId?`selected`:``}>${t.name}</option>
    `).join(``);let i=!!e.activeTripId;n&&(n.style.display=i?`flex`:`none`),r&&(r.style.display=i?`flex`:`none`),t.onchange=t=>{e.activeTripId=t.target.value,a(`state:changed`),R(`home`)}},i(`state:changed`,()=>window.updateTripSelector?.());function Z(){let t=e.trips.find(t=>t.id===e.activeTripId);t&&m({title:`Archive Trip?`,message:`This will move the trip to your collections and lock editing.`,confirmText:`Archive`,onConfirm:()=>{t.isArchived=!0,t.expenses=e.expenses.filter(e=>e.tripId===t.id),t.tripDays=e.tripDays.filter(e=>e.tripId===t.id),e.archivedTrips.push(t),e.expenses=e.expenses.filter(e=>e.tripId!==t.id),e.tripDays=e.tripDays.filter(e=>e.tripId!==t.id),e.trips=e.trips.filter(e=>e.id!==t.id),e.activeTripId=e.trips.length>0?e.trips[0].id:null,a(`state:changed`),G(t.id),R(`collections`)}})}var fe=()=>{let t=e.trips.find(t=>t.id===e.activeTripId);t&&m({title:`Delete Trip?`,message:`Are you sure you want to delete "${t.name}" permanently? This will remove all associated expenses and days.`,confirmText:`Delete Permanently`,onConfirm:async()=>{e.trips=e.trips.filter(e=>e.id!==t.id),e.expenses=e.expenses.filter(e=>e.tripId!==t.id),e.tripDays=e.tripDays.filter(e=>e.tripId!==t.id),e.activeTripId=e.trips.length>0?e.trips[0].id:null,a(`state:changed`),W(t.id),R(`home`)}})};async function pe(t){try{let n=await(await fetch(`/api/auth/google`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({credential:t.credential})})).json();if(n.status===`success`){let t=!e.hasLoggedInBefore;if(e.user=n.user,e.hasLoggedInBefore=!0,t&&n.user?.name){let t=n.user.name.split(` `)[0];e.groups.includes(t)||e.groups.push(t)}await z(),await B(),e.trips.length>0&&!e.trips.find(t=>t.id===e.activeTripId)&&(e.activeTripId=e.trips[0].id),a(`state:changed`),F(),R(`profile`)}}catch(e){console.error(`Google Login Failed:`,e)}}function me(){if(typeof google<`u`&&google.accounts){google.accounts.id.initialize({client_id:window.globalGoogleClientId,callback:pe});let e=document.getElementById(`googleBtnContainer`);e&&google.accounts.id.renderButton(e,{theme:`outline`,size:`large`,shape:`pill`})}}async function Q(){t();try{let t=await(await fetch(`/api/user-status`)).json();t.logged_in&&(e.user=t.user,await z(),await B(),X())}catch{}e.tripDays&&[...new Set(e.tripDays.map(e=>e.tripId))].forEach(t=>{e.tripDays.filter(e=>e.tripId===t).sort((e,t)=>e.dayNumber&&t.dayNumber?e.dayNumber-t.dayNumber:new Date(e.date)-new Date(t.date)).forEach((e,t)=>{e.dayNumber||=t+1})}),F(),window.updateNotificationUI(),window.updateTripSelector(),R(window.location.hash.replace(`#`,``)||`home`),me();let n=()=>{document.getElementById(`sidebar`)?.classList.toggle(`open`),document.getElementById(`sidebarOverlay`)?.classList.toggle(`open`)};document.getElementById(`hamburgerBtn`)?.addEventListener(`click`,n),document.getElementById(`sidebarOverlay`)?.addEventListener(`click`,n),document.getElementById(`sidebarClose`)?.addEventListener(`click`,n);let r=document.querySelector(`.nav-brand`);r&&(r.style.cursor=`pointer`,r.onclick=()=>R(`home`));let i=document.getElementById(`notificationBellBtn`),a=document.getElementById(`notificationDropdown`);i?.addEventListener(`click`,e=>{if(e.stopPropagation(),a){let e=a.style.display===`none`||!a.style.display;a.style.display=e?`flex`:`none`,e&&(window.renderNotificationDropdown(),ue())}}),document.getElementById(`newTripBtn`)?.addEventListener(`click`,()=>{$()}),document.getElementById(`sidebarLogoutBtn`)?.addEventListener(`click`,()=>P()),document.getElementById(`completeTripBtn`)?.addEventListener(`click`,Z),document.getElementById(`deleteTripBtn`)?.addEventListener(`click`,fe),document.addEventListener(`click`,e=>{a&&a.style.display===`flex`&&!a.contains(e.target)&&e.target!==i&&(a.style.display=`none`);let t=e.target.closest(`[data-page]`);t&&(e.preventDefault(),R(t.getAttribute(`data-page`)),document.getElementById(`sidebar`)?.classList.remove(`open`),document.getElementById(`sidebarOverlay`)?.classList.remove(`open`))}),setInterval(()=>{e.user&&(z(),X())},15e3)}var $=()=>{let t=document.createElement(`div`);t.className=`modal-overlay`,t.style.display=`flex`,t.style.backdropFilter=`blur(25px)`,t.innerHTML=`
        <div class="card glass" style="width: 420px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 1.8rem; margin-bottom: 24px; color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">New Trip</h2>
            <form id="newTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: 16px; width: 100%;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Adventure Name</label>
                    <input type="text" id="tripName" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="e.g. Summer in Tuscany" required>
                </div>
                <div style="margin-bottom: 24px; width: 100%; position: relative;" id="newTripCountryContainer">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Destination</label>
                    <div class="custom-select-wrapper">
                        <input type="text" id="tripCountryInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search country..." autocomplete="off">
                        <div id="tripCountryList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${o.map(e=>`<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${e}">${e}</div>`).join(``)}
                        </div>
                    </div>
                </div>
                <div style="margin-bottom: 24px; width: 100%; position: relative; display: none;" id="newTripStateContainer">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Select State</label>
                    <div class="custom-select-wrapper">
                        <input type="text" id="tripStateInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search state..." autocomplete="off">
                        <div id="tripStateList" class="custom-select-dropdown glass shadow-xl" style="display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 1000; max-height: 200px; overflow-y: auto; margin-top: 8px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.1); background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
                            ${d.map(e=>`<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${e}">${e}</div>`).join(``)}
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; width: 100%;">
                    <button type="submit" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2);">Create Trip</button>
                    <button type="button" id="cancelTripBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem;">Cancel</button>
                </div>
            </form>
        </div>
    `,document.body.appendChild(t);let n=t.querySelector(`#tripCountryInput`),r=t.querySelector(`#tripCountryList`),i=r.querySelectorAll(`.dropdown-item`);n.onfocus=()=>{r.style.display=`block`},n.oninput=e=>{let t=e.target.value.toLowerCase();i.forEach(e=>{e.style.display=e.textContent.toLowerCase().includes(t)?`block`:`none`}),r.style.display=`block`};let s=t.querySelector(`#newTripStateContainer`),c=t.querySelector(`#tripStateInput`),l=t.querySelector(`#tripStateList`),u=l.querySelectorAll(`.dropdown-item`);i.forEach(e=>{e.onclick=t=>{t.preventDefault(),t.stopPropagation();let i=e.getAttribute(`data-value`);n.value=i,r.style.display=`none`,i===`United States (USA)`?s.style.display=`block`:(s.style.display=`none`,c.value=``)}}),c.onfocus=()=>{l.style.display=`block`},c.oninput=e=>{let t=e.target.value.toLowerCase();u.forEach(e=>{e.style.display=e.textContent.toLowerCase().includes(t)?`block`:`none`}),l.style.display=`block`},u.forEach(e=>{e.onclick=t=>{t.preventDefault(),t.stopPropagation(),c.value=e.getAttribute(`data-value`),l.style.display=`none`}}),t.querySelector(`#cancelTripBtn`).onclick=()=>t.remove(),t.querySelector(`#newTripForm`).onsubmit=n=>{n.preventDefault();let r=h(),i=t.querySelector(`#tripName`).value,o=t.querySelector(`#tripCountryInput`).value,s=t.querySelector(`#tripStateInput`).value,c=o;o===`United States (USA)`&&s&&(c=`USA - ${s}`);let l={id:r,name:i,country:c,budget:0,isArchived:!1};e.trips.push(l),e.activeTripId=r,a(`state:changed`),U(l),t.remove(),R(`home`)}};window.openNewTripModal=$,window.openAddDayModal=()=>{if(!e.activeTripId){p(`Please create a trip before adding days.`);return}let t=(e.tripDays||[]).filter(t=>t.tripId===e.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),n=t.length+1,r=``;if(t.length>0){let e=t[t.length-1];if(e.date){let t=new Date(e.date);t.setDate(t.getDate()+1),r=t.toISOString().split(`T`)[0]}}let i=document.createElement(`div`);i.className=`modal-overlay`,i.style.display=`flex`,i.style.backdropFilter=`blur(25px)`,i.innerHTML=`
        <div class="card glass" style="width: 400px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 20px;">
                <div style="background: var(--accent-blue); color: white; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.9rem;">${n}</div>
                <h2 class="card-title" style="font-size: 1.8rem; margin: 0; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Day</h2>
            </div>
            <form id="addDayForm" style="display: flex; flex-direction: column; width: 100%;">
                <div style="margin-bottom: 16px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Where are you going?</label>
                    <input type="text" id="dayName" class="glass-input" value="Day ${n}" placeholder="e.g. Exploring Rome" style="width: 100%; padding: 14px; border-radius: 16px; box-sizing: border-box;" required autofocus>
                </div>
                <div style="margin-bottom: 24px;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Date ${r?`(Auto)`:``}</label>
                    <input type="date" id="dayDate" class="glass-input" value="${r}" style="width: 100%; padding: 14px; border-radius: 16px; box-sizing: border-box;" required>
                </div>
                <div style="display: flex; gap: 10px; width: 100%;">
                    <button type="submit" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2);">Confirm</button>
                    <button type="button" id="cancelDayBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(0,0,0,0.05); color: #000000; font-weight: 600; border: none; font-size: 0.85rem;">Cancel</button>
                </div>
            </form>
        </div>
    `,document.body.appendChild(i),i.querySelector(`#cancelDayBtn`).onclick=()=>i.remove(),i.querySelector(`#addDayForm`).onsubmit=async t=>{t.preventDefault();let r=h(),o=i.querySelector(`#dayName`).value,s=i.querySelector(`#dayDate`).value,c={id:r,tripId:e.activeTripId,name:o,date:s,dayNumber:n,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};e.tripDays.push(c),a(`state:changed`),await Y(c),i.remove(),R(`home`)}},document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,Q):Q()})();
//# sourceMappingURL=app.bundle.js.map