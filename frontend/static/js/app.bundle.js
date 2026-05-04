(function(){var e={HOME:`home`,EXPENSES:`expenses`,UPLOAD:`upload`,INSIGHTS:`insights`,SETTINGS:`settings`,PERSONALIZATION:`personalization`,BUDGETS:`budgets`,COLLECTIONS:`collections`,AI:`ai`,SETTLEMENT:`settlement`,FRIENDS:`friends`,PROFILE:`profile`},t={STATE_CHANGED:`state:changed`,NOTIFICATIONS_CHANGED:`notifications:changed`},n=typeof window<`u`&&window.__GG_API_BASE__?window.__GG_API_BASE__:``,r=`Afghanistan.Albania.Algeria.Andorra.Angola.Antigua and Barbuda.Argentina.Armenia.Australia.Austria.Azerbaijan.Bahamas.Bahrain.Bangladesh.Barbados.Belarus.Belgium.Belize.Benin.Bhutan.Bolivia.Bosnia and Herzegovina.Botswana.Brazil.Brunei.Bulgaria.Burkina Faso.Burundi.Cabo Verde.Cambodia.Cameroon.Canada.Central African Republic.Chad.Chile.China.Colombia.Comoros.Congo.Costa Rica.Croatia.Cuba.Cyprus.Czech Republic.Denmark.Djibouti.Dominica.Dominican Republic.Ecuador.Egypt.El Salvador.Equatorial Guinea.Eritrea.Estonia.Eswatini.Ethiopia.Fiji.Finland.France.Gabon.Gambia.Georgia.Germany.Ghana.Greece.Grenada.Guatemala.Guinea.Guinea-Bissau.Guyana.Haiti.Honduras.Hungary.Iceland.India.Indonesia.Iran.Iraq.Ireland.Israel.Italy.Jamaica.Japan.Jordan.Kazakhstan.Kenya.Kiribati.Korea, North.Korea, South.Kosovo.Kuwait.Kyrgyzstan.Laos.Latvia.Lebanon.Lesotho.Liberia.Libya.Liechtenstein.Lithuania.Luxembourg.Madagascar.Malawi.Malaysia.Maldives.Mali.Malta.Marshall Islands.Mauritania.Mauritius.Mexico.Micronesia.Moldova.Monaco.Mongolia.Montenegro.Morocco.Mozambique.Myanmar.Namibia.Nauru.Nepal.Netherlands.New Zealand.Nicaragua.Niger.Nigeria.North Macedonia.Norway.Oman.Pakistan.Palau.Palestine.Panama.Papua New Guinea.Paraguay.Peru.Philippines.Poland.Portugal.Qatar.Romania.Russia.Rwanda.Saint Kitts and Nevis.Saint Lucia.Saint Vincent.Samoa.San Marino.Sao Tome and Principe.Saudi Arabia.Senegal.Serbia.Seychelles.Sierra Leone.Singapore.Slovakia.Slovenia.Solomon Islands.Somalia.South Africa.South Sudan.Spain.Sri Lanka.Sudan.Suriname.Sweden.Switzerland.Syria.Taiwan.Tajikistan.Tanzania.Thailand.Timor-Leste.Togo.Tonga.Trinidad and Tobago.Tunisia.Turkey.Turkmenistan.Tuvalu.Uganda.Ukraine.UAE.UK.United States (USA).Uruguay.Uzbekistan.Vanuatu.Vatican City.Venezuela.Vietnam.Yemen.Zambia.Zimbabwe`.split(`.`).sort(),i=[{i:`https://images.unsplash.com/photo-1526772662000-3f88f10405ff`,q:`To lose yourself in a new country is to find yourself in the world.`},{i:`https://images.unsplash.com/photo-1464822759023-fed622ff2c3b`,q:`Traveling is finding a place where every path leads somewhere beautiful.`},{i:`https://images.unsplash.com/photo-1501854140801-50d01698950b`,q:`To travel is to find peace in the untamed beauty of the world.`},{i:`https://images.unsplash.com/photo-1469474968028-56623f02e42e`,q:`Every sunrise is a new begginning.`},{i:`https://images.unsplash.com/photo-1447752875215-b2761acb3c5d`,q:`Allow yourself to wander roads that feel ancient and alive.`},{i:`https://images.unsplash.com/photo-1433086966358-54859d0ed716`,q:`Traveling is the bridge that connects mind and soul`},{i:`https://images.unsplash.com/photo-1465146344425-f00d5f5c8f07`,q:`Discover hidden places in every corner.`},{i:`https://images.unsplash.com/photo-1507525428034-b723cf961d3e`,q:`Go where the horizon meets the ocean and time stands still.`},{i:`https://images.unsplash.com/photo-1473448912268-2022ce9509d8`,q:`Adventure is not a destination, it's a belief system.`},{i:`https://images.unsplash.com/photo-1493246507139-91e8fad9978e`,q:`Embrace the spirit of the backpacker`},{i:`https://images.unsplash.com/photo-1506744038136-46273834b3fb`,q:`The essence of traveling beats in every human heart.`},{i:`https://images.unsplash.com/photo-1454496522488-7a8e488e8606`,q:`Explore the peak of your potential.`}].map(e=>({i:e.i+`?auto=format&fit=crop&w=1600&q=80`,q:e.q})),a={q:`The world is a book, and those who do not travel read only one page.`,i:`1469854523086-cc02fe5d8800`,f:`Traveling is the best way to learn about the world.`},o={EUR:1,USD:.92,GBP:1.17,JPY:.0062,CHF:1.04,CAD:.68,AUD:.61,CNY:.13,BRL:.18,MXN:.055,INR:.011,IDR:58e-6,SGD:.69,NZD:.56,HKD:.12,KRW:69e-5,ZAR:.049},s={EUR:`€`,USD:`$`,GBP:`£`,JPY:`¥`,CHF:`CHF`,CAD:`C$`,AUD:`A$`,CNY:`¥`,BRL:`R$`,MXN:`MX$`,INR:`₹`,IDR:`Rp`,SGD:`S$`,NZD:`NZ$`,HKD:`HK$`,KRW:`₩`,ZAR:`R`},c={US:`USD`,GB:`GBP`,AU:`AUD`,CA:`CAD`,NZ:`NZD`,JP:`JPY`,CH:`CHF`,BR:`BRL`,MX:`MXN`,IN:`INR`,ID:`IDR`,SG:`SGD`,HK:`HKD`,KR:`KRW`,ZA:`ZAR`,CN:`CNY`},l={Afghanistan:{i:`1589192144353-8e7c107077a1`,q:`Central Asia's crossroads.`,f:`Did you know that Afghanistan has a population of about 37 million people? Its capital city is Kabul.`},Alabama:{i:`1469474968028-56623f02e42e`,q:`Sweet Home Alabama.`,f:`Did you know that the Alabama State has a population of about 5 million people? Its biggest city is Huntsville.`},Alaska:{i:`1472214103451-9374bd1c798e`,q:`The Last Frontier.`,f:`Did you know that the Alaska State has a population of about 733 thousand people? Its biggest city is Anchorage.`},Albania:{i:`1588965000000-019521f3f39b`,q:`Balkan beauty.`,f:`Did you know that Albania has a population of about 2.9 million people? Its capital city is Tirana.`},Algeria:{i:`1544062562417-380d5d113f8c`,q:`Sahara's gateway.`,f:`Did you know that Algeria has a population of about 42 million people? Its capital city is Alger.`},Andorra:{i:`1469854523086-cc02fe5d8800`,q:`Andorra is waiting for you.`,f:`Did you know that Andorra has a population of about 77 thousand people? Its capital city is Andorra la Vella.`},Angola:{i:`1469854523086-cc02fe5d8800`,q:`Angola is waiting for you.`,f:`Did you know that Angola has a population of about 31 million people? Its capital city is Luanda.`},Antigua:{i:`1469854523086-cc02fe5d8800`,q:`Antigua is waiting for you.`,f:`Did you know that Antigua and Barbuda has a population of about 96 thousand people? Its capital city is Saint John's.`},Argentina:{i:`1449433114371-d67b866d368e`,q:`Land of Tango.`,f:`Did you know that Argentina has a population of about 44 million people? Its capital city is Buenos Aires.`},Arizona:{i:`1501854140801-50d01698950b`,q:`The Grand Canyon State.`,f:`Did you know that the Arizona State has a population of about 7 million people? Its biggest city is Phoenix.`},Arkansas:{i:`1470071131384-001b85755536`,q:`The Natural State.`,f:`Did you know that the Arkansas State has a population of about 3 million people? Its biggest city is Little Rock.`},Armenia:{i:`1469854523086-cc02fe5d8800`,q:`Armenia is waiting for you.`,f:`Did you know that Armenia has a population of about 3.0 million people? Its capital city is Yerevan.`},Australia:{i:`1523413680321-4d9d448b18f9`,q:`The Great Down Under.`,f:`Did you know that Australia has a population of about 25 million people? Its capital city is Canberra.`},Austria:{i:`1516903529241-10503553f08a`,q:`Alps and Art.`,f:`Did you know that Austria has a population of about 8.8 million people? Its capital city is Wien.`},Azerbaijan:{i:`1469854523086-cc02fe5d8800`,q:`Azerbaijan is waiting for you.`,f:`Did you know that Azerbaijan has a population of about 9.9 million people? Its capital city is Baku.`},Bahamas:{i:`1469854523086-cc02fe5d8800`,q:`Bahamas is waiting for you.`,f:`Did you know that Bahamas has a population of about 386 thousand people? Its capital city is Nassau.`},Bahrain:{i:`1469854523086-cc02fe5d8800`,q:`Bahrain is waiting for you.`,f:`Did you know that Bahrain has a population of about 1.6 million people? Its capital city is al-Manama.`},Bangladesh:{i:`1469854523086-cc02fe5d8800`,q:`Bangladesh is waiting for you.`,f:`Did you know that Bangladesh has a population of about 161 million people? Its capital city is Dhaka.`},Barbados:{i:`1469854523086-cc02fe5d8800`,q:`Barbados is waiting for you.`,f:`Did you know that Barbados has a population of about 287 thousand people? Its capital city is Bridgetown.`},Belarus:{i:`1469854523086-cc02fe5d8800`,q:`Belarus is waiting for you.`,f:`Did you know that Belarus has a population of about 9.5 million people? Its capital city is Minsk.`},Belgium:{i:`1490642220353-d023b6b27e8a`,q:`Heart of Europe.`,f:`Did you know that Belgium has a population of about 11 million people? Its capital city is Bruxelles.`},Belize:{i:`1469854523086-cc02fe5d8800`,q:`Belize is waiting for you.`,f:`Did you know that Belgium has a population of about 383 thousand people? Its capital city is Belmopan.`},Benin:{i:`1469854523086-cc02fe5d8800`,q:`Benin is waiting for you.`,f:`Did you know that Benin has a population of about 11 million people? Its capital city is Porto-Novo.`},Bhutan:{i:`1469854523086-cc02fe5d8800`,q:`Bhutan is waiting for you.`,f:`Did you know that Bhutan has a population of about 754 thousand people? Its capital city is Thimphu.`},Bolivia:{i:`1469854523086-cc02fe5d8800`,q:`Bolivia is waiting for you.`,f:`Did you know that Bolivia has a population of about 11 million people? Its capital city is La Paz.`},Bosnia:{i:`1469854523086-cc02fe5d8800`,q:`Bosnia is waiting for you.`,f:`Did you know that Bosnia and Herzegovina has a population of about 3.3 million people? Its capital city is Sarajevo.`},Botswana:{i:`1469854523086-cc02fe5d8800`,q:`Botswana is waiting for you.`,f:`Did you know that Botswana has a population of about 2.3 million people? Its capital city is Gaborone.`},Brazil:{i:`1483729553833-9411f2115507`,q:`Tropical rhythms.`,f:`Did you know that Brazil has a population of about 209 million people? Its capital city is Brasília.`},Brunei:{i:`1469854523086-cc02fe5d8800`,q:`Brunei is waiting for you.`,f:`Did you know that Brunei has a population of about 429 thousand people? Its capital city is Bandar Seri Begawan.`},Bulgaria:{i:`1469854523086-cc02fe5d8800`,q:`Bulgaria is waiting for you.`,f:`Did you know that Bulgaria has a population of about 7.0 million people? Its capital city is Sofia.`},Burkina:{i:`1469854523086-cc02fe5d8800`,q:`Burkina is waiting for you.`,f:`Did you know that Burkina Faso has a population of about 20 million people? Its capital city is Ouagadougou.`},Burundi:{i:`1469854523086-cc02fe5d8800`,q:`Burundi is waiting for you.`,f:`Did you know that Burundi has a population of about 11 million people? Its capital city is Bujumbura.`},Cabo:{i:`1469854523086-cc02fe5d8800`,q:`Cabo is waiting for you.`,f:`Did you know that Cabo Verde has a population of about 556 thousand people?`},California:{i:`1465146344425-f00d5f5c8f07`,q:`The Golden State.`,f:`Did you know that the California State has a population of about 40 million people? Its biggest city is Los Angeles.`},Cambodia:{i:`1469854523086-cc02fe5d8800`,q:`Cambodia is waiting for you.`,f:`Did you know that Cambodia has a population of about 16 million people? Its capital city is Phnom Penh.`},Cameroon:{i:`1469854523086-cc02fe5d8800`,q:`Cameroon is waiting for you.`,f:`Did you know that Cameroon has a population of about 25 million people? Its capital city is Yaounde.`},Canada:{i:`1503622765438-dec7e6190771`,q:`Great White North.`,f:`Did you know that Canada has a population of about 37 million people? Its capital city is Ottawa.`},Central:{i:`1469854523086-cc02fe5d8800`,q:`Central is waiting for you.`,f:`Did you know that Central African Republic has a population of about 4.7 million people? Its capital city is Bangui.`},Chad:{i:`1469854523086-cc02fe5d8800`,q:`Chad is waiting for you.`,f:`Did you know that Chad has a population of about 15 million people? Its capital city is N'Djamena.`},Chile:{i:`1469854523086-cc02fe5d8800`,q:`Chile is waiting for you.`,f:`Did you know that Chile has a population of about 19 million people? Its capital city is Santiago de Chile.`},China:{i:`1508433313474-758b4ff2cbb0`,q:`Ancient and modern.`,f:`Did you know that China has a population of about 1.4 billion people? Its capital city is Peking.`},Colombia:{i:`1533696812891-7d124a7300c2`,q:`Coffee and color.`,f:`Did you know that Colombia has a population of about 50 million people? Its capital city is Bogota.`},Comoros:{i:`1469854523086-cc02fe5d8800`,q:`Comoros is waiting for you.`,f:`Did you know that Comoros has a population of about 832 thousand people? Its capital city is Moroni.`},Congo:{i:`1469854523086-cc02fe5d8800`,q:`Congo is waiting for you.`,f:`Did you know that Congo has a population of about 84 million people? Its capital city is Brazzaville.`},"Costa Rica":{i:`1516244433333-333333333333`,q:`Pura Vida.`,f:`Did you know that Costa Rica has a population of about 5 million people? Its capital city is San Jose.`},Croatia:{i:`1506973035811-1354d12ee703`,q:`Adriatic gem.`,f:`Did you know that Croatia has a population of about 4.1 million people? Its capital city is Zagreb.`},Cuba:{i:`1469854523086-cc02fe5d8800`,q:`Cuba is waiting for you.`,f:`Did you know that Cuba has a population of about 11 million people? Its capital city is La Habana.`},Cyprus:{i:`1469854523086-cc02fe5d8800`,q:`Cyprus is waiting for you.`,f:`Did you know that Cyprus has a population of about 1.2 million people? Its capital city is Lefkosia.`},Czech:{i:`1469854523086-cc02fe5d8800`,q:`Czech is waiting for you.`,f:`Did you know that Czech Republic has a population of about 11 million people? Its capital city is Praha.`},Denmark:{i:`1513326738677-22749004144e`,q:`Hygge home.`,f:`Did you know that Denmark has a population of about 5.8 million people? Its capital city is København.`},Djibouti:{i:`1469854523086-cc02fe5d8800`,q:`Djibouti is waiting for you.`,f:`Did you know that Djibouti has a population of about 958 thousand people? Its capital city is Djibouti.`},Dominica:{i:`1469854523086-cc02fe5d8800`,q:`Dominica is waiting for you.`,f:`Did you know that Dominica has a population of about 71 thousand people? Its capital city is Roseau.`},Dominican:{i:`1469854523086-cc02fe5d8800`,q:`Dominican is waiting for you.`,f:`Did you know that Dominican Republic has a population of about 11 million people? Its capital city is Santo Domingo.`},Ecuador:{i:`1469854523086-cc02fe5d8800`,q:`Ecuador is waiting for you.`,f:`Did you know that Ecuador has a population of about 17 million people? Its capital city is Quito.`},Egypt:{i:`1506197394155-930c76311653`,q:`Gifts of the Nile.`,f:`Did you know that Egypt has a population of about 98 million people? Its capital city is al-Qahira.`},El:{i:`1469854523086-cc02fe5d8800`,q:`El is waiting for you.`,f:`Did you know that El Salvador has a population of about 6.4 million people? Its capital city is San Salvador.`},Equatorial:{i:`1469854523086-cc02fe5d8800`,q:`Equatorial is waiting for you.`,f:`Did you know that Equatorial Guinea has a population of about 1.3 million people? Its capital city is Malabo.`},Eritrea:{i:`1469854523086-cc02fe5d8800`,q:`Eritrea is waiting for you.`,f:`Did you know that Eritrea has a population of about 3.2 million people? Its capital city is Asmara.`},Estonia:{i:`1469854523086-cc02fe5d8800`,q:`Estonia is waiting for you.`,f:`Did you know that Estonia has a population of about 1.3 million people? Its capital city is Tallinn.`},Eswatini:{i:`1469854523086-cc02fe5d8800`,q:`Eswatini is waiting for you.`,f:`Did you know that Eswatini has a population of about 1.1 million people? Its capital city is Mbabane.`},Ethiopia:{i:`1469854523086-cc02fe5d8800`,q:`Ethiopia is waiting for you.`,f:`Did you know that Ethiopia has a population of about 109 million people? Its capital city is Addis Abeba.`},Fiji:{i:`1469854523086-cc02fe5d8800`,q:`Fiji is waiting for you.`,f:`Did you know that Fiji has a population of about 883 thousand people? Its capital city is Suva.`},Finland:{i:`1518129448333-3c220f592612`,q:`Land of a thousand lakes.`,f:`Did you know that Finland has a population of about 5.5 million people? Its capital city is Helsinki.`},Florida:{i:`1447752875215-b2761acb3c5d`,q:`The Sunshine State.`,f:`Did you know that the Florida State has a population of about 21 million people? Its biggest city is Jacksonville.`},France:{i:`1502603300225-44b2019e9930`,q:`Art and elegance.`,f:`Did you know that France has a population of about 67 million people? Its capital city is Paris.`},Gabon:{i:`1469854523086-cc02fe5d8800`,q:`Gabon is waiting for you.`,f:`Did you know that Gabon has a population of about 2.1 million people? Its capital city is Libreville.`},Gambia:{i:`1469854523086-cc02fe5d8800`,q:`Gambia is waiting for you.`,f:`Did you know that Gambia has a population of about 2.1 million people? Its capital city is Banjul.`},Georgia:{i:`1501854140801-50d01698950b`,q:`Caucasus charm.`,f:`Did you know that Georgia has a population of about 3.7 million people? Its capital city is Tiflis.`},Germany:{i:`1467269013931-1d7411a33a01`,q:`History and efficiency.`,f:`Did you know that Germany has a population of about 83 million people? Its capital city is Berlin.`},Ghana:{i:`1469854523086-cc02fe5d8800`,q:`Ghana is waiting for you.`,f:`Did you know that Ghana has a population of about 30 million people? Its capital city is Accra.`},Greece:{i:`1505164222044-1803503a7d48`,q:`Cradle of civilization.`,f:`Did you know that Greece has a population of about 10 million people? Its capital city is Athenai.`},Grenada:{i:`1469854523086-cc02fe5d8800`,q:`Grenada is waiting for you.`,f:`Did you know that Grenada has a population of about 111 thousand people? Its capital city is Saint George's.`},Guatemala:{i:`1469854523086-cc02fe5d8800`,q:`Guatemala is waiting for you.`,f:`Did you know that Guatemala has a population of about 17 million people? Its capital city is Ciudad de Guatemala.`},Guinea:{i:`1469854523086-cc02fe5d8800`,q:`Guinea is waiting for you.`,f:`Did you know that Guinea has a population of about 12 million people? Its capital city is Conakry.`},"Guinea-Bissau":{i:`1469854523086-cc02fe5d8800`,q:`Guinea-Bissau is waiting for you.`,f:`Did you know that Guinea-Bissau has a population of about 1.9 million people? Its capital city is Bissau.`},Guyana:{i:`1469854523086-cc02fe5d8800`,q:`Guyana is waiting for you.`,f:`Did you know that Guyana has a population of about 779 thousand people? Its capital city is Georgetown.`},Haiti:{i:`1469854523086-cc02fe5d8800`,q:`Haiti is waiting for you.`,f:`Did you know that Haiti has a population of about 11 million people? Its capital city is Port-au-Prince.`},Hawaii:{i:`1476610971033-5c8523b7a2d6`,q:`The Aloha State.`,f:`Did you know that the Hawaii State has a population of about 2 million people? Its biggest city is Honolulu.`},Honduras:{i:`1469854523086-cc02fe5d8800`,q:`Honduras is waiting for you.`,f:`Did you know that Honduras has a population of about 9.6 million people? Its capital city is Tegucigalpa.`},Hungary:{i:`1469854523086-cc02fe5d8800`,q:`Hungary is waiting for you.`,f:`Did you know that Hungary has a population of about 9.8 million people? Its capital city is Budapest.`},Iceland:{i:`1476610971033-5c8523b7a2d6`,q:`Fire and ice.`,f:`Did you know that Iceland has a population of about 353 thousand people? Its capital city is Reykjavík.`},Idaho:{i:`1449844908441-8829872d2607`,q:`The Gem State.`,f:`Did you know that the Idaho State has a population of about 2 million people? Its biggest city is Boise.`},Illinois:{i:`1469474968028-56623f02e42e`,q:`The Prairie State.`,f:`Did you know that the Illinois State has a population of about 13 million people? Its biggest city is Chicago.`},India:{i:`1524478228052-b137a0a74564`,q:`Incredible India.`,f:`Did you know that India has a population of about 1.4 billion people? Its capital city is New Delhi.`},Indiana:{i:`1472214103451-9374bd1c798e`,q:`The Hoosier State.`,f:`Did you know that the Indiana State has a population of about 7 million people? Its biggest city is Indianapolis.`},Indonesia:{i:`1513407027603-2fcbb73c2806`,q:`Island paradise.`,f:`Did you know that Indonesia has a population of about 268 million people? Its capital city is Jakarta.`},Iowa:{i:`1501854140801-50d01698950b`,q:`The Hawkeye State.`,f:`Did you know that the Iowa State has a population of about 3 million people? Its biggest city is Des Moines.`},Iran:{i:`1469854523086-cc02fe5d8800`,q:`Iran is waiting for you.`,f:`Did you know that Iran has a population of about 82 million people? Its capital city is Tehran.`},Iraq:{i:`1469854523086-cc02fe5d8800`,q:`Iraq is waiting for you.`,f:`Did you know that Iraq has a population of about 38 million people? Its capital city is Baghdad.`},Ireland:{i:`1504449104445-9a51e6b02a20`,q:`Emerald Isle.`,f:`Did you know that Ireland has a population of about 4.9 million people? Its capital city is Dublin.`},Israel:{i:`1469854523086-cc02fe5d8800`,q:`Israel is waiting for you.`,f:`Did you know that Israel has a population of about 8.9 million people? Its capital city is Jerusalem.`},Italy:{i:`1516483638261-1478525c7f88`,q:`La Dolce Vita.`,f:`Did you know that Italy has a population of about 60 million people? Its capital city is Roma.`},Jamaica:{i:`1469854523086-cc02fe5d8800`,q:`Jamaica is waiting for you.`,f:`Did you know that Jamaica has a population of about 2.9 million people? Its capital city is Kingston.`},Japan:{i:`1493976040374-4efc0c8d1853`,q:`Land of the Rising Sun.`,f:`Did you know that Japan has a population of about 127 million people? Its capital city is Tokyo.`},Jordan:{i:`1469854523086-cc02fe5d8800`,q:`Jordan is waiting for you.`,f:`Did you know that Jordan has a population of about 10.0 million people? Its capital city is Amman.`},Kansas:{i:`1470071131384-001b85755536`,q:`The Sunflower State.`,f:`Did you know that the Kansas State has a population of about 3 million people? Its biggest city is Wichita.`},Kazakhstan:{i:`1469854523086-cc02fe5d8800`,q:`Kazakhstan is waiting for you.`,f:`Did you know that Kazakhstan has a population of about 18 million people? Its capital city is Astana.`},Kentucky:{i:`1465146344425-f00d5f5c8f07`,q:`The Bluegrass State.`,f:`Did you know that the Kentucky State has a population of about 4 million people? Its biggest city is Louisville.`},Kenya:{i:`1469854523086-cc02fe5d8800`,q:`Kenya is waiting for you.`,f:`Did you know that Kenya has a population of about 51 million people? Its capital city is Nairobi.`},Kiribati:{i:`1469854523086-cc02fe5d8800`,q:`Kiribati is waiting for you.`,f:`Did you know that Kiribati has a population of about 116 thousand people? Its capital city is Bairiki.`},Kuwait:{i:`1469854523086-cc02fe5d8800`,q:`Kuwait is waiting for you.`,f:`Did you know that Kuwait has a population of about 4.1 million people? Its capital city is Kuwait.`},Kyrgyzstan:{i:`1469854523086-cc02fe5d8800`,q:`Kyrgyzstan is waiting for you.`,f:`Did you know that Kyrgyzstan has a population of about 6.3 million people? Its capital city is Bishkek.`},Laos:{i:`1469854523086-cc02fe5d8800`,q:`Laos is waiting for you.`,f:`Did you know that Laos has a population of about 7.1 million people? Its capital city is Vientiane.`},Latvia:{i:`1469854523086-cc02fe5d8800`,q:`Latvia is waiting for you.`,f:`Did you know that Latvia has a population of about 1.9 million people? Its capital city is Riga.`},Lebanon:{i:`1469854523086-cc02fe5d8800`,q:`Lebanon is waiting for you.`,f:`Did you know that Lebanon has a population of about 6.8 million people? Its capital city is Beirut.`},Lesotho:{i:`1469854523086-cc02fe5d8800`,q:`Lesotho is waiting for you.`,f:`Did you know that Lesotho has a population of about 2.1 million people? Its capital city is Maseru.`},Liberia:{i:`1469854523086-cc02fe5d8800`,q:`Liberia is waiting for you.`,f:`Did you know that Liberia has a population of about 4.8 million people? Its capital city is Monrovia.`},Libya:{i:`1469854523086-cc02fe5d8800`,q:`Libya is waiting for you.`,f:`Did you know that Libya has a population of about 6.7 million people? Its capital city is Tripoli.`},Liechtenstein:{i:`1469854523086-cc02fe5d8800`,q:`Liechtenstein is waiting for you.`,f:`Did you know that Liechtenstein has a population of about 38 thousand people? Its capital city is Vaduz.`},Lithuania:{i:`1469854523086-cc02fe5d8800`,q:`Lithuania is waiting for you.`,f:`Did you know that Lithuania has a population of about 2.8 million people? Its capital city is Vilnius.`},Louisiana:{i:`1433086966358-54859d0ed716`,q:`The Pelican State.`,f:`Did you know that the Louisiana State has a population of about 5 million people? Its biggest city is New Orleans.`},Luxembourg:{i:`1469854523086-cc02fe5d8800`,q:`Luxembourg is waiting for you.`,f:`Did you know that Luxembourg has a population of about 608 thousand people? Its capital city is Luxembourg [Luxemburg/L.`},Madagascar:{i:`1469854523086-cc02fe5d8800`,q:`Madagascar is waiting for you.`,f:`Did you know that Madagascar has a population of about 26 million people? Its capital city is Antananarivo.`},Maine:{i:`1473448912268-2022ce9509d8`,q:`The Pine Tree State.`,f:`Did you know that the Maine State has a population of about 1 million people? Its biggest city is Portland.`},Malawi:{i:`1469854523086-cc02fe5d8800`,q:`Malawi is waiting for you.`,f:`Did you know that Malawi has a population of about 18 million people? Its capital city is Lilongwe.`},Malaysia:{i:`1469854523086-cc02fe5d8800`,q:`Malaysia is waiting for you.`,f:`Did you know that Malaysia has a population of about 32 million people? Its capital city is Kuala Lumpur.`},Maldives:{i:`1469854523086-cc02fe5d8800`,q:`Maldives is waiting for you.`,f:`Did you know that Maldives has a population of about 516 thousand people? Its capital city is Male.`},Mali:{i:`1469854523086-cc02fe5d8800`,q:`Mali is waiting for you.`,f:`Did you know that Mali has a population of about 19 million people? Its capital city is Bamako.`},Malta:{i:`1469854523086-cc02fe5d8800`,q:`Malta is waiting for you.`,f:`Did you know that Malta has a population of about 485 thousand people? Its capital city is Valletta.`},Marshall:{i:`1469854523086-cc02fe5d8800`,q:`Marshall is waiting for you.`,f:`Did you know that Marshall Islands has a population of about 58 thousand people? Its capital city is Dalap-Uliga-Darrit.`},Maryland:{i:`1447752875215-b2761acb3c5d`,q:`The Old Line State.`,f:`Did you know that the Maryland State has a population of about 6 million people? Its biggest city is Baltimore.`},Massachusetts:{i:`1464822759023-fed622ff2c3b`,q:`The Bay State.`,f:`Did you know that the Massachusetts State has a population of about 7 million people? Its biggest city is Boston.`},Mauritania:{i:`1469854523086-cc02fe5d8800`,q:`Mauritania is waiting for you.`,f:`Did you know that Mauritania has a population of about 4.4 million people? Its capital city is Nouakchott.`},Mauritius:{i:`1469854523086-cc02fe5d8800`,q:`Mauritius is waiting for you.`,f:`Did you know that Mauritius has a population of about 1.3 million people? Its capital city is Port-Louis.`},Mexico:{i:`1512813195302-3f11d1306eb5`,q:`Viva México.`,f:`Did you know that Mexico has a population of about 126 million people? Its capital city is Ciudad de M.`},Michigan:{i:`1507525428034-b723cf961d3e`,q:`The Great Lakes State.`,f:`Did you know that the Michigan State has a population of about 10 million people? Its biggest city is Detroit.`},Micronesia:{i:`1469854523086-cc02fe5d8800`,q:`Micronesia is waiting for you.`,f:`Did you know? Micronesia is full of hidden gems waiting to be explored.`},Minnesota:{i:`1476610971033-5c8523b7a2d6`,q:`The North Star State.`,f:`Did you know that the Minnesota State has a population of about 6 million people? Its biggest city is Minneapolis.`},Mississippi:{i:`1449844908441-8829872d2607`,q:`The Magnolia State.`,f:`Did you know that the Mississippi State has a population of about 3 million people? Its biggest city is Jackson.`},Missouri:{i:`1469474968028-56623f02e42e`,q:`The Show-Me State.`,f:`Did you know that the Missouri State has a population of about 6 million people? Its biggest city is Kansas City.`},Moldova:{i:`1469854523086-cc02fe5d8800`,q:`Moldova is waiting for you.`,f:`Did you know that Moldova has a population of about 2.7 million people? Its capital city is Chisinau.`},Monaco:{i:`1469854523086-cc02fe5d8800`,q:`Monaco is waiting for you.`,f:`Did you know that Monaco has a population of about 39 thousand people? Its capital city is Monaco-Ville.`},Mongolia:{i:`1469854523086-cc02fe5d8800`,q:`Mongolia is waiting for you.`,f:`Did you know that Mongolia has a population of about 3.2 million people? Its capital city is Ulan Bator.`},Montana:{i:`1472214103451-9374bd1c798e`,q:`Big Sky Country.`,f:`Did you know that the Montana State has a population of about 1 million people? Its biggest city is Billings.`},Montenegro:{i:`1469854523086-cc02fe5d8800`,q:`Montenegro is waiting for you.`,f:`Did you know that Montenegro has a population of about 631 thousand people? Its capital city is Podgorica.`},Morocco:{i:`1469854523086-cc02fe5d8800`,q:`Morocco is waiting for you.`,f:`Did you know that Morocco has a population of about 36 million people? Its capital city is Rabat.`},Mozambique:{i:`1469854523086-cc02fe5d8800`,q:`Mozambique is waiting for you.`,f:`Did you know that Mozambique has a population of about 29 million people? Its capital city is Maputo.`},Myanmar:{i:`1469854523086-cc02fe5d8800`,q:`Myanmar is waiting for you.`,f:`Did you know that Myanmar has a population of about 54 million people? Its capital city is Rangoon (Yangon).`},Namibia:{i:`1469854523086-cc02fe5d8800`,q:`Namibia is waiting for you.`,f:`Did you know that Namibia has a population of about 2.4 million people? Its capital city is Windhoek.`},Nauru:{i:`1469854523086-cc02fe5d8800`,q:`Nauru is waiting for you.`,f:`Did you know that Nauru has a population of about 13 thousand people? Its capital city is Yaren.`},Nebraska:{i:`1501854140801-50d01698950b`,q:`The Cornhusker State.`,f:`Did you know that the Nebraska State has a population of about 2 million people? Its biggest city is Omaha.`},Nepal:{i:`1469854523086-cc02fe5d8800`,q:`Nepal is waiting for you.`,f:`Did you know that Nepal has a population of about 28 million people? Its capital city is Kathmandu.`},Netherlands:{i:`1513481615233-5e67010e407d`,q:`Canals and colors.`,f:`Did you know that Netherlands has a population of about 17 million people? Its capital city is Amsterdam.`},Nevada:{i:`1470071131384-001b85755536`,q:`The Silver State.`,f:`Did you know that the Nevada State has a population of about 3 million people? Its biggest city is Las Vegas.`},"New Hampshire":{i:`1465146344425-f00d5f5c8f07`,q:`Live Free or Die.`,f:`Did you know that the New Hampshire State has a population of about 1 million people? Its biggest city is Manchester.`},"New Jersey":{i:`1433086966358-54859d0ed716`,q:`The Garden State.`,f:`Did you know that the New Jersey State has a population of about 9 million people? Its biggest city is Newark.`},"New Mexico":{i:`1473448912268-2022ce9509d8`,q:`Land of Enchantment.`,f:`Did you know that the New Mexico State has a population of about 2 million people? Its biggest city is Albuquerque.`},"New York":{i:`1447752875215-b2761acb3c5d`,q:`The Empire State.`,f:`Did you know that the New York State has a population of about 20 million people? Its biggest city is New York City.`},"New Zealand":{i:`1469854523086-cc02fe5d8800`,q:`New Zealand is waiting for you.`,f:`Did you know that New Zealand has a population of about 4.8 million people? Its capital city is Wellington.`},Nicaragua:{i:`1469854523086-cc02fe5d8800`,q:`Nicaragua is waiting for you.`,f:`Did you know that Nicaragua has a population of about 6.5 million people? Its capital city is Managua.`},Niger:{i:`1469854523086-cc02fe5d8800`,q:`Niger is waiting for you.`,f:`Did you know that Niger has a population of about 22 million people? Its capital city is Niamey.`},Nigeria:{i:`1469854523086-cc02fe5d8800`,q:`Nigeria is waiting for you.`,f:`Did you know that Nigeria has a population of about 196 million people? Its capital city is Abuja.`},"North Carolina":{i:`1464822759023-fed622ff2c3b`,q:`First in Flight.`,f:`Did you know that the North Carolina State has a population of about 10 million people? Its biggest city is Charlotte.`},"North Dakota":{i:`1507525428034-b723cf961d3e`,q:`The Peace Garden State.`,f:`Did you know that the North Dakota State has a population of about 779 thousand people? Its biggest city is Fargo.`},"North Macedonia":{i:`1469854523086-cc02fe5d8800`,q:`North Macedonia is waiting for you.`,f:`Did you know that North Macedonia has a population of about 2.1 million people? Its capital city is Skopje.`},Norway:{i:`1519067793744-119192411b21`,q:`Fjord fantasy.`,f:`Did you know that Norway has a population of about 5.3 million people? Its capital city is Oslo.`},Ohio:{i:`1476610971033-5c8523b7a2d6`,q:`The Buckeye State.`,f:`Did you know that the Ohio State has a population of about 12 million people? Its biggest city is Columbus.`},Oklahoma:{i:`1449844908441-8829872d2607`,q:`The Sooner State.`,f:`Did you know that the Oklahoma State has a population of about 4 million people? Its biggest city is Oklahoma City.`},Oman:{i:`1469854523086-cc02fe5d8800`,q:`Oman is waiting for you.`,f:`Did you know that Oman has a population of about 4.8 million people? Its capital city is Masqat.`},Oregon:{i:`1469474968028-56623f02e42e`,q:`The Beaver State.`,f:`Did you know that the Oregon State has a population of about 4 million people? Its biggest city is Portland.`},Pakistan:{i:`1469854523086-cc02fe5d8800`,q:`Pakistan is waiting for you.`,f:`Did you know that Pakistan has a population of about 212 million people? Its capital city is Islamabad.`},Palau:{i:`1469854523086-cc02fe5d8800`,q:`Palau is waiting for you.`,f:`Did you know that Palau has a population of about 18 thousand people? Its capital city is Koror.`},Palestine:{i:`1469854523086-cc02fe5d8800`,q:`Palestine is waiting for you.`,f:`Did you know that Palestine has a population of about 4.6 million people? Its capital city is Gaza.`},Panama:{i:`1469854523086-cc02fe5d8800`,q:`Panama is waiting for you.`,f:`Did you know that Panama has a population of about 4.2 million people? Its capital city is Ciudad de Panamá.`},"Papua New Guinea":{i:`1469854523086-cc02fe5d8800`,q:`Papua New Guinea is waiting for you.`,f:`Did you know that Papua New Guinea has a population of about 8.6 million people? Its capital city is Port Moresby.`},Paraguay:{i:`1469854523086-cc02fe5d8800`,q:`Paraguay is waiting for you.`,f:`Did you know that Paraguay has a population of about 7.0 million people? Its capital city is Asunción.`},Pennsylvania:{i:`1472214103451-9374bd1c798e`,q:`The Keystone State.`,f:`Did you know that the Pennsylvania State has a population of about 13 million people? Its biggest city is Philadelphia.`},Peru:{i:`1469854523086-cc02fe5d8800`,q:`Peru is waiting for you.`,f:`Did you know that Peru has a population of about 32 million people? Its capital city is Lima.`},Philippines:{i:`1469854523086-cc02fe5d8800`,q:`Philippines is waiting for you.`,f:`Did you know that Philippines has a population of about 107 million people? Its capital city is Manila.`},Poland:{i:`1469854523086-cc02fe5d8800`,q:`Poland is waiting for you.`,f:`Did you know that Poland has a population of about 38 million people? Its capital city is Warszawa.`},Portugal:{i:`1515232353913-9092d6e32a21`,q:`Atlantic soulful.`,f:`Did you know that Portugal has a population of about 10 million people? Its capital city is Lisboa.`},Qatar:{i:`1469854523086-cc02fe5d8800`,q:`Qatar is waiting for you.`,f:`Did you know that Qatar has a population of about 2.8 million people? Its capital city is Doha.`},"Rhode Island":{i:`1501854140801-50d01698950b`,q:`The Ocean State.`,f:`Did you know that the Rhode Island State has a population of about 1 million people? Its biggest city is Providence.`},Romania:{i:`1469854523086-cc02fe5d8800`,q:`Romania is waiting for you.`,f:`Did you know that Romania has a population of about 19 million people? Its capital city is Bucuresti.`},Russia:{i:`1469854523086-cc02fe5d8800`,q:`Russia is waiting for you.`,f:`Did you know? Russia is full of hidden gems waiting to be explored.`},Rwanda:{i:`1469854523086-cc02fe5d8800`,q:`Rwanda is waiting for you.`,f:`Did you know that Rwanda has a population of about 12 million people? Its capital city is Kigali.`},"Saint Kitts And Nevis":{i:`1469854523086-cc02fe5d8800`,q:`Saint Kitts And Nevis is waiting for you.`,f:`Did you know that Saint Kitts and Nevis has a population of about 52 thousand people? Its capital city is Basseterre.`},"Saint Lucia":{i:`1469854523086-cc02fe5d8800`,q:`Saint Lucia is waiting for you.`,f:`Did you know that Saint Lucia has a population of about 182 thousand people? Its capital city is Castries.`},"Saint Vincent":{i:`1469854523086-cc02fe5d8800`,q:`Saint Vincent is waiting for you.`,f:`Did you know? Saint Vincent is full of hidden gems waiting to be explored.`},Samoa:{i:`1469854523086-cc02fe5d8800`,q:`Samoa is waiting for you.`,f:`Did you know that Samoa has a population of about 196 thousand people? Its capital city is Apia.`},"San Marino":{i:`1469854523086-cc02fe5d8800`,q:`San Marino is waiting for you.`,f:`Did you know that San Marino has a population of about 34 thousand people? Its capital city is San Marino.`},"Sao Tome And Principe":{i:`1469854523086-cc02fe5d8800`,q:`Sao Tome And Principe is waiting for you.`,f:`Did you know that Sao Tome and Principe has a population of about 211 thousand people? Its capital city is São Tomé.`},"Saudi Arabia":{i:`1469854523086-cc02fe5d8800`,q:`Saudi Arabia is waiting for you.`,f:`Did you know that Saudi Arabia has a population of about 34 million people? Its capital city is Riyadh.`},Senegal:{i:`1469854523086-cc02fe5d8800`,q:`Senegal is waiting for you.`,f:`Did you know that Senegal has a population of about 16 million people? Its capital city is Dakar.`},Serbia:{i:`1469854523086-cc02fe5d8800`,q:`Serbia is waiting for you.`,f:`Did you know that Serbia has a population of about 7.0 million people? Its capital city is Belgrade.`},Seychelles:{i:`1469854523086-cc02fe5d8800`,q:`Seychelles is waiting for you.`,f:`Did you know that Seychelles has a population of about 97 thousand people? Its capital city is Victoria.`},"Sierra Leone":{i:`1469854523086-cc02fe5d8800`,q:`Sierra Leone is waiting for you.`,f:`Did you know that Sierra Leone has a population of about 7.7 million people? Its capital city is Freetown.`},Singapore:{i:`1469854523086-cc02fe5d8800`,q:`Singapore is waiting for you.`,f:`Did you know that Singapore has a population of about 5.6 million people? Its capital city is Singapore.`},Slovakia:{i:`1469854523086-cc02fe5d8800`,q:`Slovakia is waiting for you.`,f:`Did you know that Slovakia has a population of about 5.4 million people? Its capital city is Bratislava.`},Slovenia:{i:`1469854523086-cc02fe5d8800`,q:`Slovenia is waiting for you.`,f:`Did you know that Slovenia has a population of about 2.1 million people? Its capital city is Ljubljana.`},"Solomon Islands":{i:`1469854523086-cc02fe5d8800`,q:`Solomon Islands is waiting for you.`,f:`Did you know that Solomon Islands has a population of about 653 thousand people? Its capital city is Honiara.`},Somalia:{i:`1469854523086-cc02fe5d8800`,q:`Somalia is waiting for you.`,f:`Did you know that Somalia has a population of about 15 million people? Its capital city is Mogadishu.`},"South Africa":{i:`1469854523086-cc02fe5d8800`,q:`South Africa is waiting for you.`,f:`Did you know that South Africa has a population of about 58 million people? Its capital city is Pretoria.`},"South Carolina":{i:`1470071131384-001b85755536`,q:`The Palmetto State.`,f:`Did you know that the South Carolina State has a population of about 5 million people? Its biggest city is Charleston.`},"South Dakota":{i:`1465146344425-f00d5f5c8f07`,q:`Mount Rushmore State.`,f:`Did you know that the South Dakota State has a population of about 887 thousand people? Its biggest city is Sioux Falls.`},"South Sudan":{i:`1469854523086-cc02fe5d8800`,q:`South Sudan is waiting for you.`,f:`Did you know that South Sudan has a population of about 11 million people? Its capital city is Juba.`},Spain:{i:`1506665531191-c414908a8a4a`,q:`Passion and sun.`,f:`Did you know that Spain has a population of about 47 million people? Its capital city is Madrid.`},"Sri Lanka":{i:`1469854523086-cc02fe5d8800`,q:`Sri Lanka is waiting for you.`,f:`Did you know that Sri Lanka has a population of about 22 million people? Its capital city is Colombo, Sri Jayawardenepura Kotte.`},Sudan:{i:`1469854523086-cc02fe5d8800`,q:`Sudan is waiting for you.`,f:`Did you know that Sudan has a population of about 42 million people? Its capital city is Khartum.`},Suriname:{i:`1469854523086-cc02fe5d8800`,q:`Suriname is waiting for you.`,f:`Did you know that Suriname has a population of about 576 thousand people? Its capital city is Paramaribo.`},Sweden:{i:`1469854523086-cc02fe5d8800`,q:`Sweden is waiting for you.`,f:`Did you know that Sweden has a population of about 10 million people? Its capital city is Stockholm.`},Switzerland:{i:`1516584222044-1803503a7d48`,q:`Mountain majesty.`,f:`Did you know that Switzerland has a population of about 8.5 million people? Its capital city is Bern.`},Syria:{i:`1469854523086-cc02fe5d8800`,q:`Syria is waiting for you.`,f:`Did you know that Syria has a population of about 17 million people? Its capital city is Damascus.`},Taiwan:{i:`1469854523086-cc02fe5d8800`,q:`Taiwan is waiting for you.`,f:`Did you know? Taiwan is full of hidden gems waiting to be explored.`},Tajikistan:{i:`1469854523086-cc02fe5d8800`,q:`Tajikistan is waiting for you.`,f:`Did you know that Tajikistan has a population of about 9.1 million people? Its capital city is Dushanbe.`},Tanzania:{i:`1469854523086-cc02fe5d8800`,q:`Tanzania is waiting for you.`,f:`Did you know that Tanzania has a population of about 56 million people? Its capital city is Dodoma.`},Tennessee:{i:`1433086966358-54859d0ed716`,q:`The Volunteer State.`,f:`Did you know that the Tennessee State has a population of about 7 million people? Its biggest city is Nashville.`},Texas:{i:`1473448912268-2022ce9509d8`,q:`The Lone Star State.`,f:`Did you know that the Texas State has a population of about 29 million people? Its biggest city is Houston.`},Thailand:{i:`1528127269394-b7d91e0a2736`,q:`Land of smiles.`,f:`Did you know that Thailand has a population of about 69 million people? Its capital city is Bangkok.`},"Timor-Leste":{i:`1469854523086-cc02fe5d8800`,q:`Timor-Leste is waiting for you.`,f:`Did you know? Timor-Leste is full of hidden gems waiting to be explored.`},Togo:{i:`1469854523086-cc02fe5d8800`,q:`Togo is waiting for you.`,f:`Did you know that Togo has a population of about 7.9 million people? Its capital city is Lomé.`},Tonga:{i:`1469854523086-cc02fe5d8800`,q:`Tonga is waiting for you.`,f:`Did you know that Tonga has a population of about 103 thousand people? Its capital city is Nuku'alofa.`},"Trinidad And Tobago":{i:`1469854523086-cc02fe5d8800`,q:`Trinidad And Tobago is waiting for you.`,f:`Did you know that Trinidad and Tobago has a population of about 1.4 million people? Its capital city is Port-of-Spain.`},Tunisia:{i:`1469854523086-cc02fe5d8800`,q:`Tunisia is waiting for you.`,f:`Did you know that Tunisia has a population of about 12 million people? Its capital city is Tunis.`},Turkey:{i:`1524231754455-da7484439366`,q:`East meets West.`,f:`Did you know that Turkey has a population of about 82 million people? Its capital city is Ankara.`},Turkmenistan:{i:`1469854523086-cc02fe5d8800`,q:`Turkmenistan is waiting for you.`,f:`Did you know that Turkmenistan has a population of about 5.9 million people? Its capital city is Ashgabat.`},Tuvalu:{i:`1469854523086-cc02fe5d8800`,q:`Tuvalu is waiting for you.`,f:`Did you know that Tuvalu has a population of about 12 thousand people? Its capital city is Funafuti.`},UK:{i:`1486325212042-2e47fa4c13a0`,q:`British heritage.`,f:`Did you know that UK has a population of about 66 million people? Its capital city is London.`},Uae:{i:`1469854523086-cc02fe5d8800`,q:`Uae is waiting for you.`,f:`Did you know that UAE has a population of about 9.6 million people? Its capital city is Abu Dhabi.`},Uganda:{i:`1469854523086-cc02fe5d8800`,q:`Uganda is waiting for you.`,f:`Did you know that Uganda has a population of about 43 million people? Its capital city is Kampala.`},Uk:{i:`1469854523086-cc02fe5d8800`,q:`Uk is waiting for you.`,f:`Did you know that UK has a population of about 66 million people? Its capital city is London.`},Ukraine:{i:`1469854523086-cc02fe5d8800`,q:`Ukraine is waiting for you.`,f:`Did you know that Ukraine has a population of about 45 million people? Its capital city is Kyiv.`},"United Arab Emirates (UAE)":{i:`1512453973954-47efef380d6d`,q:`Future in the sand.`,f:`Did you know? United Arab Emirates (UAE) is full of hidden gems waiting to be explored.`},Uruguay:{i:`1469854523086-cc02fe5d8800`,q:`Uruguay is waiting for you.`,f:`Did you know that Uruguay has a population of about 3.4 million people? Its capital city is Montevideo.`},Usa:{i:`1469854523086-cc02fe5d8800`,q:`Usa is waiting for you.`,f:`Did you know that USA has a population of about 327 million people? Its capital city is Washington.`},Utah:{i:`1447752875215-b2761acb3c5d`,q:`Life Elevated.`,f:`Did you know that the Utah State has a population of about 3 million people? Its biggest city is Salt Lake City.`},Uzbekistan:{i:`1469854523086-cc02fe5d8800`,q:`Uzbekistan is waiting for you.`,f:`Did you know that Uzbekistan has a population of about 33 million people? Its capital city is Toskent.`},Vanuatu:{i:`1469854523086-cc02fe5d8800`,q:`Vanuatu is waiting for you.`,f:`Did you know that Vanuatu has a population of about 293 thousand people? Its capital city is Port-Vila.`},"Vatican City":{i:`1469854523086-cc02fe5d8800`,q:`Vatican City is waiting for you.`,f:`Did you know? Vatican City is full of hidden gems waiting to be explored.`},Venezuela:{i:`1469854523086-cc02fe5d8800`,q:`Venezuela is waiting for you.`,f:`Did you know that Venezuela has a population of about 29 million people? Its capital city is Caracas.`},Vermont:{i:`1464822759023-fed622ff2c3b`,q:`The Green Mountain State.`,f:`Did you know that the Vermont State has a population of about 643 thousand people? Its biggest city is Burlington.`},Vietnam:{i:`1528127269394-b7d91e0a2736`,q:`Timeless charm.`,f:`Did you know that Vietnam has a population of about 96 million people? Its capital city is Hanoi.`},Virginia:{i:`1507525428034-b723cf961d3e`,q:`Virginia is for Lovers.`,f:`Did you know that the Virginia State has a population of about 9 million people? Its biggest city is Virginia Beach.`},Washington:{i:`1476610971033-5c8523b7a2d6`,q:`The Evergreen State.`,f:`Did you know that the Washington State has a population of about 8 million people? Its biggest city is Seattle.`},"West Virginia":{i:`1449844908441-8829872d2607`,q:`Mountain Mama.`,f:`Did you know that the West Virginia State has a population of about 2 million people? Its biggest city is Charleston.`},Wisconsin:{i:`1469474968028-56623f02e42e`,q:`America's Dairyland.`,f:`Did you know that the Wisconsin State has a population of about 6 million people? Its biggest city is Milwaukee.`},Wyoming:{i:`1472214103451-9374bd1c798e`,q:`The Equality State.`,f:`Did you know that the Wyoming State has a population of about 577 thousand people? Its biggest city is Cheyenne.`},Yemen:{i:`1469854523086-cc02fe5d8800`,q:`Yemen is waiting for you.`,f:`Did you know that Yemen has a population of about 28 million people? Its capital city is Sanaa.`},Zambia:{i:`1469854523086-cc02fe5d8800`,q:`Zambia is waiting for you.`,f:`Did you know that Zambia has a population of about 17 million people? Its capital city is Lusaka.`},Zimbabwe:{i:`1469854523086-cc02fe5d8800`,q:`Zimbabwe is waiting for you.`,f:`Did you know that Zimbabwe has a population of about 14 million people? Its capital city is Harare.`}};`Alabama.Alaska.Arizona.Arkansas.California.Colorado.Connecticut.Delaware.Florida.Georgia.Hawaii.Idaho.Illinois.Indiana.Iowa.Kansas.Kentucky.Louisiana.Maine.Maryland.Massachusetts.Michigan.Minnesota.Mississippi.Missouri.Montana.Nebraska.Nevada.New Hampshire.New Jersey.New Mexico.New York.North Carolina.North Dakota.Ohio.Oklahoma.Oregon.Pennsylvania.Rhode Island.South Carolina.South Dakota.Tennessee.Texas.Utah.Vermont.Virginia.Washington.West Virginia.Wisconsin.Wyoming`.split(`.`).sort();var u=e=>typeof e==`object`&&!!e&&!Array.isArray(e),d=e=>Array.isArray(e);function f(e){if(!u(e))return{ok:!1,error:`expected object at top level, got ${typeof e}`};for(let t of[`trips`,`expenses`,`companions`,`categories`,`budgets`,`tripDays`])if(t in e&&!d(e[t]))return{ok:!1,error:`${t} must be an array, got ${typeof e[t]}`};if(d(e.trips)){for(let t of e.trips.slice(0,3))if(!u(t)||typeof t.id!=`string`||typeof t.name!=`string`)return{ok:!1,error:`trip rows missing id/name fields`}}return{ok:!0,value:e}}function p(e){if(!u(e))return{ok:!1,error:`expected object, got ${typeof e}`};for(let t of[`trips`,`expenses`,`groups`,`categories`,`budgets`,`tripDays`,`archivedTrips`,`savedFormats`,`notifications`])if(t in e&&!d(e[t]))return{ok:!1,error:`STATE.${t} must be an array, got ${typeof e[t]}`};return`activeTripId`in e&&e.activeTripId!==null&&typeof e.activeTripId!=`string`?{ok:!1,error:`STATE.activeTripId must be string or null, got ${typeof e.activeTripId}`}:`user`in e&&e.user!==null&&!u(e.user)?{ok:!1,error:`STATE.user must be object or null, got ${typeof e.user}`}:{ok:!0,value:e}}var m={trips:[],activeTripId:null,categories:[{id:`c1`,name:`Food`,icon:`🍔`,color:`#ff3b30`},{id:`c2`,name:`Transport`,icon:`✈️`,color:`#007aff`},{id:`c3`,name:`Accommodation`,icon:`🏨`,color:`#5856d6`}],expenses:[],groups:[],draftExpense:{who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`,euroValue:``},insightCurrency:`EUR`,rateMode:`at_trip`,rateCache:{},user:null,hasLoggedInBefore:!1,excelMapping:{who:`Who`,categoryId:`Category`,label:`Label`,date:`Date`,country:`Country`,value:`Value`,currency:`Currency`,euroValue:`Euro Value`},activities:[],photos:[],budgets:[],savedFormats:[],tripDays:[],archivedTrips:[],activeDetailId:null,notifications:[]};function h(){let e=localStorage.getItem(`theGreatEscapeState`);if(e){let t;try{t=JSON.parse(e)}catch(e){console.error(`localStorage parse failed — starting with empty state:`,e),t=null}if(t){let e=p(t);e.ok?Object.assign(m,e.value):console.error(`localStorage shape invalid — starting with empty state:`,e.error)}}m.savedFormats||=[],m.tripDays||=[],m.archivedTrips||=[],m.tripDays.forEach(e=>{e.tickets||=[],e.notes===void 0&&(e.notes=``),e.plan||={morning:``,afternoon:``,evening:``}}),m.trips.length>0&&(!m.activeTripId||!m.trips.find(e=>e.id===m.activeTripId))&&(m.activeTripId=m.trips[0].id)}function g(){m.tripDays&&m.tripDays.forEach(e=>{e.tickets||=[]}),localStorage.setItem(`theGreatEscapeState`,JSON.stringify(m))}var _=new Map;function v(e,t){return _.has(e)||_.set(e,new Set),_.get(e).add(t),()=>_.get(e)?.delete(t)}function y(e,t){_.get(e)?.forEach(n=>{try{n(t)}catch(t){console.error(`Subscriber for "${e}" threw:`,t)}})}v(t.STATE_CHANGED,g);function b(){try{let e=(typeof navigator<`u`&&navigator.language||`en-US`).split(`-`)[1];if(e&&c[e.toUpperCase()])return c[e.toUpperCase()]}catch{}return`EUR`}function x(){let e=m.user&&m.user.homeCurrency;if(e&&o[e])return e;let t=b();return o[t]?t:`EUR`}function S(e,t,n){if(t===n)return e;let r=o[t]||1,i=o[n]||1;return e*r/i}function C(e,t=`EUR`){let n=x(),r=S(e,t,n);return`${s[n]||n+` `}${r.toFixed(2)}`}function w(e){return s[e]||e+` `}var T={"united states":`Usa`,"united states of america":`Usa`,usa:`Usa`,us:`Usa`,"united kingdom":`UK`,uk:`UK`,"great britain":`UK`,"united arab emirates":`UAE`,czechia:`Czech`,"czech republic":`Czech`,"burkina faso":`Burkina`,"cabo verde":`Cabo`,"cape verde":`Cabo`,"dominican republic":`Dominican`,"equatorial guinea":`Equatorial`,"marshall islands":`Marshall`,"saint vincent and the grenadines":`Saint Vincent`,"st. vincent and the grenadines":`Saint Vincent`,"saint kitts and nevis":`Saint Kitts And Nevis`,"st. kitts and nevis":`Saint Kitts And Nevis`,"sao tome and principe":`Sao Tome And Principe`},E=(()=>{let e={};for(let t of Object.keys(l))e[t.toLowerCase()]=t;for(let[t,n]of Object.entries(T))l[n]&&(e[t]=n);return e})(),D=(()=>{try{return new Intl.DisplayNames([`en`],{type:`region`})}catch{return null}})();function O(e){if(!e||!D)return null;let t;try{t=D.of(e.toUpperCase())}catch{return null}if(!t)return null;let n=E[t.toLowerCase()];return n?l[n]:null}function ee(e){return e?String(e).replace(/^\d{3,6}[\s,-]+/,``).replace(/\s+/g,` `).trim():``}function te(e){if(!e)return null;if(e.includes(` - `)){let t=E[e.split(` - `)[1].trim().toLowerCase()];if(t)return l[t]}let t=e.split(`,`).map(e=>e.trim()).filter(Boolean);for(let e of t){let t=E[e.toLowerCase()];if(t)return l[t]}return null}var ne=e=>`https://images.unsplash.com/photo-${e}?auto=format&fit=crop&w=1600&q=80`;function re(e,t=[]){if(!e)return{quotes:[a.q],images:[ne(a.i)],facts:[a.f]};let n=[],r=new Set,i=e=>{let t=(e||``).toUpperCase();t&&!r.has(t)&&(r.add(t),n.push(t))};i(e.countryCode);for(let e of t)i(e);let o=[];for(let e of n){let t=O(e);t&&o.push(t)}if(o.length===0){let t=te(e.country||``);t&&o.push(t)}if(o.length===0){let t=(e.country||``).split(`,`).map(e=>e.trim()).filter(Boolean),n=t[t.length-1]||e.country||``;o.push({q:`${n} is waiting for you.`,i:`1501854140801-50d01698950b`,f:`Did you know? ${n} is full of hidden gems waiting to be explored.`})}return{quotes:o.map(e=>e.q),images:o.map(e=>ne(e.i)),facts:o.map(e=>e.f)}}function k(e){let t=document.createElement(`div`);t.className=`liquid-alert`,t.style.position=`fixed`,t.style.bottom=`40px`,t.style.left=`50%`,t.style.transform=`translateX(-50%) translateY(100px)`,t.style.background=`rgba(255,255,255,0.7)`,t.style.backdropFilter=`blur(20px)`,t.style.padding=`16px 32px`,t.style.borderRadius=`980px`,t.style.border=`1px solid rgba(255,255,255,0.4)`,t.style.boxShadow=`0 20px 40px rgba(0,0,0,0.1)`,t.style.color=`#002d5b`,t.style.fontWeight=`700`,t.style.zIndex=`99999`,t.style.transition=`all 0.5s cubic-bezier(0.16, 1, 0.3, 1)`,t.innerHTML=`<span>⚠️ ${e}</span>`,document.body.appendChild(t),setTimeout(()=>{t.style.transform=`translateX(-50%) translateY(0)`},10),setTimeout(()=>{t.style.transform=`translateX(-50%) translateY(100px)`,t.style.opacity=`0`,setTimeout(()=>t.remove(),500)},3e3)}function A(e={}){let{title:t=`Are you sure?`,message:n=`This action cannot be undone.`,confirmText:r=`Delete`,confirmColor:i=`#ff3b30`,requireInput:a=!1,onConfirm:o=()=>{}}=e,s=document.createElement(`div`);s.className=`modal-overlay`,s.style.display=`flex`,s.style.backdropFilter=`blur(25px)`,s.innerHTML=`
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
    `,document.body.appendChild(s);let c=s.querySelector(`#modalConfirmBtn`),l=s.querySelector(`#modalCancelBtn`),u=s.querySelector(`#safetyInput`);a&&u&&(u.focus(),u.oninput=e=>{let t=e.target.value.trim().toUpperCase()===a.toUpperCase();c.disabled=!t,t?(c.style.opacity=`1`,c.style.cursor=`pointer`,c.style.boxShadow=`0 15px 35px rgba(255, 59, 48, 0.4)`):(c.style.opacity=`0.3`,c.style.cursor=`not-allowed`,c.style.boxShadow=`0 10px 30px ${i}66`)}),c.onclick=()=>{o(),s.remove()},l.onclick=()=>s.remove(),s.onclick=e=>{e.target===s&&s.remove()}}function j(){return Math.random().toString(36).substr(2,9)}function M(e,t){let n=e.querySelector(t);if(!n)throw Error(`Element not found: ${t}`);return n}function ie(e){if(!e)return``;let t=new Date(e+`T00:00:00Z`);return isNaN(t.getTime())?``:`${String(t.getUTCDate()).padStart(2,`0`)}-${String(t.getUTCMonth()+1).padStart(2,`0`)}-${t.getUTCFullYear()}`}var ae=e=>{let t=document.querySelectorAll(`.settings-tab-btn`),n=document.querySelectorAll(`.settings-section`);t.forEach(e=>e.classList.remove(`active`)),n.forEach(e=>e.classList.remove(`active`));let r=Array.from(t).find(t=>t.innerText.toLowerCase().includes(e.toLowerCase()));r&&r.classList.add(`active`);let i=document.getElementById(`settings-${e}`);i&&i.classList.add(`active`)},N=e=>{let t=document.getElementById(`persMenu`),n=document.getElementById(`persContent`),r=document.getElementById(`persCategories`),i=document.getElementById(`persCompanions`);e===`menu`?(t&&(t.style.display=`grid`),n&&(n.style.display=`none`)):(t&&(t.style.display=`none`),n&&(n.style.display=`block`),r&&(r.style.display=e===`categories`?`block`:`none`),i&&(i.style.display=e===`companions`?`block`:`none`))},oe=e=>{A({title:`Delete Category?`,message:`This will not affect existing expenses, but you won't be able to select this category again.`,confirmText:`Delete`,onConfirm:()=>{m.categories=m.categories.filter(t=>t.id!==e),y(`state:changed`),Ye(),q(`personalization`),setTimeout(()=>N(`categories`),50)}})},se=e=>{A({title:`Remove Companion?`,message:`Remove "${e}" from your travel companions?`,confirmText:`Remove`,onConfirm:()=>{m.groups=m.groups.filter(t=>t!==e),y(`state:changed`),Je(),q(`personalization`),setTimeout(()=>N(`companions`),50)}})};function ce(){let e=document.createElement(`div`);function t(){let e=[`label`,`date`,`value`,`who`,`category`],t=[`country`,`currency`],n=new Set((m.customFormat||[]).map(e=>e.variable)),r=m.savedFormats||[];return`
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px;">
                ${e.map(e=>{let t=n.has(e);return`<span style="padding:6px 14px; border-radius:20px; font-size:0.75rem; font-weight:700; border:1px solid ${t?`rgba(52,199,89,0.3)`:`rgba(255,59,48,0.3)`}; background:${t?`rgba(52,199,89,0.05)`:`rgba(255,59,48,0.05)`}; color:${t?`#34c759`:`#ff3b30`};">
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
                        ${(m.customFormat||[]).length===0?`<tr><td colspan="3" style="padding:32px; text-align:center; color:var(--text-secondary); font-style:italic;">No mappings yet.</td></tr>`:(m.customFormat||[]).map(e=>`
                            <tr style="border-bottom: 1px solid var(--glass-border);">
                                <td style="padding:16px; font-weight:700;">${e.variable}</td>
                                <td style="padding:16px;"><span style="background:#ff9500; color:white; padding:4px 10px; border-radius:8px; font-weight:800; font-size:0.8rem;">${e.column}</span></td>
                                <td style="padding:16px; text-align:center;">
                                    <button class="remove-mapping-btn" data-variable="${e.variable}" style="background:rgba(255,59,48,0.1); border:none; color:#ff3b30; width:32px; height:32px; border-radius:50%; cursor:pointer;">&times;</button>
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
                        ${e.concat(t).filter(e=>!n.has(e)).map(t=>`<option value="${t}">${e.includes(t)?`★ `:``}${t}</option>`).join(``)}
                    </select>
                </div>
                <div style="flex:1; min-width:120px;">
                    <label style="display:block; font-size:0.75rem; font-weight:800; margin-bottom:8px; color:var(--text-secondary);">COLUMN</label>
                    <select id="mapColSelect" class="glass-input" style="width:100%;">
                        <option value="">Col...</option>
                        ${`ABCDEFGHIJKLMNOPQRSTUVWXYZ`.split(``).map(e=>`<option value="${e}">${e}</option>`).join(``)}
                    </select>
                </div>
                <button class="btn btn-liquid-glass" id="addFormatMappingBtn" style="padding: 12px 24px;">Map Field</button>
            </div>

            <div style="border-top: 1px solid var(--glass-border); padding-top: 32px;">
                <h3 style="margin-top:0;">Saved Formats (${r.length}/5)</h3>
                <div style="display:grid; gap:12px;">
                    ${r.map(e=>`
                        <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); padding:16px; border-radius:16px; border:1px solid var(--glass-border);">
                            <div style="font-weight:700;">${e.name}</div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn btn-small edit-saved-format-btn" data-format-id="${e.id}" style="background:rgba(0,113,227,0.1); color:#007aff; border:none; padding:8px 16px; border-radius:12px;">Edit</button>
                                <button class="btn btn-small delete-saved-format-btn" data-format-id="${e.id}" style="background:rgba(255,59,48,0.1); color:#ff3b30; border:none; padding:8px 16px; border-radius:12px;">Delete</button>
                            </div>
                        </div>
                    `).join(``)}
                    ${r.length<5?`
                        <div style="display:flex; gap:12px; margin-top:12px;">
                            <input type="text" id="formatNameInput" class="glass-input" placeholder="Name this format..." style="flex:1;">
                            <button class="btn" id="saveCustomFormatBtn" style="background:var(--accent-blue);">Save Format</button>
                        </div>
                    `:``}
                </div>
            </div>
        `}let n=(e=`menu`)=>`
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #5856d6, #ff2d55); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">System Control</h1>
                <p>Manage your travel data, custom formats, and core preferences.</p>
            </div>

            ${e===`menu`?`
                <div class="settings-grid">
                    <div class="card glass management-card settings-tab-card" data-tab="format" style="cursor: pointer;">
                        <h2 class="card-title" style="color: #ff9500; margin: 0;">Format Options</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Configure Excel import mappings and global data formats.</p>
                        <div style="margin-top: 20px; color: #ff9500; font-weight: 700; font-size: 0.85rem;">Configure &rarr;</div>
                    </div>

                    <div class="card glass management-card danger-card settings-tab-card" data-tab="reset" style="cursor: pointer;">
                        <div class="danger-glow pulse-red"></div>
                        <h2 class="card-title" style="color: #ff3b30; margin: 0;">Data Management</h2>
                        <p style="color: var(--text-secondary); margin: 8px 0 0;">Wipe specific data categories or perform a factory reset.</p>
                        <div style="margin-top: 20px; color: #ff3b30; font-weight: 700; font-size: 0.85rem;">Manage Data &rarr;</div>
                    </div>
                </div>
            `:`
                <button class="btn btn-small btn-liquid-glass settings-tab-card" data-tab="menu" style="margin-bottom: 24px; padding: 10px 20px; border-radius: 14px;">&larr; Back to Control Center</button>
                
                ${e===`reset`?`
                    <div class="settings-grid">
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #007aff; margin-top: 0;">Companions</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Delete your travel companions and groups.</p>
                            <button class="btn btn-small confirm-reset-btn" data-reset-type="groups" style="background: rgba(0, 113, 227, 0.1); color: #007aff; border: 1px solid rgba(0, 113, 227, 0.2); width: 100%;">Clear Groups</button>
                        </div>
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #ff9500; margin-top: 0;">Trips & Days</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Remove all trips, itineraries, and daily logs.</p>
                            <button class="btn btn-small confirm-reset-btn" data-reset-type="trips" style="background: rgba(255, 149, 0, 0.1); color: #ff9500; border: 1px solid rgba(255, 149, 0, 0.2); width: 100%;">Delete All Trips</button>
                        </div>
                        <div class="card glass" style="padding: 24px;">
                            <h3 style="color: #5856d6; margin-top: 0;">Categories</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Reset custom expense categories to defaults.</p>
                            <button class="btn btn-small confirm-reset-btn" data-reset-type="categories" style="background: rgba(88, 86, 214, 0.1); color: #5856d6; border: 1px solid rgba(88, 86, 214, 0.2); width: 100%;">Restore Defaults</button>
                        </div>
                        <div class="card glass danger-card" style="padding: 24px; border-color: rgba(255, 59, 48, 0.3);">
                            <h3 style="color: #ff3b30; margin-top: 0;">Factory Reset</h3>
                            <p style="font-size: 0.85rem; color: var(--text-secondary);">Permanently wipe every trace of data from the app.</p>
                            <button class="btn-confirm-danger confirm-reset-btn" data-reset-type="app" style="font-size: 0.85rem; padding: 12px;">Erase Everything</button>
                        </div>
                    </div>
                `:``}

                ${e===`format`?`
                    <div class="card glass" style="padding: 32px; border-radius: 28px;">
                        <h2 style="color: #ff9500; margin-top: 0;">Custom Excel Mapping</h2>
                        <p style="color: var(--text-secondary); margin-bottom: 24px;">Define how internal app fields map to Excel columns for seamless imports.</p>
                        
                        <div id="mappingTableContainer">
                            ${t()}
                        </div>
                    </div>
                `:``}
            `}
        `,r=t=>{e.innerHTML=n(t)},i=e=>{A({groups:{title:`Clear Companions?`,message:`This will remove all travel companions and group lists.`,confirmText:`Clear All`,onConfirm:()=>{m.groups=[],y(`state:changed`),r(`reset`)}},trips:{title:`Wipe All Trips?`,message:`This permanently deletes every trip, day log, and itinerary.`,confirmText:`Delete Trips`,onConfirm:async()=>{if(m.trips=[],m.archivedTrips=[],m.tripDays=[],m.expenses=[],m.budgets=[],m.activeTripId=null,y(`state:changed`),m.user)try{await fetch(J(`/api/user-data`),{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id})})}catch(e){console.error(`Server wipe failed`,e)}r(`reset`)}},categories:{title:`Reset Categories?`,message:`Reverts all expense categories to the system defaults.`,confirmText:`Restore Defaults`,onConfirm:()=>{m.categories=[{id:`c1`,name:`Food`,icon:`🍔`,color:`#ff3b30`},{id:`c2`,name:`Transport`,icon:`✈️`,color:`#007aff`},{id:`c3`,name:`Accommodation`,icon:`🏨`,color:`#5856d6`}],y(`state:changed`),Ye(),r(`reset`)}},app:{title:`Factory Reset`,message:`Absolute destruction. This wipes EVERY bit of data from the application.`,confirmText:`ERASE EVERYTHING`,onConfirm:async()=>{if(m.user)try{await fetch(J(`/api/user-data`),{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id})})}catch(e){console.error(`Server wipe failed`,e)}m.trips=[],m.archivedTrips=[],m.tripDays=[],m.expenses=[],m.groups=[],m.budgets=[],m.categories=[],m.activeTripId=null,m.user=null,m.notifications=[],m.hasLoggedInBefore=!1,y(`state:changed`),localStorage.clear(),location.reload()}}}[e])},a=()=>{let e=document.getElementById(`mapVarSelect`)?.value,t=document.getElementById(`mapColSelect`)?.value;!e||!t||(m.customFormat=m.customFormat||[],!m.customFormat.some(t=>t.variable===e)&&(m.customFormat.push({variable:e,column:t}),y(`state:changed`),r(`format`)))},o=e=>{m.customFormat=(m.customFormat||[]).filter(t=>t.variable!==e),y(`state:changed`),r(`format`)},s=()=>{let e=[`label`,`date`,`value`,`who`,`category`],t=m.customFormat||[],n=new Set(t.map(e=>e.variable===`categoryId`?`category`:e.variable)),i=e.filter(e=>!n.has(e));if(i.length>0)return alert(`Missing required fields: ${i.join(`, `)}`);let a=(document.getElementById(`formatNameInput`)?.value||``).trim();a&&(m.savedFormats=m.savedFormats||[],m.savedFormats.push({id:j(),name:a,mappings:[...t]}),m.customFormat=[],y(`state:changed`),r(`format`))},c=e=>{A({title:`Delete Format?`,message:`This mapping will no longer be available for imports.`,confirmText:`Delete`,onConfirm:()=>{m.savedFormats=(m.savedFormats||[]).filter(t=>t.id!==e),y(`state:changed`),r(`format`)}})},l=e=>{let t=(m.savedFormats||[]).find(t=>t.id===e);t&&(m.customFormat=[...t.mappings],m.savedFormats=(m.savedFormats||[]).filter(t=>t.id!==e),y(`state:changed`),r(`format`),setTimeout(()=>{let e=document.getElementById(`formatNameInput`);e&&(e.value=t.name)},50))};return e.innerHTML=n(`menu`),e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.settings-tab-card`);if(n?.dataset.tab){r(n.dataset.tab);return}let u=t.closest(`.confirm-reset-btn`);if(u?.dataset.resetType){i(u.dataset.resetType);return}let d=t.closest(`.remove-mapping-btn`);if(d?.dataset.variable){o(d.dataset.variable);return}let f=t.closest(`.edit-saved-format-btn`);if(f?.dataset.formatId){l(f.dataset.formatId);return}let p=t.closest(`.delete-saved-format-btn`);if(p?.dataset.formatId){c(p.dataset.formatId);return}if(t.closest(`#addFormatMappingBtn`)){a();return}if(t.closest(`#saveCustomFormatBtn`)){s();return}}),e}function le(){let e=document.createElement(`div`);return e.innerHTML=`
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #5856d6, #ff2d55); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Personalization</h1>
            <p>Customize your experience, categories, and travel companions.</p>
        </div>

        <div id="persMenu" class="grid-2">
            <div class="card glass card-glow-blue pers-tab-card" data-tab="categories" style="cursor: pointer;">
                <h2 class="card-title" style="color: var(--accent-blue);">Manage Categories</h2>
                <p style="color: var(--text-secondary);">Customize expense categories, icons, and colors.</p>
            </div>
            <div class="card glass card-glow-purple pers-tab-card" data-tab="companions" style="cursor: pointer;">
                <h2 class="card-title" style="color: #5856d6;">Manage Companions</h2>
                <p style="color: var(--text-secondary);">Add the people who usually travel and split expenses with you.</p>
            </div>
        </div>

        <div id="persContent" style="display: none;">
            <button class="btn btn-small btn-liquid-glass pers-tab-card" data-tab="menu" style="margin-bottom: 20px;">&larr; Back to Personalization</button>
            
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
                            ${m.categories.map(e=>`
        <tr style="border-bottom: 1px solid var(--glass-border)">
            <td style="padding: 12px; font-weight: 500;">${e.icon} ${e.name}</td>
            <td style="padding: 12px; text-align: right;"><span style="display:inline-block; width:12px; height:12px; border-radius:50%; background: ${e.color}"></span></td>
            <td style="padding: 12px; text-align: right;">
                <button class="btn-small delete-category-btn" data-category-id="${e.id}" style="background:none; color:#ff3b30; border:none; cursor:pointer;">✕</button>
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
                            ${m.groups.map(e=>`
        <tr style="border-bottom: 1px solid var(--glass-border)">
            <td style="padding: 12px; font-weight: 500;">${e}</td>
            <td style="padding: 12px; text-align: right;">
                <button class="btn-small delete-companion-btn" data-companion="${e}" style="background:none; color:#ff3b30; border:none; cursor:pointer;">✕</button>
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
    `,e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.pers-tab-card`);if(n?.dataset.tab){N(n.dataset.tab);return}let r=t.closest(`.delete-category-btn`);if(r?.dataset.categoryId){oe(r.dataset.categoryId);return}let i=t.closest(`.delete-companion-btn`);if(i?.dataset.companion){se(i.dataset.companion);return}}),setTimeout(()=>{let t=e.querySelector(`#addCatBtn`);t&&t.addEventListener(`click`,()=>{let t=M(e,`#catIcon`).value,n=M(e,`#catName`).value.trim(),r=M(e,`#catColor`).value;n&&(m.categories.push({id:j(),name:n,icon:t,color:r}),y(`state:changed`),Ye(),q(`personalization`),setTimeout(()=>N(`categories`),50))});let n=e.querySelector(`#addPersonBtn`);n&&n.addEventListener(`click`,()=>{let t=M(e,`#newPerson`).value.trim();t&&!m.groups.includes(t)&&(m.groups.push(t),y(`state:changed`),Je(),q(`personalization`),setTimeout(()=>N(`companions`),50))})},0),e}function ue({placeInput:e,hint:t,submitBtn:n,initialPlace:r=null}){let i=r,a=()=>{n.disabled=!1,n.style.opacity=`1`,n.style.cursor=`pointer`},o=()=>{n.disabled=!0,n.style.opacity=`0.4`,n.style.cursor=`not-allowed`},s=e=>{i=e,e?(a(),t.textContent=`📍 ${e.name}`,t.style.color=`#34c759`):(o(),t.textContent=`Pick a suggestion to confirm the location.`,t.style.color=`rgba(255,255,255,0.5)`)};if(r&&(e.value=r.name,t.textContent=`📍 ${r.name}`,t.style.color=`rgba(255,255,255,0.5)`,a()),typeof google>`u`||!google.maps||!google.maps.places)return t.textContent=`⚠ Google Maps failed to load. Check your API key + billing.`,t.style.color=`#ff9500`,e.oninput=()=>{let t=e.value.trim();t.length>1?s({placeId:``,name:t,lat:0,lng:0,viewport:null,types:[],countryCode:null}):s(null)},{getPicked:()=>i};let c=new google.maps.places.Autocomplete(e,{fields:[`place_id`,`name`,`formatted_address`,`geometry`,`types`,`address_components`]});return c.addListener(`place_changed`,()=>{let t=c.getPlace();if(!t||!t.geometry||!t.geometry.location){s(null);return}let n=t.geometry.location,r=t.geometry.viewport,i=(t.address_components||[]).find(e=>(e.types||[]).includes(`country`)),a=i&&i.short_name||null;s({placeId:t.place_id||``,name:t.formatted_address||t.name||e.value,lat:n.lat(),lng:n.lng(),viewport:r?{south:r.getSouthWest().lat(),west:r.getSouthWest().lng(),north:r.getNorthEast().lat(),east:r.getNorthEast().lng()}:null,types:t.types||[],countryCode:a})}),e.addEventListener(`input`,()=>{i&&e.value!==i.name&&s(null)}),{getPicked:()=>i}}var P=()=>{let e=document.createElement(`div`);e.className=`modal-overlay`,e.style.display=`flex`,e.style.backdropFilter=`blur(25px)`,e.innerHTML=`
        <div class="card glass" style="width: 420px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 1.8rem; margin-bottom: 24px; color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">New Trip</h2>
            <form id="newTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: 16px; width: 100%;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Adventure Name</label>
                    <input type="text" id="tripName" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="e.g. Summer in Tuscany" required>
                </div>
                <div style="margin-bottom: 8px; width: 100%; position: relative;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Destination</label>
                    <input type="text" id="tripPlaceInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="tripPlaceHint" style="margin: 8px 4px 0; font-size: 0.75rem; color: rgba(255,255,255,0.5); font-weight: 500;">Pick a suggestion to confirm the location.</p>
                </div>
                <div style="display: flex; gap: 12px; width: 100%; margin-top: 16px;">
                    <button type="submit" id="newTripSubmitBtn" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2); opacity: 0.4; cursor: not-allowed;" disabled>Create Trip</button>
                    <button type="button" id="cancelTripBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem;">Cancel</button>
                </div>
            </form>
        </div>
    `,document.body.appendChild(e);let{getPicked:t}=ue({placeInput:M(e,`#tripPlaceInput`),hint:M(e,`#tripPlaceHint`),submitBtn:M(e,`#newTripSubmitBtn`)});M(e,`#cancelTripBtn`).onclick=()=>e.remove(),M(e,`#newTripForm`).onsubmit=n=>{n.preventDefault();let r=t();if(!r){k(`Pick a destination from the suggestions.`);return}let i=j(),a={id:i,name:M(e,`#tripName`).value,country:r.name,placeId:r.placeId,lat:r.lat,lng:r.lng,viewport:r.viewport,placeTypes:r.types,countryCode:r.countryCode,budget:0,isArchived:!1};m.trips.push(a),m.activeTripId=i,y(`state:changed`),Q(a),e.remove(),q(`home`)}},de=e=>{if(!e)return;let t=document.createElement(`div`);t.className=`modal-overlay`,t.style.display=`flex`,t.style.backdropFilter=`blur(25px)`,t.innerHTML=`
        <div class="card glass" style="width: 420px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
            <h2 class="card-title" style="font-size: 1.8rem; margin-bottom: 24px; color: #ffffff; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Edit Trip</h2>
            <form id="editTripForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                <div style="margin-bottom: 16px; width: 100%;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Adventure Name</label>
                    <input type="text" id="editTripName" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" required>
                </div>
                <div style="margin-bottom: 8px; width: 100%; position: relative;">
                    <label style="display: block; margin-bottom: 8px; font-size: 0.75rem; font-weight: 800; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em;">Destination</label>
                    <input type="text" id="editTripPlaceInput" class="glass-input" style="width: 100%; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); box-sizing: border-box;" placeholder="Search a country, city, or address..." autocomplete="off">
                    <p id="editTripPlaceHint" style="margin: 8px 4px 0; font-size: 0.75rem; color: rgba(255,255,255,0.5); font-weight: 500;">Pick a new suggestion to change the location, or just rename.</p>
                </div>
                <div style="display: flex; gap: 12px; width: 100%; margin-top: 16px;">
                    <button type="submit" id="editTripSubmitBtn" class="btn" style="flex: 2; padding: 12px; border-radius: 14px; background: #0071e3; color: #ffffff; font-weight: 800; font-size: 0.95rem; box-shadow: 0 8px 16px rgba(0,113,227,0.2);">Save Changes</button>
                    <button type="button" id="cancelEditTripBtn" class="btn" style="flex: 1; padding: 12px; border-radius: 14px; background: rgba(255,255,255,0.15); color: #ffffff; font-weight: 600; border: 1px solid rgba(255,255,255,0.2); font-size: 0.85rem;">Cancel</button>
                </div>
            </form>
        </div>
    `,document.body.appendChild(t);let n=M(t,`#editTripName`);n.value=e.name||``;let r=M(t,`#editTripPlaceInput`),i=M(t,`#editTripPlaceHint`),a=M(t,`#editTripSubmitBtn`),o=e.placeId||e.lat?{placeId:e.placeId||``,name:e.country||``,lat:e.lat||0,lng:e.lng||0,viewport:e.viewport||null,types:e.placeTypes||[],countryCode:e.countryCode||null}:null,{getPicked:s}=ue({placeInput:r,hint:i,submitBtn:a,initialPlace:o});M(t,`#cancelEditTripBtn`).onclick=()=>t.remove(),M(t,`#editTripForm`).onsubmit=r=>{r.preventDefault();let i=n.value.trim();if(!i){k(`Trip name can't be empty.`);return}let a=s();if(!a){k(`Pick a destination from the suggestions.`);return}let c=a.placeId!==(o?.placeId||``)||a.name!==(o?.name||``);if(e.name=i,e.country=a.name,e.placeId=a.placeId,e.lat=a.lat,e.lng=a.lng,e.viewport=a.viewport,e.placeTypes=a.types,e.countryCode=a.countryCode,c&&m.mapViews&&(delete m.mapViews[e.id],delete m.mapViews[e.id+`_ai`]),c){let t=(m.tripDays||[]).find(t=>t.tripId===e.id&&t.dayNumber===0);t&&(t.lat=a.lat,t.lng=a.lng,t.lon=a.lng)}y(`state:changed`),Q(e),t.remove(),q(`home`,null,!0)}},fe=()=>{if(!m.activeTripId){k(`Please create a trip before adding days.`);return}let e=(m.tripDays||[]).filter(e=>e.tripId===m.activeTripId).sort((e,t)=>e.dayNumber-t.dayNumber),t=e.filter(e=>e.dayNumber>0),n=(t.length>0?t[t.length-1].dayNumber:0)+1,r=``;if(e.length>0){let t=e[e.length-1];if(t.date){let e=new Date(t.date);e.setDate(e.getDate()+1),r=e.toISOString().split(`T`)[0]}}let i=document.createElement(`div`);i.className=`modal-overlay`,i.style.display=`flex`,i.style.backdropFilter=`blur(25px)`,i.innerHTML=`
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
    `,document.body.appendChild(i);let a=m.activeTripId;M(i,`#cancelDayBtn`).onclick=()=>i.remove(),M(i,`#addDayForm`).onsubmit=async e=>{e.preventDefault();let t={id:j(),tripId:a,name:M(i,`#dayName`).value,date:M(i,`#dayDate`).value,dayNumber:n,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``}};m.tripDays.push(t),y(`state:changed`),await $(t),i.remove(),q(`home`)}},pe=null;function F(){pe&&=(clearInterval(pe),null)}var me={},I=null,L=null,R=null,he=e=>{R=R===e?null:e,q(`home`,null,!0)},ge=e=>{let t=m.tripDays.find(t=>t.id===e);t&&(I=e,k(`Click on the map to set the location for this day!`),L=e=>{t.lat=e.latlng.lat,t.lon=e.latlng.lng,t.lng=e.latlng.lng,L=null,q(`home`,null,!0)},q(`home`,null,!0))},_e=e=>{I=e,q(`home`,null,!0)},ve=async e=>{let t=m.tripDays.find(t=>t.id===e);t&&(I=null,L=null,y(`state:changed`),await $(t),k(`Location saved!`),q(`home`,null,!0))},ye=async e=>{let t=m.tripDays.find(t=>t.id===e);t&&(t.lat=null,t.lon=null,t.lng=null,I=null,L=null,y(`state:changed`),await $(t),q(`home`,null,!0))},be=e=>{let t=m.tripDays.find(t=>t.id===e);t&&A({title:`Delete Day ${t.dayNumber}?`,message:`This removes the day and all its journaling, photos, and documents. This can't be undone.`,confirmText:`Delete Day`,onConfirm:async()=>{let n=t.tripId;m.tripDays=m.tripDays.filter(t=>t.id!==e),m.tripDays.filter(e=>e.tripId===n).sort((e,t)=>e.dayNumber-t.dayNumber).forEach((e,t)=>{e.dayNumber=t+1}),R===e&&(R=null),I===e&&(I=null,L=null),y(`state:changed`),await Qe(e),await Promise.all(m.tripDays.filter(e=>e.tripId===n).map(e=>$(e))),k(`Day deleted`),q(`home`,null,!0)}})};function xe(){let e=document.createElement(`div`),t=m.trips&&m.activeTripId?m.trips.find(e=>e.id===m.activeTripId):null,n=0,r=[],a=[],o=()=>{};if(t){let e=localStorage.getItem(`home_media_toggle`)!==`fact`;localStorage.setItem(`home_media_toggle`,e?`fact`:`quote`);let i=new Set;t.countryCode&&i.add(t.countryCode);let s=(m.tripDays||[]).filter(e=>e.tripId===t.id);for(let e of s){let t=e.lat,n=e.lon||e.lng;if(!(typeof t!=`number`||typeof n!=`number`))try{let e=sessionStorage.getItem(`tggDayCountry:${t.toFixed(4)},${n.toFixed(4)}`);e&&i.add(e)}catch{}}(()=>{let o=re(t,[...i]),s=e?o.quotes:o.facts,c=s.length>0?Math.floor(Math.random()*s.length):0;a=[s[c]||``],r=o.images.length>c?[o.images[c]]:o.images[0]?[o.images[0]]:[],n>=r.length&&(n=0)})(),o=e=>{if(!e)return;let t=e.toUpperCase();i.add(t)}}else{r=i.map(e=>e.i),a=i.map(e=>e.q);let e=Array.from({length:r.length},(e,t)=>t);e.sort(()=>Math.random()-.5),r=e.map(e=>r[e]),a=e.map(e=>a[e])}let s=()=>{if(r.length<=1)return;n=(n+1)%r.length;let t=e.querySelector(`#homeHeroImg`),i=e.querySelector(`#homeQuote`);t&&(t.style.opacity=`0`,setTimeout(()=>{t.src=r[n],t.style.opacity=`1`},800)),i&&(i.style.opacity=`0`,setTimeout(()=>{i.innerText=a[n%a.length]||``,i.style.opacity=`1`},800))};if(!t)e.innerHTML=`
            <div class="ai-page-header" style="padding: 40px; text-align: center; border-radius: 28px;">
                <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; font-size: 3.5rem;">Let's travel.</h1>
                <p style="color: var(--text-secondary); max-width: 440px; margin: 10px auto 0; font-size: 1.1rem;">Your next big adventure is waiting. Create a trip to start tracking expenses and planning days.</p>
            </div>
            
            <div class="card glass" style="padding: 0; overflow: hidden; height: 450px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
                <img id="homeHeroImg" src="${r[0]||``}" style="width: 100%; height: 100%; object-fit: cover; transition: opacity 0.8s ease-in-out;">
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%);"></div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; display: flex; align-items: flex-end; justify-content: space-between;">
                    <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out; max-width: 60%;">
                        ${a[0]||``}
                    </p>
                    <button class="btn" id="homeCreateFirstTripBtn" style="background: var(--accent-blue); padding: 12px 24px; border-radius: 100px; box-shadow: 0 10px 20px rgba(0,113,227,0.3); font-weight: 700; font-size: 0.95rem;">Create Trips</button>
                </div>
            </div>
        `,F(),pe=setInterval(s,6e3),e.querySelector(`#homeCreateFirstTripBtn`)?.addEventListener(`click`,()=>P());else{let n=(m.expenses||[]).filter(e=>e&&e.tripId===t.id),r=(m.tripDays||[]).filter(e=>e.tripId===t.id),i=n.length===0&&r.length===0,s=`Welcome back, traveler`;if(i&&t.country){let e=ee(t.country.includes(` - `)?t.country.split(` - `)[1]:t.country),n=[`Welcome back, ${m.user&&m.user.firstName?m.user.firstName:`traveler`}!`,`Ready for your ${t.name} adventure?`,`Your ${e} adventure starts here.`,`Time to write your ${e} story.`];s=n[Math.floor(Math.random()*n.length)]}e.innerHTML=`
            <div class="ai-page-header" style="text-align: center;">
                <h1 style="background: linear-gradient(135deg, #007aff, #5856d6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${s}</h1>
                ${t?`<p>You have <strong>${n.length}</strong> expenses recorded for ${t.name}.</p>`:`<p>Welcome! Start by creating your first trip.</p>`}
            </div>
            
            <div class="card glass" style="padding: 0; overflow: hidden; height: 400px; position: relative; margin-top: 24px; border-radius: 28px; border: 1px solid var(--glass-border);">
                <div id="homeHeroMap" style="width: 100%; height: 100%; position: absolute; inset: 0; z-index: 0;"></div>
                <div style="position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); pointer-events: none; z-index: 1;"></div>
                <div style="position: absolute; bottom: 40px; left: 40px; right: 40px; pointer-events: none; z-index: 2;">
                    <p id="homeQuote" style="font-size: 1.5rem; font-weight: 700; color: white; margin: 0; text-shadow: 0 2px 10px rgba(0,0,0,0.5); font-style: italic; transition: opacity 0.8s ease-in-out;">
                        ${a[0]||``}
                    </p>
                </div>
            </div>
        `,F(),setTimeout(()=>{let e=document.getElementById(`homeHeroMap`);if(e&&typeof google<`u`&&google.maps&&t){let n=t.country||``,r=n.includes(` - `)?n.split(` - `)[1]+`, USA`:n,i=t?t.id:null,a=i&&m.mapViews&&m.mapViews[i],s={center:a?{lat:a.lat,lng:a.lng}:{lat:20,lng:0},zoom:a?a.zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,keyboardShortcuts:!1,gestureHandling:`greedy`,backgroundColor:`#ffffff`,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[{featureType:`poi`,elementType:`labels.icon`,stylers:[{visibility:`off`}]},{featureType:`poi`,elementType:`labels.text`,stylers:[{visibility:`off`}]},{featureType:`poi.park`,elementType:`labels.text`,stylers:[{visibility:`simplified`}]},{featureType:`transit.station`,elementType:`labels.icon`,stylers:[{visibility:`off`}]}]},c=new google.maps.Map(e,s);window.activeMap=c;let l=t?(m.tripDays||[]).filter(e=>e.tripId===t.id):[];me={},l.forEach(e=>{if(e.lat&&(e.lon||e.lng)){let t=e.lon||e.lng,n=I===e.id,r=e.dayNumber===0,i=new google.maps.Marker({position:{lat:e.lat,lng:t},map:c,draggable:n,title:r?`Trip Genesis`:`Day ${e.dayNumber}: ${e.name}`,label:r?void 0:{text:String(e.dayNumber),color:`white`,fontWeight:`800`,fontSize:n?`16px`:`14px`},icon:{path:google.maps.SymbolPath.CIRCLE,fillOpacity:1,fillColor:n?`#ff3b30`:r?`#34c759`:`#007aff`,strokeColor:`white`,strokeWeight:3,scale:n||r?22:18},zIndex:r?1:100});me[e.id]=i,n?i.addListener(`dragend`,()=>{let t=i.getPosition();e.lat=t.lat(),e.lon=t.lng(),e.lng=t.lng()}):i.addListener(`click`,()=>{c.panTo(i.getPosition()),c.setZoom(12)})}}),L&&(c.addListener(`click`,e=>L({latlng:{lat:e.latLng.lat(),lng:e.latLng.lng()}})),e.style.cursor=`crosshair`),c.addListener(`idle`,()=>{if(!i)return;m.mapViews||={};let e=c.getCenter();m.mapViews[i]={lat:e.lat(),lng:e.lng(),zoom:c.getZoom()},y(`state:changed`)});let u=r.trim();if(!a)if(t.viewport){let e=t.viewport,n=new google.maps.LatLngBounds({lat:e.south,lng:e.west},{lat:e.north,lng:e.east});google.maps.event.addListenerOnce(c,`tilesloaded`,()=>{c.fitBounds(n)})}else new google.maps.Geocoder().geocode({address:u},(e,n)=>{if(n===`OK`&&e[0]){let n=e[0].geometry.viewport;google.maps.event.addListenerOnce(c,`tilesloaded`,()=>{c.fitBounds(n)});let r=n.getSouthWest(),i=n.getNorthEast(),a=e[0].geometry.location;t.lat=a.lat(),t.lng=a.lng(),t.viewport={south:r.lat(),west:r.lng(),north:i.lat(),east:i.lng()},Q(t)}});if(l.some(e=>typeof e.lat==`number`)){let e=google,t=`tggDayCountry:`,n=async(n,r)=>{let i=`${n.toFixed(4)},${r.toFixed(4)}`;try{let e=sessionStorage.getItem(t+i);if(e)return e}catch{}try{let a=await new e.maps.Geocoder().geocode({location:{lat:n,lng:r}}),o=a&&a.results||[];for(let e of o){let n=(e.address_components||[]).find(e=>(e.types||[]).includes(`country`));if(n&&n.short_name){let e=n.short_name.toUpperCase();try{sessionStorage.setItem(t+i,e)}catch{}return e}}}catch{}return``};(async()=>{for(let e of l){let t=e.lat,r=e.lon||e.lng;if(typeof t!=`number`||typeof r!=`number`)continue;let i=await n(t,r);i&&o(i)}})()}}},100)}let c=t?(m.expenses||[]).filter(e=>e&&e.tripId===t.id):[],l=t?(m.tripDays||[]).filter(e=>e.tripId===t.id):[],u=document.createElement(`div`);u.style.marginTop=`40px`,m.guideProgress||={};let d=!!m.user||window.isGoogleAuthenticated===!0,f=m.trips.length>0,p=(m.groups||[]).length>0,h=l.length>0,g=c.length>0,_=m.budgets&&m.budgets.length>0,v=m.archivedTrips&&m.archivedTrips.length>0,b=(m.categories||[]).length>3,x=m.expenses.some(e=>e.isSettlement);d&&(m.guideProgress.login=!0),f&&(m.guideProgress.trip=!0),p&&(m.guideProgress.companions=!0),h&&(m.guideProgress.plan=!0),g&&(m.guideProgress.expenses=!0),_&&(m.guideProgress.budgets=!0),v&&(m.guideProgress.collections=!0),b&&(m.guideProgress.categories=!0),x&&(m.guideProgress.settlement=!0);let S=[{text:`Log in to your account`,done:m.guideProgress.login,icon:`🔐`,action:()=>q(`profile`)},{text:`Create your first trip`,done:m.guideProgress.trip,icon:`✈️`,action:()=>P()},{text:`Add your travel companions`,done:m.guideProgress.companions,icon:`👥`,action:()=>{q(`personalization`),setTimeout(()=>N(`companions`),50)}},{text:`Set your own categories`,done:m.guideProgress.categories,icon:`🏷️`,action:()=>{q(`personalization`),setTimeout(()=>N(`categories`),50)}},{text:`Generate your AI travel plan<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(or <span data-guide-action="open-add-day" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">create it manually</span>)</span>`,done:m.guideProgress.plan,icon:`✦`,action:()=>q(`ai`)},{text:`Input your expenses<br><span style="font-size: 0.85rem; opacity: 0.8; font-weight: 500;">(<span data-guide-action="navigate-expenses" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">Manually</span> or <span data-guide-action="navigate-upload" style="text-decoration: underline; color: var(--accent-blue); cursor: pointer;">in a batch</span>)</span>`,done:m.guideProgress.expenses,icon:`💰`,action:()=>q(`expenses`)},{text:`Explore Budgets`,done:m.guideProgress.budgets,icon:`📊`,action:()=>q(`budgets`)},{text:`Settle your first expenses`,done:m.guideProgress.settlement,icon:`🤝`,action:()=>q(`settlement`)},{text:`Discover Collections`,done:m.guideProgress.collections,icon:`📂`,action:()=>q(`collections`)},{text:`Connect with your friends`,done:m.guideProgress.friends,icon:`📱`,action:()=>q(`friends`)}],C=S.every(e=>e.done)||m.guideAllDone;C&&!m.guideAllDone&&(m.guideAllDone=!0,y(`state:changed`));let w=document.createElement(`div`);if(w.style.marginTop=`40px`,t&&typeof t.lat==`number`&&typeof t.lng==`number`&&!l.some(e=>e.dayNumber===0)){let e={id:j(),tripId:t.id,name:`Starting Point`,date:``,dayNumber:0,lat:t.lat,lng:t.lng,photos:[],notes:``,plan:{morning:``,afternoon:``,evening:``},tickets:[],documents:[]};m.tripDays.push(e),l.push(e),$(e)}l.sort((e,t)=>e.dayNumber-t.dayNumber);let T=t&&t.name?t.name:`Your Journey`;if(w.innerHTML=`
        <div style="display: flex; flex-direction: column; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                ${t?`
                    <button id="resetMapViewBtn" title="Reset the map view to show the whole trip" style="background: none; border: none; padding: 0; margin: 0; cursor: pointer; text-align: left;" onmouseover="this.querySelector('h2').style.color='var(--accent-blue)';" onmouseout="this.querySelector('h2').style.color='#002d5b';">
                        <h2 style="font-size: 1.8rem; letter-spacing: -0.03em; margin: 0; font-weight: 800; color: #002d5b; transition: color 0.2s;">${T}</h2>
                    </button>
                `:`
                    <h2 style="font-size: 1.8rem; letter-spacing: -0.03em; margin: 0; font-weight: 800; color: #002d5b;">${T}</h2>
                `}
                ${t?`
                    <button id="editTripBtn" title="Edit trip name and location" style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border-radius: 10px; border: 1px solid rgba(0,0,0,0.06); background: rgba(0,0,0,0.03); color: #002d5b; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.08)'; this.style.borderColor='rgba(0,113,227,0.2)'; this.style.color='var(--accent-blue)';" onmouseout="this.style.background='rgba(0,0,0,0.03)'; this.style.borderColor='rgba(0,0,0,0.06)'; this.style.color='#002d5b';">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                `:``}
            </div>
            <p style="font-size: 0.95rem; color: var(--text-secondary); margin: 6px 0 0; font-weight: 500;">${l.length} Day${l.length===1?``:`s`} of adventure</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 32px; position: relative; padding-left: 20px;">
            <!-- Subtle Timeline Line -->
            <div style="position: absolute; left: 10px; top: 10px; bottom: 10px; width: 2px; background: linear-gradient(180deg, var(--accent-blue) 0%, rgba(0,113,227,0.05) 100%); border-radius: 1px; opacity: 0.3;"></div>

            ${l.map(e=>{let n=R===e.id,r=e.dayNumber===0;return`
                <div style="display: flex; align-items: flex-start; gap: ${n?`24px`:`0`}; position: relative; transition: gap 0.4s cubic-bezier(0.16, 1, 0.3, 1);">
                    <!-- Timeline Dot — Starting Point uses a green dot to distinguish from numbered days -->
                    <div style="position: absolute; left: -14px; top: 22px; width: 10px; height: 10px; border-radius: 50%; background: ${n?r?`#34c759`:`var(--accent-blue)`:`white`}; border: 2px solid ${r?`#34c759`:`var(--accent-blue)`}; z-index: 2; box-shadow: 0 0 0 4px white;"></div>

                    <!-- LEFT SPACE MENU — collapses both width AND height to 0 when closed.
                         (Width alone isn't enough: flex column children still stack to their
                         natural height, which would inflate the row and leave a vertical gap.) -->
                    <div style="width: ${n?`200px`:`0`}; min-width: ${n?`200px`:`0`}; max-height: ${n?`500px`:`0`}; opacity: ${+!!n}; transform: translateX(${n?`0`:`-20px`}); transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.4s cubic-bezier(0.16, 1, 0.3, 1), max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); pointer-events: ${n?`auto`:`none`}; overflow: hidden; display: flex; flex-direction: column; gap: 8px; padding-top: ${n?`4px`:`0`};">
                        <div style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--accent-blue); margin-bottom: 4px; padding-left: 12px;">Actions</div>
                        
                        ${I===e.id?`
                            <div style="display: flex; gap: 4px;">
                                <button class="day-pin-save-btn" data-day-id="${e.id}" style="flex: 2; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 12px; border: none; background: #34c759; color: white; font-size: 0.85rem; font-weight: 700; cursor: pointer;">Save Pin</button>
                                <button class="day-pin-delete-btn" data-day-id="${e.id}" style="flex: 1; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 12px; border: none; background: rgba(255,59,48,0.1); color: #ff3b30; font-size: 0.85rem; font-weight: 700; cursor: pointer;">X</button>
                            </div>
                        `:`
                            <button class="day-pin-toggle-btn" data-day-id="${e.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,113,227,0.06); color: var(--accent-blue); font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.12)';" onmouseout="this.style.background='rgba(0,113,227,0.06)';">
                                <span>${e.lat?`📍 Edit Pin Location`:`📍 Add Pin to Map`}</span>
                            </button>
                        `}

                        <button class="day-journaling-btn" data-day-id="${e.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>✍️ Journaling</span>
                        </button>

                        <button class="day-photos-btn" data-day-id="${e.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>📸 Add Photos</span>
                        </button>

                        <button class="day-documents-btn" data-day-id="${e.id}" style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(0,0,0,0.03); color: #002d5b; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.06)';" onmouseout="this.style.background='rgba(0,0,0,0.03)';">
                            <span>📄 Documents</span>
                        </button>

                        <button class="day-delete-btn" data-day-id="${e.id}" style="margin-top: 4px; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: none; background: rgba(255,59,48,0.06); color: #ff3b30; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.12)';" onmouseout="this.style.background='rgba(255,59,48,0.06)';">
                            <span>🗑️ Delete Day</span>
                        </button>
                    </div>

                    <!-- MAIN CARD -->
                    <div class="day-card card glass"
                         data-day-id="${e.id}"
                         style="flex: 1; padding: 20px 28px; border-radius: 28px; border: 1.5px solid ${n?`var(--accent-blue)`:`rgba(0,0,0,0.05)`}; background: ${n?`rgba(255,255,255,0.95)`:`white`}; cursor: pointer; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: ${n?`0 20px 40px rgba(0,0,0,0.1)`:`none`};"
                         onmouseover="${n?``:`this.style.transform='translateX(8px)'; this.style.borderColor='rgba(0,113,227,0.2)';`}"
                         onmouseout="${n?``:`this.style.transform='none'; this.style.borderColor='rgba(0,0,0,0.05)';`}">
                        
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 20px;">
                                ${r?`
                                    <div style="background: linear-gradient(135deg, #34c759, #30b350); color: white; width: 54px; height: 54px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; box-shadow: 0 10px 20px rgba(52,199,89,0.18);">
                                        <span style="font-size: 1.6rem; line-height: 1;">📍</span>
                                    </div>
                                `:`
                                    <div style="background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; width: 54px; height: 54px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; box-shadow: 0 10px 20px rgba(0,113,227,0.15);">
                                        <span style="font-size: 0.65rem; font-weight: 800; text-transform: uppercase; opacity: 0.8; letter-spacing: 0.05em; line-height: 1;">Day</span>
                                        <span style="font-size: 1.4rem; font-weight: 800; line-height: 1.1;">${e.dayNumber}</span>
                                    </div>
                                `}
                                <div style="display: flex; flex-direction: column;">
                                    <h3 style="margin: 0; font-size: 1.3rem; font-weight: 800; color: #002d5b; letter-spacing: -0.02em;">${r?`Trip Genesis`:e.name}</h3>
                                    <div style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600; margin-top: 4px; display: flex; align-items: center; gap: 8px;">
                                        ${r?`<span>${t&&t.country?ee(t.country):`Where the trip begins`}</span>`:`<span>📅 ${ie(e.date)||`Set date`}</span>`}
                                        ${e.lat&&!r?`<span style="color: var(--accent-blue); opacity: 0.6;">•</span> <span style="color: var(--accent-blue);">📍 Location Set</span>`:``}
                                    </div>
                                </div>
                            </div>
                            
                            <div style="display: flex; align-items: center; gap: 16px;">
                                ${n?`
                                    <button class="btn btn-liquid-glass day-detail-btn" data-day-id="${e.id}" style="padding: 8px 16px; font-size: 0.8rem; font-weight: 700; background: var(--accent-blue); color: white; border: none; border-radius: 10px;">Open Full Plan</button>
                                `:`
                                    <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.03); display: flex; align-items: center; justify-content: center; color: #002d5b; transition: all 0.3s;">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                    </div>
                                `}
                            </div>
                        </div>

                        ${n&&e.notes?`
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
    `,t&&(e.appendChild(w),w.addEventListener(`click`,e=>{let n=e.target;if(!n)return;if(n.closest(`#resetMapViewBtn`)){let e=window.activeMap;if(!e||!t)return;let n=google,r=new n.maps.LatLngBounds;typeof t.lat==`number`&&typeof t.lng==`number`&&r.extend({lat:t.lat,lng:t.lng});let i=(m.tripDays||[]).filter(e=>e.tripId===t.id);for(let e of i)typeof e.lat==`number`&&r.extend({lat:e.lat,lng:e.lon||e.lng});if(!r.isEmpty())e.fitBounds(r,80);else if(t.viewport){let r=t.viewport;e.fitBounds(new n.maps.LatLngBounds({lat:r.south,lng:r.west},{lat:r.north,lng:r.east}))}return}if(n.closest(`#editTripBtn`)){de(t);return}let r=n.closest(`.day-pin-save-btn`);if(r?.dataset.dayId){ve(r.dataset.dayId);return}let i=n.closest(`.day-pin-delete-btn`);if(i?.dataset.dayId){ye(i.dataset.dayId);return}let a=n.closest(`.day-pin-toggle-btn`);if(a?.dataset.dayId){let e=a.dataset.dayId;m.tripDays.find(t=>t.id===e)?.lat?_e(e):ge(e);return}let o=n.closest(`.day-journaling-btn`);if(o?.dataset.dayId){Se(o.dataset.dayId);return}let s=n.closest(`.day-photos-btn`);if(s?.dataset.dayId){z(s.dataset.dayId);return}let c=n.closest(`.day-documents-btn`);if(c?.dataset.dayId){B(c.dataset.dayId);return}let l=n.closest(`.day-delete-btn`);if(l?.dataset.dayId){be(l.dataset.dayId);return}let u=n.closest(`.day-detail-btn`);if(u?.dataset.dayId){Ce(u.dataset.dayId);return}let d=n.closest(`.day-card`);if(d?.dataset.dayId){he(d.dataset.dayId);return}}),setTimeout(()=>{let t=e.querySelector(`#addDayBtn`);t&&(t.onclick=()=>fe())},0)),m.hideQuickAccess===!0){let t=document.createElement(`div`);t.style.textAlign=`center`,t.style.marginTop=`40px`,t.innerHTML=`
            <button class="btn btn-liquid-glass" style="padding: 10px 24px; border-radius: 980px; font-size: 0.85rem; font-weight: 700; color: #002d5b; border: 1px solid rgba(0,0,0,0.05); background: rgba(255,255,255,0.4);" onmouseover="this.style.background='rgba(255,255,255,0.7)';" onmouseout="this.style.background='rgba(255,255,255,0.4)';">
                🧭 Show Quick Access
            </button>
        `;let n=t.querySelector(`button`);n&&(n.onclick=()=>{m.hideQuickAccess=!1,y(`state:changed`),q(`home`)}),e.appendChild(t)}else u.innerHTML=`
            <div class="card glass" style="padding: 32px; border-radius: 28px; border: 1.5px solid ${C?`rgba(0,0,0,0.05)`:`rgba(0, 122, 255, 0.15)`}; background: ${C?`rgba(255,255,255,0.4)`:`linear-gradient(165deg, rgba(255,255,255,0.9), rgba(240,247,255,0.8))`}; position: relative;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <div style="background: ${C?`#000000`:`var(--accent-blue)`}; color: white; width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem;">${C?`⚡️`:`🧭`}</div>
                        <h2 style="margin: 0; font-size: 1.5rem; letter-spacing: -0.02em; color: #002d5b;">${C?`Quick Access`:`Getting Started Guide`}</h2>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        ${C?`<span style="font-size: 0.75rem; font-weight: 800; color: rgba(0,45,91,0.4); text-transform: uppercase; letter-spacing: 0.05em;">Toolbar</span>`:``}
                        <button id="hideQuickAccessBtn" style="background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.05); padding: 6px 14px; border-radius: 980px; color: rgba(0,0,0,0.5); cursor: pointer; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.1)'; this.style.color='#ff3b30'; this.style.borderColor='rgba(255,59,48,0.2)';" onmouseout="this.style.background='rgba(0,0,0,0.05)'; this.style.color='rgba(0,0,0,0.5)'; this.style.borderColor='rgba(0,0,0,0.05)';">Hide</button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
                    ${S.map((e,t)=>{let n=!C&&e.done;return`
                        <div class="guide-step-card" data-index="${t}" style="display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: ${n?`rgba(52, 199, 89, 0.08)`:`white`}; border-radius: 20px; border: 1px solid ${n?`rgba(52, 199, 89, 0.2)`:`rgba(0,0,0,0.05)`}; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative; overflow: hidden;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 12px 24px rgba(0,0,0,0.08)';" onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                            ${C?`
                            <div style="font-size: 1.4rem; flex-shrink: 0; line-height: 1;">${e.icon}</div>
                            `:`
                            <div style="width: 24px; height: 24px; border-radius: 50%; border: 2px solid ${n?`#34c759`:`rgba(0,45,91,0.1)`}; display: flex; align-items: center; justify-content: center; color: ${n?`#34c759`:`rgba(0,0,0,0.4)`}; font-weight: 800; font-size: 0.8rem; background: ${n?`white`:`rgba(0,0,0,0.02)`}; flex-shrink: 0;">
                                ${n?`✓`:e.icon}
                            </div>
                            `}
                            <div style="display: flex; flex-direction: column;">
                                ${C?``:`<div style="font-size: 0.75rem; font-weight: 800; color: ${n?`#34c759`:`rgba(0,45,91,0.4)`}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Step ${t+1}</div>`}
                                <div style="font-size: 1rem; font-weight: 700; color: ${n?`rgba(0,45,91,0.6)`:`#002d5b`}; text-decoration: ${n?`line-through`:`none`};">
                                    ${e.text}
                                </div>
                            </div>
                        </div>
                    `}).join(``)}
                </div>
            </div>
        `,setTimeout(()=>{u.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`[data-guide-action]`);if(n){let e=n.dataset.guideAction;e===`open-add-day`?fe():e===`navigate-expenses`?q(`expenses`):e===`navigate-upload`&&q(`upload`);return}let r=t.closest(`.guide-step-card`);r?.dataset.index&&S[Number(r.dataset.index)]?.action()});let e=u.querySelector(`#hideQuickAccessBtn`);e&&(e.onclick=e=>{e.stopPropagation(),m.hideQuickAccess=!0,y(`state:changed`),q(`home`)})},0),e.appendChild(u);return e}var Se=e=>{let t=m.tripDays.find(t=>t.id===e);if(!t)return;let n=document.createElement(`div`);n.className=`modal-overlay`,n.style.display=`flex`,n.style.backdropFilter=`blur(25px)`,n.innerHTML=`
        <div class="card glass" style="width: 580px; padding: 32px; border-radius: 40px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.9); box-shadow: 0 40px 100px rgba(0,0,0,0.2);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800; letter-spacing: -0.04em;">Day ${t.dayNumber} Journaling</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Capture your memories and stories from ${t.name}</p>
            <textarea id="journalText" class="glass-input" style="width: 100%; height: 240px; padding: 20px; border-radius: 20px; font-size: 1.05rem; line-height: 1.6; margin-bottom: 20px; border: 1px solid rgba(0,0,0,0.05);" placeholder="What happened today? How did you feel?">${t.notes||``}</textarea>
            <div style="display: flex; gap: 12px;">
                <button id="saveJournalBtn" class="btn" style="flex: 2; padding: 16px; border-radius: 16px; background: var(--accent-blue); color: white; font-weight: 800; font-size: 1rem; border: none;">Save Story</button>
                <button id="closeJournalBtn" class="btn" style="flex: 1; padding: 16px; border-radius: 16px; background: rgba(0,0,0,0.05); color: #002d5b; font-weight: 700; border: none; font-size: 0.9rem;">Close</button>
            </div>
        </div>
    `,document.body.appendChild(n),M(n,`#closeJournalBtn`).onclick=()=>n.remove(),M(n,`#saveJournalBtn`).onclick=async()=>{t.notes=M(n,`#journalText`).value,y(`state:changed`),await $(t),k(`Memories saved!`),n.remove(),q(`home`,null,!0)}},z=e=>{let t=m.tripDays.find(t=>t.id===e);if(!t)return;t.photos||=[];let n=document.createElement(`div`);n.className=`modal-overlay`,n.style.display=`flex`,n.style.backdropFilter=`blur(25px)`,n.innerHTML=`
        <div class="card glass" style="width: 500px; padding: 32px; border-radius: 40px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.95);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800;">Photo Gallery</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Add images that define your Day ${t.dayNumber}</p>
            <div id="photoList" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; max-height: 300px; overflow-y: auto; padding: 4px;">
                ${t.photos.length===0?`<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px;">No photos added yet.</p>`:t.photos.map((t,n)=>`
                        <div style="position: relative; aspect-ratio: 1; border-radius: 16px; overflow: hidden; border: 1px solid rgba(0,0,0,0.05);">
                            <img src="${t}" style="width: 100%; height: 100%; object-fit: cover;">
                            <button class="remove-photo-btn" data-day-id="${e}" data-photo-idx="${n}" style="position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border-radius: 50%; background: rgba(255,59,48,0.8); color: white; border: none; font-size: 0.7rem; font-weight: 800; cursor: pointer;">✕</button>
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
    `,document.body.appendChild(n);let r=M(n,`#photoUpload`);r.onchange=async r=>{let i=r.target.files?.[0];if(!i)return;let a=M(n,`#uploadStatusText`);a.textContent=`⌛ Uploading...`;let o=await $e(i);o&&o.url?(t.photos.push(o.url),y(`state:changed`),await $(t),n.remove(),z(e)):a.textContent=`❌ Failed. Try again.`};let i=async(e,r)=>{t.photos.splice(r,1),y(`state:changed`),await $(t),n.remove(),z(e)};n.addEventListener(`click`,e=>{let t=e.target?.closest(`.remove-photo-btn`);t?.dataset.dayId&&t.dataset.photoIdx&&i(t.dataset.dayId,parseInt(t.dataset.photoIdx,10))}),M(n,`#addPhotoBtn`).onclick=async()=>{let r=M(n,`#photoUrl`).value;r&&(t.photos.push(r),y(`state:changed`),await $(t),n.remove(),z(e))},M(n,`#closePhotosBtn`).onclick=()=>{n.remove(),q(`home`,null,!0)}},B=e=>{let t=m.tripDays.find(t=>t.id===e);if(!t)return;t.documents||=[];let n=document.createElement(`div`);n.className=`modal-overlay`,n.style.display=`flex`,n.style.backdropFilter=`blur(25px)`,n.innerHTML=`
        <div class="card glass" style="width: 460px; padding: 32px; border-radius: 40px; background: rgba(255,255,255,0.95);">
            <h2 style="font-size: 1.8rem; margin-bottom: 8px; color: #002d5b; font-weight: 800;">Documents</h2>
            <p style="color: var(--text-secondary); font-weight: 600; margin-bottom: 20px; font-size: 0.95rem;">Tickets, bookings, and important info</p>
            <div id="docList" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; max-height: 250px; overflow-y: auto;">
                ${t.documents.length===0?`<p style="text-align: center; color: var(--text-secondary); padding: 32px;">No documents linked.</p>`:t.documents.map((t,n)=>`
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: white; border-radius: 12px; border: 1px solid rgba(0,0,0,0.05);">
                            <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                                <span style="font-size: 1.2rem;">📄</span>
                                <a href="${t.url}" target="_blank" style="color: var(--accent-blue); text-decoration: none; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name}</a>
                            </div>
                            <button class="remove-doc-btn" data-day-id="${e}" data-doc-idx="${n}" style="background: none; border: none; color: #ff3b30; font-weight: 800; cursor: pointer;">✕</button>
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
    `,document.body.appendChild(n);let r=t.documents,i=M(n,`#docUpload`);i.onchange=async i=>{let a=i.target.files?.[0];if(!a)return;let o=M(n,`#uploadDocStatusText`);o.textContent=`⌛ Uploading...`;let s=await $e(a);s&&s.url?(r.push({name:s.name||a.name,url:s.url}),y(`state:changed`),await $(t),n.remove(),B(e)):o.textContent=`❌ Failed. Try again.`};let a=async(e,i)=>{r.splice(i,1),y(`state:changed`),await $(t),n.remove(),B(e)};n.addEventListener(`click`,e=>{let t=e.target?.closest(`.remove-doc-btn`);t?.dataset.dayId&&t.dataset.docIdx&&a(t.dataset.dayId,parseInt(t.dataset.docIdx,10))}),M(n,`#addDocBtn`).onclick=async()=>{let i=M(n,`#docName`).value,a=M(n,`#docUrl`).value;i&&a&&(r.push({name:i,url:a}),y(`state:changed`),await $(t),n.remove(),B(e))},M(n,`#closeDocsBtn`).onclick=()=>n.remove()},Ce=e=>{let t=m.tripDays.find(t=>t.id===e);if(!t)return;let n=document.createElement(`div`);n.className=`modal-overlay`,n.style.display=`flex`,n.style.backdropFilter=`blur(25px)`,n.innerHTML=`
        <div class="card glass" style="width: 800px; max-height: 90vh; overflow-y: auto; padding: 48px; border-radius: 48px; background: white; border: 1px solid rgba(0,0,0,0.1);">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 40px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                        <div style="background: var(--accent-blue); color: white; padding: 4px 12px; border-radius: 8px; font-weight: 800; font-size: 0.75rem; text-transform: uppercase;">Day ${t.dayNumber}</div>
                        <div style="color: var(--text-secondary); font-weight: 600; font-size: 0.9rem;">${ie(t.date)}</div>
                    </div>
                    <h2 style="font-size: 2.5rem; color: #002d5b; font-weight: 800; letter-spacing: -0.04em; margin: 0;">${t.name}</h2>
                </div>
                <button id="closeDetailBtn" style="background: rgba(0,0,0,0.05); border: none; width: 44px; height: 44px; border-radius: 50%; font-size: 1.5rem; cursor: pointer;">✕</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px;">
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue);">Morning</h4>
                        <textarea class="glass-input plan-input" data-time="morning" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Morning plans...">${t.plan?.morning||``}</textarea>
                    </div>
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #ff9500;">Afternoon</h4>
                        <textarea class="glass-input plan-input" data-time="afternoon" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Afternoon plans...">${t.plan?.afternoon||``}</textarea>
                    </div>
                    <div style="background: rgba(0,0,0,0.02); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,0,0,0.05);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #5856d6;">Evening</h4>
                        <textarea class="glass-input plan-input" data-time="evening" style="width: 100%; min-height: 80px; background: transparent; border: none; font-size: 1rem; color: #002d5b;" placeholder="Evening plans...">${t.plan?.evening||``}</textarea>
                    </div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <div style="flex: 1; background: rgba(0,113,227,0.05); padding: 24px; border-radius: 24px; border: 1px solid rgba(0,113,227,0.1);">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: var(--accent-blue);">Personal Notes</h4>
                        <textarea id="detailNotes" style="width: 100%; height: 200px; background: transparent; border: none; font-size: 1rem; color: #002d5b; resize: none;" placeholder="Private thoughts about this day...">${t.notes||``}</textarea>
                    </div>
                    <div style="background: #000000; padding: 24px; border-radius: 24px; color: white;">
                        <h4 style="margin: 0 0 16px; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; color: #34c759;">Expert Tip</h4>
                        <p style="margin: 0; font-size: 0.95rem; line-height: 1.5; opacity: 0.9;">${t.tip||`Always keep a portable charger and a small bottle of water in your bag for long exploration days.`}</p>
                    </div>
                    <button id="saveDetailBtn" class="btn" style="width: 100%; padding: 20px; border-radius: 20px; background: var(--accent-blue); color: white; font-weight: 800; font-size: 1.1rem; border: none; box-shadow: 0 15px 30px rgba(0,113,227,0.2);">Save All Changes</button>
                </div>
            </div>
        </div>
    `,document.body.appendChild(n),M(n,`#closeDetailBtn`).onclick=()=>n.remove(),M(n,`#saveDetailBtn`).onclick=async()=>{let e=M(n,`[data-time="morning"]`).value,r=M(n,`[data-time="afternoon"]`).value,i=M(n,`[data-time="evening"]`).value,a=M(n,`#detailNotes`).value;t.plan={morning:e,afternoon:r,evening:i},t.notes=a,y(`state:changed`),await $(t),k(`Itinerary updated!`),n.remove(),q(`home`)}},we=e=>{let t=m.expenses.find(t=>t.id===e);t&&(m.draftExpense={...t},m.activeTripId=t.tripId,y(`state:changed`),q(`expenses`))},Te=e=>{A({title:`Delete Expense?`,message:`This action cannot be undone.`,confirmText:`Delete`,onConfirm:()=>{m.expenses=m.expenses.filter(t=>t.id!==e),y(`state:changed`),qe(e),q(`expenses`)}})};function Ee(){let e=document.createElement(`div`);if(!m.activeTripId)return e.innerHTML=`<h1>Expenses</h1><div class="card glass"><p>Please select a trip first.</p></div>`,e;let t=m.groups.map(e=>`<option value="${e}">${e}</option>`).join(``);t||=`<option value="">Add companions in the personalisation section</option>`;let n=m.categories.map(e=>`<option value="${e.id}">${e.icon} ${e.name}</option>`).join(``);return e.innerHTML=`
        <h1 style="margin-bottom: 32px;">Expenses</h1>
        <div style="display: flex; flex-direction: column; gap: 60px;">
            <!-- Add Expense Section -->
            <div class="card glass" style="max-width: 600px; margin: 0 auto; width: 100%; border-radius: 44px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); padding: 48px; box-shadow: 0 40px 100px rgba(0,0,0,0.25);">
                <h2 class="card-title" style="font-size: 2.2rem; margin-bottom: 32px; color: #000000; letter-spacing: -0.06em; font-weight: 800; text-align: center;">Add Expense</h2>
                <form id="expenseForm" style="display: flex; flex-direction: column; align-items: center; width: 100%;">
                    
                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Who Paid</label>
                        <select id="expWho" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            ${t}
                        </select>
                        ${!m.groups||m.groups.length===0?`
                        <div id="addCompanionsHelper" style="margin-top: 12px; font-size: 0.85rem; color: #0071e3; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                            <span>➕</span> <span style="text-decoration: underline;">Add companions in the personalization section</span>
                        </div>`:``}
                    </div>

                    <div style="margin-bottom: 24px; width: 100%; max-width: 440px;">
                        <label style="display: block; margin-bottom: 10px; font-size: 0.8rem; font-weight: 800; color: rgba(0,0,0,0.5); text-transform: uppercase; letter-spacing: 0.1em;">Category</label>
                        <select id="expCategory" class="glass-input" style="width: 100%; padding: 18px; border-radius: 20px; background: rgba(0,0,0,0.04); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;" required>
                            ${n}
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
                                ${r.sort().map(e=>`<div class="dropdown-item" style="padding: 12px 16px; cursor: pointer; color: #000000; font-weight: 600; transition: background 0.2s;" data-value="${e}">${e}</div>`).join(``)}
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
                            ${Object.keys(o).map(e=>`<option value="${e}">${e}</option>`).join(``)}
                        </select>
                    </div>
                    
                    <div style="margin-bottom: 40px; background: rgba(0,0,0,0.03); padding: 32px; border-radius: 32px; border: 1px solid rgba(0,0,0,0.05); width: 100%; max-width: 440px; box-sizing: border-box;">
                        <label style="display: block; margin-bottom: 16px; font-size: 0.9rem; font-weight: 800; color: #000000; letter-spacing: -0.02em;">Split Between</label>
                        <div style="display: flex; gap: 14px; margin-bottom: 20px;">
                            <select id="addSplitSelect" class="glass-input" style="flex: 1; padding: 14px; border-radius: 16px; background: rgba(255,255,255,0.4); color: #000000; font-weight: 600; border: 1px solid rgba(0,0,0,0.05); box-sizing: border-box;">
                                <option value="">Add person to split...</option>
                                ${m.groups.map(e=>`<option value="${e}">${e}</option>`).join(``)}
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
                                    ${m.categories.map(e=>`<option value="${e.id}">${e.icon} ${e.name}</option>`).join(``)}
                                    <option value="settlement">🤝 Settlement</option>
                                </select>
                            </div>
                            <div>
                                <label style="display: block; font-size: 0.7rem; font-weight: 800; color: rgba(0,0,0,0.4); text-transform: uppercase; margin-bottom: 6px; margin-left: 4px;">Payer</label>
                                <select id="filterWho" class="glass-input" style="width: 100%; padding: 10px 16px; border-radius: 12px; background: rgba(255,255,255,0.6); border: 1px solid rgba(0,0,0,0.07); box-sizing: border-box;">
                                    <option value="all">Everyone</option>
                                    ${m.groups.map(e=>`<option value="${e}">${e}</option>`).join(``)}
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
    `,setTimeout(()=>{e.querySelector(`#addCompanionsHelper`)?.addEventListener(`click`,()=>{q(`personalization`),setTimeout(()=>N(`companions`),50)}),e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.expense-edit-btn`);if(n?.dataset.expenseId){we(n.dataset.expenseId);return}let r=t.closest(`.expense-delete-btn`);if(r?.dataset.expenseId){Te(r.dataset.expenseId);return}});let t=M(e,`#expenseForm`),n=M(e,`#splitContainer`),r=M(e,`#addSplitSelect`),i=M(e,`#addSplitBtn`),a=[];function s(){if(a.length===0){n.innerHTML=`<p style="color:var(--text-secondary); font-size:0.85rem; padding:10px; border:1px dashed var(--glass-border); border-radius:8px; text-align:center;">100% will be attributed to the payer.</p>`;return}let e=(100/a.length).toFixed(1);n.innerHTML=a.map(t=>`
                <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <span style="font-weight: 500;">${t}</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="number" class="glass-input split-input" data-person="${t}" value="${e}" step="0.1" style="width: 70px; padding: 4px 8px; text-align: center;" required>
                        <span style="color: var(--text-secondary); font-size: 0.9rem;">%</span>
                        <button type="button" class="remove-splitter" data-person="${t}" style="background:none; border:none; color:#ff3b30; cursor:pointer; font-weight:700; margin-left:8px;">&times;</button>
                    </div>
                </div>
            `).join(``),n.querySelectorAll(`.remove-splitter`).forEach(e=>{e.onclick=()=>{let t=e.getAttribute(`data-person`);a=a.filter(e=>e!==t),s()}})}if(i.onclick=()=>{let e=r.value;e&&!a.includes(e)&&(a.push(e),s())},m.draftExpense){let t=m.draftExpense;t.who&&(M(e,`#expWho`).value=t.who),t.categoryId&&(M(e,`#expCategory`).value=t.categoryId),t.label&&(M(e,`#expLabel`).value=t.label),t.date&&(M(e,`#expDate`).value=t.date),t.country&&(M(e,`#expCountry`).value=t.country),t.value&&(M(e,`#expValue`).value=String(t.value)),t.currency&&(M(e,`#expCurrency`).value=t.currency)}t.querySelectorAll(`input, select`).forEach(e=>{e.addEventListener(`input`,e=>{let t=e.target,n=t.id;if(!n)return;let r=t.value;n===`expWho`&&(m.draftExpense.who=r),n===`expCategory`&&(m.draftExpense.categoryId=r),n===`expLabel`&&(m.draftExpense.label=r),n===`expDate`&&(m.draftExpense.date=r),n===`expCountry`&&(m.draftExpense.country=r),n===`expValue`&&(m.draftExpense.value=r),n===`expCurrency`&&(m.draftExpense.currency=r),y(`state:changed`)})});let c=M(e,`#expCountry`),l=M(e,`#countryDropdownList`),u=l.querySelectorAll(`.dropdown-item`);c.onfocus=()=>{l.style.display=`block`},c.oninput=e=>{let t=e.target.value.toLowerCase();u.forEach(e=>{let n=(e.textContent??``).toLowerCase();e.style.display=n.includes(t)?`block`:`none`}),l.style.display=`block`},u.forEach(e=>{e.onclick=t=>{c.value=e.getAttribute(`data-value`)??``,l.style.display=`none`,t.stopPropagation(),m.draftExpense.country=c.value,y(`state:changed`)},e.onmouseover=()=>e.style.background=`rgba(0, 122, 255, 0.1)`,e.onmouseout=()=>e.style.background=`transparent`}),document.addEventListener(`click`,t=>{let n=t.target,r=M(e,`#countrySearchContainer`);(!n||!r.contains(n))&&(l.style.display=`none`)}),t.addEventListener(`submit`,n=>{if(n.preventDefault(),!m.activeTripId)return;let r=m.activeTripId,i=M(e,`#expWho`).value,c={},l=0,u=e.querySelectorAll(`.split-input`);if(u.length>0){if(u.forEach(e=>{let t=parseFloat(e.value)||0,n=e.getAttribute(`data-person`);n&&(c[n]=t),l+=t}),Math.abs(l-100)>.5){alert(`Percentages must add up to exactly 100%`);return}}else c[i]=100;let d=parseFloat(M(e,`#expValue`).value),f=M(e,`#expCurrency`).value.toUpperCase();if(isNaN(d)||d<=0){alert(`Please enter a valid expense value.`);return}if(!f){alert(`Please select a currency.`);return}let p=m.trips.find(e=>e.id===r),h=M(e,`#expCountry`).value||(p?p.country:``),g=!!m.draftExpense?.id,_={id:g&&m.draftExpense.id?m.draftExpense.id:j(),tripId:r,who:i,categoryId:M(e,`#expCategory`).value,label:M(e,`#expLabel`).value,date:M(e,`#expDate`).value,country:h,value:d,currency:f,euroValue:d*(o[f]||1),splits:c};if(g){let e=m.expenses.findIndex(e=>e.id===_.id);e===-1?m.expenses.push(_):m.expenses[e]=_}else m.expenses.push(_);m.draftExpense={who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`,euroValue:``},y(`state:changed`),Ke(_),V(M(e,`#tripExpensesList`)),t.reset(),a=[],s()});let d=()=>{let t=M(e,`#filterSearch`).value.toLowerCase(),n=M(e,`#filterCategory`).value,r=M(e,`#filterWho`).value,i=M(e,`#filterDateFrom`).value,a=M(e,`#filterDateTo`).value,o=parseFloat(M(e,`#filterMinVal`).value)||0,s=parseFloat(M(e,`#filterMaxVal`).value)||1/0;V(M(e,`#tripExpensesList`),{search:t,catId:n,who:r,dateFrom:i,dateTo:a,minVal:o,maxVal:s})};M(e,`#filterSearch`).oninput=d,M(e,`#filterCategory`).onchange=d,M(e,`#filterWho`).onchange=d,M(e,`#filterDateFrom`).onchange=d,M(e,`#filterDateTo`).onchange=d,M(e,`#filterMinVal`).oninput=d,M(e,`#filterMaxVal`).oninput=d,M(e,`#clearFiltersBtn`).onclick=()=>{M(e,`#filterSearch`).value=``,M(e,`#filterCategory`).value=`all`,M(e,`#filterWho`).value=`all`,M(e,`#filterDateFrom`).value=``,M(e,`#filterDateTo`).value=``,M(e,`#filterMinVal`).value=``,M(e,`#filterMaxVal`).value=``,V(M(e,`#tripExpensesList`))},V(M(e,`#tripExpensesList`)),s()},0),e}function V(e,t={}){if(!e)return;let n=m.expenses.filter(e=>e.tripId===m.activeTripId),r=t.search;r&&(n=n.filter(e=>e.label.toLowerCase().includes(r))),n=t.catId&&t.catId!==`all`?t.catId===`settlement`?n.filter(e=>e.isSettlement):n.filter(e=>e.categoryId===t.catId&&!e.isSettlement):n.filter(e=>!e.isSettlement),t.who&&t.who!==`all`&&(n=n.filter(e=>e.who===t.who));let{dateFrom:i,dateTo:a,minVal:o,maxVal:s}=t;i&&(n=n.filter(e=>e.date>=i)),a&&(n=n.filter(e=>e.date<=a)),o!==void 0&&(n=n.filter(e=>(e.euroValue||0)>=o)),s!==void 0&&s!==1/0&&(n=n.filter(e=>(e.euroValue||0)<=s)),n.sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime());function c(e){if(!e)return`Global`;let t=new Date(e+`T00:00:00Z`);return isNaN(t.getTime())?`Global`:`${String(t.getUTCDate()).padStart(2,`0`)}-${String(t.getUTCMonth()+1).padStart(2,`0`)}-${t.getUTCFullYear()}`}if(n.length===0){e.innerHTML=`
            <div class="card glass" style="padding: 50px; text-align: center; border-radius: 32px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); backdrop-filter: blur(25px);">
                <div style="font-size: 2.5rem; margin-bottom: 15px; opacity: 0.5;">💸</div>
                <p style="color: rgba(255,255,255,0.5); font-weight: 500; font-size: 1rem;">No expenses found for this trip.</p>
            </div>
        `;return}let l=x();e.innerHTML=n.map(e=>{let t=m.categories.find(t=>t.id===e.categoryId),n=e.currency===l?``:`≈ ${C(e.value,e.currency)}`;return`
            <div class="card glass" style="padding: 14px 22px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.15); backdrop-filter: blur(25px); display: flex; justify-content: space-between; align-items: center; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 10px 30px rgba(0,0,0,0.1);" onmouseover="this.style.transform='scale(1.012)'; this.style.boxShadow='0 20px 50px rgba(0,0,0,0.2)'; this.style.background='rgba(255,255,255,0.2)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 10px 30px rgba(0,0,0,0.1)'; this.style.background='rgba(255,255,255,0.15)';">
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div style="width: 48px; height: 48px; background: rgba(0,0,0,0.04); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; border: 1px solid rgba(0,0,0,0.04);">
                        ${t?t.icon:`💰`}
                    </div>
                    <div>
                        <strong style="display: block; font-size: 1.1rem; letter-spacing: -0.02em; color: #000000; margin-bottom: 1px;">${e.label}</strong>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: rgba(0,0,0,0.5); font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em;">
                            <span>${c(e.date)}</span>
                            <span style="width: 3px; height: 3px; background: rgba(0,0,0,0.1); border-radius: 50%;"></span>
                            <span>${e.country||`Global`}</span>
                            <span style="width: 3px; height: 3px; background: rgba(0,0,0,0.1); border-radius: 50%;"></span>
                            <span>${e.who}</span>
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="text-align: right;">
                        <div style="font-weight: 800; font-size: 1.2rem; color: #000000; letter-spacing: -0.03em;">${e.value.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2})} <span style="font-size: 0.75rem; opacity: 0.5; font-weight: 600;">${e.currency}</span></div>
                        ${n?`<div style="font-size: 0.85rem; color: #0071e3; font-weight: 700; margin-top: 1px;">${n}</div>`:``}
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button class="expense-edit-btn" data-expense-id="${e.id}" style="background: rgba(0,113,227,0.08); border: 1px solid rgba(0,113,227,0.1); color: #0071e3; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(0,113,227,0.15)';" onmouseout="this.style.background='rgba(0,113,227,0.08)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                        </button>
                        <button class="expense-delete-btn" data-expense-id="${e.id}" style="background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.1); color: #ff3b30; width: 36px; height: 36px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.15)';" onmouseout="this.style.background='rgba(255,59,48,0.08)';">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `}).join(``)}var H=e=>String(e).padStart(2,`0`);function U(e){if(e==null||e===``)return``;if(e instanceof Date&&!isNaN(e.getTime()))return`${e.getFullYear()}-${H(e.getMonth()+1)}-${H(e.getDate())}`;let t=String(e).trim();if(!t)return``;if(/^-?\d+(\.\d+)?$/.test(t)){let e=parseFloat(t);if(e>0&&e<73e3){let t=Date.UTC(1899,11,30)+Math.round(e)*864e5,n=new Date(t);if(!isNaN(n.getTime()))return`${n.getUTCFullYear()}-${H(n.getUTCMonth()+1)}-${H(n.getUTCDate())}`}return``}let n=t.split(/[/\-.]/).map(e=>e.trim()).filter(Boolean);if(n.length===3){let e=n.findIndex(e=>/^\d{4}$/.test(e));if(e===-1)return``;let t=n[e],r=n.filter((t,n)=>n!==e).map(Number);if(r.some(e=>isNaN(e)))return``;let i,a;if(e===0)[i,a]=r;else{let[e,t]=r;e>12?(a=e,i=t):t>12?(a=t,i=e):(a=e,i=t)}return i<1||i>12||a<1||a>31?``:`${t}-${H(i)}-${H(a)}`}return``}function De(){let e=document.createElement(`div`);return e.innerHTML=`
        <h1>Upload Data</h1>
        <div class="card glass" style="border-color: rgba(33, 115, 70, 0.3); box-shadow: 0 0 15px rgba(33, 115, 70, 0.1);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                <h2 class="card-title" style="color: #217346; margin: 0;">Excel Upload</h2>
            </div>

            <!-- Format Selector -->
            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:0.8rem; font-weight:600; margin-bottom:8px;">Import Format</label>
                <select id="formatSelect" class="glass-input" style="width:100%;">
                    ${(()=>{let e=m.savedFormats||[],t=m.trips.find(e=>e.id===m.activeTripId),n=t?.activeFormatId,r=t?.activeFormatType||`popular`;return`
                            <optgroup label="Popular Formats">${[{id:`tricount`,name:`Tricount Export (CSV/XLSX)`},{id:`splitwise`,name:`Splitwise Export`},{id:`revolut`,name:`Revolut Monthly Statement`}].map(e=>`<option value="popular:${e.id}" ${r===`popular`&&n===e.id?`selected`:``}>${e.name}</option>`).join(``)}</optgroup>
                            <optgroup label="Custom Formats">${e.length===0?`<option disabled>No saved custom formats yet</option>`:e.map(e=>`<option value="custom:${e.id}" ${r===`custom`&&n===e.id?`selected`:``}>${e.name}</option>`).join(``)}</optgroup>
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

            <div style="padding: 12px 16px; background: rgba(0,113,227,0.05); border: 1px solid rgba(0,113,227,0.15); border-radius: 12px; margin-bottom: 15px;">
                <p style="margin: 0; font-size: 0.82rem; color: var(--accent-blue); font-weight: 600;">📅 Date format</p>
                <p style="margin: 4px 0 0; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.5;">Use <strong>DD-MM-YYYY</strong> (e.g. <code style="background: rgba(0,0,0,0.04); padding: 1px 6px; border-radius: 4px;">15-03-2024</code>) or <strong>YYYY-MM-DD</strong>. Excel-typed date cells are recognised automatically.</p>
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
    `,setTimeout(()=>{let t=null;e.querySelector(`#uploadFormatSettingsLink`)?.addEventListener(`click`,e=>{e.preventDefault(),q(`settings`),setTimeout(()=>ae(`format`),50)});let n=M(e,`#formatSelect`),r=M(e,`#popularNote`),i=M(e,`#customFormatPreview`),a=M(e,`#customFormatTable`),s=()=>{let t=n.value,o=t.startsWith(`popular:`);if(r.style.display=o?`block`:`none`,o){i.style.display=`none`;let n=t.split(`:`)[1],r=M(e,`#popularFormatTableContainer`),a=[],o=[];n===`tricount`?(a=[`Title`,`Amount`,`Currency`,`Date`,`Paid by`],o=[`Dinner`,`45.00`,`EUR`,`2023-10-12`,`Alice`]):n===`splitwise`?(a=[`Date`,`Description`,`Category`,`Cost`,`Currency`],o=[`2023-10-12`,`Taxi`,`Transportation`,`20.00`,`EUR`]):n===`revolut`&&(a=[`Type`,`Product`,`Started Date`,`Description`,`Amount`,`Currency`,`State`],o=[`CARD_PAYMENT`,`Current`,`2023-10-12`,`Restaurant`,`-45.00`,`EUR`,`COMPLETED`]),a.length>0?r.innerHTML=`
                        <table class="liquid-table" style="font-size: 0.75rem; margin: 0;">
                            <thead>
                                <tr>${a.map(e=>`<th style="padding: 8px 12px;">${e}</th>`).join(``)}</tr>
                            </thead>
                            <tbody>
                                <tr>${o.map(e=>`<td style="padding: 8px 12px; color: var(--text-secondary);">${e}</td>`).join(``)}</tr>
                            </tbody>
                        </table>
                    `:r.innerHTML=``;let s=m.trips.find(e=>e.id===m.activeTripId);s&&(s.activeFormatId=n,s.activeFormatType=`popular`,y(`state:changed`))}else{let e=t.split(`:`)[1],n=(m.savedFormats||[]).find(t=>t.id===e);if(n){i.style.display=`block`,a.innerHTML=`<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:8px;">
                        ${n.mappings.map(e=>`<div style="font-size:0.75rem;"><span style="color:var(--text-secondary);">${e.variable}:</span> <strong>${e.column}</strong></div>`).join(``)}
                    </div>`;let t=m.trips.find(e=>e.id===m.activeTripId);t&&(t.activeFormatId=e,t.activeFormatType=`custom`,y(`state:changed`))}else i.style.display=`none`}};n.addEventListener(`change`,s),s(),M(e,`#excelFile`).addEventListener(`change`,n=>{let r=n.target.files?.[0];if(!r)return;let i=new FileReader;i.onload=function(n){try{let r=new Uint8Array(n.target?.result),i=XLSX.read(r,{type:`array`,cellDates:!0}),a=i.SheetNames[0],o=i.Sheets[a],s=XLSX.utils.sheet_to_json(o,{header:1});if(s.length<2)return;let c=s[0];t=s.slice(1).filter(e=>e.length>0&&e[0]);let l=M(e,`#previewContainer`),u=M(e,`#previewTable thead`),d=M(e,`#previewTable tbody`);u.innerHTML=`<tr>`+c.map(e=>`<th>${e||``}</th>`).join(``)+`</tr>`,d.innerHTML=t.slice(0,3).map(e=>`<tr>`+c.map((t,n)=>`<td>${e[n]||``}</td>`).join(``)+`</tr>`).join(``),l.style.display=`block`}catch(e){console.error(`Preview error`,e)}},i.readAsArrayBuffer(r)}),M(e,`#uploadBtn`).addEventListener(`click`,()=>{if(!m.activeTripId){alert(`Please select or create a trip first!`);return}let r=m.activeTripId,i=M(e,`#uploadStatus`),a=n.value,s=a.startsWith(`popular:`),c=a.split(`:`)[1];if(!t){i.innerText=`Please select a valid file to process.`,i.style.color=`red`;return}try{let n=0,l=[];if(!s){let e=a.split(`:`)[1],t=m.savedFormats.find(t=>t.id===e);if(!t)throw Error(`Format not found`);l=t.mappings}t.forEach(e=>{let t=``,i=``,a=``,u=``,d=``,f=0,p=`EUR`;if(s)c===`tricount`?(a=String(e[0]||``).trim(),f=parseFloat(e[1])||0,p=String(e[2]||`EUR`).trim().toUpperCase(),u=U(e[3]),i=String(e[4]||``).trim(),t=String(e[5]||``).trim(),d=`Unknown`):c===`splitwise`&&(u=U(e[0]),a=String(e[1]||``).trim(),i=String(e[2]||``).trim(),f=parseFloat(e[3])||0,p=String(e[4]||`EUR`).trim().toUpperCase(),t=`Me`,d=`Unknown`);else{let n=e=>e?e.toUpperCase().charCodeAt(0)-65:-1,r=t=>{let r=l.find(e=>e.variable===t);return r?String(e[n(r.column)]||``).trim():``};t=r(`who`),i=r(`category`)||r(`categoryId`),a=r(`label`),u=U((t=>{let r=l.find(e=>e.variable===t);return r?e[n(r.column)]:null})(`date`)),d=r(`country`)||`Unknown`,f=parseFloat(r(`value`))||0,p=r(`currency`).toUpperCase()||`EUR`}t&&!m.groups.includes(t)&&m.groups.push(t);let h=m.categories.find(e=>e.name.toLowerCase()===i.toLowerCase());!h&&i&&(h={id:j(),name:i,icon:`📌`,color:`#8e8e93`},m.categories.push(h));let g=h?h.id:m.categories[0].id,_={id:j(),tripId:r,who:t,categoryId:g,label:a,date:u,country:d,value:f,currency:p,euroValue:f*(o[p]||1)};m.expenses.push(_),n++}),y(`state:changed`),Y(),i.innerText=`Successfully imported ${n} expenses!`,i.style.color=`green`,t=null,M(e,`#previewContainer`).style.display=`none`}catch(e){console.error(e),i.innerText=`Error parsing file. Check the format.`,i.style.color=`red`}})},0),e}function Oe(){let e=document.createElement(`div`);if(!m.activeTripId)return e.innerHTML=`<h1>Insights</h1><div class="card glass"><p>Please select a trip.</p></div>`,e;let t=m.expenses.filter(e=>e.tripId===m.activeTripId&&!e.isSettlement);if(nt([...new Set(t.map(e=>e.date).filter(e=>!!e))]).then(()=>{}),t.length===0)return e.innerHTML=`
            <h1>Insights</h1>
            <div style="height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: var(--text-secondary);">
                <div style="font-size: 5rem; margin-bottom: 20px; opacity: 0.5;">📊</div>
                <h2 style="color: var(--text-primary); margin-bottom: 10px;">No Data to Analyze Yet</h2>
                <p style="max-width: 400px; line-height: 1.5;">Add your travel expenses in the <b>Expenses</b> tab or upload an Excel sheet to see your spending breakdown and analytics.</p>
                <button id="goToExpensesBtn" class="btn" style="margin-top: 24px;">Add Your First Expense</button>
            </div>
        `,setTimeout(()=>{e.querySelector(`#goToExpensesBtn`)?.addEventListener(`click`,()=>q(`expenses`))},0),e;let n=m.insightCurrency||x(),r=w(n),i=m.rateMode||`at_trip`,a=t.map(e=>{let t=o[e.currency]||1;if(i===`at_trip`){let n=`${e.date}_${e.currency}_EUR`;m.rateCache&&m.rateCache[n]&&(t=m.rateCache[n])}let r=e.euroValue||e.value*t,a=r;if(n!==`EUR`){let t=1/(o[n]||1);if(i===`at_trip`){let r=`${e.date}_${n}_EUR`;m.rateCache&&m.rateCache[r]&&(t=1/m.rateCache[r])}a=r*t}return{...e,displayValue:a}}),s=a.reduce((e,t)=>e+t.displayValue,0),c=a.length,l=null;a.length>0&&(l=a.reduce((e,t)=>t.displayValue>e.displayValue?t:e,a[0]));let u={},d={},f={};a.forEach(e=>{d[e.categoryId]||(d[e.categoryId]=0),d[e.categoryId]+=e.displayValue,u[e.who]||(u[e.who]=0),u[e.who]+=e.displayValue;let t=e.date||`Unknown`;f[t]||(f[t]=0),f[t]+=e.displayValue});let p=Object.entries(u).sort((e,t)=>t[1]-e[1]).slice(0,10),h=p.length>0?p[0][0]:`N/A`,g=p.length>0?p[0][1]:0,_=p.slice(1).map(([e,t],n)=>`
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
            <span style="font-weight: 500;">${n+2}. ${e}</span>
            <span style="color: var(--accent-blue); font-weight: 600;">${r}${t.toFixed(2)}</span>
        </div>
    `).join(``),v={};t.forEach(e=>{v[e.categoryId]=(v[e.categoryId]||0)+1});let b=Object.entries(v).sort((e,t)=>t[1]-e[1]).slice(0,10),S=b.length>0?b[0][0]:null,C=S?m.categories.find(e=>e.id===S):null;C&&C.icon+``+C.name;let T=b.slice(1).map(([e,t],n)=>{let r=m.categories.find(t=>t.id===e);return`
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
                <span style="font-weight: 500;">${n+2}. ${r?r.icon+` `+r.name:`Unknown`}</span>
                <span style="color: var(--accent-blue); font-weight: 600;">${t} trans.</span>
            </div>
        `}).join(``),E=[],D=[],O=[];return Object.keys(d).forEach(e=>{let t=m.categories.find(t=>t.id===e);t?(E.push(t.icon+` `+t.name),O.push(t.color)):(E.push(`Unknown`),O.push(`#ccc`)),D.push(d[e])}),e.innerHTML=`
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
                        ${Object.keys(o).map(e=>`<option value="${e}" ${n===e?`selected`:``}>${e}</option>`).join(``)}
                    </select>
                </div>
            </div>
        </div>

        <!-- Hero Row: Totals -->
        <div style="margin-bottom: 32px;">
            <div class="card glass" style="background: linear-gradient(135deg, var(--glass-bg), rgba(0,113,227,0.03)); border-left: 4px solid var(--accent-blue);">
                <h2 class="card-title" style="font-size: 1rem; color: var(--accent-blue); text-transform: uppercase; letter-spacing: 0.1em;">Total Spent on your trip</h2>
                <div style="display: flex; align-items: baseline; gap: 10px;">
                    <h1 style="margin: 0; font-size: 4.5rem; font-weight: 800; letter-spacing: -0.05em;">${r}${s.toFixed(2)}</h1>
                    <span style="font-size: 1.5rem; color: var(--text-secondary); font-weight: 400;">${n}</span>
                </div>
                <p style="color: var(--text-secondary); margin-top: 10px; font-size: 1.1rem;">Spent across <strong>${c}</strong> transactions during your travels.</p>
            </div>
        </div>

        <!-- Summary Grid -->
        <div class="grid-2" style="grid-template-columns: 1fr 1fr; margin-bottom: 32px;">
            <div class="card glass">
                <h2 class="card-title" style="font-size: 0.9rem; color: var(--text-secondary);">Avg. Daily Spend</h2>
                <h1 style="margin: 0; font-size: 2.5rem;">${r}${(s/(Object.keys(f).length||1)).toFixed(2)}<small style="font-size: 1rem; font-weight: 400; color: var(--text-secondary); margin-left: 8px;">/ day</small></h1>
            </div>
            ${l?`
            <div class="card glass">
                <h2 class="card-title" style="font-size: 0.9rem; color: var(--text-secondary);">Single Peak</h2>
                <h1 style="margin: 0; font-size: 2.5rem; color: #ff3b30;">${r}${l.displayValue.toFixed(2)}</h1>
                <p style="margin: 4px 0 0 0; font-size: 0.9rem; color: var(--text-secondary);">${l.label} • ${l.who}</p>
            </div>
            `:``}
        </div>

        <!-- Rankings Grid -->
        <div class="grid-2" style="margin-bottom: 32px;">
            <div class="card glass" style="padding: 28px;">
                <h2 class="card-title">Top Spenders</h2>
                <div style="margin-bottom: 20px;">
                    <h1 style="margin: 0; font-size: 2rem; color: var(--text-primary);">${h}</h1>
                    <span style="color: var(--accent-blue); font-weight: 700; font-size: 1.1rem;">${s>0?r+g.toFixed(2):`0`}</span>
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
                    ${T}
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
    `,setTimeout(()=>{e.querySelectorAll(`.rate-mode-btn`).forEach(e=>{let t=e;t.addEventListener(`click`,()=>{let e=t.dataset.mode;(e===`at_trip`||e===`today`)&&(m.rateMode=e),y(`state:changed`),q(`insights`)})}),e.querySelector(`#insightCurrencySelector`)?.addEventListener(`change`,e=>{m.insightCurrency=e.target.value,y(`state:changed`),q(`insights`)});let i=e.querySelector(`#categoryChart`);i&&D.length>0&&new Chart(i,{type:`doughnut`,data:{labels:E,datasets:[{data:D,backgroundColor:O,borderWidth:0}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{position:`right`}}}});let a=e.querySelector(`#timelineChart`);if(a&&t.length>0){let e=Object.keys(f).sort(),t=e.map(e=>f[e]),i=e.map(e=>{try{return new Date(e).toLocaleDateString(`en-US`,{month:`short`,day:`numeric`})}catch{return e}});new Chart(a,{type:`line`,data:{labels:i,datasets:[{label:n+` Spent`,data:t,borderColor:`#0071e3`,backgroundColor:`rgba(0, 113, 227, 0.1)`,fill:!0,tension:.4,pointRadius:4,pointBackgroundColor:`#0071e3`,borderWidth:3}]},options:{responsive:!0,maintainAspectRatio:!1,plugins:{legend:{display:!1}},scales:{x:{grid:{display:!1},ticks:{maxRotation:0,autoSkip:!0,maxTicksLimit:7}},y:{beginAtZero:!0,grid:{color:`rgba(255,255,255,0.05)`},ticks:{maxTicksLimit:5,callback:e=>r+e}}}}})}},0),e}var ke=e=>{m.budgets=m.budgets.filter(t=>t.id!==e),y(`state:changed`),Ze(e),q(`budgets`)};function Ae(){let e=document.createElement(`div`);if(!m.user)return e.innerHTML=`
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
        `,e;m.budgets=m.budgets||[];let t=m.trips.map(e=>`<option value="${e.id}">${e.name}</option>`).join(``),n=m.categories.map(e=>`<option value="${e.id}">${e.name}</option>`).join(``),r=m.groups.map(e=>`<option value="${e}">${e}</option>`).join(``),i=m.budgets.length>0?m.budgets.map(e=>{let t=0;m.expenses.forEach(n=>{n.isSettlement||e.tripId&&e.tripId!==`all`&&n.tripId!==e.tripId||e.categoryId&&e.categoryId!==`all`&&n.categoryId!==e.categoryId||e.user&&e.user!==`all`&&n.who!==e.user||(t+=n.euroValue||0)});let n=Math.min(t/e.amount*100,100),r=t>e.amount,i=!r&&n>80,a=`On Track`,o=`#34c759`;r?(a=`Over Budget`,o=`#ff3b30`):i&&(a=`Near Limit`,o=`#ff9500`);let s=m.categories.find(t=>t.id===e.categoryId),c=s?s.icon:`💰`,l=[];return e.tripId&&e.tripId!==`all`&&l.push(m.trips.find(t=>t.id===e.tripId)?.name||`Trip`),e.categoryId&&e.categoryId!==`all`&&l.push(s?.name||`Category`),e.user&&e.user!==`all`&&l.push(e.user),`
            <div style="padding: 16px; background: rgba(255,255,255,0.03); border-radius: 16px; border: 1px solid var(--glass-border); margin-bottom: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 1.1rem;">${c}</span>
                        <div style="font-weight: 700; font-size: 0.95rem;">${l.length>0?l.join(` · `):`General Budget`}</div>
                    </div>
                    <div style="font-size: 0.7rem; font-weight: 800; color: ${o}; text-transform: uppercase; letter-spacing: 0.05em;">${a}</div>
                </div>

                <div style="height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                    <div style="height: 100%; width: ${n}%; background: ${o}; border-radius: 3px; transition: width 1s;"></div>
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <div style="font-size: 0.8rem; font-weight: 600;">
                        ${C(t,`EUR`)} <span style="color: var(--text-secondary); opacity: 0.6;">/ ${C(e.amount,`EUR`)}</span>
                    </div>
                    <button class="btn-small delete-budget-btn" data-budget-id="${e.id}" style="background: none; border: none; color: #ff3b30; font-size: 0.7rem; font-weight: 700; cursor: pointer; padding: 0;">Delete</button>
                </div>
            </div>
        `}).join(``):`
        <div style="text-align: center; padding: 32px; border: 2px dashed var(--glass-border); border-radius: 16px; color: var(--text-secondary); font-size: 0.9rem;">
            No active budgets yet.
        </div>
    `;return e.innerHTML=`
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Budgets</h1>
            <p>Set spending limits and track them across trips.</p>
        </div>
        
        <div class="grid-2" style="margin-top: 24px;">
            <div class="card glass card-glow-blue">
                <h2 class="card-title" style="color: var(--accent-blue);">Create New Budget</h2>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Trip</label>
                    <select id="budTrip" class="glass-input" style="width:100%;"><option value="all">All Trips</option>${t}</select>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Category</label>
                    <select id="budCat" class="glass-input" style="width:100%;"><option value="all">All Categories</option>${n}</select>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Person</label>
                    <select id="budUser" class="glass-input" style="width:100%;"><option value="all">Everyone</option>${r}</select>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 100px; gap: 12px; margin-bottom: 16px;">
                    <div>
                        <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Target Amount</label>
                        <input type="number" id="budAmt" class="glass-input" style="width:100%;" placeholder="e.g. 1000">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; margin-bottom:4px; font-weight:600;">Currency</label>
                        <select id="budCurr" class="glass-input" style="width:100%;">
                            ${Object.keys(o).map(e=>`<option value="${e}" ${x()===e?`selected`:``}>${e}</option>`).join(``)}
                        </select>
                    </div>
                </div>
                <button id="saveBudgetBtn" class="btn" style="width:100%; background: var(--accent-blue);">Save Budget</button>
            </div>
            
            <div class="card glass card-glow-blue">
                <h2 class="card-title">Active Tracking</h2>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    ${i}
                </div>
            </div>
        </div>
    `,setTimeout(()=>{e.addEventListener(`click`,e=>{let t=e.target?.closest(`.delete-budget-btn`);t?.dataset.budgetId&&ke(t.dataset.budgetId)});let t=e.querySelector(`#saveBudgetBtn`);t&&t.addEventListener(`click`,()=>{let t=parseFloat(M(e,`#budAmt`).value),n=M(e,`#budCurr`).value;if(!t||t<=0)return alert(`Enter a valid amount.`);let r=t;n!==`EUR`&&(r=t*(o[n]||1));let i={id:j(),tripId:M(e,`#budTrip`).value,categoryId:M(e,`#budCat`).value,user:M(e,`#budUser`).value,amount:r,originalAmount:t,originalCurrency:n};m.budgets.push(i),y(`state:changed`),Xe(i),q(`budgets`)})},0),e}function je(){let e=document.createElement(`div`);if(!m.user)return e.innerHTML=`
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
                <p>Log in to view and manage your completed trips.</p>
            </div>
            <div class="card glass" style="text-align: center; padding: 60px; margin-top: 24px;">
                <h2 style="margin-bottom: 20px;">Private Collections</h2>
                <p style="color: var(--text-secondary); margin-bottom: 30px;">Your completed trips are safely attached to your account. Log in to access your travel history.</p>
                <button class="btn" id="collectionsLoginBtn" style="background: var(--accent-blue);">Log In Now</button>
            </div>
        `,e.querySelector(`#collectionsLoginBtn`)?.addEventListener(`click`,()=>q(`profile`)),e;let t=m.archivedTrips||[];return e.innerHTML=`
        <div class="ai-page-header">
            <h1 style="background: linear-gradient(135deg, #1a6b3c, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Collections</h1>
            <p>Your completed travel memories and trip photos.</p>
        </div>
        
        <div class="trip-nav glass" style="margin-top: 24px; display: none;">
            <button class="trip-tab active" id="tabArchived">Completed Trips</button>
        </div>

        <div id="colArchived" class="col-tab-content">
            <div class="grid-2" style="margin-top: 16px;">
                ${t.length>0?t.map(e=>`
                    <div class="card glass card-glow-blue" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; padding: 20px;">
                        <div class="archived-trip-card" data-trip-id="${e.id}" style="cursor: pointer; flex: 1;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <h3 style="margin: 0;">${e.name}</h3>
                            </div>
                            <p style="color: var(--text-secondary); margin: 4px 0 0 0; font-size: 0.85rem;">${e.country}</p>
                            <p style="color: var(--text-secondary); margin: 2px 0 0 0; font-size: 0.85rem;">${(e.expenses||[]).filter(e=>!e.isSettlement).length} expenses</p>
                            <p style="color: var(--accent-blue); margin: 2px 0 0 0; font-size: 0.85rem; font-weight: 700;">Total: ${C((e.expenses||[]).filter(e=>!e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),`EUR`)}</p>
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <div style="display: flex; align-items: center; gap: 12px; background: rgba(0,0,0,0.03); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(0,0,0,0.08); box-shadow: inset 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03);">
                                <span id="publicLabel-${e.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${e.isPublic?`#34c759`:`rgba(0,0,0,0.3)`}; text-shadow: ${e.isPublic?`0 0 12px rgba(52, 199, 89, 0.6)`:`none`};">${e.isPublic?`Public`:`Not public`}</span>
                                <label class="switch" style="transform: scale(0.75);">
                                    <input type="checkbox" class="trip-privacy-toggle" data-trip-id="${e.id}" ${e.isPublic?`checked`:``}>
                                    <span class="slider"></span>
                                </label>
                            </div>
                            <div style="width: 1px; height: 30px; background: var(--glass-border);"></div>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn btn-small restore-trip-btn" data-trip-id="${e.id}" style="background: var(--accent-blue); padding: 8px 16px; font-weight: 700;">Restore</button>
                                <button class="btn btn-small delete-archived-btn" data-trip-id="${e.id}" style="background: rgba(255,59,48,0.1); color: #ff3b30; border: 1px solid rgba(255,59,48,0.3);" title="Delete Permanently">
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
    `,e.querySelector(`#collectionsLoginBtn`)?.addEventListener(`click`,()=>q(`profile`)),e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.restore-trip-btn`);if(n?.dataset.tripId){Fe(n.dataset.tripId);return}let r=t.closest(`.delete-archived-btn`);if(r?.dataset.tripId){Ie(r.dataset.tripId);return}let i=t.closest(`.archived-trip-card`);if(i?.dataset.tripId){Ne(i.dataset.tripId);return}}),e.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-toggle`);t?.dataset.tripId&&Pe(t.dataset.tripId,t.checked)}),e}function Me(e){let t=m.archivedTrips.find(t=>t.id===e),n=document.createElement(`div`);if(!t)return n.innerHTML=`<p style="padding: 40px; text-align: center;">Trip not found.</p>`,n;let r=0;(t.expenses||[]).filter(e=>!e.isSettlement).forEach(e=>r+=e.euroValue||0);let i=null;if(t.tripDays){for(let e of t.tripDays)if(e.photos&&e.photos.length>0){i=e.photos[0];break}}return n.innerHTML=`
        <div class="trip-banner" style="${i?`background: linear-gradient(rgba(0,45,91,0.6), rgba(0,45,91,0.8)), url(${i}) center/cover no-repeat; border: none;`:`background: rgba(255,255,255,0.9); border: 1.5px solid var(--accent-blue);`}">
            <div style="font-size: 0.9rem; color: ${i?`rgba(255,255,255,0.7)`:`rgba(0, 45, 91, 0.5)`}; font-weight: 800; text-transform: uppercase; letter-spacing: 0.25em; margin-bottom: 12px;">Memories of</div>
            <h1 class="trip-banner-title" style="font-size: 4rem; margin: 0; letter-spacing: -0.06em; color: ${i?`#ffffff`:`var(--accent-blue)`}; font-weight: 800; line-height: 0.95;">${t.name}</h1>
            <div style="display: flex; align-items: center; gap: 32px; margin-top: 20px; color: ${i?`rgba(255,255,255,0.9)`:`#1a3a5f`}; font-weight: 700;">
                <span style="display: flex; align-items: center; gap: 8px;">${t.country}</span>
                
                <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.08); padding: 8px 18px; border-radius: 980px; border: 1px solid rgba(255,255,255,0.15); backdrop-filter: blur(20px); box-shadow: inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.1);">
                    <span id="publicLabel-${t.id}" style="width: 85px; display: inline-block; text-align: right; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); color: ${t.isPublic?`#34c759`:`#a1a1aa`}; text-shadow: ${t.isPublic?`0 0 12px rgba(52, 199, 89, 0.6)`:`none`};">${t.isPublic?`Public`:`Not public`}</span>
                    <label class="switch" style="transform: scale(0.75);">
                        <input type="checkbox" class="trip-privacy-toggle" data-trip-id="${t.id}" ${t.isPublic?`checked`:``}>
                        <span class="slider"></span>
                    </label>
                </div>

                <span style="display: flex; align-items: center; gap: 8px;">${t.tripDays?.length||0} Days</span>
                <span style="display: flex; align-items: center; gap: 8px;">${C(r,`EUR`)} spent</span>
            </div>
            <div style="position: absolute; right: 40px; bottom: 40px; display: flex; gap: 12px;">
                <button class="btn restore-trip-btn" data-trip-id="${t.id}" style="background: #002d5b; color: #ffffff; padding: 12px 24px; border-radius: 16px; font-weight: 800;">Restore Trip</button>
                <button class="btn" id="backToCollectionsBtn" style="background: rgba(0,0,0,0.05); color: #002d5b; padding: 12px 24px; border-radius: 16px; font-weight: 800; border: 1px solid rgba(0,0,0,0.1);">Back</button>
            </div>
        </div>

        <div class="day-blocks-grid">
            ${(t.tripDays||[]).sort((e,t)=>e.dayNumber-t.dayNumber).map(e=>{let t=e.photos||[];return e.tickets,`
                    <div class="day-block" style="${t.length>0?`background: linear-gradient(rgba(0,45,91,0.7), rgba(0,45,91,0.85)), url(${t[0]}) center/cover no-repeat; border: none;`:``}">
                        <div class="day-block-header">
                            <span class="day-block-number" style="color: ${t.length>0?`#4da3ff`:`#007aff`};">Day ${e.dayNumber}</span>
                        </div>
                        <h3 class="day-block-name" style="color: ${t.length>0?`#ffffff`:`var(--accent-blue)`}; font-size: 1.6rem; font-weight: 800;">${e.name||`Day ${e.dayNumber}`}</h3>
                    </div>
                `}).join(``)}
        </div>
    `,n.querySelector(`#backToCollectionsBtn`)?.addEventListener(`click`,()=>q(`collections`)),n.addEventListener(`click`,e=>{let t=e.target?.closest(`.restore-trip-btn`);t?.dataset.tripId&&Fe(t.dataset.tripId)}),n.addEventListener(`change`,e=>{let t=e.target?.closest(`.trip-privacy-toggle`);t?.dataset.tripId&&Pe(t.dataset.tripId,t.checked)}),n}var Ne=e=>{let t=document.getElementById(`app-container`);t&&(t.innerHTML=``,t.appendChild(Me(e)))},Pe=async(e,t)=>{let n=m.archivedTrips.find(t=>t.id===e)||m.trips.find(t=>t.id===e);if(!n)return;n.isPublic=t,y(`state:changed`);let r=document.getElementById(`publicLabel-${e}`);if(r&&(r.textContent=t?`Public`:`Not public`,r.style.color=t?`#34c759`:`rgba(0,0,0,0.3)`,r.style.textShadow=t?`0 0 12px rgba(52, 199, 89, 0.6)`:`none`),m.user)try{await fetch(J(`/api/trips/privacy`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id,trip_id:e,is_public:t})})}catch{}},Fe=e=>{let t=m.archivedTrips.find(t=>t.id===e);t&&A({title:`Restore Trip?`,message:`This will move the trip back to your active list.`,confirmText:`Restore`,onConfirm:()=>{t.isArchived=!1,t.expenses&&(m.expenses=[...m.expenses,...t.expenses],delete t.expenses),t.tripDays&&(m.tripDays=[...m.tripDays,...t.tripDays],delete t.tripDays),m.trips.push(t),m.archivedTrips=m.archivedTrips.filter(t=>t.id!==e),m.activeTripId=e,y(`state:changed`),q(`home`)}})},Ie=e=>{A({title:`Delete Permanently?`,message:`This trip and all its memories will be gone forever.`,confirmText:`Delete`,onConfirm:async()=>{if(m.archivedTrips=m.archivedTrips.filter(t=>t.id!==e),y(`state:changed`),m.user)try{await fetch(J(`/api/trips/delete`),{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id,trip_id:e})})}catch{}q(`collections`)}})},W=null,G=[];function Le(){let e=document.createElement(`div`),t=m.trips.find(e=>e.id===m.activeTripId);if(!t)return e.innerHTML=`
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
            </div>`,setTimeout(()=>{e.querySelector(`#aiStartJourneyBtn`)?.addEventListener(`click`,()=>P()),typeof google<`u`&&google.maps&&new google.maps.Map(document.getElementById(`emptyMap`),{center:{lat:20,lng:0},zoom:2,minZoom:2,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]})},100),e;let n=t.country||``,r=m.expenses.filter(e=>e.tripId===m.activeTripId&&e.date).sort((e,t)=>e.date.localeCompare(t.date)).map(e=>e.date),i=r[0]||``,a=r[r.length-1]||``,o=t.aiPlan||null,s=t.aiContext||``,c=t.aiNumDays||1,l=`font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text',sans-serif;`;return e.innerHTML=`
        <div style="${l}">
            <!-- Header -->
            <div style="padding:32px 0 24px;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
                    <h1 style="margin:0;font-size:2.8rem;font-weight:800;letter-spacing:-0.04em;background:linear-gradient(135deg,var(--accent-blue),#9b59b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">Plan with AI ✦</h1>
                </div>
                <p style="margin:0;color:var(--text-secondary);font-size:1rem;">Planning your trip to <strong>${n}</strong></p>
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
                                <input id="aiDateFrom" type="date" class="glass-input" value="${i}" style="width:100%; box-sizing: border-box;">
                            </div>
                            <div>
                                <label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:5px;">To</label>
                                <input id="aiDateTo" type="date" class="glass-input" value="${a}" style="width:100%; box-sizing: border-box;">
                            </div>
                        </div>
                    </div>

                    <div class="card glass" style="padding:20px;">
                        <h2 class="card-title" style="font-size:0.85rem;text-transform:uppercase;color:var(--accent-blue);margin-bottom:10px;letter-spacing:0.05em;">📝 Requirements</h2>
                        <textarea id="aiExtraContext" class="glass-input" rows="3" style="width:100%; resize:none; font-size:0.9rem; box-sizing: border-box;" placeholder="e.g. Vegetarian friendly, no walking more than 2km...">${s}</textarea>
                    </div>
                    <!-- Generate -->
                    <button id="generateBtn" class="btn ai-generate-btn" style="width:100%; padding: 16px; border-radius: 16px; font-weight: 800; background: linear-gradient(135deg, var(--accent-blue), #9b59b6); color: white; border: none; cursor: pointer;">✦ Generate My Itinerary</button>
                </div>

                <!-- Right: Google Map (sticky) -->
                <div style="position:sticky;top:80px;height:700px;">
                    <div class="card glass" style="padding:0;overflow:hidden;height:100%;border-radius:18px;position:relative;">
                        <div id="aiGoogleMap" style="width:100%;height:100%;"></div>
                        <div id="aiZoomBadge" style="position:absolute;bottom:14px;left:14px;background:var(--glass-bg);backdrop-filter:blur(12px);padding:6px 14px;border-radius:980px;border:1px solid var(--glass-border);font-size:0.82rem;font-weight:600;z-index:1000;color:#001a33;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='var(--glass-bg)'">
                            <span>📍</span> <span>${n}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Itinerary Output (full-width below) -->
            <div id="itineraryOutput" style="margin-bottom: 60px;"></div>
        </div>`,setTimeout(()=>{let r=e=>{if(!W)return;let n=t.id+`_ai`;if(m.mapViews&&m.mapViews[n]){let e=m.mapViews[n];W.setCenter({lat:e.lat,lng:e.lng}),W.setZoom(e.zoom);return}if(t.viewport){let e=t.viewport;W.fitBounds(new google.maps.LatLngBounds({lat:e.south,lng:e.west},{lat:e.north,lng:e.east}));return}let r=e.replace(/\(USA\)/g,``).trim();r.includes(` - `)&&(r=r.split(` - `)[1]+`, USA`),new google.maps.Geocoder().geocode({address:r},(e,t)=>{t===`OK`&&e[0]&&W.fitBounds(e[0].geometry.viewport)})};if(typeof google<`u`&&google.maps){let i=document.getElementById(`aiGoogleMap`);i&&(W=new google.maps.Map(i,{center:{lat:20,lng:0},zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[]}),r(n),W.addListener(`idle`,()=>{let e=t.id+`_ai`;m.mapViews||={};let n=W.getCenter();m.mapViews[e]={lat:n.lat(),lng:n.lng(),zoom:W.getZoom()},y(`state:changed`)}));let a=e.querySelector(`#aiZoomBadge`);a&&(a.onclick=()=>{let e=t.id+`_ai`;m.mapViews&&m.mapViews[e]&&delete m.mapViews[e],r(n)})}let i=o,a=(n,r,i)=>{let a=M(e,`#itineraryOutput`);if(!n||!n.length){a.innerHTML=``;return}a.innerHTML=`
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
                    <div>
                        <h2 style="margin:0;font-size:2rem;font-weight:800;letter-spacing:-0.03em;color:white;${l}">${r}-Day ${i} Itinerary</h2>
                        <p style="color:var(--text-secondary);margin:6px 0 0;font-size:0.9rem;">Generated by Gemini AI</p>
                    </div>
                    <div style="font-size:0.78rem;color:var(--text-secondary);background:var(--glass-bg);border:1px solid var(--glass-border);padding:5px 14px;border-radius:980px;">✦ AI-Generated</div>
                </div>
                <div id="itineraryDays" style="display:flex;flex-direction:column;gap:16px;"></div>
                <div style="display:flex;gap:12px;margin-top:24px;"><button id="acceptPlanBtn" class="btn" style="flex:2;background:var(--accent-blue);color:white;padding:16px;font-size:1.1rem;border-radius:16px;font-weight:700;box-shadow:0 10px 20px rgba(0,122,255,0.2);cursor:pointer;">Accept Plan & Add to Trip</button></div>`;let o=M(a,`#itineraryDays`),s=[];if(n.forEach((e,t)=>{let n=document.createElement(`div`);n.className=`card glass`,n.style.cssText=`border-radius:18px;overflow:hidden;transition:box-shadow 0.3s,border-color 0.3s;${l}`,n.innerHTML=`
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
                    </div>`,o.appendChild(n),s.push(n)}),W){G.forEach(e=>e.setMap(null)),G=[];let e=new google.maps.LatLngBounds,t=new google.maps.Geocoder,r=(n,r)=>{let a=n.mainLocation||n.title||i;!n.mainLocation&&n.title&&(a=n.title.replace(/Exploring |Day Trip to |Visit |Touring |Arrival in |Departure from |Day \d+:? /gi,``).trim()),t.geocode({address:a+`, `+i},(t,i)=>{if(i===`OK`&&t[0]){let i=t[0].geometry.location;n.lat=i.lat(),n.lon=i.lng();let a=new google.maps.Marker({position:i,map:W,label:{text:String(n.day),color:`white`,fontWeight:`800`},icon:{path:google.maps.SymbolPath.CIRCLE,scale:16,fillColor:`#0071e3`,fillOpacity:1,strokeWeight:2,strokeColor:`white`}});a.addListener(`click`,()=>{s.forEach(e=>{e.style.boxShadow=``,e.style.borderColor=``});let e=s[r];e&&(e.style.boxShadow=`0 0 0 3px var(--accent-blue), 0 8px 32px rgba(0,113,227,0.25)`,e.style.borderColor=`var(--accent-blue)`,e.scrollIntoView({behavior:`smooth`,block:`center`}))}),G.push(a),e.extend(i),G.length>0&&W.fitBounds(e)}})};n.forEach((e,t)=>setTimeout(()=>r(e,t),t*500))}let c=document.getElementById(`acceptPlanBtn`);c&&(c.onclick=()=>{n&&(n.forEach((e,n)=>{let r=e.date||new Date().toISOString().split(`T`)[0],i=`day_`+Date.now()+`_`+n;m.tripDays.push({id:i,tripId:t.id,date:r,name:e.title||`Day ${n+1}`,dayNumber:n+1,lat:e.lat,lon:e.lon,photos:[],tickets:[],notes:``,plan:{morning:e.morning?`${e.morning.activity}: ${e.morning.description}`:``,afternoon:e.afternoon?`${e.afternoon.activity}: ${e.afternoon.description}`:``,evening:e.evening?`${e.evening.activity}: ${e.evening.description}`:``}})}),y(`state:changed`),c.innerHTML=`✓ Plan Accepted! (View in Home)`,c.style.background=`#34c759`,c.disabled=!0)})};i&&a(i,c,n);let s=e.querySelector(`#aiExtraContext`);s&&(s.oninput=e=>{t.aiContext=e.target.value,y(`state:changed`)}),e.querySelector(`#generateBtn`)?.addEventListener(`click`,async()=>{let r=M(e,`#itineraryOutput`),o=M(e,`#aiDateFrom`).value,s=M(e,`#aiDateTo`).value,c=document.getElementById(`aiExtraContext`)?.value??``;if(!o||!s){alert(`Please select your travel dates.`);return}let l=new Date(o),u=new Date(s),d=Math.max(1,Math.round((u.getTime()-l.getTime())/864e5)+1);t.aiContext=c,t.aiNumDays=d,y(`state:changed`),r.innerHTML=`<div style="text-align:center;padding:60px;"><div class="spinner-ring" style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent-blue);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 20px;"></div><div style="color:white;font-weight:600;">Consulting Gemini AI...</div></div>`,r.scrollIntoView({behavior:`smooth`});try{let e=await(await fetch(J(`/api/generate_itinerary`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({destination:n,numDays:d,dateFrom:o,dateTo:s,context:c})})).json();if(e.error)throw Error(e.error);i=e.itinerary,t.aiPlan=i??void 0,y(`state:changed`),a(i,d,n),r.scrollIntoView({behavior:`smooth`})}catch(e){r.innerHTML=`<div class="card glass" style="text-align:center;padding:40px;"><h2 style="color:#ff3b30;">Generation Failed</h2><p>${e.message}</p></div>`}})},0),e}function Re(){let e=document.createElement(`div`);if(!m.user)return e.innerHTML=`
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
        `,e;let t=m.activeTripId||(m.trips.length>0?m.trips[0].id:null);function n(e){let t=m.trips.find(t=>t.id===e),n=`
            <div style="margin-bottom: 32px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
                    <h2 style="font-size: 1.2rem; letter-spacing: -0.02em; margin: 0;">Select a Trip</h2>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">${m.trips.length} Adventures</span>
                </div>
                <div style="display: flex; gap: 16px; overflow-x: auto; padding-bottom: 12px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch;">
                    ${m.trips.map(t=>{let n=m.expenses.filter(e=>e.tripId===t.id&&e.isSettlement).reduce((e,t)=>e+(t.euroValue||0),0),r=t.id===e;return`
                            <div class="card glass settlement-trip-card ${r?`card-glow-blue`:``}"
                                 data-trip-id="${t.id}"
                                 style="min-width: 200px; padding: 20px; cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); border: 2px solid ${r?`var(--accent-blue)`:`transparent`}; transform: ${r?`scale(1.02)`:`scale(1)`}; opacity: ${r?`1`:`0.8`};">
                                <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 800; margin-bottom: 6px; letter-spacing: 0.05em;">Adventure</div>
                                <div style="font-weight: 700; font-size: 1.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 12px;">${t.name}</div>
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div style="font-size: 1.3rem; font-weight: 800; color: ${r?`var(--accent-blue)`:`white`};">${C(n,`EUR`)}</div>
                                    ${r?`<div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent-blue);"></div>`:``}
                                </div>
                            </div>
                        `}).join(``)}
                </div>
            </div>
        `;if(!t)return`
                <div class="ai-page-header">
                    <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                    <p>Calculate who owes what across your adventures.</p>
                </div>
                <div class="card glass card-glow-teal" style="text-align: center; padding: 60px; margin-top: 24px;">
                    <div style="font-size: 4rem; margin-bottom: 20px;">⚖️</div>
                    <h2>No trips found</h2>
                    <p style="color: var(--text-secondary);">Create a trip and add expenses to see settlement calculations.</p>
                </div>
            `;let r=m.expenses.filter(t=>t.tripId===e),i={};m.groups.forEach(e=>i[e]=0),r.forEach(e=>{let t=e.euroValue||e.value||0,n=e.who;if(i[n]!==void 0&&(i[n]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))i[n]!==void 0&&(i[n]-=t*(Number(r)/100));else{let e=t/Math.max(m.groups.length,1);m.groups.forEach(t=>i[t]-=e)}});let a=[],o=[],s=[];for(let[e,t]of Object.entries(i))t>.01?o.push({person:e,amount:t}):t<-.01&&s.push({person:e,amount:Math.abs(t)});let c=o.map(e=>({...e})),l=s.map(e=>({...e}));c.sort((e,t)=>t.amount-e.amount),l.sort((e,t)=>t.amount-e.amount);let u=0,d=0;for(;u<l.length&&d<c.length;){let e=Math.min(l[u].amount,c[d].amount);a.push({from:l[u].person,to:c[d].person,amount:e}),l[u].amount-=e,c[d].amount-=e,l[u].amount<.01&&u++,c[d].amount<.01&&d++}let f={};m.groups.forEach(e=>f[e]=0);let p=(m.archivedTrips||[]).flatMap(e=>e.expenses||[]);[...m.expenses,...p].forEach(e=>{let t=e.euroValue||e.euro_value||e.value||0,n=e.who;if(f[n]!==void 0&&(f[n]+=t),e.splits&&Object.keys(e.splits).length>0)for(let[n,r]of Object.entries(e.splits))f[n]!==void 0&&(f[n]-=t*(Number(r)/100));else{let e=t/Math.max(m.groups.length,1);m.groups.forEach(t=>f[t]-=e)}});let h=Math.max(...Object.values(f).map(Math.abs),1);return`
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #ffd60a, #ff9f0a); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Settlements</h1>
                <p>Calculate who owes what and settle up fairly.</p>
            </div>

            ${n}

            <div class="card glass" style="margin-bottom: 24px; padding: 20px; border-radius: 20px; border-left: 4px solid var(--accent-blue); background: rgba(0, 113, 227, 0.03);">
                <div id="globalBalancesHeader" style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;">
                    <h2 class="card-title" style="margin: 0; font-size: 1.1rem; color: var(--text-primary);">🌍 Global Net Balances</h2>
                    <span style="font-size: 0.8rem; color: var(--accent-blue); font-weight: 700;">Show / Hide</span>
                </div>
                <div id="globalBalancesContainer" style="display: none; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${(()=>{let e=Object.values(f).map(Math.abs).some(e=>e>.01);return Object.entries(f).map(([t,n])=>{let r=e?Math.abs(n)/h*100:0;return`
                                    <div style="display: grid; grid-template-columns: 100px ${e?`1fr`:``} 80px; align-items: center; gap: 16px;">
                                        <div style="font-weight: 700; font-size: 0.9rem;">${t}</div>
                                        ${e?`
                                            <div style="height: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; overflow: hidden; position: relative;">
                                                <div style="position: absolute; height: 100%; width: ${r}%; background: ${n>=0?`linear-gradient(90deg, #34c759, #4cd964)`:`linear-gradient(90deg, #ff3b30, #ff453a)`}; border-radius: 6px; transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);"></div>
                                            </div>
                                        `:``}
                                        <div style="text-align: right; font-weight: 800; font-size: 1rem; color: ${n>.01?`#34c759`:n<-.01?`#ff3b30`:`var(--text-secondary)`};">
                                            ${n>.01?`+`:``}${C(n,`EUR`)}
                                        </div>
                                    </div>
                                `}).join(``)})()}
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 24px;">
                <div style="display: inline-block; padding: 8px 16px; background: rgba(0, 113, 227, 0.1); border-radius: 100px; border: 1px solid var(--accent-blue); font-size: 0.8rem; font-weight: 700; color: var(--accent-blue); margin-bottom: 12px;">
                    Active View: ${t.name}
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
                            ${Object.entries(i).map(([e,t])=>`
                                <tr>
                                    <td style="font-weight: 500;">${e}</td>
                                    <td style="text-align: right; color: ${t>=0?`#34c759`:`#ff3b30`}; font-weight: 700;">
                                        ${t>=0?`+`:``}${C(t,`EUR`)}
                                    </td>
                                </tr>
                            `).join(``)}
                        </tbody>
                    </table>
                </div>

                <div class="card glass card-glow-blue">
                    <h2 class="card-title">Suggested Payments</h2>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${a.length>0?a.map(t=>`
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: rgba(0, 113, 227, 0.05); border-radius: 12px; border: 1px solid rgba(0, 113, 227, 0.1);">
                                <div style="display: flex; align-items: center; gap: 16px;">
                                    <div>
                                        <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 700;">${t.from} pays</span>
                                        <div style="font-weight: 700; font-size: 1.1rem;">${t.to}</div>
                                    </div>
                                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-blue);">${C(t.amount,`EUR`)}</div>
                                </div>
                                <button class="btn btn-small settle-debt-btn" data-trip-id="${e}" data-from="${t.from}" data-to="${t.to}" data-amount="${t.amount}" style="background: var(--accent-blue); padding: 8px 16px; border-radius: 12px;">Settle</button>
                            </div>
                        `).join(``):`<p style="color: var(--text-secondary); text-align: center; padding: 20px; font-weight: 600;">All settled for this trip! 🥂</p>`}
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 16px; margin-top: 32px; justify-content: center; flex-wrap: wrap;">
                <button class="btn open-manual-settle-btn" data-trip-id="${e}" style="background: rgba(255,255,255,0.1); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.2); padding: 16px 32px; border-radius: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                    <span>➕</span> Manual Settlement
                </button>
                <button class="btn open-past-settle-btn" data-trip-id="${e}" style="background: rgba(255,255,255,0.1); color: var(--text-primary); border: 1px solid rgba(255,255,255,0.2); padding: 16px 32px; border-radius: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                    <span>📜</span> Past Settlements
                </button>
            </div>
        `}let r=r=>{t=r,e.innerHTML=n(r)},i=(t,r,i,a,o=`EUR`)=>{let s=S(a,o,`EUR`),c={id:j(),tripId:t,label:`Settlement: ${r} → ${i}`,value:a,euroValue:s,currency:o,who:r,categoryId:m.categories[0]?.id??``,country:`Settlement`,date:new Date().toISOString().split(`T`)[0],splits:{[i]:100},isSettlement:!0};m.expenses.push(c),y(`state:changed`),e.innerHTML=n(t)},a=e=>{let t=document.createElement(`div`);t.className=`modal-overlay`,t.style.display=`flex`,t.style.backdropFilter=`blur(25px)`;let n=m.groups.map(e=>`<option value="${e}">${e}</option>`).join(``);t.innerHTML=`
            <div class="card glass" style="width: 400px; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <h2 style="margin: 0 0 20px; font-size: 1.5rem; text-align: center; color: white;">Manual Settlement</h2>
                
                <form id="manualSettleForm" style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">From</label>
                        <select id="manualSettleFrom" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${n}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">To</label>
                        <select id="manualSettleTo" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${n}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">Amount (${x()})</label>
                        <input type="number" step="0.01" min="0.01" id="manualSettleAmount" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);" placeholder="0.00" required>
                    </div>

                    <div style="margin-top: 12px; display: flex; gap: 10px;">
                        <button type="submit" class="btn" style="flex: 1; background: var(--accent-blue); padding: 14px; border-radius: 12px;">Record Payment</button>
                        <button type="button" id="cancelManualSettleBtn" class="btn" style="padding: 14px; background: rgba(255,255,255,0.1); border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); color: white;">Cancel</button>
                    </div>
                </form>
            </div>
        `,document.body.appendChild(t),M(t,`#cancelManualSettleBtn`).onclick=()=>t.remove(),M(t,`#manualSettleForm`).onsubmit=n=>{n.preventDefault();let r=M(t,`#manualSettleFrom`).value,a=M(t,`#manualSettleTo`).value,o=parseFloat(M(t,`#manualSettleAmount`).value);if(r===a){alert(`Sender and receiver must be different.`);return}i(e,r,a,o,x()),t.remove()}},o=e=>{let t=document.createElement(`div`);t.className=`modal-overlay`,t.style.display=`flex`,t.style.backdropFilter=`blur(25px)`;let n=m.expenses.filter(t=>t.tripId===e&&t.isSettlement).sort((e,t)=>new Date(t.date).getTime()-new Date(e.date).getTime()),r=n.length===0?`<p style="color: var(--text-secondary); text-align: center; padding: 20px;">No past settlements recorded for this trip.</p>`:n.map(t=>`
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 12px;">
                    <div>
                        <div style="font-weight: 700; font-size: 1.1rem; color: white;">${t.label}</div>
                        <div style="font-size: 0.8rem; color: rgba(255,255,255,0.7); margin-top: 4px;">${t.date}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 16px;">
                        <div style="font-size: 1.2rem; font-weight: 800; color: #34c759;">${C(t.euroValue,`EUR`)}</div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-small edit-settlement-btn" data-settlement-id="${t.id}" style="background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 8px; color: white; border: 1px solid rgba(255,255,255,0.2);">Edit</button>
                            <button class="btn btn-small unsettle-settlement-btn" data-settlement-id="${t.id}" data-trip-id="${e}" style="background: rgba(255,59,48,0.1); padding: 8px 12px; border-radius: 8px; color: #ff3b30; border: 1px solid rgba(255,59,48,0.2);">Unsettle</button>
                        </div>
                    </div>
                </div>
            `).join(``);t.id=`pastSettlementsModal`,t.innerHTML=`
            <div class="card glass" style="width: 500px; max-height: 80vh; overflow-y: auto; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; font-size: 1.5rem; color: white;">Past Settlements</h2>
                    <button class="btn btn-small" id="closePastSettleBtn" style="background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.2); color: white;">Close</button>
                </div>
                
                <div style="display: flex; flex-direction: column;">
                    ${r}
                </div>
            </div>
        `,document.body.appendChild(t),M(t,`#closePastSettleBtn`).onclick=()=>t.remove(),t.addEventListener(`click`,e=>{let n=e.target;if(!n)return;let r=n.closest(`.edit-settlement-btn`);if(r?.dataset.settlementId){c(r.dataset.settlementId),t.remove();return}let i=n.closest(`.unsettle-settlement-btn`);if(i?.dataset.settlementId&&i.dataset.tripId){s(i.dataset.settlementId,i.dataset.tripId),t.remove();return}})},s=(t,r)=>{A({title:`Unsettle Payment?`,message:`This will remove the settlement and revert the balances. Are you sure?`,confirmText:`Unsettle`,onConfirm:()=>{m.expenses=m.expenses.filter(e=>e.id!==t),y(`state:changed`),e.innerHTML=n(r)}})},c=r=>{let i=m.expenses.find(e=>e.id===r);if(!i)return;let a=document.createElement(`div`);a.className=`modal-overlay`,a.style.display=`flex`,a.style.backdropFilter=`blur(25px)`;let o=m.groups.map(e=>`<option value="${e}" ${i.who===e?`selected`:``}>${e}</option>`).join(``),s=Object.keys(i.splits||{})[0];a.innerHTML=`
            <div class="card glass" style="width: 400px; padding: 32px; border-radius: 32px; animation: modalPop 0.4s cubic-bezier(0.16, 1, 0.3, 1); border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.15); box-shadow: 0 40px 100px rgba(0,0,0,0.4);">
                <h2 style="margin: 0 0 20px; font-size: 1.5rem; text-align: center; color: white;">Edit Settlement</h2>
                
                <form id="editSettlementForm" style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">From</label>
                        <select id="editSettleFrom" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${o}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">To</label>
                        <select id="editSettleTo" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">${m.groups.map(e=>`<option value="${e}" ${s===e?`selected`:``}>${e}</option>`).join(``)}</select>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">Amount (${x()})</label>
                        <input type="number" step="0.01" min="0.01" id="editSettleAmount" value="${S(i.euroValue,`EUR`,x()).toFixed(2)}" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);" required>
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-size: 0.75rem; font-weight: 700; color: rgba(255,255,255,0.7); text-transform: uppercase;">Date</label>
                        <input type="date" id="editSettleDate" value="${i.date}" class="glass-input" style="width: 100%; padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);" required>
                    </div>

                    <div style="margin-top: 12px; display: flex; gap: 10px;">
                        <button type="submit" class="btn" style="flex: 1; background: var(--accent-blue); padding: 14px; border-radius: 12px;">Update</button>
                        <button type="button" id="cancelEditSettleBtn" class="btn" style="padding: 14px; background: rgba(255,255,255,0.1); border-radius: 12px; border: 1px solid rgba(255,255,255,0.2);">Cancel</button>
                    </div>
                </form>
            </div>
        `,document.body.appendChild(a),M(a,`#cancelEditSettleBtn`).onclick=()=>a.remove(),M(a,`#editSettlementForm`).onsubmit=r=>{r.preventDefault();let o=M(a,`#editSettleFrom`).value,s=M(a,`#editSettleTo`).value,c=parseFloat(M(a,`#editSettleAmount`).value),l=M(a,`#editSettleDate`).value;if(o===s){alert(`Sender and receiver must be different.`);return}let u=x();i.who=o,i.splits={[s]:100},i.value=c,i.currency=u,i.euroValue=S(c,u,`EUR`),i.date=l,i.label=`Settlement: ${o} → ${s}`,y(`state:changed`),a.remove(),e.innerHTML=n(t)}};return e.innerHTML=n(t),e.addEventListener(`click`,t=>{let n=t.target;if(!n)return;let s=n.closest(`.settlement-trip-card`);if(s?.dataset.tripId){r(s.dataset.tripId);return}let c=n.closest(`.settle-debt-btn`);if(c?.dataset.tripId&&c.dataset.from&&c.dataset.to&&c.dataset.amount){i(c.dataset.tripId,c.dataset.from,c.dataset.to,parseFloat(c.dataset.amount));return}let l=n.closest(`.open-manual-settle-btn`);if(l?.dataset.tripId){a(l.dataset.tripId);return}let u=n.closest(`.open-past-settle-btn`);if(u?.dataset.tripId){o(u.dataset.tripId);return}if(n.closest(`#globalBalancesHeader`)){let t=e.querySelector(`#globalBalancesContainer`);t&&(t.style.display=t.style.display===`none`?`block`:`none`);return}}),e}function ze(){let e=document.createElement(`div`),t=async()=>{if(m.user)try{let t=await(await fetch(J(`/api/friends/list?user_id=${m.user.id}`))).json(),n=await(await fetch(J(`/api/friends/pending?user_id=${m.user.id}`))).json(),r=e.querySelector(`#friendsList`),i=e.querySelector(`#pendingList`);r&&(t.length===0?r.innerHTML=`<div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No friends added yet.</div>`:r.innerHTML=t.map(e=>`
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
                    `).join(``)),i&&(n.length===0?i.innerHTML=`<div style="color: var(--text-secondary); text-align: center; padding: 20px; background: rgba(255,255,255,0.02); border-radius: 12px;">No pending requests.</div>`:i.innerHTML=n.map(e=>`
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
                    `).join(``))}catch(e){console.error(`Error loading friends:`,e)}},n=async()=>{if(!m.user)return;let t=M(e,`#friendSearchInput`).value.trim(),n=M(e,`#searchResults`);if(t){n.innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">Searching...</p>`;try{let e=(await(await fetch(J(`/api/friends/search?q=${encodeURIComponent(t)}`))).json()).filter(e=>e.id!==m.user?.id);e.length===0?n.innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:var(--text-secondary);">No user found. Ask them to login first!</p>`:n.innerHTML=e.map(e=>`
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
                `).join(``)}catch{n.innerHTML=`<p style="color:red;">Error searching.</p>`}}},r=async n=>{if(!m.user){alert(`Please login first`);return}if(n===m.user.id){k(`You can't send a friend request to yourself!`);return}try{let r=await(await fetch(J(`/api/friends/add`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id,friend_id:n})})).json();r.status===`success`?(M(e,`#searchResults`).innerHTML=`<p style="text-align:center; padding:10px; font-size:0.8rem; color:#34c759;">Request sent!</p>`,M(e,`#friendSearchInput`).value=``,t()):r.status===`error`&&alert(r.message)}catch{alert(`Failed to send request`)}},i=async e=>{if(m.user)try{let n=await(await fetch(J(`/api/friends/accept`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id,friend_id:e})})).json();n.status===`success`?(k(`Friend request accepted!`),t()):alert(n.message||`Failed to accept request`)}catch(e){console.error(`Error accepting friend:`,e)}};return e.innerHTML=`
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
    `,e.querySelector(`#friendSearchBtn`)?.addEventListener(`click`,n),e.querySelector(`#friendSearchInput`)?.addEventListener(`keyup`,e=>{e.key===`Enter`&&n()}),e.addEventListener(`click`,e=>{let t=e.target;if(!t)return;let n=t.closest(`.accept-friend-btn`);if(n){i(n.dataset.userId);return}let a=t.closest(`.send-friend-btn`);if(a){r(a.dataset.userId);return}let o=t.closest(`.friend-row`);if(o){q(`profile`,{userId:o.dataset.userId});return}}),setTimeout(t,0),e}var Be=async()=>{try{try{await Y()}catch(e){console.error(`Final sync before logout failed:`,e)}await fetch(J(`/api/logout`),{method:`POST`}),m.user=null,m.activeTripId=null,m.trips=[],m.archivedTrips=[],m.expenses=[],m.tripDays=[],m.groups=[],m.budgets=[],m.activities=[],m.photos=[],m.notifications=[],m.savedFormats=[],m.profilePhoto=null,m.draftExpense={who:``,categoryId:``,label:``,date:``,country:``,value:``,currency:`EUR`,euroValue:``},y(`state:changed`),He(),q(`profile`)}catch{}};function Ve(e=null){let t=document.createElement(`div`),n=!e||m.user&&e===m.user.id;if(!m.user&&n){let e=m.hasLoggedInBefore;return t.innerHTML=`
            <div class="ai-page-header">
                <h1 style="background: linear-gradient(135deg, #007aff, #34c759); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Log In</h1>
                <p>${e?`Sign in to your account to securely save and sync your trips across all your devices.`:`Sign in with Google to start syncing your trips and travel memories across all your devices.`}</p>
            </div>
            <div style="display: flex; justify-content: center; align-items: center; min-height: 50vh;">
                <div class="card glass" style="padding: 50px; text-align: center; border-radius: 32px; max-width: 400px; width: 100%;">
                    <h2 style="margin-bottom: 30px; font-size: 1.5rem; color: var(--accent-blue);">${e?`Welcome back`:`Create your account with Google`}</h2>
                    <div id="profileLoginBtnContainer" style="display: flex; justify-content: center; min-height: 40px;"></div>
                </div>
            </div>
        `,setTimeout(()=>{window.google&&window.google.accounts&&window.globalGoogleClientId&&window.google.accounts.id.renderButton(t.querySelector(`#profileLoginBtnContainer`),{theme:`outline`,size:`large`,width:280})},300),t}let r=(e,r)=>{let i=[...new Set((r||[]).map(e=>e.country).filter(Boolean))],a=e.picture;t.innerHTML=`
            <div style="max-width: 800px; margin: 0 auto; padding-bottom: 60px;">
                ${n?``:`
                    <button class="btn btn-small" id="profileBackToFriendsBtn" style="margin-bottom: 20px; background: rgba(0,0,0,0.05); color: var(--text-primary); border: 1px solid var(--glass-border); padding: 8px 16px; border-radius: 12px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                        Back to Friends
                    </button>
                `}

                <!-- Instagram-style Profile Header -->
                <div style="display: flex; align-items: flex-start; gap: 40px; padding: 30px 20px; border-bottom: 1px solid var(--glass-border); margin-bottom: 30px;">
                    <!-- Avatar -->
                    <div style="position: relative; flex-shrink: 0; ${n?`cursor: pointer;`:``} border-radius: 50%;" id="${n?`profilePicWrapper`:``}" title="${n?`Change profile photo`:``}">
                        <div style="padding: 4px; background: linear-gradient(135deg, #4da3ff 0%, var(--accent-blue) 50%, #004080 100%); border-radius: 50%;">
                            <img id="profilePicDisplay" src="${a}" alt="Profile Picture" style="width: 140px; height: 140px; border-radius: 50%; border: 4px solid var(--bg-color); object-fit: cover; display: block; transition: opacity 0.2s; background: var(--bg-color);">
                        </div>
                        ${n?`
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
                            <h2 style="margin: 0; font-size: 1.6rem; font-weight: 700; color: var(--text-primary); letter-spacing: -0.02em;">${e.name}</h2>
                            ${n?`
                                <button id="profileLogoutBtn" style="background: transparent; color: var(--text-secondary); font-weight: 600; border: 1px solid var(--glass-border); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,59,48,0.1)'; this.style.color='#ff3b30'; this.style.borderColor='rgba(255,59,48,0.2)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)'; this.style.borderColor='var(--glass-border)';">Log Out</button>
                            `:``}
                        </div>
                        
                        <!-- Stats Row -->
                        <div style="display: flex; gap: 32px; margin-bottom: 24px;">
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${r.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">public trips</span>
                            </div>
                            <div style="text-align: left;">
                                <span style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary);">${i.length}</span>
                                <span style="font-size: 1.1rem; color: var(--text-primary); font-weight: 400; margin-left: 4px;">countries</span>
                            </div>
                        </div>
                        
                        <!-- Bio & Status -->
                        <div>
                            <div style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin-bottom: 4px;">${e.email}</div>
                            
                            <!-- Inline Status -->
                            <div style="position: relative; display: inline-block; margin-bottom: 8px;">
                                ${n?`
                                    <select id="profileStatus" style="appearance: none; background: rgba(0, 113, 227, 0.08); color: var(--accent-blue); border: 1px solid rgba(0, 113, 227, 0.15); border-radius: 12px; padding: 2px 24px 2px 10px; font-size: 0.8rem; font-weight: 700; cursor: pointer; outline: none; transition: all 0.2s;">
                                        <option value="" disabled ${e.status?``:`selected`}>Set status...</option>
                                        <option value="Deliberating next trip" ${e.status===`Deliberating next trip`?`selected`:``}>🤔 Deliberating next trip</option>
                                        <option value="Preparing a trip right now" ${e.status===`Preparing a trip right now`?`selected`:``}>🎒 Preparing a trip right now</option>
                                        <option value="Exploring the world" ${e.status===`Exploring the world`?`selected`:``}>🌍 Exploring the world</option>
                                        <option value="Resting at home base" ${e.status===`Resting at home base`?`selected`:``}>🏠 Resting at home base</option>
                                        <option value="Hunting for flight deals" ${e.status===`Hunting for flight deals`?`selected`:``}>✈️ Hunting for flight deals</option>
                                    </select>
                                    <div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--accent-blue); font-size: 0.6rem;">▼</div>
                                `:`
                                    <div style="background: rgba(0, 113, 227, 0.05); color: var(--accent-blue); border-radius: 12px; padding: 4px 12px; font-size: 0.8rem; font-weight: 700; display: inline-block;">
                                        ${e.status||`Active Traveler`}
                                    </div>
                                `}
                            </div>

                            <!-- Bio -->
                            ${n?`
                                <textarea id="profileBio" placeholder="Add a bio..." style="width: 100%; max-width: 500px; min-height: 40px; background: transparent; border: 1px solid transparent; border-radius: 8px; color: var(--text-primary); font-size: 0.95rem; font-family: inherit; line-height: 1.5; resize: none; outline: none; padding: 6px; margin-left: -6px; transition: all 0.2s;" onfocus="this.style.background='rgba(0,0,0,0.03)'; this.style.borderColor='var(--glass-border)';" onblur="this.style.background='transparent'; this.style.borderColor='transparent';">${e.bio||``}</textarea>

                                <!-- Home currency picker — the currency totals
                                     and insights will be displayed in. -->
                                <div style="margin-top: 14px; max-width: 500px;">
                                    <label for="profileHomeCurrency" style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px; letter-spacing: 0.04em;">
                                        Home currency — what you'll see totals and insights in
                                    </label>
                                    <div style="position: relative; display: inline-block;">
                                        <select id="profileHomeCurrency" style="appearance: none; background: rgba(0, 113, 227, 0.08); color: var(--accent-blue); border: 1px solid rgba(0, 113, 227, 0.15); border-radius: 12px; padding: 6px 28px 6px 12px; font-size: 0.85rem; font-weight: 700; cursor: pointer; outline: none; transition: all 0.2s;">
                                            ${Object.keys(o).map(e=>`
                                                <option value="${e}" ${x()===e?`selected`:``}>${s[e]||e}  ${e}</option>
                                            `).join(``)}
                                        </select>
                                        <div style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--accent-blue); font-size: 0.6rem;">▼</div>
                                    </div>
                                </div>

                                <div style="margin-top: 8px;">
                                    <button id="saveProfileBtn" class="btn btn-small" style="background: var(--text-primary); color: var(--bg-color); padding: 6px 16px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; opacity: 0; transition: opacity 0.3s; pointer-events: none;">Save Profile</button>
                                </div>
                            `:`
                                <p style="font-size: 0.95rem; color: var(--text-primary); line-height: 1.5; margin: 4px 0;">${e.bio||`No bio yet.`}</p>
                            `}
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: center; margin-bottom: 24px;">
                    <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.9rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-primary);">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${n?`Your footprint`:`${e.name.split(` `)[0]}'s footprint`}
                    </div>
                </div>

                <!-- Footprint Section -->
                <div style="margin-top: 20px;">
                    <p style="color: var(--text-secondary); text-align: center; margin-top: 0; margin-bottom: 24px; font-size: 0.9rem;">
                        ${n?`Every country you've been to, lit up.`:`Explore where `+e.name.split(` `)[0]+` has been.`}
                    </p>
                    
                    <div class="card glass" style="padding: 0; overflow: hidden; border-radius: 20px; position: relative; z-index: 1; border: 1px solid var(--glass-border);">
                        <div id="legaciesMap" style="width: 100%; height: 450px;"></div>
                    </div>
                </div>
            </div>
        `,setTimeout(()=>{if(t.querySelector(`#profileBackToFriendsBtn`)?.addEventListener(`click`,()=>q(`friends`)),t.querySelector(`#profileLogoutBtn`)?.addEventListener(`click`,()=>Be()),n){let e=t.querySelector(`#profileStatus`),n=t.querySelector(`#profileBio`),r=t.querySelector(`#profileHomeCurrency`),i=t.querySelector(`#saveProfileBtn`),a=()=>{i&&(i.style.opacity=`1`,i.style.pointerEvents=`auto`)};e&&(e.onchange=a),n&&(n.oninput=a),r&&(r.onchange=a),i&&(i.onclick=async()=>{if(!m.user||!e||!n)return;let t=e.value,a=n.value,o=r?r.value:m.user.homeCurrency||null;try{(await fetch(J(`/api/profile/update`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id,bio:a,status:t,homeCurrency:o})})).ok&&(m.user.bio=a,m.user.status=t,m.user.homeCurrency=o,y(`state:changed`),i.style.opacity=`0`,i.style.pointerEvents=`none`,k(`Profile updated!`))}catch{}});let o=t.querySelector(`#profilePhotoInput`),s=t.querySelector(`#profilePicWrapper`),c=t.querySelector(`#profilePicOverlay`);s&&(s.onclick=()=>o&&o.click(),c&&(s.onmouseenter=()=>c.style.opacity=`1`,s.onmouseleave=()=>c.style.opacity=`0`)),o&&(o.onchange=e=>{let n=e.target.files?.[0];if(!n)return;let r=new FileReader;r.onload=e=>{let n=typeof e.target?.result==`string`?e.target.result:null;m.profilePhoto=n,y(`state:changed`);let r=t.querySelector(`#profilePicDisplay`);r&&n&&(r.src=n)},r.readAsDataURL(n)})}if(typeof google<`u`&&google.maps){let e=document.getElementById(`legaciesMap`);if(e){let t=new google.maps.Map(e,{center:{lat:20,lng:0},zoom:2,minZoom:2,mapTypeId:`roadmap`,disableDefaultUI:!0,restriction:{latLngBounds:{north:85,south:-85,west:-180,east:180},strictBounds:!0},styles:[{featureType:`all`,elementType:`labels`,stylers:[{visibility:`off`}]},{featureType:`administrative`,elementType:`geometry`,stylers:[{visibility:`on`},{color:`#e0e0e0`}]},{featureType:`landscape`,stylers:[{color:`#f0f0f5`}]},{featureType:`water`,stylers:[{color:`#ffffff`}]}]});fetch(`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson`).then(e=>e.json()).then(e=>{t.data.addGeoJson(e),t.data.setStyle(e=>{let t=(e.getProperty(`NAME`)||e.getProperty(`name`)||e.getProperty(`admin`)||``).toLowerCase();if(!t)return{visible:!1};if(i.some(e=>{if(!e)return!1;let n=e.split(` (`)[0].split(` - `)[0].toLowerCase();return n===`usa`&&(n=`united states`),n===`uk`&&(n=`united kingdom`),t===n||t.includes(n)||n.includes(t)||n===`united states`&&(t.includes(`america`)||t===`usa`)})){let e=0;for(let n=0;n<t.length;n++)e=t.charCodeAt(n)+((e<<5)-e);return{fillColor:`hsl(${Math.abs(e%360)}, 70%, 60%)`,fillOpacity:.7,strokeColor:`#ffffff`,strokeWeight:.5,visible:!0}}return{fillColor:`#d0d0d5`,fillOpacity:.2,strokeColor:`#ffffff`,strokeWeight:.5,visible:!0}})});let n=new google.maps.Geocoder,a={};r.filter(e=>e.isPublic).forEach(e=>{let t=e.country||e.name;t&&(a[t]||(a[t]=[]),a[t].push(e))});let o=(e,n,r)=>{let i=new google.maps.Marker({position:e,map:t,icon:{path:google.maps.SymbolPath.CIRCLE,fillOpacity:1,fillColor:`#ff2d55`,strokeColor:`white`,strokeWeight:2,scale:r.length>1?14:10}}),a=r.map(e=>`
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06);">
                                <span style="font-weight: 600; color: #000;">${e.name}</span>
                                <button class="archived-trip-view-btn" data-trip-id="${e.id}" style="background: #007aff; color: white; border: none; padding: 4px 12px; border-radius: 8px; font-weight: 700; font-size: 0.75rem; cursor: pointer;">View</button>
                            </div>
                        `).join(``),o=document.createElement(`div`);o.style.cssText=`padding: 4px 8px; min-width: 220px; max-width: 300px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;`,o.innerHTML=`
                            <div style="font-weight: 800; font-size: 0.7rem; text-transform: uppercase; color: rgba(0,0,0,0.5); letter-spacing: 0.1em; margin-bottom: 6px;">${n} — ${r.length} trip${r.length>1?`s`:``}</div>
                            ${a}
                        `,o.addEventListener(`click`,e=>{let t=e.target?.closest(`.archived-trip-view-btn`);t?.dataset.tripId&&Ne(t.dataset.tripId)});let s=new google.maps.InfoWindow({content:o});i.addListener(`click`,()=>s.open(t,i))};(async()=>{for(let[e,t]of Object.entries(a)){let r=t.find(e=>typeof e.lat==`number`&&typeof e.lng==`number`);if(r){o({lat:r.lat,lng:r.lng},e,t);continue}n.geocode({address:e},(n,r)=>{r===`OK`&&n[0]&&o(n[0].geometry.location,e,t)}),await new Promise(e=>setTimeout(e,800))}})()}}},100)};if(n){let e=[...m.trips||[],...m.archivedTrips||[]],t=new Date,n=e.filter(e=>e.isArchived||e.dateTo&&new Date(e.dateTo)<t);r(m.user,n)}else t.innerHTML=`<div style="display:flex; justify-content:center; align-items:center; height:300px;"><p style="font-weight:700; color:var(--text-secondary); animation: pulse 1.5s infinite;">Fetching profile...</p></div>`,fetch(J(`/api/public-profile/${e}`)).then(e=>e.json()).then(e=>{e.error?t.innerHTML=`<p style="text-align:center; padding:50px;">User not found.</p>`:r(e.user,e.trips)}).catch(()=>{t.innerHTML=`<p style="text-align:center; padding:50px;">Error loading profile.</p>`});return t}function He(){let e=document.getElementById(`sidebarProfileAvatar`),t=document.getElementById(`sidebarProfileIcon`),n=document.getElementById(`sidebarProfileLabel`),r=document.getElementById(`sidebarProfileSub`),i=document.getElementById(`sidebarProfilePic`),a=document.getElementById(`sidebarLogoutBtn`);m.user?(e&&(e.style.display=`block`),t&&(t.style.display=`none`),n&&(n.textContent=m.user.name),r&&(r.style.display=`block`,r.textContent=`Logged in ✓`),i&&(i.src=m.user.picture??``),a&&(a.style.display=`block`)):(e&&(e.style.display=`none`),t&&(t.style.display=`block`),n&&(n.textContent=`Log in`),r&&(r.style.display=`none`),a&&(a.style.display=`none`))}var K=!1;function q(t,n=null,r=!1){let i=document.getElementById(`app-container`);if(!i)return;F(),i.innerHTML=``;let a=null;switch(t){case e.HOME:a=xe();break;case e.EXPENSES:a=Ee();break;case e.UPLOAD:a=De();break;case e.INSIGHTS:a=Oe();break;case e.SETTINGS:a=ce();break;case e.PERSONALIZATION:a=le();break;case e.BUDGETS:a=Ae();break;case e.COLLECTIONS:a=je();break;case e.AI:a=Le();break;case e.SETTLEMENT:a=Re();break;case e.FRIENDS:a=ze();break;case e.PROFILE:a=Ve(n?.userId);break;default:a=xe()}a&&i.appendChild(a),document.querySelectorAll(`.nav-item`).forEach(e=>{e.classList.toggle(`active`,e.getAttribute(`data-page`)===t)}),K=!0,window.location.hash=t,r||window.scrollTo(0,0)}window.onhashchange=()=>{if(K){K=!1;return}let t=window.location.hash.replace(`#`,``);q(Object.values(e).includes(t)?t:e.HOME)};var J=e=>`${n}${e}`;async function Y(){if(m.user)try{await fetch(J(`/api/sync`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id,trips:m.trips,archived_trips:m.archivedTrips||[],expenses:m.expenses,activities:m.activities,photos:m.photos,groups:m.groups,categories:m.categories||[],budgets:m.budgets||[]})})}catch(e){console.error(`Sync failed:`,e)}}async function Ue(){if(m.user)try{let n=f(await(await fetch(J(`/api/data?user_id=${encodeURIComponent(m.user.id)}`))).json());if(!n.ok){console.error(`pullFromServer: server data invalid —`,n.error);return}let r=n.value,i=r.trips||[];m.trips=i.filter(e=>!e.isArchived),m.archivedTrips=i.filter(e=>e.isArchived),m.expenses=r.expenses||[],m.groups=r.companions||[],m.categories=r.categories||[],m.budgets=r.budgets||[],m.tripDays=r.tripDays||[],y(t.STATE_CHANGED),await et();let a=Object.values(e),o=window.location.hash.replace(`#`,``);q(a.includes(o)?o:e.HOME)}catch(e){console.error(`Pull from server failed:`,e)}}var X=(e,t)=>fetch(J(e),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}).catch(t=>console.error(`POST ${e} failed:`,t)),Z=(e,t)=>fetch(J(e),{method:`DELETE`,headers:{"Content-Type":`application/json`},body:JSON.stringify(t)}).catch(t=>console.error(`DELETE ${e} failed:`,t));function Q(e){if(m.user)return X(`/api/trips`,{user_id:m.user.id,trip:e})}function We(e){if(m.user)return Z(`/api/trips/${e}`,{user_id:m.user.id})}function Ge(e){if(m.user)return X(`/api/trips/${e}/archive`,{user_id:m.user.id})}function Ke(e){if(m.user)return X(`/api/expenses`,{user_id:m.user.id,expense:e})}function qe(e){if(m.user)return Z(`/api/expenses/${e}`,{user_id:m.user.id})}function Je(){if(m.user)return X(`/api/companions`,{user_id:m.user.id,companions:m.groups})}function Ye(){if(m.user)return X(`/api/categories`,{user_id:m.user.id,categories:m.categories})}function Xe(e){if(m.user)return X(`/api/budgets`,{user_id:m.user.id,budget:e})}function Ze(e){if(m.user)return Z(`/api/budgets/${e}`,{user_id:m.user.id})}function $(e){if(m.user)return X(`/api/days`,{user_id:m.user.id,day:e})}function Qe(e){if(m.user)return Z(`/api/days/${e}`,{user_id:m.user.id})}async function $e(e){let t=new FormData;t.append(`file`,e);try{return await(await fetch(J(`/api/upload`),{method:`POST`,body:t})).json()}catch(e){return console.error(`Upload failed`,e),null}}async function et(){if(m.user)try{m.notifications=await(await fetch(J(`/api/notifications/list?user_id=${encodeURIComponent(m.user.id)}`))).json(),y(t.NOTIFICATIONS_CHANGED)}catch(e){console.error(`Failed to fetch notifications:`,e)}}async function tt(){if(m.user)try{await fetch(J(`/api/notifications/read`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({user_id:m.user.id})}),m.notifications.forEach(e=>e.is_read=1),y(t.NOTIFICATIONS_CHANGED)}catch(e){console.error(`Failed to mark notifications read:`,e)}}async function nt(e){if(e.length===0)return;let t=[...e].sort(),n=t[0],r=t[t.length-1];if(!(!n||!r))try{let e=`https://api.frankfurter.app/${n}..${r}`,t=await fetch(e);if(t.ok){let e=await t.json();Object.entries(e.rates).forEach(([e,t])=>{Object.entries(t).forEach(([t,n])=>{m.rateCache[`${e}_${t}_EUR`]=1/n})}),y(`state:changed`)}}catch(e){console.error(`Failed to fetch historical rates:`,e)}}function rt(t){return Object.values(e).includes(t)?t:e.HOME}function it(){let e=document.getElementById(`notificationBadge`),t=(m.notifications||[]).filter(e=>!e.is_read).length;e&&(e.style.display=t>0?`flex`:`none`,e.textContent=t>9?`9+`:String(t))}function at(){let e=document.getElementById(`notificationList`);if(!e)return;let t=m.notifications||[];if(t.length===0){e.innerHTML=`<div style="padding:20px; text-align:center; color:var(--text-secondary); font-size:0.9rem;">No notifications.</div>`;return}e.innerHTML=t.map(e=>`
        <div class="notification-item ${e.is_read?``:`unread`}">
            <div style="font-weight:700; font-size:0.9rem; margin-bottom:4px; color:${e.type===`alert`?`#ff3b30`:`var(--accent-blue)`}">${e.title||(e.type===`friend_request`?`Friend Request`:e.type===`accepted_request`?`Request Accepted`:`Notification`)}</div>
            <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.4;">${e.message}</div>
            <div style="font-size:0.7rem; color:rgba(0,0,0,0.3); margin-top:8px; font-weight:600;">${new Date(e.created_at).toLocaleDateString()}</div>
        </div>
    `).join(``)}function ot(){let e=document.getElementById(`tripSelector`),t=document.getElementById(`completeTripBtn`),n=document.getElementById(`deleteTripBtn`);if(!e)return;if(m.trips.length===0){e.innerHTML=`<option value="">No Active Trips</option>`,t&&(t.style.display=`none`),n&&(n.style.display=`none`);return}e.innerHTML=m.trips.map(e=>`
        <option value="${e.id}" ${e.id===m.activeTripId?`selected`:``}>${e.name}</option>
    `).join(``);let r=!!m.activeTripId;t&&(t.style.display=r?`flex`:`none`),n&&(n.style.display=r?`flex`:`none`),e.onchange=e=>{m.activeTripId=e.target.value,y(`state:changed`),q(`home`)}}v(`state:changed`,ot),v(`notifications:changed`,it);function st(){let e=m.trips.find(e=>e.id===m.activeTripId);if(e){if(!m.user){A({title:`Log In to Archive`,message:`Archived trips live in your profile's collections, so you need to be logged in to archive a trip.`,confirmText:`Log In`,confirmColor:`#0071e3`,onConfirm:()=>q(`profile`)});return}A({title:`Archive Trip?`,message:`This will move the trip to your collections and lock editing.`,confirmText:`Archive`,onConfirm:()=>{e.isArchived=!0,e.expenses=m.expenses.filter(t=>t.tripId===e.id),e.tripDays=m.tripDays.filter(t=>t.tripId===e.id),m.archivedTrips.push(e),m.expenses=m.expenses.filter(t=>t.tripId!==e.id),m.tripDays=m.tripDays.filter(t=>t.tripId!==e.id),m.trips=m.trips.filter(t=>t.id!==e.id),m.activeTripId=m.trips.length>0?m.trips[0].id:null,y(`state:changed`),Ge(e.id),q(`collections`)}})}}var ct=()=>{let e=m.trips.find(e=>e.id===m.activeTripId);e&&A({title:`Delete Trip?`,message:`Are you sure you want to delete "${e.name}" permanently? This will remove all associated expenses and days.`,confirmText:`Delete Permanently`,onConfirm:async()=>{m.trips=m.trips.filter(t=>t.id!==e.id),m.expenses=m.expenses.filter(t=>t.tripId!==e.id),m.tripDays=m.tripDays.filter(t=>t.tripId!==e.id),m.activeTripId=m.trips.length>0?m.trips[0].id:null,y(`state:changed`),We(e.id),q(`home`)}})};async function lt(e){try{let t=await(await fetch(J(`/api/auth/google`),{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({credential:e.credential})})).json();if(t.status===`success`){let e=!m.hasLoggedInBefore;if(m.user=t.user,m.hasLoggedInBefore=!0,e&&t.user?.name){let e=t.user.name.split(` `)[0];m.groups.includes(e)||m.groups.push(e)}await Y(),await Ue(),m.trips.length>0&&!m.trips.find(e=>e.id===m.activeTripId)&&(m.activeTripId=m.trips[0].id),y(`state:changed`),He(),q(`profile`)}}catch(e){console.error(`Google Login Failed:`,e)}}function ut(){if(typeof google<`u`&&google.accounts){google.accounts.id.initialize({client_id:window.globalGoogleClientId,callback:lt});let e=document.getElementById(`googleBtnContainer`);e&&google.accounts.id.renderButton(e,{theme:`outline`,size:`large`,shape:`pill`})}}async function dt(){h();try{let e=await(await fetch(J(`/api/user-status`))).json();e.logged_in&&(m.user=e.user,await Y(),await Ue(),et())}catch{}m.tripDays&&[...new Set(m.tripDays.map(e=>e.tripId))].forEach(e=>{m.tripDays.filter(t=>t.tripId===e).sort((e,t)=>e.dayNumber&&t.dayNumber?e.dayNumber-t.dayNumber:new Date(e.date).getTime()-new Date(t.date).getTime()).forEach((e,t)=>{e.dayNumber||=t+1})}),He(),it(),ot(),q(rt(window.location.hash.replace(`#`,``)||e.HOME)),ut();let t=()=>{document.getElementById(`sidebar`)?.classList.toggle(`open`),document.getElementById(`sidebarOverlay`)?.classList.toggle(`open`)};document.getElementById(`hamburgerBtn`)?.addEventListener(`click`,t),document.getElementById(`sidebarOverlay`)?.addEventListener(`click`,t),document.getElementById(`sidebarClose`)?.addEventListener(`click`,t);let n=document.querySelector(`.nav-brand`);n&&(n.style.cursor=`pointer`,n.onclick=()=>q(`home`));let r=document.getElementById(`notificationBellBtn`),i=document.getElementById(`notificationDropdown`);r?.addEventListener(`click`,e=>{if(e.stopPropagation(),i){let e=i.style.display===`none`||!i.style.display;i.style.display=e?`flex`:`none`,e&&(at(),tt())}}),document.getElementById(`newTripBtn`)?.addEventListener(`click`,()=>{P()}),document.getElementById(`sidebarLogoutBtn`)?.addEventListener(`click`,()=>Be()),document.getElementById(`completeTripBtn`)?.addEventListener(`click`,st),document.getElementById(`deleteTripBtn`)?.addEventListener(`click`,ct),document.addEventListener(`click`,t=>{let n=t.target;i&&i.style.display===`flex`&&!i.contains(n)&&n!==r&&(i.style.display=`none`);let a=n?.closest(`[data-page]`);a&&(t.preventDefault(),q(rt(a.getAttribute(`data-page`)??e.HOME)),document.getElementById(`sidebar`)?.classList.remove(`open`),document.getElementById(`sidebarOverlay`)?.classList.remove(`open`))}),setInterval(()=>{m.user&&(Y(),et())},15e3)}document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,dt):dt(),`serviceWorker`in navigator&&window.addEventListener(`load`,()=>{navigator.serviceWorker.register(`/sw.js`,{scope:`/`}).catch(e=>{console.warn(`[sw] registration failed`,e)})})})();
//# sourceMappingURL=app.bundle.js.map